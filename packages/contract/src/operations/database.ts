import { z } from "zod";

import {
  Database,
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseView,
  DefinitionInput,
  FilterNode,
  GroupKey,
  PropertyConfigInput,
  PropertyKeyName,
  PropertyReference,
  PropertyType,
  SelectOption,
  ViewConfig,
  ViewConfigPatch,
  ViewResult,
  ViewType,
  ViewWindow,
} from "../database/entities.ts";
import { defineOperation, defineQuery } from "../define.ts";
import {
  Document,
  PropertyValue,
  SortKey,
  Timestamp,
  Title,
  Uuid,
  WorkspaceId,
} from "../entities.ts";

// Databases (see database/entities.ts). Schema and view changes emit `database.changed`, which the
// file bridge uses to rewrite the `.base` file; row values are document properties and emit
// `doc.propertiesChanged` like any other property change.

const placement = {
  afterId: Uuid.optional().describe("Place directly after this sibling."),
  beforeId: Uuid.optional().describe("Place directly before this sibling."),
  sortKey: SortKey.optional().describe("Explicit fractional key (recorded so replays converge)."),
};

const write = {
  scopes: ["docs:write"] as const,
  undo: "inverse" as const,
  emits: ["database.changed"] as const,
};

// ---- Databases

export const databaseCreate = defineOperation({
  id: "database.create",
  summary: "Create a database",
  description:
    "Creates a database: a document whose children are its rows. With documentId, turns an " +
    "existing document into a database (its children become rows). Starts with a title " +
    "property and one view.",
  input: z.object({
    workspaceId: WorkspaceId,
    id: Uuid.optional().describe("Client-minted id of the new database document."),
    documentId: Uuid.optional().describe("Turn this existing document into a database."),
    parentId: Uuid.nullable().default(null),
    title: Title.default("Untitled database"),
    teamspaceId: z
      .string()
      .min(1)
      .max(64)
      .nullable()
      .optional()
      .describe(
        "Hosted: the teamspace a new top-level database goes into (null or absent: the " +
          "creator's private section). Ignored with parentId or documentId, and in local mode.",
      ),
    ...placement,
    viewType: ViewType.default("table"),
    titlePropertyId: Uuid.optional(),
    viewId: Uuid.optional(),
  }),
  output: DatabaseDefinition,
  ...write,
  destructive: false,
  idempotent: false,
  emits: ["database.changed", "doc.created"],
  rest: { method: "POST", path: "/databases" },
  mcp: { name: "create_database", title: "Create database" },
  cli: { command: ["db", "create"], args: ["title"] },
  ui: { commandPalette: { title: "New database", group: "Database" } },
});

export const databaseUpdate = defineOperation({
  id: "database.update",
  summary: "Update database settings",
  description: "Sets the filter applied to every view and the row templates.",
  input: z.object({
    id: Uuid,
    filter: FilterNode.nullable().optional(),
    templateIds: z.array(Uuid).optional(),
  }),
  output: Database,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "PATCH", path: "/databases/{id}" },
  mcp: { name: "update_database", title: "Update database settings", expose: "fine" },
  cli: { command: ["db", "update"], args: ["id"] },
});

export const databaseDelete = defineOperation({
  id: "database.delete",
  summary: "Turn a database back into a page",
  description:
    "Removes the database (schema and views go to the trash with it); the document and its rows " +
    "stay as ordinary pages. To delete the document itself use doc.delete.",
  input: z.object({ id: Uuid }),
  output: Database,
  ...write,
  destructive: true,
  idempotent: true,
  rest: { method: "DELETE", path: "/databases/{id}" },
  mcp: { name: "delete_database", title: "Turn database into page", expose: "fine" },
  cli: { command: ["db", "rm"], args: ["id"] },
});

export const databaseRestore = defineOperation({
  id: "database.restore",
  summary: "Restore a database",
  input: z.object({ id: Uuid }),
  output: Database,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/databases/{id}/restore" },
  mcp: { name: "restore_database", title: "Restore database", expose: "fine" },
  cli: { command: ["db", "restore"], args: ["id"] },
});

export const databaseSetDefinition = defineOperation({
  id: "database.setDefinition",
  summary: "Replace a database's schema and views",
  description:
    "Applies a whole definition (what fromBase reads from a .base file): properties and views " +
    "with a known id are updated, new ones created, live ones missing from it deleted. Row " +
    "values are not touched.",
  input: z.object({ id: Uuid, definition: DefinitionInput }),
  output: DatabaseDefinition,
  ...write,
  destructive: true,
  idempotent: true,
  rest: { method: "PUT", path: "/databases/{id}/definition" },
  mcp: { name: "set_database_definition", title: "Replace database definition", expose: "fine" },
  cli: { command: ["db", "define"], args: ["id"] },
});

export const databaseGet = defineQuery({
  id: "database.get",
  summary: "Get a database",
  description: "Returns a database's settings, live properties and views, in order.",
  input: z.object({ id: Uuid }),
  output: DatabaseDefinition,
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/databases/{id}" },
  mcp: { name: "get_database", title: "Get database" },
  cli: { command: ["db", "get"], args: ["id"] },
});

export const databaseListTemplates = defineQuery({
  id: "database.listTemplates",
  summary: "List row templates",
  description:
    "The database's row templates (config.templateIds), in order, live ones only. Templates are " +
    "left out of views, counts and relation pickers; pass one as createRow's templateId.",
  input: z.object({ databaseId: Uuid }),
  output: z.object({ templates: z.array(Document) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/databases/{databaseId}/templates" },
  mcp: { name: "list_row_templates", title: "List row templates", expose: "fine" },
  cli: { command: ["db", "templates"], args: ["databaseId"] },
});

export const DatabaseSummary = Database.extend({
  title: z.string(),
  parentId: Uuid.nullable(),
}).meta({ id: "DatabaseSummary" });

export const databaseList = defineQuery({
  id: "database.list",
  summary: "List databases",
  description: "Lists the live databases of a workspace (database documents not in the trash).",
  input: z.object({ workspaceId: WorkspaceId }),
  output: z.object({ databases: z.array(DatabaseSummary) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/databases" },
  mcp: { name: "list_databases", title: "List databases" },
  cli: { command: ["db", "ls"], args: ["workspaceId"] },
});

export const databaseQuery = defineQuery({
  id: "database.query",
  summary: "Query a database",
  description:
    "Returns one window of a view's rows (filtered, sorted, grouped), with the total and group " +
    "counts. Pass viewId for a saved view, or view for an ad-hoc one (both: view overrides). " +
    "Properties in filters, sorts and groups are named by id, key or name. Page with window " +
    "(offset, limit; hasMore says whether rows remain). uniqueId values are numbers (shown as " +
    'prefix-number, e.g. LYD-12); filters take 12 or "LYD-12".',
  input: z.object({
    databaseId: Uuid,
    viewId: z.string().min(1).optional().describe("A saved view's id or name."),
    view: z
      .object({ type: ViewType.default("table"), config: ViewConfigPatch.default({}) })
      .optional(),
    window: ViewWindow.default({ offset: 0, limit: 100 }),
    today: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("The caller's local date for relative date filters. Default: the server's."),
  }),
  output: ViewResult,
  scopes: ["docs:read"],
  rest: { method: "POST", path: "/databases/{databaseId}/query" },
  mcp: { name: "query_database", title: "Query database" },
  cli: { command: ["db", "query"], args: ["databaseId"] },
});

// ---- Properties

export const databaseAddProperty = defineOperation({
  id: "database.addProperty",
  summary: "Add a database property",
  description:
    "Adds a property. key defaults to the name (the frontmatter key in a folder). A two-way " +
    "relation also adds the synced property on the related database " +
    "(config.relation.reversePropertyId is its id). A uniqueId (config.prefix, e.g. LYD) numbers " +
    'the existing rows in creation order; its key may not be "id".',
  input: z.object({
    databaseId: Uuid,
    id: Uuid.optional(),
    name: z.string().trim().min(1).max(200),
    type: PropertyType,
    key: PropertyKeyName.optional(),
    config: PropertyConfigInput.default({}),
    reverseName: z.string().trim().min(1).max(200).optional().describe("Two-way relations."),
    ...placement,
  }),
  output: DatabaseProperty,
  ...write,
  emits: ["database.changed", "doc.propertiesChanged"],
  destructive: false,
  idempotent: false,
  rest: { method: "POST", path: "/databases/{databaseId}/properties" },
  mcp: { name: "add_database_property", title: "Add database property", expose: "fine" },
  cli: { command: ["db", "prop", "add"], args: ["databaseId", "name", "type"] },
});

export const databaseRenameProperty = defineOperation({
  id: "database.renameProperty",
  summary: "Rename a database property",
  description:
    "Changes the display name only; the frontmatter key and row values stay (use " +
    "database.updateProperty with key to rename the key).",
  input: z.object({ id: Uuid, name: z.string().trim().min(1).max(200) }),
  output: DatabaseProperty,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-properties/{id}/rename" },
  mcp: { name: "rename_database_property", title: "Rename database property", expose: "fine" },
  cli: { command: ["db", "prop", "rename"], args: ["id", "name"] },
});

export const databaseUpdateProperty = defineOperation({
  id: "database.updateProperty",
  summary: "Update a database property",
  description:
    "Replaces the property's configuration and/or its key. A new key moves every row's value " +
    "to it (one undo step).",
  input: z.object({
    id: Uuid,
    key: PropertyKeyName.optional(),
    config: PropertyConfigInput.optional(),
  }),
  output: DatabaseProperty,
  ...write,
  destructive: false,
  idempotent: true,
  emits: ["database.changed", "doc.propertiesChanged"],
  rest: { method: "PATCH", path: "/database-properties/{id}" },
  mcp: { name: "update_database_property", title: "Update database property", expose: "fine" },
  cli: { command: ["db", "prop", "update"], args: ["id"] },
});

export const databaseChangePropertyType = defineOperation({
  id: "database.changePropertyType",
  summary: "Change a property's type",
  description:
    "Changes the type and converts every row's value (see the conversion table in the docs). " +
    "convert: false keeps the values as they are.",
  input: z.object({
    id: Uuid,
    type: PropertyType,
    config: PropertyConfigInput.optional(),
    convert: z.boolean().default(true),
  }),
  output: z.object({ property: DatabaseProperty, converted: z.number().int().min(0) }),
  ...write,
  destructive: false,
  idempotent: true,
  emits: ["database.changed", "doc.propertiesChanged"],
  rest: { method: "POST", path: "/database-properties/{id}/type" },
  mcp: { name: "change_database_property_type", title: "Change property type", expose: "fine" },
  cli: { command: ["db", "prop", "type"], args: ["id", "type"] },
});

export const databaseMoveProperty = defineOperation({
  id: "database.moveProperty",
  summary: "Reorder a database property",
  input: z.object({ id: Uuid, ...placement }),
  output: DatabaseProperty,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-properties/{id}/move" },
  mcp: { name: "move_database_property", title: "Reorder database property", expose: "fine" },
  cli: { command: ["db", "prop", "mv"], args: ["id"] },
});

export const databaseDeleteProperty = defineOperation({
  id: "database.deleteProperty",
  summary: "Delete a database property",
  description:
    "Moves the property to the trash. Row values stay in the documents' properties, so " +
    "restoring it brings them back. Deleting one side of a two-way relation makes the other " +
    "side one-way.",
  input: z.object({ id: Uuid }),
  output: DatabaseProperty,
  ...write,
  destructive: true,
  idempotent: true,
  rest: { method: "DELETE", path: "/database-properties/{id}" },
  mcp: { name: "delete_database_property", title: "Delete database property", expose: "fine" },
  cli: { command: ["db", "prop", "rm"], args: ["id"] },
});

export const databaseRestoreProperty = defineOperation({
  id: "database.restoreProperty",
  summary: "Restore a database property",
  input: z.object({ id: Uuid }),
  output: DatabaseProperty,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-properties/{id}/restore" },
  mcp: { name: "restore_database_property", title: "Restore database property", expose: "fine" },
  cli: { command: ["db", "prop", "restore"], args: ["id"] },
});

// ---- Select, multi-select and status options

const OptionInput = SelectOption.extend({ id: Uuid.optional() });

export const databaseAddOption = defineOperation({
  id: "database.addOption",
  summary: "Add a select option",
  input: z.object({
    propertyId: Uuid,
    option: OptionInput,
    index: z.number().int().min(0).optional().describe("Default: last."),
  }),
  output: DatabaseProperty,
  ...write,
  destructive: false,
  idempotent: false,
  rest: { method: "POST", path: "/database-properties/{propertyId}/options" },
  mcp: { name: "add_select_option", title: "Add select option", expose: "fine" },
  cli: { command: ["db", "option", "add"], args: ["propertyId"] },
});

export const databaseUpdateOption = defineOperation({
  id: "database.updateOption",
  summary: "Rename or recolour a select option",
  description:
    "Rows store the option's name, so renaming rewrites the rows that use it (one undo step).",
  input: z.object({
    propertyId: Uuid,
    optionId: Uuid,
    name: z.string().trim().min(1).max(200).optional(),
    color: SelectOption.shape.color.optional(),
    group: SelectOption.shape.group,
  }),
  output: z.object({ property: DatabaseProperty, rewritten: z.number().int().min(0) }),
  ...write,
  destructive: false,
  idempotent: true,
  emits: ["database.changed", "doc.propertiesChanged"],
  rest: { method: "PATCH", path: "/database-properties/{propertyId}/options/{optionId}" },
  mcp: { name: "update_select_option", title: "Update select option", expose: "fine" },
  cli: { command: ["db", "option", "update"], args: ["propertyId", "optionId"] },
});

export const databaseMoveOption = defineOperation({
  id: "database.moveOption",
  summary: "Reorder a select option",
  input: z.object({ propertyId: Uuid, optionId: Uuid, index: z.number().int().min(0) }),
  output: DatabaseProperty,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-properties/{propertyId}/options/{optionId}/move" },
  mcp: { name: "move_select_option", title: "Reorder select option", expose: "fine" },
  cli: { command: ["db", "option", "mv"], args: ["propertyId", "optionId", "index"] },
});

export const databaseDeleteOption = defineOperation({
  id: "database.deleteOption",
  summary: "Delete a select option",
  description: "Removes the option and clears it from every row that uses it (one undo step).",
  input: z.object({ propertyId: Uuid, optionId: Uuid }),
  output: z.object({ property: DatabaseProperty, rewritten: z.number().int().min(0) }),
  ...write,
  destructive: true,
  idempotent: true,
  emits: ["database.changed", "doc.propertiesChanged"],
  rest: { method: "DELETE", path: "/database-properties/{propertyId}/options/{optionId}" },
  mcp: { name: "delete_select_option", title: "Delete select option", expose: "fine" },
  cli: { command: ["db", "option", "rm"], args: ["propertyId", "optionId"] },
});

// ---- Views

export const databaseCreateView = defineOperation({
  id: "database.createView",
  summary: "Create a database view",
  input: z.object({
    databaseId: Uuid,
    id: Uuid.optional(),
    name: z.string().trim().min(1).max(200),
    type: ViewType,
    config: ViewConfig.default(ViewConfig.parse({})),
    ...placement,
  }),
  output: DatabaseView,
  ...write,
  destructive: false,
  idempotent: false,
  rest: { method: "POST", path: "/databases/{databaseId}/views" },
  mcp: { name: "create_database_view", title: "Create database view", expose: "fine" },
  cli: { command: ["db", "view", "add"], args: ["databaseId", "name", "type"] },
});

export const databaseRenameView = defineOperation({
  id: "database.renameView",
  summary: "Rename a database view",
  input: z.object({ id: Uuid, name: z.string().trim().min(1).max(200) }),
  output: DatabaseView,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-views/{id}/rename" },
  mcp: { name: "rename_database_view", title: "Rename database view", expose: "fine" },
  cli: { command: ["db", "view", "rename"], args: ["id", "name"] },
});

export const databaseDuplicateView = defineOperation({
  id: "database.duplicateView",
  summary: "Duplicate a database view",
  description: "Copies a view right after itself. The name defaults to “<name> copy”.",
  input: z.object({
    id: Uuid,
    newId: Uuid.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    sortKey: SortKey.optional(),
  }),
  output: DatabaseView,
  ...write,
  destructive: false,
  idempotent: false,
  rest: { method: "POST", path: "/database-views/{id}/duplicate" },
  mcp: { name: "duplicate_database_view", title: "Duplicate database view", expose: "fine" },
  cli: { command: ["db", "view", "dup"], args: ["id"] },
});

export const databaseMoveView = defineOperation({
  id: "database.moveView",
  summary: "Reorder a database view",
  description: "The first view opens by default (and is what a plain embed shows).",
  input: z.object({ id: Uuid, ...placement }),
  output: DatabaseView,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-views/{id}/move" },
  mcp: { name: "move_database_view", title: "Reorder database view", expose: "fine" },
  cli: { command: ["db", "view", "mv"], args: ["id"] },
});

export const databaseUpdateView = defineOperation({
  id: "database.updateView",
  summary: "Update a database view",
  description:
    "Changes the view's type and/or replaces the given top-level config fields (filter, sorts, " +
    "groupBy, subGroupBy, columns, limit, summaries, layout); fields not given stay.",
  input: z.object({
    id: Uuid,
    type: ViewType.optional(),
    config: ViewConfigPatch.default({}),
  }),
  output: DatabaseView,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "PATCH", path: "/database-views/{id}" },
  mcp: { name: "update_database_view", title: "Update database view", expose: "fine" },
  cli: { command: ["db", "view", "update"], args: ["id"] },
});

export const databaseDeleteView = defineOperation({
  id: "database.deleteView",
  summary: "Delete a database view",
  input: z.object({ id: Uuid }),
  output: DatabaseView,
  ...write,
  destructive: true,
  idempotent: true,
  rest: { method: "DELETE", path: "/database-views/{id}" },
  mcp: { name: "delete_database_view", title: "Delete database view", expose: "fine" },
  cli: { command: ["db", "view", "rm"], args: ["id"] },
});

export const databaseRestoreView = defineOperation({
  id: "database.restoreView",
  summary: "Restore a database view",
  input: z.object({ id: Uuid }),
  output: DatabaseView,
  ...write,
  destructive: false,
  idempotent: true,
  rest: { method: "POST", path: "/database-views/{id}/restore" },
  mcp: { name: "restore_database_view", title: "Restore database view", expose: "fine" },
  cli: { command: ["db", "view", "restore"], args: ["id"] },
});

// ---- Rows (rows are documents; these run doc.* operations and database.setValues)

// Values by property id. Each type's encoding is in the docs (`docs` of @lydie/contract,
// "Database values"); relation values are document ids, person values user ids.
export const RowValues = z.record(Uuid, PropertyValue);

export const databaseCreateRow = defineOperation({
  id: "database.createRow",
  summary: "Create a database row",
  description:
    "Creates a row (a document under the database). Values implied by the view's filter and by " +
    "the group (group/subGroup keys) are filled in, as in Notion; values override them. With " +
    "templateId, the template's properties and body are copied first. uniqueId properties get " +
    'the next number unless values gives one (12 or "LYD-12").',
  input: z.object({
    databaseId: Uuid,
    id: Uuid.optional(),
    title: Title.default("Untitled"),
    values: RowValues.default({}),
    viewId: Uuid.optional(),
    group: GroupKey.optional(),
    subGroup: GroupKey.optional(),
    templateId: Uuid.optional(),
    afterId: Uuid.optional(),
    beforeId: Uuid.optional(),
  }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/rows" },
  mcp: { name: "create_database_row", title: "Create database row", expose: "fine" },
  cli: { command: ["db", "row", "add"], args: ["databaseId", "title"] },
  ui: { commandPalette: { title: "New row", group: "Database" } },
});

const RowUpdate = z.object({
  rowId: Uuid,
  set: RowValues.default({}),
  unset: z.array(Uuid).default([]),
});

export const databaseSetValues = defineOperation({
  id: "database.setValues",
  summary: "Set row values",
  description:
    "Sets property values on one or many rows in one step: rowIds with set/unset applies the " +
    "same values to every row; updates gives each row its own. Values are checked against the " +
    "property type; unknown select options are added. Relation changes update the two-way side. " +
    'uniqueId values are positive whole numbers: pass 12 or "LYD-12".',
  input: z
    .object({
      databaseId: Uuid,
      rowIds: z.array(Uuid).max(10_000).optional(),
      set: RowValues.default({}),
      unset: z.array(Uuid).default([]),
      updates: z.array(RowUpdate).max(10_000).optional(),
      exact: z
        .boolean()
        .default(false)
        .describe(
          "Write the values as given: no type checks, no new options, no two-way relation " +
            "updates. Undo uses it to restore earlier values exactly.",
        ),
      newOptions: z
        .record(Uuid, z.array(SelectOption))
        .optional()
        .describe("Options this call adds (recorded by the client so replays mint the same ids)."),
    })
    .refine((v) => (v.rowIds === undefined) !== (v.updates === undefined), {
      message: "Pass exactly one of `rowIds` or `updates`",
    }),
  output: z.object({ updated: z.array(Uuid) }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.propertiesChanged", "database.changed"],
  rest: { method: "PATCH", path: "/databases/{databaseId}/rows" },
  mcp: { name: "set_database_values", title: "Set row values", expose: "fine" },
  cli: { command: ["db", "row", "set"], args: ["databaseId"] },
});

export const databaseMoveRow = defineOperation({
  id: "database.moveRow",
  summary: "Move a database row",
  description:
    "Places a row after/before another (the manual order every unsorted view shows) and, with " +
    "group/subGroup and a grouped viewId, moves it to that group by setting the grouped property.",
  input: z.object({
    rowId: Uuid,
    viewId: Uuid.optional(),
    afterId: Uuid.optional(),
    beforeId: Uuid.optional(),
    group: GroupKey.optional(),
    subGroup: GroupKey.optional(),
    fromGroup: GroupKey.optional().describe("The group it was in (list-valued groups)."),
    fromSubGroup: GroupKey.optional(),
  }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/database-rows/{rowId}/move" },
  mcp: { name: "move_database_row", title: "Move database row", expose: "fine" },
  cli: { command: ["db", "row", "mv"], args: ["rowId"] },
});

export const databaseDuplicateRows = defineOperation({
  id: "database.duplicateRows",
  summary: "Duplicate database rows",
  description: "Copies rows (title, values and body), each right after its original.",
  input: z.object({
    databaseId: Uuid,
    rowIds: z.array(Uuid).min(1).max(1000),
    ids: z.array(Uuid).optional().describe("Client-minted ids for the copies, in order."),
  }),
  output: z.object({ rows: z.array(Document) }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/rows/duplicate" },
  mcp: { name: "duplicate_database_rows", title: "Duplicate database rows", expose: "fine" },
  cli: { command: ["db", "row", "dup"], args: ["databaseId"] },
});

export const databaseDeleteRows = defineOperation({
  id: "database.deleteRows",
  summary: "Delete database rows",
  description: "Moves rows to the trash (as doc.delete). Relations to them hide until restored.",
  input: z.object({ databaseId: Uuid, rowIds: z.array(Uuid).min(1).max(10_000) }),
  output: z.object({ deletedIds: z.array(Uuid), deletedAt: Timestamp.nullable() }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/rows/delete" },
  mcp: { name: "delete_database_rows", title: "Delete database rows", expose: "fine" },
  cli: { command: ["db", "row", "rm"], args: ["databaseId"] },
});

export const databaseRestoreRows = defineOperation({
  id: "database.restoreRows",
  summary: "Restore database rows",
  input: z.object({ databaseId: Uuid, rowIds: z.array(Uuid).min(1).max(10_000) }),
  output: z.object({ restoredIds: z.array(Uuid) }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/rows/restore" },
  mcp: { name: "restore_database_rows", title: "Restore database rows", expose: "fine" },
  cli: { command: ["db", "row", "restore"], args: ["databaseId"] },
});

// ---- Agent-level tools: each runs the fine-grained operations above in one step (composite), so
// undo, history and events are theirs. Properties and views are named by id, key or name.

const PropertyRef = PropertyReference;
const ViewRef = z
  .string()
  .min(1)
  .meta({ id: "ViewRef", description: "A view's id or name (case-insensitive)." });
const RowRef = z
  .string()
  .min(1)
  .max(64)
  .meta({ id: "RowRef", description: 'A row\'s id or unique id ("LYD-12").' });

export const WrittenRow = z.object({
  id: Uuid,
  title: z.string(),
  uniqueId: z.string().nullable().describe('e.g. "LYD-12"; null without a uniqueId property.'),
  action: z.enum(["created", "updated", "deleted"]),
});
export type WrittenRow = z.infer<typeof WrittenRow>;

export const DatabaseOutline = z
  .object({
    id: Uuid,
    properties: z.array(
      z.object({ id: Uuid, name: z.string(), type: PropertyType, key: z.string() }),
    ),
    views: z.array(z.object({ id: Uuid, name: z.string(), type: ViewType })),
  })
  .meta({ id: "DatabaseOutline", description: "A database's properties and views, in order." });
export type DatabaseOutline = z.infer<typeof DatabaseOutline>;

export const databaseWriteRows = defineOperation({
  id: "database.writeRows",
  summary: "Write database rows",
  description:
    "Creates, updates and deletes rows in one step. A row without id is created; with id it is " +
    "updated (title renames it); delete: true moves it to the trash. values are keyed by property " +
    "id, frontmatter key or name; relation values are row ids; select values are option names " +
    '(new names become options); uniqueId values are numbers (pass 12 or "LYD-12"; new rows ' +
    "get the next number). unset clears properties. markdown sets the row's page content.",
  input: z.object({
    databaseId: Uuid,
    rows: z
      .array(
        z.object({
          id: RowRef.optional().describe("An existing row to update or delete."),
          title: Title.optional(),
          values: z.record(z.string(), PropertyValue).default({}),
          unset: z.array(PropertyRef).default([]),
          markdown: z.string().optional().describe("The row's body; replaces the current one."),
          delete: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(1000),
  }),
  output: z.object({ rows: z.array(WrittenRow).describe("One per input row, in order.") }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: false,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/rows/write" },
  mcp: { name: "write_database_rows", title: "Write database rows", outputSchema: true },
  cli: { command: ["db", "rows", "write"], args: ["databaseId"] },
});

export const databaseChangeSchema = defineOperation({
  id: "database.changeSchema",
  summary: "Change a database's properties",
  description:
    "Adds, changes and removes properties in one step. update can rename (name), change the type " +
    "(values are converted), the frontmatter key or the config (options, relation, number " +
    "format, formula expression). Removed properties keep their values in the rows.",
  input: z.object({
    databaseId: Uuid,
    add: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          type: PropertyType,
          key: PropertyKeyName.optional(),
          config: PropertyConfigInput.optional(),
        }),
      )
      .default([]),
    update: z
      .array(
        z.object({
          property: PropertyRef,
          name: z.string().trim().min(1).max(200).optional(),
          type: PropertyType.optional(),
          key: PropertyKeyName.optional(),
          config: PropertyConfigInput.optional(),
        }),
      )
      .default([]),
    remove: z.array(PropertyRef).default([]),
  }),
  output: DatabaseOutline,
  scopes: ["docs:write"],
  destructive: true,
  idempotent: false,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/schema" },
  mcp: { name: "change_database_schema", title: "Change database properties" },
  cli: { command: ["db", "schema"], args: ["databaseId"] },
});

export const databaseChangeViews = defineOperation({
  id: "database.changeViews",
  summary: "Change a database's views",
  description:
    "Adds, changes and removes views in one step. config is merged into the view's config " +
    "(filter, sorts, groupBy, columns, …; properties by id, key or name); see get_database for " +
    "the current values.",
  input: z.object({
    databaseId: Uuid,
    add: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          type: ViewType,
          config: ViewConfigPatch.optional(),
        }),
      )
      .default([]),
    update: z
      .array(
        z.object({
          view: ViewRef,
          name: z.string().trim().min(1).max(200).optional(),
          type: ViewType.optional(),
          config: ViewConfigPatch.optional(),
        }),
      )
      .default([]),
    remove: z.array(ViewRef).default([]),
  }),
  output: DatabaseOutline,
  scopes: ["docs:write"],
  destructive: true,
  idempotent: false,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/databases/{databaseId}/views/change" },
  mcp: { name: "change_database_views", title: "Change database views" },
  cli: { command: ["db", "views"], args: ["databaseId"] },
});
