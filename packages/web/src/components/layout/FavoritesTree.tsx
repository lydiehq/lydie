import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useAtomValue } from "jotai";
import type { ReactElement } from "react";
import { useCallback, useMemo } from "react";
import { Tree } from "react-aria-components";

import { documentTabsAtom } from "@/atoms/tabs";
import { useOrganization } from "@/context/organization.context";

import { DocumentTreeItem } from "./DocumentTreeItem";

type TreeItem = {
  id: string;
  name: string;
  type: "document";
  children?: TreeItem[];
  isLocked?: boolean;
  isFavorited?: boolean;
  isCollection?: boolean;
};

export function FavoritesTree() {
  const { organization } = useOrganization();

  const [orgData] = useQuery(
    queries.organizations.documents({
      organizationSlug: organization.slug,
    }),
  );

  // Filter for favorited documents only and show them in a flat list
  const treeItems = useMemo(() => {
    const docs = orgData?.documents || [];
    const favoritedDocs = docs.filter((doc) => doc.is_favorited && !doc.integration_link_id);

    // Sort by sort_order
    const sortedDocs = [...favoritedDocs].sort((a, b) => {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return sortedDocs.map((doc) => ({
      id: doc.id,
      name: doc.title || "Untitled document",
      type: "document" as const,
      isLocked: doc.is_locked ?? false,
      isFavorited: true,
      isCollection: !!doc.collection_id,
    }));
  }, [orgData?.documents]);

  const documents = orgData?.documents || [];
  const openTabs = useAtomValue(documentTabsAtom);
  const openTabIds = useMemo(() => new Set(openTabs.map((t) => t.documentId)), [openTabs]);

  const renderItem = useCallback(
    (item: TreeItem): ReactElement => (
      <DocumentTreeItem
        item={item}
        renderItem={renderItem}
        documents={documents}
        isOpenInTabs={openTabIds.has(item.id)}
      />
    ),
    [documents, openTabIds],
  );

  // Don't render the tree if there are no favorites
  if (treeItems.length === 0) {
    return null;
  }

  return (
    <Tree
      aria-label="Favorites"
      selectionMode="single"
      className="flex flex-col focus:outline-none"
      items={treeItems}
    >
      {renderItem}
    </Tree>
  );
}
