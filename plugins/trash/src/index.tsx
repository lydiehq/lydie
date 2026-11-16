import {
  definePlugin,
  PageLink,
  useActiveTab,
  useApp,
  useOps,
  useQuery,
  useShortcut,
  useWorkspace,
} from "@lydie/plugin-api";
import type { TrashItem } from "@lydie/plugin-api";
import {
  Button,
  Delete2Regular,
  EmptyState,
  ErrorState,
  LoadingState,
  sidebarItemStyles,
  TrashIllustration,
  WithTooltip,
} from "@lydie/plugin-api/ui";
import { memo } from "react";

const Item = memo(function Item({ item }: { item: TrashItem }) {
  const app = useApp();
  const ops = useOps();
  const restore = async () => {
    if (item.kind === "document") {
      await ops.doc.restore({ id: item.id });
      app.openDoc(item.id, { mode: "tab" });
    } else await ops.attachment.restore({ id: item.id });
  };
  const purge = async () => {
    const ok = await app.confirm({
      message: `Delete “${item.title || "Untitled"}” forever?`,
      detail: "This cannot be undone.",
      confirmLabel: "Delete forever",
      destructive: true,
    });
    if (!ok) return;
    if (item.kind === "document") await ops.doc.purge({ id: item.id });
    else await ops.attachment.purge({ id: item.id });
  };
  return (
    <li
      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-950/3"
      data-testid="trash-item"
    >
      <div className="min-w-0 grow">
        <div className="truncate text-sm text-gray-900">{item.title || "Untitled"}</div>
        <div className="text-xs text-gray-500">
          Deleted {new Date(item.deletedAt).toLocaleString()}
          {item.descendantCount > 0 && ` · with ${item.descendantCount} inside`}
        </div>
      </div>
      <Button size="xs" variant="secondary" onPress={() => void restore()}>
        Restore
      </Button>
      <Button
        size="xs"
        variant="ghost"
        aria-label={`Delete ${item.title || "Untitled"} forever`}
        onPress={() => void purge()}
      >
        Delete forever
      </Button>
    </li>
  );
});

function TrashView() {
  const app = useApp();
  const ops = useOps();
  const workspace = useWorkspace();
  const { data, isLoading, error } = useQuery("trash.list", { workspaceId: workspace.workspaceId });
  const empty = async () => {
    const ok = await app.confirm({
      message: "Empty the trash?",
      detail: `${data.length} item${data.length === 1 ? "" : "s"} will be deleted forever.`,
      confirmLabel: "Empty trash",
      destructive: true,
    });
    if (ok) await ops.trash.empty({ workspaceId: workspace.workspaceId });
  };
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-[720px] grow flex-col gap-3 px-6 pt-10"
      data-testid="trash-view"
    >
      <div className="flex items-center gap-2">
        <h1 className="grow text-lg font-medium text-gray-900">Trash</h1>
        {data.length > 0 && (
          <Button size="sm" variant="secondary" onPress={() => void empty()}>
            Empty trash
          </Button>
        )}
      </div>
      <div className="min-h-0 grow overflow-y-auto pb-8">
        {error ? (
          <ErrorState error={error} />
        ) : isLoading && data.length === 0 ? (
          <LoadingState />
        ) : data.length === 0 ? (
          <EmptyState
            title="The trash is empty"
            illustration={<TrashIllustration />}
            description="Deleted documents stay here until you delete them forever."
          />
        ) : (
          <ul aria-label="Deleted items">
            {data.map((item) => (
              <Item key={`${item.kind}:${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// The sidebar's "Trash" entry, laid out as Home's (`HomeLink`): current while the trash is open.
function TrashLink() {
  const current = useActiveTab()?.path === "/trash";
  const hotkeys = useShortcut("trash.open");
  const button = (
    <PageLink
      path={"/trash"}
      aria-current={current ? "page" : undefined}
      className={sidebarItemStyles({ isCurrent: current, className: "mx-2 gap-1.5 px-1.5" })}
    >
      <Delete2Regular aria-hidden className="size-4 text-gray-500" />
      Trash
    </PageLink>
  );
  return hotkeys ? (
    <WithTooltip label="Open trash" hotkeys={hotkeys} placement="right">
      {button}
    </WithTooltip>
  ) : (
    button
  );
}

export const trashPlugin = definePlugin({
  id: "trash",
  name: "Trash",
  description: "Restore or permanently delete trashed documents.",
  activate(ctx) {
    ctx.views.register({
      path: "/trash",
      component: TrashView,
      title: "Trash",
      icon: <Delete2Regular />,
    });
    ctx.sidebar.register({ id: "trash", order: 900, component: TrashLink });
    ctx.commands.register({
      id: "trash.open",
      title: "Open trash",
      icon: <Delete2Regular />,
      group: "Navigation",
      keybinding: "G T",
      operation: "trash.list",
      run: ({ app }) => app.open("/trash", { mode: "tab" }),
    });
  },
});

export default trashPlugin;
