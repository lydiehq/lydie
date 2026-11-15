import type { AppApi } from "@lydie/plugin-api";
import type { DatabaseSummaryRow } from "@lydie/plugin-api/databases";

// The collections of the workspace by id, kept current for the document menu and commands (whose
// `when` is synchronous).
export function watchDatabases(app: AppApi): {
  get: (id: string | null) => DatabaseSummaryRow | undefined;
  stop: () => void;
} {
  const handle = app.backend.live("database.list", { workspaceId: app.workspace.workspaceId });
  let byId = new Map<string, DatabaseSummaryRow>();
  const sync = () => {
    byId = new Map(handle.getSnapshot().data.map((d) => [d.id, d]));
  };
  const off = handle.subscribe(sync);
  sync();
  return {
    get: (id) => (id ? byId.get(id) : undefined),
    stop: off,
  };
}
