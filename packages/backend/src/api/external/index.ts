import { findRelatedDocuments } from "@lydie/core/embedding/search";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { db, documentsTable } from "@lydie/database";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

export const ExternalApi = new Hono()
  .use(apiKeyAuth)
  .use(externalRateLimit)
  .get("/documents", async (c) => {
    const organizationId = c.get("organizationId");
    const documents = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        published: documentsTable.published,
        customFields: documentsTable.customFields,
        coverImage: documentsTable.coverImage,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
          eq(documentsTable.published, true),
        ),
      )
      .orderBy(desc(documentsTable.createdAt));

    const documentsWithPaths = documents.map((doc) => ({
      ...doc,
      path: "/",
      fullPath: `/${doc.slug}`,
      customFields: doc.customFields || null,
    }));

    return c.json({
      documents: documentsWithPaths,
    });
  })
  .get("/documents/by-slugs", async (c) => {
    const organizationId = c.get("organizationId");
    const query = c.req.query("slugs");
    const slugs = query ? query.split(",") : [];

    if (slugs.length === 0) {
      return c.json({ documents: [] });
    }

    const documents = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        published: documentsTable.published,
        customFields: documentsTable.customFields,
        coverImage: documentsTable.coverImage,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
          eq(documentsTable.published, true),
          inArray(documentsTable.slug, slugs),
        ),
      )
      .orderBy(desc(documentsTable.createdAt));

    const documentsWithPaths = documents.map((doc) => ({
      ...doc,
      path: "/",
      fullPath: `/${doc.slug}`,
      customFields: doc.customFields || null,
    }));

    return c.json({
      documents: documentsWithPaths,
    });
  })
  .get("/documents/by-parent/:slug", async (c) => {
    console.log("[External API] Hit /documents/by-parent/:slug route");
    const organizationId = c.get("organizationId");
    const slug = c.req.param("slug");
    console.log(`[External API] slug param: ${slug}, org: ${organizationId}`);

    // First get the parent document by slug (parent doesn't need to be published)
    const parentResult = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.slug, slug),
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
        ),
      )
      .limit(1);

    if (parentResult.length === 0) {
      return c.json({ documents: [] });
    }

    const parentId = parentResult[0].id;

    // Get all children of this document (direct children only)
    const children = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        published: documentsTable.published,
        customFields: documentsTable.customFields,
        coverImage: documentsTable.coverImage,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
          eq(documentsTable.published, true),
          eq(documentsTable.parentId, parentId),
        ),
      )
      .orderBy(desc(documentsTable.createdAt));

    const childrenWithPaths = children.map((doc) => ({
      ...doc,
      path: "/",
      fullPath: `/${doc.slug}`,
      customFields: doc.customFields || null,
    }));

    return c.json({
      documents: childrenWithPaths,
    });
  })
  .get("/documents/:slug", async (c) => {
    console.log("[External API] Hit /documents/:slug route (generic)");
    const organizationId = c.get("organizationId");
    const slug = c.req.param("slug");
    console.log(`[External API] slug param: ${slug}, org: ${organizationId}`);
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";

    const documentResult = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.slug, slug),
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
          eq(documentsTable.published, true),
        ),
      )
      .limit(1);

    if (documentResult.length === 0) {
      throw new HTTPException(404, {
        message: "Document not found",
      });
    }

    const document = {
      ...documentResult[0],
      path: "/",
      fullPath: `/${slug}`,
    };

    const json = convertYjsToJson(document.yjsState);

    const transformedContent = await transformDocumentLinksToInternalLinkMarks(json);

    let related: Awaited<ReturnType<typeof findRelatedDocuments>> = [];
    if (includeRelated) {
      try {
        related = await findRelatedDocuments(document.id as string, organizationId, 5);
      } catch (error) {
        console.error("Error fetching related documents:", error);
        related = [];
      }
    }

    let toc: Array<{ id: string; level: number; text: string }> = [];
    if (includeToc) {
      try {
        toc = extractTableOfContents(transformedContent);
      } catch (error) {
        console.error("Error extracting table of contents:", error);
        toc = [];
      }
    }

    const { yjsState: _, ...documentWithoutYjs } = document;
    const response = {
      ...documentWithoutYjs,
      jsonContent: transformedContent,
      customFields: document.customFields || null,
      ...(includeRelated && { related }),
      ...(includeToc && { toc }),
    };

    return c.json(response);
  })
  .get("/documents/:slug/children", async (c) => {
    const organizationId = c.get("organizationId");
    const slug = c.req.param("slug");

    // First get the parent document by slug
    const parentResult = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.slug, slug),
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
          eq(documentsTable.published, true),
        ),
      )
      .limit(1);

    if (parentResult.length === 0) {
      throw new HTTPException(404, {
        message: "Parent document not found",
      });
    }

    const parentId = parentResult[0].id;

    // Get all children of this document
    const children = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        published: documentsTable.published,
        customFields: documentsTable.customFields,
        coverImage: documentsTable.coverImage,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.organizationId, organizationId),
          isNull(documentsTable.deletedAt),
          eq(documentsTable.published, true),
          eq(documentsTable.parentId, parentId),
        ),
      )
      .orderBy(documentsTable.sortOrder, documentsTable.createdAt);

    const childrenWithPaths = children.map((doc) => ({
      ...doc,
      path: `/${slug}`,
      fullPath: `/${slug}/${doc.slug}`,
      customFields: doc.customFields || null,
    }));

    return c.json({
      documents: childrenWithPaths,
    });
  });
