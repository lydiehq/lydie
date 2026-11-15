// Clipboard text for grids: tab-separated values (what spreadsheets exchange as text/plain) and
// HTML tables (text/html, which keeps line breaks inside cells), both directions, plus where a
// pasted block lands.
import { rectOf } from "./selection.ts";
import type { GridSelection, GridSize } from "./selection.ts";

export type Matrix = readonly (readonly string[])[];

function quoteCell(text: string): string {
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toTsv(matrix: Matrix): string {
  return matrix.map((row) => row.map(quoteCell).join("\t")).join("\n");
}

export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let atStart = true;
  const source = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
      atStart = true;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atStart = true;
    } else {
      cell += ch;
      atStart = false;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toHtmlTable(matrix: Matrix): string {
  const body = matrix
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// The first <table> in an HTML fragment (Google Sheets, Excel, Numbers, web pages) as rows of
// cell text, or null when there is none. Line breaks inside cells (<br>, block ends) are kept;
// colspan repeats empty cells so columns stay aligned.
export function parseHtmlTable(html: string): string[][] | null {
  const start = html.search(/<table[\s>]/i);
  if (start === -1) return null;
  const end = html.search(/<\/table\s*>/i);
  const table = html.slice(start, end === -1 ? undefined : end);
  const rows: string[][] = [];
  for (const rowMatch of table.matchAll(
    /<tr[\s>][\s\S]*?(?=<tr[\s>]|<\/tbody|<\/thead|<\/tfoot|$)/gi,
  )) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[0].matchAll(
      /<t([dh])(\s[^>]*)?>([\s\S]*?)(?=<t[dh][\s>]|<\/tr|$)/gi,
    )) {
      const attrs = cellMatch[2] ?? "";
      const inner = (cellMatch[3] ?? "").replace(/<\/t[dh]\s*>[\s\S]*$/i, "");
      // Source whitespace is spacing (HTML); <br> and block ends are line breaks.
      const text = decodeEntities(
        inner
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/\s+/g, " ")
          .replace(/<br\b[^>]*>/gi, "\n")
          .replace(/<\/(p|div|li)>/gi, "\n")
          .replace(/<[^>]+>/g, ""),
      )
        .replace(/ *\n */g, "\n")
        .trim();
      row.push(text);
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1] ?? 1);
      for (let i = 1; i < Math.min(span, 1000); i++) row.push("");
    }
    if (row.length) rows.push(row);
  }
  return rows.length ? rows : null;
}

// What a paste event carries, as rows of cells: an HTML table when there is one, else TSV.
export function clipboardMatrix(data: { html?: string | null; text?: string | null }): string[][] {
  const fromHtml = data.html ? parseHtmlTable(data.html) : null;
  if (fromHtml) return fromHtml;
  return parseTsv(data.text ?? "");
}

export type PasteTarget = { row: number; col: number; text: string };

// Where pasted cells go: from the selection's top-left, clipped to the grid. A single value fills
// the selected range; a single row fills every selected row; a block smaller than the selection
// that divides it evenly is tiled over it (as spreadsheets do).
export function pasteTargets(
  selection: GridSelection,
  matrix: Matrix,
  size: GridSize,
): PasteTarget[] {
  if (matrix.length === 0) return [];
  const rect = rectOf(selection);
  const height = matrix.length;
  const width = Math.max(...matrix.map((r) => r.length));
  const selRows = rect.bottom - rect.top + 1;
  const selCols = rect.right - rect.left + 1;
  const tileRows = selRows > height && selRows % height === 0 ? selRows : height;
  const tileCols = selCols > width && selCols % width === 0 ? selCols : width;
  const out: PasteTarget[] = [];
  for (let r = 0; r < tileRows; r++) {
    const source = matrix[r % height]!;
    const cols = tileCols === width ? source.length : tileCols;
    for (let c = 0; c < cols; c++) {
      const row = rect.top + r;
      const col = rect.left + c;
      if (row >= size.rows || col >= size.cols) continue;
      out.push({ row, col, text: source[c % width] ?? "" });
    }
  }
  return out;
}
