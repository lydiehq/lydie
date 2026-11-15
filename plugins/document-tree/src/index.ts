import { definePlugin, docIdOf } from "@lydie/plugin-api";
import { AddRegular, Delete2Regular, ListCollapseRegular, StarRegular } from "@lydie/plugin-api/ui";
import { createElement } from "react";

import { DocumentTree, SidebarDocumentTree } from "./DocumentTree.tsx";
import { favoritesOf } from "./favorites.ts";
import { FavoritesSection } from "./Favorites.tsx";
import { collapseAllTrees } from "./tree-model.ts";
import { currentSelection } from "./tree-selection.ts";

export const documentTreePlugin = definePlugin({
  id: "document-tree",
  name: "Document tree",
  description: "The sidebar tree of documents: open, create, rename, move and delete.",
  activate(ctx) {
    const { app } = ctx;
    ctx.sidebar.register({
      id: "documents",
      title: "Documents",
      order: 10,
      fill: true,
      actions: [
        // The sidebar's own command, so the "New documents" setting decides where it goes.
        {
          label: "New document",
          icon: createElement(AddRegular),
          run: (app) => app.runCommand("core.newDocument"),
        },
      ],
      component: SidebarDocumentTree,
    });
    // Shows nothing (not even its title) while there are no favorites.
    ctx.sidebar.register({
      id: "favorites",
      title: "Favorites",
      order: 9,
      component: FavoritesSection,
    });
    ctx.commands.register({
      id: "document-tree.toggleFavorite",
      title: "Add to or remove from favorites",
      paletteTitle: (app) =>
        favoritesOf(app).has(docIdOf(app.activeTab()?.path) ?? "")
          ? "Remove from favorites"
          : "Add to favorites",
      group: "Document",
      scope: "document",
      icon: createElement(StarRegular),
      when: (app) => docIdOf(app.activeTab()?.path) !== null,
      run: ({ app }) => {
        const docId = docIdOf(app.activeTab()?.path);
        if (!docId) return;
        const on = favoritesOf(app).toggle(docId);
        app.notify({ title: on ? "Added to favorites" : "Removed from favorites" });
      },
    });
    // In every document menu (rows here, Home, the page's •••). The palette lists it once, as the
    // command above (same id).
    ctx.documentMenu.register({
      id: "document-tree.toggleFavorite",
      label: (doc) => (favoritesOf(app).has(doc.id) ? "Remove from favorites" : "Add to favorites"),
      icon: createElement(StarRegular),
      group: "favorite",
      order: 5,
      run: (doc) => void favoritesOf(app).toggle(doc.id),
    });
    // While several rows are selected in a tree. Named "Delete" so it is found as the single
    // document's "Delete document" is.
    ctx.commands.register({
      id: "document-tree.trashSelection",
      title: "Delete selected documents",
      paletteTitle: (app) => `Move ${currentSelection(app)?.count ?? 0} documents to trash`,
      group: "Document",
      bindable: false,
      icon: createElement(Delete2Regular),
      when: (app) => currentSelection(app) !== null,
      run: ({ app }) => currentSelection(app)?.trash(),
    });
    ctx.commands.register({
      id: "document-tree.collapseAll",
      title: "Collapse all documents",
      group: "View",
      icon: createElement(ListCollapseRegular),
      run: () => collapseAllTrees(),
    });
    // The same tree for other plugins (`<DocumentTreeView>`), e.g. the hosted spaces sidebar.
    ctx.documentTree.register({ id: "document-tree", component: DocumentTree });
  },
});

export default documentTreePlugin;
