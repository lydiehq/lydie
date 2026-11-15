import { z } from "zod";

export const ErrorCode = z.enum([
  "invalid_input",
  "not_found",
  "conflict",
  "forbidden",
  "unknown_operation",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// The `{error:{code,message,hint}}` envelope kept from v1 (plan §2). Every REST error and every
// rejected operation uses it.
export const ErrorEnvelope = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      hint: z.string().optional(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: "Error" });
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export class LydieError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, options?: { hint?: string; details?: unknown }) {
    super(message);
    this.name = "LydieError";
    this.code = code;
    this.hint = options?.hint;
    this.details = options?.details;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.hint === undefined ? {} : { hint: this.hint }),
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export function isLydieError(error: unknown): error is LydieError {
  return error instanceof LydieError;
}
