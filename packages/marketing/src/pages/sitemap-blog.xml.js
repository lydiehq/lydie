import { collections, getCollectionDocuments } from "../utils/lydie-client";
import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

export async function GET() {
  try {
    const { documents: blogPosts } = await getCollectionDocuments(collections.blog);

    const urls = [];

    for (const post of blogPosts) {
      const slug =
        typeof post.fields?.slug === "string" && post.fields.slug.length > 0
          ? post.fields.slug
          : post.id;
      const updatedAt = typeof post.updatedAt === "string" ? post.updatedAt : null;
      const createdAt = typeof post.createdAt === "string" ? post.createdAt : null;
      const lastmod = updatedAt || createdAt;

      urls.push(
        generateUrlEntry({
          path: `/blog/${slug}`,
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
