import { describe, expect, test } from "bun:test";

import type { ChildEntry, LiveState } from "@lydie/plugin-api";

import { createLiveRegistry } from "./live-registry.ts";
import type { LiveSource } from "./live-registry.ts";
import { createOverlays, overlaySource, patcherFor } from "./optimistic.ts";
import type { Patcher } from "./optimistic.ts";

const none = { properties: () => null };
const NEW = "01954000-0000-0000-0000-000000000000";

describe("optimistic doc.children", () => {
  test("a space's top level shows only pages created into that space", () => {
    const create = (teamspaceId: string | null | undefined) => ({
      id: NEW,
      workspaceId: "ws",
      title: "New",
      ...(teamspaceId !== undefined ? { teamspaceId } : {}),
    });
    const team = patcherFor(
      "doc.children",
      { workspaceId: "ws", parentId: null, teamspaceId: "t1" },
      none,
    )!;
    const mine = patcherFor(
      "doc.children",
      { workspaceId: "ws", parentId: null, teamspaceId: null, privateOwnerId: "me" },
      none,
    )!;
    const all = patcherFor("doc.children", { workspaceId: "ws", parentId: null }, none)!;
    expect(team([], "doc.create", create("t1"))).toHaveLength(1);
    expect(team([], "doc.create", create(null))).toBeNull();
    expect(mine([], "doc.create", create(null))).toHaveLength(1);
    expect(mine([], "doc.create", create(undefined))).toHaveLength(1);
    expect(mine([], "doc.create", create("t1"))).toBeNull();
    const row = all([], "doc.create", create("t1")) as ChildEntry[];
    expect(row[0]!.teamspaceId).toBe("t1");
  });
});

describe("overlays in a batching registry", () => {
  test("a patch notifies at once; the source's own emissions wait for the batch (LYD-319)", () => {
    type Row = { id: string; title: string };
    const batches: (() => void)[] = [];
    const registry = createLiveRegistry({ schedule: (flush) => batches.push(flush) });
    const overlays = createOverlays();
    let emitReal: (state: LiveState<Row>) => void = () => {};
    const source: LiveSource<Row> = (emit) => {
      emitReal = emit;
      return () => {};
    };
    const rename: Patcher<Row> = (rows, op, input) =>
      op === "doc.rename"
        ? rows.map((r) => ({ ...r, title: (input as { title: string }).title }))
        : null;
    const handle = registry.get("q", () => overlaySource(source, rename, overlays));
    let notified = 0;
    handle.subscribe(() => notified++);
    const title = () => handle.getSnapshot().data[0]?.title;

    emitReal({ data: [{ id: "a", title: "Old" }], isLoading: false, error: undefined });
    expect(notified).toBe(0);
    batches.shift()!();
    expect(notified).toBe(1);

    const settle = overlays.begin("doc.rename", { id: "a", title: "New" });
    expect(notified).toBe(2);
    expect(title()).toBe("New");

    settle(true);
    emitReal({ data: [{ id: "a", title: "New" }], isLoading: false, error: undefined });
    expect(notified).toBe(2);
    batches.shift()!();
    expect(notified).toBe(3);
    expect(batches).toHaveLength(0);
  });
});
