// What the first pass keeps of a page of Notion's HTML export: its title, icon and cover, a
// database row's properties, a database's table, and the order its sub-pages are shown in. Bodies
// are converted in a second pass (body.ts), so a large export is never in memory as a whole.
import { dirname, resolveHref } from "./names.ts";

export type Option = { name: string; color: string };

export type CellLink = { href: string; text: string };

// One property of a database row, as its page shows it (`table.properties tr.property-row-<type>`).
export type PropertyCell = {
  name: string;
  // Notion's type: text, number, select, multi_select, status, date, person, file, checkbox, url,
  // email, phone_number, formula, relation, rollup, created_time, created_by, last_edited_time,
  // last_edited_by, auto_increment_id, …
  type: string;
  text: string;
  options: Option[];
  checked: boolean | null;
  links: CellLink[];
  times: { text: string; datetime: string | null }[];
  people: string[];
};

// A database's table (the full page of a database, or an inline one in a page's body).
export type CollectionTable = {
  columns: { name: string; hint: string | null }[];
  // The rows' pages, in the order the table lists them (export paths).
  rows: string[];
};

export type PageInfo = {
  path: string;
  title: string;
  icon: string | null;
  cover: { url: string } | { path: string } | null;
  description: string;
  // A database row's properties; null for other pages.
  properties: PropertyCell[] | null;
  // The page is a database (its table instead of a body).
  collection: CollectionTable | null;
  // Inline databases in the body (their rows are in a folder of their own, with no page).
  inline: CollectionTable[];
  // Export paths this page links to as sub-pages or inline databases, in the order shown.
  order: string[];
};

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim();

export function optionsOf(cell: Element): Option[] {
  const out: Option[] = [];
  for (const el of cell.querySelectorAll(".selected-value, .status-value")) {
    const name = text(el);
    if (!name) continue;
    const color = /(?:select|status)-value-color-([a-z]+)/.exec(el.className)?.[1] ?? "default";
    out.push({ name, color });
  }
  return out;
}

export function readCell(name: string, type: string, cell: Element): PropertyCell {
  const links = [...cell.querySelectorAll("a[href]")].map((a) => ({
    href: a.getAttribute("href") ?? "",
    text: text(a),
  }));
  const checkbox = cell.querySelector(".checkbox");
  const users = [...cell.querySelectorAll(".user")].map((u) => text(u)).filter(Boolean);
  return {
    name,
    type,
    text: text(cell),
    options: optionsOf(cell),
    checked: checkbox ? checkbox.classList.contains("checkbox-on") : null,
    links,
    times: [...cell.querySelectorAll("time")].map((t) => ({
      text: text(t),
      datetime: t.getAttribute("datetime"),
    })),
    people: users,
  };
}

export function readProperties(doc: Document): PropertyCell[] | null {
  const table = doc.querySelector("table.properties");
  if (!table) return null;
  const cells: PropertyCell[] = [];
  for (const row of table.querySelectorAll("tr")) {
    const type = [...row.classList]
      .find((c) => c.startsWith("property-row-"))
      ?.slice("property-row-".length);
    const head = row.querySelector("th");
    const value = row.querySelector("td");
    const name = text(head);
    if (!name || !value) continue;
    cells.push(readCell(name, type ?? "text", value));
  }
  return cells;
}

// The type icon of a column (`<svg class="typesSelect">`), which says the type of a column no
// row has a value in.
function hintOf(th: Element): string | null {
  const svg = th.querySelector("svg");
  return (
    svg
      ?.getAttribute("class")
      ?.split(/\s+/)
      .find((c) => c.startsWith("types")) ?? null
  );
}

export function readCollection(table: Element, dir: string): CollectionTable {
  const columns = [...table.querySelectorAll("thead th")].map((th) => ({
    name: text(th),
    hint: hintOf(th),
  }));
  const rows: string[] = [];
  for (const tr of table.querySelectorAll("tbody tr")) {
    const link = tr.querySelector("td.cell-title a[href], a[href]");
    const path = link ? resolveHref(link.getAttribute("href") ?? "", dir) : null;
    if (path) rows.push(path);
  }
  return { columns, rows };
}

// The database tables a page shows: its own (a database page has no `.page-body`) or inline ones.
export function collectionsIn(root: ParentNode): Element[] {
  return [...root.querySelectorAll("table.collection-content")];
}

// A page of the export as a document. Stylesheet links go first: they are not content, and a DOM
// that loads them (happy-dom in tests) would try to.
export function parsePage(html: string): Document {
  return new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/gi, ""), "text/html");
}

export function readPage(path: string, html: string): PageInfo {
  const doc = parsePage(html);
  const dir = dirname(path);
  const article = doc.querySelector("article") ?? doc.body;
  const body = article.querySelector(".page-body");
  const header = article.querySelector("header");

  const title = text(doc.querySelector("title")) || text(header?.querySelector(".page-title"));
  const iconEl = header?.querySelector(".page-header-icon .icon");
  const icon = iconEl && iconEl.tagName !== "IMG" ? text(iconEl) || null : null;
  const coverSrc = header?.querySelector("img.page-cover-image")?.getAttribute("src") ?? null;
  const coverPath = coverSrc ? resolveHref(coverSrc, dir) : null;
  const cover = coverPath
    ? { path: coverPath }
    : coverSrc && /^https?:/.test(coverSrc)
      ? { url: coverSrc }
      : null;

  let collection: CollectionTable | null = null;
  if (!body) {
    const table = collectionsIn(article)[0];
    if (table) collection = readCollection(table, dir);
  }
  const inline = body ? collectionsIn(body).map((table) => readCollection(table, dir)) : [];

  const order: string[] = [];
  const seen = new Set<string>();
  const add = (href: string | null | undefined) => {
    const target = href ? resolveHref(href, dir) : null;
    if (target && !seen.has(target)) {
      seen.add(target);
      order.push(target);
    }
  };
  if (body) {
    for (const el of body.querySelectorAll(
      "figure.link-to-page a[href], table.collection-content",
    )) {
      if (el.tagName === "A") add(el.getAttribute("href"));
      else add(el.querySelector("td.cell-title a[href], tbody a[href]")?.getAttribute("href"));
    }
  }
  for (const row of collection?.rows ?? []) {
    if (!seen.has(row)) {
      seen.add(row);
      order.push(row);
    }
  }

  return {
    path,
    title,
    icon,
    cover,
    description: text(header?.querySelector(".page-description")),
    properties: readProperties(doc),
    collection,
    inline,
    order,
  };
}
