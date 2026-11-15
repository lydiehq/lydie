/* oxlint-disable jsx-a11y/prefer-tag-over-role -- live regions on <div>: <output> is for form results */
// What shows while a collection loads: the screen's outline (the bar of views, then lines of
// pages) until the collection and the views' code are there, and the same bars inside each view's
// own rows and cards until its first pages arrive. Not part of the lazy chunk: it is what shows
// while that loads.
import { PAGE_WIDTH_TRANSITION, pageColumnClass } from "@lydie/plugin-api";
import { Skeleton } from "@lydie/plugin-api/ui";

// On its own page a collection's views start at the left edge of the page's text column (the
// title above it is centred, 680px wide with 1rem padding, as the body; at full width 5rem from
// the edge) and run to the right edge of the window; the bar of views above them keeps to the
// title's column (`pageColumnClass`). Both glide with the title when full width is toggled.
function pageInset(fullWidth: boolean): string {
  return `${fullWidth ? "pr-4 pl-20" : "pr-4 pl-[max(1rem,calc(50%-324px))]"} ${PAGE_WIDTH_TRANSITION}`;
}

// Rows and cards a view draws before it knows how many pages it has.
export const PLACEHOLDERS = 8;

const WIDTHS = ["w-40", "w-28", "w-48", "w-24", "w-36", "w-32"] as const;
const SHARES = ["w-1/2", "w-2/3", "w-1/3", "w-3/5"] as const;

// Bar lengths that vary from line to line, the same on every render.
export const barWidth = (n: number) => WIDTHS[n % WIDTHS.length]!;
// The same as a share of the cell the bar is in.
export const barShare = (n: number) => SHARES[n % SHARES.length]!;

export function ScreenSkeleton({
  compact = false,
  fullWidth = false,
}: {
  compact?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading collection"
      className={`flex min-h-0 flex-col ${compact ? "" : "grow"}`}
      data-testid="database-skeleton"
    >
      <div className={compact ? "" : pageColumnClass(fullWidth)}>
        <div className="flex h-10 shrink-0 items-center gap-4 border-b border-gray-950/[0.07] pt-1">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="ml-auto h-3 w-10" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-14 rounded-md" />
        </div>
      </div>
      <div className={`flex min-h-0 flex-col ${compact ? "" : pageInset(fullWidth)}`}>
        <div className="flex h-[34px] shrink-0 items-center gap-10 border-b border-gray-100 px-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="ml-auto h-2.5 w-12" />
          <Skeleton className="h-2.5 w-14" />
        </div>
        {Array.from({ length: compact ? 5 : PLACEHOLDERS }, (_, i) => (
          <div
            key={i}
            className="flex h-9 shrink-0 items-center gap-10 border-b border-gray-100 px-2"
          >
            <Skeleton className={`h-3 ${barWidth(i)}`} />
            <Skeleton className={`ml-auto h-3 ${i % 2 ? "w-16" : "w-10"}`} />
            <Skeleton className={`h-3 ${i % 3 ? "w-12" : "w-20"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// A card of a board column before its page is there.
export function CardSkeleton({ index, coverHeight = 0 }: { index: number; coverHeight?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {coverHeight > 0 && <div className="shrink-0 bg-gray-50" style={{ height: coverHeight }} />}
      <div className="flex flex-col gap-2 p-2.5">
        <Skeleton className={`h-3 ${barShare(index)}`} />
        <Skeleton className={`h-2.5 ${barShare(index + 2)}`} />
      </div>
    </div>
  );
}

// The board's look, here so that its skeleton (outside the lazy chunk) has the same sizes and
// nothing moves when the pages arrive.
export const BOARD_LANE = "flex items-start gap-2";
export const BOARD_COLUMN = "flex w-68 shrink-0 flex-col rounded-xl py-1.5";
export const BOARD_COLUMN_BG = "bg-gray-950/[0.035]";
export const BOARD_HEADER = "flex h-8 shrink-0 items-center gap-1.5 pr-1.5 pl-2";
// Room on every side, so the cards' rings, shadows and focus rings are not cut off by the
// scrolling list or by each card's `content-visibility` (which clips to its box).
export const BOARD_LIST = "flex flex-col gap-1.5 px-1.5 py-1";
// Elevated: the same as the surface in light mode, lighter than the column in dark mode.
export const BOARD_CARD = "rounded-lg bg-elevated shadow-xs ring-1 ring-gray-950/[0.07]";
export const BOARD_FOOTER = "mx-1.5 mt-1 h-7.5 shrink-0";

// The board before its columns are known.
export function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading board"
      className={`${BOARD_LANE} min-h-0 grow overflow-hidden p-2`}
    >
      {[3, 2, 4, 1].map((cards, column) => (
        <div key={column} className={`${BOARD_COLUMN} ${BOARD_COLUMN_BG}`}>
          <div className={BOARD_HEADER}>
            <Skeleton className={`h-3 ${column % 2 ? "w-20" : "w-14"}`} />
          </div>
          <div className={BOARD_LIST}>
            {Array.from({ length: cards }, (_, i) => (
              <div key={i} className={BOARD_CARD}>
                <CardSkeleton index={column + i} />
              </div>
            ))}
          </div>
          <div className={BOARD_FOOTER} />
        </div>
      ))}
    </div>
  );
}
