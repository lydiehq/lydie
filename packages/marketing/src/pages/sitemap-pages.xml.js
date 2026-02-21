import { comparisons } from "../data/comparisons";
import { getAllFeaturePaths } from "../data/features";
import { integrations } from "../data/integrations";
import { getAllRoleUseCaseCombinations } from "../data/role-use-cases";
import { getAllRoles } from "../data/roles";
import { getAllUseCaseSlugs } from "../data/use-case-definitions";
import { collections, getCollectionDocumentsWithPaths } from "../utils/lydie-client";
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
  { path: "/for", priority: "0.8", changefreq: "monthly" },
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

  // Role hub pages (e.g., /for/researchers) - only visible ones
  const roles = getAllRoles().filter((role) => role.visible);
  for (const role of roles) {
    urls.push(
      generateUrlEntry({
        path: `/for/${role.slug}`,
        priority: "0.7",
        changefreq: "monthly",
      }),
    );
  }

  // Role + use case combination pages (e.g., /for/researchers/note-taking) - only visible ones
  const roleUseCases = getAllRoleUseCaseCombinations().filter((ruc) => ruc.visible);
  for (const roleUseCase of roleUseCases) {
    urls.push(
      generateUrlEntry({
        path: `/for/${roleUseCase.roleSlug}/${roleUseCase.useCaseSlug}`,
        priority: "0.6",
        changefreq: "monthly",
      }),
    );
  }

  // Use case pages (e.g., /use-cases/note-taking)
  const useCaseSlugs = getAllUseCaseSlugs();
  for (const useCaseSlug of useCaseSlugs) {
    urls.push(
      generateUrlEntry({
        path: `/use-cases/${useCaseSlug}`,
        priority: "0.7",
        changefreq: "monthly",
      }),
    );
  }

  // Knowledge base pages (root + articles)
  try {
    const { documents } = await getCollectionDocumentsWithPaths(collections.knowledgeBases, {
      sortBy: "created_at",
      sortOrder: "asc",
    });

    for (const doc of documents) {
      const path = doc.path === "/" ? "/knowledge-bases" : `/knowledge-bases${doc.path}`;
      const updatedAt = typeof doc.updatedAt === "string" ? doc.updatedAt : null;
      const createdAt = typeof doc.createdAt === "string" ? doc.createdAt : null;
      const lastmod = updatedAt || createdAt;

      urls.push(
        generateUrlEntry({
          path,
          priority: doc.path === "/" ? "0.8" : "0.7",
          changefreq: "monthly",
          lastmod: lastmod ? new Date(lastmod).toISOString().split("T")[0] : undefined,
        }),
      );
    }
  } catch (error) {
    console.error("Error adding knowledge base pages to sitemap:", error);
  }

  const sitemap = generateSitemap(urls);

  return new Response(sitemap, {
    headers: sitemapHeaders,
  });
}
