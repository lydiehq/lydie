import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  server: {
    // Required for Docker - accept connections from any host
    host: "0.0.0.0",
    port: 3000,
    // HMR configuration for Docker
    hmr: {
      // Use polling for file watching in Docker (more reliable than native watchers)
      // You can set CHOKIDAR_USEPOLLING=true environment variable instead
      // clientPort: 24678,
    },
    // Watch options for file changes
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
