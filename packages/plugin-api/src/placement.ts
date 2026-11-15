// New pages made from the UI go first among their siblings, as in Notion, where they are seen at
// once. `doc.create` itself appends, which is what the API, MCP and CLI want: an agent writing
// a list of pages expects them in the order it made them.
import type { Backend } from "./backend.ts";

// Spread into `doc.create`: the first live sibling as `beforeId`, nothing when there is none.
export async function atTop(
  backend: Pick<Backend, "query">,
  workspaceId: string,
  parentId: string | null,
): Promise<{ beforeId?: string }> {
  const [first] = await backend.query("doc.children", { workspaceId, parentId });
  return first ? { beforeId: first.id } : {};
}
