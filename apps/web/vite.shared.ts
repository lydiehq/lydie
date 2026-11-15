// What any bundler of this app needs, whether it builds the app itself (vite.config.ts) or a page
// that mounts it (`@lydie/web/try`, e.g. the marketing site's try-out).
import { powersyncOpfsFix } from "@lydie/store/vite";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

export function appVite(): Pick<UserConfig, "plugins" | "optimizeDeps" | "worker"> {
  return {
    // Lets SQLite roll back an interrupted write in OPFS instead of failing every later open
    // (LYD-279). Workers need it too: the database runs in PowerSync's worker.
    plugins: [
      powersyncOpfsFix(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    // PowerSync's web SDK ships its SQLite (wa-sqlite) as workers and WASM: do not pre-bundle it.
    optimizeDeps: { exclude: ["@journeyapps/wa-sqlite", "@powersync/web"] },
    worker: { format: "es", plugins: () => [powersyncOpfsFix()] },
  };
}
