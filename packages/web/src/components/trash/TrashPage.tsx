import type { QueryResultType } from "@rocicorp/zero";

import { ArrowCounterclockwise16Regular, Delete16Regular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useMemo, useState } from "react";

import { useOrganization } from "@/context/organization.context";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useZero } from "@/services/zero";

type TrashDocument = QueryResultType<typeof queries.documents.trash>[number];

type TreeItem = {
  id: string;
  name: string;
  deletedAt: number;
  children?: TreeItem[];
  depth: number;
};

export function TrashPage() {
  useDocumentTitle("Trash");

  const { organization } = useOrganization();
  const z = useZero();
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());

  const [trashDocuments] = useQuery(
    queries.documents.trash({
      organizationId: organization.id,
      limit: 100,
    }),
  );

  const buildTreeItems = useCallback((documents: TrashDocument[], depth = 0): TreeItem[] => {
    // Get root-level deleted documents (those without a deleted parent)
    const deletedDocIds = new Set(documents.map((d) => d.id));

    const rootDocs = documents.filter((doc) => {
      // Include if it has no parent or parent is not deleted
      return !doc.parent_id || !deletedDocIds.has(doc.parent_id);
    });

    const sortedDocs = [...rootDocs].sort((a, b) => {
      return (b.deleted_at ?? 0) - (a.deleted_at ?? 0);
    });

    const buildChildren = (parentId: string): TreeItem[] => {
      const childDocs = documents.filter((doc) => doc.parent_id === parentId);
      const sortedChildren = [...childDocs].sort((a, b) => {
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      return sortedChildren.map((child) => ({
        id: child.id,
        name: child.title || "Untitled document",
        deletedAt: child.deleted_at ?? 0,
        children: buildChildren(child.id),
        depth: depth + 1,
      }));
    };

    return sortedDocs.map((doc) => ({
      id: doc.id,
      name: doc.title || "Untitled document",
      deletedAt: doc.deleted_at ?? 0,
      children: buildChildren(doc.id),
      depth,
    }));
  }, []);

  const treeItems = useMemo(() => {
    if (!trashDocuments) return [];
    return buildTreeItems(trashDocuments);
  }, [trashDocuments, buildTreeItems]);

  const handleRestore = useCallback(
    async (documentId: string) => {
      if (restoringIds.has(documentId)) return;

      setRestoringIds((prev) => new Set(prev).add(documentId));

      try {
        await z.mutate(
          mutators.document.restore({
            documentId,
            organizationId: organization.id,
          }),
        );
      } catch (error) {
        console.error("Failed to restore document:", error);
      } finally {
        setRestoringIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      }
    },
    [organization.id, restoringIds, z],
  );

  const hasDocuments = treeItems.length > 0;

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-gray-900 mb-2">Trash</h1>
          <p className="text-gray-500">
            Documents in trash are kept for 30 days before being permanently deleted.
          </p>
        </div>

        {hasDocuments ? (
          <div className="space-y-1">
            {treeItems.map((item) => (
              <TrashTreeItem
                key={item.id}
                item={item}
                onRestore={handleRestore}
                isRestoring={restoringIds.has(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Delete16Regular className="size-12 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-2">Trash is empty</p>
            <p className="text-sm text-gray-400">Deleted documents will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TrashTreeItem({
  item,
  onRestore,
  isRestoring,
}: {
  item: TreeItem;
  onRestore: (id: string) => void;
  isRestoring: boolean;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/3 transition-colors group"
        style={{ paddingLeft: `${12 + item.depth * 24}px` }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <DocumentIcon className="size-4 icon-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
            <p className="text-xs text-gray-500">
              Deleted{" "}
              {formatDistanceToNow(new Date(item.deletedAt), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
        <Button
          intent="secondary"
          size="sm"
          onPress={() => onRestore(item.id)}
          isPending={isRestoring}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ArrowCounterclockwise16Regular className="size-4 mr-1.5" />
          Restore
        </Button>
      </div>
      {item.children &&
        item.children.length > 0 &&
        item.children.map((child) => (
          <TrashTreeItem
            key={child.id}
            item={child}
            onRestore={onRestore}
            isRestoring={isRestoring}
          />
        ))}
    </div>
  );
}
