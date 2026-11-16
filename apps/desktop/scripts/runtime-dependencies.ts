// Which packages the packaged app loads from node_modules. Only native code stays a real package:
// the addons, and PowerSync, whose worker is started from its own file (see `asarUnpack`).
// electron.vite.config.ts bundles every other dependency into out/main, and
// electron-builder.config.ts leaves the packages only they need out of the app.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const EXTERNAL_DEPENDENCIES = ["@parcel/watcher", "@powersync/node", "better-sqlite3"];

// Headers for compiling addons, listed as dependencies by @parcel/watcher and better-sqlite3;
// nothing requires them at runtime.
const BUILD_ONLY = ["node-addon-api"];

type Manifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
}

// Node's lookup: `node_modules/<name>` in `from` or the nearest folder above it.
function findPackage(name: string, from: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

// Names of every package reachable from `names` (optional ones that are not installed skipped).
function closure(names: string[], from: string): Set<string> {
  const found = new Set<string>();
  const visit = (name: string, parent: string) => {
    if (found.has(name)) return;
    const dir = findPackage(name, parent);
    if (!dir) return;
    found.add(name);
    const manifest = readManifest(dir);
    for (const dep of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      visit(dep, dir);
    }
  };
  for (const name of names) visit(name, from);
  return found;
}

// Dependencies the bundle carries instead of node_modules.
export function bundledDependencies(appDir: string): string[] {
  const names = Object.keys(readManifest(appDir).dependencies ?? {});
  return names.filter((name) => !EXTERNAL_DEPENDENCIES.includes(name));
}

// Packages electron-builder would copy that nothing loads at runtime: those reached only through
// bundled dependencies, and build-only ones.
export function unusedPackages(appDir: string): string[] {
  const runtime = closure(EXTERNAL_DEPENDENCIES, appDir);
  for (const name of BUILD_ONLY) runtime.delete(name);
  const all = closure(Object.keys(readManifest(appDir).dependencies ?? {}), appDir);
  return [...all].filter((name) => !runtime.has(name)).sort();
}
