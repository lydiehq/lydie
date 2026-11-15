import { describe, expect, it } from "bun:test";

import { toPlatformError } from "@lydie/platform";

import { registerDiagnosticsService } from "./diagnostics-service.ts";
import { ServiceRegistry } from "./services.ts";

const caller = { windowId: "w1" };

async function code(run: () => unknown) {
  try {
    await run();
    return "ok";
  } catch (error) {
    return toPlatformError(error).code;
  }
}

describe("ServiceRegistry", () => {
  const registry = new ServiceRegistry();
  registerDiagnosticsService(registry);

  it("validates inputs before calling handlers", async () => {
    expect(await registry.request("diagnostics", "echo", { value: "hi" }, caller)).toMatchObject({
      value: "hi",
    });
    expect(await registry.request("diagnostics", "rows", { count: 3 }, caller)).toHaveLength(3);
    expect(await code(() => registry.request("diagnostics", "rows", { count: -1 }, caller))).toBe(
      "invalid-argument",
    );
    expect(await code(() => registry.request("diagnostics", "echo", {}, caller))).toBe(
      "invalid-argument",
    );
  });

  it("rejects unknown services, methods and prototype keys", async () => {
    expect(await code(() => registry.request("nope", "echo", {}, caller))).toBe("not-found");
    expect(await code(() => registry.request("diagnostics", "nope", {}, caller))).toBe("not-found");
    expect(await code(() => registry.request("diagnostics", "toString", {}, caller))).toBe(
      "not-found",
    );
    expect(
      await code(() => registry.subscribe("diagnostics", "constructor", {}, () => {}, caller)),
    ).toBe("not-found");
  });

  it("runs streams until unsubscribed", async () => {
    const events: number[] = [];
    const off = registry.subscribe(
      "diagnostics",
      "ticks",
      { intervalMs: 10 },
      (e) => events.push((e as { n: number }).n),
      caller,
    );
    await new Promise((resolve) => setTimeout(resolve, 55));
    off();
    const count = events.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(count).toBeGreaterThan(1);
    expect(events.length).toBe(count);
    expect(
      await code(() =>
        registry.subscribe("diagnostics", "ticks", { intervalMs: 1 }, () => {}, caller),
      ),
    ).toBe("invalid-argument");
  });

  it("refuses duplicate registration", () => {
    expect(() => registerDiagnosticsService(registry)).toThrow(/twice/);
  });
});
