// Comments beside a document, from people and agents (an agent's note is a comment too). In the
// text, the passage a comment is about is highlighted; beside it, in the margin, sits its card;
// the selection toolbar starts one, and the top bar one about the page.
import { assembleThreads, definePlugin, useDeviceSetting, useQuery } from "@lydie/plugin-api";
import type { AppApi, DocumentSlotProps } from "@lydie/plugin-api";
import {
  AddRegular,
  Button,
  Chat3Regular,
  Menu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
} from "@lydie/plugin-api/ui";
import { useMemo, useSyncExternalStore } from "react";

import { ThreadsExtension } from "./extension.ts";
import { startDraft, startPageDraft, ThreadsLayer } from "./Layer.tsx";
import { editorOf, resolvedShownIn, setResolvedShown, SHOWN_KEY, subscribe } from "./store.ts";

const SHOW = "show";
const RESOLVED = "resolved";

// The top bar: the page's open comments as a count, and a menu to comment on the page, show
// resolved ones, or hide them all.
function CommentsButton({ docId, tab }: DocumentSlotProps) {
  const { data } = useQuery("thread.list", { documentId: docId });
  const threads = useMemo(() => assembleThreads(data), [data]);
  const open = threads.filter((t) => !t.resolvedAt).length;
  const resolved = threads.length - open;
  const tabId = tab?.id ?? null;
  const [shown, setShown] = useDeviceSetting(SHOWN_KEY, true);
  const withResolved = useSyncExternalStore(subscribe, () => resolvedShownIn(tabId));
  const label = open === 0 ? "Comments" : `${open} open ${open === 1 ? "comment" : "comments"}`;
  return (
    <MenuTrigger>
      <Button size={open ? "xs" : "icon-xs"} variant="ghost" aria-label={label} tooltip="Comments">
        <Chat3Regular data-icon={open ? "inline-start" : undefined} />
        {open > 0 && open}
      </Button>
      <Menu placement="bottom end" popoverClassName="min-w-[220px]">
        <MenuItem
          id="page"
          icon={<AddRegular />}
          onAction={() => {
            setShown(true);
            startPageDraft(tabId);
          }}
        >
          Comment on this page
        </MenuItem>
        <MenuSeparator />
        <MenuSection
          aria-label="Show"
          selectionMode="multiple"
          selectedKeys={[...(shown ? [SHOW] : []), ...(withResolved ? [RESOLVED] : [])]}
          onSelectionChange={(keys) => {
            const has = (key: string) => keys === "all" || keys.has(key);
            if (has(SHOW) !== shown) setShown(has(SHOW));
            if (tabId && has(RESOLVED) !== withResolved) setResolvedShown(tabId, has(RESOLVED));
          }}
        >
          <MenuItem id={SHOW} indicator="switch">
            Show comments
          </MenuItem>
          <MenuItem id={RESOLVED} indicator="switch" isDisabled={!shown || resolved === 0}>
            {resolved > 0 ? `Show resolved (${resolved})` : "Show resolved"}
          </MenuItem>
        </MenuSection>
      </Menu>
    </MenuTrigger>
  );
}

// Mod+Alt+M, as in Google Docs: on the selected text, else on the page.
function comment(app: AppApi) {
  const tabId = app.activeTab()?.id ?? null;
  const editor = editorOf(tabId);
  if (!editor) return;
  app.storage.set(SHOWN_KEY, true);
  if (editor.state.selection.empty) startPageDraft(tabId);
  else startDraft(editor, tabId);
}

export const threadsPlugin = definePlugin({
  id: "threads",
  name: "Comments",
  description: "Comments beside a document, from people and agents, never in its body.",
  activate(ctx) {
    // Not in a folder yet: threads there need their sidecar files (LYD-400), or a rebuilt index
    // would lose them.
    if (ctx.app.services?.vault) return;
    ctx.editor.register({
      extensions: () => [ThreadsExtension],
      overlay: ThreadsLayer,
      selectionActions: [
        {
          id: "comment",
          label: "Comment",
          icon: <Chat3Regular />,
          readOnly: true,
          run: (editor, { tabId }) => startDraft(editor, tabId),
        },
      ],
    });
    ctx.documents.register({
      id: "threads.comments",
      slot: "actions",
      order: 5,
      component: CommentsButton,
    });
    ctx.commands.register({
      id: "threads.comment",
      title: "Add a comment",
      icon: <Chat3Regular />,
      group: "Edit",
      scope: "document",
      keybinding: "Mod+Alt+M",
      when: (app) => !!editorOf(app.activeTab()?.id ?? null),
      run: ({ app }) => comment(app),
    });
    ctx.commands.register({
      id: "threads.toggle",
      title: "Show or hide comments",
      group: "View",
      run: ({ app }) => app.storage.set(SHOWN_KEY, app.storage.get<boolean>(SHOWN_KEY) === false),
    });
  },
});

export default threadsPlugin;
