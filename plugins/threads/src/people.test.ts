import { describe, expect, test } from "bun:test";

import { authorOf } from "./people.ts";
import type { Member } from "./people.ts";

const one = new Map<string, Member>([["u1", { name: "Lars", image: "https://x/lars.png" }]]);
const two = new Map<string, Member>([...one, ["u2", { name: "Maya", image: null }]]);

describe("authorOf", () => {
  test("names people, agents with their person, and the one person of a folder", () => {
    expect(authorOf("u1", one).name).toBe("Lars");
    expect(authorOf("u9", one).name).toBe("Someone");
    expect(authorOf("local", new Map()).name).toBe("You");
    expect(authorOf("agent:claude-code:a1:u1", one).name).toBe("Claude Code, for Lars");
    expect(authorOf("agent:claude:a1:u9", one).name).toBe("Claude");
    expect(authorOf("system:file-bridge", one).name).toBe("Another program");
  });

  test("avatars are seeded as in the activity log", () => {
    expect(authorOf("u1", one).avatar).toEqual({
      kind: "person",
      seed: "u1",
      image: "https://x/lars.png",
    });
    expect(authorOf("system:sync", one).avatar).toEqual({ kind: "lydie" });
    // The person an agent worked for is a badge only where someone else could have asked.
    expect(authorOf("agent:Claude-Code:a1:u1", one).avatar).toEqual({
      kind: "agent",
      seed: "agent:claude-code",
      behalf: null,
    });
    expect(authorOf("agent:claude-code:a1:u1", two).avatar).toMatchObject({
      behalf: { seed: "u1", image: "https://x/lars.png" },
    });
  });
});
