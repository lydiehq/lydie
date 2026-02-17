import type { FieldDefinition } from "@lydie/core/database";
import { db } from "@lydie/database";
import { documentsTable } from "@lydie/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";

/**
 * GET /api/pages/:pageId/records
 * Query params: filter[field]=value, sort[field]=asc|desc
 * Returns child documents with their properties
 */
export const DatabaseRoute = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>().get("/:pageId/records", async (c) => {
  const { pageId } = c.req.param();
  const { organizationId } = c.get();

  const query = c.req.query();

  // Get the parent page to check its schema
  const parentPage = await db.query.documentsTable.findFirst({
    where: and(
      eq(documentsTable.id, pageId),
      eq(documentsTable.organizationId, organizationId),
      isNull(documentsTable.deletedAt),
    ),
  });

  if (!parentPage) {
    return c.json({ error: "Page not found" }, 404);
  }

  // Get child documents
  let children = await db.query.documentsTable.findMany({
    where: and(
      eq(documentsTable.parentId, pageId),
      eq(documentsTable.organizationId, organizationId),
      isNull(documentsTable.deletedAt),
    ),
    orderBy: (documents, { desc }) => [desc(documents.createdAt)],
  });

  // Handle filtering
  const filterParams = Object.entries(query).filter(([key]) => key.startsWith("filter["));

  if (filterParams.length > 0) {
    children = children.filter((child) => {
      return filterParams.every(([key, value]) => {
        const field = key.match(/filter\[(\w+)\]/)?.[1];
        if (!field) return true;
        const properties = (child.properties || {}) as Record<string, unknown>;
        return properties[field] === value;
      });
    });
  }

  // Handle sorting
  const sortParam = Object.entries(query).find(([key]) => key.startsWith("sort["));
  if (sortParam) {
    const [key, direction] = sortParam;
    const field = key.match(/sort\[(\w+)\]/)?.[1];
    if (field) {
      children = [...children].sort((a, b) => {
        const aVal = (a.properties || {})[field] as string | number | null;
        const bVal = (b.properties || {})[field] as string | number | null;

        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return direction === "asc" ? 1 : -1;
        if (bVal === null) return direction === "asc" ? -1 : 1;

        if (aVal < bVal) return direction === "asc" ? -1 : 1;
        if (aVal > bVal) return direction === "asc" ? 1 : -1;
        return 0;
      });
    }
  }

  // Map to response format
  const records = children.map((child) => ({
    id: child.id,
    documentId: child.id,
    title: child.title,
    properties: child.properties || {},
    createdAt: child.createdAt.toISOString(),
    updatedAt: child.updatedAt.toISOString(),
  }));

  return c.json({ records });
});

/**
 * Helper function to resolve public URL for a document
 * Uses parent page's child_schema configuration
 */
export async function resolvePublicUrl(
  documentId: string,
  organizationId: string,
): Promise<string | null> {
  const document = await db.query.documentsTable.findFirst({
    where: and(
      eq(documentsTable.id, documentId),
      eq(documentsTable.organizationId, organizationId),
      isNull(documentsTable.deletedAt),
    ),
  });

  if (!document || !document.parentId) {
    return null;
  }

  const parent = await db.query.documentsTable.findFirst({
    where: and(
      eq(documentsTable.id, document.parentId),
      eq(documentsTable.organizationId, organizationId),
      isNull(documentsTable.deletedAt),
    ),
  });

  if (!parent) {
    return null;
  }

  // Get the slug from document properties or use document slug
  const properties = (document.properties || {}) as Record<string, string>;
  const slug = properties.slug || document.slug;

  // Simple URL pattern: /:parentSlug/:documentSlug
  return `/${parent.slug}/${slug}`;
}
