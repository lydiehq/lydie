import { describe, expect, test } from "bun:test";

import type { DownloadProgress } from "@lydie/platform";

import { createWebDownloads } from "./downloads.ts";
import type { WebDownloadsEnv } from "./downloads.ts";

const URL_ = "http://localhost:4100/v1/workspaces/w1/export.zip?sig=s";

function fakeFile(name = "Notes.zip") {
  const file = { written: [] as number[], closed: false, aborted: false };
  const handle = {
    name,
    async createWritable() {
      return new WritableStream<Uint8Array>({
        write(chunk) {
          file.written.push(...chunk);
        },
        close() {
          file.closed = true;
        },
        abort() {
          file.aborted = true;
        },
      });
    },
  } as unknown as FileSystemFileHandle;
  return { file, handle };
}

function body(chunks: number[][], fail = false) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      if (fail) controller.error(new Error("connection reset"));
      else controller.close();
    },
  });
}

function env(overrides: Partial<WebDownloadsEnv>) {
  const links: string[] = [];
  const base: WebDownloadsEnv = {
    fetch: async () => new Response(body([[1]])),
    link: (url) => links.push(url),
    ...overrides,
  };
  return { env: base, links };
}

describe("createWebDownloads", () => {
  test("streams the link into the picked file, with progress", async () => {
    const { file, handle } = fakeFile("My export.zip");
    const progress: DownloadProgress[] = [];
    const { env: e, links } = env({
      showSaveFilePicker: async (options) => {
        expect(options.suggestedName).toBe("Notes 2026-11-15.zip");
        return handle;
      },
      fetch: async (input, init) => {
        expect(input).toBe(URL_);
        expect(init.credentials).toBe("omit");
        return new Response(body([[1, 2], [3]]), { headers: { "content-length": "3" } });
      },
    });
    const result = await createWebDownloads(e).save({
      url: URL_,
      filename: "Notes 2026-11-15.zip",
      onProgress: (p) => progress.push(p),
    });
    expect(result).toEqual({ status: "saved", name: "My export.zip" });
    expect(file.written).toEqual([1, 2, 3]);
    expect(file.closed).toBe(true);
    expect(progress).toEqual([
      { received: 2, total: 3 },
      { received: 3, total: 3 },
    ]);
    expect(links).toEqual([]);
  });

  test("a streamed zip has no total", async () => {
    const { handle } = fakeFile();
    const progress: DownloadProgress[] = [];
    const { env: e } = env({
      showSaveFilePicker: async () => handle,
      fetch: async () => new Response(body([[1, 2, 3, 4]])),
    });
    await createWebDownloads(e).save({
      url: URL_,
      filename: "a.zip",
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual([{ received: 4, total: null }]);
  });

  test("closing the picker cancels", async () => {
    let fetched = false;
    const { env: e, links } = env({
      showSaveFilePicker: async () => {
        throw new DOMException("The user aborted a request.", "AbortError");
      },
      fetch: async () => {
        fetched = true;
        return new Response("");
      },
    });
    expect(await createWebDownloads(e).save({ url: URL_, filename: "a.zip" })).toEqual({
      status: "cancelled",
    });
    expect(fetched).toBe(false);
    expect(links).toEqual([]);
  });

  test("without the picker, or when it may not open, the browser downloads the link", async () => {
    const plain = env({});
    expect(await createWebDownloads(plain.env).save({ url: URL_, filename: "a.zip" })).toEqual({
      status: "started",
    });
    expect(plain.links).toEqual([URL_]);

    const lapsed = env({
      showSaveFilePicker: async () => {
        throw new DOMException("Must be handling a user gesture.", "SecurityError");
      },
    });
    expect(await createWebDownloads(lapsed.env).save({ url: URL_, filename: "a.zip" })).toEqual({
      status: "started",
    });
    expect(lapsed.links).toEqual([URL_]);
  });

  test("a refused link fails with the API's message and writes nothing", async () => {
    const { file, handle } = fakeFile();
    const { env: e } = env({
      showSaveFilePicker: async () => handle,
      fetch: async () =>
        Response.json(
          { error: { code: "forbidden", message: "Export link is invalid or expired" } },
          { status: 403 },
        ),
    });
    await expect(createWebDownloads(e).save({ url: URL_, filename: "a.zip" })).rejects.toThrow(
      "Export link is invalid or expired",
    );
    expect(file.written).toEqual([]);
  });

  test("a download cut short aborts the file", async () => {
    const { file, handle } = fakeFile();
    const { env: e } = env({
      showSaveFilePicker: async () => handle,
      fetch: async () => new Response(body([[1]], true)),
    });
    await expect(createWebDownloads(e).save({ url: URL_, filename: "a.zip" })).rejects.toThrow();
    expect(file.aborted).toBe(true);
    expect(file.closed).toBe(false);
  });
});
