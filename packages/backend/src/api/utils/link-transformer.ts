import type { ContentNode, TextNode, Mark } from "./types";
import { db } from "@lydie/database";
import { eq, inArray } from "drizzle-orm";
import { documentsTable } from "@lydie/database/schema";

/**
 * Transforms internal:// links in document content to relative paths.
 * By default, converts internal://[ID] to /[SLUG] for better SEO.
 * Can optionally convert to /[ID] instead.
 */

export interface LinkTransformOptions {
  /** If true, use document IDs instead of slugs (e.g., /abc123 instead of /my-document) */
  useIds?: boolean;
  /** Custom base path for links (e.g., "/docs" -> "/docs/my-document") */
  basePath?: string;
  /** Organization ID for looking up document slugs */
  organizationId: string;
}

interface LinkMetadata {
  id: string;
  slug?: string;
  title?: string;
  exists?: boolean;
}

/**
 * Transforms a single internal:// link href to a relative path
 */
function transformInternalLink(
  href: string,
  metadata?: LinkMetadata,
  options?: LinkTransformOptions
): string {
  // Check if it's an internal link
  if (!href.startsWith("internal://")) {
    return href;
  }

  const documentId = href.replace("internal://", "");
  const basePath = options?.basePath || "";

  // If using IDs or no metadata available, use the ID
  if (options?.useIds || !metadata?.slug) {
    return `${basePath}/${documentId}`;
  }

  // Otherwise, use the slug for better SEO
  return `${basePath}/${metadata.slug}`;
}

/**
 * Extracts all internal:// links from document content
 */
export function extractInternalLinks(content: ContentNode | TextNode): Set<string> {
  const internalLinks = new Set<string>();

  function traverse(node: ContentNode | TextNode) {
    // Check if this is a text node with marks
    if (node.type === "text" && "marks" in node && node.marks) {
      for (const mark of node.marks) {
        if (
          mark.type === "link" &&
          mark.attrs?.href?.startsWith("internal://")
        ) {
          const documentId = mark.attrs.href.replace("internal://", "");
          internalLinks.add(documentId);
        }
      }
    }

    // Recursively traverse child nodes
    if ("content" in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }

  traverse(content);
  return internalLinks;
}

/**
 * Fetches metadata for multiple document IDs
 */
export async function fetchDocumentMetadata(
  documentIds: string[],
  organizationId: string
): Promise<Map<string, LinkMetadata>> {
  if (documentIds.length === 0) {
    return new Map();
  }

  try {
    const documents = await db
      .select({
        id: documentsTable.id,
        slug: documentsTable.slug,
        title: documentsTable.title,
      })
      .from(documentsTable)
      .where(inArray(documentsTable.id, documentIds));

    const metadataMap = new Map<string, LinkMetadata>();

    for (const doc of documents) {
      metadataMap.set(doc.id, {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        exists: true,
      });
    }

    // Add entries for documents that don't exist
    for (const id of documentIds) {
      if (!metadataMap.has(id)) {
        metadataMap.set(id, {
          id,
          exists: false,
        });
      }
    }

    return metadataMap;
  } catch (error) {
    console.error("Error fetching document metadata for links:", error);
    // Return empty map on error - links will use IDs as fallback
    return new Map();
  }
}

/**
 * Transforms all internal:// links in document content
 */
function transformContentLinks(
  content: ContentNode | TextNode,
  metadataMap: Map<string, LinkMetadata>,
  options: LinkTransformOptions
): ContentNode | TextNode {
  // Deep clone to avoid mutations
  const clone = JSON.parse(JSON.stringify(content)) as ContentNode | TextNode;

  function transform(node: ContentNode | TextNode) {
    // Transform links in text node marks
    if (node.type === "text" && "marks" in node && node.marks) {
      node.marks = node.marks.map((mark) => {
        if (
          mark.type === "link" &&
          mark.attrs?.href?.startsWith("internal://")
        ) {
          const documentId = mark.attrs.href.replace("internal://", "");
          const metadata = metadataMap.get(documentId);

          return {
            ...mark,
            attrs: {
              ...mark.attrs,
              href: transformInternalLink(mark.attrs.href, metadata, options),
              // Optionally add data attributes for additional metadata
              ...(metadata && {
                "data-document-id": documentId,
                "data-document-exists": metadata.exists ? "true" : "false",
              }),
            },
          };
        }
        return mark;
      });
    }

    // Recursively transform child nodes
    if ("content" in node && Array.isArray(node.content)) {
      node.content = node.content.map((child) => transform(child));
    }

    return node;
  }

  return transform(clone);
}

/**
 * Main function to transform internal links in a document's content
 *
 * @param jsonContent - The document's JSON content (TipTap format)
 * @param options - Transformation options
 * @returns Transformed content with resolved internal links
 *
 * @example
 * ```typescript
 * const transformed = await transformDocumentLinks(document.jsonContent, {
 *   organizationId: "org_123",
 *   useIds: false, // Use slugs for SEO-friendly URLs
 * });
 * ```
 */
export async function transformDocumentLinks(
  jsonContent: ContentNode,
  options: LinkTransformOptions
): Promise<ContentNode> {
  // Extract all internal links
  const internalLinkIds = extractInternalLinks(jsonContent);

  // If no internal links, return original content
  if (internalLinkIds.size === 0) {
    return jsonContent;
  }

  // Fetch metadata for all linked documents
  const metadataMap = await fetchDocumentMetadata(
    Array.from(internalLinkIds),
    options.organizationId
  );

  // Transform all links in the content
  return transformContentLinks(
    jsonContent,
    metadataMap,
    options
  ) as ContentNode;
}

/**
 * Lightweight version that doesn't fetch metadata - just converts internal:// to /[ID]
 * Useful when you don't need slugs or when performance is critical
 */
export function transformDocumentLinksSync(
  jsonContent: ContentNode,
  options?: Omit<LinkTransformOptions, "organizationId">
): ContentNode {
  const clone = JSON.parse(JSON.stringify(jsonContent)) as ContentNode;

  function transform(node: ContentNode | TextNode) {
    if (node.type === "text" && "marks" in node && node.marks) {
      node.marks = node.marks.map((mark) => {
        if (
          mark.type === "link" &&
          mark.attrs?.href?.startsWith("internal://")
        ) {
          const documentId = mark.attrs.href.replace("internal://", "");
          const basePath = options?.basePath || "";

          return {
            ...mark,
            attrs: {
              ...mark.attrs,
              href: `${basePath}/${documentId}`,
            },
          };
        }
        return mark;
      });
    }

    if ("content" in node && Array.isArray(node.content)) {
      node.content = node.content.map((child) => transform(child));
    }

    return node;
  }

  return transform(clone) as ContentNode;
}
