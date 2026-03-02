import { ReOrderRegular } from "@fluentui/react-icons";
import type { PropertyDefinition } from "@lydie/core/collection";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button as RACButton,
  isTextDropItem,
  ListBox,
  ListBoxItem,
  useDragAndDrop,
} from "react-aria-components";
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

export function CollectionKanbanView({
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
    const status = schema.find((field) => field.type === "status");
    if (status) {
      return status;
    }

    const selectNamedStatus = schema.find(
      (field) => field.type === "select" && field.name.toLowerCase() === "status",
    );
    if (selectNamedStatus) {
      return selectNamedStatus;
    }

    return schema.find((field) => field.type === "select") ?? null;
  }, [schema]);

  const options = useMemo(() => statusField?.options ?? [], [statusField]);

  const handleRenameOption = useCallback(
    async (optionId: string, nextLabel: string) => {
      if (!statusField || !statusField.options) {
        return;
      }

      const trimmedLabel = nextLabel.trim();
      if (!trimmedLabel) {
        return;
      }

      const currentOption = statusField.options.find((option) => option.id === optionId);
      if (!currentOption || currentOption.label === trimmedLabel) {
        return;
      }

      const nextSchema = schema.map((field) => {
        if (field.name !== statusField.name || !field.options) {
          return field;
        }

        return {
          ...field,
          options: field.options.map((option) =>
            option.id === optionId ? { ...option, label: trimmedLabel } : option,
          ),
        };
      });

      try {
        await z.mutate(
          mutators.collection.update({
            collectionId,
            organizationId,
            properties: nextSchema,
          }),
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to rename column");
      }
    },
    [collectionId, organizationId, schema, statusField, z],
  );

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
        Kanban requires a `status` or `select` property with options.
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
          optionColor={option.color}
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
          onRenameOption={handleRenameOption}
        />
      ))}
    </div>
  );
}

function KanbanColumn({
  optionId,
  optionLabel,
  optionColor,
  statusFieldName,
  cards,
  documents,
  organizationSlug,
  onMove,
  onRenameOption,
}: {
  optionId: string;
  optionLabel: string;
  optionColor?: string;
  statusFieldName: string;
  cards: DocumentCard[];
  documents: DocumentCard[];
  organizationSlug: string;
  onMove: (documentId: string, statusId: string) => Promise<void>;
  onRenameOption: (optionId: string, nextLabel: string) => Promise<void>;
}) {
  const byId = useMemo(() => new Map(documents.map((doc) => [doc.id, doc])), [documents]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(optionLabel);

  useEffect(() => {
    setDraftName(optionLabel);
  }, [optionLabel]);

  const handleSaveName = useCallback(async () => {
    const trimmed = draftName.trim();
    setIsEditingName(false);
    if (!trimmed) {
      setDraftName(optionLabel);
      return;
    }

    if (trimmed !== optionLabel) {
      await onRenameOption(optionId, trimmed);
    }
  }, [draftName, onRenameOption, optionId, optionLabel]);

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
        <div className="min-w-0 flex-1">
          {isEditingName ? (
            <input
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void handleSaveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSaveName();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftName(optionLabel);
                  setIsEditingName(false);
                }
              }}
              className="w-full rounded border border-blue-300 bg-white px-2 py-1 text-sm font-semibold text-gray-900 outline-none ring-2 ring-blue-200"
              aria-label="Edit column name"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="inline-flex max-w-full items-center gap-2 rounded px-1 py-0.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              <span
                className={`size-2 rounded-full ${getOptionDotClassName(optionColor)}`}
                aria-hidden
              />
              <span className="truncate">{optionLabel}</span>
            </button>
          )}
        </div>
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
            <div className="flex items-start gap-1.5">
              <RACButton
                slot="drag"
                aria-label={`Drag ${card.title || "Untitled"}`}
                className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <ReOrderRegular className="size-3.5" />
              </RACButton>
              <Link
                to="/w/$organizationSlug/$id"
                params={{ organizationSlug, id: card.id }}
                className="line-clamp-2 block min-w-0 flex-1"
              >
                {card.title || "Untitled"}
              </Link>
            </div>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}

function getOptionDotClassName(color: string | undefined): string {
  switch (color) {
    case "red":
      return "bg-red-500";
    case "orange":
      return "bg-orange-500";
    case "yellow":
      return "bg-yellow-500";
    case "green":
      return "bg-green-500";
    case "blue":
      return "bg-blue-500";
    case "purple":
      return "bg-purple-500";
    case "pink":
      return "bg-pink-500";
    default:
      return "bg-gray-500";
  }
}
