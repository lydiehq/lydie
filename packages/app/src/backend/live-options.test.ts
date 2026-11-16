// What the local backend's live queries re-run on, and how long they linger.
import { expect, test } from "bun:test";

import type { LydieEvent } from "@lydie/contract";

import { HEAVY_THROTTLE_MS, lingerFor, throttleFor, touchesTrash } from "./local.ts";

const WS = "ws";

const event = (type: string, data: Record<string, unknown>, workspaceId = WS) =>
  ({
    id: "e",
    type,
    workspaceId,
    at: "2026-11-16T00:00:00.000Z",
    actor: { type: "user", id: "u1" },
    operationId: "o",
    data,
  }) as unknown as LydieEvent;

test("the trash re-runs for what goes in or out of it, or changes in it", () => {
  const shown = [{ id: "in-trash" }];
  expect(touchesTrash(event("doc.deleted", { id: "a", deletedIds: ["a"] }), WS, shown)).toBe(true);
  expect(touchesTrash(event("attachment.purged", { id: "f" }), WS, shown)).toBe(true);
  expect(touchesTrash(event("doc.renamed", { id: "in-trash" }), WS, shown)).toBe(true);
  // Saving or renaming a live page, or anything in another workspace, does not.
  expect(touchesTrash(event("doc.bodyUpdated", { id: "a" }), WS, shown)).toBe(false);
  expect(touchesTrash(event("doc.renamed", { id: "a" }), WS, shown)).toBe(false);
  expect(touchesTrash(event("doc.deleted", { id: "a" }, "other"), WS, shown)).toBe(false);
});

test("workspace-wide queries are throttled while typing; searches do not linger", () => {
  for (const name of ["doc.search", "doc.unlinkedMentions", "doc.unresolvedLinks", "doc.recent"]) {
    expect(throttleFor(name)).toEqual({ throttleMs: HEAVY_THROTTLE_MS });
  }
  expect(throttleFor("doc.get")).toEqual({});
  expect(lingerFor("doc.search", undefined)).toEqual({ lingerMs: 0 });
  expect(lingerFor("doc.get", undefined)).toEqual({});
});
