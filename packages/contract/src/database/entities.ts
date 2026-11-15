import { z } from "zod";

import { ActorRef, SortKey, Timestamp, Uuid, WorkspaceId } from "../entities.ts";

// Notion-style databases. A database is a document whose children are its rows; every row is an
// ordinary document whose `properties` hold the row's values (its frontmatter in a folder). The
// schema (properties) and the views live in three synced tables: `databases` (one row per database
// document, id = document id), `database_properties` and `database_views`. In a folder they are
// the database's `.base` file (see `base.ts`).

export const PROPERTY_TYPES = [
  "title",
  "text",
  "number",
  "select",
  "multiSelect",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "files",
  "relation",
  "rollup",
  "formula",
  "uniqueId",
  "createdTime",
  "updatedTime",
  "createdBy",
  "updatedBy",
] as const;

export const PropertyType = z.enum(PROPERTY_TYPES).meta({ id: "PropertyType" });
export type PropertyType = z.infer<typeof PropertyType>;

// Types whose value is stored in the row's properties under the property's `key`. The others are
// computed: the title and the created/updated columns come from the document, rollups and formulas
// are evaluated.
export const STORED_TYPES: readonly PropertyType[] = [
  "text",
  "number",
  "select",
  "multiSelect",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "files",
  "relation",
  "uniqueId",
];

export function isStoredType(type: PropertyType): boolean {
  return STORED_TYPES.includes(type);
}

// Types whose stored value is a list of strings.
export const LIST_TYPES: readonly PropertyType[] = ["multiSelect", "person", "files", "relation"];

export const COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;
export const Color = z.enum(COLORS).meta({ id: "Color" });
export type Color = z.infer<typeof Color>;

export const StatusGroup = z.enum(["todo", "inProgress", "complete"]).meta({ id: "StatusGroup" });
export type StatusGroup = z.infer<typeof StatusGroup>;

// Rows store the option's name (readable in frontmatter); the id keeps an option's identity in the
// schema across renames, which rewrite the rows that use it.
export const SelectOption = z
  .object({
    id: Uuid,
    name: z.string().trim().min(1).max(200),
    color: Color.default("default"),
    // Status options only.
    group: StatusGroup.optional(),
  })
  .meta({ id: "SelectOption" });
export type SelectOption = z.infer<typeof SelectOption>;

export const NUMBER_FORMATS = ["number", "integer", "commas", "percent", "currency"] as const;
export const NumberFormat = z.enum(NUMBER_FORMATS);

export const ROLLUP_FUNCTIONS = [
  "showOriginal",
  "showUnique",
  "count",
  "countValues",
  "countUnique",
  "countEmpty",
  "countNotEmpty",
  "percentEmpty",
  "percentNotEmpty",
  "sum",
  "average",
  "median",
  "min",
  "max",
  "range",
  "earliest",
  "latest",
  "checked",
  "unchecked",
  "percentChecked",
  "percentUnchecked",
] as const;
export const RollupFunction = z.enum(ROLLUP_FUNCTIONS).meta({ id: "RollupFunction" });
export type RollupFunction = z.infer<typeof RollupFunction>;

export const RelationConfig = z
  .object({
    databaseId: Uuid.describe("The database whose rows this relation points at."),
    twoWay: z.boolean().default(false),
    reversePropertyId: Uuid.nullable()
      .default(null)
      .describe("The synced property on the other database (two-way relations)."),
    limit: z.enum(["one", "many"]).default("many"),
  })
  .meta({ id: "RelationConfig" });
export type RelationConfig = z.infer<typeof RelationConfig>;

export const RollupConfig = z
  .object({
    relationPropertyId: Uuid,
    targetPropertyId: Uuid.describe("A property of the related database."),
    function: RollupFunction,
  })
  .meta({ id: "RollupConfig" });
export type RollupConfig = z.infer<typeof RollupConfig>;

// "" means no prefix (the runtime drops it).
export const UniqueIdPrefix = z
  .string()
  .trim()
  .max(16)
  .regex(/^(?:[A-Za-z][A-Za-z0-9]*)?$/, "Letters and digits, starting with a letter");

// One object for every type; the runtime checks which fields a type uses.
export const PropertyConfig = z
  .object({
    options: z.array(SelectOption).optional().describe("select, multiSelect, status"),
    numberFormat: NumberFormat.optional(),
    decimals: z.number().int().min(0).max(10).optional(),
    currency: z.string().length(3).optional().describe("ISO 4217 code, with numberFormat currency"),
    includeTime: z.boolean().optional().describe("date: values carry a time"),
    range: z.boolean().optional().describe("date: values may carry an end (start/end)"),
    relation: RelationConfig.optional(),
    rollup: RollupConfig.optional(),
    expression: z.string().optional().describe("formula: an Obsidian Bases expression"),
    prefix: UniqueIdPrefix.optional().describe(
      'uniqueId: shown before the number ("LYD" → LYD-12)',
    ),
    // Keys of the property's entry in a .base file that Lydie does not use, kept for round trips.
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: "PropertyConfig" });
export type PropertyConfig = z.infer<typeof PropertyConfig>;

// What operations accept: option ids may be left out (the handler mints and records them).
export const PropertyConfigInput = PropertyConfig.extend({
  options: z
    .array(SelectOption.extend({ id: Uuid.optional() }))
    .optional()
    .describe("select, multiSelect, status"),
}).meta({ id: "PropertyConfigSpec" });
export type PropertyConfigInput = z.input<typeof PropertyConfigInput>;

// Frontmatter keys may not be empty or start with "file." / "formula." (Bases namespaces).
export const PropertyKeyName = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((k) => !/^(file|formula|note|this)\./.test(k), "Reserved prefix");

export const DatabaseProperty = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    databaseId: Uuid,
    name: z.string().trim().min(1).max(200).describe("Display name (Bases displayName)."),
    type: PropertyType,
    key: PropertyKeyName.describe(
      "Stored types: the frontmatter key holding the value. Formulas, rollups, createdBy and " +
        "updatedBy: the formula name in the .base file. Unused for title and created/updated time.",
    ),
    config: PropertyConfig,
    sortKey: SortKey,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    deletedAt: Timestamp.nullable(),
    createdBy: ActorRef.nullable().optional(),
    updatedBy: ActorRef.nullable().optional(),
  })
  .meta({ id: "DatabaseProperty" });
export type DatabaseProperty = z.infer<typeof DatabaseProperty>;

// ---- Filters

export const FILTER_OPS = [
  "eq",
  "neq",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "in",
  "notIn",
  "isEmpty",
  "isNotEmpty",
] as const;
export const FilterOp = z.enum(FILTER_OPS).meta({ id: "FilterOp" });
export type FilterOp = z.infer<typeof FilterOp>;

// `today` and `now` plus an offset, e.g. { relative: "today", amount: -7, unit: "day" }. Written to
// .base files as `today() - "7d"`.
export const RelativeDate = z
  .strictObject({
    relative: z.enum(["today", "now"]),
    amount: z.number().int().optional(),
    unit: z.enum(["minute", "hour", "day", "week", "month", "year"]).optional(),
  })
  .meta({ id: "RelativeDate" });
export type RelativeDate = z.infer<typeof RelativeDate>;

// The signed-in user (person and createdBy/updatedBy filters).
export const MeValue = z.strictObject({ me: z.literal(true) }).meta({ id: "MeValue" });

export const FilterScalar = z.union([z.string(), z.number(), z.boolean(), RelativeDate, MeValue]);
export type FilterScalar = z.infer<typeof FilterScalar>;
export const FilterValue = z.union([FilterScalar, z.array(FilterScalar), z.null()]);
export type FilterValue = z.infer<typeof FilterValue>;

// Where a filter, sort, group or column names a property. Stored configs hold ids; inputs also take
// the property's frontmatter key or name, which the runtime resolves to the id before storing.
export const PropertyReference = z.string().min(1).max(200).meta({
  id: "PropertyRef",
  description: "A property's id, frontmatter key or name (case-insensitive).",
});

export type FilterCondition = {
  type: "condition";
  propertyId: string;
  op: FilterOp;
  value?: FilterValue | undefined;
};
// A Bases expression Lydie does not model as a condition (kept verbatim, evaluated as an
// expression).
export type FilterExpression = { type: "expression"; expression: string };
export type FilterGroup = {
  type: "group";
  // "not": none of the children (Obsidian's `not`).
  combinator: "and" | "or" | "not";
  children: FilterNode[];
};
export type FilterNode = FilterCondition | FilterExpression | FilterGroup;

// Filters appear in inputs and outputs, so their schemas are strict and have no defaults: the
// input and output JSON Schemas are then identical and can be shared (named) in OpenAPI/MCP.
export const FilterConditionSchema = z
  .strictObject({
    type: z.literal("condition"),
    propertyId: PropertyReference,
    op: FilterOp,
    value: FilterValue.optional(),
  })
  .meta({ id: "FilterCondition" });
export const FilterExpressionSchema = z
  .strictObject({
    type: z.literal("expression"),
    expression: z.string().min(1),
  })
  .meta({ id: "FilterExpression" });

// Groups nest at most two levels below the root group, as in Notion; a fixed depth keeps the JSON
// Schema free of cycles for MCP and OpenAPI.
function filterLevel(depth: number): z.ZodType<FilterNode> {
  const leaf = z.discriminatedUnion("type", [FilterConditionSchema, FilterExpressionSchema]);
  if (depth === 0) return leaf as z.ZodType<FilterNode>;
  return z.discriminatedUnion("type", [
    FilterConditionSchema,
    FilterExpressionSchema,
    z.strictObject({
      type: z.literal("group"),
      combinator: z.enum(["and", "or", "not"]),
      children: z.array(filterLevel(depth - 1)),
    }),
  ]) as z.ZodType<FilterNode>;
}
export const FilterNode: z.ZodType<FilterNode> = filterLevel(3).meta({ id: "FilterNode" });

// ---- Views

export const VIEW_TYPES = ["table", "board", "list", "calendar", "gallery"] as const;
export const ViewType = z.enum(VIEW_TYPES).meta({ id: "ViewType" });
export type ViewType = z.infer<typeof ViewType>;

export const Sort = z.object({
  propertyId: PropertyReference,
  direction: z.enum(["asc", "desc"]).default("asc"),
});
export type Sort = z.infer<typeof Sort>;

export const DateBucket = z.enum(["day", "week", "month", "year"]);
export type DateBucket = z.infer<typeof DateBucket>;

// A group key is the value as a string (option name, date bucket, "true"/"false", the number as
// written), or null for "no value".
export const GroupKey = z.string().nullable();
export type GroupKey = z.infer<typeof GroupKey>;

export const GroupBy = z
  .object({
    propertyId: PropertyReference,
    direction: z.enum(["asc", "desc"]).default("asc"),
    // Bases `groupOrder`: when set, only these groups are shown, in this order (null = no value).
    order: z.array(GroupKey).optional(),
    hideEmpty: z.boolean().optional().describe("Hide groups with no rows (board columns)."),
    dateBucket: DateBucket.optional().describe("Date grouping; default month."),
    collapsed: z.array(GroupKey).optional(),
  })
  .meta({ id: "GroupBy" });
export type GroupBy = z.infer<typeof GroupBy>;

export const ViewColumn = z
  .object({
    propertyId: PropertyReference,
    visible: z.boolean().default(true),
    width: z.number().int().min(20).max(2000).optional(),
  })
  .meta({ id: "ViewColumn" });
export type ViewColumn = z.infer<typeof ViewColumn>;

export const SUMMARY_FUNCTIONS = [
  "Average",
  "Min",
  "Max",
  "Sum",
  "Range",
  "Median",
  "Stddev",
  "Earliest",
  "Latest",
  "Checked",
  "Unchecked",
  "Empty",
  "Filled",
  "Unique",
] as const;

export const ViewLayout = z
  .object({
    rowHeight: z.enum(["short", "medium", "tall", "extra"]).optional().describe("table"),
    wrapCells: z.boolean().optional().describe("table"),
    cardSize: z.number().int().min(50).max(1000).optional().describe("board, gallery: px"),
    cover: z
      .union([
        z.object({ type: z.literal("property"), propertyId: PropertyReference }),
        z.object({ type: z.literal("pageContent") }),
      ])
      .nullable()
      .optional()
      .describe("board, gallery: the card image"),
    coverFit: z.enum(["cover", "contain"]).optional(),
    coverAspectRatio: z.number().min(0.1).max(10).optional(),
    markers: z.enum(["bullet", "number", "none"]).optional().describe("list"),
    calendarPropertyId: PropertyReference.optional().describe(
      "calendar: the date property placing rows",
    ),
    calendarMode: z.enum(["month", "week"]).optional(),
    showWeekends: z.boolean().optional(),
    colorColumns: z.boolean().optional().describe("board"),
  })
  .meta({ id: "ViewLayout" });
export type ViewLayout = z.infer<typeof ViewLayout>;

export const ViewConfig = z
  .object({
    filter: FilterNode.nullable().default(null),
    sorts: z.array(Sort).default([]),
    groupBy: GroupBy.nullable().default(null),
    subGroupBy: GroupBy.nullable().default(null).describe("Board swimlanes."),
    // Column order and visibility. Properties missing here are shown after the listed ones.
    columns: z.array(ViewColumn).default([]),
    limit: z.number().int().min(1).nullable().default(null),
    summaries: z
      .record(PropertyReference, z.string())
      .default({})
      .describe("propertyId → summary name"),
    layout: ViewLayout.default({}),
    // Keys of the view in a .base file that Lydie does not use, kept for round trips.
    extra: z.record(z.string(), z.unknown()).default({}),
  })
  .meta({ id: "ViewConfig" });
export type ViewConfig = z.infer<typeof ViewConfig>;
export type ViewConfigInput = z.input<typeof ViewConfig>;

// Some of a view's settings, merged into its config (updates, ad-hoc queries). Not
// `ViewConfig.partial()`: in Zod 4 that keeps the defaults, so every field left out would be reset
// (LYD-249). Keep the keys in step with ViewConfig (a test checks).
export const ViewConfigPatch = z
  .object({
    filter: FilterNode.nullable().optional(),
    sorts: z.array(Sort).optional(),
    groupBy: GroupBy.nullable().optional(),
    subGroupBy: GroupBy.nullable().optional().describe("Board swimlanes."),
    columns: z.array(ViewColumn).optional(),
    limit: z.number().int().min(1).nullable().optional(),
    summaries: z
      .record(PropertyReference, z.string())
      .optional()
      .describe("propertyId → summary name"),
    layout: ViewLayout.optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: "ViewConfigPatch" });
export type ViewConfigPatch = z.infer<typeof ViewConfigPatch>;

export const DatabaseView = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    databaseId: Uuid,
    name: z.string().trim().min(1).max(200),
    type: ViewType,
    config: ViewConfig,
    sortKey: SortKey,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    deletedAt: Timestamp.nullable(),
    createdBy: ActorRef.nullable().optional(),
    updatedBy: ActorRef.nullable().optional(),
  })
  .meta({ id: "DatabaseView" });
export type DatabaseView = z.infer<typeof DatabaseView>;

export const DatabaseConfig = z
  .object({
    // Filter applied to every view (Bases top-level `filters`, minus the folder membership).
    filter: FilterNode.nullable().default(null),
    // Documents new rows can be created from (their properties and body are copied).
    templateIds: z.array(Uuid).default([]),
    // Top-level .base keys Lydie does not use (and `properties:` entries for unknown refs).
    extra: z.record(z.string(), z.unknown()).default({}),
  })
  .meta({ id: "DatabaseConfig" });
export type DatabaseConfig = z.infer<typeof DatabaseConfig>;

// id = the database document's id. Deleting it (database.delete) turns the database back into a
// page; the rows stay as its child pages and the definitions stay for database.restore.
export const Database = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    config: DatabaseConfig,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    deletedAt: Timestamp.nullable(),
    createdBy: ActorRef.nullable().optional(),
    updatedBy: ActorRef.nullable().optional(),
  })
  .meta({ id: "Database" });
export type Database = z.infer<typeof Database>;

export const DatabaseDefinition = z
  .object({
    database: Database,
    // Live properties and views, in order.
    properties: z.array(DatabaseProperty),
    views: z.array(DatabaseView),
  })
  .meta({ id: "DatabaseDefinition" });
export type DatabaseDefinition = z.infer<typeof DatabaseDefinition>;

// What `database.setDefinition` takes (what `fromBase` returns): the schema and views without
// timestamps. Items with an id that exists are updated, others are created, and live ones missing
// here are deleted.
export const PropertyInput = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(200),
  type: PropertyType,
  key: PropertyKeyName,
  config: PropertyConfig.default({}),
});
export type PropertyInput = z.infer<typeof PropertyInput>;

export const ViewInput = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(200),
  type: ViewType,
  config: ViewConfig,
});
export type ViewInput = z.infer<typeof ViewInput>;

export const DefinitionInput = z.object({
  config: DatabaseConfig,
  properties: z.array(PropertyInput),
  views: z.array(ViewInput),
});
export type DefinitionInput = z.infer<typeof DefinitionInput>;

// ---- Query results

// A cell of a computed column for one row: relation targets with titles, rollup and formula
// results. Stored values are read from `row.properties[property.key]`.
export const RelatedRow = z.object({ id: Uuid, title: z.string() }).meta({ id: "RelatedRow" });
export type RelatedRow = z.infer<typeof RelatedRow>;

export const ViewRow = z
  .object({
    id: Uuid,
    title: z.string(),
    sortKey: SortKey,
    properties: z.record(z.string(), z.unknown()),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    createdBy: ActorRef.nullable(),
    updatedBy: ActorRef.nullable(),
    group: GroupKey.describe("The row's group (null: no value or not grouped)."),
    subGroup: GroupKey,
    // propertyId → value, for relation (RelatedRow[]), rollup and formula properties in the view.
    computed: z.record(z.string(), z.unknown()),
  })
  .meta({ id: "ViewRow" });
export type ViewRow = z.infer<typeof ViewRow>;

export const ViewGroup = z
  .object({
    key: GroupKey,
    subKey: GroupKey.describe("Set for sub-groups (board swimlanes); null otherwise."),
    count: z.number().int().min(0),
    // Position of the group's first row in the full ordered result.
    start: z.number().int().min(0),
  })
  .meta({ id: "ViewGroup" });
export type ViewGroup = z.infer<typeof ViewGroup>;

export const ViewResult = z
  .object({
    total: z.number().int().min(0),
    offset: z.number().int().min(0),
    rows: z.array(ViewRow),
    groups: z.array(ViewGroup),
    hasMore: z
      .boolean()
      .optional()
      .describe("Rows remain after this window (database.query sets it)."),
  })
  .meta({ id: "ViewResult" });
export type ViewResult = z.infer<typeof ViewResult>;

// Which rows of the ordered result to return. With `group` (and `subGroup`), only that group's
// rows count for offset/limit (one board column). With `range`, only rows whose date (or date
// range) overlaps [start, end) (calendar). Counts always cover the whole filtered result.
export const ViewWindow = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(0).max(1000).default(100),
  group: GroupKey.optional(),
  subGroup: GroupKey.optional(),
  range: z
    .object({
      propertyId: PropertyReference.optional().describe("Default: the view's calendar property."),
      start: z.string().describe("Inclusive, YYYY-MM-DD"),
      end: z.string().describe("Exclusive, YYYY-MM-DD"),
    })
    .optional(),
});
export type ViewWindow = z.infer<typeof ViewWindow>;
export type ViewWindowInput = z.input<typeof ViewWindow>;
