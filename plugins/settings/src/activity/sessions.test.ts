import { describe, expect, it } from "bun:test";

import type { Actor, HistorySession } from "@lydie/plugin-api";

import { activity } from "./fixtures.ts";
import { collapseSessions, undoableSessions } from "./sessions.ts";

const claude: Actor = { type: "agent", app: "claude-code", id: "s1", onBehalfOf: "local" };
const cursor: Actor = { type: "agent", app: "cursor", id: "s2", onBehalfOf: "local" };

describe("collapseSessions", () => {
  it("folds consecutive rows of one agent session into one entry", () => {
    const rows = [
      activity({
        actor: claude,
        sessionId: "s1",
        targetId: "a",
        count: 3,
        lastAt: "2026-11-15T10:30:00.000Z",
        firstAt: "2026-11-15T10:20:00.000Z",
      }),
      activity({
        actor: claude,
        sessionId: "s1",
        targetId: "b",
        count: 2,
        lastAt: "2026-11-15T10:10:00.000Z",
        firstAt: "2026-11-15T10:05:00.000Z",
      }),
      activity({
        actor: claude,
        sessionId: "s1",
        targetId: "a",
        type: "doc.renamed",
        lastAt: "2026-11-15T10:00:00.000Z",
        firstAt: "2026-11-15T10:00:00.000Z",
      }),
      activity({
        actor: claude,
        sessionId: "s1",
        targetId: "f",
        type: "attachment.created",
        lastAt: "2026-11-15T09:59:00.000Z",
        firstAt: "2026-11-15T09:59:00.000Z",
      }),
    ];
    const entries = collapseSessions(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "session",
      sessionId: "s1",
      changes: 7,
      pages: 2,
      firstAt: "2026-11-15T09:59:00.000Z",
      lastAt: "2026-11-15T10:30:00.000Z",
    });
  });

  it("counts no page for a change to the workspace itself", () => {
    const rows = [
      activity({ actor: claude, sessionId: "s1", targetId: "a" }),
      activity({
        actor: claude,
        sessionId: "s1",
        type: "member.invited",
        targetId: null,
        targetTitle: null,
        data: { subject: { kind: "invitation", id: "i1", name: "maya@example.com" } },
      }),
    ];
    expect(collapseSessions(rows)[0]).toMatchObject({ kind: "session", changes: 2, pages: 1 });
  });

  it("leaves single rows, people, rows without a session and interrupted runs alone", () => {
    const me: Actor = { type: "user", id: "local" };
    const rows = [
      activity({ actor: claude, sessionId: "s1" }),
      activity({ actor: me }),
      activity({ actor: claude, sessionId: "s1" }),
      activity({ actor: claude, sessionId: "s1" }),
      activity({ actor: cursor, sessionId: "s2" }),
      activity({ actor: claude, sessionId: null }),
      activity({ actor: me, sessionId: "s1" }),
      activity({ actor: me, sessionId: "s1" }),
    ];
    expect(
      collapseSessions(rows).map((e) => (e.kind === "item" ? "item" : `session:${e.items.length}`)),
    ).toEqual(["item", "item", "session:2", "item", "item", "item", "item"]);
  });

  it("does not fold two agents that share a session id", () => {
    const other: Actor = { ...cursor, id: "s1" };
    const entries = collapseSessions([
      activity({ actor: claude, sessionId: "s1" }),
      activity({ actor: other, sessionId: "s1" }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["item", "item"]);
  });
});

describe("undoableSessions", () => {
  const session = (sessionId: string, actor: Actor, count: number, undoneCount: number) =>
    ({
      sessionId,
      actor,
      workspaceId: "w1",
      firstAt: "2026-11-15T10:00:00.000Z",
      lastAt: "2026-11-15T10:30:00.000Z",
      count,
      undoneCount,
    }) satisfies HistorySession;

  it("counts the changes an undo would act on, for my agents' sessions only", () => {
    const sessions = [
      session("s1", claude, 8, 3),
      session("s2", cursor, 2, 2),
      session("s3", { ...claude, onBehalfOf: "u9" }, 4, 0),
      session("s4", { type: "user", id: "local" }, 4, 0),
    ];
    expect([...undoableSessions(sessions, "local")]).toEqual([["s1", 5]]);
  });
});
