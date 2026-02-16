import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus, onAuthenticatePayload } from "@hocuspocus/server";
import { authClient } from "@lydie/core/auth";
import { registerHocuspocusAccessor } from "@lydie/core/document-state";
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";
import { createId } from "@lydie/core/id";
import { db } from "@lydie/database";
import { documentVersionsTable, documentsTable, membersTable } from "@lydie/database/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import * as Y from "yjs";

// Track last version creation time per document
const lastVersionTime = new Map<string, number>();
const VERSION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes minimum between auto-versions
const MAX_VERSIONS_PER_DOCUMENT = 100; // Keep only the most recent 100 versions

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
  quiet: true,
  extensions: [
    new Database({
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

          const buffer = Buffer.from(result[0].yjsState, "base64");
          return new Uint8Array(buffer);
        } catch {
          return null;
        }
      },
      store: async ({ documentName, state, context }) => {
        const base64State = Buffer.from(state).toString("base64");

        const [document] = await db
          .select({ title: documentsTable.title, organizationId: documentsTable.organizationId })
          .from(documentsTable)
          .where(eq(documentsTable.id, documentName))
          .limit(1);

        await db
          .update(documentsTable)
          .set({
            yjsState: base64State,
            updatedAt: new Date(),
          })
          .where(eq(documentsTable.id, documentName));

        const now = Date.now();
        const lastTime = lastVersionTime.get(documentName) || 0;

        if (now - lastTime >= VERSION_INTERVAL_MS) {
          try {
            const [latestVersion] = await db
              .select({ versionNumber: documentVersionsTable.versionNumber })
              .from(documentVersionsTable)
              .where(eq(documentVersionsTable.documentId, documentName))
              .orderBy(desc(documentVersionsTable.versionNumber))
              .limit(1);

            const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

            await db.insert(documentVersionsTable).values({
              id: createId(),
              documentId: documentName,
              userId: context?.id || null,
              title: document?.title || "Untitled",
              yjsState: base64State,
              versionNumber: nextVersionNumber,
              changeDescription: "Auto-saved",
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // Clean up old versions to prevent unbounded growth
            const versionsToDelete = await db
              .select({ id: documentVersionsTable.id })
              .from(documentVersionsTable)
              .where(eq(documentVersionsTable.documentId, documentName))
              .orderBy(desc(documentVersionsTable.createdAt))
              .offset(MAX_VERSIONS_PER_DOCUMENT);

            if (versionsToDelete.length > 0) {
              await db.delete(documentVersionsTable).where(
                and(
                  eq(documentVersionsTable.documentId, documentName),
                  inArray(
                    documentVersionsTable.id,
                    versionsToDelete.map((v) => v.id),
                  ),
                ),
              );
            }

            lastVersionTime.set(documentName, now);
          } catch (error) {
            console.error(`Failed to create auto-version for document ${documentName}:`, error);
          }
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

  async onAuthenticate({ documentName, request, token }: onAuthenticatePayload): Promise<any> {
    if (!request?.headers) {
      console.error("[Hocuspocus Auth] No request headers available");
      throw new Error("Authentication required");
    }

    // Log request details for debugging
    // request.headers is IncomingHttpHeaders from Node.js
    const headers = request.headers;
    const cookieHeader = headers.cookie;

    console.log("[Hocuspocus Auth] Authentication attempt", {
      documentName,
      hasToken: !!token,
      tokenValue: token ? `${token.substring(0, 20)}...` : null,
      hasCookies: !!cookieHeader,
      cookieLength: typeof cookieHeader === "string" ? cookieHeader.length : 0,
      headerNames: Object.keys(headers),
    });

    try {
      const session = await authClient.api.getSession({
        headers: request.headers as any,
      });

      console.log("[Hocuspocus Auth] Session result", {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
      });

      if (!session?.user) {
        console.error("[Hocuspocus Auth] No user in session");
        throw new Error("Invalid authentication");
      }

      const hasAccess = await verifyDocumentAccess(documentName, session.user.id);

      console.log("[Hocuspocus Auth] Access check", {
        userId: session.user.id,
        documentName,
        hasAccess,
      });

      if (!hasAccess) {
        console.error(
          "[Hocuspocus Auth] Access denied for user",
          session.user.id,
          "to document",
          documentName,
        );
        throw new Error("Access denied");
      }

      console.log("[Hocuspocus Auth] Authentication successful for user", session.user.id);

      return {
        id: session.user.id,
        name: session.user.name,
      };
    } catch (error) {
      console.error("[Hocuspocus Auth] Authentication error:", error);
      // Re-throw the original error for better debugging
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Authentication failed");
    }
  },

  async onDisconnect({ documentName, document }) {
    // Save immediately when any client disconnects
    // This prevents stale data when:
    // 1. User refreshes page before debounce fires
    // 2. User leaves while others are still editing (their changes should persist)
    const yjsState = Y.encodeStateAsUpdate(document);
    const base64State = Buffer.from(yjsState).toString("base64");

    await db
      .update(documentsTable)
      .set({
        yjsState: base64State,
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, documentName));
  },

  debounce: 5000,
});

/**
 * Get the current document state directly from Hocuspocus memory.
 * This returns the real-time state without waiting for debounced DB saves.
 * Returns null if the document is not currently loaded in memory.
 */
export function getHocuspocusDocumentState(documentId: string): Uint8Array | null {
  const document = hocuspocus.documents.get(documentId);

  if (!document) {
    return null;
  }

  return Y.encodeStateAsUpdate(document);
}

// Register the accessor so the core package can read real-time document state
registerHocuspocusAccessor(getHocuspocusDocumentState);
