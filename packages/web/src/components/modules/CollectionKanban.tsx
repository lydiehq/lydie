import type { PropertyDefinition } from "@lydie/core/collection";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { isTextDropItem, ListBox, ListBoxItem, useDragAndDrop } from "react-aria-components";
import { toast } from "sonner";

import { useZero } from "@/services/zero";

type Props = {
  collectionId: string;
  organizationId: string;
  organizationSlug: string;
  schema: PropertyDefinition[];
};

type DocumentCard = {
  id: string;
  title: string;
  properties: Record<string, string | number | boolean | string[] | null>;
};

type DragCard = {
  id: string;
  title: string;
};

function extractFieldValues(
  fieldValues: unknown,
  collectionId: string,
): Record<string, string | number | boolean | string[] | null> {
  const parsedFieldValues = (fieldValues || []) as Array<{
    collection_id: string;
    values: unknown;
  }>;

  if (parsedFieldValues.length === 0) {
    return {};
  }

  const activeRow =
    parsedFieldValues.find((row) => row.collection_id === collectionId) ?? parsedFieldValues[0];

  const values = activeRow?.values;
  return typeof values === "object" && values !== null
    ? (values as Record<string, string | number | boolean | string[] | null>)
    : {};
}

export function CollectionKanban({
  collectionId,
  organizationId,
  organizationSlug,
  schema,
}: Props) {
  const z = useZero();
  const [documentsResult] = useQuery(
    queries.collections.documentsByCollection({
      organizationId,
      collectionId,
    }),
  );

  const documents = useMemo(() => {
    const documentsData = (documentsResult ?? []) as any[];
    return documentsData.map((doc) => {
      return {
        id: doc.id,
        title: doc.title || "Untitled",
        properties: extractFieldValues(doc.fieldValues, collectionId),
      } satisfies DocumentCard;
    });
  }, [collectionId, documentsResult]);

  const statusField = useMemo(() => {
    return schema.find((field) => field.type === "status") ?? null;
  }, [schema]);

  const options = useMemo(() => statusField?.options ?? [], [statusField]);

  const cardsByOption = useMemo(() => {
    if (!statusField) {
      return new Map<string, DocumentCard[]>();
    }

    const map = new Map<string, DocumentCard[]>();
    for (const option of options) {
      map.set(option.id, []);
    }

    for (const doc of documents) {
      const value = doc.properties[statusField.name];
      if (typeof value === "string" && map.has(value)) {
        map.get(value)?.push(doc);
      }
    }

    return map;
  }, [documents, options, statusField]);

  if (!statusField || options.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Kanban requires a `status` property with options.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {options.map((option) => (
        <KanbanColumn
          key={option.id}
          optionId={option.id}
          optionLabel={option.label}
          statusFieldName={statusField.name}
          cards={cardsByOption.get(option.id) ?? []}
          documents={documents}
          organizationSlug={organizationSlug}
          onMove={async (documentId, statusId) => {
            try {
              await z.mutate(
                mutators.collection.updateFieldValues({
                  documentId,
                  collectionId,
                  organizationId,
                  values: {
                    [statusField.name]: statusId,
                  },
                }),
              );
            } catch (error) {
              console.error(error);
              toast.error("Failed to move card");
            }
          }}
        />
      ))}
    </div>
  );
}

function KanbanColumn({
  optionId,
  optionLabel,
  statusFieldName,
  cards,
  documents,
  organizationSlug,
  onMove,
}: {
  optionId: string;
  optionLabel: string;
  statusFieldName: string;
  cards: DocumentCard[];
  documents: DocumentCard[];
  organizationSlug: string;
  onMove: (documentId: string, statusId: string) => Promise<void>;
}) {
  const byId = useMemo(() => new Map(documents.map((doc) => [doc.id, doc])), [documents]);

  const parseDroppedCards = async (items: Iterable<any>): Promise<DragCard[]> => {
    const parsed = await Promise.all(
      [...items]
        .filter((item) => isTextDropItem(item))
        .map(async (item) => JSON.parse(await item.getText("lydie-kanban-card")) as DragCard),
    );

    return parsed;
  };

  const { dragAndDropHooks } = useDragAndDrop({
    acceptedDragTypes: ["lydie-kanban-card"],
    getDropOperation: () => "move",
    getItems(keys) {
      return [...keys]
        .map((key) => byId.get(String(key)))
        .filter((item): item is DocumentCard => item !== undefined)
        .map((item) => ({
          "lydie-kanban-card": JSON.stringify({ id: item.id, title: item.title }),
          "text/plain": item.title,
        }));
    },
    async onRootDrop(event) {
      const dropped = await parseDroppedCards(event.items);
      await Promise.all(dropped.map((item) => onMove(item.id, optionId)));
    },
    async onInsert(event) {
      const dropped = await parseDroppedCards(event.items);
      if (dropped.length === 0) {
        return;
      }

      if (event.target.dropPosition === "before" || event.target.dropPosition === "after") {
        const targetId = String(event.target.key);
        const targetDocument = byId.get(targetId);
        const targetStatus =
          typeof targetDocument?.properties[statusFieldName] === "string"
            ? (targetDocument?.properties[statusFieldName] as string)
            : optionId;

        await Promise.all(dropped.map((item) => onMove(item.id, targetStatus)));
      }
    },
    async onReorder(event) {
      const moved = [...event.keys].map(String);
      await Promise.all(moved.map((id) => onMove(id, optionId)));
    },
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{optionLabel}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {cards.length}
        </span>
      </div>
      <ListBox
        aria-label={`${optionLabel} cards`}
        items={cards}
        dragAndDropHooks={dragAndDropHooks}
        className="min-h-24 space-y-2 rounded-lg bg-gray-50 p-2"
        selectionMode="none"
        renderEmptyState={() => (
          <div className="rounded-md border border-dashed border-gray-300 p-3 text-xs text-gray-500">
            Drop cards here
          </div>
        )}
      >
        {(card) => (
          <ListBoxItem
            id={card.id}
            textValue={card.title}
            className="rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-800 shadow-sm outline-none"
          >
            <Link
              to="/w/$organizationSlug/$id"
              params={{ organizationSlug, id: card.id }}
              className="line-clamp-2 block"
            >
              {card.title || "Untitled"}
            </Link>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}
