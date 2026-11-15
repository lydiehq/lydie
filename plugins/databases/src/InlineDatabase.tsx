// A collection shown in another page: `![[Tasks.base]]` (first view) or `![[Tasks.base#Board]]`
// shows the live view with a compact toolbar, and "Open as page" opens the collection itself.
// Personal view changes made here belong to this embed. Events stay inside the embed so the
// editor around it does not treat keys, clipboard or drags as its own.
import { useApp, useQuery, useWorkspace } from "@lydie/plugin-api";
import { useDatabase } from "@lydie/plugin-api/databases";
import { Button, EmptyState } from "@lydie/plugin-api/ui";
import type { SyntheticEvent } from "react";

import { DatabaseScreen } from "./lazy.tsx";
import { ScreenSkeleton } from "./skeleton.tsx";

export function parseBaseTarget(target: string): { name: string; view: string | null } | null {
  const m = /^(.+?)\.base(?:#(.*))?$/i.exec(target.trim());
  if (!m) return null;
  const path = m[1]!.split("/");
  return { name: path.at(-1)!.trim(), view: m[2]?.trim() || null };
}

export function isBaseTarget(target: string): boolean {
  return parseBaseTarget(target) !== null;
}

const stop = (event: SyntheticEvent) => event.stopPropagation();

export function InlineDatabase({ target, sourceId }: { target: string; sourceId?: string | null }) {
  const app = useApp();
  const workspace = useWorkspace();
  const parsed = parseBaseTarget(target);
  const { data: databases, isLoading } = useQuery("database.list", {
    workspaceId: workspace.workspaceId,
  });
  const match = parsed
    ? databases.find((d) => d.title.toLowerCase() === parsed.name.toLowerCase())
    : undefined;
  const { definition } = useDatabase(match?.id ?? null);

  const keys = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    // Undo/redo are the app's here, not the editor's.
    const mod = event.metaKey || event.ctrlKey;
    const inField = (event.target as HTMLElement).closest("input, textarea, select");
    if (mod && !inField && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void app.runCommand(event.shiftKey ? "core.redo" : "core.undo");
    }
  };

  return (
    <div
      // `data-embed-bare`: the editor draws no box around it and gives it the page's whole width
      // from the text column on, like a table: the title and bar keep to the text column
      // (`data-embed-column`), the view runs on to the right when it is wider.
      className="w-full min-w-0"
      data-embed-bare=""
      data-testid="inline-database"
      data-target={target}
      onKeyDown={keys}
      onKeyUp={stop}
      onBeforeInput={stop}
      onInput={stop}
      onCopy={stop}
      onCut={stop}
      onPaste={stop}
      onMouseDown={stop}
      onDragStart={stop}
      onDragOver={stop}
      onDrop={stop}
    >
      {!parsed ? null : !match ? (
        isLoading ? (
          <ScreenSkeleton compact />
        ) : (
          <EmptyState title={`No collection named “${parsed.name}”`} className="py-6" />
        )
      ) : !definition ? (
        <ScreenSkeleton compact />
      ) : (
        <>
          <div className="group/embed flex items-center gap-2" data-embed-column="">
            <Button
              variant="ghost"
              size="md"
              onPress={(event) => app.openDoc(match.id, { mode: app.modeFor(event) })}
              className="-ml-1.5 px-1.5 text-base font-semibold text-gray-900"
            >
              {match.title}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onPress={(event) => app.openDoc(match.id, { mode: app.modeFor(event) })}
              className="ml-auto font-normal text-gray-400 hover:text-gray-800"
            >
              Open as page ↗
            </Button>
          </div>
          <div>
            <DatabaseScreen
              definition={definition}
              compact
              initialViewName={parsed.view}
              stateKey={`embed:${target}`}
              embedKey={`${sourceId ?? "none"}:${target}`}
            />
          </div>
        </>
      )}
    </div>
  );
}
