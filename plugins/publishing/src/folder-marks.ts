// Connected folders in the tree: a publication whose root stands for the place itself (`folder`)
// gives its root document the destination's icon, wherever a document icon is drawn, and marks
// the folder's pages, whose frontmatter is the destination's files' own.
import { setConnectedPages, setDocumentMarks } from "@lydie/plugin-api";
import type { AppApi, DocumentMark } from "@lydie/plugin-api";
import type { Publication } from "@lydie/plugin-api/hosted";

const OWNER = "publishing";
const NAMES: Record<string, string> = { github: "GitHub", wordpress: "WordPress" };

function markOf(publication: Publication): DocumentMark {
  return {
    connector: publication.connector,
    label: `Connected to ${NAMES[publication.connector] ?? publication.connector}`,
  };
}

export function folderMarks(publications: readonly Publication[]): Map<string, DocumentMark> {
  const marks = new Map<string, DocumentMark>();
  for (const publication of publications) {
    if (publication.folder) marks.set(publication.documentId, markOf(publication));
  }
  return marks;
}

// The pages a connected folder keeps in step (its items), not the root.
export function pageMarks(publications: readonly Publication[]): Map<string, DocumentMark> {
  const marks = new Map<string, DocumentMark>();
  for (const publication of publications) {
    if (!publication.folder) continue;
    for (const item of publication.items) {
      if (item.documentId !== publication.documentId)
        marks.set(item.documentId, markOf(publication));
    }
  }
  return marks;
}

let refresh: (() => Promise<void>) | null = null;

// After something that may add or remove a connected folder (the publish panel calls it).
export function refreshFolderMarks(): void {
  void refresh?.();
}

// Keeps the marks in step with the workspace's publications while the window is hosted. They are
// the server's (publications are not synced rows), so: now, when the window gets focus, and every
// minute.
export function watchFolderMarks(app: AppApi): () => void {
  const account = app.services?.account;
  if (!account || account.scope.kind !== "hosted") return () => {};
  let stopped = false;
  refresh = async () => {
    try {
      const { publications } = await account.call("publication.list", {
        workspaceId: app.workspace.workspaceId,
      });
      if (stopped) return;
      setDocumentMarks(OWNER, folderMarks(publications));
      setConnectedPages(OWNER, pageMarks(publications));
    } catch {
      // Signed out or offline: the marks stay as they were.
    }
  };
  void refresh();
  const timer = setInterval(refreshFolderMarks, 60_000);
  window.addEventListener("focus", refreshFolderMarks);
  return () => {
    stopped = true;
    refresh = null;
    clearInterval(timer);
    window.removeEventListener("focus", refreshFolderMarks);
    setDocumentMarks(OWNER, new Map());
    setConnectedPages(OWNER, new Map());
  };
}
