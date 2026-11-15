// Name and type for a new property, with properties other collections already have suggested by
// name (the catalogue: derived from their definitions, nothing stored).
import { useBackend } from "@lydie/plugin-api";
import type { Backend } from "@lydie/plugin-api";
import { TYPE_LABELS, TypeIcon } from "@lydie/plugin-api/databases";
import type { PropertyType } from "@lydie/plugin-api/databases";
import { Button, TextField } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { catalogueOf, copiedConfig, describeEntry, suggest } from "./collection.ts";
import type { CatalogueEntry, NewProperty } from "./collection.ts";
import { SectionLabel, TypeGrid } from "./ui.tsx";

export type PropertyChoice = { name: string; type: PropertyType; config: NewProperty["config"] };

type Props = {
  types: readonly PropertyType[];
  // The collection being added to: its own properties are not suggested.
  collectionId: string | null;
  submitLabel: string;
  onSubmit: (choice: PropertyChoice) => void;
  // Off for a key on one page: there are no settings to copy from a collection.
  suggestions?: boolean;
};

export function PropertyForm({
  types,
  collectionId,
  submitLabel,
  onSubmit,
  suggestions: suggesting = true,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>(types[0] ?? "text");
  const [source, setSource] = useState<CatalogueEntry | null>(null);
  const catalogue = useCatalogue(collectionId, suggesting);
  const suggestions = source
    ? []
    : suggest(
        catalogue.filter((e) => types.includes(e.type)),
        name,
      );
  return (
    <form
      className="flex w-72 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: name.trim() || TYPE_LABELS[type],
          type,
          config: source ? copiedConfig(source) : {},
        });
        setName("");
        setSource(null);
      }}
    >
      <TextField
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to name it
        autoFocus
        aria-label="Property name"
        placeholder="Property name"
        value={name}
        onChange={(next) => {
          setName(next);
          setSource(null);
        }}
      />
      {suggestions.length > 0 && (
        <>
          <SectionLabel>From other collections</SectionLabel>
          <ul aria-label="From other collections" className="flex flex-col gap-0.5">
            {suggestions.map((entry) => (
              <li key={`${entry.collectionId}:${entry.name}`}>
                <Button
                  variant="ghost"
                  size="md"
                  onPress={() => {
                    setName(entry.name);
                    setType(entry.type);
                    setSource(entry);
                  }}
                  className="w-full min-w-0 justify-start px-2 text-gray-800"
                >
                  <TypeIcon type={entry.type} aria-hidden className="size-3.5 text-gray-500" />
                  <span className="truncate">{describeEntry(entry)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <SectionLabel>Type</SectionLabel>
      <TypeGrid
        types={types}
        value={type}
        onPick={(next) => {
          setType(next);
          setSource(null);
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-950/6 pt-2">
        <p className="min-w-0 truncate px-1 text-xs text-gray-500">
          {source ? `Same settings as in ${source.collection}.` : null}
        </p>
        <Button type="submit" variant="primary" size="sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function useCatalogue(collectionId: string | null, enabled: boolean): readonly CatalogueEntry[] {
  const backend = useBackend();
  const [entries, setEntries] = useState<readonly CatalogueEntry[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadCatalogue(backend, collectionId)
      .then((loaded) => {
        if (live) setEntries(loaded);
      })
      // Suggestions are a convenience: without them the form still works.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [backend, collectionId, enabled]);
  return entries;
}

export async function loadCatalogue(
  backend: Backend,
  collectionId: string | null,
): Promise<CatalogueEntry[]> {
  const list = await backend.query("database.list", { workspaceId: backend.info.workspaceId });
  const loaded = await Promise.all(
    list
      .filter((d) => d.id !== collectionId)
      .map(async (d) => ({
        title: d.title,
        definition: (await backend.query("database.get", { id: d.id }))[0] ?? null,
      })),
  );
  return catalogueOf(
    loaded.flatMap((c) => (c.definition ? [{ title: c.title, definition: c.definition }] : [])),
    collectionId,
  );
}
