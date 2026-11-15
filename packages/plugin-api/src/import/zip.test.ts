import { describe, expect, test } from "bun:test";

import { zipSync } from "fflate";

import { openZip, ZipError } from "./zip.ts";

const text = (s: string) => new TextEncoder().encode(s);

describe("openZip", () => {
  test("lists entries and reads each on demand, stored or deflated", async () => {
    const inner = zipSync({ "inside.txt": text("deep") }, { level: 0 });
    const zip = zipSync(
      {
        "Export-1/Page.html": [text("<p>".repeat(500)), { level: 9 }],
        "Export-1/sub/": new Uint8Array(),
        "Export-1/ünïcode name.txt": [text("hello"), { level: 0 }],
        "Part-1.zip": [inner, { level: 0 }],
      },
      { mtime: new Date(2026, 10, 15, 12, 30) },
    );
    const entries = await openZip(new Blob([zip]));
    expect(entries.map((e) => e.path)).toEqual([
      "Export-1/Page.html",
      "Export-1/sub/",
      "Export-1/ünïcode name.txt",
      "Part-1.zip",
    ]);
    const [page, , named, part] = entries;
    expect(page!.size).toBe(1500);
    expect(await page!.text()).toBe("<p>".repeat(500));
    expect(await named!.text()).toBe("hello");
    expect(named!.modified?.getFullYear()).toBe(2026);
    // A stored zip inside is a slice, opened in turn.
    const nested = await openZip(await part!.blob());
    expect(await nested[0]!.text()).toBe("deep");
  });

  test("refuses what is not a zip", async () => {
    await expect(openZip(new Blob([text("not a zip at all")]))).rejects.toBeInstanceOf(ZipError);
  });
});
