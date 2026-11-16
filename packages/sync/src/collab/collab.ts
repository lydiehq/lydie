import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

import { backoffDelay } from "../backoff.ts";
import { isApiError, messageOf } from "../http.ts";
import type { ApiClient } from "../http.ts";
import { createObservable, jsonEqual } from "../types.ts";
import type { Observable } from "../types.ts";
import type { YjsPersistence } from "./persistence.ts";

// Close code (and close reasons) the collab server uses when access is revoked or the document is
// purged. Over a multiplexed socket the server closes one document with a CLOSE message, which the
// provider surfaces as code 1000 with the reason; a dedicated socket would see code 4403.
export const ACCESS_REVOKED_CODE = 4403;
const UNAVAILABLE_REASONS = new Set(["forbidden", "deleted", "not_found"]);

export type CollabDocStatus =
  // Reading the local copy.
  | "loading"
  // Editable from the local copy; changes are kept on this device until the server is reachable.
  | "offline"
  | "connecting"
  // Connected; local changes are on their way.
  | "syncing"
  // Connected and the server has every local change.
  | "synced"
  // Access was revoked, the document was deleted, or it never was accessible. Not retried.
  | "unavailable"
  // The session expired: sign in again.
  | "auth-expired";

export type CollabDocState = {
  status: CollabDocStatus;
  // Editing is not possible (view/comment access, or the page is in the trash).
  readOnly: boolean;
  // view | comment | edit | full, once known.
  level: string | null;
  // Local changes the server has not acknowledged.
  unsyncedChanges: number;
  // Why it is unavailable ("forbidden", "deleted", "not_found") or the last connection problem.
  reason: string | null;
  lastSyncedAt: string | null;
};

export type CollabUser = { name: string; color: string };

export type CollabDocument = {
  readonly id: string;
  // Bind the editor to this (TipTap Collaboration `document`, field "default").
  readonly ydoc: Y.Doc;
  // Presence: `user` ({ name, color }) is set for you; cursors go in through the editor's caret
  // extension (it writes the `cursor` field).
  readonly awareness: Awareness;
  readonly state: Observable<CollabDocState>;
  // Resolves when the local copy is in `ydoc` (bind the editor after this, or show a spinner).
  readonly loaded: Promise<void>;
  // Resolves when the server has every local change (status "synced"); rejects when the document
  // becomes unavailable or the timeout passes.
  whenSynced(timeoutMs?: number): Promise<void>;
  // Drops this handle. The connection closes when the last handle is released; unsynced changes
  // stay on the device and are pushed the next time the document (or `pushPending`) connects.
  release(): void;
};

export type CollabConnection = "idle" | "connecting" | "connected" | "offline" | "auth-expired";

export type CollabPoolStatus = {
  connection: CollabConnection;
  documents: Readonly<Record<string, CollabDocState>>;
};

// What `/v1/collab/token` returns.
export type CollabToken = { url: string; token: string; expiresAt: string };

export type CollabOptions = {
  // Where tokens come from: `/v1/collab/token` through this authenticated client, or `token` (the
  // Electron renderer asks the main process, which holds the session). One of the two.
  api?: ApiClient;
  token?: () => Promise<CollabToken>;
  persistence: YjsPersistence;
  // Overrides the websocket URL the token endpoint returns.
  url?: string;
  user?: CollabUser;
  // Node without a global WebSocket (Electron main has one since Node 22; Bun has one).
  WebSocketPolyfill?: unknown;
  // Socket reconnect backoff (Hocuspocus' own retry). Defaults: 1 s doubling to 30 s, jittered.
  reconnect?: { delayMs?: number; maxDelayMs?: number };
  // Compact a document's stored updates into one after this many appends. Default 200.
  compactEvery?: number;
  // Updates are written merged, one write at most this often per document. Default 500 ms.
  flushMs?: number;
  // Close the socket this long after the last document is released. Default 30 s.
  idleDisconnectMs?: number;
  // Resolves once the server has the document and this user's access to it (hosted: the page's
  // access row has synced down). Until then the document is edited and persisted locally only, so
  // a page created offline, or a moment ago, is never refused and none of its edits are dropped.
  // Without it documents connect at once.
  gate?: (docId: string, signal: AbortSignal) => Promise<void>;
};

export type Collab = {
  open(docId: string): CollabDocument;
  readonly status: Observable<CollabPoolStatus>;
  setUser(user: CollabUser): void;
  // Connects every document with unacknowledged local edits (from earlier sessions too) until the
  // server has them. Resolves with what was pushed and what is still pending.
  pushPending(timeoutMs?: number): Promise<{ pushed: string[]; pending: string[] }>;
  close(): Promise<void>;
};

type Token = { url: string; token: string; expiresAt: number };

// Origin of updates applied from local persistence: they are not new edits.
const FROM_DISK = Symbol("lydie.collab.disk");

type Entry = {
  id: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  state: ReturnType<typeof createObservable<CollabDocState>>;
  provider: HocuspocusProvider | null;
  refs: number;
  loaded: Promise<void>;
  writes: Promise<void>;
  appended: number;
  // Updates not written yet, and the timer that writes them.
  unwritten: Uint8Array[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  closing: boolean;
  tokenRetries: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  offUpdate: () => void;
  // Aborted when the entry is disposed (stops waiting for the gate).
  abort: AbortController;
};

export function createCollab(options: CollabOptions): Collab {
  const compactEvery = options.compactEvery ?? 200;
  const flushMs = options.flushMs ?? 500;
  const entries = new Map<string, Entry>();
  let user = options.user ?? null;
  let socket: HocuspocusProviderWebsocket | null = null;
  let socketUrl = options.url ?? null;
  let connection: CollabConnection = "idle";
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  // A document's state object stays the same until it changes, so comparing references is enough.
  const status = createObservable<CollabPoolStatus>(
    { connection: "idle", documents: {} },
    (a, b) => {
      if (a.connection !== b.connection) return false;
      const ids = Object.keys(b.documents);
      return (
        ids.length === Object.keys(a.documents).length &&
        ids.every((id) => a.documents[id] === b.documents[id])
      );
    },
  );
  const publish = () => {
    const documents: Record<string, CollabDocState> = {};
    for (const [id, entry] of entries) documents[id] = entry.state.get();
    status.set({ connection, documents });
  };

  // ---- Tokens (15 min; refreshed a minute early, and at once after the server refuses one)

  let token: Token | null = null;
  let fetching: Promise<Token> | null = null;
  async function getToken(): Promise<Token> {
    if (token && token.expiresAt - 60_000 > Date.now()) return token;
    const fetchToken =
      options.token ??
      (() => {
        if (!options.api) throw new Error("createCollab needs `api` or `token`");
        return options.api.get<CollabToken>("/v1/collab/token");
      });
    fetching ??= fetchToken()
      .then((t) => {
        token = { url: t.url, token: t.token, expiresAt: Date.parse(t.expiresAt) };
        return token;
      })
      .finally(() => {
        fetching = null;
      });
    return fetching;
  }

  // ---- The shared socket (one websocket multiplexes every open document)

  let socketAttempt = 0;
  let socketTimer: ReturnType<typeof setTimeout> | null = null;
  let socketReady: Promise<HocuspocusProviderWebsocket> | null = null;

  function setConnection(next: CollabConnection) {
    if (connection === next) return;
    connection = next;
    for (const entry of entries.values()) refresh(entry, {}, false);
    publish();
  }

  function ensureSocket(): Promise<HocuspocusProviderWebsocket> {
    if (socket) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      if (socket.status === "disconnected" && !socket.shouldConnect) void socket.connect();
      return Promise.resolve(socket);
    }
    socketReady ??= (async () => {
      setConnection("connecting");
      for (;;) {
        if (closed) throw new Error("Collab is closed");
        try {
          if (!socketUrl) socketUrl = (await getToken()).url;
          break;
        } catch (error) {
          if (isApiError(error) && error.kind === "auth") {
            setConnection("auth-expired");
            throw error;
          }
          setConnection("offline");
          await new Promise<void>((resolve) => {
            socketTimer = setTimeout(resolve, backoffDelay(socketAttempt++));
          });
        }
      }
      socketAttempt = 0;
      const created = new HocuspocusProviderWebsocket({
        url: socketUrl,
        delay: options.reconnect?.delayMs ?? 1000,
        minDelay: options.reconnect?.delayMs ?? 1000,
        maxDelay: options.reconnect?.maxDelayMs ?? 30_000,
        factor: 2,
        jitter: true,
        ...(options.WebSocketPolyfill ? { WebSocketPolyfill: options.WebSocketPolyfill } : {}),
        onStatus: ({ status: s }) => {
          if (connection === "auth-expired") return;
          setConnection(
            s === "connected" ? "connected" : s === "connecting" ? "connecting" : "offline",
          );
        },
      });
      socket = created;
      return created;
    })().finally(() => {
      socketReady = null;
    });
    return socketReady;
  }

  // ---- Per-document state

  // `notify`: republish the pool if the document's state changed (callers refreshing every
  // document publish once themselves).
  function refresh(entry: Entry, patch: Partial<CollabDocState> = {}, notify = true) {
    const current = { ...entry.state.get(), ...patch };
    if (current.status !== "unavailable" && current.status !== "loading") {
      const provider = entry.provider;
      if (connection === "auth-expired") current.status = "auth-expired";
      else if (current.status === "auth-expired") current.status = "offline";
      if (current.status !== "auth-expired") {
        if (!provider || connection === "offline" || connection === "idle") {
          current.status = connection === "connecting" ? "connecting" : "offline";
        } else if (connection === "connecting" || !provider.isSynced) {
          current.status = "connecting";
        } else {
          current.status = provider.unsyncedChanges > 0 ? "syncing" : "synced";
        }
      }
      current.unsyncedChanges = provider?.unsyncedChanges ?? current.unsyncedChanges;
    }
    const before = entry.state.get();
    entry.state.set(current);
    if (notify && entry.state.get() !== before) publish();
  }

  function persist(entry: Entry, fn: () => Promise<void>) {
    entry.writes = entry.writes.then(fn).catch(() => {
      // A failed write leaves the update in memory and in the server's copy once synced.
    });
  }

  // Typing makes an update per keystroke and each write is a database transaction, so updates
  // are written merged: at most every `flushMs`, and at once before the document closes, before
  // `whenSynced` resolves, and when the page is hidden or goes away.
  function flush(entry: Entry) {
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = null;
    if (entry.unwritten.length === 0) return;
    const updates = entry.unwritten.splice(0);
    persist(entry, async () => {
      entry.appended++;
      if (entry.appended >= compactEvery) {
        entry.appended = 0;
        // The whole state, which holds these updates (and any still unwritten).
        await options.persistence.replace(entry.id, Y.encodeStateAsUpdate(entry.ydoc));
      } else {
        await options.persistence.append(
          entry.id,
          updates.length === 1 ? updates[0]! : Y.mergeUpdates(updates),
        );
      }
    });
  }

  const flushAll = () => {
    for (const entry of entries.values()) flush(entry);
  };
  const onVisibility = () => {
    if (globalThis.document?.visibilityState === "hidden") flushAll();
  };
  globalThis.addEventListener?.("pagehide", flushAll);
  globalThis.document?.addEventListener("visibilitychange", onVisibility);

  function makeUnavailable(entry: Entry, reason: string) {
    if (entry.state.get().status === "unavailable") return;
    const provider = entry.provider;
    entry.provider = null;
    provider?.destroy();
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = null;
    entry.unwritten = [];
    // The user lost access (or the page is gone): do not keep a readable copy on the device.
    persist(entry, () => options.persistence.clear(entry.id));
    entry.dirty = false;
    refresh(entry, { status: "unavailable", reason, readOnly: true });
  }

  function attach(entry: Entry, ws: HocuspocusProviderWebsocket) {
    if (entry.closing || entry.provider || entry.state.get().status === "unavailable") return;
    const provider = new HocuspocusProvider({
      websocketProvider: ws,
      name: entry.id,
      document: entry.ydoc,
      awareness: entry.awareness,
      token: async () => (await getToken()).token,
    });
    entry.provider = provider;
    provider.on("authenticated", ({ scope }: { scope: string }) => {
      entry.tokenRetries = 0;
      refresh(entry, { readOnly: scope === "readonly", reason: null });
    });
    provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
      if (UNAVAILABLE_REASONS.has(reason)) return makeUnavailable(entry, reason);
      // "unauthenticated" (stale token) or the token could not be fetched: refresh and retry.
      token = null;
      const delay = backoffDelay(entry.tokenRetries++);
      refresh(entry, { reason });
      entry.retryTimer = setTimeout(() => {
        entry.retryTimer = null;
        if (!entry.provider || entry.closing) return;
        getToken().then(
          () => void entry.provider?.sendToken(),
          (error: unknown) => {
            if (isApiError(error) && error.kind === "auth") setConnection("auth-expired");
            else refresh(entry, { reason: messageOf(error) });
            // Try again on the next failure callback.
            if (entry.provider && !entry.closing) {
              entry.provider.permissionDeniedHandler(messageOf(error));
            }
          },
        );
      }, delay);
    });
    provider.on("synced", () => refresh(entry));
    provider.on("unsyncedChanges", ({ number }: { number: number }) => {
      if (number === 0 && provider.isSynced) {
        if (entry.dirty) {
          entry.dirty = false;
          persist(entry, () => options.persistence.setDirty(entry.id, false));
        }
        refresh(entry, { lastSyncedAt: new Date().toISOString(), unsyncedChanges: 0 });
      } else {
        refresh(entry, { unsyncedChanges: number });
      }
    });
    provider.on("stateless", ({ payload }: { payload: string }) => {
      let message: { type?: string; level?: string; readOnly?: boolean };
      try {
        message = JSON.parse(payload) as typeof message;
      } catch {
        return;
      }
      if (message.type !== "lydie.access") return;
      if (message.level === "none") return makeUnavailable(entry, "forbidden");
      refresh(entry, { level: message.level ?? null, readOnly: Boolean(message.readOnly) });
    });
    provider.on("close", ({ event }: { event: { code?: number; reason?: string } }) => {
      if (event.code === ACCESS_REVOKED_CODE || UNAVAILABLE_REASONS.has(event.reason ?? "")) {
        makeUnavailable(entry, event.reason || "forbidden");
        return;
      }
      refresh(entry);
    });
    provider.attach();
    if (user) entry.awareness.setLocalStateField("user", user);
    refresh(entry);
  }

  function createEntry(docId: string): Entry {
    const ydoc = new Y.Doc({ gc: true });
    const awareness = new Awareness(ydoc);
    const state = createObservable<CollabDocState>(
      {
        status: "loading",
        readOnly: false,
        level: null,
        unsyncedChanges: 0,
        reason: null,
        lastSyncedAt: null,
      },
      jsonEqual,
    );
    const entry: Entry = {
      id: docId,
      ydoc,
      awareness,
      state,
      provider: null,
      refs: 0,
      loaded: Promise.resolve(),
      writes: Promise.resolve(),
      appended: 0,
      unwritten: [],
      flushTimer: null,
      dirty: false,
      closing: false,
      tokenRetries: 0,
      retryTimer: null,
      offUpdate: () => {},
      abort: new AbortController(),
    };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === FROM_DISK) return;
      const local = !(origin instanceof HocuspocusProvider);
      if (local && !entry.dirty && entry.state.get().status !== "unavailable") {
        entry.dirty = true;
        persist(entry, () => options.persistence.setDirty(docId, true));
      }
      if (entry.state.get().status === "unavailable") return;
      entry.unwritten.push(update);
      entry.flushTimer ??= setTimeout(() => flush(entry), flushMs);
    };
    ydoc.on("update", onUpdate);
    entry.offUpdate = () => ydoc.off("update", onUpdate);
    entry.loaded = (async () => {
      const [stored, dirtyIds] = await Promise.all([
        options.persistence.load(docId),
        options.persistence.dirty(),
      ]);
      entry.dirty = dirtyIds.includes(docId);
      entry.appended = stored.length;
      if (stored.length > 0) {
        Y.transact(
          ydoc,
          () => {
            for (const update of stored) Y.applyUpdate(ydoc, update, FROM_DISK);
          },
          FROM_DISK,
        );
      }
      refresh(entry, { status: "offline" });
      const gate = options.gate?.(docId, entry.abort.signal) ?? Promise.resolve();
      gate.then(
        () =>
          ensureSocket().then(
            (ws) => attach(entry, ws),
            () => refresh(entry),
          ),
        // Aborted (released before the server had it): stays local; pushed when next opened.
        () => {},
      );
    })();
    return entry;
  }

  function handle(entry: Entry): CollabDocument {
    entry.refs++;
    let released = false;
    return {
      id: entry.id,
      ydoc: entry.ydoc,
      awareness: entry.awareness,
      state: entry.state,
      loaded: entry.loaded,
      whenSynced: (timeoutMs) => whenSynced(entry, timeoutMs),
      release() {
        if (released) return;
        released = true;
        entry.refs--;
        if (entry.refs === 0) void dispose(entry);
      },
    };
  }

  function whenSynced(entry: Entry, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = (s: CollabDocState) => {
        if (s.status === "synced" && s.unsyncedChanges === 0) {
          finish();
          flush(entry);
          entry.writes.then(() => resolve(), resolve);
          return true;
        }
        if (s.status === "unavailable") {
          finish();
          reject(new Error(`Document ${entry.id} is unavailable (${s.reason ?? "unknown"})`));
          return true;
        }
        return false;
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error(`Timed out waiting for ${entry.id} to sync`));
      }, timeoutMs);
      const off = entry.state.subscribe((s) => void check(s));
      function finish() {
        clearTimeout(timer);
        off();
      }
      check(entry.state.get());
    });
  }

  async function dispose(entry: Entry) {
    entry.closing = true;
    entry.abort.abort();
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    await entry.loaded.catch(() => {});
    entry.provider?.destroy();
    entry.provider = null;
    entry.offUpdate();
    flush(entry);
    await entry.writes;
    entry.ydoc.destroy();
    if (entries.get(entry.id) === entry) entries.delete(entry.id);
    publish();
    if (entries.size === 0 && socket && !closed) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (entries.size === 0) socket?.disconnect();
      }, options.idleDisconnectMs ?? 30_000);
    }
  }

  return {
    status,
    open(docId) {
      if (closed) throw new Error("Collab is closed");
      let entry = entries.get(docId);
      if (!entry || entry.closing) {
        entry = createEntry(docId);
        entries.set(docId, entry);
        publish();
      }
      return handle(entry);
    },
    setUser(next) {
      user = next;
      for (const entry of entries.values()) entry.awareness.setLocalStateField("user", next);
    },
    async pushPending(timeoutMs = 30_000) {
      const ids = await options.persistence.dirty();
      const pushed: string[] = [];
      const pending: string[] = [];
      await Promise.all(
        ids.map(async (id) => {
          const doc = this.open(id);
          try {
            await doc.loaded;
            await doc.whenSynced(timeoutMs);
            pushed.push(id);
          } catch {
            pending.push(id);
          } finally {
            doc.release();
          }
        }),
      );
      return { pushed, pending };
    },
    async close() {
      closed = true;
      globalThis.removeEventListener?.("pagehide", flushAll);
      globalThis.document?.removeEventListener("visibilitychange", onVisibility);
      if (idleTimer) clearTimeout(idleTimer);
      if (socketTimer) clearTimeout(socketTimer);
      await Promise.all([...entries.values()].map((entry) => dispose(entry)));
      socket?.destroy();
      socket = null;
      setConnection("idle");
    },
  };
}
