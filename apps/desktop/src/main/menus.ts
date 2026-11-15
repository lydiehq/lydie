import type { MenuItem } from "@lydie/platform";
import { app, Menu } from "electron";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

import type { WindowContext } from "./windows.ts";

const isMac = process.platform === "darwin";

export function toElectronMenu(
  items: MenuItem[],
  onClick: (id: string) => void,
): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    if (item.type === "separator") return { type: "separator" };
    const id = item.id;
    return {
      type: item.submenu ? "submenu" : (item.type ?? "normal"),
      label: item.label,
      role: item.role,
      accelerator: item.accelerator,
      enabled: item.enabled,
      checked: item.checked,
      submenu: item.submenu ? toElectronMenu(item.submenu, onClick) : undefined,
      click: id && !item.role ? () => onClick(id) : undefined,
    };
  });
}

type DefaultMenuActions = {
  openFolder: () => void;
  newWindow: () => void;
  openDiagnostics?: () => void;
};

// The menu until a page sets its own: standard roles plus the few actions the shell owns.
export function defaultMenu(actions: DefaultMenuActions): MenuItemConstructorOptions[] {
  const file: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      { label: "New Window", accelerator: "CmdOrCtrl+Shift+N", click: actions.newWindow },
      { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: actions.openFolder },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  };
  const developer: MenuItemConstructorOptions[] = actions.openDiagnostics
    ? [
        {
          label: "Developer",
          submenu: [
            { label: "Platform Diagnostics", click: actions.openDiagnostics },
            { role: "toggleDevTools" },
            // Mod+R is the table's "fill right" (as in Notion), so reload is Mod+Shift+R.
            { role: "reload", accelerator: "CmdOrCtrl+Shift+R" },
          ],
        },
      ]
    : [];
  // The standard View menu without Reload: its Mod+R belongs to the page.
  const view: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      ...(developer.length ? [] : [{ role: "toggleDevTools" } as const]),
    ],
  };
  return [
    ...(isMac ? [{ role: "appMenu" } as const] : []),
    file,
    { role: "editMenu" },
    view,
    { role: "windowMenu" },
    ...developer,
  ];
}

export function applyMenu(
  context: WindowContext | undefined,
  fallback: MenuItemConstructorOptions[],
  onAction: (context: WindowContext, id: string) => void,
) {
  const template = context?.menu
    ? toElectronMenu(context.menu, (id) => onAction(context, id))
    : fallback;
  const menu = Menu.buildFromTemplate(template);
  if (isMac) Menu.setApplicationMenu(menu);
  else context?.win.setMenu(menu);
}

// Shows a context menu and resolves the chosen item's id, or null when dismissed.
export function popupMenu(
  win: BrowserWindow,
  items: MenuItem[],
  position?: { x: number; y: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    let chosen: string | null = null;
    const menu = Menu.buildFromTemplate(
      toElectronMenu(items, (id) => {
        chosen = id;
        resolve(id);
      }),
    );
    menu.popup({
      window: win,
      ...position,
      // On macOS the close callback runs before the click handler; let the click land first.
      callback: () => setTimeout(() => resolve(chosen), 0),
    });
  });
}

// Spelling suggestions and edit actions for editable fields the page did not handle itself
// (a page that calls preventDefault() on `contextmenu` never reaches this).
export function attachEditContextMenu(win: BrowserWindow) {
  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const template: MenuItemConstructorOptions[] = [];
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      template.push({
        label: suggestion,
        click: () => win.webContents.replaceMisspelling(suggestion),
      });
    }
    if (params.misspelledWord) {
      template.push(
        {
          label: "Add to Dictionary",
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: "separator" },
      );
    }
    if (params.isEditable) template.push({ role: "cut" });
    template.push({ role: "copy" });
    if (params.isEditable) template.push({ role: "paste" }, { role: "selectAll" });
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

export function setDockMenu(newWindow: () => void) {
  if (isMac) app.dock?.setMenu(Menu.buildFromTemplate([{ label: "New Window", click: newWindow }]));
}
