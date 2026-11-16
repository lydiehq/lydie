// A plugin's own view of the app: what its permissions reach, and contributions whose callbacks get
// that view whoever calls them. Least privilege among built-in plugins that share the page's
// JavaScript realm, not a security boundary (see `PluginPermission` in @lydie/plugin-api).
import { documentMenuLabel } from "@lydie/plugin-api";
import type {
  AppApi,
  CommandDef,
  ContributionKind,
  Contributions,
  DocumentMenuItemDef,
  EditorContributions,
  HostServices,
  ImporterDef,
  PluginPermission,
  SettingsPageDef,
  SidebarSectionDef,
  ViewDef,
} from "@lydie/plugin-api";

export const ALL_PERMISSIONS: readonly PluginPermission[] = [
  "account",
  "vault",
  "device",
  "plugins",
];

// Which permission reaches each service; null: every plugin. A new service has to be placed here.
export const SERVICE_PERMISSIONS: Record<keyof HostServices, PluginPermission | null> = {
  account: "account",
  renameWorkspace: "account",
  vault: "vault",
  // A document's collaborative body: every plugin reads and writes documents through the backend.
  collab: null,
  about: null,
};

export function scopeServices(
  services: HostServices | undefined,
  granted: ReadonlySet<PluginPermission>,
): HostServices | undefined {
  if (!services) return undefined;
  const scoped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(services)) {
    const needs = SERVICE_PERMISSIONS[name as keyof HostServices];
    // Unknown to the map (a composition root's extra): only for every permission, i.e. the shell.
    const allowed =
      needs === undefined
        ? granted.size === ALL_PERMISSIONS.length
        : needs === null || granted.has(needs);
    if (allowed && value !== undefined) scoped[name] = value;
  }
  return scoped as HostServices;
}

// Runs an action a person started (a menu item, a button): a failure is a toast, not an uncaught
// error in an event handler that nobody sees.
async function reported(app: AppApi, label: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    app.notify({
      title: `${label} failed`,
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  }
}

// The contribution as the registry keeps it: every callback that takes the app gets `app`, the
// contributing plugin's, so a command run from the palette, a document menu item run from another
// plugin's list and an importer run by the settings page all act as the plugin that made them.
export function scopeContribution<K extends ContributionKind>(
  kind: K,
  def: Contributions[K],
  app: AppApi,
): Contributions[K] {
  return scoped(kind, def, app) as Contributions[K];
}

function scoped(kind: ContributionKind, def: unknown, app: AppApi): unknown {
  switch (kind) {
    case "command": {
      const command = def as CommandDef;
      const { when, paletteTitle, choices } = command;
      const result: CommandDef = {
        ...command,
        run: (context) => command.run({ ...context, app }),
        ...(when ? { when: () => when(app) } : {}),
        ...(paletteTitle ? { paletteTitle: () => paletteTitle(app) } : {}),
        ...(choices ? { choices: { ...choices, list: (query) => choices.list(query, app) } } : {}),
      };
      return result;
    }
    case "view": {
      const view = def as ViewDef;
      const { preload } = view;
      if (!preload) return def;
      return { ...view, preload: (path) => preload(path, app) } satisfies ViewDef;
    }
    case "sidebar": {
      const section = def as SidebarSectionDef;
      if (!section.actions) return def;
      return {
        ...section,
        actions: section.actions.map((action) => ({
          ...action,
          run: () => reported(app, action.label, () => action.run(app)),
        })),
      } satisfies SidebarSectionDef;
    }
    case "settings": {
      const page = def as SettingsPageDef;
      const { when } = page;
      if (!when) return def;
      return { ...page, when: () => when(app) } satisfies SettingsPageDef;
    }
    case "documentMenu": {
      const item = def as DocumentMenuItemDef;
      return {
        ...item,
        run: (doc) => reported(app, documentMenuLabel(item, doc), () => item.run(doc, app)),
      } satisfies DocumentMenuItemDef;
    }
    case "importer": {
      const importer = def as ImporterDef;
      return {
        ...importer,
        read: (files, options) => importer.read(files, { ...options, app }),
      } satisfies ImporterDef;
    }
    case "editor": {
      const editor = def as EditorContributions;
      if (!editor.selectionActions) return def;
      return {
        ...editor,
        selectionActions: editor.selectionActions.map((action) => ({
          ...action,
          run: (target, context) =>
            void reported(app, action.label, () => action.run(target, context)),
        })),
      } satisfies EditorContributions;
    }
    default:
      return def;
  }
}
