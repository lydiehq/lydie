import { afterEach, expect, spyOn, test } from "bun:test";

import type { PluginContext, PluginDef } from "@lydie/plugin-api";

import { lazyPlugin } from "./lazy-plugin.ts";

let warn: { mockRestore(): void } | null = null;
afterEach(() => {
  warn?.mockRestore();
  warn = null;
});

function context() {
  const failures: unknown[] = [];
  const ctx = { fail: (error: unknown) => void failures.push(error) } as unknown as PluginContext;
  return { ctx, failures };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a load that fails is the plugin's failure", async () => {
  const { ctx, failures } = context();
  const plugin = lazyPlugin({ id: "late", name: "Late" }, () =>
    Promise.reject(new Error("Chunk missing")),
  );
  plugin.activate(ctx);
  await tick();
  expect(failures).toEqual([new Error("Chunk missing")]);
});

test("an activate that throws once loaded is the plugin's failure", async () => {
  const { ctx, failures } = context();
  const loaded: PluginDef = {
    id: "late",
    name: "Late",
    activate() {
      throw new Error("Bad start");
    },
  };
  const plugin = lazyPlugin({ id: "late", name: "Late" }, async () => loaded);
  plugin.activate(ctx);
  await tick();
  expect(failures).toEqual([new Error("Bad start")]);
});

test("permissions that differ from the entry's are pointed out", async () => {
  const spy = spyOn(console, "warn").mockImplementation(() => {});
  warn = spy;
  const { ctx } = context();
  const loaded: PluginDef = { id: "late", name: "Late", permissions: ["account"], activate() {} };
  const plugin = lazyPlugin({ id: "late", name: "Late" }, async () => loaded);
  expect(plugin.permissions).toBeUndefined();
  plugin.activate(ctx);
  await tick();
  expect(spy.mock.calls[0]?.[0]).toContain("declares permissions [account]");
});
