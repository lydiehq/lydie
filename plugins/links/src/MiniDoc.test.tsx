import { describe, expect, test } from "bun:test";

import type { ReactElement } from "react";

import { MiniDoc } from "./MiniDoc.tsx";

type Element = ReactElement<{ children?: unknown; style?: { flexGrow?: number } }>;

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("MiniDoc", () => {
  test("draws a column row with the editor's markup and widths", () => {
    const doc = MiniDoc({
      nodes: [
        {
          type: "columnList",
          content: [
            { type: "column", attrs: { width: 40 }, content: [paragraph("Left")] },
            { type: "column", attrs: { width: null }, content: [paragraph("Right")] },
          ],
        },
      ],
    }) as Element;
    const [blocks] = doc.props.children as [Element[]];
    const row = blocks[0]!;
    expect(row.props).toMatchObject({ "data-type": "column-list" });
    const columns = row.props.children as Element[];
    expect(columns.map((column) => column.props)).toMatchObject([
      { "data-type": "column", style: { flexGrow: 40 } },
      { "data-type": "column", style: { flexGrow: 60 } },
    ]);
    expect((columns[1]!.props.children as Element[])[0]!.type).toBe("p");
  });
});
