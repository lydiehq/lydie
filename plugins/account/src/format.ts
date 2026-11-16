import type { HostedApiError, RejectedChange } from "@lydie/plugin-api";

// What a piece of work failed with, or null when it did not. Instead of `try` in components: the
// React Compiler skips a component whose `try` has a `finally`, a `throw` or a condition in it.
export function failureOf(work: Promise<unknown>): Promise<{ error: unknown } | null> {
  return work.then(
    () => null,
    (error: unknown) => ({ error }),
  );
}

export function errorMessage(error: unknown): string {
  const e = error as HostedApiError | null;
  if (e?.kind === "network")
    return "Lydie cannot reach the server. Check your connection and try again.";
  if (e?.code === "rate_limited") return "Too many attempts. Wait a minute and try again.";
  return e instanceof Error ? e.message : String(error);
}

// Better Auth's messages for the common sign-in failures, in plain words.
export function authMessage(error: unknown, mode: "sign-in" | "sign-up"): string {
  const e = error as HostedApiError | null;
  const code = (e?.code ?? "").toUpperCase();
  if (code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password do not match.";
  if (code === "USER_ALREADY_EXISTS" || code.includes("ALREADY_EXISTS")) {
    return "There is already an account with this email. Sign in instead.";
  }
  if (code === "PASSWORD_TOO_SHORT") return "Use at least 8 characters for the password.";
  if (mode === "sign-in" && e?.status === 401) return "That email and password do not match.";
  return errorMessage(error);
}

// The error code of a password sign-in that also needs a code (AccountApi.signIn).
export const TWO_FACTOR_REQUIRED = "two_factor_required";

// Two-step verification failures (setting it up, or the code step of a sign-in), in plain words.
export function twoFactorMessage(error: unknown): string {
  const e = error as HostedApiError | null;
  const code = (e?.code ?? "").toUpperCase();
  if (code === "INVALID_PASSWORD") return "That password is not right.";
  if (code === "INVALID_CODE") return "That code is not right. Check the app and try again.";
  if (code === "INVALID_BACKUP_CODE") return "That backup code is not right, or was used already.";
  if (code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" || code === "TWO_FACTOR_EXPIRED") {
    return "This sign-in has expired. Sign in again.";
  }
  if (code === "INVALID_TWO_FACTOR_COOKIE") return "This sign-in has expired. Sign in again.";
  if (code === "ACCOUNT_TEMPORARILY_LOCKED") {
    return "Too many wrong codes. Wait 15 minutes and try again.";
  }
  return errorMessage(error);
}

// A provider sign-in that did not complete, in plain words; null when the user cancelled it.
export function providerMessage(errorOrCode: unknown): string | null {
  const code = (
    typeof errorOrCode === "string"
      ? errorOrCode
      : ((errorOrCode as HostedApiError | null)?.code ?? "")
  ).toLowerCase();
  if (code === "cancelled" || code === "superseded") return null;
  if (code === "unable_to_create_user") {
    return "Lydie could not create an account for this Google account. Try again later.";
  }
  if (code === "access_denied") return "Google sign-in was cancelled.";
  if (code.includes("account_not_linked")) {
    return "This Google account could not be linked to your Lydie account. Sign in with your password.";
  }
  if (code === "timeout") return "The sign-in in your browser took too long. Try again.";
  if (code === "unavailable") {
    const message = (errorOrCode as Error | null)?.message;
    return typeof errorOrCode !== "string" && message
      ? message
      : "Signing in with Google is not available right now.";
  }
  return "Signing in with Google did not work. Try again.";
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 45) return seconds <= 0 ? "just now" : "in a few seconds";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

const VERBS: Record<string, string> = {
  "doc.create": "create a page",
  "doc.rename": "rename a page",
  "doc.move": "move a page",
  "doc.delete": "delete a page",
  "doc.restore": "restore a page",
  "doc.purge": "delete a page permanently",
  "doc.updateBody": "save a page",
  "doc.setProperties": "change a page's properties",
};

// "Your rename of a page could not be saved: no edit access".
export function describeRejected(change: RejectedChange): string {
  const verb = VERBS[change.operation] ?? change.operation;
  const reason =
    change.reason.code === "forbidden" ? "you no longer have access" : change.reason.message;
  return `Could not ${verb}: ${reason}`;
}
