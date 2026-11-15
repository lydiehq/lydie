import { definePlugin, docIdOf, useQuery, useWorkspace } from "@lydie/plugin-api";
import type { AppApi } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";
import { FileRegular, PickerDialog, Table2Regular } from "@lydie/plugin-api/ui";
import { useState } from "react";

import { CollectionBody } from "./CollectionPage.tsx";
import { InlineDatabase, isBaseTarget } from "./InlineDatabase.tsx";
import { preloadDatabaseViews } from "./lazy.tsx";
import { collectionSlashItems } from "./slash.ts";
import { watchDatabases } from "./watch.ts";

async function uniqueTitle(app: AppApi, base: string): Promise<string> {
  const taken = new Set(
    (await app.backend.query("database.list", { workspaceId: app.workspace.workspaceId })).map(
      (d) => d.title.toLowerCase(),
    ),
  );
  let title = base;
  for (let i = 2; taken.has(title.toLowerCase()); i++) title = `${base} ${i}`;
  return title;
}

function currentDocId(app: AppApi): string | null {
  return docIdOf(app.activeTab()?.path);
}

async function createCollection(app: AppApi, parentId: string | null) {
  // Embeds find a collection by title, so a new one gets a title no other collection has.
  const title = await uniqueTitle(app, "Untitled collection");
  const created = await app.backend.ops.database.create(
    { workspaceId: app.workspace.workspaceId, parentId, title },
    { scope: app.historyScope(), label: "New collection" },
  );
  return { id: created.database.id, title };
}

// A new collection opens with its title focused; the placeholder name is selected so typing
// replaces it (the title field only does that itself for "Untitled").
function selectTitle(tries = 30) {
  requestAnimationFrame(() => {
    const field = document.activeElement;
    if (field instanceof HTMLTextAreaElement && /^Untitled collection/.test(field.value))
      field.select();
    else if (tries > 0) selectTitle(tries - 1);
  });
}

// Any page with sub-pages can become a collection (its sub-pages become its pages) and back.
async function turnIntoCollection(app: AppApi, documentId: string) {
  await app.backend.ops.database.create(
    { workspaceId: app.workspace.workspaceId, documentId },
    { scope: app.historyScope(), label: "Turn into collection" },
  );
}

async function turnIntoPage(app: AppApi, id: string) {
  await app.backend.ops.database.delete(
    { id },
    { scope: app.historyScope(), label: "Turn back into page" },
  );
}

const fail = (app: AppApi, title: string) => (error: unknown) =>
  app.notify({
    title,
    description: error instanceof Error ? error.message : String(error),
    kind: "error",
  });

const embed = (editor: Editor, title: string) =>
  editor
    .chain()
    .focus()
    .insertEmbed({ target: `${title}.base` })
    .run();

// `databases.fromPage` takes the document id (a string or `{ documentId }`); none: the open page.
function docIdArg(args: unknown): string | null {
  if (typeof args === "string") return args;
  if (typeof args === "object" && args !== null && "documentId" in args) {
    const id = (args as { documentId: unknown }).documentId;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function CollectionPicker({ close, props }: { close: () => void; props: unknown }) {
  const { onPick } = props as { onPick: (title: string) => void };
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery("database.list", { workspaceId: workspace.workspaceId });
  const q = query.trim().toLowerCase();
  const items = data
    .filter((d) => d.title.toLowerCase().includes(q))
    .map((d) => ({ id: d.id, title: d.title }));
  return (
    <PickerDialog
      label="Show a collection here"
      placeholder="Search collections…"
      query={query}
      onQueryChange={setQuery}
      items={items}
      isLoading={isLoading}
      emptyText="No collections. A collection is a page whose sub-pages share properties and views."
      onClose={close}
      onSelect={(item) => {
        close();
        onPick(item.title);
      }}
    />
  );
}

export const databasesPlugin = definePlugin({
  id: "databases",
  name: "Collections",
  description:
    "Collections: pages whose sub-pages share properties and views (table, board, list, gallery, " +
    "calendar), on their own page or shown inside other pages.",
  activate(ctx) {
    ctx.documents.register({ id: "database", slot: "body", component: CollectionBody });
    preloadDatabaseViews();
    ctx.links.register({
      id: "database-embed",
      kind: "embed",
      order: 10,
      match: isBaseTarget,
      component: InlineDatabase,
    });
    ctx.overlays.register({ id: "databases.pick", component: CollectionPicker });
    const app = ctx.app;
    ctx.editor.register({
      slashItems: collectionSlashItems({
        // A new collection under this page, shown here; the embed opens it as a page.
        newCollection: (editor) => {
          void createCollection(app, currentDocId(app))
            .then(({ title }) => embed(editor, title))
            .catch(fail(app, "Could not create the collection"));
        },
        viewOfCollection: (editor) => {
          app.overlays.open("databases.pick", {
            onPick: (title: string) => embed(editor, title),
          });
        },
      }),
    });
    ctx.commands.register({
      id: "databases.new",
      title: "New collection",
      icon: <Table2Regular />,
      group: "Collection",
      operation: "database.create",
      async run({ app }) {
        await createCollection(app, null)
          .then(({ id }) => {
            app.openDoc(id, { state: { focusTitle: true } });
            selectTitle();
          })
          .catch(fail(app, "Could not create the collection"));
      },
    });

    const databases = watchDatabases(ctx.app);
    const isCollection = (id: string | null) => databases.get(id) !== undefined;

    // Also run by other plugins (the properties panel) with the document id.
    ctx.commands.register({
      id: "databases.fromPage",
      title: "Turn into collection",
      group: "Collection",
      bindable: false,
      scope: "document",
      when: (app) => {
        const id = currentDocId(app);
        return id !== null && !isCollection(id);
      },
      async run({ app, args }) {
        const id = docIdArg(args) ?? currentDocId(app);
        if (!id || isCollection(id)) return;
        await turnIntoCollection(app, id).catch(
          fail(app, "Could not turn the page into a collection"),
        );
      },
    });
    ctx.commands.register({
      id: "databases.toPage",
      title: "Turn back into page",
      group: "Collection",
      bindable: false,
      scope: "document",
      when: (app) => isCollection(currentDocId(app)),
      async run({ app, args }) {
        const id = docIdArg(args) ?? currentDocId(app);
        if (!id || !isCollection(id)) return;
        await turnIntoPage(app, id).catch(fail(app, "Could not turn the collection into a page"));
      },
    });
    ctx.documentMenu.register({
      id: "databases.fromPage",
      label: "Turn into collection",
      icon: <Table2Regular />,
      group: "database",
      order: 20,
      when: (doc) => !isCollection(doc.id),
      run: (doc, app) =>
        turnIntoCollection(app, doc.id).catch(
          fail(app, "Could not turn the page into a collection"),
        ),
    });
    ctx.documentMenu.register({
      id: "databases.toPage",
      label: "Turn back into page",
      icon: <FileRegular />,
      group: "database",
      order: 20,
      when: (doc) => isCollection(doc.id),
      run: (doc, app) =>
        turnIntoPage(app, doc.id).catch(fail(app, "Could not turn the collection into a page")),
    });

    return () => databases.stop();
  },
});

export default databasesPlugin;
