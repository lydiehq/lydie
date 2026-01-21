import rss from "@astrojs/rss"
import { lydieClient } from "../utils/lydie-client"

export async function GET(context) {
	let posts = []

	try {
		const { documents } = await lydieClient.getDocuments()
		posts = documents
	} catch (error) {
		console.error("Failed to fetch blog posts for RSS:", error)
		posts = []
	}

	// Sort posts by date (newest first)
	const sortedPosts = posts.sort((a, b) => {
		const dateA = new Date(a.createdAt || a.updatedAt || 0)
		const dateB = new Date(b.createdAt || b.updatedAt || 0)
		return dateB.getTime() - dateA.getTime()
	})

	return rss({
		title: "Lydie Blog",
		description: "A minimal, powerful writing environment supercharged with AI.",
		site: context.site,
		items: sortedPosts.map((post) => ({
			title: post.title,
			link: `/blog/${post.slug}/`,
			pubDate: new Date(post.createdAt || post.updatedAt),
		})),
	})
}
