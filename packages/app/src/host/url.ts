import { docPath, parseDocPath, slugify, uuidFromBits } from "@lydie/contract";
import type { TabPath } from "@lydie/contract";

// A tab's path is its URL below the app's base: `/trash` is `<base>trash`. Everything in a hosted
// workspace sits under `w/<workspace>/` (its slug, or its id where the slug is not known), so a
// link says which workspace it belongs to; URLs without it are this browser's own workspace.
//
// A document's URL carries its title for people to read, Notion's way: `d/<title>-<id>`, the id
// as 32 hex digits. Only the id counts: the title can be stale or missing, and `d/<id>` with or
// without hyphens is the same page.

export type AppLocation = {
  // The workspace the URL names, as written: a slug or an id. Null: none.
  workspace: string | null;
  path: TabPath;
};

// The URL of a page: `search` is the window's own query string (`?embed=1`), kept as it is.
export function appUrl(
  base: string,
  path: TabPath,
  workspace: string | null = null,
  search = "",
  title: string | null = null,
): string {
  const [plain = "/", hash] = path.split("#");
  const doc = parseDocPath(plain);
  const pathname =
    doc && title?.trim() ? `/d/${slugify(title)}-${doc.id.replaceAll("-", "")}` : plain;
  const prefix = workspace ? `w/${encodeURIComponent(workspace)}` : "";
  const below = prefix ? prefix + (pathname === "/" ? "" : pathname) : pathname.slice(1);
  return base + below + search + (hash === undefined ? "" : `#${hash}`);
}

// What follows the app's base ("/" or "/app/") in a pathname; null outside the base.
export function belowBase(base: string, pathname: string): string | null {
  if (pathname === base.slice(0, -1)) return "";
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length);
  return rest === "index.html" ? "" : rest;
}

// `d/<title>-<32 hex digits>`: the id at the end of a document's readable URL.
const TITLED_DOC = /^d\/(?:[^/]*-)?([0-9a-f]{32})$/;

// `below` is what follows the base in the pathname; `hash` as `location` has it.
export function parseAppUrl(below: string, hash = ""): AppLocation {
  let rest = below.replace(/\/+$/, "");
  let workspace: string | null = null;
  const named = /^w\/([^/]+)(?:\/(.*))?$/.exec(rest);
  if (named) {
    try {
      workspace = decodeURIComponent(named[1]!);
    } catch {
      workspace = named[1]!;
    }
    rest = named[2] ?? "";
  }
  const titled = TITLED_DOC.exec(rest);
  if (titled) rest = `d/${uuidFromBits(BigInt(`0x${titled[1]}`))}`;
  const path = `/${rest}${hash.length > 1 ? hash : ""}`;
  // A typed link may spell a heading differently from `docPath`.
  const doc = parseDocPath(path);
  return { workspace, path: doc ? docPath(doc.id, doc) : path };
}
