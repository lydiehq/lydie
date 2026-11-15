import type { WorkspaceMemberRow } from "@lydie/contract";
import { useMemo } from "react";

import { useQuery, useWorkspace } from "../react.tsx";

// Workspace members by user id (empty in local mode, where the only person is "local").
export function useMembers(): Map<string, WorkspaceMemberRow> {
  const workspace = useWorkspace();
  const { data } = useQuery("workspace.members", { workspaceId: workspace.workspaceId });
  return useMemo(() => new Map(data.map((m) => [m.userId, m])), [data]);
}
