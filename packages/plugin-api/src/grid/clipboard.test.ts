import { describe, expect, test } from "bun:test";

import {
  clipboardMatrix,
  parseHtmlTable,
  parseTsv,
  pasteTargets,
  toHtmlTable,
  toTsv,
} from "./clipboard.ts";
import { single } from "./selection.ts";

const size = { rows: 10, cols: 4 };

describe("TSV", () => {
  test("round trip with tabs, newlines and quotes", () => {
    const matrix = [
      ["a", "b\tc"],
      ['say "hi"', "two\nlines"],
    ];
    expect(parseTsv(toTsv(matrix))).toEqual(matrix);
    expect(parseTsv("x\ty\r\nz\tw\n")).toEqual([
      ["x", "y"],
      ["z", "w"],
    ]);
  });
});

describe("HTML tables", () => {
  test("round trip with entities and line breaks", () => {
    const matrix = [
      ["<b>&", "two\nlines"],
      ["", 'q"'],
    ];
    expect(parseHtmlTable(toHtmlTable(matrix))).toEqual(matrix);
  });

  test("Google Sheets / Excel style markup", () => {
    const html = `<meta charset="utf-8"><google-sheets-html-origin><style>td{}</style>
      <table xmlns="http://www.w3.org/1999/xhtml" border="1"><colgroup><col width="100"></colgroup>
      <tbody><tr style="height:21px;"><td style="x">1,234.50</td><td>Done&nbsp;</td></tr>
      <tr><td colspan="2">wide</td><td>a<br style="mso-data-placement:same-cell;">b</td></tr></tbody></table>`;
    expect(parseHtmlTable(html)).toEqual([
      ["1,234.50", "Done"],
      ["wide", "", "a\nb"],
    ]);
  });

  test("no table: TSV from the text", () => {
    expect(parseHtmlTable("<p>hello</p>")).toBeNull();
    expect(clipboardMatrix({ html: "<p>hello</p>", text: "a\tb" })).toEqual([["a", "b"]]);
    expect(clipboardMatrix({ html: "<table><tr><td>x</td></tr></table>", text: "y" })).toEqual([
      ["x"],
    ]);
  });
});

describe("paste targets", () => {
  test("from the corner, clipped to the grid", () => {
    const targets = pasteTargets(
      single({ row: 8, col: 2 }),
      parseTsv("1\t2\t3\n4\t5\t6\n7\t8\t9"),
      size,
    );
    expect(targets).toEqual([
      { row: 8, col: 2, text: "1" },
      { row: 8, col: 3, text: "2" },
      { row: 9, col: 2, text: "4" },
      { row: 9, col: 3, text: "5" },
    ]);
  });

  test("one value fills the range; one row fills every selected row", () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 2, col: 1 } };
    expect(pasteTargets(range, [["x"]], size)).toHaveLength(6);
    const rows = pasteTargets(
      { anchor: { row: 0, col: 1 }, focus: { row: 3, col: 1 } },
      [["a", "b"]],
      size,
    );
    expect(rows.map((t) => [t.row, t.col, t.text])).toEqual([
      [0, 1, "a"],
      [0, 2, "b"],
      [1, 1, "a"],
      [1, 2, "b"],
      [2, 1, "a"],
      [2, 2, "b"],
      [3, 1, "a"],
      [3, 2, "b"],
    ]);
  });

  test("a block that divides the selection is tiled", () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 3, col: 0 } };
    expect(pasteTargets(range, [["a"], ["b"]], size).map((t) => t.text)).toEqual([
      "a",
      "b",
      "a",
      "b",
    ]);
    // Not a multiple: pasted once.
    const odd = { anchor: { row: 0, col: 0 }, focus: { row: 2, col: 0 } };
    expect(pasteTargets(odd, [["a"], ["b"]], size)).toHaveLength(2);
  });
});
