import { describe, expect, test } from "bun:test";

import { diff, diff3 } from "./diff";

function applyHunks(a: string[], b: string[], hunks: ReturnType<typeof diff>): string[] {
  const out: string[] = [];
  let pos = 0;
  for (const h of hunks) {
    out.push(...a.slice(pos, h.aStart), ...b.slice(h.bStart, h.bEnd));
    pos = h.aEnd;
  }
  return [...out, ...a.slice(pos)];
}

describe("diff", () => {
  test("random arrays: hunks transform a into b, and are minimal-ish", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let t = 0; t < 2000; t++) {
      const a = Array.from({ length: Math.floor(rand() * 20) }, () =>
        String(Math.floor(rand() * 4)),
      );
      const b = Array.from({ length: Math.floor(rand() * 20) }, () =>
        String(Math.floor(rand() * 4)),
      );
      const hunks = diff(a, b);
      expect(applyHunks(a, b, hunks)).toEqual(b);
      for (let i = 1; i < hunks.length; i++)
        expect(hunks[i]!.aStart).toBeGreaterThan(hunks[i - 1]!.aEnd - 1);
    }
  });

  test("many identical lines stay fast", () => {
    const a = Array.from({ length: 20000 }, (_, i) => (i % 2 ? "" : `line ${i}`));
    const b = [...a];
    b.splice(10000, 1, "changed");
    const t0 = performance.now();
    expect(diff(a, b)).toEqual([{ aStart: 10000, aEnd: 10001, bStart: 10000, bEnd: 10001 }]);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("diff3", () => {
  test("non-overlapping changes merge, overlapping ones conflict", () => {
    expect(diff3(["a", "b", "c"], ["A", "b", "c"], ["a", "b", "C"])).toEqual([
      { ok: ["A", "b", "C"] },
    ]);
    expect(diff3(["a"], ["x"], ["y"])).toEqual([{ conflict: { o: ["a"], a: ["x"], b: ["y"] } }]);
    expect(diff3(["a"], ["x"], ["x"])).toEqual([{ ok: ["x"] }]);
    expect(diff3(["a", "b"], ["a", "b", "x"], ["a", "b", "y"])).toEqual([
      { ok: ["a", "b"] },
      { conflict: { o: [], a: ["x"], b: ["y"] } },
    ]);
  });
});
