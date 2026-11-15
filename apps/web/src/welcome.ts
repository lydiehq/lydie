// The Getting started page a new workspace opens on (LYD-313). Local workspaces create it while
// the window composes; a new hosted workspace gets it on the server, and the window that asked for
// it opens it after reopening on that workspace (`rememberWelcome` → `takeWelcome`), once synced.
import type { Host } from "@lydie/app";
import { gettingStartedId } from "@lydie/contract";
import { docIdOf } from "@lydie/plugin-api";

const KEY = "lydie:welcome:";
// Long enough for a first sync on a slow connection; after that the user has moved on.
const WAIT_MS = 60_000;

// localStorage, not sessionStorage: on desktop a folder window opens the new workspace in another
// window.
export function rememberWelcome(workspaceId: string): void {
  try {
    localStorage.setItem(KEY + workspaceId, gettingStartedId(workspaceId));
  } catch {
    // Storage is off: the workspace opens on the home page, which links to the page.
  }
}

export function takeWelcome(workspaceId: string): string | null {
  try {
    const id = localStorage.getItem(KEY + workspaceId);
    if (id) localStorage.removeItem(KEY + workspaceId);
    return id;
  } catch {
    return null;
  }
}

// Opens the page now if it is here, else as soon as sync brings it, unless the user opened a
// document in the meantime.
export function openWelcome(host: Host, id: string): void {
  const { app } = host;
  const live = app.backend.live("doc.get", { id, includeBody: false });
  let done = false;
  let unsubscribe = () => {};
  const finish = () => {
    done = true;
    unsubscribe();
    clearTimeout(timer);
  };
  const check = () => {
    if (done) return;
    const row = live.getSnapshot().data[0] as
      | { document?: { deletedAt: string | null } }
      | undefined;
    if (!row?.document) return;
    finish();
    if (row.document.deletedAt) return;
    if (docIdOf(app.activeTab()?.path) !== null) return;
    app.openDoc(id);
  };
  const timer = setTimeout(finish, WAIT_MS);
  unsubscribe = live.subscribe(check);
  check();
}
