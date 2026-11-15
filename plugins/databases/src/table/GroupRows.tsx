/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a group header is a row of the ARIA grid */
// Body items that are not pages: a group's header (collapsible) and a "+ New" row per group.
import type { DatabaseProperty, GroupKey } from "@lydie/plugin-api/databases";
import { AddRegular, Button, CollapseArrow } from "@lydie/plugin-api/ui";

import { useViewContext } from "../context.tsx";
import { groupLabel } from "../view-model.ts";
import type { TableItem } from "../view-model.ts";
import { LEADING } from "./TableRow.tsx";

export function ExtraItem({
  item,
  ariaIndex,
  top,
  height,
  groupProperty,
  onAdd,
}: {
  item: Exclude<TableItem, { kind: "row" }>;
  ariaIndex: number;
  top: number;
  height: number;
  groupProperty: DatabaseProperty | undefined;
  onAdd: (group: GroupKey | undefined) => void;
}) {
  const { view, updateView } = useViewContext();
  if (item.kind === "add") {
    return (
      <div
        className="absolute left-0 flex items-center"
        style={{ top, height, width: "var(--grid-w)" }}
      >
        <div aria-hidden className="shrink-0" style={{ width: "var(--inset)" }} />
        <div aria-hidden className="shrink-0" style={{ width: LEADING }} />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onAdd(item.group)}
          className="sticky font-normal text-gray-500"
          style={{ left: LEADING }}
        >
          <AddRegular aria-hidden data-icon="inline-start" />
          New
        </Button>
      </div>
    );
  }
  const groupBy = view.config.groupBy;
  const key = item.group.key;
  return (
    <div
      role="row"
      aria-rowindex={ariaIndex}
      data-group={JSON.stringify(key)}
      className="absolute left-0 flex items-stretch bg-surface"
      style={{ top, height, width: "var(--grid-w)" }}
    >
      <div aria-hidden className="shrink-0" style={{ width: "var(--inset)" }} />
      <div className="flex grow items-end border-b border-gray-100">
        <div role="gridcell" aria-colindex={1} className="sticky left-0 z-[12] shrink-0">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={!item.collapsed}
            onPress={() => {
              if (!groupBy) return;
              const collapsed = groupBy.collapsed ?? [];
              updateView(
                {
                  groupBy: {
                    ...groupBy,
                    collapsed: item.collapsed
                      ? collapsed.filter((k) => k !== key)
                      : [...collapsed, key],
                  },
                },
                { label: item.collapsed ? "Expand group" : "Collapse group" },
              );
            }}
            className="mb-1 ml-1.5 gap-2 px-1.5 text-sm text-gray-800"
          >
            <CollapseArrow
              aria-hidden
              className={`size-2.5 text-gray-500 transition-transform ${item.collapsed ? "" : "rotate-90"}`}
            />
            {groupLabel(key, groupProperty)}
            <span className="text-xs font-normal text-gray-500">{item.group.count}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
