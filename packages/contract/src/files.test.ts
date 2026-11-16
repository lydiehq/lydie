import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// The packages a module loads, following its relative imports (type-only imports are erased).
function packagesLoadedBy(entry: string): Set<string> {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const packages = new Set<string>();
  const seen = new Set<string>();
  const queue = [resolve(import.meta.dir, entry)];
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const { path } of transpiler.scanImports(readFileSync(file, "utf8"))) {
      if (path.startsWith(".")) queue.push(resolve(dirname(file), path));
      else packages.add(path);
    }
  }
  return packages;
}

describe("entry points", () => {
  test("the main entry point does not load yaml", () => {
    expect([...packagesLoadedBy("index.ts")]).not.toContain("yaml");
  });

  test("files does", () => {
    expect([...packagesLoadedBy("files.ts")]).toContain("yaml");
  });
});
