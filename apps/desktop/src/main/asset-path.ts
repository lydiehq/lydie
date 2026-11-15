import { stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { isInside } from "./workspace-fs.ts";

// Resolves a request path to a file under `root`, or null when it escapes. Paths without an
// extension fall back to index.html so client-side routes survive a reload.
export async function resolveAsset(root: string, pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const file = resolve(root, `.${decoded}`);
  if (!isInside(root, file)) return null;
  const found = await stat(file).then(
    (stats) => stats.isFile(),
    () => false,
  );
  if (found) return file;
  if (extname(decoded) === "") return join(root, "index.html");
  return null;
}
