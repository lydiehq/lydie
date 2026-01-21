import type { ContentNode, TextNode, Mark } from "./types"
import { db } from "@lydie/database"
import { eq, inArray } from "drizzle-orm"
import { documentsTable } from "@lydie/database/schema"

/**
 * Transforms internal:// links in document content to relative paths.
 * By default, converts internal://[ID] to /[SLUG] for better SEO.
 * Can optionally convert to /[ID] instead.
 */

export interface LinkTransformOptions {
  /** If true, use document IDs instead of slugs (e.g., /abc123 instead of /my-document) */
  useIds?: boolean
  /** Custom base path for links (e.g., "/docs" -> "/docs/my-document") */
  basePath?: string
  /** Organization ID for looking up document slugs */
  organizationId: string
}

interface LinkMetadata {
  id: string
  slug?: string
  title?: string
  exists?: boolean
}

/**
 * Extracts all internal:// links from document content
 */
export function extractInternalLinks(content: ContentNode | TextNode): Set<string> {
  const internalLinks = new Set<string>()

  function traverse(node: ContentNode | TextNode) {
    // Check if this is a text node with marks
    if (node.type === "text" && "marks" in node && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "link" && mark.attrs?.href?.startsWith("internal://")) {
          const documentId = mark.attrs.href.replace("internal://", "")
          internalLinks.add(documentId)
        }
      }
    }

    // Recursively traverse child nodes
    if ("content" in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child)
      }
    }
  }

  traverse(content)
  return internalLinks
}

/**
 * Fetches metadata for multiple document IDs
 */
export async function fetchDocumentMetadata(
  documentIds: string[],
  organizationId: string,
): Promise<Map<string, LinkMetadata>> {
  if (documentIds.length === 0) {
    return new Map()
  }

  try {
    const documents = await db
      .select({
        id: documentsTable.id,
        slug: documentsTable.slug,
        title: documentsTable.title,
      })
      .from(documentsTable)
      .where(inArray(documentsTable.id, documentIds))

    const metadataMap = new Map<string, LinkMetadata>()

    for (const doc of documents) {
      metadataMap.set(doc.id, {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        exists: true,
      })
    }

    // Add entries for documents that don't exist
    for (const id of documentIds) {
      if (!metadataMap.has(id)) {
        metadataMap.set(id, {
          id,
          exists: false,
        })
      }
    }

    return metadataMap
  } catch (error) {
    console.error("Error fetching document metadata for links:", error)
    // Return empty map on error - links will use IDs as fallback
    return new Map()
  }
}

/**
 * Transforms all internal:// links in document content to internal-link marks
 */
function transformContentLinks(
  content: ContentNode | TextNode,
  metadataMap: Map<string, LinkMetadata>,
  options: LinkTransformOptions,
): ContentNode | TextNode {
  // Deep clone to avoid mutations
  const clone = JSON.parse(JSON.stringify(content)) as ContentNode | TextNode

  function transform(node: ContentNode | TextNode) {
    // Transform links in text node marks
    if (node.type === "text" && "marks" in node && node.marks) {
      // Check if there's an internal link mark
      const internalLinkMark = node.marks.find(
        (mark) => mark.type === "link" && mark.attrs?.href?.startsWith("internal://"),
      )

      if (internalLinkMark) {
        const documentId = internalLinkMark.attrs!.href!.replace("internal://", "")
        const metadata = metadataMap.get(documentId)

        // Replace the link mark with internal-link mark, preserve other marks
        node.marks = node.marks.map((mark) => {
          if (mark.type === "link" && mark.attrs?.href?.startsWith("internal://")) {
            return {
              type: "internal-link",
              attrs: {
                "document-id": documentId,
                ...(metadata?.slug && { "document-slug": metadata.slug }),
                ...(metadata?.title && { "document-title": metadata.title }),
              },
            }
          }
          return mark
        })
      }
    }

    // Recursively transform child nodes
    if ("content" in node && Array.isArray(node.content)) {
      node.content = node.content.map((child) => transform(child))
    }

    return node
  }

  return transform(clone)
}

// Transforms internal:// links to internal-link marks (always fetches metadata)
export async function transformDocumentLinksToInternalLinkMarks(
  jsonContent: ContentNode,
  organizationId: string,
): Promise<ContentNode> {
  // Extract all internal links
  const internalLinkIds = extractInternalLinks(jsonContent)

  // If no internal links, return original content
  if (internalLinkIds.size === 0) {
    return jsonContent
  }

  // Always fetch metadata for all linked documents
  const metadataMap = await fetchDocumentMetadata(Array.from(internalLinkIds), organizationId)

  // Transform all links in the content to internal-link marks
  return transformContentLinks(jsonContent, metadataMap, {
    organizationId,
  }) as ContentNode
}
