import { db, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, asc, desc, eq, ilike, isNull, ne } from "drizzle-orm";
import { z } from "zod";

interface DocumentNode {
  id: string;
  title: string | null;
  slug: string;
  parentId: string | null;
  sortOrder: number | null;
  children: DocumentNode[];
}

export const scanDocuments = (userId: string, organizationId: string, currentDocumentId?: string) =>
  tool({
    description: `Scan workspace structure to see what documents exist, their organization, and relationships.

Supports two view modes:
- **flat**: Sorted/filtered list with recency, title patterns
- **tree**: Hierarchical parent-child structure with configurable depth

Use for: structure navigation, title patterns, recency, workspace overview.
Not for: semantic content search (use find_documents) or reading content (use read_document).`,

    inputSchema: z.object({
      viewMode: z
        .enum(["flat", "tree"])
        .describe(
          "View mode: 'flat' for a simple sorted list, 'tree' for hierarchical structure with parent-child relationships",
        ),
      // Common parameters
      titleFilter: z
        .string()
        .describe("Filter documents by title (partial match, case-insensitive)")
        .optional(),
      limit: z
        .number()
        .describe("Maximum number of documents to return (flat mode only)")
        .min(1)
        .max(50)
        .default(20)
        .optional(),
      // Flat mode specific
      sortBy: z
        .enum(["title", "updated", "created"])
        .describe("How to sort documents in flat mode")
        .default("updated")
        .optional(),
      sortOrder: z
        .enum(["asc", "desc"])
        .describe("Sort order in flat mode")
        .default("desc")
        .optional(),
      // Tree mode specific
      rootDocumentId: z
        .string()
        .describe(
          "ID of the document to start from (tree mode). If not provided, shows entire workspace.",
        )
        .optional()
        .nullable(),
      rootDocumentTitle: z
        .string()
        .describe("Title of the document to start from (tree mode, alternative to ID)")
        .optional(),
      maxDepth: z
        .number()
        .describe(
          "Maximum depth to traverse in tree mode. Default: 2 for quick context, 10 for full tree",
        )
        .min(1)
        .max(10)
        .default(2)
        .optional(),
    }),

    execute: async function* ({
      viewMode,
      titleFilter,
      limit = 20,
      sortBy = "updated",
      sortOrder = "desc",
      rootDocumentId,
      rootDocumentTitle,
      maxDepth = 2,
    }) {
      if (viewMode === "flat") {
        // FLAT MODE - List view with sorting
        yield {
          state: "loading",
          message: titleFilter
            ? `Scanning for documents matching "${titleFilter}"...`
            : "Scanning your documents...",
        };

        let orderBy;
        switch (sortBy) {
          case "title":
            orderBy = sortOrder === "asc" ? asc(documentsTable.title) : desc(documentsTable.title);
            break;
          case "created":
            orderBy =
              sortOrder === "asc" ? asc(documentsTable.createdAt) : desc(documentsTable.createdAt);
            break;
          case "updated":
          default:
            orderBy =
              sortOrder === "asc" ? asc(documentsTable.updatedAt) : desc(documentsTable.updatedAt);
            break;
        }

        const conditions = [
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
        ];

        // Exclude current document if provided
        if (currentDocumentId) {
          conditions.push(ne(documentsTable.id, currentDocumentId));
        }

        // Add title filter if provided
        if (titleFilter) {
          conditions.push(ilike(documentsTable.title, `%${titleFilter}%`));
        }

        const documents = await db
          .select({
            id: documentsTable.id,
            title: documentsTable.title,
            slug: documentsTable.slug,
            parentId: documentsTable.parentId,
            createdAt: documentsTable.createdAt,
            updatedAt: documentsTable.updatedAt,
          })
          .from(documentsTable)
          .where(and(...conditions))
          .orderBy(orderBy)
          .limit(limit);

        const results = documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          parentId: doc.parentId,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        }));

        const filterMessage = titleFilter ? ` matching "${titleFilter}"` : "";
        const sortMessage = `sorted by ${sortBy} (${sortOrder})`;

        yield {
          state: "success",
          message: `Found ${documents.length} document${
            documents.length === 1 ? "" : "s"
          }${filterMessage}, ${sortMessage}:`,
          view: "flat",
          documents: results,
          totalFound: documents.length,
          filters: {
            titleFilter: titleFilter || null,
            sortBy,
            sortOrder,
            limit,
          },
        };
      } else {
        // TREE MODE - Hierarchical view
        yield {
          state: "loading",
          message:
            rootDocumentId || rootDocumentTitle
              ? `Scanning document structure...`
              : `Scanning workspace hierarchy...`,
        };

        // Determine the root document
        let resolvedRootId: string | null = null;
        let rootDocumentTitle_ = "Workspace Root";

        if (rootDocumentId) {
          const [rootDoc] = await db
            .select({ id: documentsTable.id, title: documentsTable.title })
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.id, rootDocumentId),
                eq(documentsTable.organizationId, organizationId),
                isNull(documentsTable.deletedAt),
              ),
            )
            .limit(1);

          if (!rootDoc) {
            yield {
              state: "error",
              error: `Document with ID "${rootDocumentId}" not found`,
            };
            return;
          }
          resolvedRootId = rootDocumentId;
          rootDocumentTitle_ = rootDoc.title || "Untitled";
        } else if (rootDocumentTitle) {
          const [rootDoc] = await db
            .select({ id: documentsTable.id, title: documentsTable.title })
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.title, rootDocumentTitle),
                eq(documentsTable.organizationId, organizationId),
                isNull(documentsTable.deletedAt),
              ),
            )
            .limit(1);

          if (!rootDoc) {
            yield {
              state: "error",
              error: `Document with title "${rootDocumentTitle}" not found`,
            };
            return;
          }
          resolvedRootId = rootDoc.id;
          rootDocumentTitle_ = rootDoc.title || "Untitled";
        }

        // Build the tree structure recursively
        const buildTree = async (
          parentId: string | null,
          currentDepth: number,
        ): Promise<DocumentNode[]> => {
          if (currentDepth >= maxDepth) {
            return [];
          }

          const conditions = [
            eq(documentsTable.organizationId, organizationId),
            isNull(documentsTable.deletedAt),
          ];

          // Add title filter if provided
          if (titleFilter) {
            conditions.push(ilike(documentsTable.title, `%${titleFilter}%`));
          }

          // Handle parentId condition
          if (resolvedRootId && currentDepth === 0 && parentId === null) {
            // We're looking for children of the root document
            conditions.push(eq(documentsTable.parentId, resolvedRootId));
          } else if (parentId === null) {
            conditions.push(isNull(documentsTable.parentId));
          } else {
            conditions.push(eq(documentsTable.parentId, parentId));
          }

          const docs = await db
            .select({
              id: documentsTable.id,
              title: documentsTable.title,
              slug: documentsTable.slug,
              parentId: documentsTable.parentId,
              sortOrder: documentsTable.sortOrder,
            })
            .from(documentsTable)
            .where(and(...conditions))
            .orderBy(asc(documentsTable.sortOrder));

          const nodes: DocumentNode[] = [];
          for (const doc of docs) {
            const children = await buildTree(doc.id, currentDepth + 1);
            nodes.push({
              id: doc.id,
              title: doc.title,
              slug: doc.slug,
              parentId: doc.parentId,
              sortOrder: doc.sortOrder,
              children,
            });
          }
          return nodes;
        };

        // Get the tree
        let treeNodes: DocumentNode[];
        let startFromRoot = false;

        if (resolvedRootId) {
          // Get children of the specified root document
          treeNodes = await buildTree(resolvedRootId, 0);
          // Also include the root document itself at the top
          const [rootDoc] = await db
            .select({
              id: documentsTable.id,
              title: documentsTable.title,
              slug: documentsTable.slug,
              parentId: documentsTable.parentId,
              sortOrder: documentsTable.sortOrder,
            })
            .from(documentsTable)
            .where(eq(documentsTable.id, resolvedRootId))
            .limit(1);

          if (rootDoc) {
            treeNodes = [
              {
                ...rootDoc,
                title: rootDoc.title,
                children: treeNodes,
              },
            ];
          }
        } else {
          // Get all root-level documents and their children
          treeNodes = await buildTree(null, 0);
          startFromRoot = true;
        }

        // Format the tree as a string representation
        const formatTree = (nodes: DocumentNode[], level = 0): string[] => {
          const lines: string[] = [];
          for (const node of nodes) {
            const indent = "  ".repeat(level);
            const hasChildren = node.children && node.children.length > 0;
            const marker = hasChildren ? "▼" : "•";
            lines.push(`${indent}${marker} ${node.title || "Untitled"} (ID: ${node.id})`);
            if (hasChildren) {
              lines.push(...formatTree(node.children, level + 1));
            }
          }
          return lines;
        };

        const treeString = formatTree(treeNodes).join("\n");
        const totalDocuments = treeNodes.length;

        const depthMessage =
          maxDepth === 10 ? "full depth" : `${maxDepth} level${maxDepth > 1 ? "s" : ""} deep`;
        const filterMessage = titleFilter ? ` matching "${titleFilter}"` : "";

        yield {
          state: "success",
          message: startFromRoot
            ? `Scanned workspace structure (${totalDocuments} top-level documents${filterMessage}, ${depthMessage}):`
            : `Scanned document structure under "${rootDocumentTitle_}" (${depthMessage})${filterMessage}:`,
          view: "tree",
          tree: treeNodes,
          treeVisualization: treeString,
          totalDocuments,
          rootDocument: resolvedRootId ? { id: resolvedRootId, title: rootDocumentTitle_ } : null,
          depthScanned: maxDepth,
        };
      }
    },
  });
