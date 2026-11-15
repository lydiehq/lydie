import { z } from "zod";

import { Timestamp, Uuid, WorkspaceId } from "./entities.ts";

// Rows of the hosted core's team and sharing tables as they sync to the client. In local mode
// these tables are empty.
// Named `…Row` because the core's operations have their own `Teamspace`, `DocumentGrant`, … shapes.

const Id = z.string().min(1).max(64);

export const ACCESS_LEVELS = ["view", "comment", "edit", "full"] as const;
export const AccessLevelValue = z.enum(ACCESS_LEVELS);
export type AccessLevelValue = z.infer<typeof AccessLevelValue>;

export const WorkspaceRow = z
  .object({
    id: WorkspaceId,
    name: z.string(),
    // An image URL or an SVG data: URL; null: the generated picture.
    image: z.string().nullable(),
  })
  .meta({ id: "WorkspaceRow" });
export type WorkspaceRow = z.infer<typeof WorkspaceRow>;

export const WorkspaceMemberRow = z
  .object({
    id: Id,
    workspaceId: WorkspaceId,
    userId: Id,
    role: z.enum(["owner", "admin", "member", "guest"]),
    userName: z.string().nullable(),
    userEmail: z.string().nullable(),
    userImage: z.string().nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp.nullable(),
  })
  .meta({ id: "WorkspaceMemberRow" });
export type WorkspaceMemberRow = z.infer<typeof WorkspaceMemberRow>;

export const TeamspaceRow = z
  .object({
    id: Id,
    workspaceId: WorkspaceId,
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    visibility: z.enum(["open", "closed", "private"]),
    isDefault: z.boolean(),
    createdBy: z.string().nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .meta({ id: "TeamspaceRow" });
export type TeamspaceRow = z.infer<typeof TeamspaceRow>;

export const TeamspaceMemberRow = z
  .object({
    id: Id,
    workspaceId: WorkspaceId,
    teamspaceId: Id,
    userId: Id,
    role: z.enum(["owner", "member"]),
    createdAt: Timestamp,
  })
  .meta({ id: "TeamspaceMemberRow" });
export type TeamspaceMemberRow = z.infer<typeof TeamspaceMemberRow>;

export const DocumentGrantRow = z
  .object({
    id: Id,
    workspaceId: WorkspaceId,
    documentId: Uuid,
    principalType: z.enum(["user", "teamspace", "workspace"]),
    principalId: z.string(),
    level: AccessLevelValue,
    scopeId: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp.nullable(),
  })
  .meta({ id: "DocumentGrantRow" });
export type DocumentGrantRow = z.infer<typeof DocumentGrantRow>;

// Where a document lives and what the signed-in user may do with it. `level` is null in local
// mode (no access rows: everything is the user's own) and when the user has no access.
export const DocumentAccess = z
  .object({
    documentId: Uuid,
    teamspaceId: z.string().nullable(),
    privateOwnerId: z.string().nullable(),
    restricted: z.boolean(),
    scopeId: z.string().nullable(),
    level: AccessLevelValue.nullable(),
  })
  .meta({ id: "DocumentAccess" });
export type DocumentAccess = z.infer<typeof DocumentAccess>;
