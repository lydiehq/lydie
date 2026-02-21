import type { DocumentListItem } from "@lydie/core/content";

import { lydieClient } from "../utils/lydie-client";

export type BlogPost = DocumentListItem;

/**
 * Fetch blog posts by their slugs.
 * Returns posts in the order requested (missing posts are filtered out).
 */
export async function getBlogPostsBySlugs(slugs: string[]): Promise<BlogPost[]> {
  if (slugs.length === 0) {
    return [];
  }

  try {
    const { documents } = await lydieClient.getDocumentsBySlugs(slugs);

    // Create a map for quick lookup and maintain order
    const documentsBySlug = new Map(documents.map((doc) => [doc.slug, doc]));

    // Return in the order requested, filtering out any missing posts
    return slugs
      .map((slug) => documentsBySlug.get(slug))
      .filter((doc): doc is BlogPost => doc !== undefined);
  } catch (error) {
    console.error("Failed to fetch blog posts by slugs:", error);
    return [];
  }
}
