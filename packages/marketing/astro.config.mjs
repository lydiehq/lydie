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
    envDir: "../../",
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
    "/blog/knowledge-bases": {
      destination: "/knowledge-bases",
      status: 301,
    },
    "/blog/what-is-an-internal-knowledge-base": {
      destination: "/knowledge-bases/internal",
      status: 301,
    },
    "/blog/what-is-an-external-knowledge-base": {
      destination: "/knowledge-bases/external",
      status: 301,
    },
    "blog/how-to-structure-a-knowledge-base": {
      destination: "/knowledge-bases/structure",
      status: 301,
    },
    "blog/knowledge-base-best-practices": {
      destination: "/knowledge-bases/maintenance",
      status: 301,
    },
    "blog/what-is-a-personal-knowledge-base": {
      destination: "/knowledge-bases/personal",
      status: 301,
    },
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
