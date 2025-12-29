import { Hono } from "hono";
import {
  db,
  documentsTable,
  documentComponentsTable,
  foldersTable,
} from "@lydie/database";
import { HTTPException } from "hono/http-exception";
import { createId } from "@lydie/core/id";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";
import { slugify } from "@lydie/core/utils";
import {
  deserializeFromMDX,
  extractMDXComponents,
  parseFrontmatter,
  type MDXComponent,
} from "@lydie/core/serialization/mdx";

type Variables = {
  organizationId: string;
  user: any;
};

interface ParsedMDXContent {
  title: string;
  slug?: string;
  content: any; // TipTap JSON structure
  components: MDXComponent[];
}

interface MDXFrontmatter {
  title?: string;
  slug?: string;
  [key: string]: any;
}

// mdxToTipTapJSON is now replaced by deserializeFromMDX from @lydie/core/serialization

function parseMDXContent(
  mdxContent: string,
  filename: string | undefined,
  componentSchemas: Record<string, any> = {}
): ParsedMDXContent & { customFields?: Record<string, string | number> } {
  // Parse frontmatter first
  const { frontmatter, contentWithoutFrontmatter } =
    parseFrontmatter(mdxContent);

  const lines = contentWithoutFrontmatter.split("\n");

  // Title priority: frontmatter.title > first # heading > filename (without extension) > fallback
  let title = "";
  let contentStartIndex = 0;

  // 1. Check frontmatter first
  if (frontmatter.title) {
    title = frontmatter.title;
  } else {
    // 2. Look for first heading
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("# ")) {
        title = line.substring(2).trim();
        contentStartIndex = i + 1;
        break;
      }
    }

    // 3. Use filename if no title found
    if (!title && filename) {
      title = filename.replace(/\.(mdx?|md)$/i, "");
    }

    // 4. Fallback
    if (!title) {
      title = "Imported Document";
    }
  }

  // Slug priority: frontmatter.slug > filename (without extension) > slugified title
  let slug = "";
  if (frontmatter.slug) {
    slug = frontmatter.slug;
  } else if (filename) {
    slug = filename.replace(/\.(mdx?|md)$/i, "");
  } else {
    slug = slugify(title);
  }

  const contentLines = lines.slice(contentStartIndex);
  const contentString = contentLines.join("\n");

  // Extract components first to get the list for component creation
  const { components } = extractMDXComponents(contentString);

  // Use the core MDX deserializer with component schemas
  const tipTapContent = deserializeFromMDX(contentString, {
    componentSchemas,
  });

  // Convert frontmatter to customFields format (only string and number values)
  // Exclude title and slug as they're handled separately
  const customFields: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key !== "title" && key !== "slug") {
      if (typeof value === "string" || typeof value === "number") {
        customFields[key] = value;
      } else if (typeof value === "boolean") {
        // Convert boolean to string
        customFields[key] = String(value);
      }
    }
  }

  const result = {
    title,
    slug,
    content: tipTapContent,
    components,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
  };

  return result;
}

/**
 * Gets or creates a folder by path, creating parent folders as needed
 * @param folderPath - Path like "folder1/subfolder2" or null/empty for root
 * @param userId - User ID
 * @param organizationId - Organization ID
 * @returns Promise<string | undefined> - Folder ID or undefined for root
 */
async function getOrCreateFolderByPath(
  folderPath: string | null | undefined,
  userId: string,
  organizationId: string
): Promise<string | undefined> {
  if (!folderPath || folderPath.trim() === "" || folderPath === "/") {
    return undefined; // Root level
  }

  // Normalize path: remove leading/trailing slashes and split
  const parts = folderPath
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return undefined;
  }

  let currentParentId: string | undefined = undefined;

  // Traverse the path, creating folders as needed
  for (const folderName of parts) {
    // Check if folder already exists with this name, parent, and organization
    // @ts-ignore
    const [existingFolder] = await db
      .select()
      .from(foldersTable)
      .where(
        and(
          eq(foldersTable.name, folderName),
          eq(foldersTable.organizationId, organizationId),
          isNull(foldersTable.deletedAt),
          currentParentId
            ? eq(foldersTable.parentId, currentParentId)
            : isNull(foldersTable.parentId)
        )
      )
      .limit(1);

    if (existingFolder) {
      // Reuse existing folder
      currentParentId = existingFolder.id;
    } else {
      // Create new folder
      const newFolderId = createId();
      await db.insert(foldersTable).values({
        id: newFolderId,
        name: folderName,
        userId,
        organizationId,
        parentId: currentParentId || null,
      });
      currentParentId = newFolderId;
    }
  }

  return currentParentId;
}

export const MDXImportRoute = new Hono<{ Variables: Variables }>()
  .post("/create-folder", async (c) => {
    try {
      const { folderPath } = await c.req.json();
      const userId = c.get("user").id;
      const organizationId = c.get("organizationId");

      const folderId = await getOrCreateFolderByPath(
        folderPath,
        userId,
        organizationId
      );

      return c.json({ folderId });
    } catch (error) {
      console.error("❌ Folder creation error:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: "Failed to create folder",
      });
    }
  })
  .post("/", async (c) => {
    try {
      const { mdxContent, filename, folderPath, folderId } = await c.req.json();
      const userId = c.get("user").id;
      const organizationId = c.get("organizationId");

      if (!mdxContent) {
        throw new HTTPException(400, {
          message: "MDX content is required",
        });
      }

      // Parse MDX content first (without component schemas initially)
      const parsed = parseMDXContent(mdxContent, filename, {});

      // If there are components in the parsed content, fetch only the relevant schemas
      let componentSchemas: Record<string, any> = {};
      if (parsed.components.length > 0) {
        const componentNames = [
          ...new Set(parsed.components.map((c) => c.name)),
        ];
        const existingComponents = await db
          .select()
          .from(documentComponentsTable)
          .where(
            and(
              inArray(documentComponentsTable.name, componentNames),
              eq(documentComponentsTable.organizationId, organizationId)
            )
          );

        for (const comp of existingComponents) {
          componentSchemas[comp.name] = comp.properties;
        }

        // Re-parse with component schemas if we found any
        if (Object.keys(componentSchemas).length > 0) {
          const reparsed = parseMDXContent(
            mdxContent,
            filename,
            componentSchemas
          );
          parsed.content = reparsed.content;
        }
      }

      // Use provided folderId, or get/create folder by path if not provided
      let finalFolderId: string | undefined = folderId;
      if (!finalFolderId && folderPath) {
        finalFolderId = await getOrCreateFolderByPath(
          folderPath,
          userId,
          organizationId
        );
      }

      // Create document
      const documentId = createId();
      const finalSlug = parsed.slug || documentId;

      const insertData = {
        id: documentId,
        title: parsed.title,
        slug: finalSlug,
        jsonContent: parsed.content,
        userId,
        organizationId,
        folderId: finalFolderId || null,
        customFields: parsed.customFields || null,
        indexStatus: "outdated" as const,
        published: false,
      };

      await db.insert(documentsTable).values(insertData);

      // Verify the inserted document
      const insertedDocument = await db.query.documentsTable.findFirst({
        where: {
          id: documentId,
        },
      });

      if (!insertedDocument) {
        throw new HTTPException(500, {
          message: "Failed to retrieve inserted document",
        });
      }

      // Generate embeddings for the imported document asynchronously (don't block)
      processDocumentEmbedding(insertedDocument, db)
        .then(() => {
          console.log(
            `Successfully generated embeddings for imported document ${documentId}`
          );
        })
        .catch((error) => {
          console.error(
            `Failed to generate embeddings for imported document ${documentId}:`,
            error
          );
        });

      // Create document components for any new custom components found
      const createdComponents: string[] = [];
      if (parsed.components.length > 0) {
        // Get unique component names
        const uniqueComponents = Array.from(
          new Map(parsed.components.map((c) => [c.name, c])).values()
        );

        // Filter out components that already exist in our schema map
        const newComponents = uniqueComponents.filter(
          (c) => !componentSchemas[c.name]
        );

        // Batch create new components
        if (newComponents.length > 0) {
          const componentInserts = newComponents.map((component) => {
            // Infer property types from the component props
            const properties: Record<string, { type: string }> = {};
            for (const [key, value] of Object.entries(component.props)) {
              if (typeof value === "boolean") {
                properties[key] = { type: "boolean" };
              } else if (typeof value === "number") {
                properties[key] = { type: "number" };
              } else if (Array.isArray(value)) {
                properties[key] = { type: "array" };
              } else {
                properties[key] = { type: "string" };
              }
            }

            return {
              id: createId(),
              name: component.name,
              properties,
              organizationId,
            };
          });

          // Try to insert all new components at once
          try {
            await db.insert(documentComponentsTable).values(componentInserts);
            createdComponents.push(...componentInserts.map((c) => c.name));
          } catch (error) {
            // If batch insert fails, fall back to individual inserts with duplicate checking
            console.warn(
              "Batch component insert failed, falling back to individual inserts"
            );
            for (const insert of componentInserts) {
              try {
                await db.insert(documentComponentsTable).values(insert);
                createdComponents.push(insert.name);
              } catch (individualError) {
                // Component might already exist due to race condition, skip it
                console.log(
                  `Component ${insert.name} already exists, skipping`
                );
              }
            }
          }
        }
      }

      const response = {
        success: true,
        documentId,
        title: parsed.title,
        slug: finalSlug,
        folderId: finalFolderId,
        componentsFound: parsed.components.length,
        newComponentsCreated: createdComponents,
      };

      return c.json(response);
    } catch (error) {
      console.error("❌ MDX import error:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: "Failed to import MDX file",
      });
    }
  });
