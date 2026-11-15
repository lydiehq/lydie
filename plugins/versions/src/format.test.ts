import { describe, expect, test } from "bun:test";

import type { DocumentVersion } from "@lydie/plugin-api";

import { authorName, versionTitle } from "./format.ts";

const version = (patch: Partial<DocumentVersion>): DocumentVersion => ({
  id: "v1",
  documentId: "01JDOC00000000000000000000",
  kind: "auto",
  authors: [],
  restoredFrom: null,
  sizeBytes: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  ...patch,
});

describe("version labels", () => {
  test("name who changed the body", () => {
    expect(authorName("local")).toBe("You");
    expect(authorName("agent:claude:a1:local")).toBe("Claude");
    expect(authorName("system:file-bridge")).toBe("Another program");
  });

  test("say what a version is", () => {
    expect(versionTitle(version({ authors: ["local", "agent:claude:a1:local"] }))).toBe(
      "Edited by You, Claude",
    );
    expect(versionTitle(version({ kind: "restore", authors: ["local"] }))).toBe("Restored by You");
    expect(versionTitle(version({ kind: "before_write" }))).toBe("Earlier version");
    expect(versionTitle(version({ kind: "external", label: "First notes (Someone)" }))).toBe(
      "First notes (Someone)",
    );
    expect(versionTitle(version({ kind: "external" }))).toBe("Changed outside Lydie");
  });
});
