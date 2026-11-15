/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- a virtualised grid of positioned cards */
// The gallery: cards in a grid, virtualised by grid row; covers from a files property or the
// page's first image (layout settings).
import { useDatabaseView } from "@lydie/plugin-api/databases";
import { AddRegular, Button, EmptyState } from "@lydie/plugin-api/ui";
import { useLayoutEffect, useMemo, useState } from "react";

import { Card } from "./Card.tsx";
import { useViewContext } from "./context.tsx";
import { useVirtualScroll } from "./ListView.tsx";
import { CardSkeleton, PLACEHOLDERS } from "./skeleton.tsx";
import { visibleColumns } from "./view-model.ts";
import { visibleRange, windowFor } from "./virtual.ts";

const GAP = 12;

export function GalleryView({ maxHeight }: { maxHeight?: number | undefined }) {
  const ctx = useViewContext();
  const { definition, view, params } = ctx;
  const scroll = useVirtualScroll();
  // Null until the first result: placeholder cards show meanwhile.
  const [known, setTotal] = useState<number | null>(null);
  const total = known ?? PLACEHOLDERS;
  const columns = useMemo(() => visibleColumns(definition, view), [definition, view]);
  const cardWidth = view.config.layout.cardSize ?? 240;
  const coverHeight = view.config.layout.cover ? Math.round(cardWidth * 0.55) : 0;
  const shown = columns.slice(1).length;
  const cardHeight = coverHeight + 44 + Math.min(shown, 4) * 20;
  const perRow = Math.max(1, Math.floor((scroll.width - GAP) / (cardWidth + GAP)));
  const gridRows = Math.ceil(total / perRow);
  const range = visibleRange(scroll.top, scroll.height, cardHeight + GAP, gridRows, 2);
  const result = useDatabaseView({
    ...params,
    view: { ...params.view, config: { ...params.view?.config, groupBy: null, subGroupBy: null } },
    window: windowFor(range.start * perRow, range.end * perRow, known || undefined),
  });
  useLayoutEffect(() => {
    if (!result.isLoading) setTotal(result.total);
  }, [result]);

  const cards = [];
  for (let r = range.start; r < range.end; r++) {
    for (let c = 0; c < perRow; c++) {
      const position = r * perRow + c;
      if (position >= total) break;
      const row = result.rows[position - result.offset];
      const top = r * (cardHeight + GAP) + GAP;
      const left = c * (cardWidth + GAP) + GAP;
      cards.push(
        <div
          key={row?.id ?? `p:${position}`}
          role="listitem"
          className="absolute overflow-hidden rounded-lg bg-surface shadow-sm ring-1 ring-gray-950/10 hover:ring-gray-950/20"
          style={{ top, left, width: cardWidth, height: cardHeight }}
        >
          {/* Plain: a full-size, invisible hit area, one per card in a virtualised grid. */}
          {row ? (
            <button
              type="button"
              aria-label={`Open ${row.title || "Untitled"}`}
              onClick={(event) =>
                event.metaKey || event.ctrlKey ? ctx.openRow(row.id, event) : ctx.peekRow(row.id)
              }
              className="block size-full text-left"
            >
              <Card row={row} columns={columns} coverHeight={coverHeight} />
            </button>
          ) : (
            <CardSkeleton index={position} coverHeight={coverHeight} />
          )}
        </div>,
      );
    }
  }

  return (
    <div
      ref={scroll.ref}
      onScroll={scroll.onScroll}
      className="relative min-h-0 grow overflow-auto"
      style={maxHeight ? { maxHeight } : undefined}
      data-testid="gallery-view"
    >
      <div
        role="list"
        aria-label="Cards"
        aria-busy={known === null}
        className="relative"
        style={{ height: gridRows * (cardHeight + GAP) + GAP + 48 }}
      >
        {cards}
        <Button
          variant="ghost"
          size="sm"
          onPress={() => void ctx.createRow().then((id) => ctx.peekRow(id))}
          className="absolute font-normal text-gray-500"
          style={{ top: gridRows * (cardHeight + GAP) + GAP, left: GAP }}
        >
          <AddRegular aria-hidden data-icon="inline-start" />
          New
        </Button>
      </div>
      {known === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-12">
          <EmptyState title="No pages" />
        </div>
      )}
    </div>
  );
}
