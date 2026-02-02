import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

// Static pages to include in sitemap
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
  { path: "/features/ai-assistant", priority: "0.7", changefreq: "monthly" },
  { path: "/features/collaborative-editing", priority: "0.7", changefreq: "monthly" },
  { path: "/features/knowledge-base", priority: "0.7", changefreq: "monthly" },
  { path: "/documentation", priority: "0.7", changefreq: "monthly" },
  { path: "/documentation/sdk", priority: "0.6", changefreq: "monthly" },
  { path: "/integrations", priority: "0.8", changefreq: "monthly" },
  { path: "/compare", priority: "0.8", changefreq: "monthly" },
  { path: "/tools", priority: "0.7", changefreq: "weekly" },
  { path: "/tools/convert", priority: "0.7", changefreq: "weekly" },
];

// Integration pages
const integrations = [
  { id: "github", priority: "0.6" },
  { id: "wordpress", priority: "0.6" },
  { id: "shopify", priority: "0.6" },
  { id: "blogger", priority: "0.6" },
];

// Comparison pages
const comparisons = [
  { slug: "google-docs", priority: "0.6" },
  { slug: "notion", priority: "0.6" },
  { slug: "coda", priority: "0.6" },
  { slug: "confluence", priority: "0.6" },
  { slug: "evernote", priority: "0.6" },
  { slug: "onenote", priority: "0.6" },
  { slug: "nuclino", priority: "0.6" },
];

export async function GET() {
  const urls = [];

  // Static pages
  for (const page of staticPages) {
    urls.push(generateUrlEntry(page));
  }

  // Integration pages
  for (const integration of integrations) {
    urls.push(
      generateUrlEntry({
        path: `/integrations/${integration.id}`,
        priority: integration.priority,
        changefreq: "monthly",
      }),
    );
  }

  // Comparison pages
  for (const comparison of comparisons) {
    urls.push(
      generateUrlEntry({
        path: `/compare/${comparison.slug}`,
        priority: comparison.priority,
        changefreq: "monthly",
      }),
    );
  }

  const sitemap = generateSitemap(urls);

  return new Response(sitemap, {
    headers: sitemapHeaders,
  });
}
