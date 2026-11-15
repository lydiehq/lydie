import { describe, expect, it } from "bun:test";

import { toPlatformError } from "@lydie/platform";
import type { DownloadProgress } from "@lydie/platform";

import { downloadName, DownloadTracker } from "./downloads.ts";
import type { DownloadItemLike } from "./downloads.ts";

const API = "http://localhost:4100";
const LINK = `${API}/v1/workspaces/w1/export.zip?expires=1&user=u&sig=s`;

function fakeItem(chain: string[], total = 0) {
  const listeners = new Map<string, (event: unknown, state: string) => void>();
  const item = {
    savePath: null as string | null,
    received: 0,
    cancelled: false,
    getURLChain: () => chain,
    setSavePath(path: string) {
      item.savePath = path;
    },
    getReceivedBytes: () => item.received,
    getTotalBytes: () => total,
    cancel() {
      item.cancelled = true;
    },
    on(event: string, listener: (event: unknown, state: string) => void) {
      listeners.set(event, listener);
    },
    once(event: string, listener: (event: unknown, state: string) => void) {
      listeners.set(event, listener);
    },
    emit(event: "updated" | "done", state: string) {
      listeners.get(event)?.({}, state);
    },
  };
  return item as typeof item & DownloadItemLike;
}

function tracker(timeout?: number) {
  return new DownloadTracker((url) => url.startsWith(API), timeout);
}

describe("DownloadTracker", () => {
  it("saves the download it started to the picked file, with progress", async () => {
    const downloads = tracker();
    const progress: DownloadProgress[] = [];
    const item = fakeItem([LINK], 2048);
    const saved = downloads.expect(
      {
        contentsId: 1,
        url: LINK,
        path: "/Users/me/Downloads/Notes.zip",
        onProgress: (p) => progress.push(p),
      },
      () => expect(downloads.claim(item, 1)).toBe(true),
    );
    expect(item.savePath).toBe("/Users/me/Downloads/Notes.zip");
    item.received = 1024;
    item.emit("updated", "progressing");
    item.emit("done", "completed");
    expect(await saved).toEqual({ status: "saved", name: "Notes.zip" });
    expect(progress).toEqual([{ received: 1024, total: 2048 }]);
  });

  it("reports an unknown size as null", async () => {
    const downloads = tracker();
    const progress: DownloadProgress[] = [];
    const item = fakeItem([LINK]);
    const saved = downloads.expect(
      { contentsId: 1, url: LINK, path: "/tmp/a.zip", onProgress: (p) => progress.push(p) },
      () => downloads.claim(item, 1),
    );
    item.received = 10;
    item.emit("updated", "progressing");
    item.emit("done", "completed");
    await saved;
    expect(progress).toEqual([{ received: 10, total: null }]);
  });

  it("claims nothing it did not start", () => {
    const downloads = tracker();
    void downloads.expect(
      { contentsId: 1, url: LINK, path: "/tmp/a.zip", onProgress() {} },
      () => {},
    );
    // Another window, another URL, or a page's own download.
    expect(downloads.claim(fakeItem([LINK]), 2)).toBe(false);
    expect(downloads.claim(fakeItem([`${API}/v1/backups/b1/content`]), 1)).toBe(false);
    expect(downloads.claim(fakeItem(["https://example.com/a.zip"]), null)).toBe(false);
    // Each expected download is claimed once.
    expect(downloads.claim(fakeItem([LINK]), 1)).toBe(true);
    expect(downloads.claim(fakeItem([LINK]), 1)).toBe(false);
  });

  it("refuses a download redirected off the API", async () => {
    const downloads = tracker();
    const item = fakeItem([LINK, "https://example.com/x.zip"]);
    const claims: boolean[] = [];
    const saved = downloads.expect(
      { contentsId: 1, url: LINK, path: "/tmp/a.zip", onProgress() {} },
      () => claims.push(downloads.claim(item, 1)),
    );
    expect(toPlatformError(await saved.catch((e) => e)).code).toBe("permission-denied");
    expect(claims).toEqual([false]);
    expect(item.savePath).toBeNull();
  });

  it("fails when the download is interrupted, and cancels it", async () => {
    const downloads = tracker();
    const item = fakeItem([LINK]);
    const saved = downloads.expect(
      { contentsId: 1, url: LINK, path: "/tmp/a.zip", onProgress() {} },
      () => downloads.claim(item, 1),
    );
    item.emit("updated", "interrupted");
    item.emit("done", "cancelled");
    expect(toPlatformError(await saved.catch((e) => e)).code).toBe("unavailable");
    expect(item.cancelled).toBe(true);
  });

  it("resolves cancelled when the download is cancelled", async () => {
    const downloads = tracker();
    const item = fakeItem([LINK]);
    const saved = downloads.expect(
      { contentsId: 1, url: LINK, path: "/tmp/a.zip", onProgress() {} },
      () => downloads.claim(item, 1),
    );
    item.emit("done", "cancelled");
    expect(await saved).toEqual({ status: "cancelled" });
  });

  it("fails when the download never starts", async () => {
    const downloads = tracker(5);
    const saved = downloads.expect(
      { contentsId: 1, url: LINK, path: "/tmp/a.zip", onProgress() {} },
      () => {},
    );
    expect(toPlatformError(await saved.catch((e) => e)).code).toBe("unavailable");
    // Too late now.
    expect(downloads.claim(fakeItem([LINK]), 1)).toBe(false);
  });
});

describe("downloadName", () => {
  it("keeps the name to one file", () => {
    expect(downloadName("Notes 2026-11-15.zip")).toBe("Notes 2026-11-15.zip");
    expect(downloadName("../../etc/passwd")).toBe("-..-etc-passwd");
    expect(downloadName("a/b\\c:d.zip")).toBe("a-b-c-d.zip");
    expect(downloadName("..")).toBe("download");
  });
});
