// Windowing arithmetic for the virtualised views (board, list, gallery; the table uses the grid
// engine directly). It lives in `@lydie/plugin-api/grid`.
export {
  MAX_WINDOW,
  PAGE,
  prefixSums,
  visibleColumns,
  visibleRange,
  windowFor,
} from "@lydie/plugin-api/grid";
