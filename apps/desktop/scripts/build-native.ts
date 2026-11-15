// Builds native/trackpad.mm into native/build/trackpad.node: a universal (arm64 + x64) Node-API
// addon, compiled with Xcode's clang (no node-gyp). macOS only; elsewhere it does nothing.
// `--optional` (development) warns instead of failing, so the app starts without swipe gestures.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const optional = process.argv.includes("--optional");
const desktopDir = resolve(import.meta.dirname, "..");

if (process.platform !== "darwin") process.exit(0);

const headers = (createRequire(import.meta.url)("node-api-headers") as { include_dir: string })
  .include_dir;
const outDir = join(desktopDir, "native", "build");
mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  "xcrun",
  [
    "clang++",
    "-std=c++20",
    "-fobjc-arc",
    "-O2",
    "-bundle",
    // Node-API symbols resolve against Electron at load time.
    "-undefined",
    "dynamic_lookup",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-mmacosx-version-min=12.0",
    "-DNODE_GYP_MODULE_NAME=trackpad",
    "-DNAPI_VERSION=8",
    `-I${headers}`,
    "-framework",
    "AppKit",
    join(desktopDir, "native", "trackpad.mm"),
    "-o",
    join(outDir, "trackpad.node"),
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  const message = "[desktop] could not build native/trackpad.mm (needs Xcode command line tools)";
  if (!optional) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message}; starting without two-finger swipe navigation`);
}
