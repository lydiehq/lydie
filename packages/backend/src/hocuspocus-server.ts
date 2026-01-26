import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus, onAuthenticatePayload } from "@hocuspocus/server";
import { authClient } from "@lydie/core/auth";
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";
import { db } from "@lydie/database";
import { documentsTable, membersTable } from "@lydie/database/schema";
import { and, eq } from "drizzle-orm";

async function verifyDocumentAccess(documentId: string, userId: string): Promise<boolean> {
  try {
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);

    if (!document) {
      return false;
    }

    const membership = await db
      .select()
      .from(membersTable)
      .where(
        and(
          eq(membersTable.organizationId, document.organizationId),
          eq(membersTable.userId, userId),
        ),
      )
      .limit(1);

    return membership.length > 0;
  } catch {
    return false;
  }
}

export const hocuspocus = new Hocuspocus({
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        console.log(`[Hocuspocus] 📖 Fetching document: ${documentName}`);
        try {
          const result = await db
            .select({ yjsState: documentsTable.yjsState })
            .from(documentsTable)
            .where(eq(documentsTable.id, documentName))
            .limit(1);

          if (!result[0] || !result[0].yjsState) {
            console.log(`[Hocuspocus] ⚠️  No state found for document: ${documentName}`);
            return null;
          }

          // Convert base64 string back to Uint8Array
          const buffer = Buffer.from(result[0].yjsState, "base64");
          const stateSize = buffer.length;
          console.log(`[Hocuspocus] ✅ Loaded document ${documentName} (${stateSize} bytes)`);
          return new Uint8Array(buffer);
        } catch (error) {
          console.error(`[Hocuspocus] ❌ Error fetching document ${documentName}:`, error);
          return null;
        }
      },
      store: async ({ documentName, state }) => {
        const stateSize = state.length;
        const base64State = Buffer.from(state).toString("base64");
        console.log(`[Hocuspocus] 💾 Storing document: ${documentName} (${stateSize} bytes)`);

        try {
          await db
            .update(documentsTable)
            .set({
              yjsState: base64State,
              updatedAt: new Date(),
            })
            .where(eq(documentsTable.id, documentName));

          console.log(`[Hocuspocus] ✅ Saved document: ${documentName}`);
        } catch (error) {
          console.error(`[Hocuspocus] ❌ Error saving document ${documentName}:`, error);
        }

        processDocumentEmbedding(
          {
            documentId: documentName,
            yjsState: base64State,
          },
          db,
        ).catch((error) => {
          console.error(
            `Failed to generate content embeddings for document ${documentName}:`,
            error,
          );
        });
      },
    }),
  ],

  async onAuthenticate({ documentName, request }: onAuthenticatePayload): Promise<any> {
    console.log(`[Hocuspocus] 🔐 Authenticating connection for document: ${documentName}`);
    if (!request?.headers) {
      console.error("[Hocuspocus] ❌ No headers provided");
      throw new Error("Authentication required");
    }

    try {
      const session = await authClient.api.getSession({
        headers: request.headers as any,
      });

      if (!session?.user) {
        console.error("[Hocuspocus] ❌ No valid session found");
        throw new Error("Invalid authentication");
      }

      console.log(`[Hocuspocus] 👤 User: ${session.user.name} (${session.user.id})`);

      const hasAccess = await verifyDocumentAccess(documentName, session.user.id);

      if (!hasAccess) {
        console.error(`[Hocuspocus] ❌ Access denied for user ${session.user.id} to document ${documentName}`);
        throw new Error("Access denied");
      }

      console.log(`[Hocuspocus] ✅ Authentication successful for ${session.user.name}`);

      return {
        id: session.user.id,
        name: session.user.name,
      };
    } catch (error) {
      console.error("[Hocuspocus] ❌ Authentication failed:", error);
      throw new Error("Authentication failed");
    }
  },

  async onConnect({ documentName, requestParameters, socketId }) {
    console.log(`[Hocuspocus] 🔌 Client connected to document: ${documentName} (socket: ${socketId})`);
  },

  async onDisconnect({ documentName, socketId }) {
    console.log(`[Hocuspocus] 🔌 Client disconnected from document: ${documentName} (socket: ${socketId})`);
  },

  async onChange({ documentName }) {
    console.log(`[Hocuspocus] 📝 Document changed: ${documentName} (will save in 25000ms)`);
  },

  debounce: 25000,
});
