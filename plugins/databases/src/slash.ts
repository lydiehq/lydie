// The `/` menu's two ways in: "Collection" (a new collection under this page, shown here) and
// "View of a collection…" (an existing one, shown here). Old words still find them.
import type { SlashCommandItem } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";

export function collectionSlashItems(actions: {
  newCollection: (editor: Editor) => void;
  viewOfCollection: (editor: Editor) => void;
}): SlashCommandItem[] {
  return [
    {
      id: "collection",
      title: "Collection",
      description: "Sub-pages that share properties and views, shown here",
      keywords: ["collection", "database", "table", "board", "inline", "base"],
      group: "Collection",
      run: actions.newCollection,
    },
    {
      id: "collection-view",
      title: "View of a collection…",
      description: "Show an existing collection here",
      keywords: ["collection", "view", "linked", "database", "embed", "base"],
      group: "Collection",
      run: actions.viewOfCollection,
    },
  ];
}
