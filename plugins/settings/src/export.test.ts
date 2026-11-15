import { describe, expect, test } from "bun:test";

import { downloadProgress, savedName } from "./export.ts";

describe("savedName", () => {
  test("the file the person saved, not the suggested name", () => {
    expect(savedName("file:///Users/me/Desktop/My%20backup.zip", "Notes 2026-11-15.zip")).toBe(
      "My backup.zip",
    );
    expect(savedName("file:///", "Notes 2026-11-15.zip")).toBe("Notes 2026-11-15.zip");
    expect(savedName("not a url", "Notes 2026-11-15.zip")).toBe("Notes 2026-11-15.zip");
  });
});

describe("downloadProgress", () => {
  test("a percentage when the size is known, else the bytes so far", () => {
    expect(downloadProgress({ received: 512, total: 2048 })).toEqual({ percent: 25 });
    expect(downloadProgress({ received: 2048, total: 2048 })).toEqual({ percent: 100 });
    // A server that sends more than it said never shows more than 100%.
    expect(downloadProgress({ received: 4096, total: 2048 })).toEqual({ percent: 100 });
    expect(downloadProgress({ received: 4096, total: null })).toEqual({ received: 4096 });
  });
});
