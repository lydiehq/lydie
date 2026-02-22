import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import aws from "astro-sst";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://lydie.co",
  integrations: [mdx(), react()],
  output: "static",
  adapter: aws(),
  devToolbar: {
    enabled: false,
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ["@fluentui/react-icons"],
    },
    resolve: {
      alias: {
        "@/": new URL("./src/", import.meta.url).pathname,
      },
    },
  },
  trailingSlash: "never",
  redirects: {
    "/blog/knowledge-bases": "/knowledge-bases",
    "/blog/what-is-an-internal-knowledge-base": "/knowledge-bases/internal",
    "/blog/what-is-an-external-knowledge-base": "/knowledge-bases/external",
  },
  image: {
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: {
        limitInputPixels: false,
      },
    },
    domains: ["lydie.co"],
    remotePatterns: [],
  },
});
