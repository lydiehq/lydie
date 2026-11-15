// Personal view state, as in Linear: changes to a view's filter, sorts, grouping, columns,
// summaries, limit and layout stay on this device as an overlay on the saved view until someone
// saves them for everyone. The overlay keeps only the keys that differ from the saved view, so a
// view saved underneath (by someone else) shows through everywhere the overlay has no opinion.
// Pure functions; `context.tsx` stores overlays with `app.storage`.
import type { ViewConfig } from "@lydie/plugin-api/databases";

export const OVERLAY_KEYS = [
  "filter",
  "sorts",
  "groupBy",
  "subGroupBy",
  "columns",
  "summaries",
  "limit",
  "layout",
] as const;
export type OverlayKey = (typeof OVERLAY_KEYS)[number];
export type ViewOverlay = Partial<Pick<ViewConfig, OverlayKey>>;

const KEYS = new Set<string>(OVERLAY_KEYS);

// One overlay per view on a collection's page, and one per embed (so tweaks in an embed do not
// leak into the page or another embed).
export function overlayStorageKey(viewId: string, embed?: string | null): string {
  return embed ? `databases.overlay:${viewId}:embed:${embed}` : `databases.overlay:${viewId}`;
}

// Structural equality of JSON values; a missing key equals `undefined`.
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) if (!sameJson(ra[key], rb[key])) return false;
  return true;
}

// The overlay's keys that still differ from the saved config (stored values are untrusted).
export function pruneOverlay(saved: ViewConfig, overlay: unknown): ViewOverlay {
  if (typeof overlay !== "object" || overlay === null || Array.isArray(overlay)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overlay)) {
    if (!KEYS.has(key) || value === undefined) continue;
    if (!sameJson(value, saved[key as OverlayKey])) out[key] = value;
  }
  return out as ViewOverlay;
}

export function isEmptyOverlay(overlay: ViewOverlay): boolean {
  return Object.keys(overlay).length === 0;
}

// What the view shows: the saved config with the overlay's keys on top. The saved object itself
// when there is nothing on top (keeps identity for memoised views).
export function mergeOverlay(saved: ViewConfig, overlay: ViewOverlay): ViewConfig {
  return isEmptyOverlay(overlay) ? saved : { ...saved, ...overlay };
}

// An `updateView` patch: view-state keys go to the overlay; anything else (`extra`) is not
// personal and is returned to be written to the saved view.
export function patchOverlay(
  saved: ViewConfig,
  overlay: ViewOverlay,
  patch: Partial<ViewConfig>,
): { overlay: ViewOverlay; shared: Partial<ViewConfig> } {
  const personal: Record<string, unknown> = { ...overlay };
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (KEYS.has(key)) personal[key] = value;
    else shared[key] = value;
  }
  return { overlay: pruneOverlay(saved, personal), shared: shared as Partial<ViewConfig> };
}

// Whether the overlay changes which pages a new page must match, or what a group move sets: then
// the saved view's filter and grouping (what `createRow`/`moveRow` read from `viewId`) are wrong.
export function changesRows(overlay: ViewOverlay): boolean {
  return "filter" in overlay || "groupBy" in overlay || "subGroupBy" in overlay;
}
