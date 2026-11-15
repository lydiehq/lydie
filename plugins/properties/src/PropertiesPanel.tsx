// Typed properties under a page's title, collapsible. Properties belong to collections: a page in
// one shows the collection's properties (values by property id through database operations), plus
// its own frontmatter keys the collection does not list. A page outside a collection keeps showing
// and editing the frontmatter it has (types read from the values, doc.setProperties by key), and
// "Add property" leads to a collection instead of adding a free key, except in a connected folder,
// where the frontmatter is the file's own and a key goes on that page alone.
import { useApp, useConnectedPage, useOps, useQuery, userPropertyEntries } from "@lydie/plugin-api";
import type { Document, DocumentSlotProps } from "@lydie/plugin-api";
import {
  ADDABLE_TYPES,
  EditorPopover,
  isEditableType,
  isStoredType,
  PAGE_TYPES,
  PropertyEditor,
  PropertyValueView,
  relatedRows,
  rowValue,
  TypeIcon,
  useDatabase,
  useDatabaseView,
} from "@lydie/plugin-api/databases";
import type {
  DatabaseDefinition,
  DatabaseProperty,
  EditorCloseReason,
  PropertyLike,
  PropertyType,
  PropertyValue,
  RelatedRow,
  ViewRow,
} from "@lydie/plugin-api/databases";
import {
  AddRegular,
  AriaDialog,
  Button,
  Checkbox,
  CollapseArrow,
  DeleteRegular,
  DialogTrigger,
  Popover,
  Pressable,
  sidebarSectionTitleClass,
  TextField,
} from "@lydie/plugin-api/ui";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { adoptedProperty, canAdopt, NEW_PROPERTY_TYPES, strayEntries } from "./collection.ts";
import {
  CollectionPrompt,
  MoveToCollection,
  notifyFailure,
  TYPES_KEY,
} from "./CollectionPrompt.tsx";
import { freeKey, initialValue, pageProperty, retype } from "./infer.ts";
import { PropertyForm } from "./PropertyForm.tsx";
import {
  focusable,
  IconBox,
  MenuAction,
  MenuSeparator,
  SectionLabel,
  treeRow,
  TypeGrid,
} from "./ui.tsx";

const COLLAPSED_KEY = "properties:collapsed";
// Linked pages shown in a row before the rest collapse into "+N" (the editor lists them all).
const MAX_RELATED = 3;

export function PropertiesPanel({ docId }: DocumentSlotProps) {
  const app = useApp();
  const { data } = useQuery("doc.get", { id: docId });
  const doc = data[0]?.document;
  const self = useDatabase(docId);
  const parent = useDatabase(doc?.parentId ?? null);
  // A page shared without its collection: only the property definitions are here (LYD-247).
  const shared = useQuery(
    "database.properties",
    doc?.parentId && !parent.isLoading && !parent.definition ? { databaseId: doc.parentId } : null,
  );
  // Only a title definition is nothing to show (and is what stays behind when turning a page
  // into a collection is undone): the page's own keys show instead.
  const isShared = shared.data.some((p) => p.type !== "title");
  const [collapsed, setCollapsed] = useState(
    () => app.storage.get<boolean>(COLLAPSED_KEY) ?? false,
  );
  // A collection page shows its views, not properties.
  if (!doc || self.definition || (doc.parentId && parent.isLoading && !parent.definition))
    return null;
  // A page outside a collection with no frontmatter (or only page options, such as its icon) has
  // nothing to show ("Add property" is in the page's menu).
  if (!parent.definition && !isShared && userPropertyEntries(doc.properties).length === 0)
    return null;
  const toggle = () => {
    app.storage.set(COLLAPSED_KEY, !collapsed);
    setCollapsed(!collapsed);
  };
  return (
    // Bleeds into the margin so names and values line up with the title while hover backgrounds
    // reach past them, as in the sidebar.
    <section aria-label="Properties" className="-mx-2 mt-1 mb-3" data-testid="properties">
      {parent.definition ? (
        <RowProperties
          doc={doc}
          definition={parent.definition}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ) : isShared ? (
        <SharedRowProperties
          doc={doc}
          properties={shared.data}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ) : (
        <PageProperties doc={doc} collapsed={collapsed} onToggle={toggle} />
      )}
    </section>
  );
}

function Header({
  count,
  collapsed,
  onToggle,
}: {
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  // A sidebar section title ("Documents"), with the tree's caret: shown on hover, and while
  // collapsed so the way back is visible.
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-expanded={!collapsed}
      onPress={onToggle}
      className="group/header gap-1.5 self-start text-gray-500 hover:text-gray-700"
    >
      Properties
      {count > 0 && <span className="tabular-nums">{count}</span>}
      <CollapseArrow
        className={`size-2.5 text-gray-950/45 transition-[opacity,rotate] duration-[100ms,200ms] motion-reduce:transition-none ${collapsed ? "opacity-100" : "rotate-90 opacity-0 group-hover/header:opacity-100 group-focus-visible/header:opacity-100"}`}
      />
    </Button>
  );
}

function AddPropertyTrigger({ children }: { children: (close: () => void) => ReactNode }) {
  return (
    <DialogTrigger>
      <Pressable>
        {/* Muted like the "Empty" values and the collection's "Add a description…": a placeholder
            for what is not there yet, not one of the properties. */}
        <button type="button" className={`${treeRow} self-start text-gray-400 hover:text-gray-600`}>
          <IconBox>
            <AddRegular aria-hidden className="size-3.5" />
          </IconBox>
          Add property
        </button>
      </Pressable>
      <Popover placement="bottom start">
        <AriaDialog aria-label="Add property" className="p-1.5 outline-none">
          {({ close }) => children(close)}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

// ---- A page in a collection

function RowProperties({
  doc,
  definition,
  collapsed,
  onToggle,
}: {
  doc: Document;
  definition: DatabaseDefinition;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const ops = useOps();
  const app = useApp();
  const databaseId = definition.database.id;
  const properties = definition.properties.filter((p) => p.type !== "title");
  const title = definition.properties.find((p) => p.type === "title");
  // Computed values (relation titles, rollups, formulas) come from the view engine: ask for rows
  // with this title and pick this one.
  const view = useDatabaseView(
    title && !collapsed
      ? {
          databaseId,
          view: {
            config: {
              filter: { type: "condition", propertyId: title.id, op: "eq", value: doc.title },
              groupBy: null,
              subGroupBy: null,
              sorts: [],
            },
          },
          window: { offset: 0, limit: 50 },
        }
      : null,
  );
  const row: ViewRow = view.rows.find((r) => r.id === doc.id) ?? {
    id: doc.id,
    title: doc.title,
    sortKey: doc.sortKey,
    properties: doc.properties,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy ?? null,
    updatedBy: doc.updatedBy ?? null,
    group: null,
    subGroup: null,
    computed: {},
  };
  // The document's own properties are fresher than the view while a write is in flight.
  const live: ViewRow = { ...row, properties: doc.properties };
  const failed = notifyFailure(app);
  const stray = strayEntries(definition.properties, doc.properties);
  return (
    <div className="flex flex-col">
      <Header count={properties.length} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <>
          <dl className="flex flex-col gap-0.5">
            {properties.map((property) => (
              <PropertyRow
                key={property.id}
                property={property}
                value={rowValue(property, live)}
                related={relatedRows(property, live)}
                rowId={doc.id}
                onChange={(value) =>
                  void ops.database
                    .setValues({ databaseId, rowIds: [doc.id], set: { [property.id]: value } })
                    .catch(failed)
                }
                menu={(close) => <DatabasePropertyMenu property={property} close={close} />}
              />
            ))}
          </dl>
          <AddPropertyTrigger>
            {(close) => (
              <PropertyForm
                types={NEW_PROPERTY_TYPES}
                collectionId={databaseId}
                submitLabel="Add property"
                onSubmit={(choice) => {
                  close();
                  void ops.database
                    .addProperty({
                      databaseId,
                      name: freeKey(
                        definition.properties.flatMap((p) => [p.name, p.key]),
                        choice.name,
                      ),
                      type: choice.type,
                      config: choice.config,
                    })
                    .catch(failed);
                }}
              />
            )}
          </AddPropertyTrigger>
          {stray.length > 0 && (
            <StrayProperties
              doc={doc}
              entries={stray}
              definition={definition}
              onAdd={(key, value, chosen) =>
                void ops.database
                  .addProperty(
                    { databaseId, ...adoptedProperty(key, value, chosen) },
                    { label: "Add to collection" },
                  )
                  .catch(failed)
              }
            />
          )}
        </>
      )}
    </div>
  );
}

// Frontmatter keys the page has that its collection does not list: shown, editable and removable
// as on a loose page, and one click from becoming a collection property under the same key (so the
// values every page already holds show without being rewritten).
function StrayProperties({
  doc,
  entries,
  definition,
  onAdd,
}: {
  doc: Document;
  entries: readonly [string, unknown][];
  definition: DatabaseDefinition;
  onAdd: (key: string, value: unknown, chosen: PropertyType | null) => void;
}) {
  const { data } = useQuery("doc.get", { id: definition.database.id });
  const title = data[0]?.document.title || "Untitled";
  const { chosen, remember } = useChosenTypes();
  const set = useSetPageProperties(doc.id);
  const keys = Object.keys(doc.properties);
  return (
    <section
      aria-label={`Not in ${title}`}
      className="mt-3 flex flex-col"
      data-testid="stray-properties"
    >
      <h3 className={`flex h-6 items-center px-2 ${sidebarSectionTitleClass}`}>Not in {title}</h3>
      <dl className="flex flex-col gap-0.5">
        {entries.map(([key, value]) => {
          const property = pageProperty(key, value, chosen[key] ?? null);
          return (
            <PropertyRow
              key={key}
              property={property}
              value={value}
              onChange={(next) => set({ [key]: next })}
              menu={(close) => (
                <PagePropertyMenu
                  property={property}
                  keys={keys}
                  close={close}
                  onRename={(name) =>
                    set({ [name]: value as PropertyValue }, [key], "Rename property")
                  }
                  onType={(type) => {
                    remember(key, type);
                    set(
                      { [key]: retype(value as PropertyValue, property.type, type) },
                      [],
                      "Change property type",
                    );
                  }}
                  onRemove={() => set({}, [key], "Remove property")}
                />
              )}
              action={
                canAdopt(key, definition.properties) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Add ${key} to collection`}
                    onPress={() => onAdd(key, value, chosen[key] ?? null)}
                    className="text-gray-950/45"
                  >
                    Add to collection
                  </Button>
                ) : null
              }
            />
          );
        })}
      </dl>
    </section>
  );
}

// The type last chosen for a key on this device: the tie-breaker when a value does not say.
function useChosenTypes() {
  const app = useApp();
  const [chosen, setChosen] = useState<Record<string, PropertyType>>(
    () => app.storage.get<Record<string, PropertyType>>(TYPES_KEY) ?? {},
  );
  const remember = (key: string, type: PropertyType) => {
    const next = { ...chosen, [key]: type };
    setChosen(next);
    app.storage.set(TYPES_KEY, next);
  };
  return { chosen, remember };
}

// Frontmatter by key: set and unset in one operation (a rename is both).
function useSetPageProperties(id: string) {
  const ops = useOps();
  const app = useApp();
  return (values: Record<string, PropertyValue>, unset: string[] = [], label?: string) =>
    void ops.doc
      .setProperties({ id, set: values, unset }, label ? { label } : undefined)
      .catch(notifyFailure(app));
}

function DatabasePropertyMenu({
  property,
  close,
}: {
  property: DatabaseProperty;
  close: () => void;
}) {
  const ops = useOps();
  const [name, setName] = useState(property.name);
  const rename = () => {
    const next = name.trim();
    if (next && next !== property.name)
      void ops.database.renameProperty({ id: property.id, name: next });
  };
  return (
    <div className="flex w-72 flex-col">
      <TextField
        aria-label="Property name"
        value={name}
        onChange={setName}
        onBlur={rename}
        onKeyDown={(event) => {
          // react-aria stops key events by default; Escape still has to reach the popover.
          event.continuePropagation();
          if (event.key === "Enter") {
            rename();
            close();
          }
        }}
      />
      <SectionLabel>Type</SectionLabel>
      <TypeGrid
        types={ADDABLE_TYPES}
        value={property.type}
        // Relations and rollups need a target, which the collection's own property menu sets.
        isDisabled={(t) => (t === "relation" || t === "rollup") && t !== property.type}
        onPick={(type) => {
          close();
          if (type !== property.type)
            void ops.database.changePropertyType({ id: property.id, type });
        }}
      />
      <MenuSeparator />
      <MenuAction
        icon={DeleteRegular}
        danger
        onPress={() => {
          close();
          void ops.database.deleteProperty({ id: property.id });
        }}
      >
        Delete property
      </MenuAction>
    </div>
  );
}

// ---- A page shared without its collection (LYD-247): the property definitions came with it, the
// collection and its views did not. Values are edited by key (as frontmatter); the schema is not
// editable here, and computed values (relations' titles, rollups, formulas) are not available.

export function SharedRowProperties({
  doc,
  properties,
  collapsed,
  onToggle,
}: {
  doc: Document;
  properties: readonly DatabaseProperty[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const ops = useOps();
  const app = useApp();
  const shown = properties.filter((p) => p.type !== "title");
  const failed = notifyFailure(app);
  return (
    <div className="flex flex-col" data-testid="shared-row-properties">
      <Header count={shown.length} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <dl className="flex flex-col gap-0.5">
          {shown.map((property) => {
            const stored =
              isStoredType(property.type) &&
              property.type !== "relation" &&
              property.type !== "uniqueId";
            return (
              <PropertyRow
                key={property.id}
                property={property}
                value={sharedValue(property, doc)}
                readOnly={!stored}
                onChange={(value) =>
                  void ops.doc
                    .setProperties(
                      value === null
                        ? { id: doc.id, unset: [property.key] }
                        : { id: doc.id, set: { [property.key]: value } },
                    )
                    .catch(failed)
                }
              />
            );
          })}
        </dl>
      )}
    </div>
  );
}

function sharedValue(property: DatabaseProperty, doc: Document): unknown {
  switch (property.type) {
    case "createdTime":
      return doc.createdAt;
    case "updatedTime":
      return doc.updatedAt;
    case "createdBy":
      return doc.createdBy ?? null;
    case "updatedBy":
      return doc.updatedBy ?? null;
    case "rollup":
    case "formula":
      return null;
    default:
      return doc.properties[property.key] ?? null;
  }
}

// ---- A page outside a collection: its frontmatter keys, kept editable (vaults come with
// frontmatter). New properties come from a collection, so "Add property" explains that.

function PageProperties({
  doc,
  collapsed,
  onToggle,
}: {
  doc: Document;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { chosen, remember } = useChosenTypes();
  const set = useSetPageProperties(doc.id);
  const [moving, setMoving] = useState(false);
  const connected = useConnectedPage(doc.id);
  const entries = userPropertyEntries(doc.properties);
  // A rename may not land on any key the page has, page options included.
  const keys = Object.keys(doc.properties);
  return (
    <div className="flex flex-col">
      <Header count={entries.length} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <>
          <dl className="flex flex-col gap-0.5">
            {entries.map(([key, value]) => {
              const property = pageProperty(key, value, chosen[key] ?? null);
              return (
                <PropertyRow
                  key={key}
                  property={property}
                  value={value}
                  onChange={(next) => set({ [key]: next })}
                  menu={(close) => (
                    <PagePropertyMenu
                      property={property}
                      keys={keys}
                      close={close}
                      onRename={(name) =>
                        set({ [name]: value as PropertyValue }, [key], "Rename property")
                      }
                      onType={(type) => {
                        remember(key, type);
                        set(
                          { [key]: retype(value as PropertyValue, property.type, type) },
                          [],
                          "Change property type",
                        );
                      }}
                      onRemove={() => set({}, [key], "Remove property")}
                    />
                  )}
                />
              );
            })}
          </dl>
          <AddPropertyTrigger>
            {(close) =>
              connected ? (
                <AddToPage
                  keys={keys}
                  onAdd={(key, type) => {
                    close();
                    remember(key, type);
                    set({ [key]: initialValue(type) }, [], "Add property");
                  }}
                />
              ) : (
                <CollectionPrompt
                  doc={doc}
                  onDone={close}
                  onMove={() => {
                    close();
                    setMoving(true);
                  }}
                />
              )
            }
          </AddPropertyTrigger>
          {moving && <MoveToCollection doc={doc} onClose={() => setMoving(false)} />}
        </>
      )}
    </div>
  );
}

// A page in a connected folder (a GitHub repository): its frontmatter is its file's own, set file
// by file for whatever builds the site there (`sidebar`, `showTitle`), so a new key goes on this
// page alone. A collection would mean nothing to the repository.
function AddToPage({
  keys,
  onAdd,
}: {
  keys: readonly string[];
  onAdd: (key: string, type: PropertyType) => void;
}) {
  return (
    <div className="flex w-72 flex-col" data-testid="add-to-page">
      <p className="px-1 pt-1 pb-3 text-sm text-gray-800">Adds a key to this page's frontmatter.</p>
      <PropertyForm
        types={PAGE_TYPES}
        collectionId={null}
        suggestions={false}
        submitLabel="Add property"
        onSubmit={(property) => onAdd(freeKey(keys, property.name), property.type)}
      />
    </div>
  );
}

function PagePropertyMenu({
  property,
  keys,
  close,
  onRename,
  onType,
  onRemove,
}: {
  property: PropertyLike;
  keys: readonly string[];
  close: () => void;
  onRename: (name: string) => void;
  onType: (type: PropertyType) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(property.name);
  const clash = name.trim() !== property.name && keys.includes(name.trim());
  const rename = () => {
    const next = name.trim();
    if (next && next !== property.name && !clash) onRename(next);
  };
  return (
    <div className="flex w-72 flex-col">
      <TextField
        aria-label="Property name"
        isInvalid={clash}
        errorMessage="A property with that name exists."
        value={name}
        onChange={setName}
        onBlur={rename}
        onKeyDown={(event) => {
          // react-aria stops key events by default; Escape still has to reach the popover.
          event.continuePropagation();
          if (event.key === "Enter") {
            rename();
            close();
          }
        }}
      />
      <SectionLabel>Type</SectionLabel>
      <TypeGrid
        types={PAGE_TYPES}
        value={property.type}
        onPick={(type) => {
          close();
          if (type !== property.type) onType(type);
        }}
      />
      <MenuSeparator />
      <MenuAction
        icon={DeleteRegular}
        danger
        onPress={() => {
          close();
          onRemove();
        }}
      >
        Remove property
      </MenuAction>
    </div>
  );
}

// ---- One row: name (menu) and value (click to edit)

// Values typed into a field: their editor spans the row, like the value it replaces. Pickers
// (dates, options, people) keep their own width.
const TEXT_TYPES: ReadonlySet<PropertyType> = new Set([
  "title",
  "text",
  "url",
  "email",
  "phone",
  "number",
]);

function PropertyRow({
  property,
  value,
  related,
  rowId,
  onChange,
  menu,
  action,
  readOnly = false,
}: {
  property: PropertyLike;
  value: unknown;
  related?: readonly RelatedRow[] | null;
  rowId?: string;
  onChange: (value: PropertyValue) => void;
  // Settings for the property; without it (a schema this user cannot change) just its name.
  menu?: (close: () => void) => ReactNode;
  // Beside the value (a page's key that its collection does not list: "Add to collection").
  action?: ReactNode;
  readOnly?: boolean;
}) {
  // The value's height while its editor is open over it.
  const [cover, setCover] = useState<number | null>(null);
  const editing = cover !== null;
  const anchor = useRef<HTMLDivElement>(null);
  const editable = !readOnly && isEditableType(property.type);
  const start = () => {
    if (editable) setCover(anchor.current?.offsetHeight ?? 30);
  };
  const close = (_reason: EditorCloseReason) => {
    setCover(null);
    anchor.current?.focus();
    requestAnimationFrame(() => anchor.current?.focus());
  };
  const label = (
    <>
      <IconBox>
        <TypeIcon type={property.type} aria-hidden className="size-4" />
      </IconBox>
      <span className="truncate">{property.name}</span>
    </>
  );
  return (
    <div
      className="group/row grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-x-1"
      data-property={property.name}
    >
      <dt className="min-w-0">
        {!menu ? (
          <span className="flex h-[30px] min-w-0 items-center gap-1 px-2 text-sm font-medium text-gray-600">
            {label}
          </span>
        ) : (
          <DialogTrigger>
            <Pressable>
              <button
                type="button"
                aria-label={`${property.name} settings`}
                className={`${treeRow} w-full`}
              >
                {label}
              </button>
            </Pressable>
            <Popover placement="bottom start">
              <AriaDialog aria-label={`${property.name} settings`} className="p-1.5 outline-none">
                {({ close: closeMenu }) => menu(closeMenu)}
              </AriaDialog>
            </Popover>
          </DialogTrigger>
        )}
      </dt>
      <dd className="flex min-w-0 items-start gap-1">
        {editable && property.type === "checkbox" ? (
          <Checkbox
            aria-label={`Edit ${property.name}`}
            isSelected={value === true}
            onChange={onChange}
            className="min-h-[30px] min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1 hover:bg-gray-950/3"
          />
        ) : (
          // A value, not a button: it holds the rendered value (chips, links) and anchors the editor.
          <div
            ref={anchor}
            role="button"
            tabIndex={editable ? 0 : -1}
            aria-label={`Edit ${property.name}`}
            aria-disabled={!editable}
            onClick={start}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                start();
              }
            }}
            className={`flex min-h-[30px] min-w-0 flex-1 items-center rounded-lg px-2 py-1 text-sm text-gray-900 ${focusable} ${editing ? "bg-gray-950/5" : editable ? "cursor-pointer hover:bg-gray-950/3" : ""}`}
          >
            {value === null ||
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0) ? (
              property.type === "checkbox" ? (
                <PropertyValueView property={property} value={false} />
              ) : (
                <span className="text-gray-400">Empty</span>
              )
            ) : (
              <PropertyValueView
                property={property}
                value={value}
                related={related ?? null}
                wrap
                maxRelated={MAX_RELATED}
              />
            )}
          </div>
        )}
        {cover !== null && (
          <EditorPopover
            anchor={anchor}
            label={`Edit ${property.name}`}
            cover={cover}
            fill={TEXT_TYPES.has(property.type)}
            onClose={() => setCover(null)}
          >
            <PropertyEditor
              property={property}
              value={value}
              related={related ?? null}
              {...(rowId ? { rowId } : {})}
              onChange={onChange}
              onClose={close}
            />
          </EditorPopover>
        )}
        {action && (
          <div className="flex h-[30px] shrink-0 items-center opacity-0 transition-opacity duration-75 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
            {action}
          </div>
        )}
      </dd>
    </div>
  );
}
