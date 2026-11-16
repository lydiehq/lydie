import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { transformAsync } from "@babel/core";

// The React Compiler skips a component it cannot compile without saying so, and the code here is
// written for its memoisation (inline closures and objects in render). So a skip, or a toolchain
// change that breaks compilation (Babel 8 skipped every component with a destructuring default),
// fails the tests instead of quietly slowing the app. A try/finally or a try without catch in a
// component is the usual cause: use a promise chain instead.

const root = join(import.meta.dir, "../..");

// The files vite.shared.ts gives the compiler: client code with a component or hook.
const CODE_FILTER = /forwardRef|memo|\b(?:[A-Z]|use[A-Z0-9])/;

function sources(): string[] {
  const files: string[] = [];
  for (const dir of ["apps", "packages", "plugins"]) {
    for (const file of new Bun.Glob("**/src/**/*.{ts,tsx}").scanSync({ cwd: join(root, dir) })) {
      if (/\.(test|e2e)\.tsx?$|\.d\.ts$|\/(main|preload)\//.test(file)) continue;
      files.push(join(root, dir, file));
    }
  }
  return files;
}

async function skipped(file: string): Promise<string[]> {
  const code = readFileSync(file, "utf8");
  if (!CODE_FILTER.test(code)) return [];
  const found: string[] = [];
  await transformAsync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        "babel-plugin-react-compiler",
        {
          logger: {
            logEvent(
              _: string | null,
              event: { kind: string; fnLoc?: { start?: { line: number } } },
            ) {
              if (event.kind === "CompileError" || event.kind === "PipelineError") {
                found.push(`${relative(root, file)}:${event.fnLoc?.start?.line ?? "?"}`);
              }
            },
          },
        },
      ],
    ],
  });
  return found;
}

describe("React Compiler", () => {
  test("compiles every component and hook", async () => {
    const skips = (await Promise.all(sources().map(skipped))).flat();
    expect(skips).toEqual([]);
  }, 120_000);
});
