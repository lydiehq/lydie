// Workspace layout: pure reducers and an observable controller. Framework-free and database-free,
// so it runs in a browser tab or an Electron renderer; persistence is injected (the store's
// `layouts` table, or IPC to it).
export {
  HISTORY_LIMIT,
  MIN_SIZE,
  activeGroup,
  checkLayout,
  emptyLayout,
  findGroup,
  findTab,
  groupsOf,
  reduceLayout,
} from "./reducer.ts";
export type { LayoutAction, Side, TabLocation } from "./reducer.ts";
export { createLayoutController, openLayoutController, parseLayout } from "./controller.ts";
export type { LayoutController, LayoutControllerOptions, LayoutPersistence } from "./controller.ts";
