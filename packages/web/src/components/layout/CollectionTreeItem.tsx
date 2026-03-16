import { Add16Filled, MoreHorizontalRegular } from "@fluentui/react-icons";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { useNavigate } from "@tanstack/react-router";
import { cx } from "cva";
import { useSetAtom } from "jotai";
import { memo, useState } from "react";
import { Button as RACButton, GridListItem, MenuTrigger } from "react-aria-components";

import { openBackgroundTabAtom, openPersistentTabAtom, openPreviewTabAtom } from "@/atoms/tabs";
import { CollectionMenu } from "@/components/collections/CollectionMenu";
import { useDocumentActions } from "@/hooks/use-document-actions";

import { TreeItemIcon } from "./TreeItemIcon";

type Collection = {
  id: string;
  name: string;
};

type Props = {
  collection: Collection;
  isActive: boolean;
  organizationSlug: string;
};

export const CollectionTreeItem = memo(function CollectionTreeItem({
  collection,
  isActive,
  organizationSlug,
}: Props) {
  const { createDocument } = useDocumentActions();
  const navigate = useNavigate() as (options: {
    to: string;
    params?: Record<string, string>;
    from?: string;
  }) => void;
  const openPersistentTab = useSetAtom(openPersistentTabAtom);
  const openPreviewTab = useSetAtom(openPreviewTabAtom);
  const openBackgroundTab = useSetAtom(openBackgroundTabAtom);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const collectionTabId = `collection:${collection.id}`;

  const handleNavigate = () => {
    navigate({
      to: "/w/$organizationSlug/collections/$collectionId",
      params: { collectionId: collection.id },
      from: "/w/$organizationSlug",
    });
  };

  const openCollection = (mode: "preview" | "persistent" | "background") => {
    if (mode === "background") {
      openBackgroundTab({ documentId: collectionTabId, title: collection.name });
      return;
    }

    if (mode === "persistent") {
      openPersistentTab({ documentId: collectionTabId, title: collection.name });
    } else {
      openPreviewTab({ documentId: collectionTabId, title: collection.name });
    }

    handleNavigate();
  };

  const handleAddDocument = () => {
    void createDocument(undefined, undefined, undefined, collection.id);
  };

  return (
    <GridListItem
      id={collection.id}
      textValue={collection.name}
      onAction={() => openCollection("preview")}
      onDoubleClick={() => openCollection("persistent")}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
          openCollection("background");
        }
      }}
      className={cx(
        sidebarItemStyles({
          isCurrent: isActive,
          className: "group cursor-default pr-1",
        }),
      )}
      style={{
        paddingLeft: "0.5rem",
        paddingRight: "0.5rem",
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-x-1">
        <TreeItemIcon
          type="collection"
          isExpanded={false}
          hasChildren={false}
          isMenuOpen={isMenuOpen}
        />
        <span className="truncate">{collection.name}</span>
      </div>

      <div
        className={`pointer-events-none flex items-center gap-x-px pl-1 ${isMenuOpen ? "relative" : "absolute right-0 opacity-0 group-hover:opacity-100 group-hover:relative"}`}
      >
        <TooltipTrigger delay={500}>
          <RACButton
            onPress={handleAddDocument}
            className="pointer-events-auto rounded-md p-0.5 text-black hover:bg-black/5 hover:text-black/60 flex items-center justify-center"
            aria-label="Add collection entry"
          >
            <Add16Filled className={sidebarItemIconStyles({ className: "size-3.5" })} />
          </RACButton>
          <Tooltip placement="top" offset={8}>
            Add collection entry
          </Tooltip>
        </TooltipTrigger>
        <MenuTrigger isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <RACButton
            className="pointer-events-auto rounded-md p-0.5 text-black hover:bg-black/5 hover:text-black/60 flex items-center justify-center"
            aria-label="Collection options"
          >
            <MoreHorizontalRegular className={sidebarItemIconStyles({ className: "size-4" })} />
          </RACButton>
          <CollectionMenu
            collectionId={collection.id}
            collectionName={collection.name}
            organizationSlug={organizationSlug}
          />
        </MenuTrigger>
      </div>
    </GridListItem>
  );
});
