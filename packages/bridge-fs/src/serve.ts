// Serves a vault's bridge to a UI in another process (see ./service.ts). The host registers the
// returned handlers on its service channel next to @lydie/app's `serveBackend`.
import { randomUUID } from "node:crypto";

import { importDoc, parse, schema } from "@lydie/markdown";
import type { DocInput, ReplaceStepJSON } from "@lydie/markdown";
import type { Node } from "prosemirror-model";
import { Fragment, Slice } from "prosemirror-model";
import { Transform } from "prosemirror-transform";

import type { OpenDocument } from "./bridge.ts";
import type { DocumentEvent, DocumentPatch, McpStatus, VaultServiceContract } from "./service.ts";
import type { Vault } from "./vault.ts";

type Contract = VaultServiceContract;

export type VaultHandlers = {
  requests: {
    [M in keyof Contract["requests"]]: (
      input: Contract["requests"][M]["input"],
    ) => Promise<Contract["requests"][M]["output"]> | Contract["requests"][M]["output"];
  };
  streams: {
    [S in keyof Contract["streams"]]: (
      params: Contract["streams"][S]["params"],
      emit: (event: Contract["streams"][S]["event"]) => void,
    ) => () => void;
  };
};

// The local MCP server of this vault, if the host runs one.
export type McpControl = {
  status(): McpStatus;
  setEnabled(enabled: boolean): Promise<McpStatus>;
  subscribe(listener: (status: McpStatus) => void): () => void;
};

const NO_MCP: McpStatus = { running: false, url: null, tokenPath: null, error: "Not available" };

type Session = {
  open: OpenDocument | null;
  // The editor's document as main knows it: the last `updateDocument`, with steps sent since applied.
  doc: Node;
  // Steps events sent (the last one's `version`), and the `seq` of the update `doc` came from.
  version: number;
  seq: number | null;
  // `doc` is exactly what update `seq` sent (no steps since): a patch of it can be applied.
  exact: boolean;
  listeners: Set<(event: DocumentEvent) => void>;
  // Events raised before the editor subscribed.
  backlog: DocumentEvent[];
};

export function serveVault(
  vault: Vault,
  options: { mcp?: McpControl } = {},
): VaultHandlers & { close(): void } {
  const sessions = new Map<string, Session>();
  const emitTo = (session: Session, event: DocumentEvent) => {
    if (session.listeners.size === 0) session.backlog.push(event);
    for (const listener of session.listeners) listener(event);
  };
  const find = (id: string) => {
    const session = sessions.get(id);
    if (!session) throw new Error("Document session is not open");
    return session;
  };

  return {
    requests: {
      status: () => vault.status(),
      rescan: async ({ paths }) => {
        await vault.bridge.rescan(paths?.length ? paths : [""]);
        return null;
      },
      // The bridge knows paths once the folder is indexed.
      pathOf: async ({ id }) => {
        await vault.indexed;
        return vault.bridge.pathOf(id);
      },
      openDocument: async ({ id }) => {
        const key = randomUUID();
        const session: Session = {
          open: null,
          doc: schema.nodes.doc.createAndFill()!,
          version: 0,
          seq: null,
          exact: false,
          listeners: new Set(),
          backlog: [],
        };
        sessions.set(key, session);
        const open = await vault.bridge.openDocument(id, {
          getDoc: () => session.doc,
          applySteps(steps: ReplaceStepJSON[], info: { source: string }) {
            session.doc = applySteps(session.doc, steps);
            session.exact = false;
            session.version += 1;
            emitTo(session, {
              type: "steps",
              steps,
              source: info.source,
              version: session.version,
              basedOn: session.seq,
            });
          },
          onConflict: (conflict) => emitTo(session, { type: "conflict", conflict }),
          onClosed: (reason) => emitTo(session, { type: "closed", reason }),
        });
        session.open = open;
        session.doc = parse(open.source).doc;
        return { session: key, source: open.source };
      },
      updateDocument: ({ session, doc, seq, version }) => {
        const s = find(session);
        // Built before the client applied steps already sent: keeping it would drop them (and
        // the next reconcile would read the external change as the user deleting it). Out of
        // order: an older update arriving after a newer one.
        const next =
          isStale(s, version) || (seq !== undefined && s.seq !== null && seq <= s.seq)
            ? null
            : received(s, doc);
        // A dropped update leaves `doc` behind what the client sent: no patch applies to it.
        if (!next) {
          s.exact = false;
          return null;
        }
        s.doc = next;
        s.seq = seq ?? null;
        s.exact = seq !== undefined;
        return null;
      },
      saveDocument: async ({ session, doc, seq, version }) => {
        const s = find(session);
        const next = isStale(s, version) ? null : received(s, doc);
        if (!next) {
          s.exact = false;
          return { changed: false, verified: true, stale: true };
        }
        s.doc = next;
        if (seq !== undefined) s.seq = Math.max(seq, s.seq ?? seq);
        s.exact = seq !== undefined && s.seq === seq;
        return s.open!.save(s.doc);
      },
      closeDocument: ({ session }) => {
        sessions.get(session)?.open?.close();
        sessions.delete(session);
        return null;
      },
      conflicts: () => vault.store.conflicts.list(vault.workspaceId),
      resolveConflict: async ({ id }) => {
        await vault.store.conflicts.clear(id);
        return null;
      },
      settings: () => vault.settings(),
      setSettings: (patch) => vault.setSettings(patch),
      mcpStatus: () => options.mcp?.status() ?? NO_MCP,
      // Agents' operations, like the windows', wait for the index.
      mcpSetEnabled: async ({ enabled }) => {
        if (!options.mcp) return NO_MCP;
        if (enabled) await vault.indexed;
        return options.mcp.setEnabled(enabled);
      },
    },
    streams: {
      status: (_params, emit) => {
        emit(vault.status());
        return vault.bridge.onStatus(emit);
      },
      externalChanges: (_params, emit) => vault.bridge.onExternalChange(emit),
      conflicts: (_params, emit) => vault.bridge.onConflict(emit),
      document: ({ session }, emit) => {
        const s = sessions.get(session);
        if (!s) {
          emit({ type: "closed", reason: "deleted" });
          return () => {};
        }
        s.listeners.add(emit);
        for (const event of s.backlog.splice(0)) emit(event);
        return () => s.listeners.delete(emit);
      },
      settings: (_params, emit) => {
        emit(vault.settings());
        return vault.onSettings(emit);
      },
      mcp: (_params, emit) => {
        if (!options.mcp) {
          emit(NO_MCP);
          return () => {};
        }
        emit(options.mcp.status());
        return options.mcp.subscribe(emit);
      },
    },
    close() {
      for (const s of sessions.values()) s.open?.close();
      sessions.clear();
    },
  };
}

// Clients that send no `version` keep the old behaviour (last update wins).
function isStale(session: Session, version: number | undefined): boolean {
  return version !== undefined && version < session.version;
}

// The document an update or save sends: the whole document, or a patch of the one main has (null
// when it is not the document the patch was made against).
function received(session: Session, doc: unknown): Node | null {
  if ((doc as { type?: unknown } | null)?.type !== "patch") return importDoc(doc as DocInput);
  const patch = doc as DocumentPatch;
  const current = session.doc;
  if (!session.exact || patch.base !== session.seq) return null;
  if (!(0 <= patch.from && patch.from <= patch.to && patch.to <= current.childCount)) return null;
  const blocks: Node[] = [];
  for (let i = 0; i < patch.from; i++) blocks.push(current.child(i));
  importDoc({ type: "doc", content: patch.content }).forEach((b) => blocks.push(b));
  for (let i = patch.to; i < current.childCount; i++) blocks.push(current.child(i));
  if (blocks.length !== patch.count) return null;
  return current.copy(Fragment.fromArray(blocks));
}

function applySteps(doc: Node, steps: ReplaceStepJSON[]): Node {
  const tr = new Transform(doc);
  for (const step of steps) tr.replace(step.from, step.to, Slice.fromJSON(schema, step.slice));
  return tr.doc;
}
