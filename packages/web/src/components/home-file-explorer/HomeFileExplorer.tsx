import { Button } from "@/components/generic/Button";
import { BottomActionBar } from "@/components/generic/BottomActionBar";
import { SearchField } from "@/components/generic/SearchField";
import { DocumentItem } from "./DocumentItem";
import { FolderItem } from "./FolderItem";
import { FolderHeader } from "./FolderHeader";
import { ViewModeToggle } from "./ViewModeToggle";
import { EmptyState } from "./EmptyState";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useDocumentSearch } from "@/hooks/use-document-search";
import { useFolderNavigation } from "@/hooks/use-folder-navigation";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { Plus } from "lucide-react";
import { GridList } from "react-aria-components";
import { useState, useMemo, useEffect } from "react";
import { Heading } from "@/components/generic/Heading";
import { useListData } from "react-stately";
import { useOrganization } from "@/context/organization.context";
import { useSearch } from "@tanstack/react-router";
import { useAuth } from "@/context/auth.context";
import { Separator } from "../generic/Separator";

interface ItemType {
  id: string;
  name: string;
  type: "folder" | "document";
  updated_at?: number | string | null;
}

const VIEW_MODE_STORAGE_KEY = "lydie:view:mode";

export function HomeFileExplorer() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  // todo: could probably be made non-strict
  const { tree } = useSearch({ strict: false });
  const organizationId = organization?.id || "";
  const organizationSlug = organization?.slug || "";
  const { createDocument } = useDocumentActions();
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    // Initialize from localStorage, defaulting to "grid"
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "grid" || stored === "list") {
        return stored;
      }
    }
    return "grid";
  });

  // Persist view mode changes to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  // Search logic
  const {
    search,
    setSearch,
    searchFieldRef,
    onSearchChange,
    allDocuments,
    allFolders,
  } = useDocumentSearch(
    organizationId,
    organizationSlug,
    "/__auth/w/$organizationSlug/"
  );

  // When searching, show all results. Otherwise filter by folder
  const documents = search.trim()
    ? allDocuments
    : tree
    ? allDocuments.filter((doc) => doc.folder_id === tree)
    : allDocuments.filter((doc) => !doc.folder_id);

  const folders = search.trim()
    ? allFolders
    : tree
    ? allFolders.filter((folder) => folder.parent_id === tree)
    : allFolders.filter((folder) => !folder.parent_id);

  // Create separate items for folders and documents
  const folderItems: ItemType[] = useMemo(
    () =>
      folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        type: "folder" as const,
      })),
    [folders]
  );

  const documentItems: ItemType[] = useMemo(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
        updated_at: doc.updated_at,
      })),
    [documents]
  );

  // Folder navigation
  const { handleFolderClick, handleBackClick } = useFolderNavigation(
    organizationId,
    setSearch
  );

  // Unified drag and drop hooks
  // Pass current folder ID from query param so root drops move to current folder
  const { dragAndDropHooks } = useDocumentDragDrop({
    allFolders,
    allDocuments,
    currentFolderId: tree || undefined,
  });

  // List state management for folders
  const folderList = useListData<ItemType>({
    initialItems: folderItems,
    getKey: (item) => item.id,
  });

  // List state management for documents
  const documentList = useListData<ItemType>({
    initialItems: documentItems,
    getKey: (item) => item.id,
  });

  // Sync list data when items change
  useEffect(() => {
    const currentFolderIds = new Set(folderList.items.map((item) => item.id));
    const newFolderIds = new Set(folderItems.map((item) => item.id));

    // Remove items that no longer exist
    folderList.items.forEach((item) => {
      if (!newFolderIds.has(item.id)) {
        folderList.remove(item.id);
      }
    });

    // Add new items
    folderItems.forEach((item) => {
      if (!currentFolderIds.has(item.id)) {
        folderList.append(item);
      }
    });
  }, [folderItems.map((i) => i.id).join(",")]);

  useEffect(() => {
    const currentDocIds = new Set(documentList.items.map((item) => item.id));
    const newDocIds = new Set(documentItems.map((item) => item.id));

    // Remove items that no longer exist
    documentList.items.forEach((item) => {
      if (!newDocIds.has(item.id)) {
        documentList.remove(item.id);
      }
    });

    // Add new items
    documentItems.forEach((item) => {
      if (!currentDocIds.has(item.id)) {
        documentList.append(item);
      }
    });
  }, [documentItems.map((i) => i.id).join(",")]);

  // Find current folder info if we're in a folder
  const currentFolder = tree ? allFolders.find((f) => f.id === tree) : null;

  // Get 4 latest opened documents (sorted by updated_at)
  // Only show at root level when not searching
  const recentlyOpenedDocuments: ItemType[] = useMemo(() => {
    if (search.trim() || tree) {
      return [];
    }

    return allDocuments
      .filter((doc) => doc.updated_at) // Only include documents with updated_at
      .sort((a, b) => {
        const aTime =
          typeof a.updated_at === "number"
            ? a.updated_at
            : new Date(a.updated_at || 0).getTime();
        const bTime =
          typeof b.updated_at === "number"
            ? b.updated_at
            : new Date(b.updated_at || 0).getTime();
        return bTime - aTime; // Descending order (newest first)
      })
      .slice(0, 4) // Take top 4
      .map((doc) => ({
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
        updated_at: doc.updated_at,
      }));
  }, [allDocuments, search, tree]);

  // List state management for recently opened documents
  const recentlyOpenedList = useListData<ItemType>({
    initialItems: recentlyOpenedDocuments,
    getKey: (item) => item.id,
  });

  // Sync recently opened list data when items change
  useEffect(() => {
    const currentIds = new Set(recentlyOpenedList.items.map((item) => item.id));
    const newIds = new Set(recentlyOpenedDocuments.map((item) => item.id));

    // Remove items that no longer exist
    recentlyOpenedList.items.forEach((item) => {
      if (!newIds.has(item.id)) {
        recentlyOpenedList.remove(item.id);
      }
    });

    // Add new items
    recentlyOpenedDocuments.forEach((item) => {
      if (!currentIds.has(item.id)) {
        recentlyOpenedList.append(item);
      }
    });
  }, [recentlyOpenedDocuments.map((i) => i.id).join(",")]);

  const allSelectedItems = [
    ...recentlyOpenedList.items.filter((item) =>
      recentlyOpenedList.selectedKeys === "all"
        ? true
        : recentlyOpenedList.selectedKeys instanceof Set &&
          recentlyOpenedList.selectedKeys.has(item.id)
    ),
    ...folderList.items.filter((item) =>
      folderList.selectedKeys === "all"
        ? true
        : folderList.selectedKeys instanceof Set &&
          folderList.selectedKeys.has(item.id)
    ),
    ...documentList.items.filter((item) =>
      documentList.selectedKeys === "all"
        ? true
        : documentList.selectedKeys instanceof Set &&
          documentList.selectedKeys.has(item.id)
    ),
  ];

  const { handleDelete } = useBulkDelete();
  const onDelete = () => {
    handleDelete(allSelectedItems, () => {
      recentlyOpenedList.setSelectedKeys(new Set());
      folderList.setSelectedKeys(new Set());
      documentList.setSelectedKeys(new Set());
    });
  };

  return (
    <>
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-x-2 grow">
          <SearchField
            inputRef={searchFieldRef}
            value={search}
            onChange={onSearchChange}
            placeholder="Search documents and folders..."
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          <Button onPress={() => createDocument(tree)} size="sm">
            <Plus className="size-4" />
            New Document
          </Button>
        </div>
      </div>
      <Separator />
      <div className="p-4">
        <Heading className="mb-4">
          Welcome back{user?.name && `, ${user.name.split(" ")[0]}!`}
        </Heading>
        {currentFolder && (
          <FolderHeader
            folderId={currentFolder.id}
            folderName={currentFolder.name}
            onBackClick={handleBackClick}
          />
        )}
        {folderList.items.length === 0 &&
        documentList.items.length === 0 &&
        recentlyOpenedList.items.length === 0 ? (
          <EmptyState hasSearch={search.trim().length > 0} />
        ) : (
          <div className="flex flex-col gap-y-4">
            {recentlyOpenedList.items.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="text-xs font-medium text-gray-500">
                  Recently opened
                </span>
                <GridList
                  key={`recently-opened-${viewMode}`}
                  aria-label="Recently opened documents"
                  items={recentlyOpenedList.items}
                  selectedKeys={recentlyOpenedList.selectedKeys}
                  onSelectionChange={recentlyOpenedList.setSelectedKeys}
                  selectionMode="multiple"
                  dragAndDropHooks={dragAndDropHooks}
                  className={
                    viewMode === "grid"
                      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
                      : "flex flex-col ring ring-black/10 rounded-lg divide-y divide-black/10 overflow-hidden"
                  }
                >
                  {(item: ItemType) => (
                    <DocumentItem
                      id={item.id}
                      name={item.name}
                      updated_at={item.updated_at}
                      viewMode={viewMode}
                      isSelected={
                        recentlyOpenedList.selectedKeys === "all"
                          ? true
                          : recentlyOpenedList.selectedKeys instanceof Set &&
                            recentlyOpenedList.selectedKeys.has(item.id)
                      }
                    />
                  )}
                </GridList>
              </div>
            )}
            <div className="flex flex-col gap-y-2">
              <span className="text-xs font-medium text-gray-500">Folders</span>
              <GridList
                key={`folders-${viewMode}`}
                aria-label="Folders"
                items={folderList.items}
                selectedKeys={folderList.selectedKeys}
                onSelectionChange={folderList.setSelectedKeys}
                selectionMode="multiple"
                dragAndDropHooks={dragAndDropHooks}
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
                    : "flex flex-col ring ring-black/10 rounded-lg divide-y divide-black/10 overflow-hidden"
                }
              >
                {(item: ItemType) => (
                  <FolderItem
                    id={item.id}
                    name={item.name}
                    viewMode={viewMode}
                    onAction={() => handleFolderClick(item.id)}
                    isSelected={
                      folderList.selectedKeys === "all"
                        ? true
                        : folderList.selectedKeys instanceof Set &&
                          folderList.selectedKeys.has(item.id)
                    }
                  />
                )}
              </GridList>
            </div>
            <div className="flex flex-col gap-y-2">
              <span className="text-xs font-medium text-gray-500">
                Documents
              </span>
              <GridList
                key={`documents-${viewMode}`}
                aria-label="Documents"
                items={documentList.items}
                selectedKeys={documentList.selectedKeys}
                onSelectionChange={documentList.setSelectedKeys}
                selectionMode="multiple"
                dragAndDropHooks={dragAndDropHooks}
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
                    : "flex flex-col ring ring-black/10 rounded-lg divide-y divide-black/10 overflow-hidden"
                }
              >
                {(item: ItemType) => (
                  <DocumentItem
                    id={item.id}
                    name={item.name}
                    updated_at={item.updated_at}
                    viewMode={viewMode}
                    isSelected={
                      documentList.selectedKeys === "all"
                        ? true
                        : documentList.selectedKeys instanceof Set &&
                          documentList.selectedKeys.has(item.id)
                    }
                  />
                )}
              </GridList>
            </div>
          </div>
        )}
      </div>

      <BottomActionBar
        open={allSelectedItems.length > 0}
        selectedCount={allSelectedItems.length}
        onDelete={onDelete}
      />
    </>
  );
}
