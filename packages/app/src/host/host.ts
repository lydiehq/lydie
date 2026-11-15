import { docIdOf, docPath, HOME_PATH, isLydieError, operations } from "@lydie/contract";
import type { AnyOperation, Layout, OperationId, TabPath, TabState } from "@lydie/contract";
import type { Platform } from "@lydie/platform";
import {
  confirmMoveToTrash,
  firesInText,
  formatKeybinding,
  isBareKey,
  isBrowserShortcut,
  keyCaps,
  keySequence,
  matchesKeybinding,
} from "@lydie/plugin-api";
import type {
  AppApi,
  Backend,
  CommandDef,
  CommandInfo,
  ContributionKind,
  Contributions,
  HostBridge,
  HostServices,
  OpenOptions,
  PluginContext,
  PluginDef,
  TabInfo,
  TabTint,
  ToastOptions,
} from "@lydie/plugin-api";
import { coreHandlers } from "@lydie/runtime";
import { activeGroup, findTab, groupsOf } from "@lydie/runtime/layout";
import type { LayoutAction, LayoutController } from "@lydie/runtime/layout";
import type { ConfirmOptions } from "@lydie/ui";

import { commandIcons } from "./command-icons.tsx";
import { createContributionRegistry } from "./contributions.ts";
import type { ContributionRegistry } from "./contributions.ts";
import { download } from "./download.ts";
import { createEditorFacilities } from "./editor-facilities.ts";
import { createKeymap } from "./keymap.ts";
import type { Keymap } from "./keymap.ts";
import { createStore, DISABLED_PLUGINS_KEY, PLUGIN_STORAGE_PREFIX } from "./stores.ts";
import type { DeviceStorage, Store } from "./stores.ts";
import { createTabPool } from "./tab-pool.ts";
import type { TabPool } from "./tab-pool.ts";
import { findView } from "./views.ts";
import { carryOnHandoff } from "./workspace-storage.ts";

export type ShellState = {
  sidebarOpen: boolean;
  sidebarWidth: number;
  panelOpen: boolean;
  panelWidth: number;
  panelId: string | null;
};

export const DEFAULT_SHELL: ShellState = {
  sidebarOpen: true,
  sidebarWidth: 260,
  panelOpen: false,
  panelWidth: 300,
  panelId: null,
};

export type Toast = ToastOptions & { id: number };

// Toasts kept at once; the toaster shows the newest three.
const MAX_TOASTS = 10;

export type OverlayState = { id: string; props: unknown } | null;

// `app.confirm` requests in the order they were made; the shell shows the first.
export type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

export type HostOptions = {
  backend: Backend;
  platform: Platform;
  plugins: readonly PluginDef[];
  layout: LayoutController;
  storage: DeviceStorage;
  // The layout window this renderer shows.
  windowId: string;
  // How many tab views stay mounted (hidden) besides the visible ones.
  poolSize?: number;
  // How long a page may stay up while the next one loads (`ViewDef.preload`). Default 150 ms.
  holdMs?: number;
  // Every built-in plugin, including turned-off ones (Settings → Plugins). Default: `plugins`.
  available?: readonly PluginDef[];
  services?: HostServices;
};

export type Host = {
  readonly app: AppApi;
  readonly bridge: HostBridge;
  readonly backend: Backend;
  readonly platform: Platform;
  readonly layout: LayoutController;
  readonly windowId: string;
  readonly contributions: ContributionRegistry;
  readonly keymap: Keymap;
  readonly pool: TabPool;
  readonly shell: Store<ShellState>;
  readonly overlay: Store<OverlayState>;
  readonly toasts: Store<readonly Toast[]>;
  readonly confirms: Store<readonly ConfirmRequest[]>;
  // What the views ask their tab to be painted with (`useSetTabTint`), by tab id.
  readonly tabTints: Store<ReadonlyMap<string, TabTint>>;
  readonly pluginErrors: Store<readonly { pluginId: string; error: Error }[]>;
  readonly mac: boolean;
  dispatch(action: LayoutAction): void;
  subscribeLayout: (listener: () => void) => () => void;
  getLayout: () => Layout;
  // In a browser tab the window has a history of its own (the address bar's): Back and Forward
  // then go through it instead of the focused tab's (`syncUrl` sets it). Returns a disposer.
  attachWindowHistory(history: { go(delta: number): void }): () => void;
  // Handles a keydown for the whole window: commands and global undo/redo. Returns true if used.
  handleKey(event: KeyboardEvent): boolean;
  tabInfo(tabId: string): TabInfo | null;
  dispose(): void;
};

// Paths of the operations that the palette can run with no more input than the context gives.
// The open document is passed as `id` only when the operation requires one: an optional `id` is a
// client-minted id for something new (doc.create, database.create), not the target.
function contextInput(op: AnyOperation, ctx: { workspaceId: string; docId: string | null }) {
  const candidate: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  if (op.input.safeParse(candidate).success) return candidate;
  if (!ctx.docId) return null;
  candidate.id = ctx.docId;
  return op.input.safeParse(candidate).success ? candidate : null;
}

// Whether a destructive operation run from the palette may go ahead. Deleting a document asks only
// when it has content (as the sidebar does); the rest ask every time.
async function confirmOperation(
  op: AnyOperation,
  title: string,
  input: Record<string, unknown>,
  app: AppApi,
): Promise<boolean> {
  if (!op.destructive) return true;
  if (op.id === "doc.delete") return confirmMoveToTrash(app, [input.id as string]);
  return app.confirm({
    message: `${title}?`,
    ...(op.undo === "inverse" ? {} : { detail: "This cannot be undone." }),
    confirmLabel: title,
    destructive: true,
  });
}

function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(
    el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"),
  );
}

// Where a bare key ("C", "G H") belongs to what has focus: dialogs, menus and lists that type to
// select or act on letters.
function inKeyedWidget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(
    el.closest(
      "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=grid], [role=combobox]",
    ),
  );
}

// How long the second key of a sequence ("G", then "H") may take.
const SEQUENCE_MS = 1500;

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);

type PressedKey = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export function createHost(options: HostOptions): Host {
  const { backend, platform, layout, storage, windowId } = options;
  const mac = platform.capabilities.os === "macos";
  const contributions = createContributionRegistry();
  const keymap = createKeymap(storage);
  const pool = createTabPool(options.poolSize ?? 8);
  const shell = createStore<ShellState>({ ...DEFAULT_SHELL, ...storage.get<ShellState>("shell") });
  shell.subscribe(() => storage.set("shell", shell.get()));
  const overlay = createStore<OverlayState>(null);
  const storageListeners = new Map<string, Set<() => void>>();
  // A hand-off takes this workspace's device settings along.
  const services = carryOnHandoff(options.services, storage, backend.info.workspaceId);
  const toasts = createStore<readonly Toast[]>([]);
  const confirms = createStore<readonly ConfirmRequest[]>([]);
  const tabTints = createStore<ReadonlyMap<string, TabTint>>(new Map());
  const pluginErrors = createStore<readonly { pluginId: string; error: Error }[]>([]);
  const closed: { path: TabPath; state: TabState; groupId: string }[] = [];
  let toastId = 0;

  const windowOf = () => {
    const state = layout.getState();
    return state.windows.find((w) => w.id === windowId) ?? state.windows[0]!;
  };
  const activeGroupOfWindow = () => {
    const w = windowOf();
    for (const group of groupsOf(w.root)) if (group.id === w.activeGroupId) return group;
    return activeGroup(layout.getState());
  };

  const tabInfo = (tabId: string): TabInfo | null => {
    const found = findTab(layout.getState(), tabId);
    if (!found) return null;
    const isActive = found.group.activeTabId === tabId;
    return {
      id: tabId,
      groupId: found.group.id,
      path: found.tab.path,
      isActive,
      isFocused: isActive && found.window.activeGroupId === found.group.id,
    };
  };

  // A navigation waiting for its page's data. Whatever the user does next replaces it.
  let held: { cancel(): void } | null = null;
  const holdMs = options.holdMs ?? 150;

  // Runs `go` once the page at `path` has what it reads, or after `holdMs`: until then the page
  // on screen stays, so a page that loads in a few ms never shows empty or half filled.
  const whenReady = (path: TabPath, go: () => void) => {
    let waiting: void | Promise<void>;
    try {
      waiting = findView(contributions.list("view"), path)?.preload?.(path, app);
    } catch {
      waiting = undefined;
    }
    if (!waiting || holdMs <= 0) return go();
    let live = true;
    const land = () => {
      if (!live) return;
      cancel();
      go();
    };
    const timer = setTimeout(land, holdMs);
    const cancel = () => {
      live = false;
      clearTimeout(timer);
      if (held === mine) held = null;
    };
    const mine = { cancel };
    held = mine;
    void waiting.then(land, land);
  };

  const dispatch = (action: LayoutAction) => {
    held?.cancel();
    if (action.type === "close") {
      const found = findTab(layout.getState(), action.tabId);
      if (found) {
        closed.push({ path: found.tab.path, state: found.tab.state, groupId: found.group.id });
        if (closed.length > 50) closed.shift();
      }
    }
    layout.dispatch(action);
  };

  // Keep the view pool in step with the layout, whoever changed it.
  let lastRoot: unknown = null;
  const syncPool = () => {
    const w = windowOf();
    const group = activeGroupOfWindow();
    if (group.activeTabId) pool.touch(group.activeTabId);
    if (w.root === lastRoot) return;
    lastRoot = w.root;
    pool.retain(new Set([...groupsOf(w.root)].flatMap((g) => g.tabs.map((t) => t.id))));
  };

  // The group after (else before) `groupId` in the window's pane order, if the window is split.
  const adjacentGroup = (groupId: string): string | null => {
    const ids = [...groupsOf(windowOf().root)].map((g) => g.id);
    const index = ids.indexOf(groupId);
    if (index === -1 || ids.length < 2) return null;
    return ids[index + 1] ?? ids[index - 1] ?? null;
  };

  const open = (path: TabPath, openOptions: OpenOptions = {}) => {
    const mode = openOptions.mode ?? "replace";
    const group = activeGroupOfWindow();
    const state = openOptions.state;
    if (mode === "split") {
      // "Open to the side" reuses the pane beside the active one (as a new tab) when there is one.
      const beside = openOptions.side ? null : adjacentGroup(group.id);
      if (beside) {
        dispatch({
          type: "open",
          path,
          groupId: beside,
          mode: "tab",
          ...(state ? { state } : {}),
        });
        return;
      }
      dispatch({
        type: "split",
        groupId: group.id,
        side: openOptions.side ?? "right",
        path,
        ...(state ? { state } : {}),
      });
      return;
    }
    // Opening what the active tab already shows just focuses it.
    const active = group.tabs.find((t) => t.id === group.activeTabId);
    if (mode === "replace" && active?.path === path) return;
    held?.cancel();
    whenReady(path, () =>
      dispatch({
        type: "open",
        path,
        groupId: group.id,
        mode,
        ...(state ? { state } : {}),
      }),
    );
  };

  const activeTab = (): TabInfo | null => {
    const group = activeGroupOfWindow();
    return group.activeTabId ? tabInfo(group.activeTabId) : null;
  };
  const activeDocId = () => docIdOf(activeTab()?.path);
  const historyScope = () => activeTab()?.id ?? `window:${windowId}`;

  // A stable TabInfo for the focused tab, recomputed when the layout changes it.
  let activeCache: { key: string; info: TabInfo | null } = { key: "", info: null };
  const activeTabStable = (): TabInfo | null => {
    const info = activeTab();
    const key = info ? `${info.id}|${info.groupId}|${info.path}` : "";
    if (key !== activeCache.key) activeCache = { key, info };
    return activeCache.info;
  };
  const subscribeActiveTab = (listener: () => void) => {
    let last = activeTabStable();
    return layout.subscribe(() => {
      const next = activeTabStable();
      if (next !== last) {
        last = next;
        listener();
      }
    });
  };

  // The toaster (`shell/Toasts.tsx`) times toasts out and removes them, since hovering pauses them.
  const notify = (toast: ToastOptions) => {
    const id = ++toastId;
    toasts.set((list) => [...list.slice(-(MAX_TOASTS - 1)), { ...toast, id }]);
  };

  // The shell's ConfirmDialog shows the first request and removes it when answered.
  const confirm = (confirmOptions: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      const request: ConfirmRequest = {
        ...confirmOptions,
        resolve: (confirmed) => {
          confirms.set((list) => list.filter((r) => r !== request));
          resolve(confirmed);
        },
      };
      confirms.set((list) => [...list, request]);
    });

  // ---- Commands

  const pluginCommands = () => contributions.list("command");

  const operationCommands = (): (CommandDef & { pluginId: string })[] => {
    const bound = new Set(pluginCommands().flatMap((c) => (c.operation ? [c.operation] : [])));
    const out: (CommandDef & { pluginId: string })[] = [];
    for (const op of Object.values(operations) as AnyOperation[]) {
      const meta = op.ui?.commandPalette;
      if (!meta || bound.has(op.id as OperationId) || op.kind !== "mutation") continue;
      // The contract can be ahead of the runtime while a feature is being built.
      if (!(op.id in coreHandlers)) continue;
      const needsDoc = !op.input.safeParse({ workspaceId: backend.info.workspaceId }).success;
      out.push({
        pluginId: "core",
        id: `op.${op.id}`,
        title: meta.title,
        ...(meta.group ? { group: meta.group } : {}),
        ...(meta.bindable === false ? { bindable: false } : {}),
        ...(needsDoc ? { scope: "document" as const } : {}),
        operation: op.id as OperationId,
        when: () =>
          contextInput(op, { workspaceId: backend.info.workspaceId, docId: activeDocId() }) !==
          null,
        async run({ app: api }) {
          const input = contextInput(op, {
            workspaceId: backend.info.workspaceId,
            docId: activeDocId(),
          });
          if (!input) return;
          if (!(await confirmOperation(op, meta.title, input, api))) return;
          const result = (await backend.execute(op.id as OperationId, input as never, {
            scope: historyScope(),
          })) as { id?: string } | undefined;
          if (op.id === "doc.create" && result?.id) api.openDoc(result.id);
        },
      });
    }
    return out;
  };

  const allCommands = () => [...pluginCommands(), ...operationCommands()];

  // In a browser tab the browser's own shortcuts (new tab, reload, developer tools…) stay the
  // browser's: such a binding never fires there, so it is not shown either.
  const browserTab = Boolean(platform.capabilities.browserTab);
  const activeBindings = (bindings: readonly string[]): string[] =>
    browserTab ? bindings.filter((b) => !isBrowserShortcut(b, mac)) : [...bindings];

  const commandInfo = (command: CommandDef & { pluginId: string }): CommandInfo => {
    const enabled = command.when ? command.when(app) : true;
    return {
      id: command.id,
      title: command.title,
      group: command.group ?? null,
      icon: command.icon ?? commandIcons[command.id],
      keybindings: activeBindings(keymap.bindings(command.id, command.keybinding)),
      bindable: command.bindable ?? true,
      source: command.pluginId === "core" && command.id.startsWith("op.") ? "operation" : "plugin",
      scope: command.scope ?? null,
      enabled,
      ...(enabled && command.paletteTitle ? { paletteTitle: command.paletteTitle(app) } : {}),
      ...(command.choices ? { choices: command.choices } : {}),
    };
  };

  const runCommand = async (
    id: string,
    args?: unknown,
    source: "palette" | "keybinding" | "menu" | "api" = "api",
  ) => {
    const command = allCommands().find((c) => c.id === id);
    if (!command) throw new Error(`Unknown command: ${id}`);
    if (command.when && !command.when(app)) return;
    try {
      await command.run({ app, source, args });
    } catch (error) {
      notify({
        title: `${command.title} failed`,
        description: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    }
  };

  const app: AppApi = {
    backend,
    workspace: backend.info,
    open,
    openDoc: (id, openOptions) => open(docPath(id), openOptions),
    modeFor: (gesture, context = "read") => {
      const mod = Boolean(mac ? gesture.metaKey : gesture.ctrlKey);
      if (gesture.button === 1) return "tab";
      if (mod && gesture.altKey) return "split";
      if (mod && gesture.shiftKey) return "tab";
      if (mod) return context === "edit" ? "replace" : "tab";
      return "replace";
    },
    activeTab: activeTabStable,
    subscribeActiveTab,
    setTabState: (tabId, state) => layout.dispatch({ type: "setTabState", tabId, state }),
    historyScope,
    runCommand: (id, args) => runCommand(id, args, "api"),
    formatKeybinding: (binding) => formatKeybinding(binding, mac),
    keyCaps: (binding) => keyCaps(binding, mac),
    keybindings: (id) => {
      const command =
        pluginCommands().find((c) => c.id === id) ?? operationCommands().find((c) => c.id === id);
      return command ? activeBindings(keymap.bindings(command.id, command.keybinding)) : [];
    },
    keymap: {
      set: (id, bindings) => keymap.set(id, bindings),
      subscribe: (l) => keymap.subscribe(l),
    },
    commands: () =>
      allCommands()
        .filter((c) => !c.hidden)
        .map(commandInfo),
    overlays: {
      open: (id, props) => overlay.set({ id, props }),
      close: (id) => overlay.set((current) => (current?.id === id ? null : current)),
    },
    panels: {
      toggle(side) {
        shell.set((s) =>
          side === "left"
            ? { ...s, sidebarOpen: !s.sidebarOpen }
            : { ...s, panelOpen: !s.panelOpen },
        );
      },
      show(panelId) {
        shell.set((s) => ({ ...s, panelOpen: true, panelId }));
      },
    },
    notify,
    setColorScheme: (scheme) => platform.setColorScheme?.(scheme),
    confirm,
    download: (options) => download(platform, options),
    editor: createEditorFacilities(contributions),
    ...(platform.shortcuts
      ? {
          shortcuts: {
            quickCapture: () => platform.shortcuts!.quickCapture(),
            setQuickCapture: (accelerator: string | null) =>
              platform.shortcuts!.setQuickCapture(accelerator),
          },
        }
      : {}),
    ...(platform.appLock ? { appLock: platform.appLock } : {}),
    ...(platform.screenCapture
      ? {
          screenCapture: {
            state: () => platform.screenCapture!.state(),
            setBlocked: (blocked: boolean) => platform.screenCapture!.setBlocked(blocked),
          },
        }
      : {}),
    storage: {
      get: <T>(key: string) => storage.get<T>(`${PLUGIN_STORAGE_PREFIX}${key}`),
      set: (key, value) => {
        storage.set(`${PLUGIN_STORAGE_PREFIX}${key}`, value);
        for (const listener of [...(storageListeners.get(key) ?? [])]) listener();
      },
      subscribe: (key, listener) => {
        let set = storageListeners.get(key);
        if (!set) storageListeners.set(key, (set = new Set()));
        set.add(listener);
        return () => set.delete(listener);
      },
    },
    ...(services ? { services } : {}),
    plugins: {
      list: () => {
        const disabled = new Set(storage.get<string[]>(DISABLED_PLUGINS_KEY) ?? []);
        return (options.available ?? options.plugins)
          .filter((p) => p.id !== "core")
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? null,
            enabled: Boolean(p.essential) || !disabled.has(p.id),
            essential: Boolean(p.essential),
          }));
      },
      setEnabled: (id, enabled) => {
        const disabled = new Set(storage.get<string[]>(DISABLED_PLUGINS_KEY) ?? []);
        if (enabled) disabled.delete(id);
        else disabled.add(id);
        storage.set(DISABLED_PLUGINS_KEY, [...disabled]);
      },
    },
  };

  const bridge: HostBridge = {
    app,
    contributions: {
      list: (kind) => contributions.list(kind),
      subscribe: (kind, listener) => contributions.subscribe(kind, listener),
    },
    tabs: {
      get: (tabId) => layout.getTab(tabId),
      subscribe: (tabId, listener) => layout.subscribeTab(tabId, listener),
      setState: (tabId, state) => layout.dispatch({ type: "setTabState", tabId, state }),
      setTint: (tabId, tint) =>
        tabTints.set((previous) => {
          const current = previous.get(tabId);
          if (current?.color === tint?.color && current?.tone === tint?.tone) return previous;
          const next = new Map(previous);
          if (tint) next.set(tabId, tint);
          else next.delete(tabId);
          return next;
        }),
    },
  };

  // ---- Core commands (layout and history; they are the shell, not features)

  // The app lock's state, for "Lock Lydie" (shown only while a lock is set up).
  let appLockEnabled = false;
  if (platform.appLock) void platform.appLock.state().then((s) => (appLockEnabled = s.enabled));

  const coreCommands: CommandDef[] = [
    {
      id: "core.palette",
      title: "Command palette",
      group: "General",
      keybinding: ["Mod+K", "Mod+Shift+P"],
      hidden: true,
      run: () =>
        overlay.set((o) => (o?.id === "core.palette" ? null : { id: "core.palette", props: null })),
    },
    {
      id: "core.undo",
      title: "Undo",
      group: "Edit",
      keybinding: "Mod+Z",
      inText: false,
      run: () => runHistory("undo"),
    },
    {
      id: "core.redo",
      title: "Redo",
      group: "Edit",
      keybinding: ["Mod+Shift+Z", "Mod+Y"],
      inText: false,
      run: () => runHistory("redo"),
    },
    {
      id: "core.toggleSidebar",
      title: "Toggle sidebar",
      group: "View",
      keybinding: "Mod+Alt+[",
      run: () => app.panels.toggle("left"),
    },
    {
      id: "core.togglePanel",
      title: "Toggle right panel",
      group: "View",
      keybinding: "Mod+Alt+]",
      run: () => app.panels.toggle("right"),
    },
    {
      id: "core.newTab",
      title: "New tab",
      group: "Tabs",
      keybinding: "Mod+T",
      run: () => open(HOME_PATH, { mode: "tab" }),
    },
    {
      id: "core.closeTab",
      title: "Close tab",
      group: "Tabs",
      keybinding: "Mod+W",
      when: () => activeTab() !== null,
      run: () => {
        const tab = activeTab();
        if (tab) dispatch({ type: "close", tabId: tab.id });
      },
    },
    {
      id: "core.closeOtherTabs",
      title: "Close other tabs",
      group: "Tabs",
      when: () => activeTab() !== null,
      run: () => {
        const tab = activeTab();
        if (tab) dispatch({ type: "closeOthers", tabId: tab.id });
      },
    },
    {
      id: "core.reopenTab",
      title: "Reopen closed tab",
      group: "Tabs",
      keybinding: "Mod+Shift+T",
      when: () => closed.length > 0,
      run: () => {
        const last = closed.pop();
        if (last) open(last.path, { mode: "tab", state: last.state });
      },
    },
    {
      id: "core.pinTab",
      title: "Pin or unpin tab",
      group: "Tabs",
      when: () => activeTab() !== null,
      run: () => {
        const tab = activeTab();
        if (!tab) return;
        const pinned = layout.getTab(tab.id)?.pinned ?? false;
        dispatch({ type: "pin", tabId: tab.id, pinned: !pinned });
      },
    },
    {
      id: "core.nextTab",
      title: "Next tab",
      group: "Tabs",
      keybinding: ["Ctrl+Tab", "Mod+Shift+]"],
      run: () => cycle(1),
    },
    {
      id: "core.previousTab",
      title: "Previous tab",
      group: "Tabs",
      keybinding: ["Ctrl+Shift+Tab", "Mod+Shift+["],
      run: () => cycle(-1),
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `core.tab${i + 1}`,
      title: i === 8 ? "Go to last tab" : `Go to tab ${i + 1}`,
      group: "Tabs",
      keybinding: `Mod+${i + 1}`,
      hidden: true,
      run: () => {
        const group = activeGroupOfWindow();
        const tab = i === 8 ? group.tabs.at(-1) : group.tabs[i];
        if (tab) dispatch({ type: "activate", tabId: tab.id });
      },
    })),
    {
      id: "core.splitRight",
      title: "Split right",
      group: "Tabs",
      keybinding: "Mod+\\",
      run: () => split("right"),
    },
    {
      id: "core.splitDown",
      title: "Split down",
      group: "Tabs",
      keybinding: "Mod+Shift+\\",
      run: () => split("down"),
    },
    {
      id: "core.back",
      title: "Go back",
      group: "Navigation",
      keybinding: "Mod+[",
      when: () => windowHistory !== null || (activeTabState()?.back.length ?? 0) > 0,
      run: () => travel(-1),
    },
    {
      id: "core.forward",
      title: "Go forward",
      group: "Navigation",
      keybinding: "Mod+]",
      when: () => windowHistory !== null || (activeTabState()?.forward.length ?? 0) > 0,
      run: () => travel(1),
    },
    {
      id: "core.lockApp",
      title: "Lock Lydie",
      group: "General",
      when: () => appLockEnabled,
      run: () => void platform.appLock?.lock(),
    },
    {
      id: "core.openSettings",
      title: "Open settings",
      group: "General",
      // Linear's G then S as well: a browser tab on macOS leaves Mod+, to the browser.
      keybinding: ["Mod+,", "G S"],
      // The settings plugin's overlay.
      when: () => contributions.list("overlay").some((o) => o.id === "settings"),
      run: () => overlay.set({ id: "settings", props: null }),
    },
  ];

  let windowHistory: { go(delta: number): void } | null = null;

  function travel(delta: -1 | 1) {
    if (windowHistory) return windowHistory.go(delta);
    const tab = activeTab();
    if (tab) dispatch({ type: delta < 0 ? "back" : "forward", tabId: tab.id });
  }

  function activeTabState() {
    const tab = activeTab();
    return tab ? layout.getTab(tab.id) : null;
  }

  function cycle(step: number) {
    const group = activeGroupOfWindow();
    if (group.tabs.length < 2) return;
    const index = group.tabs.findIndex((t) => t.id === group.activeTabId);
    const next = group.tabs[(index + step + group.tabs.length) % group.tabs.length]!;
    dispatch({ type: "activate", tabId: next.id });
  }

  function split(side: "right" | "down") {
    const group = activeGroupOfWindow();
    const tab = group.tabs.find((t) => t.id === group.activeTabId);
    dispatch({
      type: "split",
      groupId: group.id,
      side,
      path: tab?.path ?? HOME_PATH,
    });
  }

  async function runHistory(direction: "undo" | "redo") {
    const scope = historyScope();
    try {
      const done = await backend.history[direction](scope);
      if (!done) notify({ title: direction === "undo" ? "Nothing to undo" : "Nothing to redo" });
    } catch (error) {
      // The runtime's message only says the step no longer applies; the cause says why.
      const cause = isLydieError(error)
        ? (error.details as { cause?: unknown } | undefined)?.cause
        : undefined;
      const message = error instanceof Error ? error.message : String(error);
      notify({
        title: direction === "undo" ? "Could not undo" : "Could not redo",
        description: typeof cause === "string" && cause ? `${message}. ${cause}` : message,
        kind: "error",
      });
    }
  }

  const disposers: (() => void)[] = [];
  if (platform.appLock) {
    disposers.push(platform.appLock.onChange((state) => (appLockEnabled = state.enabled)));
  }
  for (const command of coreCommands) disposers.push(contributions.add("command", "core", command));

  // ---- Plugins

  for (const plugin of options.plugins) {
    const register =
      <K extends ContributionKind>(kind: K) =>
      (def: Contributions[K]) => {
        const off = contributions.add(kind, plugin.id, def);
        disposers.push(off);
        return off;
      };
    const ctx: PluginContext = {
      plugin: { id: plugin.id, name: plugin.name },
      app,
      commands: { register: register("command") },
      views: { register: register("view") },
      sidebar: { register: register("sidebar") },
      panels: { register: register("panel") },
      statusBar: { register: register("statusBar") },
      settings: { register: register("settings") },
      overlays: { register: register("overlay") },
      documentMenu: { register: register("documentMenu") },
      links: { register: register("link") },
      editor: { register: register("editor") },
      workspaceMenu: { register: register("workspaceMenu") },
      documents: { register: register("documentSlot") },
      documentTree: { register: register("documentTree") },
      importers: { register: register("importer") },
    };
    try {
      const cleanup = plugin.activate(ctx);
      if (typeof cleanup === "function") disposers.push(cleanup);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Plugin ${plugin.id} failed to activate`, err);
      pluginErrors.set((list) => [...list, { pluginId: plugin.id, error: err }]);
    }
  }

  // Seed the pool with what is visible.
  for (const group of groupsOf(windowOf().root))
    if (group.activeTabId) pool.touch(group.activeTabId);
  syncPool();
  disposers.push(layout.subscribe(syncPool));

  // ---- Documents that go to the trash
  // Every document a tab of this window shows is watched (one row, no body). When one that was live
  // goes to the trash, from here or elsewhere, its tabs go back, else to its parent, else to a new
  // tab page. A document opened from the trash was never live here, so it stays, with its banner.
  // A page reached that way may have been trashed with it (deleting a folder): it is left too.
  const watched = new Map<string, { off: () => void; check: () => void; live: boolean }>();
  const landed = new Set<string>();
  let watchedRoot: unknown = null;

  const leave = async (id: string, parentId: string | null) => {
    const parent = parentId
      ? (await backend.query("doc.get", { id: parentId }).catch(() => []))[0]
      : undefined;
    // Restored meanwhile (undo).
    if (!watched.get(id) || watched.get(id)!.live) return;
    const fallback = parent && !parent.document.deletedAt ? docPath(parent.document.id) : HOME_PATH;
    const showing = () =>
      [...groupsOf(windowOf().root)].flatMap((g) =>
        g.tabs.filter((t) => docIdOf(t.path) === id).map((t) => t.id),
      );
    const tabIds = showing();
    layout.dispatch({ type: "leaveDocs", ids: [id], fallback: { [id]: fallback }, windowId });
    syncWatched();
    for (const tabId of tabIds) {
      const landedOn = docIdOf(layout.getTab(tabId)?.path);
      if (!landedOn) continue;
      landed.add(landedOn);
      watched.get(landedOn)?.check();
    }
  };

  const watch = (id: string) => {
    const handle = backend.live("doc.get", { id });
    const entry = { off: () => {}, check: () => {}, live: false };
    const check = () => {
      const row = handle.getSnapshot().data[0];
      if (!row) return;
      if (!row.document.deletedAt) {
        entry.live = true;
        landed.delete(id);
      } else if (entry.live || landed.has(id)) {
        entry.live = false;
        landed.delete(id);
        void leave(id, row.document.parentId);
      }
    };
    watched.set(id, entry);
    entry.check = check;
    entry.off = handle.subscribe(check);
    check();
  };

  function syncWatched() {
    const root = windowOf().root;
    if (root === watchedRoot) return;
    watchedRoot = root;
    const ids = new Set<string>();
    for (const group of groupsOf(root))
      for (const tab of group.tabs) {
        const id = docIdOf(tab.path);
        if (id) ids.add(id);
      }
    for (const [id, entry] of watched) {
      if (ids.has(id)) continue;
      entry.off();
      watched.delete(id);
      landed.delete(id);
    }
    for (const id of ids) if (!watched.has(id)) watch(id);
  }
  syncWatched();
  disposers.push(layout.subscribe(syncWatched), () => {
    for (const entry of watched.values()) entry.off();
    watched.clear();
  });

  // The first keys of a sequence pressed so far ("G" of "G H"), and when the last one was.
  let pending: { keys: PressedKey[]; at: number } | null = null;

  const handleKey = (event: KeyboardEvent): boolean => {
    if (event.isComposing || MODIFIER_KEYS.has(event.key)) return false;
    const prefix = pending && Date.now() - pending.at < SEQUENCE_MS ? pending.keys : [];
    pending = null;
    // A confirm is modal, as window.confirm was: no commands until it is answered.
    if (confirms.get().length > 0) return false;
    if (browserTab && isBrowserShortcut(event, mac)) return false;
    const inText = inTextField(event.target);
    // Bare keys type, select in lists or act in dialogs; held down they would repeat.
    const bareBlocked =
      inText || event.repeat || overlay.get() !== null || inKeyedWidget(event.target);
    const pressed: PressedKey = {
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };
    // A key that continues a sequence wins; otherwise it is read on its own.
    for (const keys of prefix.length ? [[...prefix, pressed], [pressed]] : [[pressed]]) {
      let started = false;
      for (const command of allCommands()) {
        for (const binding of keymap.bindings(command.id, command.keybinding)) {
          const steps = keySequence(binding);
          if (steps.length < keys.length) continue;
          if (!keys.every((key, i) => matchesKeybinding(key, steps[i]!, mac))) continue;
          if (isBareKey(binding) && bareBlocked) continue;
          const allowed = command.inText ?? firesInText(binding);
          // Undo/redo inside a text field belong to the field (ProseMirror history, native undo).
          if (inText && !allowed) return false;
          if (event.defaultPrevented) return false;
          if (command.when && !command.when(app)) continue;
          if (steps.length > keys.length) {
            started = true;
            continue;
          }
          event.preventDefault();
          void runCommand(command.id, undefined, "keybinding");
          return true;
        }
      }
      if (started) {
        pending = { keys, at: Date.now() };
        event.preventDefault();
        return true;
      }
    }
    return false;
  };

  return {
    app,
    bridge,
    backend,
    platform,
    layout,
    windowId,
    contributions,
    keymap,
    pool,
    shell,
    overlay,
    toasts,
    confirms,
    tabTints,
    pluginErrors,
    mac,
    dispatch,
    subscribeLayout: (listener) => layout.subscribe(listener),
    getLayout: () => layout.getState(),
    attachWindowHistory(history) {
      windowHistory = history;
      return () => {
        if (windowHistory === history) windowHistory = null;
      };
    },
    handleKey,
    tabInfo,
    dispose() {
      held?.cancel();
      for (const off of disposers.splice(0).reverse()) off();
      for (const request of confirms.get()) request.resolve(false);
    },
  };
}
