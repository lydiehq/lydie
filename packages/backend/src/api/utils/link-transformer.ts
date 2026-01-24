import type { ContentNode, TextNode } from "./types"
import { db } from "@lydie/database"
import { inArray } from "drizzle-orm"
import { documentsTable } from "@lydie/database/schema"

// Transforms internal:// links in document content to relative paths.
// By default, converts internal://[ID] to /[SLUG] for better SEO.
// Can optionally convert to /[ID] instead.

export interface LinkTransformOptions {
  // If true, use document IDs instead of slugs (e.g., /abc123 instead of /my-document)
  useIds?: boolean
  // Custom base path for links (e.g., "/docs" -> "/docs/my-document")
  basePath?: string
  // Organization ID for looking up document slugs
  organizationId: string
}

interface LinkMetadata {
  id: string
  slug?: string
  title?: string
  exists?: boolean
}

export function extractInternalLinks(content: ContentNode | TextNode): Set<string> {
  const internalLinks = new Set<string>()

  function traverse(node: ContentNode | TextNode) {
    if (node.type === "text" && "marks" in node && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "link" && mark.attrs?.href?.startsWith("internal://")) {
          const documentId = mark.attrs.href.replace("internal://", "")
          internalLinks.add(documentId)
        }
      }
    }

    if ("content" in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child)
      }
    }
  }

  traverse(content)
  return internalLinks
}

export async function fetchDocumentMetadata(documentIds: string[]): Promise<Map<string, LinkMetadata>> {
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
    return new Map()
  }
}

function transformContentLinks(
  content: ContentNode | TextNode,
  metadataMap: Map<string, LinkMetadata>,
): ContentNode | TextNode {
  const clone = JSON.parse(JSON.stringify(content)) as ContentNode | TextNode

  function transform(node: ContentNode | TextNode) {
    if (node.type === "text" && "marks" in node && node.marks) {
      const internalLinkMark = node.marks.find(
        (mark) => mark.type === "link" && mark.attrs?.href?.startsWith("internal://"),
      )

      if (internalLinkMark) {
        const documentId = internalLinkMark.attrs!.href!.replace("internal://", "")
        const metadata = metadataMap.get(documentId)

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

    if ("content" in node && Array.isArray(node.content)) {
      node.content = node.content.map((child) => transform(child))
    }

    return node
  }

  return transform(clone)
}

export async function transformDocumentLinksToInternalLinkMarks(
  jsonContent: ContentNode,
): Promise<ContentNode> {
  const internalLinkIds = extractInternalLinks(jsonContent)

  if (internalLinkIds.size === 0) {
    return jsonContent
  }

  const metadataMap = await fetchDocumentMetadata(Array.from(internalLinkIds))

  return transformContentLinks(jsonContent, metadataMap) as ContentNode
}
