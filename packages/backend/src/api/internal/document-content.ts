import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { db, documentsTable } from "@lydie/database";
import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";

import { getHocuspocusDocumentState } from "../../hocuspocus-server";

/**
 * Route for reading document content from Hocuspocus directly.
 * This returns real-time document state without waiting for debounced DB saves.
 */
export const DocumentContentRoute = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>().get("/:documentId", async (c) => {
  const documentId = c.req.param("documentId");
  const organizationId = c.get("organizationId");

  // First verify the document exists and user has access
  const [document] = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      organizationId: documentsTable.organizationId,
      yjsState: documentsTable.yjsState,
    })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.organizationId, organizationId),
        sql`${documentsTable.deletedAt} IS NULL`,
      ),
    )
    .limit(1);

  if (!document) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Try to get the real-time state from Hocuspocus
  const hocuspocusState = getHocuspocusDocumentState(documentId);
  
  if (hocuspocusState) {
    // Document is currently being edited, return fresh Hocuspocus state
    const base64State = Buffer.from(hocuspocusState).toString("base64");
    const jsonContent = convertYjsToJson(base64State);
    
    return c.json({
      id: document.id,
      title: document.title,
      yjsState: base64State,
      jsonContent,
      source: "hocuspocus", // Indicates this is real-time in-memory state
    });
  }

  // Document not in memory, fall back to DB state
  const jsonContent = convertYjsToJson(document.yjsState);
  
  return c.json({
    id: document.id,
    title: document.title,
    yjsState: document.yjsState,
    jsonContent,
    source: "database", // Indicates this is from DB (may be slightly stale)
  });
});
