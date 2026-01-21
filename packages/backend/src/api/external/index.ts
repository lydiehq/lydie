import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { apiKeyAuth } from "./middleware"
import { extractTableOfContents } from "../../utils/toc"
import { db, documentsTable } from "@lydie/database"
import { eq, and, isNull, desc } from "drizzle-orm"
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer"
import { findRelatedDocuments } from "@lydie/core/embedding/index"
import { convertYjsToJson } from "@lydie/core/yjs-to-json"

export const ExternalApi = new Hono()
  .use(apiKeyAuth)
  .get("/documents", async (c) => {
    const organizationId = c.get("organizationId")
    const documents = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        slug: documentsTable.slug,
        published: documentsTable.published,
        customFields: documentsTable.customFields,
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
      .orderBy(desc(documentsTable.createdAt))

    const documentsWithPaths = documents.map((doc) => ({
      ...doc,
      path: "/",
      fullPath: `/${doc.slug}`,
      customFields: doc.customFields || null,
    }))

    return c.json({
      documents: documentsWithPaths,
    })
  })
  .get("/documents/:slug", async (c) => {
    const organizationId = c.get("organizationId")
    const slug = c.req.param("slug")
    const includeRelated = c.req.query("include_related") === "true"
    const includeToc = c.req.query("include_toc") === "true"

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
      .limit(1)

    if (documentResult.length === 0) {
      throw new HTTPException(404, {
        message: "Document not found",
      })
    }

    const document = {
      ...documentResult[0],
      path: "/",
      fullPath: `/${slug}`,
    }

    const json = convertYjsToJson(document.yjsState)

    const transformedContent = await transformDocumentLinksToInternalLinkMarks(json, organizationId)

    let related: Awaited<ReturnType<typeof findRelatedDocuments>> = []
    if (includeRelated) {
      try {
        related = await findRelatedDocuments(document.id as string, organizationId, 5)
      } catch (error) {
        console.error("Error fetching related documents:", error)
        // Don't fail the whole request if related documents fail
        related = []
      }
    }

    let toc: Array<{ id: string; level: number; text: string }> = []
    if (includeToc) {
      try {
        toc = extractTableOfContents(transformedContent)
      } catch (error) {
        console.error("Error extracting table of contents:", error)
        // Don't fail the whole request if TOC extraction fails
        toc = []
      }
    }

    // Add optional fields to the already-transformed document
    // Remove yjsState from response - we don't want to expose the binary state
    const { yjsState, ...documentWithoutYjs } = document
    const response = {
      ...documentWithoutYjs,
      jsonContent: transformedContent,
      customFields: document.customFields || null,
      ...(includeRelated && { related }),
      ...(includeToc && { toc }),
    }

    return c.json(response)
  })
