import type { ThreadAnchor, ThreadKind } from "@lydie/plugin-api";
// Threads in the text: the passage each open thread is anchored to, painted as a decoration.
// View state only. Threads arrive in meta-only transactions (nothing is saved or synced by
// this), and a passage follows edits through the transaction's mapping; a thread whose passage
// is not known (new, or its text was replaced wholesale) is looked up again by its quote.
import { Decoration, DecorationSet, Extension, Plugin, PluginKey } from "@lydie/plugin-api/editor";
import type { EditorState, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";

import { docText, rangeOf } from "./text.ts";
import type { DocText, Range } from "./text.ts";

export type Marked = { id: string; kind: ThreadKind; anchor: ThreadAnchor };

export type ThreadsState = {
  threads: readonly Marked[];
  ranges: ReadonlyMap<string, Range>;
  // The thread whose card is open.
  active: string | null;
  // The passage a thread is being written about.
  draft: Range | null;
  // Threads whose passage was looked for and not found. Not looked for again on every edit (it
  // reads the whole document's text), only once typing pauses (RETRY_DELAY).
  missing: ReadonlySet<string>;
  decorations: DecorationSet;
};

export type ThreadsMeta = {
  threads?: readonly Marked[];
  active?: string | null;
  draft?: Range | null;
  // Look for the missing passages again.
  retry?: true;
};

export const RETRY_DELAY = 1000;

export const threadsKey = new PluginKey<ThreadsState>("lydie-threads");

// A note (what agents leave) and a comment look the same: to a reader both are a comment.
const PASSAGE = "cursor-pointer rounded-[2px] border-b border-yellow-400 bg-yellow-100";
const ACTIVE = "cursor-pointer rounded-[2px] border-b border-yellow-500 bg-yellow-200";

function decorate(doc: ProseMirrorNode, state: Omit<ThreadsState, "decorations" | "missing">) {
  const decorations: Decoration[] = [];
  for (const thread of state.threads) {
    const range = state.ranges.get(thread.id);
    if (!range) continue;
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: thread.id === state.active ? ACTIVE : PASSAGE,
        "data-thread": thread.id,
        "data-thread-kind": thread.kind,
      }),
    );
  }
  if (state.draft) {
    decorations.push(
      Decoration.inline(state.draft.from, state.draft.to, {
        class: ACTIVE,
        "data-thread-draft": "",
      }),
    );
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const EMPTY: ThreadsState = {
  threads: [],
  ranges: new Map(),
  active: null,
  draft: null,
  missing: new Set(),
  decorations: DecorationSet.empty,
};

const sameAnchor = (a: ThreadAnchor, b: ThreadAnchor) =>
  a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix;

export function threadsState(state: EditorState): ThreadsState {
  return threadsKey.getState(state) ?? EMPTY;
}

// The innermost thread at a document position, if any.
export function threadAt(state: ThreadsState, pos: number): string | null {
  let hit: { id: string; size: number } | null = null;
  for (const [id, range] of state.ranges) {
    if (pos < range.from || pos > range.to) continue;
    const size = range.to - range.from;
    if (!hit || size < hit.size) hit = { id, size };
  }
  return hit?.id ?? null;
}

export function applyThreads(
  tr: Transaction,
  previous: ThreadsState,
  doc: ProseMirrorNode,
): ThreadsState {
  const meta = tr.getMeta(threadsKey) as ThreadsMeta | undefined;
  if (!meta && !tr.docChanged) return previous;
  const threads = meta?.threads ?? previous.threads;
  const before = new Map(previous.threads.map((t) => [t.id, t]));
  const ranges = new Map<string, Range>();
  const missing = new Set<string>();
  let text: DocText | null = null;
  for (const thread of threads) {
    const known = before.get(thread.id);
    const same = known !== undefined && sameAnchor(known.anchor, thread.anchor);
    let range = same ? previous.ranges.get(thread.id) : undefined;
    if (range && tr.docChanged) {
      const from = tr.mapping.map(range.from, 1);
      const to = tr.mapping.map(range.to, -1);
      range = from < to ? { from, to } : undefined;
    }
    // A passage looked for and not found is looked for again on a retry, not per edit.
    if (!range && (!same || !previous.missing.has(thread.id) || meta?.retry)) {
      text ??= docText(doc);
      range = rangeOf(text, thread.anchor) ?? undefined;
    }
    if (range) ranges.set(thread.id, range);
    else missing.add(thread.id);
  }
  const wanted = meta && "active" in meta ? (meta.active ?? null) : previous.active;
  const active = wanted && threads.some((t) => t.id === wanted) ? wanted : null;
  let draft = meta && "draft" in meta ? (meta.draft ?? null) : previous.draft;
  if (draft && tr.docChanged && !(meta && "draft" in meta)) {
    const from = tr.mapping.map(draft.from, 1);
    const to = tr.mapping.map(draft.to, -1);
    draft = from < to ? { from, to } : null;
  }
  const state = { threads, ranges, active, draft };
  return { ...state, missing, decorations: decorate(doc, state) };
}

export const ThreadsExtension = Extension.create({
  name: "lydieThreads",
  addProseMirrorPlugins() {
    return [
      new Plugin<ThreadsState>({
        key: threadsKey,
        state: {
          init: () => EMPTY,
          apply: (tr, previous, _old, next) => applyThreads(tr, previous, next.doc),
        },
        view() {
          let timer: ReturnType<typeof setTimeout> | undefined;
          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc) return;
              clearTimeout(timer);
              if (threadsState(view.state).missing.size === 0) return;
              timer = setTimeout(() => {
                if (view.isDestroyed) return;
                const meta: ThreadsMeta = { retry: true };
                view.dispatch(
                  view.state.tr.setMeta(threadsKey, meta).setMeta("addToHistory", false),
                );
              }, RETRY_DELAY);
            },
            destroy: () => clearTimeout(timer),
          };
        },
        props: {
          decorations: (state) => threadsKey.getState(state)?.decorations,
          // A click on a passage opens its thread; a click elsewhere closes the open one. The
          // click still places the cursor.
          handleClick(view, pos) {
            const state = threadsState(view.state);
            const id = threadAt(state, pos);
            if (id !== state.active) {
              view.dispatch(
                view.state.tr.setMeta(threadsKey, { active: id }).setMeta("addToHistory", false),
              );
            }
            return false;
          },
        },
      }),
    ];
  },
});
