import { z } from "zod";

import { Actor, Timestamp, Uuid, WorkspaceId } from "./entities.ts";
import { EVENT_TYPES } from "./events.ts";
import type { EventType } from "./events.ts";

// The workspace activity log: what people, agents and file sync did, for people to read. Unlike the
// history journal (exact, one row per operation, for undo) it is coalesced when written: a burst of
// the same change to the same thing by the same actor and session is one row with a count.

// Changes to the workspace itself rather than its content: members, teamspaces, sharing, tokens
// and connected apps, publishing, backups. A hosted workspace records them where they happen.
// They are not events (nothing emits them), so they never reach a peer or a webhook.
export const WORKSPACE_ACTIVITY_TYPES = [
  "workspace.created",
  "workspace.renamed",
  "workspace.imageChanged",
  "workspace.ownershipTransferred",
  "member.invited",
  "invitation.revoked",
  "invitation.declined",
  "member.joined",
  "member.roleChanged",
  "member.removed",
  "member.left",
  "teamspace.created",
  "teamspace.renamed",
  "teamspace.changed",
  "teamspace.visibilityChanged",
  "teamspace.deleted",
  "teamspace.restored",
  "teamspace.memberAdded",
  "teamspace.memberRemoved",
  "teamspace.memberRoleChanged",
  "share.granted",
  "share.changed",
  "share.revoked",
  "share.restrictionChanged",
  "shareLink.created",
  "shareLink.changed",
  "shareLink.revoked",
  "apiToken.created",
  "apiToken.revoked",
  "oauthGrant.created",
  "oauthGrant.revoked",
  "connection.added",
  "connection.changed",
  "connection.removed",
  "publication.created",
  "publication.changed",
  "publication.removed",
  "publication.published",
  "publication.unpublished",
  "publication.failed",
  "backup.frequencyChanged",
] as const;
export type WorkspaceActivityType = (typeof WORKSPACE_ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPES: readonly [
  EventType | WorkspaceActivityType,
  ...(EventType | WorkspaceActivityType)[],
] = [...(EVENT_TYPES as [EventType, ...EventType[]]), ...WORKSPACE_ACTIVITY_TYPES];

export const ActivityType = z.enum(ACTIVITY_TYPES).meta({
  id: "ActivityType",
  description:
    "What an activity row stands for: an event type, or a change to the workspace itself " +
    "(members, teamspaces, sharing, tokens, publishing).",
});
export type ActivityType = z.infer<typeof ActivityType>;

const WORKSPACE_ACTIVITY = new Set<string>(WORKSPACE_ACTIVITY_TYPES);
export const isWorkspaceActivityType = (type: string): type is WorkspaceActivityType =>
  WORKSPACE_ACTIVITY.has(type);

// What a row is about when that is not (only) its target: a person, an invitation, a teamspace,
// a token. Names as they were at the time; never a secret.
export const ActivitySubject = z
  .object({
    kind: z.enum([
      "user",
      "invitation",
      "workspace",
      "teamspace",
      "token",
      "app",
      "connection",
      "publication",
      "shareLink",
    ]),
    id: z.string().min(1),
    name: z
      .string()
      .nullable()
      .describe("A person's name, an invitation's email, a token's or connection's name."),
  })
  .meta({ id: "ActivitySubject" });
export type ActivitySubject = z.infer<typeof ActivitySubject>;

const Role = z.enum(["owner", "admin", "member", "guest"]);
const Level = z.enum(["view", "comment", "edit", "full"]);
const Visibility = z.enum(["open", "closed", "private"]);

// Small facts about the change. Never bodies, property values, operation inputs or secrets.
export const ActivityData = z
  .object({
    subject: ActivitySubject.optional().describe(
      "Workspace changes: what the row is about (the person, teamspace, token…).",
    ),
    teamspace: z
      .object({ id: z.string().min(1), name: z.string().nullable() })
      .nullable()
      .optional()
      .describe(
        "teamspace.member*: the teamspace; doc.moved to another space: that space (null: Private).",
      ),
    previousName: z
      .string()
      .optional()
      .describe("workspace.renamed, teamspace.renamed: the name before the first rename."),
    slug: z.string().optional().describe("workspace.renamed: the new address, when it changed."),
    role: Role.optional().describe(
      "member.*: the role (teamspace.member*: owner or member in the teamspace).",
    ),
    previousRole: Role.optional().describe("*.roleChanged: the role before the first change."),
    level: Level.optional().describe("share.*, member.invited to a page: the access level."),
    previousLevel: Level.optional().describe("share.changed: the level before the first change."),
    visibility: Visibility.optional().describe("teamspace.created, .visibilityChanged."),
    previousVisibility: Visibility.optional().describe(
      "teamspace.visibilityChanged: the visibility before the first change.",
    ),
    restricted: z.boolean().optional().describe("share.restrictionChanged: restricted now."),
    service: z
      .string()
      .optional()
      .describe("connection.*, publication.*: the service (WordPress, GitHub…)."),
    scopes: z.array(z.string()).optional().describe("apiToken.created, oauthGrant.created."),
    frequency: z.enum(["off", "daily", "weekly"]).optional().describe("backup.frequencyChanged."),
    failed: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("publication.published, .failed: documents that could not be published."),
    title: z.string().optional().describe("doc.renamed: the latest title."),
    previousTitle: z
      .string()
      .optional()
      .describe("doc.renamed: the title before the first rename."),
    parentId: Uuid.nullable()
      .optional()
      .describe("doc.created, doc.moved (latest): the parent; attachment.created: the document."),
    previousParentId: Uuid.nullable()
      .optional()
      .describe("doc.moved: the parent before the first move."),
    keys: z
      .array(z.string())
      .optional()
      .describe("doc.propertiesChanged: the property keys that changed (capped)."),
    change: z
      .enum(["database", "properties", "views", "options"])
      .optional()
      .describe("database.changed: what changed last."),
    count: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "doc.deleted, doc.restored, doc.purged: documents affected (subtree included); " +
          "publication.published, .unpublished: documents published or taken down.",
      ),
  })
  .meta({ id: "ActivityData" });
export type ActivityData = z.infer<typeof ActivityData>;

export const Activity = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    actor: Actor,
    sessionId: z.string().nullable().describe("The agent session (one run of work)."),
    type: ActivityType,
    targetId: Uuid.nullable().describe(
      "The document, attachment or database the change is about; null for a change to the " +
        "workspace itself (a member, a teamspace, a token), described by `data.subject`.",
    ),
    targetTitle: z
      .string()
      .nullable()
      .describe("Its title (an attachment's filename) at the time of the latest change."),
    data: ActivityData,
    count: z.number().int().min(1).describe("How many changes this row stands for."),
    firstAt: Timestamp,
    lastAt: Timestamp,
  })
  .meta({ id: "Activity" });
export type Activity = z.infer<typeof Activity>;
