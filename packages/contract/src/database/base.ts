// A database's schema and views ⇄ an Obsidian Bases file (help.obsidian.md/bases/syntax).
//
// Native Bases keys carry everything Obsidian understands: membership (`filters` with
// `file.inFolder`), formulas, display names, and per view: type, name, filters, order, sort,
// groupBy, groupOrder, limit, columnSize, summaries, rowHeight, card image settings, list markers.
// What Bases cannot express lives under `lydie:` keys (top level and per view): stable ids,
// property types and options, relations, rollups, sub-grouping, hidden columns, calendar settings.
// Keys Lydie does not know are kept (`config.extra`) and written back.
//
// Precedence when reading: native keys win. Lydie-only details are used where they still agree
// with the native data (a filter written by Lydie is read back from `lydie.filter` only if the
// native statements are unchanged), so edits made in Obsidian are never lost.
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { uuidsForUlids } from "../ids.ts";
import type {
  DatabaseConfig,
  DefinitionInput,
  FilterNode,
  GroupBy,
  PropertyConfig,
  PropertyInput,
  PropertyType,
  Sort,
  ViewColumn,
  ViewConfig,
  ViewInput,
  ViewLayout,
  ViewType,
} from "./entities.ts";
import {
  DatabaseConfig as DatabaseConfigSchema,
  PROPERTY_TYPES,
  ViewConfig as ViewConfigSchema,
} from "./entities.ts";
import { parseRefString, printExpression, refString } from "./expression.ts";
import { fromBaseFilter, propertyRefString, toBaseFilterRoot } from "./filters.ts";
import type { FilterMapping, RefProperty } from "./filters.ts";
import { rollupFormula } from "./rollup-formula.ts";

export const BASE_FORMAT_VERSION = 1;

export type BaseDefinition = {
  // The database document's id.
  id: string;
  config: DatabaseConfig;
  properties: readonly PropertyInput[];
  views: readonly ViewInput[];
};

export type ToBaseOptions = {
  // Vault-relative folder holding the rows (e.g. "Projects/Tasks"); written as the membership
  // filter `file.inFolder("…")`. Omit in hosted mode.
  folder?: string | null;
  linkFor?: (id: string) => string | null;
  // Properties of other databases (rollup targets), for the rollup's Obsidian formula.
  resolveProperty?: (id: string) => { type: PropertyType; key: string } | null;
};

export type FromBaseOptions = {
  // Mints ids for properties and views that have none yet.
  newId: () => string;
  // The current definition, so ids survive when the file has no (or a partial) `lydie:` block:
  // properties match by reference, views by name.
  existing?: { properties: readonly PropertyInput[]; views: readonly ViewInput[] };
  // Obsidian property types (from .obsidian/types.json) for note properties Lydie has no type for:
  // text, multitext, number, checkbox, date, datetime, aliases, tags.
  types?: Readonly<Record<string, string>>;
  idFor?: (link: string) => string | null;
};

export type FromBaseResult = {
  // The `lydie.id` in the file, if any.
  id: string | null;
  // The membership folder from `file.inFolder("…")`, if any.
  folder: string | null;
  definition: DefinitionInput;
  warnings: string[];
};

const NATIVE_TYPE: Record<ViewType, string> = {
  table: "table",
  board: "kanban",
  list: "list",
  gallery: "cards",
  // Bases has no calendar: written as a table, so Obsidian still shows the rows.
  calendar: "table",
};
const FROM_NATIVE: Record<string, ViewType> = {
  table: "table",
  kanban: "board",
  list: "list",
  cards: "gallery",
};

const VIEW_KEYS = new Set([
  "type",
  "name",
  "filters",
  "order",
  "sort",
  "groupBy",
  "groupOrder",
  "limit",
  "columnSize",
  "summaries",
  "rowHeight",
  "image",
  "imageFit",
  "imageAspectRatio",
  "cardSize",
  "markers",
  "lydie",
]);
const TOP_KEYS = new Set(["filters", "formulas", "properties", "views", "lydie"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function refProperties(properties: readonly PropertyInput[]): RefProperty[] {
  return properties.map((p) => ({ id: p.id, type: p.type, key: p.key }));
}

// ---- Writing

export function toBaseObject(def: BaseDefinition, options: ToBaseOptions = {}): Obj {
  const mapping: FilterMapping = {
    properties: refProperties(def.properties),
    ...(options.linkFor ? { linkFor: options.linkFor } : {}),
  };
  const refOf = (id: string) => {
    const p = def.properties.find((x) => x.id === id);
    return p ? propertyRefString(p) : null;
  };
  const extra = clone(def.config.extra);
  const out: Obj = {};

  // Membership and the database filter.
  const conjuncts: unknown[] = [];
  if (options.folder) conjuncts.push(`file.inFolder(${JSON.stringify(options.folder)})`);
  const dbFilter = def.config.filter ? toBaseFilterRoot(def.config.filter, mapping) : null;
  if (dbFilter && typeof dbFilter === "object" && dbFilter.and) conjuncts.push(...dbFilter.and);
  else if (dbFilter) conjuncts.push(dbFilter);
  if (conjuncts.length > 0) out.filters = { and: conjuncts };

  const formulas: Obj = {};
  for (const p of def.properties) {
    if (p.type === "formula") formulas[p.key] = p.config.expression ?? "";
    else if (p.type === "rollup") {
      formulas[p.key] = rollupFormula(p, def.properties, options.resolveProperty);
    } else if (p.type === "createdBy" || p.type === "updatedBy") formulas[p.key] = "null";
  }
  if (Object.keys(formulas).length > 0) out.formulas = formulas;

  const properties: Obj = isObj(extra.properties) ? { ...extra.properties } : {};
  delete extra.properties;
  for (const p of def.properties) {
    properties[propertyRefString(p)] = { ...clone(p.config.extra ?? {}), displayName: p.name };
  }
  if (Object.keys(properties).length > 0) out.properties = properties;

  for (const [key, value] of Object.entries(extra)) {
    if (!TOP_KEYS.has(key)) out[key] = clone(value);
  }

  out.views = def.views.map((v) => viewToBase(v, def, mapping, refOf));

  const lydie: Obj = { version: BASE_FORMAT_VERSION, id: def.id };
  if (def.config.templateIds.length > 0) lydie.templates = [...def.config.templateIds];
  if (def.config.filter) lydie.filter = clone(def.config.filter);
  lydie.properties = def.properties.map((p) => {
    const { extra: _extra, expression: _expression, ...config } = p.config;
    return { id: p.id, ref: propertyRefString(p), type: p.type, ...clone(config) };
  });
  out.lydie = lydie;
  return out;
}

function viewToBase(
  v: ViewInput,
  def: BaseDefinition,
  mapping: FilterMapping,
  refOf: (id: string) => string | null,
): Obj {
  const c = v.config;
  const out: Obj = { type: NATIVE_TYPE[v.type], name: v.name };
  const lydie: Obj = { id: v.id };
  if (v.type === "calendar") lydie.type = "calendar";
  if (c.filter) {
    const filters = toBaseFilterRoot(c.filter, mapping);
    if (filters) out.filters = filters;
    lydie.filter = clone(c.filter);
  }
  const columns = effectiveColumns(c.columns, def.properties);
  out.order = columns.filter((col) => col.visible).flatMap((col) => refOf(col.propertyId) ?? []);
  // `[]` (every property, new ones included) and hidden columns need the lydie block.
  if (c.columns.length === 0 || columns.some((col) => !col.visible))
    lydie.columns = clone(c.columns);
  if (c.sorts.length > 0) {
    out.sort = c.sorts.flatMap((s) => {
      const property = refOf(s.propertyId);
      return property ? [{ property, direction: s.direction === "desc" ? "DESC" : "ASC" }] : [];
    });
  }
  if (c.groupBy) {
    const property = refOf(c.groupBy.propertyId);
    if (property) {
      out.groupBy = { property, direction: c.groupBy.direction === "desc" ? "DESC" : "ASC" };
      if (c.groupBy.order) out.groupOrder = [...c.groupBy.order];
      const { propertyId: _p, direction: _d, order: _o, ...rest } = c.groupBy;
      if (Object.keys(rest).length > 0) lydie.groupBy = clone(rest);
    }
  }
  if (c.subGroupBy) lydie.subGroupBy = clone(c.subGroupBy);
  if (c.limit !== null) out.limit = c.limit;
  const sizes: Obj = {};
  for (const col of columns) {
    const ref = refOf(col.propertyId);
    if (ref && col.width !== undefined) sizes[ref] = col.width;
  }
  if (Object.keys(sizes).length > 0) out.columnSize = sizes;
  const summaries: Obj = {};
  for (const [id, name] of Object.entries(c.summaries)) {
    const ref = refOf(id);
    if (ref) summaries[ref] = name;
  }
  if (Object.keys(summaries).length > 0) out.summaries = summaries;

  const { rowHeight, cover, coverFit, coverAspectRatio, cardSize, markers, ...lydieLayout } =
    c.layout;
  if (rowHeight && rowHeight !== "short") out.rowHeight = rowHeight;
  if (cover?.type === "property") {
    const ref = refOf(cover.propertyId);
    if (ref) out.image = ref;
  } else if (cover) lydie.cover = clone(cover);
  if (coverFit) out.imageFit = coverFit;
  if (coverAspectRatio !== undefined) out.imageAspectRatio = coverAspectRatio;
  if (cardSize !== undefined) out.cardSize = cardSize;
  if (markers) out.markers = markers;
  if (Object.keys(lydieLayout).length > 0) lydie.layout = clone(lydieLayout);

  for (const [key, value] of Object.entries(c.extra)) {
    if (key === "lydie") continue;
    // An unknown native type (e.g. "map") was kept in extra and wins over our fallback.
    if (key === "type" || !VIEW_KEYS.has(key)) out[key] = clone(value);
  }
  out.lydie = lydie;
  return out;
}

// Columns in order: the listed ones, then every other property (visible), so a view with no
// column settings shows the whole schema.
export function effectiveColumns(
  columns: readonly ViewColumn[],
  properties: readonly { id: string }[],
): ViewColumn[] {
  const known = new Set(properties.map((p) => p.id));
  const listed = columns.filter((c) => known.has(c.propertyId));
  const seen = new Set(listed.map((c) => c.propertyId));
  return [
    ...listed.map((c) => ({ ...c })),
    ...properties.filter((p) => !seen.has(p.id)).map((p) => ({ propertyId: p.id, visible: true })),
  ];
}

export function toBase(def: BaseDefinition, options: ToBaseOptions = {}): string {
  return stringifyYaml(toBaseObject(def, options), { lineWidth: 0, aliasDuplicateObjects: false });
}

// ---- Reading

const OBSIDIAN_TYPES: Record<string, PropertyType> = {
  text: "text",
  multitext: "multiSelect",
  tags: "multiSelect",
  aliases: "multiSelect",
  number: "number",
  checkbox: "checkbox",
  date: "date",
  datetime: "date",
};

export function fromBase(text: string, options: FromBaseOptions): FromBaseResult {
  let parsed: unknown;
  const warnings: string[] = [];
  try {
    // A file written before ids were UUIDs names them as ULIDs: read as the same ids.
    parsed = parseYaml(uuidsForUlids(text)) ?? {};
  } catch (error) {
    warnings.push(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    parsed = {};
  }
  const result = fromBaseObject(isObj(parsed) ? parsed : {}, options);
  return { ...result, warnings: [...warnings, ...result.warnings] };
}

export function fromBaseObject(base: Obj, options: FromBaseOptions): FromBaseResult {
  const warnings: string[] = [];
  const lydie = isObj(base.lydie) ? base.lydie : {};
  const existing = options.existing;
  const formulas = isObj(base.formulas) ? base.formulas : {};
  const nativeProps = isObj(base.properties) ? base.properties : {};

  // Properties: Lydie's list first (ids, types, options), then every reference the file uses.
  const properties: PropertyInput[] = [];
  const byRef = new Map<string, PropertyInput>();
  const add = (p: PropertyInput) => {
    const ref = propertyRefString(p);
    if (byRef.has(ref)) return;
    byRef.set(ref, p);
    properties.push(p);
  };
  const idForRef = (ref: string) =>
    existing?.properties.find((p) => propertyRefString(p) === ref)?.id ?? options.newId();

  for (const raw of Array.isArray(lydie.properties) ? lydie.properties : []) {
    if (!isObj(raw) || typeof raw.ref !== "string" || typeof raw.type !== "string") continue;
    if (!(PROPERTY_TYPES as readonly string[]).includes(raw.type)) continue;
    const type = raw.type as PropertyType;
    const ref = parseRefString(raw.ref);
    // A formula, rollup or by-property must still have its formula; a stored one is always valid.
    if (ref.ns === "formula" && !(ref.name in formulas)) continue;
    const { id, ref: _ref, type: _type, ...config } = raw;
    add({
      id: typeof id === "string" ? id : idForRef(raw.ref),
      name: ref.ns === "file" ? (FILE_NAMES[ref.name] ?? ref.name) : ref.name,
      type,
      key: ref.ns === "file" ? keyForFileRef(ref.name) : ref.name,
      config: clone(config) as PropertyConfig,
    });
  }

  const ensure = (refText: string): PropertyInput | null => {
    const ref = parseRefString(refText);
    const canonical = refString(ref);
    const found = byRef.get(canonical);
    if (found) return found;
    if (ref.ns === "file") {
      const type = ({ name: "title", ctime: "createdTime", mtime: "updatedTime" } as const)[
        ref.name as "name" | "ctime" | "mtime"
      ];
      if (!type) return null;
      const p: PropertyInput = {
        id: idForRef(canonical),
        name: FILE_NAMES[ref.name] ?? ref.name,
        type,
        key: keyForFileRef(ref.name),
        config: {},
      };
      add(p);
      return p;
    }
    if (ref.ns === "formula") {
      if (!(ref.name in formulas)) return null;
      const p: PropertyInput = {
        id: idForRef(canonical),
        name: ref.name,
        type: "formula",
        key: ref.name,
        config: {},
      };
      add(p);
      return p;
    }
    const prior = existing?.properties.find((p) => propertyRefString(p) === canonical);
    const p: PropertyInput = prior
      ? clone(prior)
      : {
          id: options.newId(),
          name: ref.name,
          type: OBSIDIAN_TYPES[options.types?.[ref.name] ?? ""] ?? "text",
          key: ref.name,
          config: options.types?.[ref.name] === "datetime" ? { includeTime: true } : {},
        };
    add(p);
    return p;
  };

  ensure("file.name");
  for (const name of Object.keys(formulas)) ensure(`formula.${name}`);
  for (const ref of Object.keys(nativeProps)) ensure(ref);
  const views = Array.isArray(base.views) ? base.views.filter(isObj) : [];
  for (const view of views) {
    for (const ref of [
      ...(Array.isArray(view.order) ? view.order : []),
      ...(Array.isArray(view.sort) ? view.sort.map((s) => (isObj(s) ? s.property : null)) : []),
      isObj(view.groupBy) ? view.groupBy.property : null,
    ]) {
      if (typeof ref === "string" && !ensure(ref)) warnings.push(`Unsupported property "${ref}"`);
    }
  }

  // Formula expressions and display names come from the native sections.
  const extraProperties: Obj = {};
  for (const p of properties) {
    const ref = propertyRefString(p);
    if (p.type === "formula") {
      const expression = formulas[p.key];
      const text =
        typeof expression === "string"
          ? expression
          : expression == null
            ? ""
            : JSON.stringify(expression);
      p.config = { ...p.config, expression: text };
    }
    const entry = nativeProps[ref];
    if (isObj(entry)) {
      const { displayName, ...rest } = entry;
      if (typeof displayName === "string" && displayName.trim()) p.name = displayName.trim();
      if (Object.keys(rest).length > 0) p.config = { ...p.config, extra: clone(rest) };
    }
  }
  for (const [ref, entry] of Object.entries(nativeProps)) {
    if (!byRef.has(refString(parseRefString(ref)))) extraProperties[ref] = clone(entry);
  }

  const mapping: FilterMapping = {
    properties: refProperties(properties),
    ...(options.idFor ? { idFor: options.idFor } : {}),
  };
  const idOfRef = (refText: unknown) =>
    typeof refText === "string"
      ? (byRef.get(refString(parseRefString(refText)))?.id ?? null)
      : null;

  // Top-level filters: membership (file.inFolder at the top of an `and`) and the database filter.
  let folder: string | null = null;
  let dbFilterNative: unknown = null;
  if (base.filters !== undefined) {
    const top = base.filters;
    const conjuncts = isObj(top) && Array.isArray(top.and) ? [...top.and] : null;
    if (conjuncts) {
      const at = conjuncts.findIndex(
        (c) => typeof c === "string" && /^file\.inFolder\(\s*(["']).*\1\s*\)$/.test(c.trim()),
      );
      if (at !== -1) {
        folder = String(conjuncts[at])
          .trim()
          .replace(/^file\.inFolder\(\s*(["'])(.*)\1\s*\)$/, "$2");
        conjuncts.splice(at, 1);
      }
      dbFilterNative = conjuncts.length > 0 ? { and: conjuncts } : null;
    } else dbFilterNative = top;
  }
  const dbFilter = readFilter(dbFilterNative, lydie.filter, mapping);

  const extra: Obj = {};
  for (const [key, value] of Object.entries(base)) {
    if (!TOP_KEYS.has(key)) extra[key] = clone(value);
  }
  if (Object.keys(extraProperties).length > 0) extra.properties = extraProperties;

  const config: DatabaseConfig = DatabaseConfigSchema.parse({
    filter: dbFilter,
    templateIds: Array.isArray(lydie.templates)
      ? lydie.templates.filter((t) => typeof t === "string")
      : [],
    extra,
  });

  const usedViewIds = new Set<string>();
  const viewInputs: ViewInput[] = views.map((view, index) => {
    const vl = isObj(view.lydie) ? view.lydie : {};
    const name =
      typeof view.name === "string" && view.name.trim() ? view.name.trim() : `View ${index + 1}`;
    let id = typeof vl.id === "string" ? vl.id : existing?.views.find((v) => v.name === name)?.id;
    if (!id || usedViewIds.has(id)) id = options.newId();
    usedViewIds.add(id);
    const nativeType = typeof view.type === "string" ? view.type : "table";
    let type: ViewType = FROM_NATIVE[nativeType] ?? "table";
    if (type === "table" && vl.type === "calendar" && nativeType === "table") type = "calendar";
    return {
      id,
      name,
      type,
      config: viewConfigFromBase(view, vl, nativeType, properties, mapping, idOfRef),
    };
  });

  const definition: DefinitionInput = { config, properties, views: viewInputs };
  return { id: typeof lydie.id === "string" ? lydie.id : null, folder, definition, warnings };
}

const FILE_NAMES: Record<string, string> = { name: "Name", ctime: "Created", mtime: "Updated" };

function keyForFileRef(name: string): string {
  return name;
}

// The structured filter Lydie wrote, if the native statements still say the same; otherwise the
// native statements, read as conditions where possible.
function readFilter(native: unknown, shadow: unknown, mapping: FilterMapping): FilterNode | null {
  if (native === null || native === undefined) return null;
  if (shadow !== undefined && shadow !== null) {
    const rendered = toBaseFilterRoot(shadow as FilterNode, mapping);
    if (rendered && same(rendered, normaliseRoot(native))) return clone(shadow as FilterNode);
  }
  return fromBaseFilter(native, mapping);
}

function normaliseRoot(native: unknown): unknown {
  return typeof native === "string" ? { and: [native] } : native;
}

function viewConfigFromBase(
  view: Obj,
  vl: Obj,
  nativeType: string,
  properties: readonly PropertyInput[],
  mapping: FilterMapping,
  idOfRef: (ref: unknown) => string | null,
): ViewConfig {
  const extra: Obj = {};
  for (const [key, value] of Object.entries(view)) {
    if (!VIEW_KEYS.has(key)) extra[key] = clone(value);
  }
  if (!FROM_NATIVE[nativeType]) extra.type = nativeType;

  const filter = view.filters === undefined ? null : readFilter(view.filters, vl.filter, mapping);

  // Columns: the native order (visible) and widths; hidden columns from lydie.columns.
  const order = (Array.isArray(view.order) ? view.order : [])
    .map(idOfRef)
    .filter((id): id is string => id !== null);
  const sizes = isObj(view.columnSize) ? view.columnSize : {};
  const widthOf = (id: string) => {
    for (const [ref, width] of Object.entries(sizes)) {
      if (idOfRef(ref) === id && typeof width === "number") return Math.round(width);
    }
    return undefined;
  };
  const shadow = Array.isArray(vl.columns) ? (vl.columns as ViewColumn[]) : null;
  let columns: ViewColumn[];
  const shadowOrder = shadow
    ? effectiveColumns(shadow, properties)
        .filter((c) => c.visible !== false)
        .map((c) => c.propertyId)
    : null;
  if (shadow && same(shadowOrder, order)) {
    columns = shadow.map((c) => {
      const width = widthOf(c.propertyId);
      return {
        propertyId: c.propertyId,
        visible: c.visible !== false,
        ...(width !== undefined ? { width } : {}),
      };
    });
  } else {
    columns = order.map((id) => {
      const width = widthOf(id);
      return { propertyId: id, visible: true, ...(width !== undefined ? { width } : {}) };
    });
    const listed = new Set(order);
    // Every other property is hidden: Bases shows only what `order` lists.
    for (const p of properties) {
      if (!listed.has(p.id)) columns.push({ propertyId: p.id, visible: false });
    }
  }

  const sorts: Sort[] = (Array.isArray(view.sort) ? view.sort : []).flatMap((s) => {
    if (!isObj(s)) return [];
    const propertyId = idOfRef(s.property);
    if (!propertyId) return [];
    return [
      {
        propertyId,
        direction: String(s.direction).toUpperCase() === "DESC" ? "desc" : "asc",
      } as Sort,
    ];
  });

  let groupBy: GroupBy | null = null;
  if (isObj(view.groupBy)) {
    const propertyId = idOfRef(view.groupBy.property);
    if (propertyId) {
      groupBy = {
        propertyId,
        direction: String(view.groupBy.direction).toUpperCase() === "DESC" ? "desc" : "asc",
        ...(isObj(vl.groupBy) ? (clone(vl.groupBy) as Partial<GroupBy>) : {}),
      };
      if (Array.isArray(view.groupOrder)) {
        groupBy.order = view.groupOrder.map((k) => (k === null ? null : String(k)));
      }
    }
  }

  const summaries: Record<string, string> = {};
  if (isObj(view.summaries)) {
    for (const [ref, name] of Object.entries(view.summaries)) {
      const id = idOfRef(ref);
      if (id && typeof name === "string") summaries[id] = name;
    }
  }

  const layout: ViewLayout = isObj(vl.layout) ? (clone(vl.layout) as ViewLayout) : {};
  if (typeof view.rowHeight === "string" && ["medium", "tall", "extra"].includes(view.rowHeight)) {
    layout.rowHeight = view.rowHeight as ViewLayout["rowHeight"];
  }
  const image = idOfRef(view.image);
  if (image) layout.cover = { type: "property", propertyId: image };
  else if (isObj(vl.cover) && vl.cover.type === "pageContent")
    layout.cover = { type: "pageContent" };
  if (view.imageFit === "cover" || view.imageFit === "contain") layout.coverFit = view.imageFit;
  if (typeof view.imageAspectRatio === "number") layout.coverAspectRatio = view.imageAspectRatio;
  if (typeof view.cardSize === "number") layout.cardSize = Math.round(view.cardSize);
  if (view.markers === "bullet" || view.markers === "number" || view.markers === "none") {
    layout.markers = view.markers;
  }

  return ViewConfigSchema.parse({
    filter,
    sorts,
    groupBy,
    subGroupBy: isObj(vl.subGroupBy) ? clone(vl.subGroupBy) : null,
    columns,
    limit: typeof view.limit === "number" && view.limit >= 1 ? Math.floor(view.limit) : null,
    summaries,
    layout,
    extra,
  });
}

export { printExpression };
