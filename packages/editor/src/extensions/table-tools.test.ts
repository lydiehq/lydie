import { describe, expect, it } from "bun:test";

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

import { getLydieSchema } from "../schema";
import { canEditTable, columnAlign, editTable, selectTableLine, tableSize } from "./table-tools";
import type { TableEdit, TableTarget } from "./table-tools";

const schema = getLydieSchema();

function nodeType(name: string) {
  const type = schema.nodes[name];
  if (!type) throw new Error(`no ${name} node`);
  return type;
}

// A paragraph, then a table whose first row is the header, as @lydie/markdown parses one.
function stateWith(rows: string[][]) {
  const paragraph = (text: string) =>
    nodeType("paragraph").create(null, text ? schema.text(text) : undefined);
  const cell = (text: string, header: boolean) =>
    nodeType(header ? "tableHeader" : "tableCell").create(null, paragraph(text));
  const table = nodeType("table").create(
    null,
    rows.map((row, r) =>
      nodeType("tableRow").create(
        null,
        row.map((text) => cell(text, r === 0)),
      ),
    ),
  );
  const doc = nodeType("doc").create(null, [paragraph("Intro"), table]);
  return EditorState.create({ schema, doc });
}

const TABLE_POS = 7; // after the "Intro" paragraph (5 characters + 2)

function grid(doc: ProseMirrorNode) {
  const table = doc.nodeAt(TABLE_POS);
  if (!table) throw new Error("no table");
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) =>
      cells.push(`${cell.type.name === "tableHeader" ? "#" : ""}${cell.textContent}`),
    );
    rows.push(cells);
  });
  return rows;
}

function apply(state: EditorState, target: Omit<TableTarget, "tablePos">, edit: TableEdit) {
  const tr = editTable(state, { tablePos: TABLE_POS, ...target }, edit);
  if (!tr) throw new Error(`${edit.kind} was refused`);
  return state.apply(tr);
}

const sample = () =>
  stateWith([
    ["Step", "Users"],
    ["Install", "1000"],
    ["Account", "812"],
  ]);

describe("table tools", () => {
  it("finds the table", () => {
    expect(sample().doc.nodeAt(TABLE_POS)?.type.name).toBe("table");
    expect(tableSize(sample().doc, TABLE_POS)).toEqual({ rows: 3, columns: 2 });
    expect(tableSize(sample().doc, 0)).toBeNull();
  });

  it("inserts rows below and above body rows as body rows", () => {
    const below = apply(sample(), { axis: "row", index: 0 }, { kind: "insert", side: "after" });
    expect(grid(below.doc)).toEqual([
      ["#Step", "#Users"],
      ["", ""],
      ["Install", "1000"],
      ["Account", "812"],
    ]);
    const above = apply(sample(), { axis: "row", index: 2 }, { kind: "insert", side: "before" });
    expect(grid(above.doc)[2]).toEqual(["", ""]);
  });

  it("never inserts a row above the header", () => {
    expect(
      canEditTable(
        sample(),
        { tablePos: TABLE_POS, axis: "row", index: 0 },
        { kind: "insert", side: "before" },
      ),
    ).toBe(false);
  });

  it("inserts columns with a header cell on top", () => {
    const next = apply(sample(), { axis: "column", index: 0 }, { kind: "insert", side: "after" });
    expect(grid(next.doc)).toEqual([
      ["#Step", "#", "#Users"],
      ["Install", "", "1000"],
      ["Account", "", "812"],
    ]);
  });

  it("moves body rows but keeps the header in place", () => {
    const next = apply(sample(), { axis: "row", index: 2 }, { kind: "move", side: "before" });
    expect(grid(next.doc).map((row) => row[0])).toEqual(["#Step", "Account", "Install"]);
    const target = { tablePos: TABLE_POS, axis: "row" as const };
    expect(canEditTable(sample(), { ...target, index: 1 }, { kind: "move", side: "before" })).toBe(
      false,
    );
    expect(canEditTable(sample(), { ...target, index: 0 }, { kind: "move", side: "after" })).toBe(
      false,
    );
    expect(canEditTable(sample(), { ...target, index: 2 }, { kind: "move", side: "after" })).toBe(
      false,
    );
  });

  it("moves columns", () => {
    const next = apply(sample(), { axis: "column", index: 0 }, { kind: "move", side: "after" });
    expect(grid(next.doc)[0]).toEqual(["#Users", "#Step"]);
    expect(grid(next.doc)[1]).toEqual(["1000", "Install"]);
  });

  it("duplicates rows and columns", () => {
    const row = apply(sample(), { axis: "row", index: 1 }, { kind: "duplicate" });
    expect(grid(row.doc).map((r) => r[0])).toEqual(["#Step", "Install", "Install", "Account"]);
    const column = apply(sample(), { axis: "column", index: 1 }, { kind: "duplicate" });
    expect(grid(column.doc)).toEqual([
      ["#Step", "#Users", "#Users"],
      ["Install", "1000", "1000"],
      ["Account", "812", "812"],
    ]);
  });

  it("clears a line's contents", () => {
    const next = apply(sample(), { axis: "column", index: 1 }, { kind: "clear" });
    expect(grid(next.doc)).toEqual([
      ["#Step", "#"],
      ["Install", ""],
      ["Account", ""],
    ]);
  });

  it("deletes body rows and columns, never the header or the last column", () => {
    const row = apply(sample(), { axis: "row", index: 1 }, { kind: "delete" });
    expect(grid(row.doc).map((r) => r[0])).toEqual(["#Step", "Account"]);
    const column = apply(sample(), { axis: "column", index: 0 }, { kind: "delete" });
    expect(grid(column.doc)).toEqual([["#Users"], ["1000"], ["812"]]);
    expect(
      canEditTable(sample(), { tablePos: TABLE_POS, axis: "row", index: 0 }, { kind: "delete" }),
    ).toBe(false);
    expect(
      canEditTable(column, { tablePos: TABLE_POS, axis: "column", index: 0 }, { kind: "delete" }),
    ).toBe(false);
  });

  it("aligns a column (what Markdown's `:-:` stores)", () => {
    const next = apply(sample(), { axis: "column", index: 1 }, { kind: "align", align: "right" });
    expect(columnAlign(next.doc, TABLE_POS, 1)).toBe("right");
    expect(columnAlign(next.doc, TABLE_POS, 0)).toBeNull();
    const cleared = apply(next, { axis: "column", index: 1 }, { kind: "align", align: null });
    expect(columnAlign(cleared.doc, TABLE_POS, 1)).toBeNull();
  });

  it("selects a whole row or column", () => {
    const tr = selectTableLine(sample(), { tablePos: TABLE_POS, axis: "column", index: 1 });
    const selection = tr?.selection;
    expect(selection).toBeInstanceOf(CellSelection);
    const cells: string[] = [];
    (selection as CellSelection).forEachCell((cell) => cells.push(cell.textContent));
    expect(cells).toEqual(["Users", "1000", "812"]);
  });
});
