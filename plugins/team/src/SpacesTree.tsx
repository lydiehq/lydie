// The hosted workspace's pages grouped by where they live: each teamspace the user is in, their
// Private section, and pages shared with them from elsewhere. While teamspaces are hidden
// (`teamspacesShown`), the default teamspace is the "Workspace" section and there is no other.
// Shown in place of the flat document tree in hosted windows. Each group is the real document tree (`<DocumentTreeView>`: virtualised,
// drag and drop, inline rename, keyboard, icons, optimistic paint) over one space's top level;
// rows carry their space, and subpages share their parent's. Dropping a page into another group
// moves it to that space (`doc.moveToSpace`).
import {
  atTop,
  DocumentTreeView,
  spaceName,
  teamspacesShown,
  useAccount,
  useApp,
  useOps,
  useQuery,
} from "@lydie/plugin-api";
import type { ChildEntry, DocumentTreeDropTarget, DocumentTreeSpace } from "@lydie/plugin-api";
import { AddRegular, Button, RightRegular, sidebarSectionTitleClass } from "@lydie/plugin-api/ui";
import { useCallback, useEffect, useState } from "react";

import { errorText } from "./shared.tsx";

const PRIVATE = "private";
const SHARED = "shared";

type Group = {
  key: string;
  title: string;
  // Where new pages and dropped pages go; undefined: neither (shared with you).
  teamspaceId?: string | null;
  space?: DocumentTreeSpace;
  filterRoot?: (doc: ChildEntry) => boolean;
};

export function SpacesTree() {
  const app = useApp();
  const ops = useOps();
  const { state } = useAccount();
  const me = state.status === "signed-out" ? null : state.user.id;
  const workspaceId = app.workspace.workspaceId;
  const roots = useQuery("doc.children", { workspaceId, parentId: null }).data;
  const teamspaces = useQuery("workspace.teamspaces", { workspaceId }).data;
  const shown = teamspacesShown(teamspaces);
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set());
  // Collapsed groups are remembered per device, like the folders inside them.
  const collapsedKey = `team.spaces.collapsed:${workspaceId}`;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(app.storage.get<string[]>(collapsedKey) ?? []),
  );
  const toggleGroup = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
    app.storage.set(collapsedKey, [...next]);
  };

  // Shared with you: top-level pages in a teamspace the user is not in, or in someone else's
  // private section. A page created a moment ago may not have its owner yet: it is the user's.
  const isShared = useCallback(
    (doc: ChildEntry) => {
      if (doc.teamspaceId) return !joined.has(doc.teamspaceId);
      return Boolean(doc.privateOwnerId) && doc.privateOwnerId !== me;
    },
    [joined, me],
  );

  const groups: Group[] = [
    ...teamspaces
      .filter((t) => joined.has(t.id))
      .map((t) => ({
        key: t.id,
        title: spaceName(t, shown),
        teamspaceId: t.id,
        space: { teamspaceId: t.id },
      })),
    {
      key: PRIVATE,
      title: "Private",
      teamspaceId: null,
      space: me ? { teamspaceId: null, privateOwnerId: me } : { teamspaceId: null },
    },
    ...(roots.some(isShared)
      ? [{ key: SHARED, title: "Shared with you", filterRoot: isShared }]
      : []),
  ];

  const create = async (group: Group) => {
    try {
      const doc = await ops.doc.create({
        workspaceId,
        title: "Untitled",
        teamspaceId: group.teamspaceId ?? null,
        ...(await atTop(app.backend, workspaceId, null)),
      });
      app.openDoc(doc.id, { state: { focusTitle: true } });
    } catch (error) {
      app.notify({
        title: "Could not create the page",
        description: errorText(error),
        kind: "error",
      });
    }
  };

  // A page dragged in from another group: into this space (at its top level), then to the spot.
  const moveInto =
    (group: Group) =>
    async (id: string, target: DocumentTreeDropTarget): Promise<void> => {
      const account = app.services?.account;
      if (!account || group.teamspaceId === undefined) return;
      await account.call("doc.moveToSpace", { id, teamspaceId: group.teamspaceId });
      if (target.parentId !== null || target.beforeId || target.afterId) {
        await ops.doc.move({ id, ...target });
      }
      app.notify({ title: `Moved to ${group.title}` });
    };

  return (
    <div
      className="min-h-0 flex-1 scroll-fade overflow-y-auto px-2"
      data-testid="spaces-tree"
      data-scroll-root
    >
      {teamspaces.map((t) => (
        <Membership key={t.id} teamspaceId={t.id} me={me} report={setJoined} />
      ))}
      {groups.map((group) => {
        const hidden = collapsed.has(group.key);
        const canCreate = group.teamspaceId !== undefined;
        return (
          <section key={group.key} aria-label={group.title} className="mb-2">
            <div className="group flex h-7 items-center gap-1 px-2">
              {/* A plain button: the section title itself folds the group, styled as a title. */}
              <button
                type="button"
                aria-expanded={!hidden}
                onClick={() => toggleGroup(group.key)}
                className={`flex min-w-0 grow items-center gap-1 text-left hover:text-gray-700 ${sidebarSectionTitleClass}`}
              >
                <span className="truncate">{group.title}</span>
                <RightRegular
                  aria-hidden
                  className={`size-3 shrink-0 transition-transform ${hidden ? "" : "rotate-90"}`}
                />
              </button>
              {canCreate && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`New document in ${group.title}`}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  onPress={() => void create(group)}
                >
                  <AddRegular className="size-3.5" />
                </Button>
              )}
            </div>
            {!hidden && (
              <DocumentTreeView
                label={group.title}
                scroll="parent"
                dragKey={group.key}
                expandedKey={`team.spaces.expanded:${workspaceId}:${group.key}`}
                {...(group.space ? { space: group.space } : {})}
                {...(group.filterRoot ? { filterRoot: group.filterRoot } : {})}
                {...(canCreate
                  ? {
                      createInput: { teamspaceId: group.teamspaceId ?? null },
                      onForeignDrop: moveInto(group),
                    }
                  : {})}
                emptyState={<p className="px-2 py-1 text-xs text-gray-400">No documents yet</p>}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

// Whether the signed-in user is in a teamspace (renders nothing).
function Membership({
  teamspaceId,
  me,
  report,
}: {
  teamspaceId: string;
  me: string | null;
  report: (update: (joined: ReadonlySet<string>) => ReadonlySet<string>) => void;
}) {
  const members = useQuery("teamspace.members", { teamspaceId }).data;
  const member = Boolean(me && members.some((m) => m.userId === me));
  useEffect(() => {
    report((joined) => {
      if (joined.has(teamspaceId) === member) return joined;
      const next = new Set(joined);
      if (member) next.add(teamspaceId);
      else next.delete(teamspaceId);
      return next;
    });
  }, [teamspaceId, member, report]);
  return null;
}
