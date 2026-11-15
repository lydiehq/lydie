// `/` menu entries beyond the editor's blocks: upload, link or embed a page, today's date, and the
// registry's commands that act on the open document (the rest, such as "Collapse all documents",
// belong to the palette). Ranking (fuzzy, recently used first) is the editor view's.
import {
  definePlugin,
  docIdOf,
  docPickerItem,
  fuzzyScore,
  useApp,
  useBackend,
  useQuery,
} from "@lydie/plugin-api";
import type { AppApi, SlashCommandItem } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";
import { AddRegular, Link2Regular, PickerDialog, PicRegular } from "@lydie/plugin-api/ui";
import type { PickerItem } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

type PickProps = { title: string; onPick: (title: string) => void };

const RECENT_SHOWN = 5;

// Pick a document by title (for "Link to page" and "Embed page"). Before typing: the recently
// changed ones, leaving out the open document.
function DocPicker({ close, props }: { close: () => void; props: unknown }) {
  const { title, onPick } = props as PickProps;
  const app = useApp();
  const backend = useBackend();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const current = activeDocId(app);
  const recent = useQuery(
    "doc.recent",
    query.trim() ? null : { workspaceId: backend.info.workspaceId, limit: RECENT_SHOWN + 1 },
  );
  const recentItems = recent.data
    .filter((d) => d.id !== current)
    .slice(0, RECENT_SHOWN)
    .map((d) => docPickerItem(d, { group: "Recent" }));
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    void backend
      .query("doc.search", { workspaceId: backend.info.workspaceId, text: q, limit: 20 })
      .then((hits) => {
        if (!live) return;
        const ranked = hits
          .map((h) => ({ h, s: fuzzyScore(q, h.title) ?? -1000 }))
          .sort((a, b) => b.s - a.s);
        setItems(ranked.map(({ h }) => docPickerItem(h)));
      })
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [backend, query]);
  return (
    <PickerDialog
      label={title}
      placeholder="Find a document"
      query={query}
      onQueryChange={setQuery}
      items={
        !query.trim()
          ? recentItems
          : !items.some((i) => i.title === query.trim())
            ? [
                ...items,
                {
                  id: "new",
                  title: query.trim(),
                  subtitle: "Link to a new note",
                  icon: <AddRegular />,
                },
              ]
            : items
      }
      emptyText={query ? "No documents" : "Type to search"}
      onClose={close}
      onSelect={(item) => {
        close();
        onPick(item.title);
      }}
    />
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The open document, for attachments.
function activeDocId(app: AppApi): string | null {
  return docIdOf(app.activeTab()?.path);
}

function pickFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

// Adds files as attachments and embeds them (`![[name.png]]`, as Obsidian does).
export async function uploadInto(app: AppApi, editor: Editor, files: readonly File[]) {
  const pos = editor.state.selection.from;
  const embeds = [];
  for (const file of files) {
    const attachment = await app.backend.attachments.add(
      {
        workspaceId: app.workspace.workspaceId,
        documentId: activeDocId(app),
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        data: new Uint8Array(await file.arrayBuffer()),
      },
      { scope: app.historyScope() },
    );
    embeds.push({ type: "embed", attrs: { target: attachment.filename } });
  }
  if (embeds.length && !editor.isDestroyed)
    editor.chain().focus().insertContentAt(pos, embeds).run();
}

function items(app: AppApi): SlashCommandItem[] {
  const base: SlashCommandItem[] = [
    {
      id: "upload",
      title: "Image or file",
      description: "Upload and embed an attachment",
      keywords: ["image", "upload", "attachment", "file", "picture"],
      group: "Media",
      icon: <PicRegular />,
      run: (editor) => {
        void pickFiles("*/*").then((files) =>
          uploadInto(app, editor, files).catch((error: unknown) =>
            app.notify({ title: "Upload failed", description: String(error), kind: "error" }),
          ),
        );
      },
    },
    {
      id: "linkPage",
      title: "Link to page",
      keywords: ["link", "wiki", "page", "note", "mention"],
      group: "Links",
      icon: <Link2Regular />,
      run: (editor) =>
        app.overlays.open("slash-menu.pick", {
          title: "Link to page",
          onPick: (target: string) =>
            editor.chain().focus().insertWikiLink({ target }).insertContent(" ").run(),
        } satisfies PickProps),
    },
    {
      id: "embedPage",
      title: "Embed page",
      description: "Show another note here",
      keywords: ["embed", "transclude", "include"],
      group: "Links",
      icon: <Link2Regular />,
      run: (editor) =>
        app.overlays.open("slash-menu.pick", {
          title: "Embed page",
          onPick: (target: string) => editor.chain().focus().insertEmbed({ target }).run(),
        } satisfies PickProps),
    },
    {
      id: "date",
      title: "Today's date",
      keywords: ["date", "today", "now"],
      group: "Insert",
      run: (editor) => editor.chain().focus().insertContent(today()).run(),
    },
  ];
  // Commands on the open document (rename, share, full width, …). Shown only when typing a query.
  const commands = app
    .commands()
    .filter((c) => c.enabled && c.scope === "document")
    .map((c): SlashCommandItem => ({
      id: `command:${c.id}`,
      title: c.title,
      group: "Commands",
      ...(c.group ? { keywords: [c.group] } : {}),
      run: () => void app.runCommand(c.id),
    }));
  return [...base, ...commands];
}

export const slashMenuPlugin = definePlugin({
  id: "slash-menu",
  name: "Slash menu",
  description: "Uploads, page links and embeds, the date and document commands in the / menu.",
  activate(ctx) {
    ctx.overlays.register({ id: "slash-menu.pick", component: DocPicker });
    ctx.editor.register({ slashItems: () => items(ctx.app) });
  },
});

export default slashMenuPlugin;
