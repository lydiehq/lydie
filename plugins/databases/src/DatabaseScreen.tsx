/* oxlint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the screen takes focus so `F` (add filter) works anywhere in it */
// A collection's views: tabs, toolbar, the chips of what filters the pages, and the
// active view. Used on the collection's page and inline (an embed in another page, `compact`).
// The view shown is the saved view with this device's personal changes on top (`overlay.ts`).
import { PAGE_WIDTH_TRANSITION, useApp, useTabState } from "@lydie/plugin-api";
import type { DatabaseDefinition, DatabaseViewParams } from "@lydie/plugin-api/databases";
import { EmptyState, StatusBanner } from "@lydie/plugin-api/ui";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { BoardView } from "./board/BoardView.tsx";
import { CalendarView } from "./calendar/CalendarView.tsx";
import { useViewContext, useViewOverlay, ViewProvider } from "./context.tsx";
import { withSearch } from "./filter-model.ts";
import { FilterUiProvider, isFilterKey, useFilterUi } from "./filter-ui.tsx";
import { ListView } from "./ListView.tsx";
import { PageSheetHost } from "./PageSheet.tsx";
import { pageInset } from "./skeleton.tsx";
import { TableView } from "./table/TableView.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { titleProperty } from "./view-model.ts";
import { ViewChips } from "./ViewChips.tsx";
import { ViewTabs } from "./ViewTabs.tsx";

export function DatabaseScreen({
  definition,
  compact = false,
  initialViewName,
  stateKey,
  embedKey = null,
  fullWidth = false,
}: {
  definition: DatabaseDefinition;
  compact?: boolean;
  // On its own page: the page is full width (`full-width: true`), so the views line up with it.
  fullWidth?: boolean;
  // Inline embeds name a view (`![[Tasks.base#Board]]`).
  initialViewName?: string | null;
  // Where the chosen view and search are kept (per tab for a page, per embed inline).
  stateKey: string;
  // Inline: which embed this is, so its personal view changes are its own.
  embedKey?: string | null;
}) {
  const app = useApp();
  const views = definition.views;
  const named = initialViewName
    ? views.find((v) => v.name.toLowerCase() === initialViewName.toLowerCase())
    : undefined;
  // A page remembers its view and search in the tab; an embed starts at its named view.
  const [tabView, setTabView] = useTabState<string | null>(`${stateKey}:view`, null);
  const [localView, setLocalView] = useState<string | null>(null);
  const chosen = compact ? localView : tabView;
  const setChosen = compact ? setLocalView : setTabView;
  const saved = views.find((v) => v.id === chosen) ?? named ?? views[0];
  const { key, overlay, view } = useViewOverlay(saved, embedKey);
  const [search, setSearch] = useState("");
  const title = titleProperty(definition);
  const params = useMemo<DatabaseViewParams>(() => {
    const base: DatabaseViewParams = { databaseId: definition.database.id, me: "local" };
    if (!view) return base;
    // The query takes the saved view by id and the personal changes (and search) over it.
    const uniqueIds = definition.properties.filter((p) => p.type === "uniqueId");
    const filter = withSearch(view.config.filter, title?.id ?? null, search, uniqueIds);
    const config: NonNullable<DatabaseViewParams["view"]>["config"] = { ...overlay };
    if (filter !== view.config.filter) config.filter = filter;
    return {
      ...base,
      viewId: view.id,
      ...(Object.keys(config).length > 0 ? { view: { config } } : {}),
    };
  }, [definition.database.id, view, overlay, title?.id, search]);

  if (!saved || !view) {
    return <EmptyState title="This collection has no views" />;
  }

  return (
    <PageSheetHost {...(compact ? {} : { stateKey })}>
      <ViewProvider
        definition={definition}
        savedView={saved}
        view={view}
        overlay={overlay}
        overlayKey={key}
        params={params}
        compact={compact}
      >
        <FilterUiProvider>
          <Screen
            compact={compact}
            fullWidth={fullWidth}
            search={search}
            onSearch={setSearch}
            onSelect={setChosen}
          >
            {app.workspace.persistent === false && !compact && (
              <div className={`${pageInset(fullWidth)} py-2`}>
                <StatusBanner kind="warning" variant="card">
                  This workspace lives in memory only: changes are lost when the tab closes.
                </StatusBanner>
              </div>
            )}
          </Screen>
        </FilterUiProvider>
      </ViewProvider>
    </PageSheetHost>
  );
}

// Views keep a small gutter of their own left of the page's edge (`pageInset`, 0.5rem); the table's
// is wider (its selection column, 3rem), so the names in it line up with the title.
const VIEW_INSET = "pr-2 pl-[max(0.5rem,calc(50%-332px))]";
const VIEW_INSET_FULL = "pr-2 pl-18";
// The table spans the whole width and takes this as a margin inside its own scrolling (it bleeds
// left into it when scrolled sideways); it measures the length itself.
const TABLE_INSET = "[--table-inset:max(0.5rem,calc(50%-372px))]";
const TABLE_INSET_FULL = "[--table-inset:2rem]";

function viewInset(type: string, fullWidth: boolean): string {
  if (type === "table") return fullWidth ? TABLE_INSET_FULL : TABLE_INSET;
  return `${fullWidth ? VIEW_INSET_FULL : VIEW_INSET} ${PAGE_WIDTH_TRANSITION}`;
}

function Screen({
  compact,
  fullWidth,
  search,
  onSearch,
  onSelect,
  children,
}: {
  compact: boolean;
  fullWidth: boolean;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const ctx = useViewContext();
  const ui = useFilterUi();
  const inset = compact ? "" : pageInset(fullWidth);
  return (
    <div
      className={`flex min-h-0 flex-col outline-none ${compact ? "" : "grow"}`}
      data-testid="database"
      data-database-id={ctx.definition.database.id}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (!isFilterKey(event)) return;
        event.preventDefault();
        ui.setMenuOpen(true);
      }}
    >
      <div className={inset}>
        {/* The bar's line: the open view's tab is underlined on it. */}
        <div className="flex items-center justify-between gap-x-2 border-b border-gray-950/[0.07] pt-1">
          <ViewTabs definition={ctx.definition} activeId={ctx.savedView.id} onSelect={onSelect} />
          <Toolbar
            search={search}
            onSearch={onSearch}
            onNew={() => {
              void ctx
                .createRow()
                .then((id) => ctx.peekRow(id))
                .catch(() => {});
            }}
          />
        </div>
      </div>
      <div className={inset}>
        <ViewChips />
      </div>
      <div
        className={`flex min-h-0 flex-col ${compact ? "" : `grow ${viewInset(ctx.view.type, fullWidth)}`}`}
      >
        <ActiveView compact={compact} />
      </div>
      {children}
    </div>
  );
}

function ActiveView({ compact }: { compact: boolean }) {
  const { view } = useViewContext();
  const maxHeight = compact ? 420 : undefined;
  switch (view.type) {
    case "board":
      return <BoardView maxHeight={maxHeight} />;
    case "list":
      return <ListView maxHeight={maxHeight} />;
    case "calendar":
      return <CalendarView />;
    default:
      return <TableView {...(maxHeight ? { maxHeight } : {})} />;
  }
}
