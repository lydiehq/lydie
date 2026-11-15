// Notion names every exported page and folder "<title> <32 hex id>", truncating long titles, and
// URL-encodes the paths in links.

const ID_AT_END = /(?:^|[\s-])([0-9a-f]{32})$/i;

// The 32-hex id at the end of a file or folder name (extension left off), or null.
export function notionIdOf(name: string): string | null {
  const stem = name.replace(/\.[a-z0-9]+$/i, "");
  return ID_AT_END.exec(stem)?.[1]?.toLowerCase() ?? null;
}

// A Notion id however it is written (with dashes in `id` attributes), as 32 lower-case hex.
export function normalizeNotionId(id: string): string | null {
  const hex = id.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

// The name without its id and extension: "Plan 1cebb5….html" → "Plan".
export function titleOfName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*[0-9a-f]{32}$/i, "")
    .trim();
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// A link's target as a path in the export, relative to the folder of the page it is on; null for
// links that leave the export (web addresses, mail, anchors).
export function resolveHref(href: string, fromDir: string): string | null {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) {
    return null;
  }
  const clean = href.replace(/[?#].*$/, "");
  if (!clean) return null;
  const parts = fromDir ? fromDir.split("/") : [];
  for (const part of decode(clean).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  bmp: "image/bmp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function contentTypeOf(path: string): string {
  return TYPES[extensionOf(path)] ?? "application/octet-stream";
}
