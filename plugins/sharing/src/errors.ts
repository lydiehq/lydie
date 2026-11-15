import type { AccessLevel, HostedApiError } from "@lydie/plugin-api";

export function errorText(error: unknown): string {
  const e = error as HostedApiError | null;
  if (e?.kind === "network") return "Lydie cannot reach the server. Try again when you are online.";
  if (e?.code === "forbidden") return "You need full access to this page to do that.";
  return e instanceof Error ? e.message : String(error);
}

export const LEVELS: Record<AccessLevel, { label: string; help: string }> = {
  view: { label: "Can view", help: "Read only" },
  comment: { label: "Can comment", help: "Read and comment" },
  edit: { label: "Can edit", help: "Change the content" },
  full: { label: "Full access", help: "Edit, share, move and delete" },
};

const RANK: Record<AccessLevel, number> = { view: 0, comment: 1, edit: 2, full: 3 };

export const atLeast = (level: AccessLevel | null | undefined, wanted: AccessLevel) =>
  level !== null && level !== undefined && RANK[level] >= RANK[wanted];
