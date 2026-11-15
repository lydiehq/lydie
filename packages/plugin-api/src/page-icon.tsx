// Page icons and covers are frontmatter properties, so a vault stays readable elsewhere:
//   icon: "🚀"                  an emoji (or any short text), or one of our doodles:
//                                `doodle:star`, in a colour `doodle:star:blue`
//   cover: "banner.png"          an attachment file name, an http(s) URL, or a colour
//                                (`blue`, see COVER_COLORS, or a hex such as "#e8d5c4")
//   cover-position: 35           vertical focus of a cover image, 0 (top) to 100 (bottom)
//   full-width: true             the page uses the window's width
// Every place that shows a document (tree, tabs, switcher, links) uses `DocIcon`.
import {
  CollectionItemIcon,
  DocumentThumbnailIcon,
  DOODLE_COLORS,
  DoodleIcon,
  doodleMarkup,
  GitHubIcon,
  LinkRegular,
  parseDoodleIcon,
} from "@lydie/ui";
import { useEffect, useMemo, useState } from "react";

import { useDocumentMark } from "./doc-marks.ts";
import { useBackend, useQuery, useWorkspace } from "./react.tsx";

export const PAGE_ICON_KEY = "icon";
export const PAGE_COVER_KEY = "cover";
export const PAGE_COVER_POSITION_KEY = "cover-position";
// `full-width: true` widens the page to the window; off is the key's absence, not `false`.
export const PAGE_FULL_WIDTH_KEY = "full-width";

// Page options: frontmatter so the file stays portable, but set by their own controls (page-decor,
// the page menu), not properties. Lists of a page's properties leave them out.
export const PAGE_OPTION_KEYS: ReadonlySet<string> = new Set([
  PAGE_ICON_KEY,
  PAGE_COVER_KEY,
  PAGE_COVER_POSITION_KEY,
  PAGE_FULL_WIDTH_KEY,
]);

export function isPageOptionKey(key: string): boolean {
  return PAGE_OPTION_KEYS.has(key);
}

// A page's frontmatter without its page options: the properties to show as properties.
export function userPropertyEntries(
  properties: Record<string, unknown> | null | undefined,
): [string, unknown][] {
  return Object.entries(properties ?? {}).filter(([key]) => !PAGE_OPTION_KEYS.has(key));
}

export function pageFullWidthOf(properties: Record<string, unknown> | null | undefined): boolean {
  const value = properties?.[PAGE_FULL_WIDTH_KEY];
  return value === true || value === "true" || value === "yes";
}

// How long a page takes to glide between its normal and full width.
export const PAGE_WIDTH_TRANSITION_MS = 300;

// Glides a page column's width and padding while an ancestor has `data-width-transition`: the doc
// view sets it only while full width is toggled, so opening another page does not animate.
// editor-content.css does the same for the editor's blocks.
export const PAGE_WIDTH_TRANSITION =
  "motion-safe:[[data-width-transition]_&]:[transition:max-width_300ms_ease-in-out,padding_300ms_ease-in-out]";

// The column a page's title and decorations sit in, lined up with the editor's text
// (editor-content.css: 680px blocks with 1rem padding; full width: no cap, 5rem padding).
// Both widths are lengths (`max-w-full`, not `none`), so the change between them can animate.
export function pageColumnClass(fullWidth: boolean): string {
  return `mx-auto w-full ${fullWidth ? "max-w-full px-20" : "max-w-[680px] px-4"} ${PAGE_WIDTH_TRANSITION}`;
}

export function pageIconOf(properties: Record<string, unknown> | null | undefined): string | null {
  const icon = properties?.[PAGE_ICON_KEY];
  return typeof icon === "string" && icon.trim() ? icon.trim() : null;
}

// The cover and its vertical focus (0 top to 100 bottom, default the middle); null without one.
export function pageCoverOf(
  properties: Record<string, unknown> | null | undefined,
): { cover: string; position: number } | null {
  const cover = properties?.[PAGE_COVER_KEY];
  if (typeof cover !== "string" || !cover.trim()) return null;
  const raw = Number(properties?.[PAGE_COVER_POSITION_KEY]);
  return {
    cover: cover.trim(),
    position: Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 50,
  };
}

// A page's icon as it is drawn: the emoji as text, a doodle as its drawing, as tall as the text
// around it unless `size` (px) is given.
export function PageIcon({
  icon,
  size,
  className,
}: {
  icon: string;
  size?: number;
  // For the doodle's drawing, e.g. `size-full` to fill an icon box.
  className?: string;
}) {
  const doodle = parseDoodleIcon(icon);
  if (!doodle) return icon;
  return (
    <DoodleIcon
      doodle={doodle.doodle}
      color={doodle.color}
      className={className}
      {...(size === undefined ? {} : { size })}
    />
  );
}

// The same into an element, where React does not draw (an editor decoration).
export function fillPageIcon(element: HTMLElement, icon: string): void {
  const doodle = parseDoodleIcon(icon);
  if (!doodle) {
    element.textContent = icon;
    return;
  }
  element.innerHTML = doodleMarkup(doodle.doodle);
  element.classList.add(DOODLE_COLORS[doodle.color]);
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

// The colours a cover can be instead of an image, by the name kept in the file (`cover: blue`).
// Solid shades from 400-600, which the dark theme leaves as they are: a cover keeps its colour in
// both modes (tints of the surface looked muddy on a dark page). Gray and brown are literal: the
// gray ramp mirrors in dark mode, and Tailwind has no brown.
export const COVER_COLORS = {
  gray: "bg-[oklch(0.556_0_0)]",
  brown: "bg-[oklch(0.55_0.08_55)]",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  red: "bg-red-500",
} as const;
export type CoverColor = keyof typeof COVER_COLORS;

export type CoverFill = { className: string; style?: { backgroundColor: string } };

// How a solid-colour cover is painted: a palette name by its class, a hex colour (`"#e8d5c4"`,
// written by hand) as is. null when the cover is an image.
export function coverFillOf(cover: string | null | undefined): CoverFill | null {
  const value = cover?.trim().toLowerCase();
  if (!value) return null;
  if (Object.hasOwn(COVER_COLORS, value)) return { className: COVER_COLORS[value as CoverColor] };
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(value))
    return { className: "", style: { backgroundColor: value } };
  return null;
}

// A URL for a cover: an http(s) URL as is, or the attachment with that file name (null while it
// loads, when there is no such attachment, or when the cover is a colour).
export function useCoverUrl(cover: string | null): string | null {
  const backend = useBackend();
  const workspace = useWorkspace();
  const file = cover && !isUrl(cover) && !coverFillOf(cover) ? cover : null;
  const attachments = useQuery(
    "attachment.list",
    file ? { workspaceId: workspace.workspaceId } : null,
  );
  const match = file
    ? attachments.data.find(
        (a) => a.filename.toLowerCase() === file.split("/").pop()!.toLowerCase(),
      )
    : undefined;
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!match) return;
    let live = true;
    let made: string | null = null;
    void backend.attachments.url(match.id).then((u) => {
      made = u;
      if (live) setUrl({ id: match.id, url: u });
    });
    return () => {
      live = false;
      if (made?.startsWith("blob:")) URL.revokeObjectURL(made);
    };
  }, [backend, match]);
  if (!cover) return null;
  if (isUrl(cover)) return cover;
  return file && match && url?.id === match.id ? url.url : null;
}

// The workspace's database ids (one shared live query), for database icons.
export function useDatabaseIds(enabled = true): ReadonlySet<string> {
  const workspace = useWorkspace();
  const { data } = useQuery(
    "database.list",
    enabled ? { workspaceId: workspace.workspaceId } : null,
  );
  return useMemo(() => new Set(data.map((d) => d.id)), [data]);
}

export function useIsDatabase(id: string | null | undefined): boolean {
  return useDatabaseIds(Boolean(id)).has(id ?? "");
}

// A page icon (emoji or doodle) when set; otherwise a page with lines of text, a shorter page with another
// popping out behind when it has pages inside (`hasChildren`, the tree), and with `id`, a small
// table for a database. `className` sizes the box the icon is centred in.
export function DocIcon({
  properties,
  id,
  hasChildren = false,
  className = "size-4",
}: {
  properties: Record<string, unknown> | null | undefined;
  id?: string | null;
  hasChildren?: boolean;
  className?: string;
}) {
  const database = useIsDatabase(id);
  const mark = useDocumentMark(id);
  const icon = pageIconOf(properties);
  const box = `inline-flex shrink-0 items-center justify-center ${className}`;
  if (icon)
    return (
      <span aria-hidden data-page-icon={icon} className={`${box} leading-none`}>
        <PageIcon icon={icon} className="size-full" />
      </span>
    );
  // A connected folder shows where it is connected to, in place of the plain page or table.
  if (mark)
    return (
      <span aria-hidden data-connected-icon={mark.connector} title={mark.label} className={box}>
        {mark.connector === "github" ? <GitHubIcon /> : <LinkRegular />}
      </span>
    );
  if (database)
    return (
      <span aria-hidden data-database-icon="" className={box}>
        <CollectionItemIcon />
      </span>
    );
  return (
    <span aria-hidden data-doc-icon="" className={box}>
      <DocumentThumbnailIcon size="sm" showFoldDecoration={hasChildren} />
    </span>
  );
}
