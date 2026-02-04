import { generateSitemapIndex, sitemapHeaders } from "./sitemap-utils.js";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const sitemaps = [
    { path: "sitemap-pages.xml", lastmod: today },
    { path: "sitemap-templates.xml", lastmod: today },
    { path: "sitemap-blog.xml", lastmod: today },
    { path: "sitemap-tools.xml", lastmod: today },
  ];

  const sitemapIndex = generateSitemapIndex(sitemaps);

  return new Response(sitemapIndex, {
    headers: sitemapHeaders,
  });
}
