// The view tabs: switch, add (by type), rename, duplicate, change type, delete, and reorder by
// dragging. Every change is an operation. As in Notion, the tabs take the bar's width and no
// more: the ones that do not fit go under "N more…". A view's menu has no button of its own
// (one appearing on the open tab shifted the bar): it opens on right-click, on a click on the
// open tab, and with Shift+F10 or the menu key.
import { useApp, useOps } from "@lydie/plugin-api";
import { VIEW_TYPES } from "@lydie/plugin-api/databases";
import type { DatabaseDefinition, DatabaseView, ViewType } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  BoardViewIllustration,
  buttonStyles,
  CalendarRegular,
  CalendarViewIllustration,
  Columns2Regular,
  ListViewIllustration,
  Rows3Regular,
  TableRegular,
  TableViewIllustration,
  TextField,
} from "@lydie/plugin-api/ui";
import type { Icon, IllustrationProps } from "@lydie/plugin-api/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";

import { fitTabs } from "./tabs-model.ts";
import { AnchoredPopover, MenuButtonItem, PanelSection, PopoverButton } from "./ui.tsx";

export const VIEW_LABELS: Record<ViewType, string> = {
  table: "Table",
  board: "Board",
  list: "List",
  calendar: "Calendar",
};

export const VIEW_ICONS: Record<ViewType, Icon> = {
  table: TableRegular,
  board: Columns2Regular,
  list: Rows3Regular,
  calendar: CalendarRegular,
};

// The "New view" menu draws each type rather than showing its icon.
const VIEW_DRAWINGS: Record<ViewType, (props: IllustrationProps) => ReactNode> = {
  table: TableViewIllustration,
  board: BoardViewIllustration,
  list: ListViewIllustration,
  calendar: CalendarViewIllustration,
};

const VIEW_HINTS: Record<ViewType, string> = {
  table: "Pages and properties in a grid",
  board: "Cards in columns",
  list: "One page per line",
  calendar: "Pages on their dates",
};

const VIEW_MIME = "application/x-lydie-db-view";

// A tab's look, shared by the tabs and their invisible copies that are measured.
const tabClass =
  "relative flex h-7 max-w-64 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-solid outline-0 outline-offset-2 outline-blue-600 focus-visible:outline-2";
const moreClass = buttonStyles({
  variant: "ghost",
  size: "sm",
  className: "h-7 px-3 text-sm font-medium text-gray-500",
});

export function ViewTabs({
  definition,
  activeId,
  onSelect,
}: {
  definition: DatabaseDefinition;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const ops = useOps();
  const app = useApp();
  const views = definition.views;
  const { rootRef, measureRef, addRef, hiddenIds } = useTabFit(views, activeId);
  // The open menu and the name typed in it, saved as the menu closes.
  const [menu, setMenu] = useState<{ id: string; name: string } | null>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const databaseId = definition.database.id;
  const fail = (title: string) => (error: unknown) =>
    app.notify({
      title,
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });

  const addView = async (type: ViewType) => {
    const base = VIEW_LABELS[type];
    const taken = new Set(definition.views.map((v) => v.name));
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
    try {
      const view = await ops.database.createView({ databaseId, name, type });
      onSelect(view.id);
    } catch (error) {
      fail("Could not add the view")(error);
    }
  };

  const onDrop = (event: DragEvent, beforeId: string | null) => {
    const id = event.dataTransfer.getData(VIEW_MIME);
    setDropBefore(null);
    if (!id || id === beforeId) return;
    event.preventDefault();
    const input = beforeId ? { id, beforeId } : { id, afterId: definition.views.at(-1)?.id ?? id };
    if (input.afterId === id) return;
    void ops.database
      .moveView(input, { label: "Reorder views" })
      .catch(fail("Could not move the view"));
  };

  const openMenu = (view: DatabaseView, anchor: HTMLElement) => {
    menuAnchor.current = anchor;
    setMenu({ id: view.id, name: view.name });
  };
  const menuView = menu ? views.find((v) => v.id === menu.id) : undefined;
  const closeMenu = () => {
    if (!menu) return;
    const name = menu.name.trim();
    setMenu(null);
    menuAnchor.current?.focus();
    if (menuView && name && name !== menuView.name)
      void ops.database.renameView({ id: menuView.id, name }).catch(fail("Could not rename"));
  };

  const shown = views.filter((v) => !hiddenIds.includes(v.id));
  const hidden = views.filter((v) => hiddenIds.includes(v.id));

  return (
    // The padding (taken back by the margin) keeps the tabs' focus rings inside the bar.
    <div
      ref={rootRef}
      className="relative -mb-px -ml-1 flex min-w-0 flex-1 items-center self-end pt-1 pb-2 pl-1"
    >
      <div
        role="tablist"
        aria-label="Views"
        className="flex min-w-0 items-center"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(VIEW_MIME)) event.preventDefault();
        }}
        onDrop={(event) => onDrop(event, null)}
      >
        {shown.map((view) => {
          const current = view.id === activeId;
          return (
            // The open view is marked by a line on the bar's bottom edge, not by a fill.
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={current}
              aria-haspopup={current ? "dialog" : undefined}
              aria-expanded={current ? menu?.id === view.id : undefined}
              data-view-id={view.id}
              data-current={current || undefined}
              className={`${tabClass} ${
                current
                  ? "text-gray-950 after:absolute after:inset-x-2.5 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-gray-950"
                  : "text-gray-500 hover:bg-gray-950/5 hover:text-gray-950"
              } ${dropBefore === view.id ? "shadow-[inset_2px_0_0_var(--color-blue-500)]" : ""}`}
              onClick={(event) =>
                current ? openMenu(view, event.currentTarget) : onSelect(view.id)
              }
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(view, event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                event.preventDefault();
                openMenu(view, event.currentTarget);
              }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(VIEW_MIME, view.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(VIEW_MIME)) return;
                event.preventDefault();
                setDropBefore(view.id);
              }}
              onDragLeave={() => setDropBefore(null)}
              onDrop={(event) => {
                event.stopPropagation();
                onDrop(event, view.id);
              }}
            >
              <TabFace view={view} current={current} />
            </button>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <PopoverButton
          label={`${hidden.length} more ${hidden.length === 1 ? "view" : "views"}`}
          button={`${hidden.length} more…`}
          className={moreClass}
        >
          {(close) => (
            <PanelSection>
              {hidden.map((view) => {
                const ViewIcon = VIEW_ICONS[view.type];
                return (
                  <MenuButtonItem
                    key={view.id}
                    onPress={() => {
                      close();
                      onSelect(view.id);
                    }}
                  >
                    <ViewIcon aria-hidden className="size-3.5 text-gray-500" />
                    <span className="truncate">{view.name}</span>
                  </MenuButtonItem>
                );
              })}
            </PanelSection>
          )}
        </PopoverButton>
      )}
      {/* Copies of every tab and of "N more…", invisible, to measure what fits. */}
      <div
        aria-hidden
        inert
        className="pointer-events-none invisible absolute inset-0 overflow-hidden"
      >
        <div ref={measureRef} className="flex w-max">
          {views.map((view) => (
            <span key={view.id} className={tabClass}>
              <TabFace view={view} current={false} />
            </span>
          ))}
          <span className={moreClass}>{views.length} more…</span>
        </div>
      </div>
      {menu && menuView && (
        <AnchoredPopover
          anchor={menuAnchor}
          label={`View options for ${menuView.name}`}
          onClose={closeMenu}
        >
          <ViewMenu
            view={menuView}
            name={menu.name}
            onName={(name) => setMenu({ ...menu, name })}
            onDone={closeMenu}
            canDelete={views.length > 1}
            onDuplicate={() => {
              closeMenu();
              void ops.database
                .duplicateView({ id: menuView.id })
                .then((copy) => onSelect(copy.id))
                .catch(fail("Could not duplicate"));
            }}
            onType={(type) => {
              closeMenu();
              void ops.database
                .updateView({ id: menuView.id, type, config: {} })
                .catch(fail("Could not change the view type"));
            }}
            onDelete={() => {
              setMenu(null);
              // The open view goes to its neighbour (the next one, or the one before the last)
              // first, so the screen never shows a view that is gone.
              if (menuView.id === activeId) {
                const index = views.indexOf(menuView);
                const next = views[index + 1] ?? views[index - 1];
                if (next) onSelect(next.id);
              }
              void ops.database
                .deleteView({ id: menuView.id })
                .catch(fail("Could not delete the view"));
            }}
          />
        </AnchoredPopover>
      )}
      <div ref={addRef} className="flex shrink-0 items-center">
        <PopoverButton label="Add a view" button={<AddRegular aria-hidden />} size="icon-sm">
          {(close) => (
            <PanelSection title="New view">
              <div className="w-64">
                {VIEW_TYPES.map((type) => {
                  const Drawing = VIEW_DRAWINGS[type];
                  return (
                    <MenuButtonItem
                      key={type}
                      onPress={() => {
                        close();
                        void addView(type);
                      }}
                    >
                      <span className="flex h-10 w-14 shrink-0 items-center justify-center">
                        <Drawing size="xs" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium text-gray-900">{VIEW_LABELS[type]}</span>
                        <span className="truncate text-xs text-gray-500">{VIEW_HINTS[type]}</span>
                      </span>
                    </MenuButtonItem>
                  );
                })}
              </div>
            </PanelSection>
          )}
        </PopoverButton>
      </div>
    </div>
  );
}

// The name as a field at the top (as in Notion): typing renames, saved when the menu closes.
function ViewMenu({
  view,
  name,
  onName,
  onDone,
  canDelete,
  onDuplicate,
  onType,
  onDelete,
}: {
  view: DatabaseView;
  name: string;
  onName: (name: string) => void;
  onDone: () => void;
  canDelete: boolean;
  onDuplicate: () => void;
  onType: (type: ViewType) => void;
  onDelete: () => void;
}) {
  return (
    <div className="w-56">
      <div className="p-2 pb-1">
        <TextField
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the menu opens to rename as in Notion
          autoFocus
          aria-label="View name"
          value={name}
          onChange={onName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onDone();
              return;
            }
            // react-aria stops a handled key here; Escape has to reach the popover to close it.
            event.continuePropagation();
          }}
        />
      </div>
      <PanelSection>
        <MenuButtonItem onPress={onDuplicate}>Duplicate</MenuButtonItem>
      </PanelSection>
      <PanelSection title="Layout">
        {VIEW_TYPES.map((type) => (
          <MenuButtonItem key={type} selected={view.type === type} onPress={() => onType(type)}>
            {VIEW_LABELS[type]}
          </MenuButtonItem>
        ))}
      </PanelSection>
      <PanelSection>
        <MenuButtonItem danger disabled={!canDelete} onPress={onDelete}>
          Delete view
        </MenuButtonItem>
      </PanelSection>
    </div>
  );
}

function TabFace({ view, current }: { view: DatabaseView; current: boolean }) {
  const ViewIcon = VIEW_ICONS[view.type];
  return (
    <>
      <ViewIcon aria-hidden className={`size-3.5 shrink-0 ${current ? "" : "opacity-70"}`} />
      <span className="truncate">{view.name}</span>
    </>
  );
}

// Measures the invisible copies against the bar's width (less "add a view") whenever either
// changes, before paint, so the bar never shows tabs that do not fit. What is hidden is kept by
// view id, not position: the render after a view is added or deleted comes before the next
// measurement, and positions from the one before would point at the wrong views (or none).
function useTabFit(views: readonly DatabaseView[], activeId: string) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([]);
  const [resized, setResized] = useState(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setResized((n) => n + 1));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const copies = measureRef.current;
    if (!root || !copies) return;
    const items = [...copies.children] as HTMLElement[];
    const more = items.pop();
    const style = getComputedStyle(root);
    const available =
      root.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      (addRef.current?.offsetWidth ?? 0);
    const next = fitTabs({
      widths: items.map((el) => el.getBoundingClientRect().width),
      available,
      moreWidth: more?.getBoundingClientRect().width ?? 0,
      gap: 0,
      active: views.findIndex((v) => v.id === activeId),
    });
    const hidden = next.hidden.map((i) => views[i]!.id);
    setHiddenIds((prev) => (prev.join() === hidden.join() ? prev : hidden));
  }, [views, activeId, resized]);

  return { rootRef, measureRef, addRef, hiddenIds };
}
