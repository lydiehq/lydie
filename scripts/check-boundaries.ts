// Enforces the package boundaries from client/AGENTS.md. This file is the single source of truth for
// which internal packages each package may depend on; AGENTS.md describes it, this enforces it.
//
// Rules:
//   a. Nothing under client/ imports or depends on anything outside client/.
//   b. Each workspace package depends only on the internal (@lydie/*) packages allowed below.
//   c. plugins/* import only @lydie/plugin-api, react, react/jsx-runtime and their own files.
//   d. ui, app and plugins/* never import node:*, fs, SQLite drivers or @powersync/*.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ALL_BELOW_APP = [
  "@lydie/contract",
  "@lydie/runtime",
  "@lydie/store",
  "@lydie/markdown",
  "@lydie/editor",
  "@lydie/ui",
  "@lydie/platform",
  "@lydie/plugin-api",
];

// Apps are composition roots: they wire the host, the data layer and the built-in plugin set.
const APP_SHELL = [...ALL_BELOW_APP, "@lydie/app", "@lydie/bridge-fs", "@lydie/sync", "@lydie/sdk"];

export const ALLOWED_INTERNAL: Record<string, readonly string[]> = {
  "@lydie/contract": [],
  "@lydie/runtime": ["@lydie/contract"],
  "@lydie/store": ["@lydie/contract", "@lydie/runtime"],
  "@lydie/markdown": [],
  "@lydie/editor": ["@lydie/markdown"],
  "@lydie/ui": [],
  "@lydie/platform": [],
  "@lydie/plugin-api": ["@lydie/contract", "@lydie/platform", "@lydie/ui", "@lydie/editor"],
  "@lydie/app": ALL_BELOW_APP,
  "@lydie/bridge-fs": ["@lydie/store", "@lydie/markdown", "@lydie/contract", "@lydie/runtime"],
  "@lydie/sync": ["@lydie/contract", "@lydie/runtime", "@lydie/store", "@lydie/sdk"],
  "@lydie/sdk": ["@lydie/contract"],
  "@lydie/mcp-local": ["@lydie/contract", "@lydie/runtime", "@lydie/store", "@lydie/bridge-fs"],
  "@lydie/cli": [
    "@lydie/contract",
    "@lydie/runtime",
    "@lydie/store",
    "@lydie/bridge-fs",
    "@lydie/mcp-local",
  ],
  "@lydie/web": APP_SHELL,
  "@lydie/desktop": [...APP_SHELL, "@lydie/mcp-local"],
};

const PLUGIN_ALLOWED = ["@lydie/plugin-api", "react", "react/jsx-runtime"];
// Test files in plugins may also use the test tooling.
const PLUGIN_TEST_ALLOWED = ["bun:test", "@testing-library/react", "@testing-library/dom"];
const UI_PACKAGES = ["@lydie/ui", "@lydie/app"];

export type PackageKind = "package" | "plugin" | "app";

export type PackageInfo = {
  name: string;
  kind: PackageKind;
  // Absolute directory of the package.
  dir: string;
};

export type Violation = { rule: "a" | "b" | "c" | "d"; where: string; message: string };

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "out", "coverage", ".git", ".turbo"]);
// Its fixtures are violations on purpose.
const SKIP_FILES = new Set(["scripts/check-boundaries.test.ts"]);

const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

export function extractImports(source: string): string[] {
  const code = stripComments(source);
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// The bare package name of a specifier: "@scope/name/sub" -> "@scope/name", "name/sub" -> "name".
export function packageName(specifier: string) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function isRelative(specifier: string) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier === "." ||
    specifier === ".."
  );
}

function isInside(dir: string, path: string) {
  const rel = relative(dir, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
}

export function isForbiddenInUi(specifier: string) {
  const name = packageName(specifier);
  return (
    specifier.startsWith("node:") ||
    name === "fs" ||
    name === "better-sqlite3" ||
    name.startsWith("@powersync/") ||
    /sqlite/i.test(specifier)
  );
}

type CheckContext = { clientRoot: string; pkg?: PackageInfo };

// Checks one import specifier found in `file` (absolute path).
export function checkSpecifier(ctx: CheckContext, file: string, specifier: string): Violation[] {
  const where = relative(ctx.clientRoot, file);
  const out: Violation[] = [];

  if (specifier.startsWith("@lydie-core/")) {
    out.push({ rule: "a", where, message: `imports private core package "${specifier}"` });
  }
  if (isRelative(specifier) || specifier.startsWith("/")) {
    const target = resolve(dirname(file), specifier);
    if (!isInside(ctx.clientRoot, target)) {
      out.push({ rule: "a", where, message: `imports "${specifier}", which is outside client/` });
    } else if (ctx.pkg?.kind === "plugin" && !isInside(ctx.pkg.dir, target)) {
      out.push({
        rule: "c",
        where,
        message: `plugin imports "${specifier}", which is outside the plugin`,
      });
    }
    return out;
  }

  const pkg = ctx.pkg;
  if (!pkg) return out;
  const name = packageName(specifier);

  if (pkg.kind === "plugin") {
    const allowed = TEST_FILE.test(file)
      ? [...PLUGIN_ALLOWED, ...PLUGIN_TEST_ALLOWED]
      : PLUGIN_ALLOWED;
    if (
      !allowed.includes(specifier) &&
      !(name === "@lydie/plugin-api" && specifier.startsWith(name))
    ) {
      out.push({
        rule: "c",
        where,
        message: `plugin imports "${specifier}"; plugins may import only ${PLUGIN_ALLOWED.join(", ")}`,
      });
    }
  } else if (name.startsWith("@lydie/") && name !== pkg.name) {
    out.push(...checkInternal(pkg, name, where));
  }

  if ((pkg.kind === "plugin" || UI_PACKAGES.includes(pkg.name)) && isForbiddenInUi(specifier)) {
    out.push({
      rule: "d",
      where,
      message: `UI code imports "${specifier}"; UI never touches the filesystem or SQL`,
    });
  }
  return out;
}

function checkInternal(pkg: PackageInfo, dep: string, where: string): Violation[] {
  const allowed = ALLOWED_INTERNAL[pkg.name];
  if (!allowed) {
    return [
      {
        rule: "b",
        where,
        message: `${pkg.name} is not in the boundary table; add it to check-boundaries.ts`,
      },
    ];
  }
  if (allowed.includes(dep)) return [];
  // Built-in plugins are registered by the apps, and by nothing else.
  if (pkg.kind === "app" && dep.startsWith("@lydie/plugin-") && dep !== "@lydie/plugin-api") {
    return [];
  }
  const list = allowed.length ? allowed.join(", ") : "no internal packages";
  return [{ rule: "b", where, message: `${pkg.name} depends on ${dep}; allowed: ${list}` }];
}

type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

// Checks the dependency fields of a package.json at `file` (absolute path).
export function checkManifest(ctx: CheckContext, file: string, manifest: Manifest): Violation[] {
  const where = relative(ctx.clientRoot, file);
  const out: Violation[] = [];
  const fields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const;

  for (const field of fields) {
    for (const [dep, version] of Object.entries(manifest[field] ?? {})) {
      if (dep.startsWith("@lydie-core/")) {
        out.push({ rule: "a", where, message: `${field} includes private core package "${dep}"` });
      }
      const path = /^(?:file|link|portal):(.+)$/.exec(version)?.[1];
      if (path && !isInside(ctx.clientRoot, resolve(dirname(file), path))) {
        out.push({
          rule: "a",
          where,
          message: `${field}.${dep} points outside client/ ("${version}")`,
        });
      }

      const pkg = ctx.pkg;
      if (!pkg) continue;
      if (pkg.kind === "plugin") {
        const allowed = field === "devDependencies" || PLUGIN_ALLOWED.includes(dep);
        if (!allowed) {
          out.push({
            rule: "c",
            where,
            message: `plugin ${field} includes "${dep}"; only @lydie/plugin-api and react`,
          });
        }
      } else if (dep.startsWith("@lydie/") && dep !== pkg.name) {
        out.push(...checkInternal(pkg, dep, `${where} (${field})`));
      }
      if (
        (pkg.kind === "plugin" || UI_PACKAGES.includes(pkg.name)) &&
        field !== "devDependencies"
      ) {
        if (isForbiddenInUi(dep)) {
          out.push({ rule: "d", where, message: `UI package ${field} includes "${dep}"` });
        }
      }
    }
  }
  return out;
}

function listWorkspacePackages(clientRoot: string): PackageInfo[] {
  const groups: [string, PackageKind][] = [
    ["packages", "package"],
    ["plugins", "plugin"],
    ["apps", "app"],
  ];
  const out: PackageInfo[] = [];
  for (const [group, kind] of groups) {
    const base = join(clientRoot, group);
    let entries: string[] = [];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const dir = join(base, entry);
      try {
        const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
        if (manifest.name) out.push({ name: manifest.name, kind, dir });
      } catch {
        // Not a package (no package.json).
      }
    }
  }
  return out;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function checkClient(clientRoot: string): Violation[] {
  const packages = listWorkspacePackages(clientRoot);
  const owner = (file: string) => packages.find((p) => isInside(p.dir, file));
  const violations: Violation[] = [];

  for (const file of walk(clientRoot)) {
    if (SKIP_FILES.has(relative(clientRoot, file).split(sep).join("/"))) continue;
    const ctx: CheckContext = { clientRoot, pkg: owner(file) };
    if (file.endsWith(`${sep}package.json`)) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
      violations.push(...checkManifest(ctx, file, manifest));
    } else if (SOURCE_EXT.test(file) && !file.endsWith(".d.ts")) {
      for (const specifier of extractImports(readFileSync(file, "utf8"))) {
        violations.push(...checkSpecifier(ctx, file, specifier));
      }
    }
  }
  return violations;
}

if (import.meta.main) {
  const clientRoot = resolve(import.meta.dir, "..");
  const violations = checkClient(clientRoot);
  if (violations.length === 0) {
    console.log("Package boundaries OK.");
  } else {
    console.error(
      `Found ${violations.length} boundary violation(s) (rules in client/scripts/check-boundaries.ts):\n`,
    );
    for (const v of violations) console.error(`  [${v.rule}] ${v.where}: ${v.message}`);
    process.exit(1);
  }
}
