import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GridList } from "react-aria-components";
import { useListData } from "react-stately";

import { BottomActionBar } from "@/components/generic/BottomActionBar";
import { Button } from "@/components/generic/Button";
import { Heading } from "@/components/generic/Heading";
import { SearchField } from "@/components/generic/SearchField";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { useDocumentDragDrop } from "@/hooks/use-document-drag-drop";
import { useDocumentSearch } from "@/hooks/use-document-search";
import { usePageNavigation } from "@/hooks/use-page-navigation";
import { getUserStorage, setUserStorage } from "@/lib/user-storage";

import { Separator } from "../generic/Separator";
import { DocumentItem } from "./DocumentItem";
import { EmptyState } from "./EmptyState";
import { ViewModeToggle } from "./ViewModeToggle";

interface ItemType {
  id: string;
  name: string;
  type: "document";
  updated_at?: number | string | null;
}

const VIEW_MODE_STORAGE_KEY = "lydie:view:mode";

export function HomeFileExplorer() {
  const { user, session } = useAuth();
  const userId = session?.userId;
  const { organization } = useOrganization();
  const { tree } = useSearch({ strict: false });
  const organizationId = organization.id;
  const organizationSlug = organization?.slug || "";
  const { createDocument } = useDocumentActions();

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      const stored = getUserStorage(userId, VIEW_MODE_STORAGE_KEY);
      if (stored === "grid" || stored === "list") {
        return stored;
      }
    }
    return "grid";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUserStorage(userId, VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode, userId]);

  const { search, setSearch, searchFieldRef, onSearchChange, allDocuments } = useDocumentSearch(
    organizationId,
    organizationSlug,
    "/__auth/w/$organizationSlug/",
  );

  const documents = search.trim()
    ? allDocuments
    : tree
      ? allDocuments.filter((doc) => doc.parent_id === tree)
      : allDocuments.filter((doc) => !doc.parent_id);

  const documentItems: ItemType[] = useMemo(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
        updated_at: doc.updated_at,
      })),
    [documents],
  );

  const { handleBackClick } = usePageNavigation(organizationId, setSearch);

  const { dragAndDropHooks } = useDocumentDragDrop({
    allDocuments,
  });

  const documentList = useListData<ItemType>({
    initialItems: documentItems,
    getKey: (item) => item.id,
  });

  useEffect(() => {
    const currentDocIds = new Set(documentList.items.map((item) => item.id));
    const newDocIds = new Set(documentItems.map((item) => item.id));

    documentList.items.forEach((item) => {
      if (!newDocIds.has(item.id)) {
        documentList.remove(item.id);
      }
    });

    documentItems.forEach((item) => {
      if (!currentDocIds.has(item.id)) {
        documentList.append(item);
      }
    });
  }, [documentItems.map((i) => i.id).join(","), documentList.items, documentItems, documentList]);

  const currentParentPage = tree ? allDocuments.find((d) => d.id === tree) : null;

  const recentlyOpenedDocuments: ItemType[] = useMemo(() => {
    if (search.trim() || tree) {
      return [];
    }

    return allDocuments
      .filter((doc) => doc.updated_at)
      .sort((a, b) => {
        const aTime =
          typeof a.updated_at === "number" ? a.updated_at : new Date(a.updated_at || 0).getTime();
        const bTime =
          typeof b.updated_at === "number" ? b.updated_at : new Date(b.updated_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 4)
      .map((doc) => ({
        id: doc.id,
        name: doc.title || "Untitled document",
        type: "document" as const,
        updated_at: doc.updated_at,
      }));
  }, [allDocuments, search, tree]);

  const recentlyOpenedList = useListData<ItemType>({
    initialItems: recentlyOpenedDocuments,
    getKey: (item) => item.id,
  });

  useEffect(() => {
    const currentIds = new Set(recentlyOpenedList.items.map((item) => item.id));
    const newIds = new Set(recentlyOpenedDocuments.map((item) => item.id));

    recentlyOpenedList.items.forEach((item) => {
      if (!newIds.has(item.id)) {
        recentlyOpenedList.remove(item.id);
      }
    });

    recentlyOpenedDocuments.forEach((item) => {
      if (!currentIds.has(item.id)) {
        recentlyOpenedList.append(item);
      }
    });
  }, [
    recentlyOpenedDocuments.map((i) => i.id).join(","),
    recentlyOpenedList.items,
    recentlyOpenedDocuments,
    recentlyOpenedList,
  ]);

  const allSelectedItems = [
    ...recentlyOpenedList.items.filter((item) =>
      recentlyOpenedList.selectedKeys === "all"
        ? true
        : recentlyOpenedList.selectedKeys instanceof Set &&
          recentlyOpenedList.selectedKeys.has(item.id),
    ),
    ...documentList.items.filter((item) =>
      documentList.selectedKeys === "all"
        ? true
        : documentList.selectedKeys instanceof Set && documentList.selectedKeys.has(item.id),
    ),
  ];

  const { handleDelete } = useBulkDelete();
  const onDelete = () => {
    handleDelete(allSelectedItems, () => {
      recentlyOpenedList.setSelectedKeys(new Set());
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
            placeholder="Search documents..."
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          <Button onPress={() => createDocument(tree)} size="sm">
            <AddIcon className="size-4" />
            New Document
          </Button>
        </div>
      </div>
      <Separator />
      <div className="p-4">
        <Heading className="mb-4">
          Welcome back{user?.name && `, ${user.name.split(" ")[0]}!`}
        </Heading>
        {currentParentPage && (
          <div className="mb-4 flex items-center gap-2">
            <Button
              onPress={handleBackClick}
              intent="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </Button>
            <span className="text-sm text-gray-600">
              {currentParentPage.title || "Untitled document"}
            </span>
          </div>
        )}
        {documentList.items.length === 0 && recentlyOpenedList.items.length === 0 ? (
          <EmptyState hasSearch={search.trim().length > 0} />
        ) : (
          <div className="flex flex-col gap-y-4">
            {recentlyOpenedList.items.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="text-xs font-medium text-gray-500">Recently opened</span>
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
              <span className="text-xs font-medium text-gray-500">Documents</span>
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
