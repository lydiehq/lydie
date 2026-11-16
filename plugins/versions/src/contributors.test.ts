import { describe, expect, it } from "bun:test";

import type { Activity, Actor } from "@lydie/plugin-api";

import {
  contributorsOf,
  othersWorkedOn,
  whoIs,
  workedOnLabel,
  workOf,
  WRITING_MS,
  writingUntil,
} from "./contributors.ts";

const you: Actor = { type: "user", id: "local" };
const claude: Actor = { type: "agent", app: "claude-code", id: "s1", onBehalfOf: "maya" };
const claudeForJonas: Actor = { type: "agent", app: "Claude-Code", id: "s2", onBehalfOf: "jonas" };
const sync: Actor = { type: "system", id: "file-bridge" };

let n = 0;
function row(actor: Actor, type: Activity["type"], lastAt: string): Activity {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    workspaceId: "w1",
    actor,
    sessionId: null,
    type,
    targetId: "11111111-1111-4111-8111-111111111111",
    targetTitle: "Roadmap",
    data: {},
    count: 1,
    firstAt: lastAt,
    lastAt,
  };
}

describe("contributorsOf", () => {
  it("has one entry per person, agent and person it worked for, newest first", () => {
    const list = contributorsOf([
      row(you, "doc.bodyUpdated", "2026-11-16T10:00:00Z"),
      row(claude, "doc.bodyUpdated", "2026-11-16T12:00:00Z"),
      row(claude, "doc.created", "2026-11-16T09:00:00Z"),
      row(claudeForJonas, "thread.created", "2026-11-16T11:00:00Z"),
      row(you, "doc.renamed", "2026-11-16T13:00:00Z"),
    ]);
    expect(list.map((c) => c.key)).toEqual([
      "user:local",
      "agent:claude-code:maya",
      "agent:claude-code:jonas",
    ]);
    expect(list[0]!.lastAt).toBe("2026-11-16T13:00:00Z");
    // In the order work is told, whatever the order it came in.
    expect(list[1]!.types).toEqual(["doc.created", "doc.bodyUpdated"]);
  });
});

describe("othersWorkedOn", () => {
  it("is true for an agent or another person, not for you or the system alone", () => {
    const of = (...actors: Actor[]) =>
      contributorsOf(actors.map((a) => row(a, "doc.bodyUpdated", "2026-11-16T10:00:00Z")));
    expect(othersWorkedOn(of(you), "local")).toBe(false);
    expect(othersWorkedOn(of(you, sync), "local")).toBe(false);
    expect(othersWorkedOn(of(you, claude), "local")).toBe(true);
    expect(othersWorkedOn(of({ type: "user", id: "maya" }), "jonas")).toBe(true);
    expect(othersWorkedOn(of({ type: "user", id: "maya" }), "maya")).toBe(false);
  });
});

describe("writingUntil", () => {
  it("is two minutes after the newest change while the newest is an agent", () => {
    const at = "2026-11-16T12:00:00.000Z";
    expect(writingUntil(contributorsOf([row(claude, "doc.bodyUpdated", at)]))).toBe(
      Date.parse(at) + WRITING_MS,
    );
    expect(
      writingUntil(
        contributorsOf([
          row(claude, "doc.bodyUpdated", at),
          row(you, "doc.bodyUpdated", "2026-11-16T12:01:00Z"),
        ]),
      ),
    ).toBeNull();
  });
});

describe("workOf", () => {
  it("says at most three things, threads as commenting", () => {
    expect(workOf(["doc.created", "doc.bodyUpdated"])).toBe("Created the page, edited");
    expect(workOf(["thread.replied", "thread.resolved"])).toBe("Commented");
    expect(workOf(["doc.created", "doc.bodyUpdated", "doc.renamed", "doc.propertiesChanged"])).toBe(
      "Created the page, edited, renamed",
    );
    expect(workOf([])).toBe("Changed the page");
  });
});

describe("whoIs", () => {
  const people = new Map([
    ["maya", { name: "Maya Lindqvist", email: "maya@example.com", image: null }],
    ["jonas", { name: null, email: "jonas@example.com", image: "https://x/j.png" }],
  ]);

  it("names an agent by its app, and whom it worked for when several could have asked", () => {
    expect(whoIs(claude, people, "jonas")).toEqual({
      name: "Claude Code",
      forName: "Maya Lindqvist",
      avatar: {
        kind: "agent",
        seed: "agent:claude-code",
        behalf: { seed: "maya", image: null },
      },
    });
    expect(whoIs(claude, people, "maya").forName).toBe("you");
    expect(whoIs(claude, new Map(), "local")).toMatchObject({
      forName: null,
      avatar: { behalf: null },
    });
  });

  it("calls you You, others by name or email, and the system by what it is", () => {
    expect(whoIs({ type: "user", id: "maya" }, people, "maya").name).toBe("You");
    expect(whoIs({ type: "user", id: "jonas" }, people, "maya")).toMatchObject({
      name: "jonas@example.com",
      avatar: { kind: "person", seed: "jonas", image: "https://x/j.png" },
    });
    expect(whoIs({ type: "user", id: "gone" }, people, "maya").name).toBe("A former member");
    expect(whoIs(you, new Map(), "local").name).toBe("You");
    expect(whoIs(sync, people, "maya")).toEqual({
      name: "File sync",
      forName: null,
      avatar: { kind: "lydie" },
    });
  });
});

describe("workedOnLabel", () => {
  it("names two and counts the rest", () => {
    expect(workedOnLabel(["Claude Code"])).toBe("Worked on by Claude Code");
    expect(workedOnLabel(["Claude Code", "You"])).toBe("Worked on by Claude Code and You");
    expect(workedOnLabel(["A", "B", "C"])).toBe("Worked on by A, B and C");
    expect(workedOnLabel(["A", "B", "C", "D"])).toBe("Worked on by A, B and 2 others");
  });
});
