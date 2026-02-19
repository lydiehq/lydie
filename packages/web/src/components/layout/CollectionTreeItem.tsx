import { Add16Filled, MoreHorizontalRegular } from "@fluentui/react-icons";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { cx } from "cva";
import { memo, useMemo, useState, type ReactElement } from "react";
import { Button as RACButton, MenuTrigger, Tree } from "react-aria-components";

import { CollectionMenu } from "@/components/collections/CollectionMenu";
import { useOrganization } from "@/context/organization.context";
import { useCollectionDocumentDragDrop } from "@/hooks/use-collection-document-drag-drop";
import { useDocumentActions } from "@/hooks/use-document-actions";

import { DocumentTreeItem } from "./DocumentTreeItem";
import { TreeItemIcon } from "./TreeItemIcon";

type Collection = {
  id: string;
  name: string;
  properties: unknown;
};

type TreeDocumentItem = {
  id: string;
  name: string;
  type: "document";
  children?: TreeDocumentItem[];
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
  const { organization } = useOrganization();
  const { createDocument } = useDocumentActions();
  const navigate = useNavigate() as (options: {
    to: string;
    params?: Record<string, string>;
  }) => void;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [docs] = useQuery(
    queries.collections.documentsByCollection({
      organizationId: organization.id,
      collectionId: collection.id,
    }),
  );

  const hasRouteProperty = useMemo(() => {
    if (!Array.isArray(collection.properties)) {
      return false;
    }

    return collection.properties.some(
      (property) =>
        typeof property === "object" &&
        property !== null &&
        (property as { name?: string }).name?.toLowerCase() === "route",
    );
  }, [collection.properties]);

  const collectionDocuments = useMemo(() => docs ?? [], [docs]);

  const treeItems = useMemo(() => {
    const byParent = new Map<string | null, typeof collectionDocuments>();
    for (const document of collectionDocuments) {
      const key = document.parent_id ?? null;
      const current = byParent.get(key) ?? [];
      byParent.set(key, [...current, document]);
    }

    const buildNodes = (parentId: string | null): TreeDocumentItem[] => {
      const siblings = [...(byParent.get(parentId) ?? [])].sort(
        (first, second) => (first.sort_order ?? 0) - (second.sort_order ?? 0),
      );

      return siblings.map((document) => {
        const children = buildNodes(document.id);
        return {
          id: document.id,
          name: document.title || "Untitled document",
          type: "document",
          children: children.length > 0 ? children : undefined,
        };
      });
    };

    return buildNodes(null);
  }, [collectionDocuments]);

  const { dragAndDropHooks } = useCollectionDocumentDragDrop(collectionDocuments);

  const renderTreeItem = (item: TreeDocumentItem): ReactElement => (
    <DocumentTreeItem item={item} renderItem={renderTreeItem} defaultCollectionId={collection.id} />
  );

  const handleNavigate = () => {
    navigate({
      to: "/w/$organizationSlug/collections/$collectionId",
      params: { organizationSlug, collectionId: collection.id },
    });
  };

  const handleAddDocument = () => {
    void createDocument(undefined, undefined, undefined, undefined, collection.id);
  };

  return (
    <div className="flex flex-col">
      <div
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
            isExpanded={isExpanded}
            hasChildren={hasRouteProperty}
            isMenuOpen={isMenuOpen}
            onToggle={hasRouteProperty ? () => setIsExpanded((v) => !v) : undefined}
          />
          <button
            type="button"
            onClick={handleNavigate}
            className="flex min-w-0 flex-1 items-center text-left"
          >
            <span className="truncate">{collection.name}</span>
          </button>
        </div>

        <div
          className={`pointer-events-none flex items-center gap-x-px bg-inherit pl-1 ${isMenuOpen ? "relative" : "absolute right-0 opacity-0 group-hover:opacity-100 group-hover:relative"}`}
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
      </div>

      {hasRouteProperty && isExpanded && (
        <div className="pl-2">
          {treeItems.length > 0 ? (
            <Tree
              aria-label={`${collection.name} routes`}
              className="flex flex-col focus:outline-none"
              items={treeItems}
              dragAndDropHooks={dragAndDropHooks}
            >
              {renderTreeItem}
            </Tree>
          ) : (
            <div className="px-2 py-1 text-xs text-gray-500">No entries yet</div>
          )}
        </div>
      )}
    </div>
  );
});
