import { docIdOf, HOME_PATH } from "@lydie/contract";
import type { Tab, TabPath } from "@lydie/contract";
import { groupsOf } from "@lydie/runtime/layout";

import type { Host, OverlayState } from "./host.ts";
import { appUrl, belowBase, parseAppUrl } from "./url.ts";
import { findView } from "./views.ts";

// In a browser tab the window's history is the app's: the address bar shows the focused tab's
// path, and Back and Forward (the browser's, and the app's own commands) walk one list of entries.
//
// - The focused tab goes somewhere new: an entry. Focus moving to another tab or pane, a tab
//   closing, a document leaving for the trash: the current entry is rewritten, since nothing was
//   navigated. Splits and the other tabs are device state and stay out of the URL.
// - Every entry remembers its tab. Going to an entry focuses that tab and moves it there with the
//   tab's own back/forward (so scroll and selection come back); if the tab is gone, the page opens
//   in the focused one.
// - A document's URL carries its title (`url.ts`), followed live: a rename rewrites the entry.
// - An overlay with a `url` (the settings) is an entry of its own over the page: Back closes it.
// - A URL the page is loaded with wins over the saved layout: the tab that shows it is focused,
//   else it opens in a new tab.

// `window.history` and `window.location`, as far as this needs them (tests pass their own).
export type UrlHistory = {
  location(): { pathname: string; search: string; hash: string };
  state(): unknown;
  push(state: unknown, url: string): void;
  replace(state: unknown, url: string): void;
  go(delta: number): void;
  onPop(listener: (state: unknown) => void): () => void;
};

export function browserHistory(): UrlHistory {
  return {
    location: () => window.location,
    state: () => window.history.state,
    push: (state, url) => window.history.pushState(state, "", url),
    replace: (state, url) => window.history.replaceState(state, "", url),
    go: (delta) => window.history.go(delta),
    onPop(listener) {
      const onPopState = (event: PopStateEvent) => listener(event.state);
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    },
  };
}

export type UrlSyncOptions = {
  // The app's base path: "/" or "/app/".
  base: string;
  // Set for workspaces a link can be shared to (hosted): URLs then name the workspace, by its
  // slug when the backend knows it (`info.workspaceSlug`).
  workspaceId?: string | null;
  // Titles in document URLs. Default: true.
  titles?: boolean;
  history?: UrlHistory;
};

// What a history entry carries (`history.state.lydie`).
type Entry = {
  tab: string | null;
  // An overlay's entry that was pushed over a page of the app: closing it goes back.
  under: boolean;
};

type Shown = { tab: Tab | null; open: OverlayState; overlay: boolean; url: string };

function readEntry(state: unknown): Entry | null {
  const entry = (state as { lydie?: Partial<Entry> } | null)?.lydie;
  if (!entry) return null;
  return { tab: typeof entry.tab === "string" ? entry.tab : null, under: entry.under === true };
}

// Whether a tab went somewhere new (rather than back or forward in its own history).
const navigated = (prev: Tab | null, next: Tab | null) =>
  prev !== null &&
  next !== null &&
  prev.id === next.id &&
  next.forward.length === 0 &&
  next.back.at(-1)?.path === prev.path;

export function syncUrl(host: Host, options: UrlSyncOptions): () => void {
  const history = options.history ?? browserHistory();
  const base = options.base.endsWith("/") ? options.base : `${options.base}/`;
  const workspaceId = options.workspaceId ?? null;
  const slug = host.backend.info.workspaceSlug ?? null;
  // What URLs call this workspace, and what they may call it.
  const workspace = workspaceId === null ? null : (slug ?? workspaceId);
  const names = new Set([host.backend.info.workspaceId, ...(slug ? [slug] : [])]);
  // Set while the layout is being moved to what an entry says.
  let applying = false;
  // A `history.go` of ours (closing an overlay) is on its way.
  let leaving = false;
  // The page was loaded with a path nothing shows yet (a lazy plugin's overlay): it stays until
  // something claims it or the app navigates.
  let pending = false;
  // The page's own URL has been dealt with.
  let started = false;

  const tabsOfWindow = (): Tab[] => {
    const layout = host.getLayout();
    const window = layout.windows.find((w) => w.id === host.windowId) ?? layout.windows[0]!;
    return [...groupsOf(window.root)].flatMap((g) => g.tabs);
  };
  const focusedTab = (): Tab | null => {
    const id = host.app.activeTab()?.id;
    return id ? host.layout.getTab(id) : null;
  };

  const overlayDef = (id: string) =>
    host.contributions.list("overlay").find((d) => d.id === id && d.url);

  const overlayAt = (path: TabPath): NonNullable<OverlayState> | null => {
    const below = path.split("#")[0]!.slice(1);
    for (const def of host.contributions.list("overlay")) {
      const props = def.url?.parse(below);
      if (props !== null && props !== undefined) return { id: def.id, props };
    }
    return null;
  };

  // What the address bar names: an overlay, else a page (`path` is null while no view shows it).
  // Null outside the app's base and for another workspace's URL.
  const named = () => {
    const { pathname, hash } = history.location();
    const below = belowBase(base, pathname);
    if (below === null) return null;
    const { workspace: named, path } = parseAppUrl(below, hash);
    if (named !== null && !names.has(named)) return null;
    const overlay = overlayAt(path);
    if (overlay) return { overlay, path: null };
    const view = findView(host.contributions.list("view"), path);
    return { overlay: null, path: view ? path : null };
  };

  const shown = (): Shown => {
    const tab = focusedTab();
    const open = host.overlay.get();
    const def = open ? overlayDef(open.id) : undefined;
    const { search } = history.location();
    if (open && def) {
      const url = appUrl(base, `/${def.url!.path(open.props)}`, workspace, search);
      return { tab, open, overlay: true, url };
    }
    const path = tab?.path ?? HOME_PATH;
    const title = titleOf(path);
    // Until the title is known, a URL that already names this page stays as it is (a reload, a
    // link, Back): it is not stripped of its title only to get it back a moment later.
    const waiting = title === null && docIdOf(path) !== null && options.titles !== false;
    const here = waiting ? named() : null;
    if (here?.path === path) {
      const { pathname, hash } = history.location();
      return { tab, open, overlay: false, url: pathname + search + hash };
    }
    return { tab, open, overlay: false, url: appUrl(base, path, workspace, search, title) };
  };

  // The focused document's title, for its URL (null until it is known). One live query, moved
  // as the focus moves; when the title arrives or changes, the current entry is rewritten.
  let titled: { id: string; title(): string | null; off(): void } | null = null;
  function titleOf(path: TabPath): string | null {
    const id = options.titles === false ? null : docIdOf(path);
    if (titled?.id !== id) {
      titled?.off();
      titled = null;
      if (id) {
        const live = host.backend.live("doc.get", { id });
        const title = () => live.getSnapshot().data[0]?.document.title ?? null;
        titled = { id, title, off: live.subscribe(onTitle) };
      }
    }
    return titled?.title() ?? null;
  }
  function onTitle() {
    if (started && !applying && !leaving && !pending && !last.overlay) settle();
  }

  let last = shown();

  // Links to pages carry their URL, and modified clicks on them are the browser's.
  const offLinks = host.attachLinks({
    href: (path, title) => appUrl(base, path, workspace, history.location().search, title),
  });

  const entry = (under: boolean): { lydie: Entry } => ({
    lydie: { tab: last.tab?.id ?? null, under },
  });

  // Makes the current entry say what shows now.
  const settle = () => {
    last = shown();
    const current = readEntry(history.state());
    const next = entry(last.overlay && Boolean(current?.under)).lydie;
    const { pathname, search, hash } = history.location();
    if (
      pathname + search + hash !== last.url ||
      current?.tab !== next.tab ||
      current.under !== next.under
    ) {
      history.replace({ lydie: next }, last.url);
    }
  };

  const onChange = () => {
    if (applying || leaving) return;
    const tab = focusedTab();
    const open = host.overlay.get();
    // Scroll positions and other tabs change far more often than the page.
    if (open === last.open && tab?.id === last.tab?.id && tab?.path === last.tab?.path) {
      last = { ...last, tab };
      return;
    }
    const prev = last;
    last = shown();
    if (last.url === prev.url && last.tab?.id === prev.tab?.id) return;
    pending = false;
    if (last.overlay && !prev.overlay) {
      history.push(entry(true), last.url);
    } else if (prev.overlay && !last.overlay && readEntry(history.state())?.under) {
      leaving = true;
      history.go(-1);
    } else if (!last.overlay && !prev.overlay && navigated(prev.tab, last.tab)) {
      history.push(entry(false), last.url);
    } else {
      settle();
    }
  };

  // Focuses a tab and takes it to a page, through its own history when the page is next to it.
  const moveTab = (tab: Tab, path: TabPath) => {
    host.dispatch({ type: "activate", tabId: tab.id });
    if (tab.path === path) return;
    if (tab.back.at(-1)?.path === path) host.dispatch({ type: "back", tabId: tab.id });
    else if (tab.forward[0]?.path === path) host.dispatch({ type: "forward", tabId: tab.id });
    else host.dispatch({ type: "navigate", tabId: tab.id, path });
  };

  // Moves the layout to what the address bar says, in the entry's tab when it still exists.
  const show = (tabId: string | null) => {
    const at = named();
    if (at?.overlay) {
      host.overlay.set(at.overlay);
      return;
    }
    const open = host.overlay.get();
    if (open && overlayDef(open.id)) host.overlay.set(null);
    if (!at) return;
    const tab = tabId ? tabsOfWindow().find((t) => t.id === tabId) : undefined;
    if (!tab) {
      // The entry's tab is gone: its page opens in the focused one (the base asks for nothing).
      if (at.path && at.path !== HOME_PATH) host.app.open(at.path);
      return;
    }
    if (at.path) moveTab(tab, at.path);
    else host.dispatch({ type: "activate", tabId: tab.id });
  };

  const onPop = (state: unknown) => {
    if (leaving) {
      leaving = false;
      settle();
      return;
    }
    pending = false;
    applying = true;
    try {
      show(readEntry(state)?.tab ?? null);
    } finally {
      applying = false;
    }
    settle();
  };

  // The URL the page was loaded with.
  const land = () => {
    // Another workspace's URL: whoever chose this window's workspace says why it is not open.
    const at = named();
    if (!at) return;
    if (at.overlay) {
      host.overlay.set(at.overlay);
      return;
    }
    const target = at.path;
    if (!target) {
      pending = true;
      return;
    }
    // The workspace's base: what the layout restored stays.
    if (target === HOME_PATH) return;
    const tabs = tabsOfWindow();
    const focused = focusedTab();
    // A reload: the entry's own tab, also when the layout was saved a moment before it got here.
    const entryTab = readEntry(history.state())?.tab;
    const reloaded = tabs.find((t) => t.id === entryTab);
    if (reloaded) return moveTab(reloaded, target);
    const showing = focused?.path === target ? focused : tabs.find((t) => t.path === target);
    if (showing) host.dispatch({ type: "activate", tabId: showing.id });
    else
      host.app.open(target, { mode: !focused || focused.path === HOME_PATH ? "replace" : "tab" });
  };

  land();
  if (pending) last = shown();
  else settle();
  started = true;

  // A plugin that loads later may be the one the pending path belongs to.
  const onOverlays = () => {
    const overlay = pending ? named()?.overlay : null;
    if (!overlay) return;
    pending = false;
    applying = true;
    try {
      host.overlay.set(overlay);
    } finally {
      applying = false;
    }
    settle();
  };

  const disposers = [
    host.subscribeLayout(onChange),
    host.overlay.subscribe(onChange),
    host.contributions.subscribe("overlay", onOverlays),
    history.onPop(onPop),
    () => titled?.off(),
    // The app's own Back and Forward are the window's.
    host.attachWindowHistory({ go: (delta) => history.go(delta) }),
  ];
  return () => {
    offLinks();
    for (const off of disposers) off();
  };
}
