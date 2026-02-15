import type { QueryResultType } from "@rocicorp/zero";
import type { ReactElement } from "react";
import type { Key } from "react-aria-components";

import { getIntegrationMetadata } from "@lydie/integrations/metadata";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useParams } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { atom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree } from "react-aria-components";

import { documentTabsAtom } from "@/atoms/tabs";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { getUserStorage, setUserStorage } from "@/lib/user-storage";
import { getAncestorIds } from "@/utils/document-tree";

import { DocumentTreeItem } from "./DocumentTreeItem";

type TreeItem = {
  id: string;
  name: string;
  type: "document" | "integration-link" | "integration-group";
  children?: TreeItem[];
  integrationLinkId?: string | null;
  integrationType?: string;
  syncStatus?: string | null;
  isLocked?: boolean;
  isFavorited?: boolean;
};

const STORAGE_KEY = "lydie:document:tree:expanded:keys";

function loadFromStorage(userId: string | null | undefined): string[] {
  try {
    const stored = getUserStorage(userId, STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return [];
}

function saveToStorage(userId: string | null | undefined, keys: string[]): void {
  try {
    setUserStorage(userId, STORAGE_KEY, JSON.stringify(keys));
  } catch {}
}

export const documentTreeExpandedKeysAtom = atom<string[]>([]);

type QueryResult = NonNullable<QueryResultType<typeof queries.organizations.documentTree>>;

export function DocumentTree() {
  const { organization } = useOrganization();
  const { id: currentDocId } = useParams({ strict: false });

  const { session } = useAuth();
  const userId = session?.userId;

  const [initialized, setInitialized] = useState(false);
  const [expandedKeysArray, setExpandedKeysArray] = useAtom(documentTreeExpandedKeysAtom);

  useEffect(() => {
    if (!initialized) {
      const stored = loadFromStorage(userId);
      setExpandedKeysArray(stored);
      setInitialized(true);
    }
  }, [initialized, userId, setExpandedKeysArray]);

  useEffect(() => {
    if (initialized) {
      saveToStorage(userId, expandedKeysArray);
    }
  }, [initialized, userId, expandedKeysArray]);

  // Single query fetches documents, integration connections, and links
  const [orgData] = useQuery(
    queries.organizations.documentTree({
      organizationSlug: organization.slug,
    }),
  );

  const documents = useMemo(() => orgData?.documents || [], [orgData?.documents]);
  const connections = useMemo(
    () => orgData?.integrationConnections || [],
    [orgData?.integrationConnections],
  );

  const handleExpandedChange = (keys: Set<Key>) => {
    setExpandedKeysArray(Array.from(keys).map((key) => String(key)));
  };

  // Track previous document ID to detect navigation
  const prevDocIdRef = useRef<string | undefined>(undefined);

  // Auto-expand ancestors when navigating to a new document
  useEffect(() => {
    if (currentDocId && currentDocId !== prevDocIdRef.current && documents.length > 0) {
      const ancestorIds = getAncestorIds(currentDocId, documents);

      // Add ancestors to expanded state (persisted)
      setExpandedKeysArray((prev) => {
        const newKeys = new Set([...prev, ...ancestorIds]);
        return Array.from(newKeys);
      });

      prevDocIdRef.current = currentDocId;
    }
  }, [currentDocId, documents, setExpandedKeysArray]);

  const expandedKeys = useMemo(() => new Set(expandedKeysArray), [expandedKeysArray]);

  // Extract all links from connections (links are nested within each connection)
  const extensionLinks = useMemo(() => {
    const allLinks: Array<
      NonNullable<QueryResult["integrationConnections"]>[number]["links"][number]
    > = [];

    for (const connection of connections) {
      if (connection.links) {
        allLinks.push(...connection.links);
      }
    }
    return allLinks;
  }, [connections]);

  const buildTreeItems = useCallback(
    (parentId: string | null): TreeItem[] => {
      const childDocs = documents.filter(
        (doc) => doc.parent_id === parentId && !doc.integration_link_id,
      );

      const sortedDocs = [...childDocs].sort((a, b) => {
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      return sortedDocs.map((doc) => {
        const children = buildTreeItems(doc.id);
        return {
          id: doc.id,
          name: doc.title || "Untitled document",
          type: "document" as const,
          children: children.length > 0 ? children : undefined,
          isLocked: doc.is_locked ?? false,
          isFavorited: doc.is_favorited ?? false,
        };
      });
    },
    [documents],
  );

  const buildLinkItems = useCallback(
    (linkId: string): TreeItem[] => {
      const linkDocs = documents.filter((doc) => doc.integration_link_id === linkId);

      const buildNestedDocs = (parentId: string | null): TreeItem[] => {
        const childDocs = linkDocs.filter((d) => d.parent_id === parentId);

        const sortedDocs = [...childDocs].sort((a, b) => {
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });

        return sortedDocs.map((doc) => {
          const children = buildNestedDocs(doc.id);
          return {
            id: doc.id,
            name: doc.title || "Untitled document",
            type: "document" as const,
            children: children.length > 0 ? children : undefined,
            integrationLinkId: doc.integration_link_id,
            isLocked: doc.is_locked ?? false,
            isFavorited: doc.is_favorited ?? false,
          };
        });
      };

      return buildNestedDocs(null);
    },
    [documents],
  );

  const linkGroups = useMemo(() => {
    // Group connections by integration type
    const connectionGroups = new Map<
      string,
      Array<NonNullable<QueryResult["integrationConnections"]>[number]>
    >();

    for (const connection of connections) {
      if (connection.status !== "active") continue;

      const type = connection.integration_type;
      if (!type) continue;

      const group = connectionGroups.get(type) || [];
      connectionGroups.set(type, [...group, connection]);
    }

    // Group links by integration type
    const linkGroupsByType = new Map<
      string,
      Array<NonNullable<QueryResult["integrationConnections"]>[number]["links"][number]>
    >();

    for (const link of extensionLinks) {
      const type = link.integration_type;
      if (!type) continue;

      const group = linkGroupsByType.get(type) || [];
      linkGroupsByType.set(type, [...group, link]);
    }

    const items: TreeItem[] = [];

    connectionGroups.forEach((_conns, type) => {
      const metadata = getIntegrationMetadata(type);
      if (!metadata) return;

      const linksForType = linkGroupsByType.get(type) || [];

      const sortedLinks = [...linksForType].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );

      items.push({
        id: `integration-group-${type}`,
        name: metadata.name,
        type: "integration-group",
        children: sortedLinks.map((link) => ({
          id: `integration-link-${link.id}`,
          name: link.name,
          type: "integration-link",
          integrationType: link.integration_type,
          integrationLinkId: link.id,
          syncStatus: link.sync_status,
          children: buildLinkItems(link.id),
        })),
        integrationType: type,
      });
    });

    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return items;
  }, [connections, extensionLinks, buildLinkItems]);

  const treeItems = useMemo(
    () => [...linkGroups, ...buildTreeItems(null)],
    [linkGroups, buildTreeItems],
  );

  const openTabs = useAtomValue(documentTabsAtom);
  const openTabIds = useMemo(() => new Set(openTabs.map((t) => t.documentId)), [openTabs]);

  const renderItem = useCallback(
    (item: TreeItem): ReactElement => (
      <DocumentTreeItem
        item={item}
        renderItem={renderItem}
        documents={documents}
        isCurrent={item.id === currentDocId}
        isOpenInTabs={item.type === "document" ? openTabIds.has(item.id) : false}
      />
    ),
    [documents, currentDocId, openTabIds],
  );

  const { dragAndDropHooks } = useDocumentDragDrop({
    allDocuments: documents,
  });

  return (
    <Tree
      aria-label="Documents"
      selectionMode="single"
      className="flex flex-col focus:outline-none"
      items={treeItems}
      dragAndDropHooks={dragAndDropHooks}
      expandedKeys={expandedKeys}
      onExpandedChange={handleExpandedChange}
    >
      {renderItem}
    </Tree>
  );
}
