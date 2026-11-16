import { describe, expect, test } from "bun:test";

import { cacheName, isAppPage, isAsset, staleCaches } from "./sw-rules.ts";

const at = (path: string) => new URL(path, "https://app.lydie.co");

describe("service worker rules", () => {
  test("the previous build's cache stays until the next update, older ones go", () => {
    const [a, b, c] = ["a", "b", "c"].map(cacheName) as [string, string, string];
    expect(staleCaches([a], a)).toEqual([]);
    expect(staleCaches([a, b], b)).toEqual([]);
    expect(staleCaches([a, b, c], c)).toEqual([a]);
    // Caches that are not the worker's are left alone.
    expect(staleCaches(["other", a, b, c], c)).toEqual([a]);
  });

  test("the app's pages get index.html; files, the API and other paths do not", () => {
    const root = { base: "/", apiPrefix: null };
    for (const path of ["/", "/index.html", "/d/notes-0193a5e27c3b", "/w/acme/trash", "/invite"]) {
      expect([path, isAppPage(at(path), root)]).toEqual([path, true]);
    }
    for (const path of ["/sw.js", "/favicon.svg", "/assets/index-abc.js", "/export.zip"]) {
      expect([path, isAppPage(at(path), root)]).toEqual([path, false]);
    }
    const below = { base: "/app/", apiPrefix: "/__core/" };
    expect(isAppPage(at("/app"), below)).toBe(true);
    expect(isAppPage(at("/app/d/x"), below)).toBe(true);
    expect(isAppPage(at("/elsewhere"), below)).toBe(false);
    expect(isAppPage(at("/__core/v1/backups/1/content"), below)).toBe(false);
  });

  test("hashed files are the build's assets", () => {
    expect(isAsset(at("/assets/worker-abc.js"), "/")).toBe(true);
    expect(isAsset(at("/theme.js"), "/")).toBe(false);
    expect(isAsset(at("/app/assets/x.wasm"), "/app/")).toBe(true);
  });
});
