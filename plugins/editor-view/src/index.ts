import { definePlugin, docIdOf, pageFullWidthOf, prefetchDoc } from "@lydie/plugin-api";

import { DocTabTitle, DocView } from "./DocView.tsx";
import { registerFind } from "./FindBar.tsx";
import { fullWidthInput } from "./PageMenu.tsx";

export const editorViewPlugin = definePlugin({
  id: "editor-view",
  name: "Editor",
  description: "Shows a document in a tab: its title and the editor.",
  activate(ctx) {
    ctx.views.register({
      path: "/d/:id",
      component: DocView,
      tabTitle: DocTabTitle,
      preload: (path, app) => {
        const id = docIdOf(path);
        if (id) return prefetchDoc(app.backend, id);
      },
    });
    registerFind(ctx);
    ctx.commands.register({
      id: "editor-view.toggle-full-width",
      title: "Toggle full width",
      group: "Document",
      scope: "document",
      when: (app) => docIdOf(app.activeTab()?.path) !== null,
      async run({ app }) {
        const docId = docIdOf(app.activeTab()?.path);
        if (!docId) return;
        const [entry] = await app.backend.query("doc.get", { id: docId });
        if (!entry) return;
        const on = !pageFullWidthOf(entry.document.properties);
        await app.backend.ops.doc.setProperties(fullWidthInput(docId, on), {
          scope: app.historyScope(),
          label: on ? "Full width" : "Default width",
        });
      },
    });
  },
});

export default editorViewPlugin;
