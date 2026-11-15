// Opening a page before it is asked for: a row under the pointer starts the live queries its page
// reads, so they hold their results when the view mounts and the page paints whole in one frame.
// Nothing is kept here: a query that loses its last subscriber keeps running for the backend's
// linger (10 s), which is the window a press has to follow in.
import { useEffect, useRef } from "react";

import type { Backend, LiveHandle, LiveParams, LiveQueryName } from "./backend.ts";
import { useBackend } from "./react.tsx";

// How long the pointer rests on a row before its page is fetched: crossing the tree fetches nothing.
const REST_MS = 60;
// As far up as the breadcrumbs go.
const MAX_ANCESTORS = 8;
const MAX_EMBEDS = 8;

type Waiting = void | Promise<void>;

// Starts the query; with nobody else reading it, it runs for the linger.
function warm<N extends LiveQueryName>(backend: Backend, name: N, params: LiveParams<N>) {
  const handle = backend.live(name, params);
  handle.subscribe(() => {})();
  return handle;
}

// Nothing when the query has its first result, else a promise for it (the query is held until then).
function settled<T>(handle: LiveHandle<T>): Waiting {
  if (!handle.getSnapshot().isLoading) return;
  return new Promise((resolve) => {
    let off: (() => void) | null = null;
    let done = false;
    const check = () => {
      if (done || handle.getSnapshot().isLoading) return;
      done = true;
      off?.();
      resolve();
    };
    off = handle.subscribe(check);
    if (done) off();
    else check();
  });
}

function all(parts: Waiting[]): Waiting {
  const waiting = parts.filter((part) => part !== undefined);
  if (waiting.length > 0) return Promise.all(waiting).then(() => {});
}

// The page's own row, then the pages above it (the breadcrumbs), one level per result.
function above(backend: Backend, id: string, depth: number): Waiting {
  const row = warm(backend, "doc.get", { id });
  const next = (): Waiting => {
    const parentId = row.getSnapshot().data[0]?.document.parentId;
    if (!parentId) return;
    return all([
      // The properties panel reads the collection a page is a row of.
      depth === 0 ? settled(warm(backend, "database.get", { id: parentId })) : undefined,
      depth < MAX_ANCESTORS ? above(backend, parentId, depth + 1) : undefined,
    ]);
  };
  const waiting = settled(row);
  return waiting ? waiting.then(next) : next();
}

// The page's links, then the pages it embeds (`![[page]]` draws their bodies in place).
function embedded(backend: Backend, id: string): Waiting {
  const links = warm(backend, "doc.links", { id });
  const next = (): Waiting =>
    all(
      links
        .getSnapshot()
        .data.filter((link) => link.kind === "embed" && link.target)
        .slice(0, MAX_EMBEDS)
        .map((link) =>
          settled(warm(backend, "doc.get", { id: link.target!.id, includeBody: true })),
        ),
    );
  const waiting = settled(links);
  return waiting ? waiting.then(next) : next();
}

// Starts what the document view and its slots read for `id`: the body, the page's own row (icon,
// cover, properties), its collection, its links, the pages it embeds and the pages above it. Returns nothing when all
// of it is already here, else a promise for when it is (the doc view's `ViewDef.preload`).
export function prefetchDoc(backend: Backend, id: string): Waiting {
  return all([
    settled(warm(backend, "doc.get", { id, includeBody: true })),
    settled(warm(backend, "database.get", { id })),
    embedded(backend, id),
    backend.info.mode === "synced" ? settled(warm(backend, "doc.access", { id })) : undefined,
    above(backend, id, 0),
  ]);
}

// Handlers for whatever opens a document on click: fetches its page once the pointer rests on it,
// and at the latest on the press (a click is some 100 ms after it). Mouse events, so they sit
// beside a hover card's pointer handlers.
export function useDocPrefetch(id: string | null): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMouseDown: () => void;
} {
  const backend = useBackend();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onMouseEnter: () => {
      cancel();
      if (id) timer.current = setTimeout(() => void prefetchDoc(backend, id), REST_MS);
    },
    onMouseLeave: cancel,
    onMouseDown: () => {
      cancel();
      if (id) void prefetchDoc(backend, id);
    },
  };
}
