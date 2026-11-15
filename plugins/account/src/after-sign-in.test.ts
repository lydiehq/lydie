import { describe, expect, test } from "bun:test";

import type { HostedWorkspaceSummary } from "@lydie/plugin-api";

import { afterSignIn } from "./after-sign-in.ts";

const ws = (id: string, role = "owner") => ({ id, name: id, role }) as HostedWorkspaceSummary;
const base = {
  then: null,
  canHandoff: true,
  workspaces: [ws("lydie")],
  remembered: null,
  changed: 0,
  neverAsk: false,
} as const;

describe("after signing in from a local window", () => {
  test("nothing changed here: straight to the cloud workspace, not a dialog", () => {
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

  test("pages changed here meanwhile: asks whether to move them, saying how many", () => {
    expect(afterSignIn({ ...base, changed: 2 })).toEqual({
      kind: "ask",
      cloud: base.workspaces[0],
      count: 2,
    });
    // The same question whatever asked for the sign-in, not the dialog that chooses a workspace.
    expect(afterSignIn({ ...base, changed: 2, then: "handoff" }).kind).toBe("ask");
  });

  test("told not to ask again: straight to the cloud workspace", () => {
    expect(afterSignIn({ ...base, changed: 2, neverAsk: true })).toEqual({
      kind: "open",
      workspaceId: "lydie",
    });
  });

  test("a guest cannot move pages into the workspace, so is not asked", () => {
    expect(afterSignIn({ ...base, changed: 2, workspaces: [ws("theirs", "guest")] })).toEqual({
      kind: "open",
      workspaceId: "theirs",
    });
  });

  test("a folder stays, unless the caller asked to put it in the cloud", () => {
    expect(afterSignIn({ ...base, changed: null })).toEqual({ kind: "stay" });
    expect(afterSignIn({ ...base, changed: null, then: "handoff" })).toEqual({ kind: "handoff" });
  });

  test("a new account has nothing in the cloud yet: offers what is here", () => {
    expect(afterSignIn({ ...base, workspaces: [] })).toEqual({ kind: "handoff" });
  });

  test("a window that cannot hand off stays as it is", () => {
    expect(afterSignIn({ ...base, canHandoff: false })).toEqual({ kind: "stay" });
  });

  test("the account's workspaces could not be listed: only what was asked for", () => {
    expect(afterSignIn({ ...base, workspaces: null })).toEqual({ kind: "stay" });
    expect(afterSignIn({ ...base, workspaces: null, then: "handoff" })).toEqual({
      kind: "handoff",
    });
  });
});
