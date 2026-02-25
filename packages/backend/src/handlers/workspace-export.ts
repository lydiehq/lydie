import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { ContentNode } from "@lydie/core/content";
import { serializeToMarkdown } from "@lydie/core/serialization/markdown";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { db, documentsTable } from "@lydie/database";
import { and, eq, isNull } from "drizzle-orm";

import { env, requireEnv } from "../env";

const s3Client = new S3Client({ region: "us-east-1" });

interface ExportEvent {
  organizationId: string;
  userId: string;
  exportId: string;
}

interface DocumentWithChildren {
  id: string;
  title: string;
  slug: string;
  content: ContentNode;
  properties: Record<string, string | number | boolean | null>;
  childSchema: Array<{ field: string; type: string; required: boolean; options?: string[] }> | null;
  pageConfig: { showChildrenInSidebar: boolean; defaultView: "documents" | "table" } | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: DocumentWithChildren[];
}

function generateFrontmatter(
  doc: DocumentWithChildren,
  metadata: {
    originalId: string;
    sortOrder: number;
    path: string;
  },
): string {
  const frontmatterData: Record<string, unknown> = {
    title: doc.title,
    slug: doc.slug,
    ...metadata,
  };

  // Add properties as top-level fields for easy editing
  if (doc.properties && Object.keys(doc.properties).length > 0) {
    frontmatterData.properties = doc.properties;
  }

  // Add child schema if present (this page is a database)
  if (doc.childSchema && doc.childSchema.length > 0) {
    frontmatterData.childSchema = doc.childSchema;
  }

  // Add page config
  if (doc.pageConfig) {
    frontmatterData.pageConfig = doc.pageConfig;
  }

  // Generate YAML frontmatter
  const yamlLines = ["---"];
  for (const [key, value] of Object.entries(frontmatterData)) {
    if (value === null || value === undefined) {
      yamlLines.push(`${key}: null`);
    } else if (typeof value === "string") {
      // Escape special characters in strings
      const escaped = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      yamlLines.push(`${key}: "${escaped}"`);
    } else if (typeof value === "number") {
      yamlLines.push(`${key}: ${value}`);
    } else if (typeof value === "boolean") {
      yamlLines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          yamlLines.push(`  - ${JSON.stringify(item)}`);
        } else {
          yamlLines.push(`  - ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === "object") {
      yamlLines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === null || subValue === undefined) {
          yamlLines.push(`  ${subKey}: null`);
        } else if (typeof subValue === "string") {
          const escaped = subValue.replace(/"/g, '\\"').replace(/\n/g, "\\n");
          yamlLines.push(`  ${subKey}: "${escaped}"`);
        } else if (typeof subValue === "boolean") {
          yamlLines.push(`  ${subKey}: ${subValue}`);
        } else {
          yamlLines.push(`  ${subKey}: ${subValue}`);
        }
      }
    }
  }
  yamlLines.push("---");

  return yamlLines.join("\n");
}

function sanitizeFilename(title: string): string {
  // Replace special characters with underscores
  return title
    .replace(/[^a-zA-Z0-9\-_\s]/g, "_")
    .replace(/\s+/g, "-")
    .substring(0, 100); // Limit length
}

async function getDocumentsForExport(organizationId: string): Promise<DocumentWithChildren[]> {
  const allDocs = await db
    .select()
    .from(documentsTable)
    .where(
      and(eq(documentsTable.organizationId, organizationId), isNull(documentsTable.deletedAt)),
    );

  // Build a map for quick lookup
  const docMap = new Map<string, DocumentWithChildren>();
  for (const doc of allDocs) {
    const jsonContent = convertYjsToJson(doc.yjsState);
    docMap.set(doc.id, {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      content: jsonContent as ContentNode,
      properties: (doc.properties as Record<string, string | number | boolean | null>) || {},
      childSchema: doc.childSchema as Array<{
        field: string;
        type: string;
        required: boolean;
        options?: string[];
      }> | null,
      pageConfig: (doc.pageConfig as {
        showChildrenInSidebar: boolean;
        defaultView: "documents" | "table";
      } | null) || { showChildrenInSidebar: true, defaultView: "documents" },
      sortOrder: doc.sortOrder,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      children: [],
    });
  }

  // Build tree structure
  const rootDocs: DocumentWithChildren[] = [];
  for (const doc of docMap.values()) {
    const originalDoc = allDocs.find((d) => d.id === doc.id);
    if (originalDoc?.parentId && docMap.has(originalDoc.parentId)) {
      const parent = docMap.get(originalDoc.parentId);
      if (parent) {
        parent.children.push(doc);
      }
    } else {
      rootDocs.push(doc);
    }
  }

  return rootDocs;
}

function collectDocuments(
  docs: DocumentWithChildren[],
  path = "",
): Array<{ doc: DocumentWithChildren; path: string }> {
  const result: Array<{ doc: DocumentWithChildren; path: string }> = [];

  for (const doc of docs) {
    const docPath = path ? `${path}/${sanitizeFilename(doc.title)}` : sanitizeFilename(doc.title);
    result.push({ doc, path: docPath });

    if (doc.children.length > 0) {
      result.push(...collectDocuments(doc.children, docPath));
    }
  }

  return result;
}

async function createManifestAndUploadFiles(
  exportId: string,
  organizationId: string,
  documents: Array<{ doc: DocumentWithChildren; path: string }>,
): Promise<{ fileCount: number; manifestKey: string }> {
  const bucketName = requireEnv(env.S3_BUCKET_EXPORTS, "S3_BUCKET_EXPORTS");

  const manifest = {
    version: "1.0.0",
    exportId,
    organizationId,
    exportedAt: new Date().toISOString(),
    totalDocuments: documents.length,
    documents: documents.map(({ doc, path }) => ({
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      path,
      sortOrder: doc.sortOrder,
      properties: doc.properties,
      childSchema: doc.childSchema,
      pageConfig: doc.pageConfig,
      filename: `${path}/${doc.slug}.md`,
    })),
  };

  // Upload manifest
  const manifestKey = `exports/${organizationId}/${exportId}/manifest.json`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
    }),
  );

  // Upload each document as a markdown file
  let fileCount = 0;
  for (const { doc, path: docPath } of documents) {
    const frontmatter = generateFrontmatter(doc, {
      originalId: doc.id,
      sortOrder: doc.sortOrder,
      path: docPath,
    });

    const markdown = serializeToMarkdown(doc.content);
    const fullContent = `${frontmatter}\n\n${markdown}`;

    const filename = `${docPath}/${doc.slug}.md`;
    const key = `exports/${organizationId}/${exportId}/${filename}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fullContent,
        ContentType: "text/markdown",
      }),
    );
    fileCount++;
  }

  // Add a README
  const readme = `# Lydie Workspace Export

Exported at: ${new Date().toISOString()}
Total documents: ${documents.length}

## Format

Each document is exported as a Markdown file with YAML frontmatter containing:
- \`title\`: Document title
- \`slug\`: URL-friendly slug
- \`originalId\`: Original document ID (for re-importing)
- \`sortOrder\`: Document sort order
- \`path\`: Hierarchical path
- \`properties\`: Document properties (database fields)
- \`childSchema\`: Schema for child documents (if this is a database)
- \`pageConfig\`: Page display configuration

## Import

To import this workspace back into Lydie, use the workspace import feature with the manifest.json file.
`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `exports/${organizationId}/${exportId}/README.md`,
      Body: readme,
      ContentType: "text/markdown",
    }),
  );

  return { fileCount, manifestKey };
}

export async function handler(event: ExportEvent) {
  console.log("Processing workspace export:", event);

  try {
    const { organizationId, exportId } = event;

    // Get all documents
    const rootDocs = await getDocumentsForExport(organizationId);

    if (rootDocs.length === 0) {
      throw new Error("No documents found for export");
    }

    // Flatten document tree
    const allDocs = collectDocuments(rootDocs);

    // Upload files
    const { fileCount, manifestKey } = await createManifestAndUploadFiles(
      exportId,
      organizationId,
      allDocs,
    );

    console.log(`Export completed: ${fileCount} files uploaded, manifest: ${manifestKey}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        exportId,
        documentCount: allDocs.length,
        fileCount,
        manifestKey,
      }),
    };
  } catch (error) {
    console.error("Error processing workspace export:", error);
    throw error;
  }
}
