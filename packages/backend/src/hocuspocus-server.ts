import { Hocuspocus, onAuthenticatePayload } from "@hocuspocus/server";
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
    return false;
  }
}

// Create Hocuspocus server instance
export const hocuspocus = new Hocuspocus({
  extensions: [
    new Database({
      // Fetch document state from database
      fetch: async ({ documentName }) => {
        try {
          const result = await db
            .select({ yjsState: documentsTable.yjsState })
            .from(documentsTable)
            .where(eq(documentsTable.id, documentName))
            .limit(1);

          if (!result[0] || !result[0].yjsState) {
            return null;
          }

          // Convert base64 string back to Uint8Array
          const buffer = Buffer.from(result[0].yjsState, "base64");
          return new Uint8Array(buffer);
        } catch (error) {
          return null;
        }
      },
      // Store document state to database
      store: async ({ documentName, state }) => {
        try {
          // Convert Uint8Array to base64 string for storage
          const base64State = Buffer.from(state).toString("base64");

          await db
            .update(documentsTable)
            .set({
              yjsState: base64State,
              updatedAt: new Date(),
            })
            .where(eq(documentsTable.id, documentName));
        } catch (error) {
          // Silently fail - state will be retried on next update
        }
      },
    }),
  ],

  // Authentication hook
  async onAuthenticate({
    documentName,
    request,
  }: onAuthenticatePayload): Promise<any> {
    if (!request?.headers) {
      throw new Error("Authentication required");
    }

    try {
      // Verify the session using better-auth by passing request headers
      // The headers should contain the cookie with the session token
      const session = await authClient.api.getSession({
        headers: request.headers as any,
      });

      if (!session?.user) {
        throw new Error("Invalid authentication");
      }

      // Verify user has access to the document
      const hasAccess = await verifyDocumentAccess(
        documentName,
        session.user.id
      );

      if (!hasAccess) {
        throw new Error("Access denied");
      }

      // For awareness
      return {
        id: session.user.id,
        name: session.user.name,
      };
    } catch (error) {
      throw new Error("Authentication failed");
    }
  },

  debounce: 30000,
});
