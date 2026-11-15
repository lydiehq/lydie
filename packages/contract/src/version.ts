import { z } from "zod";

import { Actor, Timestamp, Uuid, WorkspaceId } from "./entities.ts";

// Head version of the public API (plan §2, "Versioning"). Sent as the `Lydie-Version` header.
// Bump only when a breaking change is queued, and add a matching entry to `versionChanges`.
export const LYDIE_VERSION = "2026-11-12";
export const LYDIE_VERSION_HEADER = "Lydie-Version";

// Stripe-style version change module: handlers only exist at head; each breaking change describes
// how to convert head responses and events back to the previous version.
export type VersionChange = {
  // The version that introduced the change. Clients pinned to an earlier version get the down-converted shape.
  version: string;
  description: string;
  // Operation ids whose responses this change touches.
  operations: readonly string[];
  downgradeResponse?: (operationId: string, body: unknown) => unknown;
  downgradeEvent?: (event: unknown) => unknown;
};

// Newest first. Empty until the first breaking change ships.
export const versionChanges: readonly VersionChange[] = [];

// One applied mutation as recorded in the local operation log and uploaded to the core.
// `input` is the resolved input: ids and sort keys minted on the client are pinned into it so the
// server replays the same operation and converges on the same state.
export const AppliedOperation = z
  .object({
    id: Uuid,
    operation: z.string(),
    input: z.unknown(),
    actor: Actor,
    // The agent session (MCP connection, CLI run) that applied it; null for direct UI use.
    sessionId: z.string().nullable().optional(),
    workspaceId: WorkspaceId.nullable(),
    createdAt: Timestamp,
    version: z.string(),
  })
  .meta({ id: "AppliedOperation" });
export type AppliedOperation = z.infer<typeof AppliedOperation>;
