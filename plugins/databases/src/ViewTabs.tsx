// The view tabs: switch, add (by type), rename (double-click or menu), duplicate, change type,
// delete, and reorder by dragging. Every change is an operation.
import { useApp, useOps } from "@lydie/plugin-api";
import { VIEW_TYPES } from "@lydie/plugin-api/databases";
import type { DatabaseDefinition, DatabaseView, ViewType } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  CalendarRegular,
  Columns2Regular,
  DownRegular,
  Input,
  PicRegular,
  Rows3Regular,
  TableRegular,
} from "@lydie/plugin-api/ui";
import type { Icon } from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { DragEvent } from "react";

import { MenuButtonItem, PanelSection, PopoverButton } from "./ui.tsx";

export const VIEW_LABELS: Record<ViewType, string> = {
  table: "Table",
  board: "Board",
  list: "List",
  calendar: "Calendar",
  gallery: "Gallery",
};

export const VIEW_ICONS: Record<ViewType, Icon> = {
  table: TableRegular,
  board: Columns2Regular,
  list: Rows3Regular,
  calendar: CalendarRegular,
  gallery: PicRegular,
};

const VIEW_MIME = "application/x-lydie-db-view";

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
  const [renaming, setRenaming] = useState<string | null>(null);
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

  return (
    // The tabs scroll when the bar has no room for them all; "add a view" stays beside them.
    <div className="-mb-px flex min-w-0 self-end">
      {/* The padding (taken back by the margin) keeps the focus ring inside the scrolling list;
          an edge with tabs past it fades out, so a tab cut off there reads as "more this way". */}
      <div
        role="tablist"
        aria-label="Views"
        className="-ml-1 flex min-w-0 scroll-fade-x scroll-fade-3 items-center gap-1 overflow-x-auto pt-1 pr-3 pb-2 pl-1 [scrollbar-width:none]"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(VIEW_MIME)) event.preventDefault();
        }}
        onDrop={(event) => onDrop(event, null)}
      >
        {definition.views.map((view) => {
          if (renaming === view.id) {
            return (
              <RenameField
                key={view.id}
                view={view}
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== view.name)
                    void ops.database
                      .renameView({ id: view.id, name })
                      .catch(fail("Could not rename"));
                }}
              />
            );
          }
          const current = view.id === activeId;
          const ViewIcon = VIEW_ICONS[view.type];
          return (
            // One pill holding the tab and, on the open view, its menu: the ring goes round the
            // pill. The open view is marked by a line on the bar's bottom edge, not by a fill.
            <div
              key={view.id}
              data-current={current || undefined}
              className={`relative flex h-7 shrink-0 items-center rounded-full text-sm font-medium outline-solid outline-0 outline-offset-2 outline-blue-600 has-[:focus-visible]:outline-2 ${
                current
                  ? "text-gray-950 after:absolute after:inset-x-2.5 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-gray-950"
                  : "text-gray-500 hover:bg-gray-950/5 hover:text-gray-950"
              } ${dropBefore === view.id ? "shadow-[inset_2px_0_0_var(--color-blue-500)]" : ""}`}
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
              {/* Plain: Button has no role="tab" and the pill around it is the drag source. */}
              <button
                type="button"
                role="tab"
                aria-selected={current}
                data-view-id={view.id}
                onClick={() => onSelect(view.id)}
                onDoubleClick={() => setRenaming(view.id)}
                className={`flex h-full items-center gap-1.5 rounded-[inherit] pl-3 outline-none ${current ? "pr-1" : "pr-3"}`}
              >
                <ViewIcon aria-hidden className={`size-3.5 ${current ? "" : "opacity-70"}`} />
                {view.name}
              </button>
              {current && (
                <PopoverButton
                  label={`View options for ${view.name}`}
                  button={<DownRegular aria-hidden className="size-3 opacity-60" />}
                  size="icon-xs"
                  className="mr-1.5 size-4 rounded-full focus-visible:outline-0"
                >
                  {(close) => (
                    <ViewMenu
                      view={view}
                      canDelete={definition.views.length > 1}
                      onRename={() => {
                        close();
                        setRenaming(view.id);
                      }}
                      onDuplicate={() => {
                        close();
                        void ops.database
                          .duplicateView({ id: view.id })
                          .then((copy) => onSelect(copy.id))
                          .catch(fail("Could not duplicate"));
                      }}
                      onType={(type) => {
                        close();
                        void ops.database
                          .updateView({ id: view.id, type, config: {} })
                          .catch(fail("Could not change the view type"));
                      }}
                      onDelete={() => {
                        close();
                        const next = definition.views.find((v) => v.id !== view.id);
                        void ops.database
                          .deleteView({ id: view.id })
                          .then(() => next && onSelect(next.id))
                          .catch(fail("Could not delete the view"));
                      }}
                    />
                  )}
                </PopoverButton>
              )}
            </div>
          );
        })}
      </div>
      <div className="-ml-1 flex shrink-0 items-center pt-1 pb-2">
        <PopoverButton label="Add a view" button={<AddRegular aria-hidden />} size="icon-sm">
          {(close) => (
            <PanelSection title="New view">
              {VIEW_TYPES.map((type) => {
                const TypeIcon = VIEW_ICONS[type];
                return (
                  <MenuButtonItem
                    key={type}
                    onPress={() => {
                      close();
                      void addView(type);
                    }}
                  >
                    <TypeIcon aria-hidden className="size-3.5 text-gray-500" />
                    {VIEW_LABELS[type]}
                  </MenuButtonItem>
                );
              })}
            </PanelSection>
          )}
        </PopoverButton>
      </div>
    </div>
  );
}

function ViewMenu({
  view,
  canDelete,
  onRename,
  onDuplicate,
  onType,
  onDelete,
}: {
  view: DatabaseView;
  canDelete: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onType: (type: ViewType) => void;
  onDelete: () => void;
}) {
  return (
    <div className="w-56">
      <PanelSection>
        <MenuButtonItem onPress={onRename}>Rename</MenuButtonItem>
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

function RenameField({ view, onDone }: { view: DatabaseView; onDone: (name: string) => void }) {
  const [value, setValue] = useState(view.name);
  return (
    <Input
      size="sm"
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- renaming starts by focusing the field
      autoFocus
      aria-label="View name"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(value.trim());
        if (event.key === "Escape") onDone(view.name);
      }}
      className="w-32 flex-none"
    />
  );
}
