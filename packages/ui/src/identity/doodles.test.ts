import { describe, expect, it } from "bun:test";

import { doodleIcon, doodleMarkup, doodlePaths, DOODLES, parseDoodleIcon } from "./doodles";

describe("doodles", () => {
  it("has 64, each with its own id and something drawn inside the box", () => {
    expect(DOODLES).toHaveLength(64);
    expect(new Set(DOODLES.map((d) => d.id)).size).toBe(64);
    for (const doodle of DOODLES) {
      const points = doodle.strokes().flat();
      expect(points.length).toBeGreaterThan(1);
      for (const [x, y] of points) {
        expect(Math.min(x, y)).toBeGreaterThanOrEqual(15);
        expect(Math.max(x, y)).toBeLessThanOrEqual(85);
      }
      expect(doodlePaths(doodle).paths.every((d) => d.startsWith("M"))).toBe(true);
    }
  });

  it("is kept as text: its id, and its colour unless gray", () => {
    expect(doodleIcon("star")).toBe("doodle:star");
    expect(doodleIcon("star", "blue")).toBe("doodle:star:blue");
    expect(parseDoodleIcon("doodle:star:blue")).toMatchObject({
      doodle: { id: "star" },
      color: "blue",
    });
    expect(parseDoodleIcon("doodle:star")?.color).toBe("gray");
    // A colour we do not have falls back to gray.
    expect(parseDoodleIcon("doodle:star:teal")?.color).toBe("gray");
  });

  it("leaves emoji and unknown doodles alone", () => {
    for (const icon of ["🚀", "star", "doodle:", "doodle:nope", "", null, undefined])
      expect(parseDoodleIcon(icon)).toBeNull();
  });

  it("draws as markup in the text colour", () => {
    const markup = doodleMarkup(DOODLES[0]!);
    expect(markup).toStartWith("<svg");
    expect(markup).toContain('stroke="currentColor"');
  });
});
