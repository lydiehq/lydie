import rss from "@astrojs/rss";

import { SITE_TAGLINE } from "../config/site";
import { collections, getCollectionDocuments } from "../utils/lydie-client";

export async function GET(context) {
  let posts = [];

  try {
    const { documents } = await getCollectionDocuments(collections.blog, {
      sortBy: "created_at",
      sortOrder: "desc",
      limit: 100,
    });
    posts = documents;
  } catch (error) {
    console.error("Failed to fetch blog posts for RSS:", error);
    posts = [];
  }

  // Sort posts by date (newest first)
  const sortedPosts = posts.sort((a, b) => {
    const dateA = new Date(a.createdAt || a.updatedAt || 0);
    const dateB = new Date(b.createdAt || b.updatedAt || 0);
    return dateB.getTime() - dateA.getTime();
  });

  return rss({
    title: "Lydie Blog",
    description: SITE_TAGLINE,
    site: context.site,
    items: sortedPosts.map((post) => ({
      title: post.title,
      link: `/blog/${post.fields?.slug ?? post.id}/`,
      pubDate: new Date(post.createdAt || post.updatedAt),
    })),
  });
}
