import { Hocuspocus, onAuthenticatePayload } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Database } from "@hocuspocus/extension-database";
import { db } from "@lydie/database";
import { documentsTable, membersTable } from "@lydie/database/schema";
import { eq, and } from "drizzle-orm";
import { authClient } from "@lydie/core/auth";

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
      console.error(`[Hocuspocus] Document not found: ${documentId}`);
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
    console.error(`[Hocuspocus] Error verifying document access:`, error);
    return false;
  }
}

// Create Hocuspocus server instance
export const hocuspocus = new Hocuspocus({
  // Enable development logging and persistence
  extensions: [
    new Logger({
      log: (message: string) => console.log(`[Hocuspocus] ${message}`),
    }),
    new Database({
      // Fetch document state from database
      fetch: async ({ documentName }) => {
        try {
          console.log(`[Hocuspocus] Fetching document: ${documentName}`);

          const result = await db
            .select({ yjsState: documentsTable.yjsState })
            .from(documentsTable)
            .where(eq(documentsTable.id, documentName))
            .limit(1);

          if (!result[0] || !result[0].yjsState) {
            console.log(
              `[Hocuspocus] No persisted state found for: ${documentName}`
            );
            return null;
          }

          // Convert base64 string back to Uint8Array
          const buffer = Buffer.from(result[0].yjsState, "base64");
          const uint8Array = new Uint8Array(buffer);
          console.log(
            `[Hocuspocus] Loaded ${uint8Array.length} bytes for: ${documentName}`
          );
          return uint8Array;
        } catch (error) {
          console.error(
            `[Hocuspocus] Error fetching document ${documentName}:`,
            error
          );
          return null;
        }
      },
      // Store document state to database
      store: async ({ documentName, state }) => {
        try {
          // Convert Uint8Array to base64 string for storage
          const base64State = Buffer.from(state).toString("base64");

          console.log(
            `[Hocuspocus] Storing ${state.length} bytes for: ${documentName}`
          );

          await db
            .update(documentsTable)
            .set({
              yjsState: base64State,
              updatedAt: new Date(),
            })
            .where(eq(documentsTable.id, documentName));

          console.log(
            `[Hocuspocus] Successfully stored state for: ${documentName}`
          );
        } catch (error) {
          console.error(
            `[Hocuspocus] Error storing document ${documentName}:`,
            error
          );
        }
      },
    }),
  ],

  // Authentication hook
  async onAuthenticate({
    documentName,
    request,
  }: onAuthenticatePayload): Promise<any> {
    console.log("Authenticating...");
    // Read cookie header from request
    if (!request?.headers) {
      console.warn(
        `[Hocuspocus] Connection without headers for document ${documentName}`
      );
      throw new Error("Authentication required");
    }

    try {
      // Verify the session using better-auth by passing request headers
      // The headers should contain the cookie with the session token
      const session = await authClient.api.getSession({
        headers: request.headers as any,
      });

      if (!session?.user) {
        console.warn(
          `[Hocuspocus] Invalid session for document ${documentName}`
        );
        throw new Error("Invalid authentication");
      }

      console.log("siosss", documentName);

      // Verify user has access to the document
      const hasAccess = await verifyDocumentAccess(
        documentName,
        session.user.id
      );

      if (!hasAccess) {
        console.warn(
          `[Hocuspocus] User ${session.user.id} does not have access to document ${documentName}`
        );
        throw new Error("Access denied");
      }

      console.log(
        `[Hocuspocus] Authenticated connection for document: ${documentName} by user: ${session.user.name}`
      );

      // Return user data for awareness
      return {
        id: session.user.id,
        name: session.user.name,
      };
    } catch (error) {
      console.error(`[Hocuspocus] Authentication error:`, error);
      throw new Error("Authentication failed");
    }
  },

  debounce: 30000,

  // Add onConnect hook for logging
  async onConnect({ documentName, socketId }) {
    console.log(
      `[Hocuspocus] Client connected - Document: ${documentName}, Socket: ${socketId}`
    );
  },

  // Add connected hook for logging
  async connected({ documentName, socketId }) {
    console.log(
      `[Hocuspocus] Client fully synced - Document: ${documentName}, Socket: ${socketId}`
    );
  },

  async onDisconnect({ documentName, socketId }) {
    console.log(
      `[Hocuspocus] Client disconnected - Document: ${documentName}, Socket: ${socketId}`
    );
  },
});
