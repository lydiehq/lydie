import { describe, expect, it } from "bun:test";

import { decodeBootstrap, encodeBootstrap } from "./bootstrap.ts";
import type { WindowBootstrap } from "./bootstrap.ts";

describe("window bootstrap", () => {
  it("round-trips through a command-line switch", () => {
    const bootstrap = {
      windowId: "w",
      scope: { kind: "local", folder: { id: "/a b/ü", name: "ü", path: "/a b/ü" } },
      deepLinkScheme: null,
    } as unknown as WindowBootstrap;
    const arg = encodeBootstrap(bootstrap);
    expect(arg).not.toMatch(/\s/);
    expect(decodeBootstrap(["electron", "--type=renderer", arg])).toEqual(bootstrap);
    expect(() => decodeBootstrap([])).toThrow(/bootstrap missing/);
  });
});
