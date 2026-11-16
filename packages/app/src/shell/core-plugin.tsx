import {
  atTop,
  createAndOpen,
  createMissing,
  definePlugin,
  docIdOf,
  docPath,
  HOME_PATH,
  linkStyleOf,
  linkTargetFor,
  markdownHref,
  resolvePath,
  useApp,
} from "@lydie/plugin-api";
import type { AppApi, PathMatch } from "@lydie/plugin-api";
import { ArrowUpRegular, Button, EmptyState, FileNewRegular, LinkRegular } from "@lydie/ui";

import { appUrl } from "../host/url.ts";

// Host-owned contributions: the empty "new tab" page and the "New document" command behind the
// sidebar's "New document" row. They are part of the shell, written against the public plugin API.
function NewTabView() {
  const app = useApp();
  const commands = app.commands();
  const actions = [
    { id: "core.newDocument", label: "New document" },
    { id: "quick-switcher.open", label: "Open a document" },
    { id: "search.open", label: "Search" },
    { id: "core.palette", label: "All commands" },
  ].filter((a) => a.id === "core.palette" || commands.some((c) => c.id === a.id));
  const keyOf = (id: string) => {
    const key = id === "core.palette" ? "Mod+K" : commands.find((c) => c.id === id)?.keybindings[0];
    return key ? app.formatKeybinding(key) : null;
  };
  return (
    <EmptyState
      className="h-full"
      title="New tab"
      action={
        <div className="flex flex-col items-stretch gap-1.5">
          {actions.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant="secondary"
              onPress={() => void app.runCommand(a.id)}
            >
              <span className="grow text-left">{a.label}</span>
              {keyOf(a.id) && <span className="ml-6 text-xs text-gray-400">{keyOf(a.id)}</span>}
            </Button>
          ))}
        </div>
      }
    />
  );
}

// Where "New document" puts the note. A folder window follows the folder's setting (the top
// level, next to the open note, or a folder by path, made when missing); other windows the top level.
async function newDocumentParent(app: AppApi): Promise<PathMatch> {
  const top: PathMatch = { id: null, missing: [] };
  const folder = app.services?.vault?.settings?.current();
  if (folder?.newNoteLocation === "folder") return resolvePath(app, folder.newNoteFolder ?? "");
  const openId = docIdOf(app.activeTab()?.path);
  if (folder?.newNoteLocation === "current" && openId) {
    const [open] = await app.backend.query("doc.get", { id: openId });
    return { id: open?.document.parentId ?? null, missing: [] };
  }
  return top;
}

export const corePlugin = definePlugin({
  id: "core",
  name: "Shell",
  activate(ctx) {
    ctx.views.register({
      path: HOME_PATH,
      component: NewTabView,
      title: "New tab",
      // The fallback: a plugin's home page takes the path.
      order: 1000,
    });
    ctx.commands.register({
      id: "core.newDocument",
      title: "New document",
      group: "Document",
      icon: <FileNewRegular />,
      // Notion's Mod+N. Browsers keep it for a new window, so the web also has Mod+Alt+N; and
      // Linear's C, outside text.
      keybinding: ["Mod+N", "Mod+Alt+N", "C"],
      operation: "doc.create",
      async run({ app }) {
        const workspaceId = app.workspace.workspaceId;
        const where = await newDocumentParent(app);
        const scope = app.historyScope();
        // A folder just made is empty, so only an existing one needs a place at the top.
        const placement = where.missing.length
          ? {}
          : await atTop(app.backend, workspaceId, where.id);
        await createAndOpen(
          app,
          (id) =>
            where.missing.length
              ? // The folder and the note as one undo step.
                app.backend.transaction(
                  "New document",
                  async (ops) => {
                    const parentId = await createMissing(ops, workspaceId, where);
                    return ops.doc.create({ workspaceId, id, title: "Untitled", parentId });
                  },
                  { scope },
                )
              : app.backend.ops.doc.create(
                  { workspaceId, id, title: "Untitled", parentId: where.id, ...placement },
                  { scope },
                ),
          { state: { focusTitle: true } },
        );
      },
    });
    ctx.commands.register({
      id: "core.goToParent",
      title: "Go to parent page",
      group: "Navigation",
      icon: <ArrowUpRegular />,
      keybinding: "Mod+Shift+U",
      when: (app) => docIdOf(app.activeTab()?.path) !== null,
      async run({ app }) {
        const id = docIdOf(app.activeTab()?.path);
        if (!id) return;
        const [row] = await app.backend.query("doc.get", { id });
        if (row?.document.parentId) app.openDoc(row.document.parentId);
      },
    });
    ctx.commands.register({
      id: "core.copyLink",
      title: "Copy link to page",
      group: "Document",
      icon: <LinkRegular />,
      keybinding: "Mod+L",
      when: (app) => docIdOf(app.activeTab()?.path) !== null,
      async run({ app }) {
        const id = docIdOf(app.activeTab()?.path);
        if (!id) return;
        await navigator.clipboard.writeText(await pageLink(app, id));
        app.notify({ title: "Link copied", kind: "success" });
      },
    });
  },
});

// A hosted page's link is its URL in the web app. Elsewhere pages have no URL anyone else could
// open, so the link is the one Lydie writes in a note: `[[Title]]`, or in a folder window the
// folder's link format (relative paths are relative to a note, so from the top here).
async function pageLink(app: AppApi, id: string): Promise<string> {
  const account = app.services?.account;
  if (app.workspace.mode === "synced" && account) {
    const [row] = await app.backend.query("doc.get", { id });
    const workspace = app.workspace.workspaceSlug ?? app.workspace.workspaceId;
    return account.webUrl(appUrl("", docPath(id), workspace, "", row?.document.title ?? null));
  }
  const [row] = await app.backend.query("doc.get", { id });
  const title = row?.document.title.trim() || "Untitled";
  const style = linkStyleOf(app);
  if (!style) return `[[${title}]]`;
  const path = style.path === "relative" ? "absolute" : style.path;
  const target = await linkTargetFor(app.backend, null, id, path);
  return style.format === "markdown" ? `[${title}](${markdownHref(target)})` : `[[${target}]]`;
}
