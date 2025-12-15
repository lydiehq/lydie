import { useQuery } from "@rocicorp/zero/react";
import { Tree } from "react-aria-components";
import { DocumentTreeItem } from "./DocumentTreeItem";
import type { ReactElement } from "react";
import { useOrganization } from "@/context/organization.context";
import { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { useAtom } from "jotai";
import { useMemo, useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import { atom } from "jotai";
import { useParams } from "@tanstack/react-router";
import type { QueryResultType } from "@rocicorp/zero";

type TreeItem = {
  id: string;
  name: string;
  type: "folder" | "document" | "extension-link";
  children?: TreeItem[];
  extensionLinkId?: string | null;
  extensionType?: string;
};

const STORAGE_KEY = "lydie:document:tree:expanded:keys";

// Helper to load from localStorage
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

// Helper to save to localStorage
function saveToStorage(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    // Ignore errors
  }
}

const documentTreeExpandedKeysAtom = atom<string[]>([]);

type QueryResult = NonNullable<
  QueryResultType<typeof queries.organizations.documentsAndFolders>
>;

// Finds all parent folder IDs for a given document by traversing up the folder hierarchy.
function findParentFolderIds(
  documentId: string,
  documents: QueryResult["documents"],
  folders: QueryResult["folders"]
): string[] {
  const document = documents.find((doc) => doc.id === documentId);
  if (!document || !document.folder_id) {
    return [];
  }

  const parentIds: string[] = [];
  let currentFolderId: string | null = document.folder_id;

  // Traverse up the folder hierarchy
  while (currentFolderId) {
    parentIds.push(currentFolderId);
    const folder = folders.find((f) => f.id === currentFolderId);
    currentFolderId = folder?.parent_id ?? null;
  }

  // Return in order from root to immediate parent
  return parentIds.reverse();
}

export function DocumentTree() {
  const { organization } = useOrganization();
  const { session } = useAuth();

  // Get the current document ID from route params
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

  // Handle expanded state changes from Tree component
  const handleExpandedChange = (keys: Set<Key>) => {
    // Convert Key (string | number) to string array
    // In our case, all IDs are strings, so we can safely convert
    setExpandedKeysArray(Array.from(keys).map((key) => String(key)));
  };

  const [orgData] = useQuery(
    queries.organizations.documentsAndFolders({
      organizationId: organization?.id || "",
    })
  );

  // Query extension links with their connections
  const [extensionLinks] = useQuery(
    queries.extensionLinks.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  const documents = orgData?.documents || [];
  const folders = orgData?.folders || [];
  const enabledLinks =
    extensionLinks?.filter((link) => link.enabled && link.connection?.enabled) ||
    [];

  // Expand all parent folders when a document is opened
  useEffect(() => {
    if (
      currentDocumentId &&
      initialized &&
      documents.length > 0 &&
      folders.length > 0
    ) {
      const parentFolderIds = findParentFolderIds(
        currentDocumentId,
        documents,
        folders
      );

      if (parentFolderIds.length > 0) {
        // Merge with existing expanded keys, avoiding duplicates
        setExpandedKeysArray((prev) => {
          const newKeys = new Set([...prev, ...parentFolderIds]);
          return Array.from(newKeys);
        });
      }
    }
  }, [
    currentDocumentId,
    initialized,
    documents,
    folders,
    setExpandedKeysArray,
  ]);

  // Build tree items for regular folders/documents (excluding extension items)
  const buildTreeItems = (folderId: string | null): TreeItem[] => {
    // Only include documents that don't belong to an extension link
    const folderDocs = documents.filter(
      (doc) => doc.folder_id === folderId && !doc.extension_link_id
    );
    // Only include folders that don't belong to an extension link
    const subFolders = folders.filter(
      (folder) => folder.parent_id === folderId && !folder.extension_link_id
    );

    return [
      ...subFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        type: "folder" as const,
        children: buildTreeItems(folder.id),
        extensionLinkId: folder.extension_link_id,
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
    const linkDocs = documents.filter((doc) => doc.extension_link_id === linkId);
    const linkFolders = folders.filter(
      (folder) => folder.extension_link_id === linkId
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
          extensionLinkId: folder.extension_link_id,
        })),
        ...folderDocs.map((doc) => ({
          id: doc.id,
          name: doc.title || "Untitled document",
          type: "document" as const,
          extensionLinkId: doc.extension_link_id,
        })),
      ];
    };

    return buildNestedFolders(null);
  };

  // Build extension link entries as virtual top-level folder items
  const linkItems: TreeItem[] = enabledLinks.map((link) => ({
    id: `extension-link-${link.id}`,
    name: link.name,
    type: "extension-link" as const,
    extensionType: link.connection?.extension_type,
    extensionLinkId: link.id, // Store the actual link ID for navigation
    children: buildLinkItems(link.id),
  }));

  // Combine extension links (at top) with regular tree items
  const treeItems = [...linkItems, ...buildTreeItems(null)];

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
