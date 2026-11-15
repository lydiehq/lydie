import { describe, expect, test } from "bun:test";

import { hasUnseen, markSeen, SEEN_KEY } from "./seen.ts";
import type { ChangelogEntry } from "./types.ts";

const entry = (date: string): ChangelogEntry => ({ id: date, date, title: date, summary: "" });
const entries = [entry("2026-11-20"), entry("2026-11-15")];

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    set: (key: string, value: unknown) => void values.set(key, value),
  };
}

describe("hasUnseen", () => {
  test("is true before anything was seen", () => {
    expect(hasUnseen(entries, null)).toBe(true);
  });

  test("is true when a newer entry came out", () => {
    expect(hasUnseen(entries, "2026-11-15")).toBe(true);
  });

  test("is false once the newest was seen", () => {
    expect(hasUnseen(entries, "2026-11-20")).toBe(false);
  });

  test("is false without entries", () => {
    expect(hasUnseen([], null)).toBe(false);
  });
});

describe("markSeen", () => {
  test("stores the newest entry's date", () => {
    const storage = memoryStorage();
    markSeen(storage, entries);
    expect(storage.get<string>(SEEN_KEY)).toBe("2026-11-20");
  });

  test("leaves a later date alone", () => {
    const storage = memoryStorage({ [SEEN_KEY]: "2026-12-01" });
    markSeen(storage, entries);
    expect(storage.get<string>(SEEN_KEY)).toBe("2026-12-01");
  });
});
