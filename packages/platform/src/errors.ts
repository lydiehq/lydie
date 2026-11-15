export type PlatformErrorCode =
  | "not-found"
  | "exists"
  | "not-a-directory"
  | "is-a-directory"
  | "not-empty"
  | "conflict"
  | "invalid-path"
  | "outside-workspace"
  | "permission-denied"
  | "no-workspace"
  | "invalid-argument"
  | "unavailable"
  | "unknown";

const CODES: ReadonlySet<string> = new Set<PlatformErrorCode>([
  "not-found",
  "exists",
  "not-a-directory",
  "is-a-directory",
  "not-empty",
  "conflict",
  "invalid-path",
  "outside-workspace",
  "permission-denied",
  "no-workspace",
  "invalid-argument",
  "unavailable",
  "unknown",
]);

const PREFIX = /^\[lydie:([a-z-]+)\] /;

// Errors that cross a process boundary (Electron IPC, contextBridge, postMessage) lose their class
// and custom fields but keep `message`, so the code also travels as a message prefix and
// `toPlatformError` recovers it on the other side.
export class PlatformError extends Error {
  override readonly name = "PlatformError";
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string) {
    super(`[lydie:${code}] ${message}`);
    this.code = code;
  }

  // The message without the code prefix.
  get detail() {
    return this.message.replace(PREFIX, "");
  }
}

export function isPlatformError(error: unknown, code?: PlatformErrorCode): error is PlatformError {
  return error instanceof PlatformError && (code === undefined || error.code === code);
}

export function toPlatformError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  // Electron prefixes rejected invoke() messages with "Error invoking remote method '…': Error: ".
  const tagged = /\[lydie:([a-z-]+)\] ([\s\S]*)$/.exec(message);
  if (tagged?.[1] && CODES.has(tagged[1])) {
    return new PlatformError(tagged[1] as PlatformErrorCode, tagged[2] ?? "");
  }
  return new PlatformError("unknown", message);
}
