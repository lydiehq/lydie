import { db } from "@lydie/database";
import { documentsTable } from "@lydie/database/schema";
import { inArray } from "drizzle-orm";

import type { ContentNode, TextNode } from "./types";

// Transforms internal links (kind="internal", refId) to internal-link marks
// for external API consumers. This provides document metadata (slug, title)
// so consumers can build proper URLs.

interface LinkMetadata {
  id: string;
  slug?: string;
  title?: string;
  parentSlug?: string;
  collectionId?: string;
  exists?: boolean;
}

// Extract document IDs from new format internal links
export function extractInternalLinks(content: ContentNode | TextNode): Set<string> {
  const internalLinks = new Set<string>();

  function traverse(node: ContentNode | TextNode) {
    if (node.type === "text" && "marks" in node && node.marks) {
      for (const mark of node.marks) {
        // New format: kind="internal" with refId
        if (mark.type === "link" && mark.attrs?.kind === "internal" && mark.attrs?.refId) {
          internalLinks.add(mark.attrs.refId);
        }
      }
    }

    if ("content" in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }

  traverse(content);
  return internalLinks;
}

export async function fetchDocumentMetadata(
  documentIds: string[],
): Promise<Map<string, LinkMetadata>> {
  if (documentIds.length === 0) {
    return new Map();
  }

  try {
    // Fetch documents with their parent IDs
    const documents = await db
      .select({
        id: documentsTable.id,
        slug: documentsTable.slug,
        title: documentsTable.title,
        parentId: documentsTable.parentId,
        nearestCollectionId: documentsTable.nearestCollectionId,
      })
      .from(documentsTable)
      .where(inArray(documentsTable.id, documentIds));

    // Collect parent IDs to fetch their slugs
    const parentIds = documents
      .map((doc) => doc.parentId)
      .filter((id): id is string => id !== null);

    // Fetch parent document slugs
    const parentSlugMap = new Map<string, string>();
    if (parentIds.length > 0) {
      const parents = await db
        .select({
          id: documentsTable.id,
          slug: documentsTable.slug,
        })
        .from(documentsTable)
        .where(inArray(documentsTable.id, parentIds));

      for (const parent of parents) {
        if (parent.slug) {
          parentSlugMap.set(parent.id, parent.slug);
        }
      }
    }

    const metadataMap = new Map<string, LinkMetadata>();

    for (const doc of documents) {
      metadataMap.set(doc.id, {
        id: doc.id,
        slug: doc.slug || undefined,
        title: doc.title,
        parentSlug: doc.parentId ? parentSlugMap.get(doc.parentId) : undefined,
        collectionId: doc.nearestCollectionId || undefined,
        exists: true,
      });
    }

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
    return new Map();
  }
}

function transformContentLinks(
  content: ContentNode | TextNode,
  metadataMap: Map<string, LinkMetadata>,
): ContentNode | TextNode {
  const clone = JSON.parse(JSON.stringify(content)) as ContentNode | TextNode;

  function transform(node: ContentNode | TextNode) {
    if (node.type === "text" && "marks" in node && node.marks) {
      node.marks = node.marks.map((mark) => {
        // Transform new format internal links to internal-link marks
        if (mark.type === "link" && mark.attrs?.kind === "internal" && mark.attrs?.refId) {
          const documentId = mark.attrs.refId;
          const metadata = metadataMap.get(documentId);

          return {
            type: "internal-link",
            attrs: {
              "document-id": documentId,
              ...(metadata?.slug && { "document-slug": metadata.slug }),
              ...(metadata?.title && { "document-title": metadata.title }),
              ...(metadata?.parentSlug && { "document-parent-slug": metadata.parentSlug }),
              ...(metadata?.collectionId && {
                "document-collection-id": metadata.collectionId,
              }),
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

  return transform(clone);
}

export async function transformDocumentLinksToInternalLinkMarks(
  jsonContent: ContentNode,
): Promise<ContentNode> {
  const internalLinkIds = extractInternalLinks(jsonContent);

  if (internalLinkIds.size === 0) {
    return jsonContent;
  }

  const metadataMap = await fetchDocumentMetadata(Array.from(internalLinkIds));

  return transformContentLinks(jsonContent, metadataMap) as ContentNode;
}
