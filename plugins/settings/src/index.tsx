import { definePlugin, useApp } from "@lydie/plugin-api";
import {
  BrightnessRegular,
  focusRingInsetClass,
  KeyboardRegular,
  MoonRegular,
  Settings3Regular,
  SunRegular,
} from "@lydie/plugin-api/ui";
import type { ReactNode } from "react";

import { exportWorkspace } from "./export.ts";
import { parseSettingsPath, settingsPath } from "./navigation.ts";
import { AboutPage } from "./pages/About.tsx";
import { ActivityPage } from "./pages/Activity.tsx";
import { AgentsPage } from "./pages/Agents.tsx";
import { FilesAndLinksPage } from "./pages/FilesAndLinks.tsx";
import { GeneralPage } from "./pages/General.tsx";
import { ImportExportPage } from "./pages/ImportExport.tsx";
import { PluginsPage } from "./pages/Plugins.tsx";
import { ShortcutsPage } from "./pages/Shortcuts.tsx";
import { applyPreferences, DEFAULTS, PREFS } from "./preferences.ts";
import type { Theme } from "./preferences.ts";
import { SettingsShell } from "./SettingsShell.tsx";
import type { SettingsOverlayProps } from "./SettingsShell.tsx";

export { PREFS } from "./preferences.ts";
export type { SettingsOverlayProps } from "./SettingsShell.tsx";

const THEME_COMMANDS: { value: Theme; title: string; icon: ReactNode }[] = [
  { value: "light", title: "Switch to light theme", icon: <SunRegular /> },
  { value: "dark", title: "Switch to dark theme", icon: <MoonRegular /> },
  { value: "system", title: "Use system theme", icon: <BrightnessRegular /> },
];

function SettingsMenuItem({ close }: { close: () => void }) {
  const app = useApp();
  const key = app.commands().find((c) => c.id === "core.openSettings")?.keybindings[0];
  // A row of the workspace menu, like the account plugin's (WorkspaceSection.tsx): the menu is a
  // dialog of plugin sections, not a react-aria Menu, and the inset ring is not clipped by its edge.
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => {
          close();
          void app.runCommand("core.openSettings");
        }}
        className={`flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-gray-700 hover:bg-gray-950/5 ${focusRingInsetClass}`}
      >
        <span className="flex size-[18px] shrink-0 items-center justify-center text-base text-gray-500">
          <Settings3Regular />
        </span>
        <span className="grow">Settings</span>
        {key && <span className="text-xs text-gray-400">{app.formatKeybinding(key)}</span>}
      </button>
    </div>
  );
}

export const settingsPlugin = definePlugin({
  id: "settings",
  name: "Settings",
  description: "The settings window and its general pages.",
  essential: true,
  // Account and workspace pages, the folder's settings, the app lock and privacy mode, the
  // quick-capture shortcut, and turning plugins on and off.
  permissions: ["account", "vault", "device", "plugins"],
  activate(ctx) {
    const { app } = ctx;
    ctx.overlays.register({
      id: "settings",
      component: SettingsShell,
      // `settings/<page>/<path>`: the host keeps it in the address bar and opens deep links.
      url: {
        path: (props) => {
          const { page, path } = (props ?? {}) as SettingsOverlayProps;
          return settingsPath(page ?? null, path ?? null);
        },
        parse: (path): SettingsOverlayProps | null => parseSettingsPath(path),
      },
    });
    ctx.workspaceMenu.register({ id: "settings", order: 90, component: SettingsMenuItem });
    ctx.commands.register({
      id: "settings.openShortcuts",
      title: "Open keyboard shortcuts",
      icon: <KeyboardRegular />,
      group: "General",
      // Linear's ?, and Mod+/ where typing.
      keybinding: ["?", "Mod+/"],
      run: () =>
        app.overlays.open("settings", { page: "shortcuts" } satisfies SettingsOverlayProps),
    });

    for (const theme of THEME_COMMANDS) {
      ctx.commands.register({
        id: `settings.theme.${theme.value}`,
        title: theme.title,
        icon: theme.icon,
        group: "View",
        // "Toggle dark mode" is the one with a key.
        bindable: false,
        // Only the themes you are not already using.
        when: () => (app.storage.get<Theme>(PREFS.theme) ?? DEFAULTS.theme) !== theme.value,
        run: () => app.storage.set(PREFS.theme, theme.value),
      });
    }
    // Notion's Mod+Shift+L: the opposite of what shows now, so it also leaves "system".
    ctx.commands.register({
      id: "settings.theme.toggle",
      title: "Toggle dark mode",
      icon: <MoonRegular />,
      group: "View",
      keybinding: "Mod+Shift+L",
      run: () =>
        app.storage.set(
          PREFS.theme,
          document.documentElement.classList.contains("dark") ? "light" : "dark",
        ),
    });

    ctx.settings.register({
      id: "general",
      title: "General",
      order: 10,
      description: "Workspace name, appearance and the editor.",
      keywords: [
        "theme",
        "dark",
        "font",
        "spellcheck",
        "line width",
        "new note",
        "workspace name",
        "privacy",
        "screen sharing",
        "screenshots",
      ],
      component: GeneralPage,
    });
    ctx.settings.register({
      id: "shortcuts",
      title: "Keyboard shortcuts",
      order: 20,
      description: "Change the keys for any command.",
      keywords: ["keymap", "keys", "hotkeys", "bindings"],
      component: ShortcutsPage,
    });
    ctx.settings.register({
      id: "files",
      title: "Files & links",
      order: 30,
      description: "The folder this workspace is kept in, and how links are written.",
      keywords: ["folder", "vault", "excluded", "wiki links", "markdown links", "attachments"],
      // Folder windows only (desktop): cloud and browser workspaces have no folder.
      when: (app) => Boolean(app.services?.vault),
      component: FilesAndLinksPage,
    });
    ctx.settings.register({
      id: "import-export",
      title: "Import and export",
      order: 40,
      description:
        "Bring pages in from Notion and other apps, download everything as Markdown files, and keep automatic backups.",
      keywords: [
        "import",
        "notion",
        "migrate",
        "export",
        "backup",
        "download",
        "zip",
        "markdown",
        "obsidian",
      ],
      component: ImportExportPage,
    });
    ctx.settings.register({
      id: "activity",
      group: "Workspace",
      title: "Activity",
      order: 10,
      description: "What people, agents and file sync changed in this workspace.",
      keywords: ["activity", "history", "log", "audit", "changes", "agent", "session", "undo"],
      component: ActivityPage,
    });
    ctx.commands.register({
      id: "settings.export",
      title: "Export workspace",
      group: "General",
      bindable: false,
      run: () => exportWorkspace(app),
    });
    ctx.settings.register({
      id: "plugins",
      group: "App",
      title: "Plugins",
      order: 10,
      description: "Turn built-in features on or off on this device.",
      component: PluginsPage,
    });
    ctx.settings.register({
      id: "agents",
      group: "App",
      title: "Agents & API",
      order: 20,
      description: "Let agents and scripts read and change your notes.",
      keywords: ["mcp", "api", "token", "claude", "cursor"],
      component: AgentsPage,
    });
    ctx.settings.register({
      id: "about",
      group: "App",
      title: "About",
      order: 90,
      keywords: ["version", "licence", "license", "source"],
      component: AboutPage,
    });

    return applyPreferences(app);
  },
});

export default settingsPlugin;
