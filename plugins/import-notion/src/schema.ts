// A Notion database as a Lydie one: its properties from the rows' property tables (which say each
// property's type) and the database's own table (column order, the title's name, columns no row
// has a value in), then each row's values. What has no equivalent becomes the closest type that
// keeps the values, with a warning: formulas and rollups keep their results, people their names.

import type { PropertyConfigInput, PropertyType, PropertyValue } from "@lydie/plugin-api/databases";
import { parseNumberText } from "@lydie/plugin-api/grid";
import { importFileRef, newImportId } from "@lydie/plugin-api/import";
import type { ImportDatabase, ImportProperty } from "@lydie/plugin-api/import";

import { parseNotionDate } from "./dates.ts";
import { resolveHref } from "./names.ts";
import type { CollectionTable, Option, PropertyCell } from "./page.ts";

export type DatabaseRow = {
  id: string;
  title: string;
  // The row page's folder in the export, which its links are relative to.
  dir: string;
  cells: PropertyCell[];
};

export type DatabaseInput = {
  id: string;
  title: string;
  table: CollectionTable | null;
  rows: DatabaseRow[];
};

export type SchemaContext = {
  // The plan page of an export path (a page link), or null.
  pageOf(path: string): string | null;
  // The plan page of a Notion id (links to notion.so addresses), or null.
  pageOfNotionId(id: string): string | null;
  // The database a plan page is a row of, or null.
  databaseOf(pageId: string): string | null;
  // The plan file for an export path, attached to `pageId`; null when it is not in the export.
  fileOf(path: string, pageId: string): string | null;
  dayFirst: boolean;
  warn(message: string, source?: string): void;
};

const COLORS = new Set([
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
]);

// The column icon's class, for columns without values.
function typeOfHint(hint: string | null): string | null {
  const h = hint?.toLowerCase().replace(/^types/, "") ?? "";
  if (!h) return null;
  const rules: [RegExp, string][] = [
    [/^title/, "title"],
    [/multi(ple)?select/, "multi_select"],
    [/status/, "status"],
    [/select/, "select"],
    [/number/, "number"],
    [/checkbox/, "checkbox"],
    [/createdby/, "created_by"],
    [/created/, "created_time"],
    [/lastedited(by|user)/, "last_edited_by"],
    [/lastedited/, "last_edited_time"],
    [/date/, "date"],
    [/person|people|user/, "person"],
    [/file|attachment/, "file"],
    [/url|link/, "url"],
    [/email/, "email"],
    [/phone/, "phone_number"],
    [/formula/, "formula"],
    [/relation/, "relation"],
    [/rollup/, "rollup"],
    [/(unique|autoincrement)id|^id$/, "auto_increment_id"],
    [/text/, "text"],
  ];
  return rules.find(([pattern]) => pattern.test(h))?.[1] ?? null;
}

const DIRECT: Record<string, PropertyType> = {
  text: "text",
  number: "number",
  select: "select",
  multi_select: "multiSelect",
  status: "status",
  date: "date",
  checkbox: "checkbox",
  url: "url",
  email: "email",
  phone_number: "phone",
  file: "files",
  relation: "relation",
  auto_increment_id: "uniqueId",
  created_time: "date",
  last_edited_time: "date",
  person: "multiSelect",
  created_by: "text",
  last_edited_by: "text",
};

// Keys Lydie uses itself in a page's frontmatter.
const RESERVED_KEYS = new Set(["id", "icon", "cover", "cover-position", "full-width"]);

const GROUPS = ["todo", "inProgress", "complete"] as const;

function statusGroup(name: string): (typeof GROUPS)[number] {
  if (/not started|to ?do|backlog|planned|^new$/i.test(name)) return "todo";
  if (/done|complete|finish|shipped|closed|resolved|archived/i.test(name)) return "complete";
  if (/progress|doing|started|review|active|working|wip|blocked/i.test(name)) return "inProgress";
  return "todo";
}

function options(cells: readonly PropertyCell[], status: boolean) {
  const seen = new Map<string, Option>();
  for (const cell of cells) {
    for (const option of cell.options.length ? cell.options : splitText(cell)) {
      if (!seen.has(option.name)) seen.set(option.name, option);
    }
  }
  const list = [...seen.values()].map((o) => ({
    name: o.name.slice(0, 200),
    color: (COLORS.has(o.color) ? o.color : "default") as "default",
    ...(status ? { group: statusGroup(o.name) } : {}),
  }));
  // Statuses as Notion lists them: to do, in progress, complete (sort is stable).
  return status ? list.sort((a, b) => GROUPS.indexOf(a.group!) - GROUPS.indexOf(b.group!)) : list;
}

// A select written as text (formulas, people): its parts.
function splitText(cell: PropertyCell): Option[] {
  const names = cell.people.length
    ? cell.people
    : cell.text
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
  return names.map((name) => ({ name, color: "default" }));
}

const CURRENCIES: [RegExp, string][] = [
  [/R\$/, "BRL"],
  [/US\$|\$/, "USD"],
  [/€/, "EUR"],
  [/£/, "GBP"],
  [/¥|円/, "JPY"],
  [/₹/, "INR"],
  [/₩/, "KRW"],
  [/CHF/, "CHF"],
  [/kr/i, "SEK"],
];

function numberConfig(texts: readonly string[]): PropertyConfigInput {
  const sample = texts.find((t) => t.trim());
  if (!sample) return {};
  if (sample.trim().endsWith("%")) return { numberFormat: "percent" };
  for (const [pattern, currency] of CURRENCIES) {
    if (pattern.test(sample)) return { numberFormat: "currency", currency };
  }
  if (/\d,\d{3}/.test(sample)) return { numberFormat: "commas" };
  return {};
}

// A formula's or rollup's results, as the type that keeps them best.
function computedType(cells: readonly PropertyCell[]): PropertyType {
  const filled = cells.filter((c) => c.text || c.checked !== null);
  if (!filled.length) return "text";
  if (filled.every((c) => c.checked !== null)) return "checkbox";
  if (filled.every((c) => parseNumberText(c.text) !== null)) return "number";
  if (filled.every((c) => c.times.length > 0)) return "date";
  return "text";
}

function uniqueKey(name: string, taken: Set<string>): string {
  let base = name.slice(0, 120).trim() || "Property";
  if (RESERVED_KEYS.has(base.toLowerCase()) || /^(file|formula|note|this)\./i.test(base)) {
    base = `${base} (Notion)`;
  }
  let key = base;
  for (let n = 2; taken.has(key.toLowerCase()); n++) key = `${base} ${n}`;
  taken.add(key.toLowerCase());
  return key;
}

type Column = {
  name: string;
  notionType: string;
  cells: (PropertyCell | undefined)[];
};

function columnsOf(input: DatabaseInput): { titleName: string; columns: Column[] } {
  const names: string[] = [];
  const types = new Map<string, Map<string, number>>();
  // Each row lists the properties in the database's order, leaving some out: a property a row
  // shows first goes after the one the row showed before it.
  for (const row of input.rows) {
    let previous: string | null = null;
    for (const cell of row.cells) {
      if (!types.has(cell.name)) {
        names.splice(previous === null ? 0 : names.indexOf(previous) + 1, 0, cell.name);
        types.set(cell.name, new Map());
      }
      previous = cell.name;
      const counts = types.get(cell.name)!;
      counts.set(cell.type, (counts.get(cell.type) ?? 0) + 1);
    }
  }
  const table = input.table?.columns ?? [];
  // The title column is the one the rows' property tables leave out (the title is the heading).
  const titleColumn =
    table.find((c) => typeOfHint(c.hint) === "title") ??
    table.find((c) => !types.has(c.name)) ??
    null;
  const ordered = [
    ...table.filter((c) => c !== titleColumn).map((c) => c.name),
    ...names.filter((n) => !table.some((c) => c.name === n)),
  ];
  const columns = [...new Set(ordered)].map((name) => {
    const counts = types.get(name);
    const notionType = counts
      ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      : (typeOfHint(table.find((c) => c.name === name)?.hint ?? null) ?? "text");
    return {
      name,
      notionType,
      cells: input.rows.map((row) => row.cells.find((c) => c.name === name)),
    };
  });
  return { titleName: titleColumn?.name || "Name", columns };
}

export type BuiltDatabase = {
  database: ImportDatabase;
  // Values by row id, then by property id.
  values: Map<string, Record<string, PropertyValue>>;
};

export function buildDatabase(input: DatabaseInput, ctx: SchemaContext): BuiltDatabase {
  const { titleName, columns } = columnsOf(input);
  const keys = new Set<string>([titleName.toLowerCase()]);
  const properties: ImportProperty[] = [];
  const values = new Map<string, Record<string, PropertyValue>>(input.rows.map((r) => [r.id, {}]));
  const warnOnce = (message: string) => ctx.warn(message, input.title);

  for (const column of columns) {
    const present = column.cells.filter((c): c is PropertyCell => c !== undefined);
    const { notionType } = column;
    if (notionType === "button") continue;
    let type: PropertyType = DIRECT[notionType] ?? "text";
    const config: PropertyConfigInput = {};
    const id = newImportId();

    if (notionType === "formula" || notionType === "rollup") {
      type = computedType(present);
      warnOnce(
        `“${column.name}” is a ${notionType} in Notion. Its results were imported as values; the ${notionType} itself was not.`,
      );
    } else if (!(notionType in DIRECT)) {
      warnOnce(`“${column.name}” (${notionType.replace(/_/g, " ")}) was imported as text.`);
    } else if (notionType === "person") {
      warnOnce(`“${column.name}” lists people by name, as a multi-select.`);
    } else if (notionType === "created_by" || notionType === "last_edited_by") {
      warnOnce(`“${column.name}” keeps the names Notion showed, as text.`);
    } else if (notionType === "created_time" || notionType === "last_edited_time") {
      warnOnce(`“${column.name}” keeps Notion's times as a date property.`);
    }

    // Relations need to know which database they point at: the one the linked rows belong to.
    let relationTarget: string | null = null;
    if (type === "relation") {
      const counts = new Map<string, number>();
      for (const [index, cell] of column.cells.entries()) {
        for (const page of linkedPages(cell, input.rows[index]!.dir, ctx)) {
          const db = ctx.databaseOf(page);
          if (db) counts.set(db, (counts.get(db) ?? 0) + 1);
        }
      }
      relationTarget = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (relationTarget) config.relation = { databaseId: relationTarget };
      else {
        type = "text";
        if (present.some((c) => c.text)) {
          warnOnce(
            `“${column.name}” relates to a database that is not in the export; its titles were imported as text.`,
          );
        }
      }
    }

    if (type === "select" || type === "multiSelect" || type === "status") {
      config.options = options(present, type === "status");
    }
    if (type === "number") Object.assign(config, numberConfig(present.map((c) => c.text)));

    let prefix: string | null = null;
    if (type === "uniqueId") {
      prefix =
        present
          .map((c) => /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(c.text.trim())?.[1])
          .find(Boolean)
          ?.slice(0, 16) ?? null;
      if (prefix) config.prefix = prefix;
    }

    const converted: (PropertyValue | undefined)[] = column.cells.map((cell, index) => {
      if (!cell) return undefined;
      const row = input.rows[index]!;
      return valueOf(type, cell, row, ctx, (message) => warnOnce(`“${column.name}”: ${message}`));
    });

    if (type === "date") {
      const dates = converted.filter((v): v is string => typeof v === "string");
      if (dates.some((d) => d.includes("T"))) config.includeTime = true;
      if (dates.some((d) => d.includes("/"))) config.range = true;
    }

    properties.push({
      id,
      name: column.name.slice(0, 200) || "Property",
      type,
      key: uniqueKey(column.name, keys),
      config,
    });
    for (const [index, value] of converted.entries()) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (value === "") continue;
      values.get(input.rows[index]!.id)![id] = value;
    }
  }

  return { database: { titleName, properties }, values };
}

function linkedPages(cell: PropertyCell | undefined, dir: string, ctx: SchemaContext): string[] {
  if (!cell) return [];
  const out: string[] = [];
  for (const link of cell.links) {
    const path = resolveHref(link.href, dir);
    const page = path
      ? ctx.pageOf(path)
      : ctx.pageOfNotionId(/([0-9a-f]{32})(?:[?#].*)?$/i.exec(link.href)?.[1]?.toLowerCase() ?? "");
    if (page) out.push(page);
  }
  return out;
}

function valueOf(
  type: PropertyType,
  cell: PropertyCell,
  row: DatabaseRow,
  ctx: SchemaContext,
  warn: (message: string) => void,
): PropertyValue | undefined {
  const text = cell.text;
  switch (type) {
    case "checkbox":
      return cell.checked ?? (/^(yes|true|checked)$/i.test(text) ? true : text ? false : undefined);
    case "number":
    case "uniqueId": {
      if (!text) return undefined;
      const raw = type === "uniqueId" ? text.replace(/^[A-Za-z][A-Za-z0-9]*-/, "") : text;
      const n = parseNumberText(raw);
      if (n === null) warn(`“${text}” is not a number and was left out.`);
      return n ?? undefined;
    }
    case "select":
    case "status":
      return (cell.options[0]?.name ?? text) || undefined;
    case "multiSelect":
      return (cell.options.length ? cell.options : splitText(cell)).map((o) => o.name);
    case "date": {
      const sources = cell.times.length ? cell.times : text ? [{ text, datetime: null }] : [];
      const first = sources[0];
      if (!first) return undefined;
      // A range can be one <time> or two.
      const joined =
        sources.length > 1 ? `${first.text} → ${sources[1]!.text}` : (first.text ?? text);
      const date = parseNotionDate(joined, first.datetime, { dayFirst: ctx.dayFirst });
      if (!date) {
        warn(`the date “${joined}” could not be read and was left out.`);
        return undefined;
      }
      return date.value;
    }
    case "relation":
      return [...new Set(linkedPages(cell, row.dir, ctx))];
    case "files": {
      const out: string[] = [];
      for (const link of cell.links) {
        const path = resolveHref(link.href, row.dir);
        const file = path ? ctx.fileOf(path, row.id) : null;
        if (file) out.push(importFileRef(file));
        else if (/^https?:\/\//i.test(link.href)) out.push(link.href);
      }
      return out;
    }
    case "url":
      return cell.links[0]?.href && /^[a-z]+:/i.test(cell.links[0].href)
        ? cell.links[0].href
        : text || undefined;
    default:
      return text || undefined;
  }
}
