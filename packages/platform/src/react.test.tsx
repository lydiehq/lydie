import { describe, expect, it } from "bun:test";

import { renderToString } from "react-dom/server";

import { PlatformProvider, usePlatform } from "./react.tsx";
import { createTestPlatform } from "./testing.ts";

function Kind() {
  return <span>{usePlatform().capabilities.kind}</span>;
}

describe("PlatformProvider", () => {
  it("provides the platform to usePlatform", () => {
    const html = renderToString(
      <PlatformProvider platform={createTestPlatform()}>
        <Kind />
      </PlatformProvider>,
    );
    expect(html).toContain("web");
  });

  it("throws without a provider", () => {
    expect(() => renderToString(<Kind />)).toThrow(/PlatformProvider/);
  });
});
