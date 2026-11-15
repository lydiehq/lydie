import { describe, expect, test } from "bun:test";

import {
  localNotice,
  readCloud,
  readCopied,
  rememberCloud,
  rememberCopied,
} from "./local-notice.ts";

const studio = { workspaceId: "ws-1", name: "Maya's studio" };
const other = { workspaceId: "ws-2", name: "Other" };

function memory() {
  const values = new Map<string, unknown>();
  return {
    storage: {
      get: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
      set: (key: string, value: unknown) => void values.set(key, value),
    },
  };
}

describe("the notice in a local window", () => {
  test("a device that never opened a cloud workspace says nothing", () => {
    for (const status of ["signed-out", "signed-in", "expired"] as const) {
      expect(localNotice({ status, copied: null, cloud: null, dismissed: null })).toBeNull();
    }
  });

  test("signed out after using a cloud workspace: these notes are not that workspace", () => {
    expect(
      localNotice({ status: "signed-out", copied: null, cloud: studio, dismissed: null }),
    ).toEqual({ kind: "signed-out", cloud: studio });
    expect(
      localNotice({ status: "expired", copied: null, cloud: studio, dismissed: null })?.kind,
    ).toBe("signed-out");
  });

  test("signed in: names the workspace this one was copied to, else the one opened last", () => {
    expect(
      localNotice({ status: "signed-in", copied: studio, cloud: other, dismissed: null }),
    ).toEqual({ kind: "copied", cloud: studio });
    expect(
      localNotice({ status: "signed-in", copied: null, cloud: other, dismissed: null }),
    ).toEqual({ kind: "separate", cloud: other });
  });

  test("dismissing one kind leaves the others: signing out shows it again", () => {
    const input = { copied: studio, cloud: studio, dismissed: "copied" };
    expect(localNotice({ ...input, status: "signed-in" })).toBeNull();
    expect(localNotice({ ...input, status: "signed-out" })?.kind).toBe("signed-out");
  });
});

describe("what the device remembers", () => {
  test("the cloud workspace opened last", () => {
    const app = memory();
    expect(readCloud(app)).toBeNull();
    rememberCloud(app, { ...studio, at: "2026-11-15T10:00:00.000Z" });
    expect(readCloud(app)).toEqual({ ...studio, at: "2026-11-15T10:00:00.000Z" });
  });

  test("where each local workspace was copied to", () => {
    const app = memory();
    rememberCopied(app, "local-1", { workspaceId: "ws-1", workspaceName: "Maya's studio" });
    rememberCopied(app, "local-2", { workspaceId: "ws-2", workspaceName: "Other" });
    expect(readCopied(app, "local-1")).toEqual(studio);
    expect(readCopied(app, "local-2")).toEqual(other);
    expect(readCopied(app, "local-3")).toBeNull();
  });
});
