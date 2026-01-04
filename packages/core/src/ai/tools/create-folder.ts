import { tool } from "ai";
import { z } from "zod";
import { db, documentsTable } from "@lydie/database";
import { eq, and, isNull } from "drizzle-orm";
import { createId } from "../../id";
import { convertJsonToYjs } from "../../yjs-to-json";

export const createFolder = (userId: string, organizationId: string) =>
  tool({
    description: `Create a new page in the user's workspace. 
Use this tool when the user asks to create a page, organize documents, or set up page structure.
You can create pages at the root level or as children of other pages (nested pages).`,
    inputSchema: z.object({
      name: z
        .string()
        .describe("The title/name of the page to create")
        .min(1)
        .max(255),
      parentId: z
        .string()
        .describe(
          "Optional ID of the parent page if creating a nested page. Leave empty for root level."
        )
        .optional(),
      parentTitle: z
        .string()
        .describe(
          "Optional title of the parent page if creating a nested page. Will search for existing page by title."
        )
        .optional(),
    }),
    execute: async function* ({ name, parentId, parentTitle }) {
      // Yield initial creating state
      yield {
        state: "creating",
        message: `Creating page "${name}"...`,
      };

      // Validate parent page if provided
      let resolvedParentId: string | null = null;
      if (parentId) {
        const parent = await db.query.documentsTable.findFirst({
          where: and(
            eq(documentsTable.id, parentId),
            eq(documentsTable.organizationId, organizationId),
            isNull(documentsTable.deletedAt)
          ),
        });

        if (!parent) {
          yield {
            state: "error",
            error: `Parent page with ID "${parentId}" not found or you don't have access to it`,
          };
          return;
        }

        resolvedParentId = parentId;
      } else if (parentTitle) {
        // Search for parent page by title (check root level first)
        const parent = await db.query.documentsTable.findFirst({
          where: and(
            eq(documentsTable.title, parentTitle),
            eq(documentsTable.organizationId, organizationId),
            isNull(documentsTable.deletedAt),
            isNull(documentsTable.parentId) // Root level document
          ),
        });

        if (!parent) {
          yield {
            state: "error",
            error: `Parent page "${parentTitle}" not found at root level`,
          };
          return;
        }

        resolvedParentId = parent.id;
      }

      // Check if page with same title already exists at this location
      const existingPageConditions = [
        eq(documentsTable.title, name),
        eq(documentsTable.organizationId, organizationId),
        isNull(documentsTable.deletedAt),
      ];

      if (resolvedParentId) {
        existingPageConditions.push(
          eq(documentsTable.parentId, resolvedParentId)
        );
      } else {
        existingPageConditions.push(isNull(documentsTable.parentId));
      }

      const existingPage = await db.query.documentsTable.findFirst({
        where: and(...existingPageConditions),
      });

      if (existingPage) {
        yield {
          state: "success",
          message: `Page "${name}" already exists`,
          page: {
            id: existingPage.id,
            title: existingPage.title,
            parentId: existingPage.parentId,
            createdAt: existingPage.createdAt.toISOString(),
          },
        };
        return;
      }

      // Create the page
      const pageId = createId();
      const emptyContent = { type: "doc", content: [] };
      const yjsState = convertJsonToYjs(emptyContent);
      const newPage = await db.insert(documentsTable).values({
        id: pageId,
        title: name,
        slug: pageId,
        yjsState: yjsState,
        userId,
        organizationId,
        parentId: resolvedParentId,
        indexStatus: "pending",
        published: false,
      }).returning();

      if (!newPage || newPage.length === 0) {
        yield {
          state: "error",
          error: "Failed to create page",
        };
        return;
      }

      // Yield final success state
      yield {
        state: "success",
        message: `Successfully created page "${name}"`,
        page: {
          id: newPage[0].id,
          title: newPage[0].title,
          parentId: newPage[0].parentId,
          createdAt: newPage[0].createdAt.toISOString(),
        },
      };
    },
  });
