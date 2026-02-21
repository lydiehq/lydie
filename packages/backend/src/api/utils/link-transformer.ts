import { db } from "@lydie/database";
import { collectionFieldsTable, collectionsTable, documentsTable } from "@lydie/database/schema";
import { eq, inArray } from "drizzle-orm";

import type { ContentNode, TextNode } from "./types";

// Transforms internal links (kind="internal", refId) to internal-link marks
// for external API consumers. This provides document metadata (title, collection)
// so consumers can build proper URLs.

interface LinkMetadata {
  id: string;
  title?: string;
  slug?: string;
  parentId?: string;
  collectionHandle?: string;
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
    // Fetch documents with their collection info
    const documents = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: collectionFieldsTable.values,
        collectionHandle: collectionsTable.handle,
      })
      .from(documentsTable)
      .leftJoin(collectionsTable, eq(documentsTable.collectionId, collectionsTable.id))
      .leftJoin(
        collectionFieldsTable,
        eq(collectionFieldsTable.documentId, documentsTable.id),
      )
      .where(inArray(documentsTable.id, documentIds));

    const metadataMap = new Map<string, LinkMetadata>();

    for (const doc of documents) {
      metadataMap.set(doc.id, {
        id: doc.id,
        title: doc.title,
        slug:
          typeof doc.slug === "object" &&
          doc.slug !== null &&
          "slug" in doc.slug &&
          typeof doc.slug.slug === "string"
            ? doc.slug.slug
            : undefined,
        parentId:
          typeof doc.slug === "object" &&
          doc.slug !== null &&
          "parent" in doc.slug &&
          typeof doc.slug.parent === "string"
            ? doc.slug.parent
            : undefined,
        collectionHandle: doc.collectionHandle || undefined,
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
              ...(metadata?.title && { "document-title": metadata.title }),
              ...(metadata?.slug && { "document-slug": metadata.slug }),
              ...(metadata?.parentId && { "document-parent-id": metadata.parentId }),
              ...(metadata?.collectionHandle && {
                "document-collection-handle": metadata.collectionHandle,
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
