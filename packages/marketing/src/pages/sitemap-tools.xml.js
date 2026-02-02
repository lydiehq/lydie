import { conversionConfigs } from "../data/conversions";
import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

// Static tool pages
const toolPages = [
  { path: "/tools/text-summarizer", priority: "0.6", changefreq: "monthly" },
  { path: "/tools/title-generator", priority: "0.6", changefreq: "monthly" },
  { path: "/tools/word-counter", priority: "0.6", changefreq: "monthly" },
  { path: "/tools/outline-generator", priority: "0.6", changefreq: "monthly" },
];

export async function GET() {
  const urls = [];

  // Static tool pages
  for (const page of toolPages) {
    urls.push(generateUrlEntry(page));
  }

  // Conversion tool pages
  for (const config of conversionConfigs) {
    urls.push(
      generateUrlEntry({
        path: `/tools/convert/${config.slug}`,
        priority: "0.5",
        changefreq: "monthly",
      }),
    );
  }

  const sitemap = generateSitemap(urls);

  return new Response(sitemap, {
    headers: sitemapHeaders,
  });
}
