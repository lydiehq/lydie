import { DocIcon, docIdOf, prefetchDoc, useActiveTab, useApp, useBackend } from "@lydie/plugin-api";
import type { Document } from "@lydie/plugin-api";
import {
  Button,
  ContextMenu,
  focusRingInsetClass,
  sidebarItemStyles,
  sidebarSectionTitleClass,
  StarFilled,
} from "@lydie/plugin-api/ui";
import type { ContextMenuItem } from "@lydie/plugin-api/ui";
import { useMemo, useState, useSyncExternalStore } from "react";

import { favoritesOf, watchFavoriteDocs } from "./favorites.ts";

const MENU: ContextMenuItem[] = [
  { id: "open-tab", label: "Open in new tab" },
  { id: "open-split", label: "Open to the right" },
  { type: "separator", id: "s1" },
  { id: "remove", label: "Remove from favorites" },
];

// The sidebar's "Favorites", above the documents. Nothing at all while there are none.
export function FavoritesSection() {
  const app = useApp();
  const backend = useBackend();
  const favorites = favoritesOf(app);
  const ids = useSyncExternalStore(favorites.subscribe, favorites.ids, favorites.ids);
  const watch = useMemo(() => watchFavoriteDocs(backend, ids), [backend, ids]);
  const docs = useSyncExternalStore(watch.subscribe, watch.docs, watch.docs);
  const activeId = docIdOf(useActiveTab()?.path);
  const [menu, setMenu] = useState<{ doc: Document; x: number; y: number } | null>(null);

  if (docs.length === 0) return null;

  const onMenuAction = (doc: Document, action: string) => {
    if (action === "open-tab") app.openDoc(doc.id, { mode: "tab" });
    else if (action === "open-split") app.openDoc(doc.id, { mode: "split" });
    else if (action === "remove") favorites.toggle(doc.id);
  };

  return (
    <>
      <div className="flex items-center pr-3 pb-1 pl-4">
        <h2 className={sidebarSectionTitleClass}>Favorites</h2>
      </div>
      <ul aria-label="Favorites" className="max-h-64 scroll-fade overflow-y-auto px-2">
        {docs.map((doc) => {
          const title = doc.title || "Untitled";
          const current = doc.id === activeId;
          return (
            <li
              key={doc.id}
              data-testid="favorite-row"
              className={sidebarItemStyles({
                isCurrent: current,
                className: `pr-1 select-none ${current ? "text-gray-900" : ""}`,
              })}
            >
              {/* A plain button: the middle click and the context menu need the DOM events. */}
              <button
                type="button"
                aria-current={current ? "page" : undefined}
                onMouseEnter={() => void prefetchDoc(backend, doc.id)}
                onClick={(event) => app.openDoc(doc.id, { mode: app.modeFor(event) })}
                onAuxClick={(event) => {
                  if (event.button === 1) app.openDoc(doc.id, { mode: "tab" });
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ doc, x: event.clientX, y: event.clientY });
                }}
                className={`flex min-w-0 grow cursor-default items-center gap-1 self-stretch rounded-lg pl-2 text-left ${focusRingInsetClass}`}
              >
                {/* The tree rows' icon slot, so favorites line up with the documents below. */}
                <span className="-ml-1 flex size-5 shrink-0 items-center justify-center text-gray-500">
                  <DocIcon id={doc.id} properties={doc.properties} className="size-4" />
                </span>
                <span className="min-w-0 grow truncate">{title}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${title} from favorites`}
                tooltip="Remove from favorites"
                tooltipOptions={{ placement: "top", offset: 8 }}
                onPress={() => favorites.toggle(doc.id)}
                className="hidden shrink-0 text-gray-500 group-hover:flex hover:text-gray-700 focus-visible:flex pointer-coarse:flex"
              >
                <StarFilled />
              </Button>
            </li>
          );
        })}
      </ul>
      <ContextMenu
        label="Favorite actions"
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? MENU : []}
        onAction={(action) => menu && onMenuAction(menu.doc, action)}
        onClose={() => setMenu(null)}
      />
    </>
  );
}
