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

type Variables = {
  organizationId: string;
  user: any;
};

// MDX Component regex patterns
const COMPONENT_REGEX = /<(\w+)([^>]*)>(.*?)<\/\1>|<(\w+)([^>]*?)\/>/gs;
const PROP_REGEX = /(\w+)=(?:{([^}]+)}|"([^"]*)")/g;

interface MDXComponent {
  name: string;
  props: Record<string, any>;
  children?: string;
}

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

function parseProps(propString: string): Record<string, any> {
  const props: Record<string, any> = {};
  let match;

  while ((match = PROP_REGEX.exec(propString)) !== null) {
    const [, key, jsValue, stringValue] = match;
    if (jsValue) {
      try {
        // Try to parse as JSON for objects/arrays/booleans/numbers
        props[key] = JSON.parse(jsValue);
      } catch {
        // If parsing fails, treat as string
        props[key] = jsValue;
      }
    } else {
      props[key] = stringValue;
    }
  }

  return props;
}

function extractMDXComponents(content: string): {
  components: MDXComponent[];
  cleanContent: string;
} {
  const components: MDXComponent[] = [];
  let cleanContent = content;
  let match;

  while ((match = COMPONENT_REGEX.exec(content)) !== null) {
    const [fullMatch, tagName1, props1, children, tagName2, props2] = match;
    const tagName = tagName1 || tagName2;
    const propsString = props1 || props2 || "";

    const component: MDXComponent = {
      name: tagName,
      props: parseProps(propsString),
      children: children || undefined,
    };

    components.push(component);

    // Replace the component with a placeholder that we'll convert to TipTap node
    cleanContent = cleanContent.replace(
      fullMatch,
      `[COMPONENT:${components.length - 1}]`
    );
  }

  return { components, cleanContent };
}

function parseFrontmatter(mdxContent: string): {
  frontmatter: MDXFrontmatter;
  contentWithoutFrontmatter: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = mdxContent.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      contentWithoutFrontmatter: mdxContent,
    };
  }

  const frontmatterYaml = match[1];
  const contentWithoutFrontmatter = match[2];
  const frontmatter: MDXFrontmatter = {};

  // Simple YAML parsing for title and slug
  const lines = frontmatterYaml.split("\n");
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line
        .substring(colonIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key === "title" || key === "slug") {
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, contentWithoutFrontmatter };
}

function mdxToTipTapJSON(
  mdxContent: string,
  components: MDXComponent[],
  componentSchemas: Record<string, any>
): any {
  const lines = mdxContent.split("\n");
  const content: any[] = [];
  let currentParagraph: any = null;
  let currentList: any = null; // Track current list
  let currentListType: "bullet" | "ordered" | null = null; // Track list type

  // Helper function to close current list
  const closeList = () => {
    if (currentList) {
      content.push(currentList);
      currentList = null;
      currentListType = null;
    }
  };

  // Helper function to close current paragraph
  const closeParagraph = () => {
    if (currentParagraph) {
      content.push(currentParagraph);
      currentParagraph = null;
    }
  };

  // Helper function to parse inline markdown (bold, italic, links)
  const parseInlineMarkdown = (text: string): any[] => {
    const textNodes: any[] = [];
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/);

    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        textNodes.push({
          type: "text",
          text: part.slice(2, -2),
          marks: [{ type: "bold" }],
        });
      } else if (part.startsWith("*") && part.endsWith("*")) {
        textNodes.push({
          type: "text",
          text: part.slice(1, -1),
          marks: [{ type: "italic" }],
        });
      } else if (part.match(/\[.*?\]\(.*?\)/)) {
        const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          textNodes.push({
            type: "text",
            text: linkMatch[1],
            marks: [{ type: "link", attrs: { href: linkMatch[2] } }],
          });
        }
      } else if (part) {
        textNodes.push({
          type: "text",
          text: part,
        });
      }
    }

    return textNodes;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle headings
    if (line.startsWith("#")) {
      closeParagraph();
      closeList();

      const level = line.match(/^#+/)?.[0].length || 1;
      const text = line.replace(/^#+\s*/, "");

      content.push({
        type: "heading",
        attrs: { level: Math.min(level, 6) },
        content: text ? [{ type: "text", text }] : [],
      });
      continue;
    }

    // Handle horizontal rules (---)
    if (line.trim() === "---") {
      closeParagraph();
      closeList();

      content.push({
        type: "horizontalRule",
      });
      continue;
    }

    // Handle unordered lists (-, *, +)
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (unorderedMatch) {
      closeParagraph();

      const listItemText = unorderedMatch[3];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      };

      if (currentListType !== "bullet") {
        closeList();
        currentList = {
          type: "bulletList",
          content: [],
        };
        currentListType = "bullet";
      }

      currentList.content.push(listItem);
      continue;
    }

    // Handle ordered lists (1., 2., etc.)
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      closeParagraph();

      const listItemText = orderedMatch[3];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      };

      if (currentListType !== "ordered") {
        closeList();
        currentList = {
          type: "orderedList",
          content: [],
        };
        currentListType = "ordered";
      }

      currentList.content.push(listItem);
      continue;
    }

    // Handle component placeholders
    const componentMatch = line.match(/\[COMPONENT:(\d+)\]/);
    if (componentMatch) {
      closeParagraph();
      closeList();

      const componentIndex = parseInt(componentMatch[1]);
      const component = components[componentIndex];

      // Get schema for this component
      const schema = componentSchemas[component.name] || {};

      content.push({
        type: "documentComponent",
        attrs: {
          name: component.name,
          properties: component.props,
          schemas: { [component.name]: schema },
        },
      });
      continue;
    }

    // Handle empty lines
    if (line.trim() === "") {
      closeParagraph();
      closeList();
      continue;
    }

    // Handle regular text
    closeList(); // Close any open list when we hit regular text

    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        content: [],
      };
    }

    const textNodes = parseInlineMarkdown(line);
    currentParagraph.content.push(...textNodes);
  }

  // Close any remaining open elements
  closeParagraph();
  closeList();

  // Ensure we always have at least one content node
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: [],
    });
  }

  const result = {
    type: "doc",
    content,
  };

  return result;
}

function parseMDXContent(
  mdxContent: string,
  filename: string | undefined,
  componentSchemas: Record<string, any> = {}
): ParsedMDXContent {
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

  const { components, cleanContent } = extractMDXComponents(contentString);

  const tipTapContent = mdxToTipTapJSON(
    cleanContent,
    components,
    componentSchemas
  );

  const result = {
    title,
    slug,
    content: tipTapContent,
    components,
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
