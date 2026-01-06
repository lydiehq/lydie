import { useQuery } from "@rocicorp/zero/react";
import { Tree } from "react-aria-components";
import { DocumentTreeItem } from "./DocumentTreeItem";
import type { ReactElement } from "react";
import { useOrganization } from "@/context/organization.context";
import { queries } from "@lydie/zero/queries";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { useAtom } from "jotai";
import { useMemo, useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import { atom } from "jotai";
import { useParams } from "@tanstack/react-router";
import type { QueryResultType } from "@rocicorp/zero";

import { getIntegrationMetadata } from "@lydie/integrations/metadata";

type TreeItem = {
  id: string;
  name: string;
  type: "document" | "integration-link" | "integration-group";
  children?: TreeItem[];
  integrationLinkId?: string | null;
  integrationType?: string;
  syncStatus?: string | null;
  isLocked?: boolean;
};

const STORAGE_KEY = "lydie:document:tree:expanded:keys";

function loadFromStorage(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // Ignore errors
  }
  return [];
}

function saveToStorage(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    // Ignore errors
  }
}

const documentTreeExpandedKeysAtom = atom<string[]>([]);

type QueryResult = NonNullable<
  QueryResultType<typeof queries.organizations.documents>
>;

// Finds all parent document IDs for a given document by traversing up the parent hierarchy.
function findParentDocumentIds(
  documentId: string,
  documents: QueryResult["documents"]
): string[] {
  const document = documents.find((doc) => doc.id === documentId);
  if (!document || !document.parent_id) {
    return [];
  }

  const parentIds: string[] = [];
  let currentParentId: string | null = document.parent_id;

  while (currentParentId) {
    parentIds.push(currentParentId);
    const parentDoc = documents.find((d) => d.id === currentParentId);
    currentParentId = parentDoc?.parent_id ?? null;
  }

  // Return in order from root to immediate parent
  return parentIds.reverse();
}

export function DocumentTree() {
  const { organization } = useOrganization();
  const { id: currentDocumentId } = useParams({ strict: false });

  // Get user settings to determine if we should persist to local storage
  const [userSettings] = useQuery(queries.settings.user({}));
  const persistExpansion =
    userSettings?.persist_document_tree_expansion ?? true;

  // Initialize state from localStorage if persistence is enabled
  const [initialized, setInitialized] = useState(false);
  const [expandedKeysArray, setExpandedKeysArray] = useAtom(
    documentTreeExpandedKeysAtom
  );

  // Load initial state from localStorage if persistence is enabled
  useEffect(() => {
    if (!initialized && persistExpansion) {
      const stored = loadFromStorage();
      setExpandedKeysArray(stored);
      setInitialized(true);
    } else if (!initialized) {
      setInitialized(true);
    }
  }, [initialized, persistExpansion, setExpandedKeysArray]);

  // Save to localStorage when state changes (only if persistence is enabled)
  useEffect(() => {
    if (initialized && persistExpansion) {
      saveToStorage(expandedKeysArray);
    } else if (initialized && !persistExpansion) {
      // Clear localStorage when persistence is disabled
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Ignore errors
      }
    }
  }, [initialized, persistExpansion, expandedKeysArray]);

  // Convert array to Set for React Aria Tree component
  const expandedKeys = useMemo(
    () => new Set(expandedKeysArray),
    [expandedKeysArray]
  );

  const handleExpandedChange = (keys: Set<Key>) => {
    // In our case, all IDs are strings, so we can safely convert
    setExpandedKeysArray(Array.from(keys).map((key) => String(key)));
  };

  const [orgData] = useQuery(
    queries.organizations.documents({
      organizationSlug: organization.slug,
    })
  );

  const [connections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organization.id,
    })
  );

  const [extensionLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization.id,
    })
  );

  const documents = orgData?.documents || [];

  // Expand all parent documents when a document is opened
  useEffect(() => {
    if (currentDocumentId && initialized && documents.length > 0) {
      const parentDocumentIds = findParentDocumentIds(
        currentDocumentId,
        documents
      );

      if (parentDocumentIds.length > 0) {
        // Merge with existing expanded keys, avoiding duplicates
        setExpandedKeysArray((prev) => {
          const newKeys = new Set([...prev, ...parentDocumentIds]);
          return Array.from(newKeys);
        });
      }
    }
  }, [currentDocumentId, initialized, documents, setExpandedKeysArray]);

  // Build tree items for documents (pages-in-pages structure)
  // parentId can be null (root level) or a document ID
  const buildTreeItems = (parentId: string | null): TreeItem[] => {
    // Only include documents that don't belong to an extension link
    // Filter by parent_id for pages-in-pages structure
    const childDocs = documents.filter(
      (doc) => doc.parent_id === parentId && !doc.integration_link_id
    );

    // Sort documents by sort_order only
    const sortedDocs = [...childDocs].sort((a, b) => {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return sortedDocs.map((doc) => {
      // Recursively get children for this document
      const children = buildTreeItems(doc.id);
      return {
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
        children: children.length > 0 ? children : undefined,
        isLocked: doc.is_locked ?? false,
      };
    });
  };

  // Build tree items for an extension link (documents that belong to this link)
  // Uses parent_id for page-hierarchy structure
  const buildLinkItems = (linkId: string): TreeItem[] => {
    const linkDocs = documents.filter(
      (doc) => doc.integration_link_id === linkId
    );

    // Build nested structure using parent_id (pages-in-pages)
    const buildNestedDocs = (parentId: string | null): TreeItem[] => {
      const childDocs = linkDocs.filter((d) => d.parent_id === parentId);

      // Sort documents by sort_order only
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
        };
      });
    };

    return buildNestedDocs(null);
  };

  // Build integration link entries grouped by type
  // Show groups for all active connections, even if they have no links
  const linkGroups = useMemo(() => {
    // Get all active connections grouped by integration type
    const connectionGroups = new Map<string, typeof connections>();

    connections?.forEach((connection) => {
      if (connection.status !== "active") return;

      const type = connection.integration_type;
      if (!type) return;

      if (!connectionGroups.has(type)) {
        connectionGroups.set(type, []);
      }
      connectionGroups.get(type)?.push(connection);
    });

    // Group links by integration type
    const linkGroupsByType = new Map<string, typeof extensionLinks>();

    extensionLinks.forEach((link) => {
      const type = link.connection?.integration_type;
      if (!type) return;

      if (!linkGroupsByType.has(type)) {
        linkGroupsByType.set(type, []);
      }
      linkGroupsByType.get(type)?.push(link);
    });

    const items: TreeItem[] = [];

    // Create groups for all active connections
    connectionGroups.forEach((_conns, type) => {
      const metadata = getIntegrationMetadata(type);
      if (!metadata) return;

      // Get links for this integration type
      const linksForType = linkGroupsByType.get(type) || [];

      // Sort links within each integration group alphabetically by name
      const sortedLinks = [...linksForType].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        })
      );

      items.push({
        id: `integration-group-${type}`,
        name: metadata.name,
        type: "integration-group",
        children: sortedLinks.map((link) => ({
          id: `integration-link-${link.id}`,
          name: link.name,
          type: "integration-link",
          integrationType: link.connection?.integration_type,
          integrationLinkId: link.id,
          syncStatus: link.sync_status,
          children: buildLinkItems(link.id),
        })),
        integrationType: type,
      });
    });

    // Ensure integration groups themselves are sorted alphabetically by name
    items.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

    return items;
  }, [connections, extensionLinks, documents]); // Re-compute when data changes

  // Combine integration groups (at top) with regular tree items
  const treeItems = [...linkGroups, ...buildTreeItems(null)];

  const renderItem = (item: TreeItem): ReactElement => (
    <DocumentTreeItem
      item={item}
      renderItem={renderItem}
      documents={documents}
    />
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
