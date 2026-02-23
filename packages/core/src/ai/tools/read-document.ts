import { db, collectionViewsTable, collectionsTable, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getHocuspocusDocumentState, isHocuspocusAvailable } from "../../document-state";
import { serializeToHTML } from "../../serialization/html";
import { convertYjsToJson } from "../../yjs-to-json";

type CollectionViewBlock = {
  viewId: string;
  blockId: string | null;
  blockIndex: number;
};

function extractCollectionViewBlocks(content: unknown): CollectionViewBlock[] {
  const blocks: CollectionViewBlock[] = [];
  let blockIndex = 0;

  const visitNode = (node: any) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "collectionViewBlock") {
      const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
      const rawViewId = attrs.viewId;
      const blockId = typeof attrs.blockId === "string" ? attrs.blockId : null;

      if (typeof rawViewId === "string" && rawViewId.length > 0) {
        blocks.push({
          viewId: rawViewId,
          blockId,
          blockIndex,
        });
      }

      blockIndex += 1;
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visitNode(child);
      }
    }
  };

  visitNode(content);

  return blocks;
}

export const readDocument = (userId: string, organizationId: string) =>
  tool({
    description: `Read the full content of a document by ID or title.

Returns complete HTML content plus optional metadata (creation date, slug, etc.).
Also includes embedded collection view metadata when present so you can inspect collections by ID.

CRITICAL: Always read before editing. Use this to understand document structure, answer content questions, or reference other documents.`,
    inputSchema: z.object({
      documentId: z.string().describe("The unique ID of the document to read").optional(),
      documentTitle: z
        .string()
        .describe("The title of the document to read (will search for exact or partial matches)")
        .optional(),
      includeMetadata: z
        .boolean()
        .describe("Whether to include document metadata like creation date, slug, etc.")
        .default(false),
      preferFresh: z
        .boolean()
        .describe(
          "Whether to prefer real-time document state from collaborative editing session (if available). Default: true",
        )
        .default(true),
    }),
    execute: async function* ({
      documentId,
      documentTitle,
      includeMetadata = false,
      preferFresh = true,
    }) {
      if (!documentId && !documentTitle) {
        yield {
          state: "error",
          error: "Either documentId or documentTitle must be provided",
        };
        return;
      }

      yield {
        state: "searching",
        message: documentTitle
          ? `Searching for document "${documentTitle}"...`
          : "Searching for document...",
      };

      let query = db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          yjsState: documentsTable.yjsState,
          slug: documentsTable.slug,
          createdAt: documentsTable.createdAt,
          updatedAt: documentsTable.updatedAt,
        })
        .from(documentsTable)
        .$dynamic();

      const conditions = [eq(documentsTable.organizationId, organizationId)];

      if (documentId) {
        conditions.push(eq(documentsTable.id, documentId));
      } else if (documentTitle) {
        conditions.push(ilike(documentsTable.title, `%${documentTitle}%`));
      }

      query = query.where(and(...conditions));

      const documents = await query.limit(1);

      if (documents.length === 0) {
        const searchTerm = documentId
          ? `ID "${documentId}"`
          : `title containing "${documentTitle}"`;
        yield {
          state: "error",
          error: `No document found with ${searchTerm} `,
        };
        return;
      }

      const document = documents[0];

      if (!document) {
        yield {
          state: "error",
          error: `No document found with ${
            documentId ? `ID "${documentId}"` : `title containing "${documentTitle}"`
          }`,
        };
        return;
      }

      yield {
        state: "reading",
        message: `Reading document "${document.title}"...`,
        documentTitle: document.title,
      };

      // Try to get real-time state from Hocuspocus if available and requested
      let yjsState: string | null = document.yjsState;
      let source = "database";

      if (preferFresh && documentId && isHocuspocusAvailable()) {
        const hocuspocusState = getHocuspocusDocumentState(documentId);
        if (hocuspocusState) {
          yjsState = Buffer.from(hocuspocusState).toString("base64");
          source = "real-time";
        }
      }

      const jsonContent = convertYjsToJson(yjsState);
      const collectionViewBlocks = extractCollectionViewBlocks(jsonContent);

      let htmlContent: string;
      try {
        htmlContent = serializeToHTML(jsonContent as any);
      } catch (error) {
        console.error("[ReadDocument] Error converting jsonContent to HTML:", error);
        htmlContent = JSON.stringify(jsonContent, null, 2);
      }

      const result: any = {
        id: document.id,
        title: document.title,
        content: htmlContent,
        source, // Indicates whether content came from "database" or "real-time"
        collectionViews: collectionViewBlocks,
      };

      if (collectionViewBlocks.length > 0) {
        const uniqueViewIds = Array.from(
          new Set(collectionViewBlocks.map((block) => block.viewId)),
        );

        const referencedViews = await db
          .select({
            id: collectionViewsTable.id,
            collectionId: collectionViewsTable.collectionId,
            name: collectionViewsTable.name,
            type: collectionViewsTable.type,
            config: collectionViewsTable.config,
          })
          .from(collectionViewsTable)
          .where(
            and(
              eq(collectionViewsTable.organizationId, organizationId),
              inArray(collectionViewsTable.id, uniqueViewIds),
              isNull(collectionViewsTable.deletedAt),
            ),
          );

        const uniqueCollectionIds = Array.from(
          new Set(referencedViews.map((view) => view.collectionId)),
        );

        const referencedCollections = uniqueCollectionIds.length
          ? await db
              .select({
                id: collectionsTable.id,
                name: collectionsTable.name,
                handle: collectionsTable.handle,
                properties: collectionsTable.properties,
              })
              .from(collectionsTable)
              .where(
                and(
                  eq(collectionsTable.organizationId, organizationId),
                  inArray(collectionsTable.id, uniqueCollectionIds),
                  isNull(collectionsTable.deletedAt),
                ),
              )
          : [];

        result.referencedViews = referencedViews;

        result.referencedCollections = referencedCollections;
      }

      if (includeMetadata) {
        result.slug = document.slug;
        result.createdAt = document.createdAt.toISOString();
        result.updatedAt = document.updatedAt.toISOString();
      }

      yield {
        state: "success",
        message: `Successfully retrieved document: "${document.title}" (${source})`,
        document: result,
      };
    },
  });
