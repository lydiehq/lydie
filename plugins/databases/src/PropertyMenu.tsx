// A property's settings (from a column header or a card): name, type with its configuration
// (relation target, rollup, formula, number format), and the view actions on it.
import { useApp, useOps, useQuery, useQuerySelect, useTab, useWorkspace } from "@lydie/plugin-api";
import {
  ADDABLE_TYPES,
  groupable,
  isStoredType,
  parseExpression,
  ROLLUP_FUNCTIONS,
  TYPE_LABELS,
  TypeIcon,
  useDatabase,
} from "@lydie/plugin-api/databases";
import type {
  DatabaseProperty,
  PropertyConfig,
  PropertyType,
  RollupFunction,
} from "@lydie/plugin-api/databases";
import {
  Button,
  DownRegular,
  Select,
  SelectItem,
  Switch,
  TextArea,
  TextField,
  UpRegular,
} from "@lydie/plugin-api/ui";
import { useState } from "react";

import { useViewContext } from "./context.tsx";
import { addCondition, defaultCondition, fromRoot, toRoot } from "./filter-model.ts";
import { MenuButtonItem, PanelSection } from "./ui.tsx";
import { allColumns, withColumn } from "./view-model.ts";

const TYPE_GROUPS: readonly { title: string; types: readonly PropertyType[] }[] = [
  {
    title: "Basic",
    types: ["text", "number", "select", "multiSelect", "status", "date", "checkbox", "person"],
  },
  { title: "Links and files", types: ["url", "email", "phone", "files"] },
  { title: "From other pages", types: ["relation", "rollup", "formula"] },
  {
    title: "Automatic",
    types: ["uniqueId", "createdTime", "updatedTime", "createdBy", "updatedBy"],
  },
];

// Every type at a glance, two to a row; arrow keys move between them.
export function TypePicker({
  value,
  onPick,
}: {
  value: PropertyType | null;
  onPick: (type: PropertyType) => void;
}) {
  const listed = new Set(TYPE_GROUPS.flatMap((g) => g.types));
  const groups = [
    ...TYPE_GROUPS,
    // A type added to the contract later still shows.
    { title: "Other", types: ADDABLE_TYPES.filter((t) => !listed.has(t)) },
  ];
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys move between the type buttons inside
    <fieldset
      aria-label="Property type"
      className="flex min-w-0 flex-col gap-1"
      onKeyDown={(event) => {
        const step = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-type]")];
        const next = items[items.indexOf(document.activeElement as HTMLElement) + step];
        if (!next) return;
        event.preventDefault();
        next.focus();
      }}
    >
      {groups.map(
        (group) =>
          group.types.length > 0 && (
            <div key={group.title}>
              <p className="px-1.5 pt-1 pb-0.5 text-xs font-medium text-gray-500">{group.title}</p>
              <div className="grid grid-cols-2 gap-x-1">
                {group.types.map((type) => (
                  <Button
                    key={type}
                    variant="ghost"
                    data-type={type}
                    data-current={value === type || undefined}
                    aria-pressed={value === type}
                    aria-label={TYPE_LABELS[type]}
                    onPress={() => onPick(type)}
                    className="justify-start px-1.5 font-normal text-gray-800 data-current:font-medium"
                  >
                    <TypeIcon type={type} aria-hidden className="size-3.5 text-gray-500" />
                    <span className="truncate">{TYPE_LABELS[type]}</span>
                  </Button>
                ))}
              </div>
            </div>
          ),
      )}
    </fieldset>
  );
}

export function PropertyMenu({
  property,
  close,
}: {
  property: DatabaseProperty;
  close: () => void;
}) {
  const ops = useOps();
  const app = useApp();
  const { definition, view, updateView } = useViewContext();
  const [name, setName] = useState(property.name);
  const isTitle = property.type === "title";
  const fail = (title: string) => (error: unknown) =>
    app.notify({
      title,
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  const rename = () => {
    const next = name.trim();
    if (next && next !== property.name)
      void ops.database
        .renameProperty({ id: property.id, name: next })
        .catch(fail("Could not rename"));
  };
  const columns = allColumns(definition, view);
  return (
    <div className="flex w-72 flex-col" data-testid="property-menu">
      <div className="p-2">
        <TextField
          aria-label="Property name"
          value={name}
          onChange={setName}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              rename();
              close();
            }
          }}
        />
      </div>
      {!isTitle && (
        <PanelSection title="Type">
          <TypeSettings property={property} />
        </PanelSection>
      )}
      <PanelSection>
        <MenuButtonItem
          onPress={() => {
            close();
            updateView(
              {
                sorts: [
                  { propertyId: property.id, direction: "asc" },
                  ...view.config.sorts.filter((s) => s.propertyId !== property.id),
                ],
              },
              { label: "Sort" },
            );
          }}
        >
          ↑ Sort ascending
        </MenuButtonItem>
        <MenuButtonItem
          onPress={() => {
            close();
            updateView(
              {
                sorts: [
                  { propertyId: property.id, direction: "desc" },
                  ...view.config.sorts.filter((s) => s.propertyId !== property.id),
                ],
              },
              { label: "Sort" },
            );
          }}
        >
          ↓ Sort descending
        </MenuButtonItem>
        {view.config.sorts.some((s) => s.propertyId === property.id) && (
          <MenuButtonItem
            onPress={() => {
              close();
              updateView(
                { sorts: view.config.sorts.filter((s) => s.propertyId !== property.id) },
                { label: "Remove sort" },
              );
            }}
          >
            Remove sort
          </MenuButtonItem>
        )}
        <MenuButtonItem
          onPress={() => {
            close();
            updateView(
              {
                filter: fromRoot(
                  addCondition(toRoot(view.config.filter), [], defaultCondition(property)),
                ),
              },
              { label: "Add filter" },
            );
          }}
        >
          Filter by this
        </MenuButtonItem>
        {!isTitle && groupable(property.type) && (
          <MenuButtonItem
            onPress={() => {
              close();
              updateView(
                { groupBy: { propertyId: property.id, direction: "asc" } },
                { label: "Group" },
              );
            }}
          >
            Group by this
          </MenuButtonItem>
        )}
        {!isTitle && (
          <MenuButtonItem
            onPress={() => {
              close();
              updateView(
                { columns: withColumn(columns, property.id, { visible: false }) },
                { label: "Hide property" },
              );
            }}
          >
            Hide in view
          </MenuButtonItem>
        )}
      </PanelSection>
      {!isTitle && (
        <PanelSection>
          <MenuButtonItem
            danger
            onPress={() => {
              close();
              void ops.database
                .deleteProperty({ id: property.id })
                .catch(fail("Could not delete the property"));
            }}
          >
            Delete property
          </MenuButtonItem>
        </PanelSection>
      )}
    </div>
  );
}

function TypeSettings({ property }: { property: DatabaseProperty }) {
  const ops = useOps();
  const app = useApp();
  const fail = (error: unknown) =>
    app.notify({
      title: "Could not change the property",
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  const changeType = (type: PropertyType, config?: PropertyConfig) =>
    void ops.database
      .changePropertyType({ id: property.id, type, ...(config ? { config } : {}) })
      .catch(fail);
  const updateConfig = (config: PropertyConfig) =>
    void ops.database.updateProperty({ id: property.id, config }).catch(fail);
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="flex flex-col gap-2 px-2 pb-1">
      <Button
        variant="secondary"
        aria-expanded={choosing}
        onPress={() => setChoosing(!choosing)}
        className="w-full justify-start font-normal"
      >
        <TypeIcon type={property.type} aria-hidden className="size-3.5 text-gray-500" />
        <span className="grow text-left">{TYPE_LABELS[property.type]}</span>
        {choosing ? (
          <UpRegular aria-hidden className="text-gray-500" />
        ) : (
          <DownRegular aria-hidden className="text-gray-500" />
        )}
      </Button>
      {choosing && (
        <TypePicker
          value={property.type}
          onPick={(type) => {
            setChoosing(false);
            if (type === property.type) return;
            // Relations and rollups need a target first; pick it below.
            if (type === "relation" || type === "rollup") changeType(type, {});
            else changeType(type);
          }}
        />
      )}
      {property.type === "number" && (
        <Select
          aria-label="Number format"
          selectedKey={property.config.numberFormat ?? "number"}
          onSelectionChange={(key) =>
            updateConfig({
              ...property.config,
              numberFormat: key as PropertyConfig["numberFormat"],
            })
          }
        >
          <SelectItem id="number">Number</SelectItem>
          <SelectItem id="integer">Integer</SelectItem>
          <SelectItem id="commas">Number with commas</SelectItem>
          <SelectItem id="percent">Percent</SelectItem>
          <SelectItem id="currency">Currency</SelectItem>
        </Select>
      )}
      {property.type === "relation" && (
        <RelationSettings
          property={property}
          onChange={(config) => changeType("relation", config)}
        />
      )}
      {property.type === "rollup" && <RollupSettings property={property} onChange={updateConfig} />}
      {property.type === "formula" && <FormulaEditor property={property} onSave={updateConfig} />}
      {property.type === "uniqueId" && (
        <PrefixInput
          key={property.config.prefix ?? ""}
          property={property}
          onSave={updateConfig}
          onInvalid={() =>
            app.notify({
              title: "Could not change the prefix",
              description: "Use letters and digits, starting with a letter (up to 16).",
              kind: "error",
            })
          }
        />
      )}
      {((!isStoredType(property.type) &&
        property.type !== "formula" &&
        property.type !== "rollup") ||
        property.type === "uniqueId") && (
        <p className="text-xs text-gray-500">Filled in automatically.</p>
      )}
    </div>
  );
}

// "LYD" makes IDs read LYD-1, LYD-2…; saved on Enter or when the field loses focus.
function PrefixInput({
  property,
  onSave,
  onInvalid,
}: {
  property: DatabaseProperty;
  onSave: (config: PropertyConfig) => void;
  onInvalid: () => void;
}) {
  const saved = property.config.prefix ?? "";
  const [text, setText] = useState(saved);
  const commit = () => {
    const prefix = text.trim();
    if (prefix === saved) return;
    if (prefix !== "" && !/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(prefix)) {
      setText(saved);
      return onInvalid();
    }
    const config: PropertyConfig = { ...property.config, prefix };
    if (!prefix) delete config.prefix;
    onSave(config);
  };
  return (
    <TextField
      label="Prefix"
      value={text}
      placeholder="e.g. LYD"
      maxLength={16}
      onChange={setText}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function RelationSettings({
  property,
  onChange,
}: {
  property: DatabaseProperty;
  onChange: (config: PropertyConfig) => void;
}) {
  const app = useApp();
  const tabId = useTab()?.id ?? null;
  const workspace = useWorkspace();
  const { data: databases } = useQuery("database.list", { workspaceId: workspace.workspaceId });
  const relation = property.config.relation;
  const other =
    databases.find((d) => d.id === relation?.databaseId)?.title ?? "the other collection";
  const fail = (error: unknown) =>
    app.notify({
      title: "Could not change the property",
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  // Showing the link on the other side too (the default for a new relation) creates the reverse
  // property there; turning that off is done by deleting the reverse property.
  const showOnOther = (config: PropertyConfig) =>
    void app.backend.ops.database
      .updateProperty({ id: property.id, config }, { scope: tabId ?? app.historyScope() })
      .catch(fail);
  const pickTarget = (databaseId: string) => {
    const next: PropertyConfig = {
      ...property.config,
      relation: {
        databaseId,
        twoWay: relation?.twoWay ?? false,
        reversePropertyId: relation?.reversePropertyId ?? null,
        limit: relation?.limit ?? "many",
      },
    };
    if (relation) return onChange(next);
    // A new relation: the target and its other side in one step.
    void app.backend
      .transaction(
        "Relation",
        async (tx) => {
          await tx.database.changePropertyType({ id: property.id, type: "relation", config: next });
          await tx.database.updateProperty({
            id: property.id,
            config: { ...next, relation: { ...next.relation!, twoWay: true } },
          });
        },
        { scope: tabId ?? app.historyScope() },
      )
      .catch(fail);
  };
  return (
    <div className="flex flex-col gap-2">
      <Select
        label="Related collection"
        placeholder="Choose a collection…"
        selectedKey={relation?.databaseId ?? null}
        onSelectionChange={(key) => key && pickTarget(String(key))}
      >
        {databases.map((d) => (
          <SelectItem key={d.id} id={d.id}>
            {d.title}
          </SelectItem>
        ))}
      </Select>
      {relation && (
        <Switch
          isSelected={relation.limit === "one"}
          onChange={(one) =>
            onChange({
              ...property.config,
              relation: { ...relation, limit: one ? "one" : "many" },
            })
          }
        >
          Limit to one page
        </Switch>
      )}
      {relation && (
        <Switch
          isSelected={relation.twoWay}
          isDisabled={relation.twoWay}
          onChange={(on) =>
            on && showOnOther({ ...property.config, relation: { ...relation, twoWay: true } })
          }
        >
          Also show on {other}
        </Switch>
      )}
    </div>
  );
}

function RollupSettings({
  property,
  onChange,
}: {
  property: DatabaseProperty;
  onChange: (config: PropertyConfig) => void;
}) {
  const { definition } = useViewContext();
  const rollup = property.config.rollup;
  const relations = definition.properties.filter((p) => p.type === "relation");
  const relation = relations.find((p) => p.id === rollup?.relationPropertyId) ?? relations[0];
  const target = useDatabase(relation?.config.relation?.databaseId ?? null).definition;
  if (relations.length === 0) {
    return <p className="text-xs text-gray-500">Add a relation property first.</p>;
  }
  const set = (patch: Partial<NonNullable<PropertyConfig["rollup"]>>) => {
    const relationPropertyId =
      patch.relationPropertyId ?? rollup?.relationPropertyId ?? relation!.id;
    const targetPropertyId =
      patch.targetPropertyId ?? rollup?.targetPropertyId ?? target?.properties[0]?.id;
    if (!targetPropertyId) return;
    onChange({
      ...property.config,
      rollup: {
        relationPropertyId,
        targetPropertyId,
        function: patch.function ?? rollup?.function ?? "showOriginal",
      },
    });
  };
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label="Rollup relation"
        placeholder="Relation…"
        selectedKey={rollup?.relationPropertyId ?? null}
        onSelectionChange={(key) => key && set({ relationPropertyId: String(key) })}
      >
        {relations.map((p) => (
          <SelectItem key={p.id} id={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </Select>
      <Select
        aria-label="Rollup property"
        placeholder="Property…"
        selectedKey={rollup?.targetPropertyId ?? null}
        onSelectionChange={(key) => key && set({ targetPropertyId: String(key) })}
      >
        {(target?.properties ?? []).map((p) => (
          <SelectItem key={p.id} id={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </Select>
      <Select
        aria-label="Rollup function"
        selectedKey={rollup?.function ?? "showOriginal"}
        onSelectionChange={(key) => set({ function: key as RollupFunction })}
      >
        {ROLLUP_FUNCTIONS.map((f) => (
          <SelectItem key={f} id={f}>
            {f.replace(/([A-Z])/g, " $1").toLowerCase()}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}

const FORMULA_FUNCTIONS = [
  "if(cond, a, b)",
  "now()",
  "today()",
  "date(text)",
  "number(x)",
  "min(a, b)",
  "max(a, b)",
  "duration(text)",
  ".contains(x)",
  ".lower()",
  ".upper()",
  ".trim()",
  ".round(n)",
  ".toFixed(n)",
  ".join(sep)",
  ".slice(a, b)",
  ".replace(a, b)",
];

// The formula editor: an Obsidian Bases expression, checked with the contract's parser as you type.
export function FormulaEditor({
  property,
  onSave,
}: {
  property: DatabaseProperty;
  onSave: (config: PropertyConfig) => void;
}) {
  const { definition } = useViewContext();
  const [text, setText] = useState(property.config.expression ?? "");
  let error: string | null = null;
  if (text.trim()) {
    try {
      parseExpression(text);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const insert = (snippet: string) =>
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${snippet}`);
  const refFor = (p: DatabaseProperty) =>
    p.type === "title"
      ? "file.name"
      : /^[\p{L}_][\p{L}\p{N}_]*$/u.test(p.key)
        ? p.key
        : `note[${JSON.stringify(p.key)}]`;
  return (
    <div className="flex flex-col gap-1" data-testid="formula-editor">
      <TextArea
        aria-label="Formula"
        aria-invalid={error !== null}
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        className="font-mono text-xs"
      />
      <p role="status" className={`text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
        {error ?? (text.trim() ? "Valid formula" : "Write an expression, e.g. Price * Quantity")}
      </p>
      <Button
        size="sm"
        isDisabled={error !== null}
        onPress={() => onSave({ ...property.config, expression: text })}
        className="self-end"
      >
        Save formula
      </Button>
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-600">Properties and functions</summary>
        <div className="flex flex-wrap gap-1 pt-1">
          {definition.properties
            .filter((p) => p.id !== property.id)
            .map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                size="xs"
                onPress={() => insert(refFor(p))}
                className="font-mono font-normal"
              >
                {refFor(p)}
              </Button>
            ))}
          {FORMULA_FUNCTIONS.map((f) => (
            <Button
              key={f}
              variant="secondary"
              size="xs"
              onPress={() => insert(f)}
              className="font-mono font-normal text-blue-700"
            >
              {f}
            </Button>
          ))}
        </div>
      </details>
    </div>
  );
}

// Adding a property from the table's "+" column (or a card): name it, pick a type, done. A
// relation asks for the collection it links to first. Enter in the name adds a text property.
export function AddPropertyForm({ close }: { close: () => void }) {
  const ops = useOps();
  const app = useApp();
  const { databaseId, definition } = useViewContext();
  const [name, setName] = useState("");
  const [relating, setRelating] = useState(false);
  const workspace = useWorkspace();
  const { data: databases } = useQuery("database.list", { workspaceId: workspace.workspaceId });
  const [target, setTarget] = useState<string>("");
  // Two-way by default: the link shows on both sides unless unchecked.
  const [twoWay, setTwoWay] = useState(true);
  const databaseTitle = useQuerySelect(
    "doc.get",
    { id: databaseId },
    (s) => s.data[0]?.document.title ?? "",
  );
  const add = (type: PropertyType) => {
    if (type === "relation" && !target) return setRelating(true);
    const taken = new Set(definition.properties.map((p) => p.name.toLowerCase()));
    let finalName = name.trim() || TYPE_LABELS[type];
    for (let i = 2; taken.has(finalName.toLowerCase()); i++)
      finalName = `${name.trim() || TYPE_LABELS[type]} ${i}`;
    const config: PropertyConfig =
      type === "relation"
        ? { relation: { databaseId: target, twoWay, reversePropertyId: null, limit: "many" } }
        : {};
    close();
    void ops.database
      .addProperty({
        databaseId,
        name: finalName,
        type,
        config,
        ...(type === "relation" && twoWay ? { reverseName: databaseTitle || "Related" } : {}),
      })
      .catch((error: unknown) =>
        app.notify({
          title: "Could not add the property",
          description: error instanceof Error ? error.message : String(error),
          kind: "error",
        }),
      );
  };
  return (
    <form
      className="flex w-72 flex-col gap-2 p-2"
      aria-label="New property"
      onSubmit={(event) => {
        event.preventDefault();
        add(relating ? "relation" : "text");
      }}
    >
      <TextField
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to name the property
        autoFocus
        aria-label="Property name"
        placeholder="Property name"
        value={name}
        onChange={setName}
      />
      {!relating ? (
        <TypePicker value={null} onPick={add} />
      ) : (
        <>
          <Button
            variant="ghost"
            size="xs"
            onPress={() => setRelating(false)}
            className="self-start text-gray-500"
          >
            ← All types
          </Button>
          <Select
            aria-label="Related collection"
            placeholder="Related collection…"
            selectedKey={target || null}
            onSelectionChange={(key) => setTarget(key === null ? "" : String(key))}
          >
            {databases.map((d) => (
              <SelectItem key={d.id} id={d.id}>
                {d.title}
              </SelectItem>
            ))}
          </Select>
          <Switch isSelected={twoWay} onChange={setTwoWay}>
            Also show on {databases.find((d) => d.id === target)?.title ?? "the other collection"}
          </Switch>
          <Button type="submit" isDisabled={!target}>
            Add relation
          </Button>
        </>
      )}
    </form>
  );
}
