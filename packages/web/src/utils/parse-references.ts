/**
 * Parses text content for reference patterns and extracts them
 * Supports: [reference_document:id:xyz], [reference_landmark:...] (extensible)
 */

export type ReferenceType = "document" | "landmark"

export interface Reference {
	type: ReferenceType
	id: string
	startIndex: number
	endIndex: number
	raw: string
}

export interface ParsedTextSegment {
	type: "text" | "reference"
	content: string
	reference?: Reference
}

// Single regex pattern to match all reference types
// Pattern: [reference_{type}:id:{value}]
const REFERENCE_PATTERN = /\[reference_(\w+):id:([^\]]+)\]/g

/**
 * Parses text and returns an array of segments (text and references)
 * This is performant as it only does a single pass through the text
 */
export function parseReferences(text: string): ParsedTextSegment[] {
	const segments: ParsedTextSegment[] = []
	let lastIndex = 0

	// Use matchAll for efficient iteration
	const matches = text.matchAll(REFERENCE_PATTERN)

	for (const match of matches) {
		const [fullMatch, type, id] = match
		const startIndex = match.index!

		// Add text segment before this reference (if any)
		if (startIndex > lastIndex) {
			segments.push({
				type: "text",
				content: text.slice(lastIndex, startIndex),
			})
		}

		// Add reference segment
		segments.push({
			type: "reference",
			content: fullMatch,
			reference: {
				type: type as ReferenceType,
				id,
				startIndex,
				endIndex: startIndex + fullMatch.length,
				raw: fullMatch,
			},
		})

		lastIndex = startIndex + fullMatch.length
	}

	// Add remaining text after last reference (if any)
	if (lastIndex < text.length) {
		segments.push({
			type: "text",
			content: text.slice(lastIndex),
		})
	}

	// If no references were found, return the entire text as a single segment
	if (segments.length === 0) {
		segments.push({
			type: "text",
			content: text,
		})
	}

	return segments
}

/**
 * Quick check if text contains any references
 * Useful for optimization - skip parsing if no references exist
 */
export function hasReferences(text: string): boolean {
	return REFERENCE_PATTERN.test(text)
}
