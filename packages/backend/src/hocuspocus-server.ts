import { Hocuspocus, onAuthenticatePayload } from "@hocuspocus/server"
import { Database } from "@hocuspocus/extension-database"
import { db } from "@lydie/database"
import { documentsTable, membersTable } from "@lydie/database/schema"
import { eq, and } from "drizzle-orm"
import { authClient } from "@lydie/core/auth"
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing"

// Verify user has access to document
async function verifyDocumentAccess(documentId: string, userId: string): Promise<boolean> {
  try {
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1)

    if (!document) {
      return false
    }

    // Check if user is a member of the organization
    const membership = await db
      .select()
      .from(membersTable)
      .where(and(eq(membersTable.organizationId, document.organizationId), eq(membersTable.userId, userId)))
      .limit(1)

    return membership.length > 0
  } catch (error) {
    return false
  }
}

export const hocuspocus = new Hocuspocus({
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        try {
          const result = await db
            .select({ yjsState: documentsTable.yjsState })
            .from(documentsTable)
            .where(eq(documentsTable.id, documentName))
            .limit(1)

          if (!result[0] || !result[0].yjsState) {
            return null
          }

          // Convert base64 string back to Uint8Array
          const buffer = Buffer.from(result[0].yjsState, "base64")
          return new Uint8Array(buffer)
        } catch (error) {
          return null
        }
      },
      store: async ({ documentName, state }) => {
        // Convert Uint8Array to base64 string for storage
        const base64State = Buffer.from(state).toString("base64")

        await db
          .update(documentsTable)
          .set({
            yjsState: base64State,
            updatedAt: new Date(),
          })
          .where(eq(documentsTable.id, documentName))

        processDocumentEmbedding(
          {
            documentId: documentName,
            yjsState: base64State,
          },
          db,
        ).catch((error) => {
          console.error(`Failed to generate content embeddings for document ${documentName}:`, error)
        })
      },
    }),
  ],

  async onAuthenticate({ documentName, request }: onAuthenticatePayload): Promise<any> {
    if (!request?.headers) {
      throw new Error("Authentication required")
    }

    try {
      // Verify the session using better-auth by passing request headers
      // The headers should contain the cookie with the session token
      const session = await authClient.api.getSession({
        headers: request.headers as any,
      })

      if (!session?.user) {
        throw new Error("Invalid authentication")
      }

      // Verify user has access to the document
      const hasAccess = await verifyDocumentAccess(documentName, session.user.id)

      if (!hasAccess) {
        throw new Error("Access denied")
      }

      // Awareness
      return {
        id: session.user.id,
        name: session.user.name,
      }
    } catch (error) {
      throw new Error("Authentication failed")
    }
  },

  debounce: 25000,
})
