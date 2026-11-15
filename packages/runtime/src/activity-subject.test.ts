import { describe, expect, it } from "bun:test";

import type { Activity } from "@lydie/contract";

import { ACTIVITY_WINDOW_MS, activitySubjectOf, coalesceActivity } from "./activity.ts";
import type { ActivityDraft } from "./activity.ts";

// Changes to the workspace itself (a hosted workspace's members, teamspaces, sharing): rows that
// may have no target and say what they are about in `data.subject`.

const AT = "2026-11-15T10:00:00.000Z";
const later = (ms: number) => new Date(Date.parse(AT) + ms).toISOString();
const maya = { kind: "user" as const, id: "u2", name: "Maya" };
const sam = { kind: "user" as const, id: "u3", name: "Sam" };

function draft(over: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    workspaceId: "w1",
    actor: { type: "user", id: "u1" },
    sessionId: null,
    type: "member.roleChanged",
    targetId: null,
    targetTitle: null,
    data: { subject: maya, role: "admin", previousRole: "member" },
    at: AT,
    ...over,
  };
}

function row(d: ActivityDraft): Activity {
  const decision = coalesceActivity(null, d, () => "r1");
  if (decision.kind !== "insert") throw new Error("expected an insert");
  return decision.row;
}

describe("workspace changes", () => {
  it("are rows without a target", () => {
    expect(row(draft())).toMatchObject({ targetId: null, count: 1 });
  });

  it("merge for the same subject and keep the first previous value", () => {
    const first = row(draft());
    const next = draft({
      at: later(60_000),
      data: { subject: maya, role: "guest", previousRole: "admin" },
    });
    const decision = coalesceActivity(first, next, () => "r2");
    expect(decision).toMatchObject({
      kind: "update",
      id: "r1",
      patch: { count: 2, data: { subject: maya, role: "guest", previousRole: "member" } },
    });
  });

  it("never merge rows about someone else, even with the same target", () => {
    const first = row(draft());
    expect(coalesceActivity(first, draft({ data: { subject: sam } }), () => "r2").kind).toBe(
      "insert",
    );
    const shared = row(draft({ type: "share.granted", targetId: "d1", data: { subject: maya } }));
    expect(
      coalesceActivity(
        shared,
        draft({ type: "share.granted", targetId: "d1", data: { subject: sam } }),
        () => "r2",
      ).kind,
    ).toBe("insert");
  });

  it("tell teamspaces apart for the same person", () => {
    const added = draft({
      type: "teamspace.memberAdded",
      data: { subject: maya, teamspace: { id: "t1", name: "Design" } },
    });
    const other = { ...added, data: { subject: maya, teamspace: { id: "t2", name: "Ops" } } };
    expect(coalesceActivity(row(added), other, () => "r2").kind).toBe("insert");
    expect(activitySubjectOf(other.data)).toEqual({ kind: "user", id: "u2", teamspaceId: "t2" });
  });

  it("start a new row after the window", () => {
    expect(
      coalesceActivity(row(draft()), draft({ at: later(ACTIVITY_WINDOW_MS) }), () => "r2").kind,
    ).toBe("insert");
  });
});
