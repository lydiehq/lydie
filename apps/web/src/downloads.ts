import type { DownloadOptions, DownloadResult, Downloads } from "@lydie/platform";

// `platform.downloads` in a browser (LYD-376). Where the File System Access API is (Chromium),
// the person picks the file and the zip is fetched and written to it as it arrives: nothing is
// held in memory and the app shows the progress. Elsewhere (Firefox, Safari) it is a plain link:
// fetching it ourselves would mean holding the whole zip as a Blob before it could be saved, so the
// browser downloads it and shows the progress in its own downloads.

type SaveFilePicker = (options: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

export type WebDownloadsEnv = {
  showSaveFilePicker?: SaveFilePicker | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  // The browser's own download of `url`.
  link(url: string, filename: string): void;
};

export function createWebDownloads(env: WebDownloadsEnv = browserEnv()): Downloads {
  return {
    async save(options: DownloadOptions): Promise<DownloadResult> {
      if (!env.showSaveFilePicker) return started(env, options);
      let handle: FileSystemFileHandle;
      try {
        handle = await env.showSaveFilePicker({
          suggestedName: options.filename,
          types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return { status: "cancelled" };
        }
        // The picker needs the click that started this, which can lapse while the link is
        // fetched (SecurityError): the browser's download still works.
        return started(env, options);
      }
      const response = await env.fetch(options.url, { credentials: "omit" });
      if (!response.ok || !response.body) throw new Error(await failure(response));
      const length = Number(response.headers.get("content-length"));
      const total = Number.isFinite(length) && length > 0 ? length : null;
      let received = 0;
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            options.onProgress?.({ received, total });
            controller.enqueue(chunk);
          },
        }),
      );
      // A failed pipe aborts the writable, which discards what was written: no half a zip.
      await counted.pipeTo(await handle.createWritable());
      return { status: "saved", name: handle.name };
    },
  };
}

function started(env: WebDownloadsEnv, options: DownloadOptions): DownloadResult {
  env.link(options.url, options.filename);
  return { status: "started" };
}

async function failure(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `The download failed (${response.status})`;
}

function browserEnv(): WebDownloadsEnv {
  const picker = (window as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return {
    showSaveFilePicker: picker?.bind(window),
    fetch: (url, init) => fetch(url, init),
    link(url, filename) {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
    },
  };
}
