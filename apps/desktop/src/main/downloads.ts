// Hosted exports and backups saved from a window (`downloads:save`, LYD-380): the main process
// asks where, then Chromium downloads the signed link straight into that file. The session blocks
// every other download (security.ts); `claim` says which `will-download` items are these.
// Electron-free, so it is unit-tested; handlers.ts passes Electron's DownloadItem.
import { basename } from "node:path";

import { PlatformError } from "@lydie/platform";
import type { DownloadProgress, DownloadResult } from "@lydie/platform";

// The parts of Electron's DownloadItem used here.
export type DownloadItemLike = {
  getURLChain(): string[];
  setSavePath(path: string): void;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  cancel(): void;
  on(
    event: "updated",
    listener: (event: unknown, state: "progressing" | "interrupted") => void,
  ): unknown;
  once(
    event: "done",
    listener: (event: unknown, state: "completed" | "cancelled" | "interrupted") => void,
  ): unknown;
};

export type ExpectedDownload = {
  // The WebContents that will start it (`webContents.downloadURL`).
  contentsId: number;
  url: string;
  // Where it goes: the file picked in the save dialog.
  path: string;
  onProgress: (progress: DownloadProgress) => void;
};

type Pending = ExpectedDownload & {
  timer: ReturnType<typeof setTimeout>;
  settle: (result: DownloadResult | Error) => void;
};

// A download that never reaches `will-download` (the request failed before a response) would
// leave its button busy for good.
const START_TIMEOUT_MS = 60_000;

export class DownloadTracker {
  private pending: Pending[] = [];

  constructor(
    // Whether a URL in the item's redirect chain may be downloaded (`checkDownloadUrl`).
    private readonly allowed: (url: string) => boolean,
    private readonly startTimeoutMs = START_TIMEOUT_MS,
  ) {}

  // Runs `start` (which makes the WebContents download `expected.url`) and resolves when that
  // download is saved, cancelled or failed.
  expect(expected: ExpectedDownload, start: () => void): Promise<DownloadResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const entry: Pending = {
        ...expected,
        url: normalise(expected.url) ?? expected.url,
        timer: setTimeout(() => {
          this.drop(entry);
          entry.settle(new PlatformError("unavailable", "The download did not start"));
        }, this.startTimeoutMs),
        settle: (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(entry.timer);
          if (result instanceof Error) reject(result);
          else resolve(result);
        },
      };
      this.pending.push(entry);
      try {
        start();
      } catch (error) {
        this.drop(entry);
        entry.settle(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // From the session's `will-download`: true when `item` is a download `expect` waits for (it is
  // then saved to the picked file); false for any other, which the caller must cancel.
  claim(item: DownloadItemLike, contentsId: number | null): boolean {
    const chain = item.getURLChain();
    const first = chain[0] === undefined ? null : normalise(chain[0]);
    const entry = this.pending.find((p) => p.contentsId === contentsId && p.url === first);
    if (!entry) return false;
    this.drop(entry);
    clearTimeout(entry.timer);
    if (!chain.every((url) => this.allowed(url))) {
      entry.settle(new PlatformError("permission-denied", "The download was redirected elsewhere"));
      return false;
    }
    item.setSavePath(entry.path);
    item.on("updated", (_event, state) => {
      if (state === "progressing") {
        entry.onProgress({
          received: item.getReceivedBytes(),
          total: item.getTotalBytes() || null,
        });
        return;
      }
      // A zip made as it is sent cannot be resumed: give up rather than wait.
      entry.settle(new PlatformError("unavailable", "The download was interrupted"));
      item.cancel();
    });
    item.once("done", (_event, state) => {
      if (state === "completed") entry.settle({ status: "saved", name: basename(entry.path) });
      else if (state === "cancelled") entry.settle({ status: "cancelled" });
      else entry.settle(new PlatformError("unavailable", "The download failed"));
    });
    return true;
  }

  private drop(entry: Pending) {
    this.pending = this.pending.filter((p) => p !== entry);
  }
}

function normalise(url: string): string | null {
  return URL.canParse(url) ? new URL(url).href : null;
}

// oxlint-disable-next-line no-control-regex
const NOT_IN_A_NAME = /[\\/:\u0000-\u001f]/g;

// The suggested name as one file name: the page cannot point the dialog at another folder.
export function downloadName(filename: string): string {
  const safe = filename.replace(NOT_IN_A_NAME, "-").replace(/^\.+/, "").trim();
  return safe || "download";
}
