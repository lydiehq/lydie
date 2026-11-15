import { describe, expect, test } from "bun:test";

import type { AppApi } from "@lydie/plugin-api";

import { capture, INBOX_KEY } from "./capture.ts";

// The parts of the app `capture` uses; the formatting itself is the runtime's (inbox.capture).
function fakeApp(inboxName: string | null) {
  const calls: Array<{ input: unknown; options: unknown }> = [];
  const app = {
    workspace: { workspaceId: "w1" },
    storage: { get: (key: string) => (key === INBOX_KEY ? inboxName : null) },
    historyScope: () => "scope-1",
    backend: {
      ops: {
        inbox: {
          capture: async (input: unknown, options: unknown) => {
            calls.push({ input, options });
            return { inboxId: "inbox-1", documentId: "inbox-1", created: false };
          },
        },
      },
    },
  } as unknown as AppApi;
  return { app, calls };
}

describe("quick capture", () => {
  test("adds to the inbox with the local time, as one undoable step", async () => {
    const { app, calls } = fakeApp(null);
    expect(await capture(app, "Call Sam", new Date(2026, 10, 13, 9, 7))).toBe("inbox-1");
    expect(calls).toEqual([
      {
        input: { workspaceId: "w1", markdown: "Call Sam", time: "09:07", inbox: "Inbox" },
        options: { scope: "scope-1", label: "Quick capture" },
      },
    ]);
  });

  test("uses this device's inbox name, and skips an empty capture", async () => {
    const { app, calls } = fakeApp("Notes to sort");
    expect(await capture(app, "  ")).toBeNull();
    await capture(app, "x");
    expect(calls.map((c) => (c.input as { inbox: string }).inbox)).toEqual(["Notes to sort"]);
  });
});
