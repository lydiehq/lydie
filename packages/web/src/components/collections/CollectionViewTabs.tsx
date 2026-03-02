import { MoreHorizontalRegular } from "@fluentui/react-icons";
import { Menu, MenuItem, MenuSeparator } from "@lydie/ui/components/generic/Menu";
import { Button as RACButton, MenuTrigger } from "react-aria-components";
import type { ReactNode } from "react";

export type CollectionViewType = "table" | "kanban";

export type CollectionViewTab = {
  id: string;
  name: string;
  type: CollectionViewType;
};

type CollectionViewTabsProps = {
  views: CollectionViewTab[];
  selectedViewId: string | null;
  onSelectView: (viewId: string) => void;
  renderViewActions?: (view: CollectionViewTab) => ReactNode;
  endSlot?: ReactNode;
};

type CollectionViewTabMenuProps = {
  view: CollectionViewTab;
  canDelete: boolean;
  onOpenEditor: (viewId: string) => void;
  onChangeType: (viewId: string, type: CollectionViewType) => void;
  onDelete: (viewId: string) => void;
};

export function CollectionViewTabs({
  views,
  selectedViewId,
  onSelectView,
  renderViewActions,
  endSlot,
}: CollectionViewTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => {
        const isSelected = view.id === selectedViewId;

        return (
          <div
            key={view.id}
            className={`group inline-flex items-center rounded-lg border pr-1 transition-colors ${
              isSelected
                ? "border-gray-300 bg-gray-100"
                : "border-transparent bg-white hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectView(view.id)}
              aria-current={isSelected ? "page" : undefined}
              className={`inline-flex max-w-52 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                isSelected ? "text-gray-900" : "text-gray-600"
              }`}
            >
              <span className="truncate font-medium">{view.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">{view.type}</span>
            </button>
            {renderViewActions ? renderViewActions(view) : null}
          </div>
        );
      })}
      {endSlot}
    </div>
  );
}

export function CollectionViewTabMenu({
  view,
  canDelete,
  onOpenEditor,
  onChangeType,
  onDelete,
}: CollectionViewTabMenuProps) {
  return (
    <MenuTrigger>
      <RACButton
        aria-label={`Open ${view.name} view menu`}
        className="mr-0.5 rounded p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
      >
        <MoreHorizontalRegular className="size-3.5" />
      </RACButton>
      <Menu placement="bottom end">
        <MenuItem onAction={() => onOpenEditor(view.id)}>Edit view settings</MenuItem>
        <MenuSeparator />
        <MenuItem onAction={() => onChangeType(view.id, "table")}>Show as table</MenuItem>
        <MenuItem onAction={() => onChangeType(view.id, "kanban")}>Show as board</MenuItem>
        <MenuSeparator />
        <MenuItem onAction={() => onDelete(view.id)} isDisabled={!canDelete}>
          Delete view
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
