import { db, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

interface DocumentNode {
  id: string;
  title: string | null;
  slug: string;
  parentId: string | null;
  sortOrder: number | null;
  children: DocumentNode[];
}

export const visualizeDocumentTree = (userId: string, organizationId: string) =>
  tool({
    description: `Visualize the document hierarchy/tree structure of the workspace or a specific document's children.
Use this tool when the user wants to see the structure of their documents, understand parent-child relationships, or organize documents hierarchically.

Examples: "Show me the document tree", "What documents are under the welcome page?", "Visualize my workspace structure", "Clean up documents under welcome page"`,
    inputSchema: z.object({
      rootDocumentId: z
        .string()
        .describe(
          "ID of the document to start from. If not provided, shows the entire workspace tree from root level.",
        )
        .optional()
        .nullable(),
      rootDocumentTitle: z
        .string()
        .describe(
          "Title of the document to start from (alternative to ID). Searches for document by title.",
        )
        .optional(),
      maxDepth: z
        .number()
        .describe("Maximum depth to traverse in the tree. Default is unlimited (all levels).")
        .min(1)
        .max(10)
        .default(10),
    }),
    execute: async function* ({ rootDocumentId, rootDocumentTitle, maxDepth }) {
      yield {
        state: "loading",
        message:
          rootDocumentId || rootDocumentTitle
            ? `Loading document tree structure...`
            : `Loading workspace document hierarchy...`,
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

      // Build the tree structure
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

      yield {
        state: "success",
        message: startFromRoot
          ? `Workspace document tree (${totalDocuments} top-level documents):`
          : `Document tree under "${rootDocumentTitle_}":`,
        tree: treeNodes,
        treeVisualization: treeString,
        totalDocuments,
        rootDocument: resolvedRootId ? { id: resolvedRootId, title: rootDocumentTitle_ } : null,
      };
    },
  });
