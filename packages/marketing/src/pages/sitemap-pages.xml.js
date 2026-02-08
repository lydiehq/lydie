import { comparisons } from "../data/comparisons";
import { getAllFeaturePaths } from "../data/features";
import { integrations } from "../data/integrations";
import { useCases } from "../data/use-cases";
import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

// Static pages to include in sitemap (pages without dynamic registries)
const staticPages = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/pricing", priority: "0.9", changefreq: "weekly" },
  { path: "/roadmap", priority: "0.6", changefreq: "weekly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/blog", priority: "0.8", changefreq: "daily" },
  { path: "/templates", priority: "0.9", changefreq: "weekly" },
  { path: "/templates/categories", priority: "0.8", changefreq: "weekly" },
  { path: "/features", priority: "0.8", changefreq: "weekly" },
  { path: "/documentation", priority: "0.7", changefreq: "monthly" },
  { path: "/documentation/sdk", priority: "0.6", changefreq: "monthly" },
  { path: "/integrations", priority: "0.8", changefreq: "monthly" },
  { path: "/compare", priority: "0.8", changefreq: "monthly" },
  { path: "/use-cases", priority: "0.8", changefreq: "monthly" },
  { path: "/tools", priority: "0.7", changefreq: "weekly" },
  { path: "/tools/convert", priority: "0.7", changefreq: "weekly" },
];

export async function GET() {
  const urls = [];

  // Static pages
  for (const page of staticPages) {
    urls.push(generateUrlEntry(page));
  }

  // Feature pages (includes main feature pages and subpages)
  for (const featurePath of getAllFeaturePaths()) {
    urls.push(
      generateUrlEntry({
        ...featurePath,
        priority: "0.7",
        changefreq: "monthly",
      }),
    );
  }

  // Integration pages
  for (const integration of integrations) {
    urls.push(
      generateUrlEntry({
        path: `/integrations/${integration.id}`,
        priority: integration.sitemapPriority || "0.6",
        changefreq: "monthly",
      }),
    );
  }

  // Comparison pages
  for (const comparison of comparisons) {
    urls.push(
      generateUrlEntry({
        path: `/compare/${comparison.slug}`,
        priority: comparison.sitemapPriority || "0.6",
        changefreq: "monthly",
      }),
    );
  }

  // Use case pages
  for (const useCase of useCases) {
    urls.push(
      generateUrlEntry({
        path: `/use-cases/${useCase.slug}`,
        priority: useCase.sitemapPriority || "0.7",
        changefreq: "monthly",
      }),
    );
  }

  const sitemap = generateSitemap(urls);

  return new Response(sitemap, {
    headers: sitemapHeaders,
  });
}
