// Actions on the picked pages (each one operation, one undo step): edit a property on all of
// them, duplicate, delete.
import { pageColumnClass, Portal, useApp, useOps, useTab } from "@lydie/plugin-api";
import { isEditableType, PropertyEditor, TypeIcon } from "@lydie/plugin-api/databases";
import type { DatabaseProperty } from "@lydie/plugin-api/databases";
import {
  Button,
  CloseRegular,
  Copy2Regular,
  Delete2Regular,
  Edit2Regular,
} from "@lydie/plugin-api/ui";
import { useState } from "react";

import { useViewContext } from "../context.tsx";
import { MenuButtonItem, PopoverButton } from "../ui.tsx";

export function BulkBar({
  ids,
  onClear,
  onSelectAll,
}: {
  ids: ReadonlySet<string>;
  onClear: () => void;
  onSelectAll: () => void;
}) {
  const { definition, databaseId, fullWidth } = useViewContext();
  const ops = useOps();
  const app = useApp();
  const tab = useTab();
  // The tab's panel does not scroll (its view does), so the bar stays at the bottom of the page
  // however far the table or the page around an embed is scrolled. A page in a collection's
  // panel has a tab of its own that is not in the layout: there it stays on its table.
  const container = tab ? document.getElementById(`tabpanel-${tab.id}`) : null;
  const [property, setProperty] = useState<DatabaseProperty | null>(null);
  const editable = definition.properties.filter(
    (p) => isEditableType(p.type) && p.type !== "title",
  );
  const rowIds = [...ids];
  const failed = (error: unknown) =>
    app.notify({
      title: "Could not change the pages",
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  // The shared ghost button, recoloured for the dark bar (its overrides win through tailwind-merge).
  const action =
    "text-surface hover:bg-surface/10 hover:text-surface pressed:bg-surface/15 disabled:opacity-40 [--button-radius:var(--radius-lg)]";
  const bar = (
    // A floating bar at the bottom of the page, as wide as its text column, dark on any theme
    // (gray-950 with text-surface).
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[40]">
      <div
        className={container ? pageColumnClass(fullWidth) : "mx-auto w-fit max-w-[calc(100%-2rem)]"}
      >
        <div
          role="toolbar"
          // The end-to-end suite finds the bar by this name.
          aria-label="Selected rows"
          className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl bg-gray-950 py-1 pr-1 pl-3 text-sm text-surface shadow-xl ring ring-surface/10"
        >
          <span
            className="mr-1 flex items-center border-r border-surface/20 pr-3 font-medium"
            data-testid="selected-count"
          >
            <span className="mr-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-semibold text-white">
              {ids.size}
            </span>{" "}
            selected
          </span>
          <Button variant="ghost" size="md" onPress={onSelectAll} className={`${action} px-2`}>
            Select all
          </Button>
          <PopoverButton
            label="Edit property"
            button={
              <>
                <Edit2Regular aria-hidden className="size-3.5" />
                Edit property
              </>
            }
            placement="top start"
            size="md"
            className={`${action} px-2`}
            isOpen={property ? true : undefined}
            onOpenChange={(open) => !open && setProperty(null)}
          >
            {(close) =>
              property ? (
                <PropertyEditor
                  property={property}
                  value={null}
                  onChange={(value) =>
                    void ops.database
                      .setValues(
                        { databaseId, rowIds, set: { [property.id]: value } },
                        { label: "Edit pages" },
                      )
                      .catch(failed)
                  }
                  onClose={() => {
                    setProperty(null);
                    close();
                  }}
                />
              ) : (
                <div className="flex w-56 flex-col p-1">
                  {editable.map((p) => (
                    <MenuButtonItem key={p.id} onPress={() => setProperty(p)}>
                      <TypeIcon
                        type={p.type}
                        aria-hidden
                        className="size-3.5 shrink-0 text-gray-500"
                      />
                      {p.name}
                    </MenuButtonItem>
                  ))}
                </div>
              )
            }
          </PopoverButton>
          <Button
            variant="ghost"
            size="md"
            isDisabled={rowIds.length > 1000}
            onPress={() =>
              void ops.database
                .duplicateRows(
                  { databaseId, rowIds },
                  { label: rowIds.length === 1 ? "Duplicate page" : "Duplicate pages" },
                )
                .then(onClear)
                .catch(failed)
            }
            className={`${action} px-2`}
          >
            <Copy2Regular aria-hidden className="size-3.5" />
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="md"
            onPress={() =>
              void ops.database
                .deleteRows(
                  { databaseId, rowIds },
                  { label: rowIds.length === 1 ? "Delete page" : `Delete ${rowIds.length} pages` },
                )
                .then(onClear)
                .catch(failed)
            }
            // 400 reads as red on the dark bar in both themes.
            className={`${action} px-2 text-red-400 hover:bg-red-500/15 hover:text-red-400 pressed:bg-red-500/20`}
          >
            <Delete2Regular aria-hidden className="size-3.5" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            aria-label="Clear selection"
            onPress={onClear}
            className={`${action} ml-auto`}
          >
            <CloseRegular aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
  return container ? <Portal container={container}>{bar}</Portal> : bar;
}
