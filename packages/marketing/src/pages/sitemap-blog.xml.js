import { lydieClient } from "../utils/lydie-client";
import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

export async function GET() {
  try {
    const { documents: blogPosts } = await lydieClient.getDocuments();

    const urls = [];

    for (const post of blogPosts) {
      const lastmod = post.updatedAt || post.createdAt;
      urls.push(
        generateUrlEntry({
          path: `/blog/${post.slug}`,
          priority: "0.7",
          changefreq: "monthly",
          lastmod: lastmod ? new Date(lastmod).toISOString().split("T")[0] : undefined,
        }),
      );
    }

    const sitemap = generateSitemap(urls);

    return new Response(sitemap, {
      headers: sitemapHeaders,
    });
  } catch (error) {
    console.error("Error generating blog sitemap:", error);

    // Return empty sitemap on error
    const sitemap = generateSitemap([]);
    return new Response(sitemap, {
      headers: sitemapHeaders,
    });
  }
}
