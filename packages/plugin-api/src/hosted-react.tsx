import { collaborationLoaded, loadCollaboration } from "@lydie/editor";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { HostedInput, HostedOperationId, HostedOutput } from "./hosted-operations.ts";
import type { AccountApi, AccountState, CollabSession, Observable } from "./hosted.ts";
import { useApp, useObservable } from "./react.tsx";

const NEVER: Observable<null> = { get: () => null, subscribe: () => () => {} };

const SIGNED_OUT: AccountState = { status: "signed-out" };

// The account service and its state; `api` is null where the app has no hosted mode, and for a
// plugin without the "account" permission.
export function useAccount(): { api: AccountApi | null; state: AccountState } {
  const api = useApp().services?.account ?? null;
  const state = useObservable(api?.state) ?? SIGNED_OUT;
  return { api, state };
}

export type CollabBinding = {
  session: CollabSession;
  // What a view draws from the session's live state. The state itself changes on every local edit
  // and every acknowledgement (`unsyncedChanges`, `status`); these change only when access does,
  // so the editor under them does not re-render as you type. Read `session.state` for the rest.
  readOnly: boolean;
  // Access was removed or the page was deleted (`status` "unavailable").
  unavailable: boolean;
  level: string | null;
};

// The collaborative body of a document in a hosted window: `null` where bodies are not collaborative
// (local mode), `"loading"` until the local copy is loaded (the doc view shows the body it has
// meanwhile, read-only), else the session (for the editor's `collab` prop) and what its live state
// says about access (read-only, access removed). Released on unmount.
export function useCollabDocument(documentId: string | null): CollabBinding | "loading" | null {
  const collab = useApp().services?.collab ?? null;
  const [session, setSession] = useState<{ session: CollabSession; loaded: boolean } | null>(null);
  // A layout effect: a document that is already loaded (open in another tab) is bound before the
  // first paint. The Yjs binding (a chunk of its own) is waited for here too, so the editor never
  // stands empty between the local copy and the collaborative one.
  useLayoutEffect(() => {
    if (!collab || !documentId) return;
    const opened = collab.open(documentId);
    let live = true;
    const here = opened.state.get().status !== "loading" && collaborationLoaded();
    setSession({ session: opened, loaded: here });
    const done = () => live && setSession({ session: opened, loaded: true });
    if (!here) void Promise.all([opened.loaded, loadCollaboration()]).then(done, done);
    return () => {
      live = false;
      opened.release();
    };
  }, [collab, documentId]);
  const state = session?.session.state;
  const readOnly = useSelected(state, (s) => s.readOnly, false);
  const unavailable = useSelected(state, (s) => s.status === "unavailable", false);
  const level = useSelected(state, (s) => s.level, null);
  if (!collab || !documentId) return null;
  if (!session || !session.loaded || session.session.id !== documentId) return "loading";
  return { session: session.session, readOnly, unavailable, level };
}

// One value read from an observable, re-rendering only when it changes (keep it a primitive).
function useSelected<T, R>(
  observable: Observable<T> | undefined,
  select: (value: T) => R,
  fallback: R,
): R {
  const source = (observable ?? NEVER) as Observable<T | null>;
  return useSyncExternalStore(source.subscribe, () => {
    const value = source.get();
    return value === null ? fallback : select(value);
  });
}

export type HostedQueryState<T> = {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  // Fetch again (after a change made elsewhere).
  reload: () => Promise<void>;
  // Replace the shown data now (optimistic changes); the next load replaces it again.
  setData: (update: (current: T | undefined) => T | undefined) => void;
};

// Last results per call, so a page shows them at once when it opens again (and refreshes).
const hostedCache = new Map<string, unknown>();

// A hosted query operation (`member.list`, `share.get`, …) run while mounted; `input` null skips it.
// Needs the "account" permission (without it nothing runs and `data` stays undefined).
export function useHostedQuery<K extends HostedOperationId>(
  id: K,
  input: HostedInput<K> | null,
): HostedQueryState<HostedOutput<K>> {
  const api = useApp().services?.account ?? null;
  const key = input === null ? null : `${id}:${JSON.stringify(input)}`;
  const [state, setState] = useState<{
    key: string | null;
    data: HostedOutput<K> | undefined;
    error: Error | null;
    isLoading: boolean;
  }>(() => ({
    key,
    data: key ? (hostedCache.get(key) as HostedOutput<K> | undefined) : undefined,
    error: null,
    isLoading: key !== null,
  }));
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });
  const load = useCallback(async () => {
    const current = latest.current;
    if (!api || current === null || key === null) return;
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const data = await api.call(id, current);
      hostedCache.set(key, data);
      setState((s) => (s.key === key ? { key, data, error: null, isLoading: false } : s));
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      setState((s) => (s.key === key ? { ...s, error, isLoading: false } : s));
    }
  }, [api, id, key]);
  useEffect(() => {
    setState({
      key,
      data: key ? (hostedCache.get(key) as HostedOutput<K> | undefined) : undefined,
      error: null,
      isLoading: key !== null,
    });
    void load();
  }, [key, load]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : null,
    isLoading: state.key === key ? state.isLoading : key !== null,
    reload: load,
    setData: (update) =>
      setState((s) => {
        const data = update(s.data);
        if (key) hostedCache.set(key, data);
        return { ...s, data };
      }),
  };
}
