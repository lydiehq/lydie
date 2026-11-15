import { matchesPath } from "@lydie/plugin-api";
import type { Contributed } from "@lydie/plugin-api";

// The view that shows a path (contributions come sorted by `order`).
export function findView(views: readonly Contributed<"view">[], path: string) {
  return views.find((v) => matchesPath(v.path, path));
}
