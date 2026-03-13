import { collections, getCollectionDocuments } from "../utils/lydie-client";

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  coverImage?: string | null;
};

/**
 * Fetch blog posts by their slugs.
 * Returns posts in the order requested (missing posts are filtered out).
 */
export async function getBlogPostsBySlugs(slugs: string[]): Promise<BlogPost[]> {
  if (slugs.length === 0) {
    return [];
  }

  try {
    const { documents } = await getCollectionDocuments(collections.blog, {
      limit: 100,
      sortBy: "created_at",
      sortOrder: "desc",
    });

    // Create a map for quick lookup and maintain order
    const documentsBySlug = new Map<string, (typeof documents)[number]>(
      documents
        .map((doc) => {
          const rawSlug = doc.fields?.slug;
          const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
          if (!slug) return null;

          const normalized = slug.replace(/^\/+|\/+$/g, "");
          if (!normalized) return null;

          return [normalized, doc] as const;
        })
        .filter((entry): entry is readonly [string, (typeof documents)[number]] => entry !== null),
    );

    // Return in the order requested, filtering out any missing posts
    return slugs
      .map((slug) => documentsBySlug.get(slug))
      .filter((doc): doc is (typeof documents)[number] => doc !== undefined)
      .map((doc) => ({
        id: String(doc.id),
        title: String(doc.title),
        slug: String(doc.fields?.slug ?? "").replace(/^\/+|\/+$/g, ""),
        createdAt: typeof doc.createdAt === "string" ? doc.createdAt : undefined,
        updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : undefined,
        coverImage:
          typeof doc.coverImage === "string" || doc.coverImage === null
            ? doc.coverImage
            : undefined,
      }));
  } catch (error) {
    console.error("Failed to fetch blog posts by slugs:", error);
    return [];
  }
}
