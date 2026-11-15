import { describe, expect, it } from "bun:test";

import { toPlatformError } from "@lydie/platform";

import { invokeContract } from "../shared/ipc-contract.ts";
import {
  checkDownloadUrl,
  checkExternalUrl,
  checkSender,
  createOriginPolicy,
  parseInput,
} from "./ipc-validation.ts";

function code(run: () => unknown) {
  try {
    run();
    return "ok";
  } catch (error) {
    return toPlatformError(error).code;
  }
}

describe("parseInput", () => {
  it("accepts well-formed payloads", () => {
    expect(parseInput("fs:read-text", { path: "notes/a.md" })).toEqual({ path: "notes/a.md" });
    expect(parseInput("fs:watch", undefined)).toEqual({});
    expect(
      parseInput("fs:write-bytes", { path: "a.bin", content: new Uint8Array([1]) }).content,
    ).toBeInstanceOf(Uint8Array);
    expect(
      parseInput("menu:set-application", {
        items: [
          {
            label: "File",
            submenu: [{ id: "x", accelerator: "CmdOrCtrl+Shift+P" }, { type: "separator" }],
          },
        ],
      }).items,
    ).toHaveLength(1);
    expect(
      parseInput("window:open", {
        scope: { kind: "hosted", serverUrl: "https://lydie.example", accountId: "acc_1" },
      }).scope.kind,
    ).toBe("hosted");
    const route = { kind: "doc", id: "01928000-0000-0000-0000-000000000000" };
    expect(parseInput("window:open", { scope: { kind: "none" }, route }).route).toEqual(route);
    expect(parseInput("shortcuts:register", { accelerator: "Alt+Shift+K" })).toEqual({
      accelerator: "Alt+Shift+K",
    });
    expect(parseInput("shortcuts:set-quick-capture", { accelerator: null })).toEqual({
      accelerator: null,
    });
  });

  it.each([
    ["fs:read-text", { path: 42 }],
    ["fs:read-text", { path: "a", extra: true }],
    ["fs:read-text", "notes/a.md"],
    ["fs:write-bytes", { path: "a", content: [1, 2] }],
    ["fs:write-text", { path: "a", content: "x", expectedMtime: Number.NaN }],
    ["menu:set-application", { items: [{ role: "eval" }] }],
    ["menu:set-application", { items: [{ label: "x", click: "alert(1)" }] }],
    ["window:open", { scope: { kind: "hosted", serverUrl: "file:///etc", accountId: "a" } }],
    ["window:open", { scope: { kind: "local" } }],
    ["window:open", { scope: { kind: "none" }, route: "doc" }],
    ["window:open", { scope: { kind: "none" }, route: { big: "x".repeat(20_000) } }],
    ["window:open", { scope: { kind: "none" }, route: { f: () => 1 } }],
    ["shortcuts:register", { accelerator: "Space" }],
    ["shortcuts:register", { accelerator: "Ctrl+Shift+K; rm -rf" }],
    ["shortcuts:set-quick-capture", { accelerator: "" }],
    ["secrets:get", { key: "../../etc" }],
    ["services:request", { service: "Diagnostics!", method: "echo", input: {} }],
    ["services:request", { service: "diagnostics", method: "__proto__", input: {} }],
    ["dialogs:open-files", { filters: [{ name: "x", extensions: ["*.exe;rm"] }] }],
  ] as const)("rejects %s %j", (channel, input) => {
    expect(code(() => parseInput(channel, input))).toBe("invalid-argument");
  });

  it("rejects unknown channels", () => {
    expect(code(() => parseInput("fs:format-disk" as never, {}))).toBe("invalid-argument");
  });

  it("has a schema for every channel", () => {
    const missing = Object.entries(invokeContract).filter(([, entry]) => !entry.input);
    expect(missing).toEqual([]);
  });
});

describe("checkSender", () => {
  const policy = createOriginPolicy([
    "lydie-app://web",
    "lydie-app://diagnostics",
    "http://localhost:3000",
  ]);
  const ok = { frameUrl: "lydie-app://web/index.html", isMainFrame: true, knownWindow: true };

  it("trusts the top frame of our pages", () => {
    expect(code(() => checkSender(ok, policy))).toBe("ok");
    expect(
      code(() => checkSender({ ...ok, frameUrl: "http://localhost:3000/doc/1" }, policy)),
    ).toBe("ok");
  });

  it.each([
    { ...ok, knownWindow: false },
    { ...ok, isMainFrame: false },
    { ...ok, frameUrl: null },
    { ...ok, frameUrl: "https://evil.example/" },
    { ...ok, frameUrl: "http://localhost:5184/" },
    { ...ok, frameUrl: "lydie-app://other/index.html" },
    { ...ok, frameUrl: "file:///Users/me/index.html" },
  ])("denies %j", (sender) => {
    expect(code(() => checkSender(sender, policy))).toBe("permission-denied");
  });
});

describe("checkExternalUrl", () => {
  it("allows only web and mail links", () => {
    expect(checkExternalUrl("https://example.com/a").hostname).toBe("example.com");
    expect(checkExternalUrl("mailto:hi@example.com").protocol).toBe("mailto:");
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "smb://host/share",
      "not a url",
      "lydie-app://web/",
    ]) {
      expect(code(() => checkExternalUrl(url))).toBe("invalid-argument");
    }
  });
});

describe("checkDownloadUrl", () => {
  const api = "https://api.lydie.co";
  it("allows the API's export link and backup content", () => {
    const exportLink = `${api}/v1/workspaces/01a1d739-c692-22f5-eb34-f86b647e6e9d/export.zip?expires=1&user=u&sig=s`;
    expect(checkDownloadUrl(exportLink, api).href).toBe(exportLink);
    expect(
      checkDownloadUrl(`${api}/v1/backups/01a1df86-127a-5582-bcdf-c151bda97a62/content?sig=s`, api)
        .pathname,
    ).toBe("/v1/backups/01a1df86-127a-5582-bcdf-c151bda97a62/content");
    expect(
      checkDownloadUrl("http://localhost:4100/v1/backups/b1/content", "http://localhost:4100").port,
    ).toBe("4100");
  });

  it("refuses other origins, paths and URLs", () => {
    for (const url of [
      "https://evil.example/v1/backups/b1/content",
      "http://api.lydie.co/v1/backups/b1/content",
      "https://api.lydie.co:8443/v1/backups/b1/content",
      "https://user:pw@api.lydie.co/v1/backups/b1/content",
      "https://api.lydie.co/v1/attachments/a1/content",
      "https://api.lydie.co/v1/workspaces/w1/export.zip/x",
      "https://api.lydie.co/v1/workspaces/../export.zip",
      "https://api.lydie.co/v1/workspaces/w%2F1/export.zip",
      "file:///etc/passwd",
    ]) {
      expect(code(() => checkDownloadUrl(url, api))).toBe("permission-denied");
    }
    expect(code(() => checkDownloadUrl("not a url", api))).toBe("invalid-argument");
  });
});
