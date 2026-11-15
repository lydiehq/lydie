// What "Add property" offers a page outside a collection: properties are shared by the pages of a
// collection, so the page's parent becomes one (keeping the keys this page already has), or a
// top-level page moves into an existing one.
import { useApp, useBackend, useOps, useQuery, useTab } from "@lydie/plugin-api";
import type { AppApi, Backend, Document } from "@lydie/plugin-api";
import type { PropertyType } from "@lydie/plugin-api/databases";
import { Button, PickerDialog } from "@lydie/plugin-api/ui";
import { useState } from "react";

import { adoptedProperty, canAdopt, NEW_PROPERTY_TYPES } from "./collection.ts";
import { freeKey } from "./infer.ts";
import { PropertyForm } from "./PropertyForm.tsx";
import type { PropertyChoice } from "./PropertyForm.tsx";

export const TYPES_KEY = "properties:types";

export const EXPLANATION = "Properties are shared by the pages of a collection.";

export function notifyFailure(app: AppApi) {
  return (error: unknown) =>
    app.notify({
      title: "Could not save",
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
}

// One undo step: the parent becomes a collection, this page's keys become its properties (same
// keys, so every sub-page's values under them show), then the new property is added.
export async function makeCollection(
  backend: Backend,
  options: {
    doc: Document;
    parentId: string;
    parentTitle: string;
    chosen: Record<string, PropertyType>;
    property: PropertyChoice;
    scope: string;
  },
): Promise<string> {
  const { doc, parentId, chosen, property } = options;
  return backend.transaction(
    `Make ${options.parentTitle} a collection`,
    async (ops) => {
      const definition = await ops.database.create({
        workspaceId: doc.workspaceId,
        documentId: parentId,
      });
      const databaseId = definition.database.id;
      const properties = [...definition.properties];
      for (const [key, value] of Object.entries(doc.properties)) {
        if (!canAdopt(key, properties)) continue;
        properties.push(
          await ops.database.addProperty({
            databaseId,
            ...adoptedProperty(key, value, chosen[key] ?? null),
          }),
        );
      }
      await ops.database.addProperty({
        databaseId,
        name: freeKey(
          properties.flatMap((p) => [p.name, p.key]),
          property.name,
        ),
        type: property.type,
        config: property.config,
      });
      return databaseId;
    },
    { scope: options.scope },
  );
}

type Props = {
  doc: Document;
  // The prompt's work is done (or handed to an operation): close what holds it.
  onDone: () => void;
  // Open the collection picker (it is a modal of its own, so the holder renders it).
  onMove: () => void;
};

export function CollectionPrompt({ doc, onDone, onMove }: Props) {
  const app = useApp();
  const backend = useBackend();
  const tab = useTab();
  const parentId = doc.parentId;
  const parent = useQuery("doc.get", parentId ? { id: parentId } : null).data[0]?.document;
  const siblings = useQuery(
    "doc.children",
    parentId ? { workspaceId: doc.workspaceId, parentId } : null,
  ).data;
  if (!parentId) {
    return (
      <div className="flex w-72 flex-col gap-3 p-1" data-testid="collection-prompt">
        <p className="text-sm text-gray-800">{EXPLANATION}</p>
        <Button variant="secondary" size="sm" className="self-end" onPress={onMove}>
          Move to a collection…
        </Button>
      </div>
    );
  }
  const title = parent?.title || "Untitled";
  const count = Math.max(siblings.length, 1);
  return (
    <div className="flex w-72 flex-col" data-testid="collection-prompt">
      <div className="flex flex-col gap-1 px-1 pt-1 pb-3">
        <p className="text-sm text-gray-800">{EXPLANATION}</p>
        <p className="text-xs text-gray-500">
          {title} will show its {count} {count === 1 ? "sub-page" : "sub-pages"} as a collection.
          Its text stays.
        </p>
      </div>
      <PropertyForm
        types={NEW_PROPERTY_TYPES}
        collectionId={null}
        submitLabel={`Make ${title} a collection`}
        onSubmit={(property) => {
          onDone();
          makeCollection(backend, {
            doc,
            parentId,
            parentTitle: title,
            chosen: app.storage.get<Record<string, PropertyType>>(TYPES_KEY) ?? {},
            property,
            scope: tab?.id ?? app.historyScope(),
          }).catch(notifyFailure(app));
        }}
      />
    </div>
  );
}

export function MoveToCollection({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const app = useApp();
  const ops = useOps();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery("database.list", { workspaceId: doc.workspaceId });
  const q = query.trim().toLowerCase();
  const items = data
    .filter((d) => d.id !== doc.id && d.title.toLowerCase().includes(q))
    .map((d) => ({ id: d.id, title: d.title || "Untitled" }));
  return (
    <PickerDialog
      label="Move to a collection"
      placeholder="Search collections…"
      query={query}
      onQueryChange={setQuery}
      items={items}
      isLoading={isLoading}
      emptyText="No collections"
      onClose={onClose}
      onSelect={(item) => {
        onClose();
        ops.doc
          .move({ id: doc.id, parentId: item.id }, { label: `Move to ${item.title}` })
          .catch(notifyFailure(app));
      }}
    />
  );
}
