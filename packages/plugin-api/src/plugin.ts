// What a plugin is and what it can contribute. The host (`@lydie/app`) implements `PluginContext`
// and `AppApi`; plugins see nothing else of it, so third-party loading can later hand a sandboxed
// implementation of the same types.
import type { ChildEntry, OperationId, TabPath, TabState } from "@lydie/contract";
import type { AnyExtension, Editor, JSONContent, SlashCommandItem } from "@lydie/editor";
import type { AppLock, DownloadOptions, DownloadResult } from "@lydie/platform";
import type { ConfirmOptions } from "@lydie/ui";
import type { ComponentType, ReactNode } from "react";

import type { Backend, BackendInfo } from "./backend.ts";
import type { HostServices, PluginsApi } from "./hosted.ts";
import type { ImporterDef } from "./import/plan.ts";

export type {
  AppLock,
  AppLockState,
  DownloadOptions,
  DownloadProgress,
  DownloadResult,
} from "@lydie/platform";

export type Disposable = () => void;

// Drag-and-drop data types shared by the host (tabs, panes) and plugins (tree rows, links).
export const DRAG_TYPES = {
  doc: "application/x-lydie-doc",
  tab: "application/x-lydie-tab",
} as const;

// ---- Navigation

export type Side = "left" | "right" | "up" | "down";

export type OpenOptions = {
  // "replace" (default): in the active tab, unless it is pinned. "tab": a new tab after it.
  // "background": a new tab that does not take focus. "split": a new pane beside the active one.
  mode?: "replace" | "tab" | "background" | "split";
  side?: Side;
  state?: TabState;
};

// How a pointer or keyboard gesture opens a link: Cmd/Ctrl-click or middle-click → new tab.
export type OpenGesture = {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
};

// Where the gesture happened: "read" (lists, panels, previews: a plain click follows) or "edit"
// (the editor: Mod-click follows in place, as in Obsidian).
export type GestureContext = "read" | "edit";

// ---- Commands and keybindings

export type CommandSource = "palette" | "keybinding" | "menu" | "api";

export type CommandContext = { app: AppApi; source: CommandSource; args?: unknown };

// One of the things a command with `choices` can be run with (an icon, a colour).
export type CommandChoice = {
  id: string;
  title: string;
  icon?: ReactNode;
  // Choices with the same group run together under its heading.
  group?: string;
  // What the document has now: marked with a check.
  current?: boolean;
};

export type CommandChoices = {
  // In the palette's search box while the choices show, e.g. "Search icons".
  placeholder?: string;
  // The choices for what is typed, already filtered and in order. Called again as the query
  // changes; a promise keeps the previous ones up until it resolves.
  list(query: string, app: AppApi): readonly CommandChoice[] | Promise<readonly CommandChoice[]>;
};

export type CommandDef = {
  // Namespaced: "<plugin>.<name>", e.g. "quick-switcher.open".
  id: string;
  title: string;
  // For a command that switches something on or off: the palette's title for how things are now,
  // so it says what running it will do ("Remove from favorites"). Must be quick and synchronous.
  // `title` stays its name elsewhere (Settings → Keyboard shortcuts) and still finds it.
  paletteTitle?: (app: AppApi) => string;
  group?: string;
  // Shown in the command palette, e.g. `<FileNewRegular />` (sized by the palette).
  icon?: ReactNode;
  // Default keybindings, e.g. "Mod+O", "Mod+Shift+P", "Mod+[". Users can rebind (per device).
  keybinding?: string | readonly string[];
  // Fire the keybinding while focus is in a text field or the editor. Default: true for
  // combinations with Mod/Ctrl/Alt, false for bare keys.
  inText?: boolean;
  // Hidden from the command palette (still runnable by key or API).
  hidden?: boolean;
  // false: left out of Settings → Keyboard shortcuts, for actions too rare or weighty for a key
  // (signing out, copying the workspace to the cloud). Default: true.
  bindable?: boolean;
  // The contract operation this command performs, so the palette shows it once.
  operation?: OperationId;
  // "document": acts on the open document. The palette lists it first, under the document's pill,
  // and leaves it out once the pill is removed.
  scope?: "document";
  // Disabled (not listed, keybinding ignored) when false.
  when?: (app: AppApi) => boolean;
  // The palette shows these as a page of their own, and `run` gets the chosen one's id as
  // `args`. Run any other way (a keybinding), `args` is undefined and the command asks its own
  // way, such as a picker on the page.
  choices?: CommandChoices;
  run(context: CommandContext): void | Promise<void>;
};

export type CommandInfo = {
  id: string;
  title: string;
  paletteTitle?: string;
  group: string | null;
  icon?: ReactNode;
  keybindings: readonly string[];
  bindable: boolean;
  source: "plugin" | "operation";
  scope: "document" | null;
  enabled: boolean;
  choices?: CommandChoices;
};

// ---- Views and contributions

export type TabInfo = {
  id: string;
  groupId: string;
  // What the tab shows: "/d/<docId>", "/trash" (`docIdOf(path)` reads the document's id).
  path: TabPath;
  // Whether this tab is the visible one in its group.
  isActive: boolean;
  // The active tab of the active group.
  isFocused: boolean;
};

export type ViewProps = { tab: TabInfo };

export type ViewDef = {
  // The paths this view shows: "/trash", "/d/:id", "/reports/*". `:name` stands for one segment,
  // a trailing `*` for whatever follows. On the web it is the page's URL below the app's base.
  path: string;
  component: ComponentType<ViewProps>;
  // Tab label: a static title, or a component (e.g. one that reads the document title).
  title?: string | ((path: TabPath) => string);
  tabTitle?: ComponentType<{ path: TabPath }>;
  // Shown before `title` in the tab (a `tabTitle` draws its own).
  icon?: ReactNode;
  // When several views show the same path, the lowest order does (default 100).
  order?: number;
  // Starts what the page at `path` reads (a route loader): nothing when it is all here already,
  // else a promise for when it is. The host calls it before showing the page and keeps the
  // previous one up meanwhile, briefly, so the new page paints whole instead of filling in.
  preload?: (path: TabPath, app: AppApi) => void | Promise<void>;
};

export type SidebarSectionAction = {
  label: string;
  icon: ReactNode;
  run(app: AppApi): void | Promise<void>;
};

export type SidebarSectionDef = {
  id: string;
  order?: number;
  title?: string;
  // Takes the remaining height and scrolls itself (e.g. a virtualised tree).
  fill?: boolean;
  // Ids of sections this one shows instead (e.g. a grouped tree in place of "documents").
  replaces?: readonly string[];
  // Buttons beside the title, shown while the section is hovered (e.g. "New document").
  actions?: readonly SidebarSectionAction[];
  component: ComponentType;
};

export type PanelDef = {
  id: string;
  title: string;
  order?: number;
  icon?: ReactNode;
  component: ComponentType<{ activeTab: TabInfo | null }>;
};

export type StatusItemDef = {
  id: string;
  // Where in the sidebar footer's row: "left" starts the row, before the sync state; the default
  // ("right") ends it.
  align?: "left" | "right";
  order?: number;
  // Shows the sync state itself: the host's own sync indicator is hidden while it is registered.
  replacesSyncIndicator?: boolean;
  component: ComponentType;
};

export type SettingsPageDef = {
  id: string;
  title: string;
  order?: number;
  // Navigation group ("Workspace", "Account", "App"); pages without one go under "General".
  group?: string;
  // Under the page title, and searched with `keywords`.
  description?: string;
  keywords?: readonly string[];
  icon?: ReactNode;
  // Hidden from the navigation when false (deep links still open it).
  when?: (app: AppApi) => boolean;
  // `path`: what follows the page id in the URL (`/settings/<id>/<path>`), e.g. an open row.
  component: ComponentType<{ path: string | null; navigate(path: string | null): void }>;
};

// A section of the workspace switcher's menu (the sidebar's top-left button).
export type WorkspaceMenuItemDef = {
  id: string;
  order?: number;
  component: ComponentType<{ close(): void }>;
};

// The document tree, offered by the document-tree plugin so other plugins can show the same
// virtualised tree (drag and drop, inline rename, keyboard, icons) over part of the workspace,
// e.g. one hosted space per group. Render it with `<DocumentTreeView>`.
export type DocumentTreeSpace = { teamspaceId?: string | null; privateOwnerId?: string };
export type DocumentTreeDropTarget = {
  parentId: string | null;
  beforeId?: string;
  afterId?: string;
};
export type DocumentTreeProps = {
  // The tree's accessible name (default "Documents").
  label?: string;
  // Only this space's top-level pages (`doc.children` params); subpages follow their parent.
  space?: DocumentTreeSpace;
  // Narrows the top level further (e.g. pages shared from spaces the user is not in).
  filterRoot?: (doc: ChildEntry) => boolean;
  // Which tree a drag started in. A page dropped here from a tree with another key goes through
  // `onForeignDrop` (no handler: the drop is refused); same key: an ordinary `doc.move`.
  dragKey?: string;
  onForeignDrop?: (id: string, target: DocumentTreeDropTarget) => Promise<void>;
  // Extra `doc.create` input for new top-level pages (e.g. `{ teamspaceId }`).
  createInput?: Record<string, unknown>;
  // Device-storage key of the expanded folders (default: one per workspace).
  expandedKey?: string;
  // "self": fills its container and scrolls (the sidebar section). "parent": as tall as its rows,
  // virtualised against the nearest scrolling ancestor (several trees in one list).
  scroll?: "self" | "parent";
  // Shown instead of the default empty state when the tree has no pages (and accepts drops).
  emptyState?: ReactNode;
};
export type DocumentTreeDef = { id: string; component: ComponentType<DocumentTreeProps> };

// Modal UI opened by id (quick switcher, dialogs). `props` is whatever `app.overlays.open` passed.
export type OverlayDef = {
  id: string;
  component: ComponentType<{ close(): void; props: unknown }>;
  // The overlay's place in the address bar, where the window has one (the web app). Opening it
  // adds a history entry, so Back closes it; a change of props replaces that entry.
  url?: {
    // The path for these props, no leading slash ("settings/general"). The host puts it below the
    // app's base, and below a hosted workspace's prefix.
    path(props: unknown): string;
    // The props a path opens the overlay with; null when the path is not this overlay's.
    parse(path: string): unknown;
  };
};

export type DocumentRef = { id: string; title: string; parentId: string | null };

export type DocumentMenuItemDef = {
  id: string;
  // A function when it follows the document ("Add to favorites" / "Remove from favorites"); read
  // when the menu opens (`documentMenuLabel`).
  label: string | ((doc: DocumentRef) => string);
  // Shown before the label in the page's ••• menu.
  icon?: ReactNode;
  order?: number;
  // Items of one group sit together in the page's ••• menu, between separators.
  group?: string;
  danger?: boolean;
  when?: (doc: DocumentRef) => boolean;
  run(doc: DocumentRef, app: AppApi): void | Promise<void>;
};

export const documentMenuLabel = (def: Pick<DocumentMenuItemDef, "label">, doc: DocumentRef) =>
  typeof def.label === "function" ? def.label(doc) : def.label;

// Renders a wiki-link or embed target the default renderer does not handle (e.g. a URL embed).
// "preview": the hover card for a link (`HoverPreview`); targets are written as in a wiki link
// (`Note#Heading`), or `doc:<id>[#heading|#^block]` for a known document.
export type LinkRendererDef = {
  id: string;
  kind: "link" | "embed" | "preview";
  order?: number;
  match(target: string): boolean;
  // `sourceId`: the document the link is in, when there is one (relative targets).
  component: ComponentType<{ target: string; sourceId?: string | null }>;
};

// A component mounted once per editor instance, beside it (link popovers, mention menus).
export type EditorOverlayProps = {
  editor: Editor;
  // The document the editor shows.
  docId: string;
  // The tab it is in, if any.
  tabId: string | null;
};

// Something to do with the selected text, as a button in the selection toolbar after the
// formatting buttons (Comment).
export type SelectionAction = {
  id: string;
  label: string;
  icon: ReactNode;
  // It does not change the document, so it is also offered to someone who may comment on the
  // page but not edit it (the selection toolbar then shows only these).
  readOnly?: boolean;
  run(editor: Editor, context: { docId: string; tabId: string | null }): void;
};

export type EditorContributions = {
  // TipTap extensions added to every editor (read when an editor is created).
  extensions?: () => AnyExtension[];
  // A function is re-read whenever the `/` menu opens or filters, so items can change over time.
  slashItems?: readonly SlashCommandItem[] | (() => readonly SlashCommandItem[]);
  overlay?: ComponentType<EditorOverlayProps>;
  selectionActions?: readonly SelectionAction[];
};

// ---- Document slots (inside the `doc` route's view; render them with `<DocumentSlots>`)

export type DocumentSlotProps = {
  docId: string;
  tab: TabInfo | null;
  // Body slots: what to show when this slot does not apply to the document (the next body slot,
  // finally the editor). Header slots get null.
  fallback: ReactNode;
};

// "header": under the title (properties). "body": in place of the editor, e.g. a database's
// views; return `fallback` for documents the slot does not handle.
export type DocumentSlotDef = {
  id: string;
  // "actions": small controls at the right of the page's top bar, before its ••• menu (Share);
  // "top": above the title (cover, icon); "header": under it; "body": instead of the editor.
  slot: "actions" | "top" | "header" | "body";
  order?: number;
  component: ComponentType<DocumentSlotProps>;
};

// ---- Editor facilities (Markdown ⇄ editor document, provided by the host)

export type ParsedDocument = {
  // Editor content (ProseMirror JSON).
  content: JSONContent;
  // Opaque parse of the source; pass back to `toMarkdown` so untouched bytes are preserved.
  source: unknown;
};

export type OutlineHeading = { level: number; text: string; block: number };
export type OutlineBlock = { index: number; type: string; id: string | null; text: string };

// Headings and top-level blocks of a body; `block`/`index` are `content.content` indexes of the
// parsed document.
export type DocumentOutline = { headings: OutlineHeading[]; blocks: OutlineBlock[] };

export type EditorFacilities = {
  fromMarkdown(markdown: string): ParsedDocument;
  // Splice-preserving save: only changed blocks are re-serialised.
  toMarkdown(original: ParsedDocument | string, content: JSONContent): string;
  outline(markdown: string): DocumentOutline;
  // Gives top-level block `index` a `^id` (Obsidian style) if it has none, touching only that block.
  assignBlockId(markdown: string, index: number): { markdown: string; id: string };
  // HTML as Lydie Markdown, read with the editor's parse rules (as pasting it would). Importers
  // shape their source into the editor's HTML first: `a[data-type="wiki-link"]`,
  // `div[data-type="embed"]`, `div[data-type="callout"]`, task lists, math, columns.
  fromHtml(html: string): string;
  // A Markdown file's frontmatter properties (null without any, or when it is not a YAML mapping)
  // and its body, which is what a document stores.
  splitFrontmatter(markdown: string): { properties: Record<string, unknown> | null; body: string };
  extensions(): AnyExtension[];
  slashItems(): readonly SlashCommandItem[];
};

// ---- The app, as plugins see it

export type ToastOptions = {
  title: string;
  description?: string;
  // Without a kind the toast has no icon; each kind shows one in its colour.
  kind?: "info" | "success" | "warning" | "error";
  // A button on the toast: pressing it runs `onPress` and dismisses the toast.
  action?: { label: string; onPress: () => void };
  // Milliseconds on screen (4 s, errors 6 s); Infinity keeps it until dismissed. Paused on hover.
  duration?: number;
};

export type AppApi = {
  readonly backend: Backend;
  readonly workspace: BackendInfo;
  // Shows a page by its path (`docPath(id)`, "/trash", `HOME_PATH`).
  open(path: TabPath, options?: OpenOptions): void;
  openDoc(id: string, options?: OpenOptions): void;
  // Read contexts: plain click "replace", Mod-click "tab". In the editor ("edit"): Mod-click
  // "replace". Everywhere: Mod+Shift-click and middle-click "tab", Mod+Alt-click "split".
  modeFor(gesture: OpenGesture, context?: GestureContext): OpenOptions["mode"];
  activeTab: () => TabInfo | null;
  // Called when the focused tab or its path changes.
  subscribeActiveTab: (listener: () => void) => () => void;
  // Merges into a tab's state bag (`null` deletes a key); no-op for a closed tab. Views usually
  // use `useTabState` instead.
  setTabState(tabId: string, state: Record<string, unknown>): void;
  // The undo scope for operations taken now (the active tab's).
  historyScope(): string;
  runCommand(id: string, args?: unknown): Promise<void>;
  commands(): readonly CommandInfo[];
  // "⌘O" on macOS, "Ctrl+O" elsewhere; "G then H" for a sequence.
  formatKeybinding(binding: string): string;
  // The same as key caps per step, for tooltips (`hotkeys`): [["⌘", "O"]], [["G"], ["H"]].
  keyCaps(binding: string): string[][];
  // The bindings of a command that work here (rebinding applied, a browser's own left out); []
  // for none or an unknown command. Cheaper than `commands()`.
  keybindings(commandId: string): readonly string[];
  // Per-device keybinding overrides ([] unbinds, null restores the defaults).
  keymap: {
    set: (commandId: string, bindings: readonly string[] | null) => void;
    subscribe: (listener: () => void) => () => void;
  };
  overlays: { open(id: string, props?: unknown): void; close(id: string): void };
  panels: {
    toggle(side: "left" | "right"): void;
    show(panelId: string): void;
  };
  notify(options: ToastOptions): void;
  // Tells the shell which colour scheme the window uses, so native menus and dialogs match it
  // (desktop). The page itself follows the `.dark` class on <html>.
  setColorScheme(scheme: "light" | "dark" | "system"): void;
  // An in-app dialog (not the browser's or the OS's). Resolves false on Cancel or Escape; requests
  // made while one is open wait their turn.
  confirm(options: ConfirmOptions): Promise<boolean>;
  // Saves the file behind a hosted export or backup link where the person picks, streamed to
  // disk: a save dialog on the desktop; in a browser its own download (LYD-380).
  download(options: DownloadOptions): Promise<DownloadResult>;
  editor: EditorFacilities;
  // System-wide shortcuts the shell owns (desktop only; absent elsewhere). The quick-capture
  // accelerator uses Electron's syntax ("CommandOrControl+Shift+Space"), null when off.
  shortcuts?: {
    quickCapture(): Promise<string | null>;
    // Resolves false (keeping the current one) when the system or another app holds it.
    setQuickCapture(accelerator: string | null): Promise<boolean>;
  };
  // The app lock (desktop only; absent elsewhere): a PIN or password, and Touch ID, before the app
  // shows anything. The lock screen itself is the shell's.
  appLock?: AppLock;
  // Privacy mode (desktop only; absent elsewhere): keeps the app's windows out of screenshots,
  // screen recordings, screen sharing and window previews. `supported` is false on Linux.
  screenCapture?: {
    state(): Promise<{ blocked: boolean; supported: boolean }>;
    setBlocked(blocked: boolean): Promise<void>;
  };
  // Per-device key/value storage for plugin preferences and usage stats (JSON values).
  storage: {
    get<T>(key: string): T | null;
    set(key: string, value: unknown): void;
    // Called after `set` changes `key` in this window.
    subscribe?: (key: string, listener: () => void) => () => void;
  };
  // What the composition root offers besides the backend (account, collab, folder settings, …).
  readonly services?: HostServices;
  // The built-in plugins and whether each is on (per device; changes apply on reopen).
  readonly plugins?: PluginsApi;
};

// ---- Plugins

export type PluginContext = {
  readonly plugin: { id: string; name: string };
  readonly app: AppApi;
  commands: { register(def: CommandDef): Disposable };
  views: { register(def: ViewDef): Disposable };
  sidebar: { register(def: SidebarSectionDef): Disposable };
  panels: { register(def: PanelDef): Disposable };
  statusBar: { register(def: StatusItemDef): Disposable };
  settings: { register(def: SettingsPageDef): Disposable };
  overlays: { register(def: OverlayDef): Disposable };
  documentMenu: { register(def: DocumentMenuItemDef): Disposable };
  links: { register(def: LinkRendererDef): Disposable };
  editor: { register(def: EditorContributions): Disposable };
  documents: { register(def: DocumentSlotDef): Disposable };
  workspaceMenu: { register(def: WorkspaceMenuItemDef): Disposable };
  documentTree: { register(def: DocumentTreeDef): Disposable };
  // Sources Settings → Import and export can import from.
  importers: { register(def: ImporterDef): Disposable };
};

export type PluginDef = {
  // Lower-case kebab-case, unique.
  id: string;
  name: string;
  description?: string;
  // Cannot be turned off in Settings → Plugins.
  essential?: boolean;
  // Registers contributions. Everything registered through `ctx` is removed on deactivation; return
  // a function to clean up anything else.
  activate(ctx: PluginContext): void | Disposable;
};

export function definePlugin(def: PluginDef): PluginDef {
  if (!/^[a-z][a-z0-9-]*$/.test(def.id)) {
    throw new Error(`Plugin ids are lower-case kebab-case: ${def.id}`);
  }
  return def;
}

// Contribution kinds, keyed for the host's registry and `useContributions`.
export type Contributions = {
  command: CommandDef;
  view: ViewDef;
  sidebar: SidebarSectionDef;
  panel: PanelDef;
  statusBar: StatusItemDef;
  settings: SettingsPageDef;
  overlay: OverlayDef;
  documentMenu: DocumentMenuItemDef;
  link: LinkRendererDef;
  editor: EditorContributions;
  documentSlot: DocumentSlotDef;
  workspaceMenu: WorkspaceMenuItemDef;
  documentTree: DocumentTreeDef;
  importer: ImporterDef;
};

export type ContributionKind = keyof Contributions;

// A contribution with the plugin that made it (for error boundaries and attribution).
export type Contributed<K extends ContributionKind> = Contributions[K] & { pluginId: string };
