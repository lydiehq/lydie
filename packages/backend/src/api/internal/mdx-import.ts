import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";
import { createId } from "@lydie/core/id";
import {
  type MDXComponent,
  deserializeFromMDX,
  extractMDXComponents,
  parseFrontmatter,
} from "@lydie/core/serialization/mdx";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { db, documentComponentsTable, documentsTable } from "@lydie/database";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

type Variables = {
  organizationId: string;
  user: any;
};

interface ParsedMDXContent {
  title: string;
  slug?: string;
  content: any; // TipTap JSON structure
  components: MDXComponent[];
  properties?: Record<string, string | number | boolean | null>;
  childSchema?: Array<{ field: string; type: string; required: boolean; options?: string[] }>;
  pageConfig?: { showChildrenInSidebar: boolean; defaultView: "documents" | "table" };
}

interface MDXFrontmatter {
  title?: string;
  slug?: string;
  properties?: Record<string, string | number | boolean | null>;
  childSchema?: Array<{ field: string; type: string; required: boolean; options?: string[] }>;
  pageConfig?: { showChildrenInSidebar: boolean; defaultView: "documents" | "table" };
  [key: string]: any;
}

function parseMDXContent(
  mdxContent: string,
  filename: string | undefined,
  componentSchemas: Record<string, any> = {},
): ParsedMDXContent & { customFields?: Record<string, string | number> } {
  // Parse frontmatter first
  const { frontmatter, contentWithoutFrontmatter } = parseFrontmatter(mdxContent);

  const lines = contentWithoutFrontmatter.split("\n");

  let title = "";
  let contentStartIndex = 0;

  if (frontmatter.title) {
    title = frontmatter.title;
  } else {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("# ")) {
        title = line.substring(2).trim();
        contentStartIndex = i + 1;
        break;
      }
    }

    if (!title && filename) {
      title = filename.replace(/\.(mdx?|md)$/i, "");
    }

    if (!title) {
      title = "Imported Document";
    }
  }

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

  const { components } = extractMDXComponents(contentString);

  const tipTapContent = deserializeFromMDX(contentString, {
    componentSchemas,
  });

  const customFields: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key !== "title" && key !== "slug") {
      if (typeof value === "string" || typeof value === "number") {
        customFields[key] = value;
      } else if (typeof value === "boolean") {
        customFields[key] = String(value);
      }
    }
  }

  // Extract database-specific fields from frontmatter
  const properties = frontmatter.properties as Record<string, string | number | boolean | null> | undefined;
  const childSchema = frontmatter.childSchema as Array<{ field: string; type: string; required: boolean; options?: string[] }> | undefined;
  const pageConfig = frontmatter.pageConfig as { showChildrenInSidebar: boolean; defaultView: "documents" | "table" } | undefined;

  const result = {
    title,
    slug,
    content: tipTapContent,
    components,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    properties,
    childSchema,
    pageConfig,
  };

  return result;
}

async function getOrCreatePageByPath(
  pagePath: string | null | undefined,
  userId: string,
  organizationId: string,
): Promise<string | undefined> {
  if (!pagePath || pagePath.trim() === "" || pagePath === "/") {
    return undefined;
  }

  const parts = pagePath
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return undefined;
  }

  let currentParentId: string | undefined = undefined;

  for (const pageName of parts) {
    const whereConditions = [
      eq(documentsTable.title, pageName),
      eq(documentsTable.organizationId, organizationId),
      isNull(documentsTable.deletedAt),
    ];

    if (currentParentId) {
      whereConditions.push(eq(documentsTable.parentId, currentParentId));
    } else {
      whereConditions.push(isNull(documentsTable.parentId));
    }

    const [existingPage] = await db
      .select()
      .from(documentsTable)
      .where(and(...whereConditions))
      .limit(1);

    if (existingPage) {
      currentParentId = existingPage.id;
    } else {
      const newPageId = createId();
      const emptyContent = { type: "doc", content: [] };
      const yjsState = convertJsonToYjs(emptyContent);
      await db.insert(documentsTable).values({
        id: newPageId,
        title: pageName,
        slug: newPageId,
        yjsState: yjsState,
        userId,
        organizationId,
        parentId: currentParentId || null,
        published: false,
      });
      currentParentId = newPageId;
    }
  }

  return currentParentId;
}

export const MDXImportRoute = new Hono<{ Variables: Variables }>()
  .post("/create-page", async (c) => {
    try {
      const { pagePath } = await c.req.json();
      const userId = c.get("user").id;
      const organizationId = c.get("organizationId");

      const pageId = await getOrCreatePageByPath(pagePath, userId, organizationId);

      return c.json({ pageId });
    } catch (error) {
      console.error("❌ Page creation error:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: "Failed to create page",
      });
    }
  })
  .post("/", async (c) => {
    try {
      const { mdxContent, filename, pagePath, parentId } = await c.req.json();
      const userId = c.get("user").id;
      const organizationId = c.get("organizationId");

      if (!mdxContent) {
        throw new HTTPException(400, {
          message: "MDX content is required",
        });
      }

      const parsed = parseMDXContent(mdxContent, filename, {});

      let componentSchemas: Record<string, any> = {};
      if (parsed.components.length > 0) {
        const componentNames = [...new Set(parsed.components.map((c) => c.name))];
        const existingComponents = await db
          .select()
          .from(documentComponentsTable)
          .where(
            and(
              inArray(documentComponentsTable.name, componentNames),
              eq(documentComponentsTable.organizationId, organizationId),
            ),
          );

        for (const comp of existingComponents) {
          componentSchemas[comp.name] = comp.properties;
        }

        if (Object.keys(componentSchemas).length > 0) {
          const reparsed = parseMDXContent(mdxContent, filename, componentSchemas);
          parsed.content = reparsed.content;
        }
      }

      let finalParentId: string | undefined = parentId;
      if (!finalParentId && pagePath) {
        finalParentId = await getOrCreatePageByPath(pagePath, userId, organizationId);
      }

      const documentId = createId();
      const finalSlug = parsed.slug || documentId;

      const yjsState = convertJsonToYjs(parsed.content);

      const insertData = {
        id: documentId,
        title: parsed.title,
        slug: finalSlug,
        yjsState: yjsState,
        userId,
        organizationId,
        parentId: finalParentId || null,
        customFields: parsed.customFields || null,
        properties: parsed.properties || null,
        childSchema: parsed.childSchema || null,
        pageConfig: parsed.pageConfig || null,
        published: false,
      };

      await db.insert(documentsTable).values(insertData);

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

      if (insertedDocument.yjsState) {
        processDocumentEmbedding(
          {
            documentId: insertedDocument.id,
            yjsState: insertedDocument.yjsState,
          },
          db,
        ).catch((error) => {
          console.error(
            `Failed to generate embeddings for imported document ${documentId}:`,
            error,
          );
        });
      }

      const createdComponents: string[] = [];
      if (parsed.components.length > 0) {
        const uniqueComponents = Array.from(
          new Map(parsed.components.map((c) => [c.name, c])).values(),
        );

        const newComponents = uniqueComponents.filter((c) => !componentSchemas[c.name]);

        if (newComponents.length > 0) {
          const componentInserts = newComponents.map((component) => {
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

          try {
            await db.insert(documentComponentsTable).values(componentInserts);
            createdComponents.push(...componentInserts.map((c) => c.name));
          } catch {
            console.warn("Batch component insert failed, falling back to individual inserts");
            for (const insert of componentInserts) {
              try {
                await db.insert(documentComponentsTable).values(insert);
                createdComponents.push(insert.name);
              } catch {
                console.log(`Component ${insert.name} already exists, skipping`);
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
        parentId: finalParentId,
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
