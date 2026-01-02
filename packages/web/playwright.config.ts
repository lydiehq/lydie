import { defineConfig, devices } from "@playwright/test";

// Check if running in containerized mode (without SST)
const isContainerized = process.env.E2E_CONTAINERIZED === "true" || !process.env.SST_RESOURCE_App;

// Dynamically import Resource only if not in containerized mode
let Resource: any = {};
if (!isContainerized) {
  try {
    const sst = await import("sst");
    Resource = sst.Resource;
  } catch (error) {
    console.warn("SST not available, using environment variables for configuration");
  }
}

// Determine stage and base URL
const stage = Resource.App?.stage || process.env.STAGE || "dev";
const isProduction = stage === "production";
const baseURL = process.env.BASE_URL || 
  (isProduction ? "https://lydie.co" : "http://localhost:3000");

export default defineConfig({
  testDir: "./tests/e2e",
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: isProduction,
  // Retry on CI only
  retries: isProduction ? 2 : 0,
  // Reporter to use
  reporter: [["html"], ["list"]],
  timeout: 15_000,
  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL,
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
