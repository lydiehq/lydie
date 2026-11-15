import { LydieError } from "@lydie/contract";
import type { Attachment, Operations } from "@lydie/contract";

import type { Blob } from "./ports.ts";
import type { ExecuteOptions, Runtime } from "./runtime.ts";

export type AddAttachmentInput = {
  workspaceId: string;
  documentId?: string | null;
  filename: string;
  contentType: string;
  data: Uint8Array;
};

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Stores the bytes under their SHA-256 (once, however many attachments share them), then runs
// attachment.create. Bytes written for an operation that then fails stay in the store; that is
// harmless (content-addressed) and the next identical upload reuses them.
export async function addAttachment(
  runtime: Runtime<Operations>,
  blob: Blob,
  input: AddAttachmentInput,
  options?: ExecuteOptions,
): Promise<Attachment> {
  if (input.data.byteLength === 0 && !input.filename) {
    throw new LydieError("invalid_input", "Empty attachment");
  }
  const sha256 = await sha256Hex(input.data);
  if (!(await blob.has?.(sha256))) await blob.put(sha256, input.data, input.contentType);
  return runtime.execute(
    "attachment.create",
    {
      workspaceId: input.workspaceId,
      documentId: input.documentId ?? null,
      filename: input.filename,
      contentType: input.contentType,
      size: input.data.byteLength,
      sha256,
    },
    options,
  );
}
