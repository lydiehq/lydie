import type { ReactNode } from "react";

import {
  Add16Filled,
  ChevronRightRegular,
  Collections16Filled,
  Document16Filled,
  Home16Filled,
} from "@fluentui/react-icons";
import { cva } from "cva";
import {
  Button,
  Collection,
  type Key,
  Tree,
  TreeItem,
  TreeItemContent,
} from "react-aria-components";

import { Tooltip, TooltipTrigger } from "../generic/Tooltip";
import { Eyebrow } from "../layout/Eyebrow";
import { Separator } from "../layout/Separator";

const sidebarItemStyles = cva({
  base: "group flex items-center h-[30px] rounded-lg text-sm font-medium mb-0.5 [&.active]:bg-black/5 transition-colors duration-75",
  variants: {
    isCurrent: {
      true: "bg-black/5",
      false: "text-gray-600 hover:bg-black/3",
    },
  },
  defaultVariants: {
    isCurrent: false,
  },
});

const sidebarItemIconStyles = cva({
  base: "icon-muted",
});

type DocumentItem = {
  id: string;
  name: string;
  icon?: ReactNode;
  children?: DocumentItem[];
};

type ShowcaseSidebarProps = {
  title?: string;
  items: DocumentItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  showHeader?: boolean;
  showHomeLink?: boolean;
  className?: string;
};

export function ShowcaseSidebar({
  title = "Documents",
  items,
  selectedId,
  onSelect,
  showHeader = true,
  showHomeLink = false,
  className,
}: ShowcaseSidebarProps) {
  // Collect all item IDs with children to expand by default
  const getExpandedKeys = (): Set<Key> => {
    const collectIds = (docs: DocumentItem[]): Set<string> => {
      const ids = new Set<string>();
      for (const item of docs) {
        if (item.children && item.children.length > 0) {
          ids.add(item.id);
          const childIds = collectIds(item.children);
          childIds.forEach((id) => ids.add(id));
        }
      }
      return ids;
    };
    return collectIds(items) as Set<Key>;
  };

  const renderItem = (item: DocumentItem): ReactNode => {
    const hasChildren = item.children !== undefined && item.children.length > 0;
    const isCurrent = selectedId === item.id;

    return (
      <TreeItem
        key={item.id}
        id={item.id}
        textValue={item.name}
        onAction={() => onSelect?.(item.id)}
        className={sidebarItemStyles({ isCurrent })}
        style={{
          paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.40rem)`,
          paddingRight: "0.5rem",
        }}
        data-nosnippet
      >
        <TreeItemContent>
          {({ isExpanded }) => (
            <div className="flex items-center gap-x-1.5 flex-1 min-w-0">
              {hasChildren ? (
                <Button
                  slot="chevron"
                  className="text-gray-400 hover:text-gray-700 p-1 -ml-1 group/chevron relative cursor-default"
                >
                  <Collections16Filled
                    className={`size-4 shrink-0 ${sidebarItemIconStyles()} transition-[opacity_100ms,transform_200ms] group-hover:opacity-0`}
                  />
                  <ChevronRightRegular
                    className={`size-3 shrink-0 absolute inset-0 m-auto opacity-0 group-hover:opacity-100 group-hover/chevron:text-black/50 transition-[opacity_100ms,transform_200ms] ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </Button>
              ) : (
                <div className="text-gray-500 p-1 -ml-1">
                  <Document16Filled className={`size-4 shrink-0 ${sidebarItemIconStyles()}`} />
                </div>
              )}
              <span className="truncate">{item.name.trim() || "Untitled"}</span>
            </div>
          )}
        </TreeItemContent>
        {item.children && <Collection items={item.children}>{renderItem}</Collection>}
      </TreeItem>
    );
  };

  return (
    <div className={`shrink-0 flex w-[240px] flex-col rounded-lg bg-white/50 ${className || ""}`}>
      <div className="flex flex-col grow min-h-0">
        {showHeader && (
          <div className="flex items-center justify-between shrink-0 px-3 pt-3 pb-2">
            <Eyebrow>{title}</Eyebrow>
            <TooltipTrigger delay={500}>
              <Button
                className="p-1 rounded hover:bg-black/5 transition-colors cursor-default"
                aria-label="Add document"
              >
                <Add16Filled className="size-3.5 text-gray-500" />
              </Button>
              <Tooltip>Add document</Tooltip>
            </TooltipTrigger>
          </div>
        )}

        {showHomeLink && (
          <div className="px-2 pb-2">
            <div
              className={sidebarItemStyles({
                isCurrent: selectedId === "home",
              })}
              onClick={() => onSelect?.("home")}
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0 px-1.5">
                <Home16Filled className={`size-4 ${sidebarItemIconStyles()}`} />
                <span className="truncate flex-1">Home</span>
              </div>
            </div>
          </div>
        )}

        <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white px-2 py-2">
          <Tree
            aria-label={title}
            selectionMode="single"
            className="flex flex-col focus:outline-none"
            items={items}
            defaultExpandedKeys={getExpandedKeys()}
          >
            {renderItem}
          </Tree>
        </div>
      </div>
    </div>
  );
}

export { sidebarItemStyles, sidebarItemIconStyles };
export type { DocumentItem, ShowcaseSidebarProps };
