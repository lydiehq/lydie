// Moving documents to the trash asks first only when there is something to lose. An empty page
// goes without a question: the trash and undo bring it back anyway.
import type { Backend } from "./backend.ts";
import type { AppApi } from "./plugin.ts";

// A body with text, documents inside, or a database (its schema and views count even without rows).
export async function hasContent(backend: Pick<Backend, "query">, id: string): Promise<boolean> {
  return (await inspect(backend, id)).content;
}

async function inspect(backend: Pick<Backend, "query">, id: string) {
  const [row] = await backend.query("doc.get", { id, includeBody: true });
  if (!row) return { title: "", content: false };
  const { title, workspaceId } = row.document;
  if (row.body?.markdown.trim()) return { title, content: true };
  const [children, database] = await Promise.all([
    backend.query("doc.children", { workspaceId, parentId: id }),
    backend.query("database.get", { id }),
  ]);
  return { title, content: children.length > 0 || database.length > 0 };
}

// Resolves true when the documents may go to the trash: none has content, or the person agreed.
// `total` counts every document that goes (with a selection's subtrees); default `ids.length`.
export async function confirmMoveToTrash(
  app: Pick<AppApi, "backend" | "confirm" | "formatKeybinding">,
  ids: readonly string[],
  total = ids.length,
): Promise<boolean> {
  if (ids.length === 0) return false;
  const docs = await Promise.all(ids.map((id) => inspect(app.backend, id)));
  if (!docs.some((d) => d.content)) return true;
  const single = total === 1;
  return app.confirm({
    message: single
      ? `Move “${docs[0]!.title.trim() || "Untitled"}” to the trash?`
      : `Move ${total} documents to the trash?`,
    detail: `You can restore ${single ? "it" : "them"} from the trash, or undo with ${app.formatKeybinding("Mod+Z")}.`,
    confirmLabel: "Move to trash",
    destructive: true,
  });
}
