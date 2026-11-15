import { describe, expect, it } from "bun:test";

import { isPlatformError, PlatformError, toPlatformError } from "./errors.ts";

describe("PlatformError", () => {
  it("survives a trip through a plain Error message", () => {
    const original = new PlatformError("outside-workspace", "nope");
    // What Electron's ipcRenderer.invoke rejects with when the handler throws.
    const wire = new Error(`Error invoking remote method 'fs:read': Error: ${original.message}`);
    const recovered = toPlatformError(wire);
    expect(isPlatformError(recovered, "outside-workspace")).toBe(true);
    expect(recovered.detail).toBe("nope");
  });

  it("wraps unknown errors", () => {
    expect(toPlatformError(new Error("boom")).code).toBe("unknown");
    expect(toPlatformError("text").code).toBe("unknown");
    expect(toPlatformError(new Error("[lydie:made-up] x")).code).toBe("unknown");
  });
});
