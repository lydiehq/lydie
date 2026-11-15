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

type TrashApp = Pick<AppApi, "backend" | "confirm" | "formatKeybinding" | "notify">;

// "Move to trash" in a document menu (the sidebar's tree, Home): asks first when one has content,
// moves them in one step (one undo), then says so with an Undo that restores them. `docs` are the
// topmost documents (subtrees go along); `total` counts them all. Resolves whether they went;
// failures are said, not thrown.
export async function moveToTrash(
  app: TrashApp,
  docs: readonly { id: string; title: string }[],
  { total = docs.length, scope }: { total?: number; scope: string },
): Promise<boolean> {
  const [only] = docs;
  if (!only) return false;
  const single = total === 1;
  try {
    if (
      !(await confirmMoveToTrash(
        app,
        docs.map((d) => d.id),
        total,
      ))
    )
      return false;
    if (docs.length === 1) await app.backend.execute("doc.delete", { id: only.id }, { scope });
    else {
      await app.backend.transaction(
        `Move ${total} documents to trash`,
        async (tx) => {
          for (const doc of docs) await tx.doc.delete({ id: doc.id });
        },
        { scope },
      );
    }
  } catch (error) {
    failed(app, single ? "move it to the trash" : "move them to the trash", error);
    return false;
  }
  app.notify({
    title: single
      ? `“${only.title || "Untitled"}” moved to trash`
      : `${total} documents moved to trash`,
    description: `Undo with ${app.formatKeybinding("Mod+Z")}`,
    // Restores these documents rather than popping the undo stack: by the time the button is
    // pressed the stack may hold newer steps, or belong to another tab.
    action: { label: "Undo", onPress: () => void restore(app, docs, scope) },
  });
  return true;
}

const restore = (app: TrashApp, docs: readonly { id: string }[], scope: string) =>
  app.backend
    .transaction(
      docs.length === 1 ? "Restore document" : `Restore ${docs.length} documents`,
      async (tx) => {
        for (const doc of docs) await tx.doc.restore({ id: doc.id });
      },
      { scope },
    )
    .catch((error: unknown) =>
      failed(app, docs.length === 1 ? "restore it" : "restore them", error),
    );

const failed = (app: TrashApp, what: string, error: unknown) =>
  app.notify({
    title: `Could not ${what}`,
    description: error instanceof Error ? error.message : String(error),
    kind: "error",
  });
