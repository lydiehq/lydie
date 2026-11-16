import { expect, test } from "bun:test";

import type { Rolldown } from "vite";

import { startupFiles } from "./vite-startup.ts";

type Bundle = Rolldown.OutputBundle;

function chunk(fileName: string, fields: Record<string, unknown>) {
  return {
    type: "chunk",
    fileName,
    code: "",
    imports: [],
    dynamicImports: [],
    moduleIds: [],
    isEntry: false,
    facadeModuleId: null,
    ...fields,
  };
}

function asset(fileName: string, source: string) {
  return { type: "asset", fileName, source };
}

// The shape of a build: a small entry, the app behind a dynamic import, the in-page database
// behind another, PowerSync's worker emitted as plain files.
const bundle = Object.fromEntries(
  [
    chunk("assets/index-1.js", {
      isEntry: true,
      facadeModuleId: "/w/apps/web/index.html",
      moduleIds: ["/w/apps/web/src/main.tsx"],
      imports: ["assets/helper-1.js"],
      viteMetadata: { importedCss: new Set(["assets/index-1.css"]) },
    }),
    chunk("assets/helper-1.js", {}),
    chunk("assets/mount-1.js", {
      moduleIds: ["/w/apps/web/src/mount.tsx"],
      imports: ["assets/react-1.js", "assets/helper-1.js"],
    }),
    chunk("assets/react-1.js", {}),
    chunk("assets/compose-browser-1.js", {
      moduleIds: ["/w/apps/web/src/compose-browser.ts"],
      imports: ["assets/web-1.js", "assets/react-1.js"],
    }),
    chunk("assets/web-1.js", { moduleIds: ["/w/packages/store/src/web.ts"] }),
    chunk("assets/settings-1.js", { moduleIds: ["/w/plugins/settings/src/index.tsx"] }),
    asset(
      "assets/worker-AbCdEfGh.js",
      'import("./wa-sqlite-12345678.js");import("./wa-sqlite-async-12345678.js");import("./SimpleOpfsFileSystem-abcdefgh.js")',
    ),
    asset("assets/wa-sqlite-12345678.js", 'new URL("wa-sqlite-ABCDEFGH.wasm", import.meta.url)'),
    asset("assets/wa-sqlite-async-12345678.js", ""),
    asset("assets/SimpleOpfsFileSystem-abcdefgh.js", ""),
    asset("assets/wa-sqlite-ABCDEFGH.wasm", ""),
    asset("assets/inter-latin-wght-normal-Xy12.woff2", ""),
    asset("assets/inter-greek-wght-normal-Zz34.woff2", ""),
  ].map((file) => [file.fileName, file]),
) as unknown as Bundle;

const entry = bundle["assets/index-1.js"] as Rolldown.OutputChunk;

test("startup files: the app's chunks, then what only a browser window needs", () => {
  const files = startupFiles(bundle, entry);
  expect(files.app).toEqual(["assets/mount-1.js", "assets/react-1.js"]);
  expect(files.browser).toEqual([
    { href: "assets/compose-browser-1.js", rel: "modulepreload" },
    { href: "assets/web-1.js", rel: "modulepreload" },
    { href: "assets/worker-AbCdEfGh.js", rel: "preload" },
    { href: "assets/wa-sqlite-12345678.js", rel: "preload" },
    { href: "assets/SimpleOpfsFileSystem-abcdefgh.js", rel: "preload" },
    { href: "assets/wa-sqlite-ABCDEFGH.wasm", rel: "preload" },
  ]);
  expect(files.font).toBe("assets/inter-latin-wght-normal-Xy12.woff2");
});
