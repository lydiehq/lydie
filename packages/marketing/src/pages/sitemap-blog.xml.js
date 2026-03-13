import { collections, getCollectionDocuments } from "../utils/lydie-client";
import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

const BLOG_POSTS_PER_PAGE = 12;

export async function GET() {
  try {
    const urls = [];
    let cursor;
    let page = 1;

    while (true) {
      const { documents: blogPosts, meta } = await getCollectionDocuments(collections.blog, {
        sortBy: "created_at",
        sortOrder: "desc",
        limit: BLOG_POSTS_PER_PAGE,
        ...(cursor ? { cursor } : {}),
      });

      if (blogPosts.length === 0) {
        break;
      }

      if (page > 1) {
        const pageLastModified = blogPosts.reduce((latest, post) => {
          const updatedAt = typeof post.updatedAt === "string" ? post.updatedAt : null;
          const createdAt = typeof post.createdAt === "string" ? post.createdAt : null;
          const candidate = updatedAt || createdAt;
          if (!candidate) return latest;
          if (!latest) return candidate;
          return candidate > latest ? candidate : latest;
        }, null);

        urls.push(
          generateUrlEntry({
            path: `/blog?page=${page}`,
            priority: "0.7",
            changefreq: "daily",
            lastmod: pageLastModified
              ? new Date(pageLastModified).toISOString().split("T")[0]
              : undefined,
          }),
        );
      }

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

      if (!meta.nextCursor) {
        break;
      }

      cursor = meta.nextCursor;
      page += 1;
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
