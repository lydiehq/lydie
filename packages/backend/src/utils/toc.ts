export function extractTableOfContents(jsonContent: any): Array<{ id: string; level: number; text: string }> {
	const headings: Array<{ id: string; level: number; text: string }> = []
	let headingCounter = 0

	const extractTextFromNode = (node: any): string => {
		if (node.type === "text") {
			return node.text || ""
		}

		if (node.content && Array.isArray(node.content)) {
			return node.content.map(extractTextFromNode).join("")
		}

		return ""
	}

	const traverseNode = (node: any) => {
		if (node.type === "heading") {
			const level = node.attrs?.level || 1
			const text = extractTextFromNode(node)
			if (text.trim()) {
				headings.push({
					id: `heading-${headingCounter++}`,
					level,
					text: text.trim(),
				})
			}
		}

		if (node.content && Array.isArray(node.content)) {
			node.content.forEach(traverseNode)
		}
	}

	if (jsonContent) {
		traverseNode(jsonContent)
	}

	return headings
}
