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
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import type { ContentNode } from "../utils/types";
import { findRelatedDocuments } from "@lydie/core/embedding/index";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";

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

    const document = await getDocumentWithPath(slug, organizationId, true);

    if (!document) {
      throw new HTTPException(404, {
        message: "Document not found",
      });
    }

    // Use Yjs as source of truth if available, otherwise fall back to jsonContent
    let jsonContent = document.jsonContent;
    if (document.yjsState) {
      try {
        const yjsJson = convertYjsToJson(document.yjsState);
        if (yjsJson) {
          jsonContent = yjsJson;
        } else {
          console.warn(
            `Failed to convert Yjs state for document ${document.id}, falling back to jsonContent`
          );
        }
      } catch (error) {
        console.error("Error converting Yjs to JSON:", error);
        // Fall back to jsonContent if conversion fails
      }
    }

    // Always transform internal:// links to internal-link marks with metadata
    let transformedContent = jsonContent;
    try {
      transformedContent = await transformDocumentLinksToInternalLinkMarks(
        jsonContent as ContentNode,
        organizationId
      );
    } catch (error) {
      console.error("Error transforming document links:", error);
      // Don't fail the request if link transformation fails
      transformedContent = jsonContent;
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

    // Add optional fields to the already-transformed document
    // Remove yjsState from response - we don't want to expose the binary state
    const { yjsState, ...documentWithoutYjs } = document;
    const response = {
      ...documentWithoutYjs,
      jsonContent: transformedContent,
      ...(includeRelated && { related }),
      ...(includeToc && { toc }),
    };

    return c.json(response);
  })
  .get("/documents/by-path/*", async (c) => {
    const organizationId = c.get("organizationId");
    const fullPath = c.req.param("*"); // Get the full path after /by-path/
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";

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

    // Use Yjs as source of truth if available, otherwise fall back to jsonContent
    let jsonContent = document.jsonContent;
    if (document.yjsState) {
      try {
        const yjsJson = convertYjsToJson(document.yjsState);
        if (yjsJson) {
          jsonContent = yjsJson;
        } else {
          console.warn(
            `Failed to convert Yjs state for document ${document.id}, falling back to jsonContent`
          );
        }
      } catch (error) {
        console.error("Error converting Yjs to JSON:", error);
        // Fall back to jsonContent if conversion fails
      }
    }

    // Always transform internal:// links to internal-link marks with metadata
    let transformedContent = jsonContent;
    try {
      transformedContent = await transformDocumentLinksToInternalLinkMarks(
        jsonContent as ContentNode,
        organizationId
      );
    } catch (error) {
      console.error("Error transforming document links:", error);
      // Don't fail the request if link transformation fails
      transformedContent = jsonContent;
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

    // Add optional fields to the already-transformed document
    // Remove yjsState from response - we don't want to expose the binary state
    const { yjsState, ...documentWithoutYjs } = document;
    const response = {
      ...documentWithoutYjs,
      jsonContent: transformedContent,
      ...(includeRelated && { related }),
      ...(includeToc && { toc }),
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
