import type { AnyOperation } from "./define.ts";
import { activityList } from "./operations/activity.ts";
import {
  attachmentCreate,
  attachmentDelete,
  attachmentGet,
  attachmentList,
  attachmentPurge,
  attachmentRestore,
} from "./operations/attachment.ts";
import {
  databaseAddOption,
  databaseAddProperty,
  databaseChangePropertyType,
  databaseChangeSchema,
  databaseChangeViews,
  databaseCreate,
  databaseCreateRow,
  databaseCreateView,
  databaseDelete,
  databaseDeleteOption,
  databaseDeleteProperty,
  databaseDeleteRows,
  databaseDeleteView,
  databaseDuplicateRows,
  databaseDuplicateView,
  databaseGet,
  databaseList,
  databaseListTemplates,
  databaseMoveOption,
  databaseMoveProperty,
  databaseMoveRow,
  databaseMoveView,
  databaseQuery,
  databaseRenameProperty,
  databaseRenameView,
  databaseRestore,
  databaseRestoreProperty,
  databaseRestoreRows,
  databaseRestoreView,
  databaseSetDefinition,
  databaseSetValues,
  databaseUpdate,
  databaseUpdateOption,
  databaseUpdateProperty,
  databaseUpdateView,
  databaseWriteRows,
} from "./operations/database.ts";
import {
  docBacklinks,
  docBlockBacklinks,
  docCreate,
  docDelete,
  docGet,
  docGetVersion,
  docListChildren,
  docListTree,
  docListVersions,
  docMove,
  docOutgoingLinks,
  docPurge,
  docRename,
  docRestore,
  docRestoreVersion,
  docSearch,
  docSetProperties,
  docUnlinkedMentions,
  docUnresolvedLinks,
  docUpdateBody,
} from "./operations/doc.ts";
import {
  historyListBySession,
  historyListSessions,
  historyUndoSession,
} from "./operations/history.ts";
import { inboxCapture } from "./operations/inbox.ts";
import {
  threadCreate,
  threadDelete,
  threadEdit,
  threadList,
  threadReply,
  threadResolve,
  threadRestore,
  threadSetAnchor,
} from "./operations/thread.ts";
import { trashEmpty, trashList } from "./operations/trash.ts";
import { workspaceExport } from "./operations/workspace.ts";

export type Registry = Readonly<Record<string, AnyOperation>>;

export type RegistryOf<T extends readonly AnyOperation[]> = {
  readonly [O in T[number] as O["id"]]: O;
};

// Builds a registry keyed by operation id and rejects duplicate ids, REST routes, MCP names and
// CLI commands, so two definitions can never claim the same surface.
export function createRegistry<const T extends readonly AnyOperation[]>(
  ...operations: T
): RegistryOf<T> {
  const registry: Record<string, AnyOperation> = {};
  const seen = new Map<string, string>();
  const claim = (key: string, id: string) => {
    const owner = seen.get(key);
    if (owner) throw new Error(`${id} and ${owner} both claim ${key}`);
    seen.set(key, id);
  };
  for (const op of operations) {
    claim(`operation ${op.id}`, op.id);
    if (op.rest) claim(`REST ${op.rest.method} ${op.rest.path}`, op.id);
    if (op.mcp) claim(`MCP tool ${op.mcp.name}`, op.id);
    if (op.cli) claim(`CLI command ${op.cli.command.join(" ")}`, op.id);
    registry[op.id] = op;
  }
  return Object.freeze(registry) as RegistryOf<T>;
}

// Every operation and query the client and core know about. New operations are added here.
export const operations = createRegistry(
  docCreate,
  docRename,
  docMove,
  docDelete,
  docRestore,
  docPurge,
  docSetProperties,
  docUpdateBody,
  docGet,
  docListTree,
  docListChildren,
  docSearch,
  docBacklinks,
  docBlockBacklinks,
  docOutgoingLinks,
  docUnlinkedMentions,
  docUnresolvedLinks,
  docListVersions,
  docGetVersion,
  docRestoreVersion,
  trashList,
  trashEmpty,
  attachmentCreate,
  attachmentDelete,
  attachmentRestore,
  attachmentPurge,
  attachmentGet,
  attachmentList,
  threadCreate,
  threadReply,
  threadEdit,
  threadSetAnchor,
  threadResolve,
  threadDelete,
  threadRestore,
  threadList,
  historyListSessions,
  historyListBySession,
  historyUndoSession,
  activityList,
  databaseCreate,
  databaseUpdate,
  databaseDelete,
  databaseRestore,
  databaseSetDefinition,
  databaseGet,
  databaseListTemplates,
  databaseList,
  databaseQuery,
  databaseAddProperty,
  databaseRenameProperty,
  databaseUpdateProperty,
  databaseChangePropertyType,
  databaseMoveProperty,
  databaseDeleteProperty,
  databaseRestoreProperty,
  databaseAddOption,
  databaseUpdateOption,
  databaseMoveOption,
  databaseDeleteOption,
  databaseCreateView,
  databaseRenameView,
  databaseDuplicateView,
  databaseMoveView,
  databaseUpdateView,
  databaseDeleteView,
  databaseRestoreView,
  databaseCreateRow,
  databaseSetValues,
  databaseMoveRow,
  databaseDuplicateRows,
  databaseDeleteRows,
  databaseRestoreRows,
  databaseWriteRows,
  databaseChangeSchema,
  databaseChangeViews,
  workspaceExport,
  inboxCapture,
);

export type Operations = typeof operations;
export type OperationId = keyof Operations;
