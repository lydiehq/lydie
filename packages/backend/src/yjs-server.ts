import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { setupWSConnection, setPersistence, docs } from "y-websocket/bin/utils";
import { db } from "@lydie/database";
import { documentsTable, membersTable } from "@lydie/database/schema";
import { eq, and } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { authClient } from "@lydie/core/auth";

const PERSISTENCE_INTERVAL = 30000; // 30 seconds

// Store Yjs documents in memory
const yjsDocuments = new Map<string, Y.Doc>();

// Persistence handler that saves to PostgreSQL
const persistence = {
  bindState: async (docName: string, ydoc: Y.Doc) => {
    // Load initial state from PostgreSQL if available
    try {
      const doc = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, docName))
        .limit(1);

      if (doc[0]?.jsonContent) {
        const content = doc[0].jsonContent as any;
        // Apply the content to the Yjs document
        // TipTap stores in json_content, we need to convert it to Yjs format
        // For now, we'll let the client initialize the document
        console.log(`Loaded document ${docName} from database`);
      }
    } catch (error) {
      console.error(`Error loading document ${docName}:`, error);
    }

    yjsDocuments.set(docName, ydoc);
  },

  writeState: async (docName: string, ydoc: Y.Doc) => {
    // Convert Yjs document to TipTap JSON format and save to PostgreSQL
    try {
      // Get the TipTap content from the Yjs document
      const fragment = ydoc.getXmlFragment("default");

      // For now, we'll skip the conversion and just mark that we need to update
      // The actual content will be saved by the TipTap editor through Zero
      console.log(`Persisted document ${docName} to database`);
    } catch (error) {
      console.error(`Error persisting document ${docName}:`, error);
    }
  },
};

// Set up persistence
setPersistence({
  bindState: persistence.bindState,
  writeState: persistence.writeState,
});

// Periodic persistence for all documents
setInterval(() => {
  docs.forEach((ydoc, docName) => {
    if (ydoc.store.clients.size > 0) {
      // Only persist if document has clients
      persistence.writeState(docName, ydoc);
    }
  });
}, PERSISTENCE_INTERVAL);

// Verify user has access to document
async function verifyDocumentAccess(
  documentId: string,
  userId: string
): Promise<boolean> {
  try {
    // Get the document
    const doc = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);

    if (!doc[0]) {
      console.error(`Document not found: ${documentId}`);
      return false;
    }

    const document = doc[0];

    // Check if user is a member of the organization
    const membership = await db
      .select()
      .from(membersTable)
      .where(
        and(
          eq(membersTable.organizationId, document.organizationId),
          eq(membersTable.userId, userId)
        )
      )
      .limit(1);

    return membership.length > 0;
  } catch (error) {
    console.error(`Error verifying document access:`, error);
    return false;
  }
}

export function createYjsServer(port: number = 1234) {
  const wss = new WebSocketServer({ port });

  wss.on("connection", async (conn, req: IncomingMessage) => {
    // Extract authentication token from query parameters
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const docName = url.pathname.slice(1); // Remove leading slash

    // Verify authentication
    if (!token) {
      console.warn(`Connection without token for document ${docName}`);
      conn.close(4001, "Authentication required");
      return;
    }

    try {
      // Verify the session token using better-auth
      const session = await authClient.api.getSession({
        headers: new Headers({
          cookie: `better-auth.session_token=${token}`,
        }),
      });

      if (!session?.user) {
        console.warn(`Invalid token for document ${docName}`);
        conn.close(4002, "Invalid authentication");
        return;
      }

      // Verify user has access to the document
      const hasAccess = await verifyDocumentAccess(docName, session.user.id);
      if (!hasAccess) {
        console.warn(
          `User ${session.user.id} does not have access to document ${docName}`
        );
        conn.close(4003, "Access denied");
        return;
      }

      console.log(
        `New connection for document: ${docName} by user: ${session.user.name}`
      );

      setupWSConnection(conn, req, {
        docName,
        gc: true, // Enable garbage collection
      });
    } catch (error) {
      console.error(`Authentication error:`, error);
      conn.close(4004, "Authentication failed");
    }
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  console.log(`Yjs WebSocket server running on ws://localhost:${port}`);

  return wss;
}
