// The sidebar's "Collections": every collection in the workspace, wherever it is in the tree, by
// title. A shortcut like Favorites, not a second home: the collections stay pages in the tree.
// Nothing at all while there are none, so the sidebar hides the section's title too.
import {
  DocIcon,
  docIdOf,
  prefetchDoc,
  useActiveTab,
  useApp,
  useBackend,
  useQuery,
  useQuerySelect,
  useWorkspace,
} from "@lydie/plugin-api";
import type { DatabaseSummaryRow } from "@lydie/plugin-api/databases";
import { ContextMenu, focusRingInsetClass, sidebarItemStyles } from "@lydie/plugin-api/ui";
import type { ContextMenuItem } from "@lydie/plugin-api/ui";
import { useState } from "react";

const MENU: ContextMenuItem[] = [
  { id: "open-tab", label: "Open in new tab" },
  { id: "open-split", label: "Open to the right" },
];

export function CollectionsSection() {
  const app = useApp();
  const workspace = useWorkspace();
  const { data } = useQuery("database.list", { workspaceId: workspace.workspaceId });
  const activeId = docIdOf(useActiveTab()?.path);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  if (data.length === 0) return null;

  return (
    <>
      <ul aria-label="Collections" className="max-h-64 scroll-fade overflow-y-auto px-2">
        {data.map((collection) => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            current={collection.id === activeId}
            onMenu={(x, y) => setMenu({ id: collection.id, x, y })}
          />
        ))}
      </ul>
      <ContextMenu
        label="Collection actions"
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? MENU : []}
        onAction={(action) => {
          if (!menu) return;
          if (action === "open-tab") app.openDoc(menu.id, { mode: "tab" });
          else if (action === "open-split") app.openDoc(menu.id, { mode: "split" });
        }}
        onClose={() => setMenu(null)}
      />
    </>
  );
}

function CollectionRow({
  collection,
  current,
  onMenu,
}: {
  collection: DatabaseSummaryRow;
  current: boolean;
  onMenu: (x: number, y: number) => void;
}) {
  const app = useApp();
  const backend = useBackend();
  // For the page's own icon, when it has one; the collection icon otherwise.
  const properties = useQuerySelect(
    "doc.get",
    { id: collection.id },
    (s) => s.data[0]?.document.properties ?? null,
  );
  return (
    <li
      data-testid="collection-row"
      className={sidebarItemStyles({
        isCurrent: current,
        className: `pr-1 select-none ${current ? "text-gray-900" : ""}`,
      })}
    >
      {/* A plain button: the middle click and the context menu need the DOM events. */}
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        onMouseEnter={() => void prefetchDoc(backend, collection.id)}
        onClick={(event) => app.openDoc(collection.id, { mode: app.modeFor(event) })}
        onAuxClick={(event) => {
          if (event.button === 1) app.openDoc(collection.id, { mode: "tab" });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }}
        className={`flex min-w-0 grow cursor-default items-center gap-1 self-stretch rounded-lg pl-2 text-left ${focusRingInsetClass}`}
      >
        {/* The tree rows' icon slot, so the rows line up with the documents below. */}
        <span className="-ml-1 flex size-5 shrink-0 items-center justify-center text-gray-500">
          <DocIcon id={collection.id} properties={properties} className="size-4" />
        </span>
        <span className="min-w-0 grow truncate">{collection.title || "Untitled"}</span>
      </button>
    </li>
  );
}
