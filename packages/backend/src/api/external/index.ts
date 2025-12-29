import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { apiKeyAuth } from "./middleware";
import { extractTableOfContents } from "../../utils/toc";
import {
  getDocumentsWithPaths,
  getDocumentWithPath,
  getDocumentByPath,
  getFoldersWithPaths,
} from "../../utils/document-path";
import {
  transformDocumentLinks,
  transformDocumentLinksSync,
  extractInternalLinks,
  fetchDocumentMetadata,
} from "../utils/link-transformer";
import type { ContentNode } from "../utils/types";
import { findRelatedDocuments } from "@lydie/core/embedding/index";

export const ExternalApi = new Hono()
  .use(apiKeyAuth)
  .get("/documents", async (c) => {
    const organizationId = c.get("organizationId");
    const documents = await getDocumentsWithPaths(organizationId, true);
    return c.json({
      documents,
    });
  })
  .get("/documents/:slug", async (c) => {
    const organizationId = c.get("organizationId");
    const slug = c.req.param("slug");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";
    const transformLinks = c.req.query("transform_links") !== "false"; // Default: true
    const useIds = c.req.query("use_ids") === "true"; // Default: false (use slugs)
    const includeLinkMetadata = c.req.query("include_link_metadata") === "true";

    const document = await getDocumentWithPath(slug, organizationId, true);

    if (!document) {
      throw new HTTPException(404, {
        message: "Document not found",
      });
    }

    // Transform internal:// links to relative URLs
    let transformedContent = document.jsonContent;
    if (transformLinks) {
      try {
        if (useIds) {
          // Fast path: just convert internal://ID to /ID without DB lookups
          transformedContent = transformDocumentLinksSync(
            document.jsonContent as ContentNode
          );
        } else {
          // Resolve slugs for SEO-friendly URLs
          transformedContent = await transformDocumentLinks(
            document.jsonContent as ContentNode,
            { organizationId, useIds }
          );
        }
      } catch (error) {
        console.error("Error transforming document links:", error);
        // Don't fail the request if link transformation fails
        transformedContent = document.jsonContent;
      }
    }

    let related: Awaited<ReturnType<typeof findRelatedDocuments>> = [];
    if (includeRelated) {
      try {
        related = await findRelatedDocuments(
          document.id as string,
          organizationId,
          5
        );
      } catch (error) {
        console.error("Error fetching related documents:", error);
        // Don't fail the whole request if related documents fail
        related = [];
      }
    }

    let toc: Array<{ id: string; level: number; text: string }> = [];
    if (includeToc) {
      try {
        toc = extractTableOfContents(transformedContent);
      } catch (error) {
        console.error("Error extracting table of contents:", error);
        // Don't fail the whole request if TOC extraction fails
        toc = [];
      }
    }

    // Optionally include link metadata for frontend resolution
    let linkMetadata: Record<string, { id: string; slug: string; title: string }> = {};
    if (includeLinkMetadata) {
      try {
        const internalLinkIds = extractInternalLinks(document.jsonContent as ContentNode);
        if (internalLinkIds.size > 0) {
          const metadataMap = await fetchDocumentMetadata(
            Array.from(internalLinkIds),
            organizationId
          );
          // Convert Map to plain object for JSON response
          for (const [id, metadata] of metadataMap.entries()) {
            if (metadata.exists) {
              linkMetadata[id] = {
                id: metadata.id,
                slug: metadata.slug || metadata.id,
                title: metadata.title || "",
              };
            }
          }
        }
      } catch (error) {
        console.error("Error fetching link metadata:", error);
        linkMetadata = {};
      }
    }

    // Add optional fields to the already-transformed document
    const response = {
      ...document,
      jsonContent: transformedContent,
      ...(includeRelated && { related }),
      ...(includeToc && { toc }),
      ...(includeLinkMetadata && { linkMetadata }),
    };

    return c.json(response);
  })
  .get("/documents/by-path/*", async (c) => {
    const organizationId = c.get("organizationId");
    const fullPath = c.req.param("*"); // Get the full path after /by-path/
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";
    const transformLinks = c.req.query("transform_links") !== "false"; // Default: true
    const useIds = c.req.query("use_ids") === "true"; // Default: false (use slugs)
    const includeLinkMetadata = c.req.query("include_link_metadata") === "true";

    if (!fullPath) {
      throw new HTTPException(400, {
        message: "Path parameter is required",
      });
    }

    const document = await getDocumentByPath(fullPath, organizationId, true);

    if (!document) {
      throw new HTTPException(404, {
        message: "Document not found at the specified path",
      });
    }

    // Transform internal:// links to relative URLs
    let transformedContent = document.jsonContent;
    if (transformLinks) {
      try {
        if (useIds) {
          // Fast path: just convert internal://ID to /ID without DB lookups
          transformedContent = transformDocumentLinksSync(
            document.jsonContent as ContentNode
          );
        } else {
          // Resolve slugs for SEO-friendly URLs
          transformedContent = await transformDocumentLinks(
            document.jsonContent as ContentNode,
            { organizationId, useIds }
          );
        }
      } catch (error) {
        console.error("Error transforming document links:", error);
        // Don't fail the request if link transformation fails
        transformedContent = document.jsonContent;
      }
    }

    let related: Awaited<ReturnType<typeof findRelatedDocuments>> = [];
    if (includeRelated) {
      try {
        related = await findRelatedDocuments(
          document.id as string,
          organizationId,
          5
        );
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

    // Optionally include link metadata for frontend resolution
    let linkMetadata: Record<string, { id: string; slug: string; title: string }> = {};
    if (includeLinkMetadata) {
      try {
        const internalLinkIds = extractInternalLinks(document.jsonContent as ContentNode);
        if (internalLinkIds.size > 0) {
          const metadataMap = await fetchDocumentMetadata(
            Array.from(internalLinkIds),
            organizationId
          );
          // Convert Map to plain object for JSON response
          for (const [id, metadata] of metadataMap.entries()) {
            if (metadata.exists) {
              linkMetadata[id] = {
                id: metadata.id,
                slug: metadata.slug || metadata.id,
                title: metadata.title || "",
              };
            }
          }
        }
      } catch (error) {
        console.error("Error fetching link metadata:", error);
        linkMetadata = {};
      }
    }

    // Add optional fields to the already-transformed document
    const response = {
      ...document,
      jsonContent: transformedContent,
      ...(includeRelated && { related }),
      ...(includeToc && { toc }),
      ...(includeLinkMetadata && { linkMetadata }),
    };

    return c.json(response);
  })
  .get("/folders", async (c) => {
    const organizationId = c.get("organizationId");
    const folders = await getFoldersWithPaths(organizationId, true);

    return c.json({
      folders,
    });
  });
