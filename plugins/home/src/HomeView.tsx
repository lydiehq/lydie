/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the results are an ARIA listbox driven from the combobox (aria-activedescendant), which handles the keys */
// The home page: the new-tab page and what an empty pane shows. One box to find or create,
// then where you were.
import {
  atTop,
  DocIcon,
  docPath,
  documentMenuItems,
  gettingStartedId,
  moveToTrash,
  pageIconOf,
  PageLink,
  runDocumentMenuAction,
  useApp,
  useBackend,
  useContributions,
  useDeviceSetting,
  useOps,
  useQuery,
} from "@lydie/plugin-api";
import type { AppApi, DocumentRef, LiveRow, OpenOptions, ViewProps } from "@lydie/plugin-api";
import {
  Button,
  ContextMenu,
  focusRingInsetClass,
  More1Regular,
  Search2Regular,
  sidebarSectionTitleClass,
} from "@lydie/plugin-api/ui";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";

import { ago, forget, jumpList, rankTitles, recentKey, snippetParts, withKeys } from "./recents.ts";
import type { Candidate, Opened } from "./recents.ts";

const JUMP_LIMIT = 8;
const TITLE_LIMIT = 6;
const TEXT_LIMIT = 5;

export function HomeView({ tab }: ViewProps) {
  const app = useApp();
  const [opened, setOpened] = useDeviceSetting<Opened[]>(recentKey(app.workspace.workspaceId), []);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Relative times are read when the page is shown (the box takes focus), not every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tab.isFocused) input.current?.focus();
  }, [tab.isFocused]);
  const welcomeId = gettingStartedId(app.workspace.workspaceId);

  return (
    <div className="h-full overflow-y-auto" data-testid="home">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-8 px-6 pt-[14vh] pb-16">
        <FindBox
          ref={input}
          onFocus={() => setNow(Date.now())}
          query={query}
          onQueryChange={setQuery}
          opened={opened}
        />
        {!query.trim() && <GettingStarted id={welcomeId} />}
        {!query.trim() && (
          <JumpBackIn
            opened={opened}
            now={now}
            exclude={welcomeId}
            onTrashed={(id) => setOpened(forget(opened, id))}
          />
        )}
      </div>
    </div>
  );
}

// ---- Find or create

type Item =
  | { kind: "doc"; id: string; title: string; icon: ReactNode; detail: ReactNode }
  | { kind: "create"; title: string };

// Enter: here. Mod+Enter: a new tab. Mod+Alt+Enter or Shift+Enter: to the side (as the switcher).
function keyMode(app: AppApi, event: KeyboardEvent): OpenOptions["mode"] {
  if (event.shiftKey && !(event.metaKey || event.ctrlKey)) return "split";
  const mode = app.modeFor({ ...event, button: 0 });
  return mode === "tab" || mode === "split" ? mode : "replace";
}

// Titles with their folder path, read once each time the box starts a new search.
async function loadCandidates(app: AppApi): Promise<Candidate[]> {
  const { entries } = await app.backend.ops.doc.listTree({
    workspaceId: app.workspace.workspaceId,
  });
  const titles = new Map(entries.map((e) => [e.id, e.title]));
  const parents = new Map(entries.map((e) => [e.id, e.parentId]));
  return entries.map((e) => {
    const path: string[] = [];
    for (let p = e.parentId; p && path.length < 4; p = parents.get(p) ?? null)
      path.unshift(titles.get(p) ?? "");
    return withKeys({
      id: e.id,
      title: e.title,
      path: path.join(" / "),
      icon: pageIconOf(e.properties),
    });
  });
}

// Text hits for the find box: one query per search, not a live one per prefix typed (each would
// linger and re-run on every write). The last hits stay up while the next load.
function useTextHits(app: AppApi, text: string): readonly LiveRow<"doc.search">[] {
  const [state, setState] = useState<{ text: string; hits: readonly LiveRow<"doc.search">[] }>({
    text: "",
    hits: [],
  });
  useEffect(() => {
    if (!text) return;
    let live = true;
    app.backend
      .query("doc.search", { workspaceId: app.workspace.workspaceId, text, limit: TEXT_LIMIT * 2 })
      .then(
        (hits) => {
          if (live) setState({ text, hits });
        },
        () => {
          if (live) setState({ text, hits: [] });
        },
      );
    return () => {
      live = false;
    };
  }, [app, text]);
  return text ? state.hits : [];
}

function FindBox({
  ref,
  onFocus,
  query,
  onQueryChange,
  opened,
}: {
  ref: Ref<HTMLInputElement>;
  onFocus: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  opened: readonly Opened[];
}) {
  const app = useApp();
  const backend = useBackend();
  const listId = useId();
  // The box shows each key at once; ranking and searching may lag a keystroke behind.
  const text = useDeferredValue(query).trim();
  const searching = text.length > 0;
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!searching) return;
    let live = true;
    void loadCandidates(app).then((list) => {
      if (live) setCandidates(list);
    });
    return () => {
      live = false;
    };
  }, [app, searching]);

  const hits = useTextHits(app, text);

  const items: Item[] = [];
  if (searching) {
    const titled = rankTitles(candidates ?? [], text, opened, TITLE_LIMIT);
    for (const c of titled) {
      items.push({
        kind: "doc",
        id: c.id,
        title: c.title || "Untitled",
        icon: <DocIcon id={c.id} properties={c.icon ? { icon: c.icon } : null} />,
        detail: c.path || null,
      });
    }
    const shown = new Set(titled.map((c) => c.id));
    for (const hit of hits.filter((h) => !shown.has(h.id)).slice(0, TEXT_LIMIT)) {
      items.push({
        kind: "doc",
        id: hit.id,
        title: hit.title || "Untitled",
        icon: <DocIcon id={hit.id} properties={null} />,
        detail: <Snippet snippet={hit.snippet} />,
      });
    }
    if (candidates && !candidates.some((c) => c.title.trim().toLowerCase() === text.toLowerCase()))
      items.push({ kind: "create", title: text });
  }
  const current = Math.min(active, Math.max(items.length - 1, 0));

  // Enter before the list caught up with the box: the best title match for what is typed, else
  // "Create" (full-text hits come later, so they are not waited for).
  const firstFor = (typed: string): Item | undefined => {
    if (!typed || !candidates) return undefined;
    const top = rankTitles(candidates, typed, opened, 1)[0];
    if (top)
      return { kind: "doc", id: top.id, title: top.title || "Untitled", icon: null, detail: null };
    if (candidates.some((c) => c.title.trim().toLowerCase() === typed.toLowerCase()))
      return undefined;
    return { kind: "create", title: typed };
  };

  const run = (item: Item, mode: OpenOptions["mode"]) => {
    onQueryChange("");
    setActive(0);
    if (item.kind === "doc") app.openDoc(item.id, { mode });
    else
      void backend.ops.doc
        .create(
          { workspaceId: backend.info.workspaceId, title: item.title },
          { scope: app.historyScope() },
        )
        .then((doc) => app.openDoc(doc.id, { mode }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      const item = query.trim() === text ? items[current] : firstFor(query.trim());
      if (!item || event.nativeEvent.isComposing) return;
      event.preventDefault();
      run(item, keyMode(app, event));
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange("");
      setActive(0);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  return (
    <div className="flex flex-col gap-1">
      {/* The page's one hero control, deliberately larger than the shared fields: 44 px, the
          editor's 15 px body size (no theme size matches it). */}
      <div className="flex h-11 items-center gap-2.5 rounded-xl bg-gray-950/4 px-3.5 focus-within:bg-gray-950/6">
        <Search2Regular className="size-4 shrink-0 text-gray-400" />
        <input
          ref={ref}
          role="combobox"
          aria-label="Find or create"
          aria-autocomplete="list"
          aria-expanded={searching}
          aria-controls={listId}
          aria-activedescendant={searching && items.length ? optionId(current) : undefined}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          placeholder="Find or create a document…"
          className="h-full grow bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>
      {searching && (
        <div id={listId} role="listbox" aria-label="Results" className="flex flex-col py-1">
          {items.map((item, i) => (
            <div
              key={item.kind === "doc" ? `doc:${item.id}` : item.kind}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              // Keep focus in the box: clicks act, the caret stays.
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={(e) => run(item, app.modeFor(e))}
              className="flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-gray-700 aria-selected:bg-gray-950/5"
            >
              <ItemContent item={item} />
              {i === current && (
                <span aria-hidden className="ml-auto shrink-0 text-xs text-gray-400">
                  ↵
                </span>
              )}
            </div>
          ))}
          {candidates === null && items.length === 0 && (
            <div role="presentation" className="px-3 py-2 text-sm text-gray-400">
              Searching…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemContent({ item }: { item: Item }) {
  if (item.kind === "create")
    return (
      <>
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-gray-400"
        >
          +
        </span>
        <span className="truncate">
          Create <span className="font-medium text-gray-900">“{item.title}”</span>
        </span>
      </>
    );
  return (
    <>
      <span className="flex shrink-0 text-gray-500">{item.icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-gray-900">{item.title}</span>
        {item.detail && <span className="truncate text-xs text-gray-500">{item.detail}</span>}
      </span>
    </>
  );
}

function Snippet({ snippet }: { snippet: string }) {
  return (
    <>
      {snippetParts(snippet).map((part, i) =>
        part.mark ? (
          <mark key={i} className="rounded-sm bg-yellow-200/60 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

// ---- Getting started: the page a new workspace starts with, while it is there

function GettingStarted({ id }: { id: string }) {
  const doc = useQuery("doc.get", { id, includeBody: false }).data[0]?.document;
  const headingId = useId();
  if (!doc || doc.deletedAt) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2 id={headingId} className={`px-3 ${sidebarSectionTitleClass}`}>
        Start here
      </h2>
      <PageLink
        path={docPath(id)}
        title={doc.title}
        className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-gray-950/3 ${focusRingInsetClass}`}
      >
        <span className="flex shrink-0 text-gray-500">
          <DocIcon id={id} properties={doc.properties} />
        </span>
        <span className="truncate font-medium text-gray-900">{doc.title || "Untitled"}</span>
        <span className="truncate text-gray-400">The basics in three minutes</span>
      </PageLink>
    </section>
  );
}

// ---- Jump back in

function JumpBackIn({
  opened,
  now,
  exclude,
  onTrashed,
}: {
  opened: readonly Opened[];
  now: number;
  // Shown in its own section above.
  exclude: string;
  onTrashed: (id: string) => void;
}) {
  const app = useApp();
  // Only needed while this device has opened fewer documents than the list shows.
  const changed = useQuery(
    "doc.recent",
    opened.length < JUMP_LIMIT
      ? { workspaceId: app.workspace.workspaceId, limit: JUMP_LIMIT * 2 }
      : null,
  );
  const ids = jumpList(
    opened.filter((o) => o.id !== exclude),
    changed.data.filter((d) => d.id !== exclude),
    JUMP_LIMIT,
  );
  const ops = useOps();
  const menuItems = useContributions("documentMenu");
  const [menu, setMenu] = useState<{ doc: DocumentRef; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const headingId = useId();
  if (ids.length === 0) {
    if (changed.isLoading) return null;
    return (
      <p className="px-3 text-sm text-gray-500">
        Nothing here yet. Type a title above and press Enter to write your first document.
      </p>
    );
  }

  const failed = (what: string) => (error: unknown) =>
    app.notify({
      title: `Could not ${what}`,
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });

  // The sidebar tree's menu (`documentMenuItems`), for one document.
  const onMenuAction = async (doc: DocumentRef, action: string) => {
    const builtIn = runDocumentMenuAction(action, doc, menuItems, app);
    if (builtIn === "open-tab") app.openDoc(doc.id, { mode: "tab" });
    else if (builtIn === "open-split") app.openDoc(doc.id, { mode: "split" });
    else if (builtIn === "rename") setRenamingId(doc.id);
    else if (builtIn === "delete") await moveToTrash(app, [doc], { scope: app.historyScope() });
    else if (builtIn === "new-child") {
      const workspaceId = app.workspace.workspaceId;
      const created = await ops.doc
        .create({
          workspaceId,
          parentId: doc.id,
          title: "Untitled",
          ...(await atTop(app.backend, workspaceId, doc.id)),
        })
        .catch(failed("create the page"));
      if (created) app.openDoc(created.id, { state: { focusTitle: true } });
    }
  };

  const rename = (doc: DocumentRef, title: string) => {
    setRenamingId(null);
    const next = title.trim();
    if (next && next !== doc.title)
      void ops.doc.rename({ id: doc.id, title: next }).catch(failed("rename it"));
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2 id={headingId} className={`px-3 ${sidebarSectionTitleClass}`}>
        Jump back in
      </h2>
      <ul className="flex flex-col">
        {ids.map((id) => (
          <RecentRow
            key={id}
            id={id}
            now={now}
            onTrashed={onTrashed}
            menuOpen={menu?.doc.id === id}
            onMenu={(doc, x, y) => setMenu({ doc, x, y })}
            renaming={renamingId === id}
            onRename={rename}
            onCancelRename={() => setRenamingId(null)}
          />
        ))}
      </ul>
      <ContextMenu
        label="Document actions"
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? documentMenuItems(menu.doc, menuItems) : []}
        onAction={(action) => menu && void onMenuAction(menu.doc, action)}
        onClose={() => setMenu(null)}
      />
    </section>
  );
}

function RecentRow({
  id,
  now,
  onTrashed,
  menuOpen,
  onMenu,
  renaming,
  onRename,
  onCancelRename,
}: {
  id: string;
  now: number;
  onTrashed: (id: string) => void;
  menuOpen: boolean;
  onMenu: (doc: DocumentRef, x: number, y: number) => void;
  renaming: boolean;
  onRename: (doc: DocumentRef, title: string) => void;
  onCancelRename: () => void;
}) {
  const doc = useQuery("doc.get", { id }).data[0]?.document;
  const parent = useQuery("doc.get", doc?.parentId ? { id: doc.parentId } : null).data[0]?.document;
  const trashed = Boolean(doc?.deletedAt);
  useEffect(() => {
    if (trashed) onTrashed(id);
  }, [trashed, id, onTrashed]);
  // Missing (another workspace, not synced yet) or in the trash: not listed.
  if (!doc || trashed) return null;
  const ref: DocumentRef = { id, title: doc.title, parentId: doc.parentId };
  const title = doc.title || "Untitled";
  const icon = (
    <span className="flex shrink-0 text-gray-500">
      <DocIcon id={id} properties={doc.properties} />
    </span>
  );
  // Under the element, as the "…" button opens it.
  const menuBelow = (el: Element) => {
    const rect = el.getBoundingClientRect();
    onMenu(ref, rect.left, rect.bottom);
  };
  return (
    <li
      className={`group relative flex h-9 items-center rounded-lg text-sm ${menuOpen ? "bg-gray-950/3" : "hover:bg-gray-950/3"}`}
    >
      {renaming ? (
        <div className="flex h-full w-full items-center gap-2.5 px-3">
          {icon}
          <RenameInput
            initial={doc.title}
            onCommit={(next) => onRename(ref, next)}
            onCancel={onCancelRename}
          />
        </div>
      ) : (
        <PageLink
          path={docPath(id)}
          title={doc.title}
          onContextMenu={(e) => {
            e.preventDefault();
            onMenu(ref, e.clientX, e.clientY);
          }}
          onKeyDown={(e) => {
            if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              menuBelow(e.currentTarget);
            }
          }}
          className={`flex h-full w-full items-center gap-2.5 rounded-lg px-3 text-left ${focusRingInsetClass}`}
        >
          {icon}
          <span className="truncate font-medium text-gray-900">{title}</span>
          {parent && <span className="truncate text-gray-400">{parent.title || "Untitled"}</span>}
          {/* Makes way for the "…" button while it shows. */}
          <span
            className={`ml-auto shrink-0 pl-3 text-xs text-gray-400 ${menuOpen ? "invisible" : "group-hover:invisible group-focus-within:invisible pointer-coarse:invisible"}`}
          >
            {ago(doc.updatedAt, now)}
          </span>
        </PageLink>
      )}
      {!renaming && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`More actions for ${title}`}
          tooltip="Document options"
          tooltipOptions={{ placement: "top", offset: 8 }}
          onPress={(e) => menuBelow(e.target as Element)}
          className={`absolute right-2 text-gray-500 hover:bg-gray-950/5 hover:text-gray-700 pressed:bg-gray-950/8 ${menuOpen ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"}`}
        >
          <More1Regular className="size-4" />
        </Button>
      )}
    </li>
  );
}

// The tree's inline rename, in a Home row.
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  return (
    <input
      aria-label="Document title"
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- inline rename starts typing at once
      autoFocus
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          done.current = true;
          onCommit(value);
        } else if (event.key === "Escape") {
          // The pane would take Escape too.
          event.stopPropagation();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!done.current) onCommit(value);
      }}
      // A plain input, not the shared Input: it takes the title's place in the row, with the
      // focused field's ring, as in the tree.
      className="h-7 min-w-0 grow rounded-md bg-surface px-1 font-medium text-gray-900 ring ring-gray-950/20 outline-none"
    />
  );
}
