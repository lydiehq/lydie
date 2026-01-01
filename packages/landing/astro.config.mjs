import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import aws from "astro-sst";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://lydie.co",
  integrations: [mdx(), sitemap(), react()],
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  trailingSlash: "never",
  image: {
    // Enable image optimization
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: {
        limitInputPixels: false, // Allow processing large images
      },
    },
    // Allow remote image domains if needed
    remotePatterns: [],
  },
});
