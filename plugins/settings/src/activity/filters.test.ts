import { describe, expect, it } from "bun:test";

import { ACTIVITY_TYPES, isWorkspaceActivityType } from "@lydie/plugin-api";
import type { Actor } from "@lydie/plugin-api";

import type { Person } from "./actors.ts";
import {
  addSeen,
  EVENT_GROUPS,
  eventGroups,
  hasFilters,
  NO_FILTERS,
  personOptions,
  toggle,
  toQuery,
} from "./filters.ts";
import { activity } from "./fixtures.ts";
import { isUnavailable } from "./source.ts";

const members = new Map<string, Person>([
  ["u1", { name: "Maya", email: null, image: null }],
  ["u2", { name: "Sam", email: null, image: null }],
]);
const claude = (id: string): Actor => ({ type: "agent", app: "claude-code", id, onBehalfOf: "u1" });

describe("personOptions", () => {
  it("lists members, then agents by app and the system, from what was loaded", () => {
    const items = [
      activity({ actor: claude("s1") }),
      activity({ actor: claude("s2") }),
      activity({ actor: { type: "system", id: "file-bridge" } }),
      activity({ actor: { type: "user", id: "u1" } }),
    ];
    const options = personOptions(members, false, addSeen([], items));
    expect(options.map((o) => o.label)).toEqual(["Maya", "Sam", "Claude Code", "File sync"]);
    expect(options.find((o) => o.key === "agent:claude-code")?.refs).toEqual([
      "agent:claude-code:s1:u1",
      "agent:claude-code:s2:u1",
    ]);
  });

  it("is You alone in a local workspace", () => {
    const options = personOptions(new Map(), true, [claude("s1")]);
    expect(options.map((o) => o.label)).toEqual(["You", "Claude Code"]);
  });

  it("adds new actors to those seen, once", () => {
    const seen = addSeen(
      [],
      [activity({ actor: claude("s1") }), activity({ actor: claude("s1") })],
    );
    expect(seen).toHaveLength(1);
    expect(addSeen(seen, [activity({ actor: claude("s1") })])).toBe(seen);
    expect(addSeen(seen, [activity({ actor: claude("s2") })])).toHaveLength(2);
  });
});

describe("toQuery", () => {
  const options = personOptions(members, false, [claude("s1"), claude("s2")]);

  it("asks for everything without filters", () => {
    expect(toQuery("w1", NO_FILTERS, options)).toEqual({ workspaceId: "w1", limit: 50 });
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it("maps search, people and event groups to the query", () => {
    const query = toQuery(
      "w1",
      {
        search: "  road ",
        people: ["user:u2", "agent:claude-code"],
        events: ["edited", "deleted"],
      },
      options,
      20,
    );
    expect(query).toEqual({
      workspaceId: "w1",
      limit: 20,
      search: "road",
      actors: ["u2", "agent:claude-code:s1:u1", "agent:claude-code:s2:u1"],
      types: ["doc.bodyUpdated", "doc.deleted", "doc.restored", "doc.purged"],
    });
  });

  it("filters changes to the workspace by group", () => {
    const query = toQuery("w1", { ...NO_FILTERS, events: ["members", "integrations"] }, options);
    expect(query.types).toContain("member.roleChanged");
    expect(query.types).toContain("invitation.revoked");
    expect(query.types).toContain("apiToken.created");
    expect(query.types).toContain("publication.failed");
    expect(query.types).not.toContain("share.granted");
  });

  it("matches nobody rather than everybody when a person has no refs", () => {
    expect(toQuery("w1", { ...NO_FILTERS, people: ["agent:gone"] }, options).actors).toEqual([
      "system:none",
    ]);
  });

  it("toggles values", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("EVENT_GROUPS", () => {
  it("puts every kind of change in exactly one group", () => {
    const grouped = EVENT_GROUPS.flatMap((g) => g.types);
    expect(new Set(grouped).size).toBe(grouped.length);
    // Threads are not filtered yet; everything else is.
    const missing = ACTIVITY_TYPES.filter((t) => !grouped.includes(t) && !t.startsWith("thread."));
    expect(missing).toEqual([]);
  });

  it("offers workspace groups only where a workspace records them", () => {
    const local = eventGroups(false).map((g) => g.id);
    expect(local).not.toContain("members");
    expect(local).toContain("edited");
    expect(eventGroups(true).map((g) => g.id)).toEqual(EVENT_GROUPS.map((g) => g.id));
    for (const group of EVENT_GROUPS) {
      expect(group.types.every(isWorkspaceActivityType)).toBe(group.hosted === true);
    }
  });
});

describe("isUnavailable", () => {
  it("is an operation the server or the window does not answer", () => {
    expect(isUnavailable({ code: "unknown_operation" })).toBe(true);
    expect(isUnavailable({ code: "internal" })).toBe(true);
    expect(isUnavailable({ status: 404 })).toBe(true);
    expect(isUnavailable({ code: "forbidden", status: 403 })).toBe(false);
    expect(isUnavailable(new Error("offline"))).toBe(false);
  });
});
