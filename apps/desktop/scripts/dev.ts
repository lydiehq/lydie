// `bun run dev` (or `bun run dev:desktop` from a root): starts the web app's dev server unless one is
// already running on its port, then electron-vite in dev mode pointed at it. `--diagnostics` opens
// the platform diagnostic page instead of the web app.
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const WEB_URL = "http://localhost:3000";
const desktopDir = resolve(import.meta.dirname, "..");
const webDir = resolve(desktopDir, "../web");
const diagnostics = process.argv.includes("--diagnostics");

async function isUp(url: string) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

const children: ChildProcess[] = [];
function stopAll(code = 0) {
  for (const child of children) {
    // Negative pid: the whole process group (bun → vite).
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

if (!(await isUp(WEB_URL))) {
  console.log(`[desktop] starting the web dev server on ${WEB_URL}`);
  const web = spawn("bun", ["run", "dev"], { cwd: webDir, stdio: "inherit", detached: true });
  children.push(web);
  const deadline = Date.now() + 60_000;
  while (!(await isUp(WEB_URL))) {
    if (web.exitCode !== null || Date.now() > deadline) {
      console.error("[desktop] the web dev server did not start");
      stopAll(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
} else {
  console.log(`[desktop] using the web dev server already running on ${WEB_URL}`);
}

// The trackpad addon (two-finger swipes); without Xcode's tools the app starts without them.
spawnSync("bun", [resolve(desktopDir, "scripts/build-native.ts"), "--optional"], {
  stdio: "inherit",
});

const electronVite = spawn("bunx", ["electron-vite", "dev"], {
  cwd: desktopDir,
  stdio: "inherit",
  detached: true,
  env: {
    ...process.env,
    LYDIE_WEB_URL: WEB_URL,
    ...(diagnostics ? { LYDIE_DIAGNOSTICS: "1" } : {}),
  },
});
children.push(electronVite);
electronVite.on("exit", (code) => stopAll(code ?? 0));
