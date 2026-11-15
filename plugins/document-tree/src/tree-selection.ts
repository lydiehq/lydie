import type { AppApi } from "@lydie/plugin-api";

// A tree's multiple selection as the palette sees it ("Move 3 documents to trash"). Each tree
// with a selection publishes one; when several do (the spaces sidebar has a tree per group),
// the latest wins.
export type TreeSelection = {
  // Every selected document, subtrees' ones included.
  count: number;
  trash: () => Promise<void>;
};

const stores = new WeakMap<AppApi, TreeSelection[]>();

const listOf = (app: AppApi) => {
  const known = stores.get(app);
  if (known) return known;
  const list: TreeSelection[] = [];
  stores.set(app, list);
  return list;
};

// Returns a disposer that withdraws it.
export function publishSelection(app: AppApi, selection: TreeSelection): () => void {
  const list = listOf(app);
  list.push(selection);
  return () => {
    const index = list.indexOf(selection);
    if (index !== -1) list.splice(index, 1);
  };
}

export function currentSelection(app: AppApi): TreeSelection | null {
  return listOf(app).at(-1) ?? null;
}
