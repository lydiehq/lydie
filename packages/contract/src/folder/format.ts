// The folder format's names and pure helpers (see `./plan.ts`). Kept apart from the planner, which
// loads `yaml`, so the main entry point can export them.
import type { BaseDefinition } from "../database/base.ts";
import type { DatabaseDefinition, PropertyInput, ViewInput } from "../database/entities.ts";
import { normalizeId, ULID_SOURCE, UUID_SOURCE } from "../ids.ts";

export const FOLDER_FORMAT_VERSION = 1;
export const DEFAULT_ATTACHMENTS_FOLDER = "attachments";
export const BASE_EXT = ".base";
export const META_DIR = ".lydie";

export type AttachmentRecord = {
  path: string;
  workspaceId: string;
  documentId: string | null;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

// The .base file's view of a database definition.
export function baseDefinitionOf(def: DatabaseDefinition): BaseDefinition {
  return {
    id: def.database.id,
    config: def.database.config,
    properties: def.properties.map(propertyInput),
    views: def.views.map(viewInput),
  };
}

function propertyInput({ id, name, type, key, config }: PropertyInput): PropertyInput {
  return { id, name, type, key, config };
}

function viewInput({ id, name, type, config }: ViewInput): ViewInput {
  return { id, name, type, config };
}

// The canonical .base file name of a database folder.
export function baseFileFor(folderKey: string): string {
  return `${folderKey.slice(folderKey.lastIndexOf("/") + 1)}${BASE_EXT}`;
}

// Hosted bodies can point at an attachment by id besides `![[file.png]]` by name:
// `attachment:<id>`, or the API's attachment URLs (`…/attachments/<id>/content?…`).
// A body written before ids were UUIDs spells the id as a ULID.
const ATTACHMENT_REF = new RegExp(
  `(?:^attachment:|/attachments/)(${UUID_SOURCE}|${ULID_SOURCE})(?:[/?#]|$)`,
);

export function attachmentIdIn(ref: string): string | null {
  const id = ATTACHMENT_REF.exec(ref)?.[1];
  return id ? normalizeId(id) : null;
}
