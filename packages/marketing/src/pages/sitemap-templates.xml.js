import { getCategoriesFromDb, flattenCategories } from "../data/categories";
import { getAllTemplates } from "../data/templates";
import { generateUrlEntry, generateSitemap, sitemapHeaders } from "./sitemap-utils.js";

export async function GET() {
  try {
    const [templates, categories] = await Promise.all([getAllTemplates(), getCategoriesFromDb()]);

    const urls = [];

    // Template pages
    for (const template of templates) {
      urls.push(
        generateUrlEntry({
          path: `/templates/${template.slug}`,
          priority: "0.6",
          changefreq: "weekly",
        }),
      );
    }

    // Category pages
    const allCategories = flattenCategories(categories);
    for (const category of allCategories) {
      if (category.path) {
        urls.push(
          generateUrlEntry({
            path: category.path,
            priority: "0.5",
            changefreq: "weekly",
          }),
        );
      }
    }

    const sitemap = generateSitemap(urls);

    return new Response(sitemap, {
      headers: sitemapHeaders,
    });
  } catch (error) {
    console.error("Error generating templates sitemap:", error);

    // Return empty sitemap on error
    const sitemap = generateSitemap([]);
    return new Response(sitemap, {
      headers: sitemapHeaders,
    });
  }
}
