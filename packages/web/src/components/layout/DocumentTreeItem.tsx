import { Add12Regular, MoreHorizontalRegular, ReOrderRegular } from "@fluentui/react-icons";
import { sidebarItemStyles } from "@lydie/ui/components/editor/styles";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { composeTailwindRenderProps, focusRing } from "@lydie/ui/components/generic/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { type MouseEvent, type ReactElement, useRef, useState } from "react";
import { Button, Collection, MenuTrigger, TreeItem, TreeItemContent } from "react-aria-components";

import { openBackgroundTabAtom, openPersistentTabAtom, openPreviewTabAtom } from "@/atoms/tabs";
import { useDocumentActions } from "@/hooks/use-document-actions";

import { DocumentMenu } from "../documents/DocumentMenu";
import { TreeItemIcon } from "./TreeItemIcon";

type TreeDocumentItem = {
  id: string;
  name: string;
  type: "document";
  isCollection?: boolean;
  children?: TreeDocumentItem[];
};

type Props = {
  item: TreeDocumentItem;
  renderItem: (item: TreeDocumentItem) => ReactElement;
  isOpenInTabs?: boolean;
  disableDocumentActions?: boolean;
  defaultCollectionId?: string;
};

export function DocumentTreeItem({
  item,
  renderItem,
  isOpenInTabs,
  disableDocumentActions,
  defaultCollectionId,
}: Props) {
  const { id: currentDocId } = useParams({ strict: false });
  const navigate = useNavigate() as (options: {
    to: string;
    params?: Record<string, string>;
    from?: string;
  }) => void;
  const openPersistentTab = useSetAtom(openPersistentTabAtom);
  const openPreviewTab = useSetAtom(openPreviewTabAtom);
  const openBackgroundTab = useSetAtom(openBackgroundTabAtom);
  const lastClickTimeRef = useRef<number>(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isCurrent = currentDocId === item.id;
  const hasChildren = Boolean(item.children && item.children.length > 0);

  const openDocument = (mode: "preview" | "persistent" | "background") => {
    if (mode === "background") {
      openBackgroundTab({ documentId: item.id, title: item.name });
      return;
    }

    if (mode === "persistent") {
      openPersistentTab({ documentId: item.id, title: item.name });
    } else {
      openPreviewTab({ documentId: item.id, title: item.name });
    }

    navigate({
      to: "/w/$organizationSlug/$id",
      params: { id: item.id },
      from: "/w/$organizationSlug",
    });
  };

  const handleTitleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.metaKey && event.button === 0) {
      openDocument("background");
      return;
    }

    const now = Date.now();
    const isDoubleClick = now - lastClickTimeRef.current < 300;
    lastClickTimeRef.current = now;

    openDocument(isDoubleClick ? "persistent" : "preview");
  };

  return (
    <TreeItem
      id={item.id}
      textValue={item.name}
      onAction={() => openDocument("preview")}
      className={composeTailwindRenderProps(
        focusRing,
        sidebarItemStyles({
          isCurrent,
          className: "group cursor-default dragging:opacity-50 dragging:bg-gray-50 drop-target:bg-gray-200",
        }),
      )}
      style={{
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.5rem)`,
        paddingRight: "0.5rem",
      }}
    >
      <TreeItemContent>
        {({ isExpanded, allowsDragging }) => (
          <>
            {allowsDragging && (
              <Button
                slot="drag"
                className="absolute w-px h-px -m-px overflow-hidden whitespace-nowrap border-0"
                style={{ clip: "rect(0, 0, 0, 0)", clipPath: "inset(50%)" }}
                aria-label={`Drag ${item.name}`}
              >
                <ReOrderRegular className="size-3" />
              </Button>
            )}

            <div className="flex min-w-0 flex-1 items-center gap-x-1">
              <TreeItemIcon
                type={item.isCollection ? "collection" : "document"}
                isExpanded={isExpanded}
                hasChildren={hasChildren}
                isMenuOpen={isMenuOpen}
                inTabRegistry={isOpenInTabs}
              />
              <span
                onClick={handleTitleClick}
                className="truncate"
              >
                {item.name.trim() || "Untitled document"}
              </span>
            </div>

            <div className="flex items-center relative">
              <ItemContextMenu
                itemId={item.id}
                itemName={item.name}
                isMenuOpen={isMenuOpen}
                onMenuOpenChange={setIsMenuOpen}
                disableDocumentActions={disableDocumentActions}
                defaultCollectionId={defaultCollectionId}
              />
            </div>
          </>
        )}
      </TreeItemContent>
      {item.children && <Collection items={item.children}>{renderItem}</Collection>}
    </TreeItem>
  );
}

function ActionButton({
  ariaLabel,
  icon: Icon,
  onPress,
  tooltip,
}: {
  ariaLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  onPress?: () => void;
  tooltip?: string;
}) {
  const button = (
    <Button
      className="p-0.5 text-black hover:bg-black/5 hover:text-black/60 rounded-md flex items-center justify-center pressed:bg-black/8"
      aria-label={ariaLabel}
      onPress={onPress}
    >
      <Icon className="size-4 icon-muted" />
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <TooltipTrigger delay={500}>
      {button}
      <Tooltip placement="top" offset={8}>
        {tooltip}
      </Tooltip>
    </TooltipTrigger>
  );
}

function ItemContextMenu({
  itemId,
  itemName,
  isMenuOpen,
  onMenuOpenChange,
  disableDocumentActions,
  defaultCollectionId,
}: {
  itemId: string;
  itemName: string;
  isMenuOpen: boolean;
  onMenuOpenChange: (isOpen: boolean) => void;
  disableDocumentActions?: boolean;
  defaultCollectionId?: string;
}) {
  const { createDocument } = useDocumentActions();

  return (
    <div
      className={`flex gap-x-px items-center bg-inherit pl-1 ${isMenuOpen ? "relative" : "opacity-0 pointer-events-none absolute right-0 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:relative"}`}
    >
      {!disableDocumentActions && (
        <ActionButton
          ariaLabel="Add sub document"
          icon={Add12Regular}
          onPress={() =>
            createDocument(itemId, undefined, undefined, undefined, defaultCollectionId)
          }
          tooltip="Add page inside"
        />
      )}
      <MenuTrigger isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
        <ActionButton ariaLabel="Document options" icon={MoreHorizontalRegular} tooltip="Document options" />
        <DocumentMenu documentId={itemId} documentName={itemName} />
      </MenuTrigger>
    </div>
  );
}
