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
import { getIntegrationMetadata } from "@lydie/integrations/metadata";

type TreeItem = {
  id: string;
  name: string;
  type: "folder" | "document" | "integration-link" | "integration-group";
  children?: TreeItem[];
  integrationLinkId?: string | null;
  integrationType?: string;
  syncStatus?: string | null;
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

export function DocumentTree() {
  const { organization } = useOrganization();

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
    queries.organizations.documentsAndFolders({
      organizationId: organization?.id || "",
    })
  );

  // Query integration connections (to show all connected integrations)
  const [connections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  // Query extension links with their connections
  const [extensionLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  const documents = orgData?.documents || [];
  const folders = orgData?.folders || [];

  // Build tree items for regular folders/documents (excluding extension items)
  const buildTreeItems = (folderId: string | null): TreeItem[] => {
    // Only include documents that don't belong to an extension link
    const folderDocs = documents.filter(
      (doc) => doc.folder_id === folderId && !doc.integration_link_id
    );
    // Only include folders that don't belong to an extension link
    const subFolders = folders.filter(
      (folder) => folder.parent_id === folderId && !folder.integration_link_id
    );

    return [
      ...subFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        type: "folder" as const,
        children: buildTreeItems(folder.id),
        integrationLinkId: folder.integration_link_id,
      })),
      ...folderDocs.map((doc) => ({
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
      })),
    ];
  };

  // Build tree items for an extension link (documents that belong to this link)
  const buildLinkItems = (linkId: string): TreeItem[] => {
    const linkDocs = documents.filter(
      (doc) => doc.integration_link_id === linkId
    );
    const linkFolders = folders.filter(
      (folder) => folder.integration_link_id === linkId
    );

    // Build nested structure for link folders
    const buildNestedFolders = (parentId: string | null): TreeItem[] => {
      const subFolders = linkFolders.filter((f) => f.parent_id === parentId);
      const folderDocs = linkDocs.filter(
        (d) => d.folder_id === parentId || (!parentId && !d.folder_id)
      );

      return [
        ...subFolders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          type: "folder" as const,
          children: buildNestedFolders(folder.id),
          integrationLinkId: folder.integration_link_id,
        })),
        ...folderDocs.map((doc) => ({
          id: doc.id,
          name: doc.title || "Untitled document",
          type: "document" as const,
          integrationLinkId: doc.integration_link_id,
        })),
      ];
    };

    return buildNestedFolders(null);
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
    connectionGroups.forEach((conns, type) => {
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
  }, [connections, extensionLinks, documents, folders]); // Re-compute when data changes

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
    allFolders: folders,
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
