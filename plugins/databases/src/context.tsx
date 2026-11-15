// What every part of a collection's screen needs: the definition, the effective view (the saved
// view with this device's personal overlay on top), the query params (with the search applied)
// and the actions that go through operations.
import { useApp, useBackend, useDeviceSetting, useOps, useQuery, useTab } from "@lydie/plugin-api";
import type { OpenGesture } from "@lydie/plugin-api";
import type {
  DatabaseDefinition,
  DatabaseView,
  DatabaseViewParams,
  GroupKey,
  PropertyValue,
  ViewConfig,
  ViewRow,
} from "@lydie/plugin-api/databases";
import { createContext, use, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { groupedValues, groupMoveValues, impliedValues } from "./implied.ts";
import {
  changesRows,
  isEmptyOverlay,
  mergeOverlay,
  overlayStorageKey,
  patchOverlay,
  pruneOverlay,
} from "./overlay.ts";
import type { ViewOverlay } from "./overlay.ts";
import { usePeek } from "./PageSheet.tsx";

export type CreateRowInput = {
  group?: GroupKey;
  subGroup?: GroupKey;
  values?: Record<string, PropertyValue>;
  afterId?: string;
  title?: string;
};

export type MoveRowInput = {
  row: ViewRow;
  beforeId?: string;
  afterId?: string;
  group?: GroupKey;
  fromGroup?: GroupKey;
  subGroup?: GroupKey;
  fromSubGroup?: GroupKey;
};

export type ViewContextValue = {
  definition: DatabaseDefinition;
  // The effective view: the saved one with this device's overlay on top.
  view: DatabaseView;
  databaseId: string;
  // The view's query without a window (overlay and search applied).
  params: DatabaseViewParams;
  // Inline in a document: shorter, fewer controls.
  compact: boolean;
  // A patch of the view's settings. Filter, sorts, grouping, columns, summaries, limit and layout
  // change this device's overlay (personal until saved); other keys are saved.
  updateView: (
    config: Partial<ViewConfig>,
    options?: { coalesce?: string; label?: string },
  ) => void;
  openRow: (id: string, gesture?: OpenGesture) => void;
  peekRow: (id: string) => void;
  // The page open in this collection's panel, and closing it.
  peekedId: string | null;
  closePeek: () => void;
  createRow: (input?: CreateRowInput) => Promise<string>;
  // A manual-order and/or group move that follows the effective grouping (one undo step).
  moveRow: (input: MoveRowInput, options?: { label?: string }) => Promise<void>;
  // The view as everyone sees it, and this device's changes over it.
  savedView: DatabaseView;
  overlay: ViewOverlay;
  edited: boolean;
  // One `database.updateView` (one undo step), then the overlay is cleared.
  saveView: () => Promise<void>;
  resetView: () => void;
  // Why the overlay cannot be saved for everyone (no edit access), or null.
  saveBlockedReason: string | null;
};

const Context = createContext<ViewContextValue | null>(null);

// A view setting edited faster than the view re-renders: the latest edit wins until the value
// shown changes.
export function useDraft<T>(saved: T): [T, (next: T) => void] {
  const [draft, setDraft] = useState<{ base: T; value: T } | null>(null);
  const value = draft && draft.base === saved ? draft.value : saved;
  return [value, (next: T) => setDraft({ base: saved, value: next })];
}

export function useViewContext(): ViewContextValue {
  const value = use(Context);
  if (!value) throw new Error("useViewContext needs a collection view above it");
  return value;
}

// This device's overlay on a saved view (per embed when `embed` is given) and the effective view.
export function useViewOverlay(saved: DatabaseView | undefined, embed: string | null) {
  const key = overlayStorageKey(saved?.id ?? "none", embed);
  const [stored] = useDeviceSetting<unknown>(key, null);
  const config = saved?.config;
  const overlay = useMemo(() => (config ? pruneOverlay(config, stored) : {}), [config, stored]);
  const view = useMemo(
    () =>
      saved && !isEmptyOverlay(overlay)
        ? { ...saved, config: mergeOverlay(saved.config, overlay) }
        : saved,
    [saved, overlay],
  );
  return { key, overlay, view };
}

export function ViewProvider({
  definition,
  savedView,
  view,
  overlay,
  overlayKey,
  params,
  compact,
  children,
}: {
  definition: DatabaseDefinition;
  savedView: DatabaseView;
  view: DatabaseView;
  overlay: ViewOverlay;
  overlayKey: string;
  params: DatabaseViewParams;
  compact: boolean;
  children: ReactNode;
}) {
  const app = useApp();
  const ops = useOps();
  const backend = useBackend();
  const tabId = useTab()?.id ?? null;
  const peek = usePeek();
  const databaseId = definition.database.id;
  // Hosted: view or comment access cannot save a view (local workspaces have no access rows).
  const level = useQuery("doc.access", { id: databaseId }).data[0]?.level ?? null;
  const saveBlockedReason =
    level === "view" || level === "comment"
      ? "You can view this collection but not change it for everyone"
      : null;
  // The saved config a "Save for everyone" was made on top of, until the new one arrives.
  const [savedFrom, setSavedFrom] = useState<ViewConfig | null>(null);
  useEffect(() => {
    if (!savedFrom || savedFrom === savedView.config) return;
    app.storage.set(overlayKey, null);
    setSavedFrom(null);
  }, [app, overlayKey, savedFrom, savedView.config]);
  const value = useMemo<ViewContextValue>(() => {
    const fail = (title: string) => (error: unknown) =>
      app.notify({
        title,
        description: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    // Read at call time: two patches in one frame both land.
    const currentOverlay = () => pruneOverlay(savedView.config, app.storage.get(overlayKey));
    const writeOverlay = (next: ViewOverlay) =>
      app.storage.set(overlayKey, isEmptyOverlay(next) ? null : next);
    const effective = view.config;
    return {
      definition,
      view,
      databaseId,
      params,
      compact,
      updateView: (config, options) => {
        const { overlay: next, shared } = patchOverlay(savedView.config, currentOverlay(), config);
        writeOverlay(next);
        if (Object.keys(shared).length > 0) {
          void ops.database
            .updateView(
              { id: savedView.id, config: shared },
              {
                ...(options?.coalesce ? { coalesce: options.coalesce } : {}),
                label: options?.label ?? "Change view",
              },
            )
            .catch(fail("Could not change the view"));
        }
      },
      openRow: (id, gesture) =>
        app.openDoc(id, { mode: gesture ? app.modeFor(gesture) : "replace" }),
      peekRow: (id) => (peek ? peek.open(id) : app.openDoc(id, { mode: "split" })),
      peekedId: peek?.docId ?? null,
      closePeek: () => peek?.close(),
      createRow: async (input = {}) => {
        const common = {
          databaseId,
          title: input.title ?? "Untitled",
          ...(input.afterId ? { afterId: input.afterId } : {}),
        };
        // A personal filter or grouping: the page gets what the effective view implies (the
        // operation would read the saved view's), so it does not vanish from what the user sees.
        if (changesRows(overlay)) {
          const values = impliedValues(effective.filter, definition.properties, params.me ?? null);
          groupedValues(
            definition.properties,
            [
              [effective.groupBy, input.group],
              [effective.subGroupBy, input.subGroup],
            ],
            values,
          );
          const row = await ops.database.createRow({
            ...common,
            values: { ...values, ...input.values },
          });
          return row.id;
        }
        const row = await ops.database.createRow({
          ...common,
          viewId: savedView.id,
          values: input.values ?? {},
          ...(input.group !== undefined ? { group: input.group } : {}),
          ...(input.subGroup !== undefined ? { subGroup: input.subGroup } : {}),
        });
        return row.id;
      },
      moveRow: async (input, options) => {
        const label = options?.label ?? "Move page";
        const order = input.beforeId
          ? { beforeId: input.beforeId }
          : input.afterId
            ? { afterId: input.afterId }
            : {};
        const regroups = input.group !== undefined || input.subGroup !== undefined;
        if (!regroups || !("groupBy" in overlay || "subGroupBy" in overlay)) {
          await ops.database.moveRow(
            {
              rowId: input.row.id,
              viewId: savedView.id,
              ...order,
              ...(input.group !== undefined ? { group: input.group } : {}),
              ...(input.fromGroup !== undefined ? { fromGroup: input.fromGroup } : {}),
              ...(input.subGroup !== undefined ? { subGroup: input.subGroup } : {}),
              ...(input.fromSubGroup !== undefined ? { fromSubGroup: input.fromSubGroup } : {}),
            },
            { label },
          );
          return;
        }
        // A personal grouping: set the effective group's value (and order) in one step.
        const change = groupMoveValues(definition.properties, input.row.properties, [
          { groupBy: effective.groupBy, key: input.group, from: input.fromGroup },
          { groupBy: effective.subGroupBy, key: input.subGroup, from: input.fromSubGroup },
        ]);
        if (!change) throw new Error("Pages cannot be moved between groups of a computed property");
        await backend.transaction(
          label,
          async (tx) => {
            if (input.beforeId || input.afterId) {
              await tx.database.moveRow({ rowId: input.row.id, ...order });
            }
            if (Object.keys(change.set).length > 0 || change.unset.length > 0) {
              await tx.database.setValues({
                databaseId,
                rowIds: [input.row.id],
                set: change.set,
                unset: change.unset,
              });
            }
          },
          { scope: tabId ?? app.historyScope() },
        );
      },
      savedView,
      overlay,
      edited: !isEmptyOverlay(overlay),
      saveView: async () => {
        const next = currentOverlay();
        if (isEmptyOverlay(next) || saveBlockedReason) return;
        try {
          await ops.database.updateView(
            { id: savedView.id, config: next },
            { label: "Save view for everyone" },
          );
          // The overlay goes once the saved view has arrived (below): clearing it now would
          // show the view without these changes for a moment.
          setSavedFrom(savedView.config);
        } catch (error) {
          fail("Could not save the view")(error);
        }
      },
      resetView: () => writeOverlay({}),
      saveBlockedReason,
    };
  }, [
    app,
    ops,
    backend,
    peek,
    tabId,
    definition,
    savedView,
    view,
    overlay,
    overlayKey,
    databaseId,
    params,
    compact,
    saveBlockedReason,
  ]);
  return <Context value={value}>{children}</Context>;
}
