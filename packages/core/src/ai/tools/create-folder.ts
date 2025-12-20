import { tool } from "ai";
import { z } from "zod";
import { db, foldersTable } from "@lydie/database";
import { eq, and, isNull } from "drizzle-orm";
import { createId } from "../../id";

export const createFolder = (userId: string, organizationId: string) =>
  tool({
    description: `Create a new folder in the user's workspace. 
Use this tool when the user asks to create a folder, organize documents into folders, or set up folder structure.
You can create folders at the root level or inside other folders (nested folders).`,
    inputSchema: z.object({
      name: z
        .string()
        .describe("The name of the folder to create")
        .min(1)
        .max(255),
      parentFolderId: z
        .string()
        .describe(
          "Optional ID of the parent folder if creating a nested folder. Leave empty for root level."
        )
        .optional(),
      parentFolderName: z
        .string()
        .describe(
          "Optional name of the parent folder if creating a nested folder. Will search for existing folder by name."
        )
        .optional(),
    }),
    execute: async function* ({ name, parentFolderId, parentFolderName }) {
      // Yield initial creating state
      yield {
        state: "creating",
        message: `Creating folder "${name}"...`,
      };

      // Validate parent folder if provided
      let resolvedParentId: string | null = null;
      if (parentFolderId) {
        const [parentFolder] = await db
          .select()
          .from(foldersTable)
          .where(
            and(
              eq(foldersTable.id, parentFolderId),
              eq(foldersTable.organizationId, organizationId),
              isNull(foldersTable.deletedAt)
            )
          )
          .limit(1);

        if (!parentFolder) {
          yield {
            state: "error",
            error: `Parent folder with ID "${parentFolderId}" not found or you don't have access to it`,
          };
          return;
        }

        resolvedParentId = parentFolderId;
      } else if (parentFolderName) {
        // Search for parent folder by name
        const [parentFolder] = await db
          .select()
          .from(foldersTable)
          .where(
            and(
              eq(foldersTable.name, parentFolderName),
              eq(foldersTable.organizationId, organizationId),
              isNull(foldersTable.deletedAt),
              isNull(foldersTable.parentId) // Root level folder
            )
          )
          .limit(1);

        if (!parentFolder) {
          yield {
            state: "error",
            error: `Parent folder "${parentFolderName}" not found at root level`,
          };
          return;
        }

        resolvedParentId = parentFolder.id;
      }

      // Check if folder with same name already exists at this location
      const existingFolderConditions = [
        eq(foldersTable.name, name),
        eq(foldersTable.organizationId, organizationId),
        isNull(foldersTable.deletedAt),
      ];

      if (resolvedParentId) {
        existingFolderConditions.push(
          eq(foldersTable.parentId, resolvedParentId)
        );
      } else {
        existingFolderConditions.push(isNull(foldersTable.parentId));
      }

      const [existingFolder] = await db
        .select()
        .from(foldersTable)
        .where(and(...existingFolderConditions))
        .limit(1);

      if (existingFolder) {
        yield {
          state: "success",
          message: `Folder "${name}" already exists`,
          folder: {
            id: existingFolder.id,
            name: existingFolder.name,
            parentId: existingFolder.parentId,
            createdAt: existingFolder.createdAt.toISOString(),
          },
        };
        return;
      }

      // Create the folder
      const folderId = createId();
      const [newFolder] = await db
        .insert(foldersTable)
        .values({
          id: folderId,
          name,
          userId,
          organizationId,
          parentId: resolvedParentId,
        })
        .returning();

      if (!newFolder) {
        yield {
          state: "error",
          error: "Failed to create folder",
        };
        return;
      }

      // Yield final success state
      yield {
        state: "success",
        message: `Successfully created folder "${name}"`,
        folder: {
          id: newFolder.id,
          name: newFolder.name,
          parentId: newFolder.parentId,
          createdAt: newFolder.createdAt.toISOString(),
        },
      };
    },
  });
