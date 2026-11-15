import { expect, test } from "bun:test";

import { uuidFromUlid } from "@lydie/contract";

import { rewriteStoredIds } from "./stored-ids.ts";

function memory(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

test("ids in keys and values become UUIDs, once", () => {
  const ws = "01M7BKKHMJ4BTYPD7RDDJ7WVMX";
  const doc = "01JCZ6Y8M4Q1W2E3R4T5Y6V7A1";
  const storage = memory({
    "lydie:lydie.scope": `hosted:${ws}`,
    "lydie:local-workspace": JSON.stringify({ id: ws, name: "My notes" }),
    [`lydie:plugin:workspace:${ws}:favorites`]: JSON.stringify([doc]),
    "lydie:schema-version:lydie-local.db": "7",
    other: ws,
  });
  rewriteStoredIds(storage);
  expect(storage.getItem("lydie:lydie.scope")).toBe(`hosted:${uuidFromUlid(ws)}`);
  expect(JSON.parse(storage.getItem("lydie:local-workspace")!).id).toBe(uuidFromUlid(ws));
  expect(storage.getItem(`lydie:plugin:workspace:${ws}:favorites`)).toBeNull();
  expect(storage.getItem(`lydie:plugin:workspace:${uuidFromUlid(ws)}:favorites`)).toBe(
    JSON.stringify([uuidFromUlid(doc)]),
  );
  expect(storage.getItem("lydie:schema-version:lydie-local.db")).toBe("7");
  expect(storage.getItem("other")).toBe(ws);

  // Done once: a later value that looks like a ULID is someone's text.
  storage.setItem("lydie:note", ws);
  rewriteStoredIds(storage);
  expect(storage.getItem("lydie:note")).toBe(ws);
});
