// References to a database's parts as people and agents write them: a property by id, frontmatter
// key or name, a view by id or name, a row by id or unique id ("LYD-12"). One resolver for every
// operation that takes them, so they all agree; ids are what gets stored.
import { formatUniqueId, isUuid, LydieError, parseUniqueId } from "@lydie/contract";
import type {
  DatabaseProperty,
  DatabaseView,
  FilterNode,
  GroupBy,
  ViewColumn,
  ViewConfigPatch,
  ViewWindow,
} from "@lydie/contract";

type Named = { id: string; name: string; key?: string };

// Finds an item by id, frontmatter key (properties) or name (case-insensitive). Unknown and
// ambiguous references fail with the candidates.
export function resolver<T extends Named>(
  items: readonly T[],
  what: "property" | "view",
): (ref: string) => T {
  return (ref) => {
    const exact = items.find((i) => i.id === ref) ?? items.find((i) => i.key === ref);
    if (exact) return exact;
    const lower = ref.trim().toLowerCase();
    let named = items.filter((i) => i.name.toLowerCase() === lower);
    if (named.length === 0) named = items.filter((i) => i.key?.toLowerCase() === lower);
    if (named.length === 1) return named[0]!;
    const plural = what === "property" ? "properties" : "views";
    if (named.length > 1) {
      throw new LydieError("invalid_input", `Several ${plural} are named "${ref}"; use the id`, {
        hint: `Candidates: ${named.map((i) => `${i.name} (${i.id})`).join(", ")}`,
      });
    }
    throw new LydieError("invalid_input", `No ${what} "${ref}"`, {
      hint: `Known ${plural}: ${items.map((i) => i.name).join(", ")}`,
    });
  };
}

// A property reference in a view setting. Ids pass through even when the property is not live
// (stored configs, undo, files that name properties this workspace has not created yet).
function propertyIdOf(properties: readonly DatabaseProperty[]): (ref: string) => string {
  const find = resolver(properties, "property");
  return (ref) => (isUuid(ref) ? ref : find(ref).id);
}

// The view settings of a patch with every property named by its id.
export function resolveViewConfig<T extends ViewConfigPatch | undefined>(
  config: T,
  properties: readonly DatabaseProperty[],
): T {
  if (!config) return config;
  const id = propertyIdOf(properties);
  const group = (g: GroupBy | null | undefined) => (g ? { ...g, propertyId: id(g.propertyId) } : g);
  const out: ViewConfigPatch = { ...config };
  if (config.filter) out.filter = resolveFilter(config.filter, id);
  if (config.sorts) out.sorts = config.sorts.map((s) => ({ ...s, propertyId: id(s.propertyId) }));
  if (config.groupBy !== undefined) out.groupBy = group(config.groupBy) ?? null;
  if (config.subGroupBy !== undefined) out.subGroupBy = group(config.subGroupBy) ?? null;
  if (config.columns) {
    out.columns = config.columns.map((c: ViewColumn) => ({ ...c, propertyId: id(c.propertyId) }));
  }
  if (config.summaries) {
    out.summaries = Object.fromEntries(
      Object.entries(config.summaries).map(([ref, summary]) => [id(ref), summary]),
    );
  }
  if (config.layout) {
    const layout = { ...config.layout };
    if (layout.calendarPropertyId) layout.calendarPropertyId = id(layout.calendarPropertyId);
    if (layout.cover?.type === "property") {
      layout.cover = { ...layout.cover, propertyId: id(layout.cover.propertyId) };
    }
    out.layout = layout;
  }
  return out as T;
}

export function resolveFilter(node: FilterNode, id: (ref: string) => string): FilterNode {
  if (node.type === "condition") return { ...node, propertyId: id(node.propertyId) };
  if (node.type === "group") {
    return { ...node, children: node.children.map((c) => resolveFilter(c, id)) };
  }
  return node;
}

export function resolveFilterRefs(
  node: FilterNode | null | undefined,
  properties: readonly DatabaseProperty[],
): FilterNode | null | undefined {
  return node ? resolveFilter(node, propertyIdOf(properties)) : node;
}

export function resolveWindow(window: ViewWindow, properties: readonly DatabaseProperty[]) {
  const ref = window.range?.propertyId;
  if (!window.range || !ref) return window;
  return { ...window, range: { ...window.range, propertyId: propertyIdOf(properties)(ref) } };
}

export function resolveView(views: readonly DatabaseView[], ref: string): DatabaseView {
  const view = views.find((v) => v.id === ref);
  if (view) return view;
  if (isUuid(ref)) throw new LydieError("not_found", `View ${ref} not found`);
  return resolver(views, "view")(ref);
}

type RowLike = { id: string; properties: Record<string, unknown> };

// A row by id or by the value of the database's uniqueId property ("LYD-12" or 12). `rows` is read
// once, on the first reference that is not an id.
export function rowResolver(
  properties: readonly DatabaseProperty[],
  rows: () => Promise<readonly RowLike[]>,
): (ref: string) => Promise<string> {
  const unique = properties.filter((p) => p.type === "uniqueId");
  let byNumber: Promise<Map<string, string>> | null = null;
  return async (ref) => {
    if (isUuid(ref)) return ref;
    byNumber ??= rows().then((all) => {
      const map = new Map<string, string>();
      for (const row of all) {
        for (const p of unique) {
          const n = row.properties[p.key];
          if (typeof n === "number") map.set(`${p.id}:${n}`, row.id);
        }
      }
      return map;
    });
    const map = await byNumber;
    for (const p of unique) {
      const n = parseUniqueId(ref, p.config.prefix);
      const id = n === null ? undefined : map.get(`${p.id}:${n}`);
      if (id) return id;
    }
    const example = unique[0] ? formatUniqueId(12, unique[0].config.prefix) : null;
    throw new LydieError("not_found", `No row "${ref}" in this database`, {
      hint: example
        ? `Name a row by its id or its unique id, e.g. "${example}".`
        : "This database has no unique id property: use the row's id.",
    });
  };
}
