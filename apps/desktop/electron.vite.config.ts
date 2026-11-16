import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Keep Vite's cache in the install root's node_modules, as apps/web does.
const installedNodeModules = dirname(
  dirname(createRequire(import.meta.url).resolve("vite/package.json")),
);

export default defineConfig(({ command }) => ({
  main: {
    resolve: {
      // fflate's Node build declares a top-level `require`, and electron-vite's CommonJS shim
      // then declares another in the same chunk (a SyntaxError at launch). Lydie uses only the
      // synchronous APIs (Zip, inflateSync), which are the same in the browser build.
      alias: [{ find: /^fflate$/, replacement: "fflate/browser" }],
    },
    build: {
      minify: command === "build",
      rolldownOptions: {
        input: { index: "src/main/index.ts" },
        output: { format: "es" },
      },
    },
  },
  preload: {
    build: {
      minify: command === "build",
      // Sandboxed preloads cannot require anything but "electron": bundle every dependency.
      externalizeDeps: false,
      rolldownOptions: {
        input: { index: "src/preload/index.ts" },
        external: ["electron"],
        // The package is "type": "module"; a .cjs name keeps Node from treating it as ESM when
        // the sandbox is off (e.g. in some test setups).
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  // Only the dev-only diagnostic page. The real UI is apps/web, loaded from its dev server or
  // its build output.
  renderer: {
    root: "src/renderer",
    cacheDir: join(installedNodeModules, ".vite", "desktop"),
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: { port: 5184, strictPort: true },
    build: {
      minify: command === "build",
      rolldownOptions: {
        input: { diagnostics: resolve(import.meta.dirname, "src/renderer/diagnostics.html") },
      },
    },
  },
}));
