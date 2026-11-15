import { z } from "zod";

// The workspace layout: windows → a tree of splits → tab groups → tabs. It is device state, saved
// per device and never synced, and changes are not operations (they are not in the operation log).
// Types live here so plugins (through @lydie/plugin-api) can name paths; the reducers are in
// `@lydie/runtime/layout`.

const JsonRecord = z.record(z.string(), z.unknown());

// What a tab shows: a path in the app, the same one the web app has in its address bar.
//
//   /                 the home page
//   /d/<docId>        a document; `#<heading>` or `#^<blockId>` says where to scroll
//   /trash, …         whatever a plugin's view registers
//
// Segments are URL-encoded and none contains a dot (the web server answers a last segment with a
// dot as a file, not as the app).
export const TabPath = z.string().startsWith("/").meta({ id: "TabPath" });
export type TabPath = z.infer<typeof TabPath>;

export const HOME_PATH: TabPath = "/";

export type DocTarget = { heading?: string | undefined; blockId?: string | undefined };

export function docPath(id: string, target: DocTarget = {}): TabPath {
  const hash = target.blockId
    ? `#^${encodeURIComponent(target.blockId)}`
    : target.heading
      ? `#${encodeURIComponent(target.heading)}`
      : "";
  return `/d/${encodeURIComponent(id)}${hash}`;
}

// The document a path shows, and where in it; null for any other page.
export function parseDocPath(
  path: string | null | undefined,
): { id: string; heading?: string; blockId?: string } | null {
  const match = path ? /^\/d\/([^/#]+)(?:#(.*))?$/.exec(path) : null;
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]!);
    const target = match[2] ? decodeURIComponent(match[2]) : "";
    if (target.startsWith("^")) return { id, blockId: target.slice(1) };
    return target ? { id, heading: target } : { id };
  } catch {
    return null;
  }
}

export function docIdOf(path: string | null | undefined): string | null {
  return parseDocPath(path)?.id ?? null;
}

// Opaque per-tab state owned by the view (scroll position, selection, folded headings).
export const TabState = JsonRecord.meta({ id: "TabState" });
export type TabState = z.infer<typeof TabState>;

export const TabHistoryEntry = z.object({ path: TabPath, state: TabState });
export type TabHistoryEntry = z.infer<typeof TabHistoryEntry>;

export const Tab = z
  .object({
    id: z.string().min(1),
    path: TabPath,
    state: TabState,
    // Older entries first; `back.at(-1)` is where Back goes.
    back: z.array(TabHistoryEntry),
    // `forward.at(0)` is where Forward goes.
    forward: z.array(TabHistoryEntry),
    pinned: z.boolean(),
  })
  .meta({ id: "Tab" });
export type Tab = z.infer<typeof Tab>;

export const TabGroup = z
  .object({
    type: z.literal("group"),
    id: z.string().min(1),
    tabs: z.array(Tab),
    // null only for the empty group of a window with no tabs.
    activeTabId: z.string().nullable(),
  })
  .meta({ id: "TabGroup" });
export type TabGroup = z.infer<typeof TabGroup>;

export type LayoutSplit = {
  type: "split";
  id: string;
  // "row": children side by side; "column": stacked.
  direction: "row" | "column";
  children: LayoutNode[];
  // Fractions of the split, summing to 1.
  sizes: number[];
};
export type LayoutNode = TabGroup | LayoutSplit;

export const LayoutSplit: z.ZodType<LayoutSplit> = z.lazy(() =>
  z.object({
    type: z.literal("split"),
    id: z.string().min(1),
    direction: z.enum(["row", "column"]),
    children: z.array(LayoutNode),
    sizes: z.array(z.number().positive()),
  }),
);
export const LayoutNode: z.ZodType<LayoutNode> = z.lazy(() => z.union([TabGroup, LayoutSplit]));

export const LayoutWindow = z
  .object({
    id: z.string().min(1),
    root: LayoutNode,
    activeGroupId: z.string().min(1),
  })
  .meta({ id: "LayoutWindow" });
export type LayoutWindow = z.infer<typeof LayoutWindow>;

export const LAYOUT_VERSION = 2;

export const Layout = z
  .object({
    version: z.literal(LAYOUT_VERSION),
    windows: z.array(LayoutWindow).min(1),
    activeWindowId: z.string().min(1),
  })
  .meta({ id: "Layout" });
export type Layout = z.infer<typeof Layout>;
