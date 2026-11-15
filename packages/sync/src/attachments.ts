import type { Store } from "@lydie/store";

import { isApiError } from "./http.ts";
import type { ApiClient } from "./http.ts";
import { createObservable, jsonEqual } from "./types.ts";
import type { BlobPort, FetchLike, Observable } from "./types.ts";

export type UploadTarget = { method: "PUT"; url: string; headers: Record<string, string> };

// Sends bytes to a signed URL, reporting progress. The default uses XMLHttpRequest where it exists
// (browsers report upload progress only there) and fetch elsewhere.
export type PutTransport = (
  target: UploadTarget,
  data: Uint8Array,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) => Promise<void>;

export type AttachmentProgress = Readonly<Record<string, { loaded: number; total: number }>>;

type AttachmentRow = {
  id: string;
  workspaceId: string;
  documentId: string | null;
  contentType: string;
  size: number;
  sha256: string;
};

// Errors that will not go away by retrying are stored with this prefix and skipped by the queue.
const PERMANENT = "rejected: ";

export type AttachmentSyncOptions = {
  api: ApiClient;
  store: Pick<Store, "uploads" | "ports">;
  // Where the bytes are on this device (the runtime's blob port).
  blob: BlobPort;
  put?: PutTransport;
  fetch?: FetchLike;
};

export type AttachmentSync = {
  // Bytes being sent right now, by attachment id.
  readonly progress: Observable<AttachmentProgress>;
  // Uploads every attachment whose bytes have not reached the server, oldest first. Resumes after
  // a restart: the state lives in the store's `attachment_uploads` table. Throws ApiError on
  // network/server/auth errors (the rest of the queue waits for the next run).
  run(signal?: AbortSignal): Promise<{ uploaded: number; waiting: number; failed: number }>;
  // A URL for `<img src>`: a signed download URL (valid an hour), cached until shortly before it
  // expires.
  downloadUrl(id: string): Promise<string>;
  // Fetches the bytes into the local blob store (offline access); verifies the SHA-256.
  download(id: string): Promise<Uint8Array>;
};

export function createAttachmentSync(options: AttachmentSyncOptions): AttachmentSync {
  const progress = createObservable<AttachmentProgress>({}, jsonEqual);
  const put = options.put ?? defaultPut(options.fetch);
  const urls = new Map<string, { url: string; expiresAt: number }>();

  const setProgress = (id: string, value: { loaded: number; total: number } | null) => {
    const next = { ...progress.get() };
    if (value) next[id] = value;
    else delete next[id];
    progress.set(next);
  };

  async function rowOf(id: string): Promise<AttachmentRow | null> {
    return options.store.ports.db.read(async (tx) => {
      const row = await tx.attachments?.get(id);
      return row ?? null;
    });
  }

  async function uploadOne(id: string, signal?: AbortSignal): Promise<"uploaded" | "waiting"> {
    const row = await rowOf(id);
    if (!row) {
      // Purged before its bytes were sent: nothing left to upload.
      await options.store.uploads.set(id, "uploaded");
      return "uploaded";
    }
    const data = await options.blob.get(row.sha256);
    if (!data) {
      await options.store.uploads.set(id, "failed", `${PERMANENT}the file is not on this device`);
      return "waiting";
    }
    await options.store.uploads.set(id, "uploading");
    let prepared: { upload: UploadTarget | null };
    try {
      prepared = await options.api.post("/v1/attachments/uploads", {
        workspaceId: row.workspaceId,
        documentId: row.documentId,
        contentType: row.contentType,
        size: row.size,
        sha256: row.sha256,
      });
    } catch (error) {
      if (isApiError(error) && error.kind === "client") {
        if (error.code === "not_found") {
          // The document has not reached the server yet (its operation is still queued).
          await options.store.uploads.set(id, "local");
          return "waiting";
        }
        await options.store.uploads.set(id, "failed", `${PERMANENT}${error.message}`);
        return "waiting";
      }
      await options.store.uploads.set(id, "failed", String((error as Error).message ?? error));
      throw error;
    }
    if (prepared.upload) {
      setProgress(id, { loaded: 0, total: data.byteLength });
      try {
        await put(
          prepared.upload,
          data,
          (loaded, total) => setProgress(id, { loaded, total }),
          signal,
        );
      } catch (error) {
        await options.store.uploads.set(id, "failed", String((error as Error).message ?? error));
        throw error;
      } finally {
        setProgress(id, null);
      }
    }
    await options.store.uploads.set(id, "uploaded");
    return "uploaded";
  }

  return {
    progress,
    async run(signal) {
      const pending = (await options.store.uploads.list()).filter(
        (u) => u.state !== "uploaded" && !(u.state === "failed" && u.error?.startsWith(PERMANENT)),
      );
      const result = { uploaded: 0, waiting: 0, failed: 0 };
      for (const upload of pending) {
        signal?.throwIfAborted();
        const outcome = await uploadOne(upload.id, signal);
        result[outcome]++;
      }
      result.failed = (await options.store.uploads.list({ state: "failed" })).length;
      return result;
    },
    async downloadUrl(id) {
      const cached = urls.get(id);
      if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.url;
      const { url, expiresAt } = await options.api.get<{ url: string; expiresAt: string }>(
        `/v1/attachments/${encodeURIComponent(id)}/download-url`,
      );
      urls.set(id, { url, expiresAt: Date.parse(expiresAt) });
      return url;
    },
    async download(id) {
      const row = await rowOf(id);
      const url = await this.downloadUrl(id);
      const response = await (options.fetch ?? fetch)(url);
      if (!response.ok) throw new Error(`Download of ${id} failed: ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (row) {
        if ((await sha256Hex(data)) !== row.sha256) throw new Error(`Download of ${id} is corrupt`);
        await options.blob.put(row.sha256, data, row.contentType);
      }
      return data;
    },
  };
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultPut(fetchImpl?: FetchLike): PutTransport {
  return async (target, data, onProgress, signal) => {
    if (typeof XMLHttpRequest !== "undefined" && !fetchImpl) {
      await xhrPut(target, data, onProgress, signal);
      return;
    }
    const response = await (fetchImpl ?? fetch)(target.url, {
      method: target.method,
      headers: target.headers,
      body: data as Uint8Array<ArrayBuffer>,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${await response.text().catch(() => "")}`);
    }
    onProgress(data.byteLength, data.byteLength);
  };
}

function xhrPut(
  target: UploadTarget,
  data: Uint8Array,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total || data.byteLength);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(data as Uint8Array<ArrayBuffer>);
  });
}
