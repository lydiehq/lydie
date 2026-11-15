import { afterEach, describe, expect, it } from "bun:test";

import { cleanup, render, screen } from "@testing-library/react";

import { EmptyState } from "../layout/States";
import * as illustrations from "./illustrations";
import * as views from "./views";

afterEach(() => cleanup());

describe("illustrations", () => {
  const drawings = [...Object.entries(illustrations), ...Object.entries(views)];

  it("exports every drawing", () => {
    expect(drawings.length).toBe(18);
  });

  for (const [name, Drawing] of drawings) {
    it(`${name} draws a hidden svg above the empty state's title`, () => {
      const { container } = render(
        <EmptyState title="Nothing here" illustration={<Drawing size="sm" />} />,
      );
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("class")).toContain("h-24");
      expect(svg?.getAttribute("viewBox")?.split(" ").map(Number).every(Number.isFinite)).toBe(
        true,
      );
      expect(screen.getByText("Nothing here")).toBeTruthy();
    });
  }
});
