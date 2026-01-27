import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  test: {
    // Use jsdom for DOM testing
    environment: "jsdom",

    // Global test setup file
    setupFiles: ["./vitest.setup.ts"],

    // Include patterns for test files
    include: ["src/**/*.{test,spec}.{ts,tsx}"],

    // Exclude e2e tests (those use Playwright)
    exclude: ["tests/e2e/**", "node_modules/**"],

    // Enable globals like describe, it, expect without imports
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "tests/**",
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "src/test-utils/**",
        "src/routes/**", // Route components are better tested with e2e
      ],
    },

    // Timeout for async tests
    testTimeout: 10000,

    // CSS handling
    css: true,
  },
});
