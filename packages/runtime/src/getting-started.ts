// Creates a workspace's Getting started page (the content is @lydie/contract's `gettingStarted`)
// through ordinary operations, so it lands in a folder, this browser's database or the core the same
// way any page does, and the user can edit, move or delete it like any page.
import { gettingStarted, gettingStartedId, isLydieError, starterId } from "@lydie/contract";
import type {
  GettingStartedMode,
  Operations,
  StarterDatabase,
  StarterNode,
  StarterPage,
} from "@lydie/contract";

import type { OpsProxy } from "./runtime.ts";

export type GettingStartedOps = Pick<OpsProxy<Operations>, "doc" | "database">;

export type CreateGettingStartedOptions = {
  workspaceId: string;
  mode: GettingStartedMode;
  mcpUrl?: string;
  // YYYY-MM-DD. Default: today in UTC.
  today?: string;
};

// Creates the page tree once per workspace: the ids are derived from the workspace id, so a second
// call finds the page (live or in the trash) and returns null. The hosted core keeps its pages in
// the creator's private section (it passes `teamspaceId: null`).
export async function createGettingStarted(
  ops: GettingStartedOps,
  options: CreateGettingStartedOptions,
): Promise<{ id: string } | null> {
  const { workspaceId } = options;
  const id = gettingStartedId(workspaceId);
  if (await exists(ops, id)) return null;
  const root = gettingStarted({
    mode: options.mode,
    today: options.today ?? new Date().toISOString().slice(0, 10),
    ...(options.mcpUrl ? { mcpUrl: options.mcpUrl } : {}),
  });

  // The body goes in last, once the pages it links to and embeds exist.
  await ops.doc.create({
    workspaceId,
    id,
    title: root.title,
    ...(root.properties ? { properties: root.properties } : {}),
  });
  for (const child of root.children ?? []) await createNode(ops, workspaceId, id, child);
  await ops.doc.updateBody({ id, markdown: root.markdown });
  return { id };
}

async function exists(ops: GettingStartedOps, id: string): Promise<boolean> {
  try {
    await ops.doc.get({ id, includeBody: false });
    return true;
  } catch (error) {
    if (isLydieError(error) && error.code === "not_found") return false;
    throw error;
  }
}

async function createNode(
  ops: GettingStartedOps,
  workspaceId: string,
  parentId: string,
  node: StarterNode,
): Promise<void> {
  if (node.kind === "database") return createDatabase(ops, workspaceId, parentId, node);
  await createPage(ops, workspaceId, parentId, node);
}

async function createPage(
  ops: GettingStartedOps,
  workspaceId: string,
  parentId: string,
  page: StarterPage,
): Promise<void> {
  const id = starterId(workspaceId, page.key);
  await ops.doc.create({
    workspaceId,
    id,
    parentId,
    title: page.title,
    markdown: page.markdown,
    ...(page.properties ? { properties: page.properties } : {}),
  });
  for (const child of page.children ?? []) await createNode(ops, workspaceId, id, child);
}

async function createDatabase(
  ops: GettingStartedOps,
  workspaceId: string,
  parentId: string,
  database: StarterDatabase,
): Promise<void> {
  const id = starterId(workspaceId, database.key);
  await ops.database.create({ workspaceId, id, parentId, title: database.title });
  const keys = new Map<string, string>();
  for (const property of database.properties) {
    const added = await ops.database.addProperty({
      databaseId: id,
      name: property.name,
      key: property.key,
      type: property.type,
      config: property.options ? { options: [...property.options] } : {},
    });
    keys.set(property.key, added.id);
  }
  const boardBy = database.boardBy ? keys.get(database.boardBy) : undefined;
  if (boardBy) {
    await ops.database.createView({
      databaseId: id,
      name: "Board",
      type: "board",
      config: { groupBy: { propertyId: boardBy, direction: "asc" } },
    });
  }
  for (const row of database.rows) {
    await ops.doc.create({
      workspaceId,
      id: starterId(workspaceId, row.key),
      parentId: id,
      title: row.title,
      properties: row.values,
    });
  }
}
