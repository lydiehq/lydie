import { describe, expect, mock, test } from "bun:test";

import type { Editor } from "@lydie/plugin-api/editor";

import { collectionSlashItems } from "./slash.ts";

describe("slash items", () => {
  test("one way in for a new collection, one for an existing one", () => {
    const newCollection = mock(() => {});
    const viewOfCollection = mock(() => {});
    const items = collectionSlashItems({ newCollection, viewOfCollection });
    expect(items.map((i) => i.title)).toEqual(["Collection", "View of a collection…"]);
    const editor = {} as Editor;
    items[0]!.run(editor);
    items[1]!.run(editor);
    expect(newCollection).toHaveBeenCalledWith(editor);
    expect(viewOfCollection).toHaveBeenCalledWith(editor);
  });

  test("the old words still find them", () => {
    for (const item of collectionSlashItems({
      newCollection: () => {},
      viewOfCollection: () => {},
    })) {
      expect(item.keywords).toContain("database");
    }
  });
});
