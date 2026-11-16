// New pages made from the UI go first among their siblings, as in Notion, where they are seen at
// once. `doc.create` itself appends, which is what the API, MCP and CLI want: an agent writing
// a list of pages expects them in the order it made them.
import type { Backend } from "./backend.ts";
import type { AppApi, OpenOptions } from "./plugin.ts";

// Spread into `doc.create`: the first live sibling as `beforeId`, nothing when there is none.
export async function atTop(
  backend: Pick<Backend, "query">,
  workspaceId: string,
  parentId: string | null,
): Promise<{ beforeId?: string }> {
  const [first] = await backend.query("doc.children", { workspaceId, parentId });
  return first ? { beforeId: first.id } : {};
}

// Makes a page and opens it. The id comes first, so the open starts in the same task as the
// write: lists mark the new row (`TabInfo.opening`) in the frame it paints, not the page that was
// open, which has just moved down a row. `create` writes the page with that id; it must start
// the write before it awaits anything. Resolves with the id once the page exists.
export async function createAndOpen(
  app: Pick<AppApi, "backend" | "openDoc">,
  create: (id: string) => Promise<unknown>,
  options?: Omit<OpenOptions, "after">,
): Promise<string> {
  const id = app.backend.newId();
  const created = create(id);
  app.openDoc(id, { ...options, after: created });
  await created;
  return id;
}
