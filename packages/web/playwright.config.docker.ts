import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

function loadRootEnvFile() {
  const envPath = fileURLToPath(new URL("../../.env", import.meta.url));

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      process.env[key] = value.slice(1, -1);
    } else {
      process.env[key] = value;
    }
  }
}

loadRootEnvFile();

/**
 * Playwright configuration for running e2e tests against Docker builds.
 *
 * Used by:
 * - CI: `bunx playwright test --config playwright.config.docker.ts` (host-side, hitting localhost:3000)
 * - Docker runner: `--profile test` container (inside Docker network, hitting web:80)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 15_000,
  workers: 4,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    extraHTTPHeaders: {},
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
});
