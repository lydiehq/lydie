import { describe, expect, test } from "bun:test";

import type { HostedWorkspaceSummary } from "@lydie/plugin-api";

import { afterSignIn } from "./after-sign-in.ts";

const ws = (id: string, role = "owner") => ({ id, name: id, role }) as HostedWorkspaceSummary;
const base = {
  then: null,
  canHandoff: true,
  workspaces: [ws("lydie")],
  remembered: null,
  hasNews: false,
} as const;

describe("after signing in from a local window", () => {
  test("nothing new here: straight to the cloud workspace, not a dialog", () => {
    expect(afterSignIn(base)).toEqual({ kind: "open", workspaceId: "lydie" });
    // Also when the caller wanted this workspace in the cloud: there is nothing to put there.
    expect(afterSignIn({ ...base, then: "handoff" })).toEqual({
      kind: "open",
      workspaceId: "lydie",
    });
  });

  test("opens the workspace this device used last, else one of the person's own", () => {
    const workspaces = [ws("guest-of", "guest"), ws("own"), ws("last")];
    expect(afterSignIn({ ...base, workspaces, remembered: "last" })).toEqual({
      kind: "open",
      workspaceId: "last",
    });
    expect(afterSignIn({ ...base, workspaces, remembered: "gone" })).toEqual({
      kind: "open",
      workspaceId: "own",
    });
  });

  test("notes written here meanwhile keep the window, with the way to the cloud named", () => {
    const next = afterSignIn({ ...base, hasNews: true });
    expect(next).toEqual({ kind: "stay", cloud: base.workspaces[0] });
    // Unknown (a folder) reads as something to keep.
    expect(afterSignIn({ ...base, hasNews: null }).kind).toBe("stay");
  });

  test("asked to put this workspace in the cloud, with notes here: offers it", () => {
    expect(afterSignIn({ ...base, then: "handoff", hasNews: true })).toEqual({ kind: "handoff" });
  });

  test("a new account has nothing in the cloud yet: offers what is here", () => {
    expect(afterSignIn({ ...base, workspaces: [] })).toEqual({ kind: "handoff" });
  });

  test("a window that cannot hand off stays as it is", () => {
    expect(afterSignIn({ ...base, canHandoff: false })).toEqual({ kind: "stay", cloud: null });
  });

  test("the account's workspaces could not be listed: only what was asked for", () => {
    expect(afterSignIn({ ...base, workspaces: null })).toEqual({ kind: "stay", cloud: null });
    expect(afterSignIn({ ...base, workspaces: null, then: "handoff" })).toEqual({
      kind: "handoff",
    });
  });
});
