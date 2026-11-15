import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { defineConfig, searchForWorkspaceRoot } from "vite";

import { appVite } from "./vite.shared.ts";

// Keep Vite's cache in the install root's node_modules (wherever `bun install` ran) so no
// node_modules folder appears inside the workspace.
const installedNodeModules = dirname(
  dirname(createRequire(import.meta.url).resolve("vite/package.json")),
);

// Who may frame the app: itself and the marketing site (LYD-155). Production serves the same
// header from CloudFront.
const headers = {
  "Content-Security-Policy":
    "frame-ancestors 'self' https://lydie.co http://localhost:4300 http://127.0.0.1:4300",
};

// Vendor chunks for the code every start needs (LYD-226): they change far less often than the app,
// so a deploy leaves them cached, and they download in parallel. The lists are explicit packages,
// never a broad /node_modules/ test: a group pulls its modules into the chunk even when only a lazy
// chunk uses them, which would turn KaTeX, the drag handle or the Yjs binding into startup code.
const vendorChunks: Record<string, RegExp> = {
  react: /\/node_modules\/(react|react-dom|scheduler)\//,
  editor:
    /\/node_modules\/(prosemirror-[^/]+|orderedmap|rope-sequence|w3c-keyname|linkifyjs|@tiptap\/(core|pm|react|starter-kit|suggestion|extensions|extension-(?!drag-handle|collaboration|node-range)[^/]+))\//,
  markdown:
    /\/node_modules\/(micromark[^/]*|mdast-util-[^/]+|unist-util-[^/]+|decode-named-character-reference|character-entities[^/]*|devlop|zwitch|longest-streak|ccount|markdown-table)\//,
  // Not @journeyapps/wa-sqlite (its JavaScript loads with the database worker) nor the
  // WebSocket sync transport (hosted mode loads it when it connects).
  powersync: /\/node_modules\/@powersync\/(common|web|shared-internals)\/(?!dist\/websockets)/,
};

export default defineConfig({
  cacheDir: join(installedNodeModules, ".vite", "web"),
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: Object.entries(vendorChunks).map(([name, test]) => ({ name, test })),
        },
      },
    },
  },
  ...appVite(),
  server: {
    port: 3000,
    strictPort: true,
    headers,
    // Dependencies (fonts, etc.) can live in an install root above client/ when it is a submodule.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), installedNodeModules] },
  },
  preview: { port: 3000, strictPort: true, headers },
});
