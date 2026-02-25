import { defineConfig, devices } from "@playwright/test";

const stage = process.env.APP_STAGE || "development";

export default defineConfig({
  testDir: "./tests/e2e",
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: stage === "production",
  // Retry on CI only
  retries: 0,
  // Reporter to use
  timeout: 10_000,
  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: stage === "production" ? "https://lydie.co" : "http://localhost:3000",
    // API URL for backend calls
    extraHTTPHeaders: {
      // Add any default headers here
    },
    // Collect trace when retrying the failed test
    trace: "on-first-retry",
    // Screenshot on failure
    screenshot: "only-on-failure",
    // Video on failure
    video: "retain-on-failure",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
