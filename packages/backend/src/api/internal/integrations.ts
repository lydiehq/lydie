import { Hono } from "hono";
import { db } from "@lydie/database";
import {
  integrationConnectionsTable,
  integrationLinksTable,
  documentsTable,
  foldersTable,
} from "@lydie/database";
import { eq, sql, and, isNull } from "drizzle-orm";
import { createId } from "@lydie/core/id";
import {
  GitHubIntegration,
  encodeOAuthState,
  decodeOAuthState,
  type OAuthState,
  type OAuthIntegration,
  type Integration,
} from "@lydie/integrations";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authenticatedWithOrganization } from "./middleware";

// Registry of available integrations
// Integrations must implement both Integration (for push/pull) and OAuthIntegration (for OAuth flow)
type IntegrationWithOAuth = Integration & OAuthIntegration;
const integrationRegistry = new Map<string, IntegrationWithOAuth>([
  ["github", new GitHubIntegration()],
]);

// Helper to check if integration supports resources
function supportsResources(
  integration: IntegrationWithOAuth
): integration is IntegrationWithOAuth & {
  fetchResources: (connection: any) => Promise<any[]>;
} {
  return "fetchResources" in integration;
}

/**
 * OAuth flow:
 * 1. POST /integrations/:type/oauth/authorize - Initiate OAuth, returns auth URL
 * 2. Provider redirects to GET /integrations/:type/oauth/callback
 * 3. Backend exchanges code for token, creates connection
 * 4. Redirects to frontend with success/error
 */
export const IntegrationsRoute = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>()
  .post(
    "/:type/oauth/authorize",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z.object({
        redirectUrl: z.string(),
      })
    ),
    async (c) => {
      try {
        const integrationType = c.req.param("type");
        const { redirectUrl } = c.req.valid("json");
        const user = c.get("user");
        const organizationId = c.get("organizationId");

        console.log(
          `[OAuth] Initiating ${integrationType} OAuth for org ${organizationId}`
        );

        // Get integration from registry
        const integration = integrationRegistry.get(integrationType);
        if (!integration) {
          console.error(`[OAuth] Unknown integration type: ${integrationType}`);
          return c.json({ error: "Unknown integration type" }, 404);
        }

        // Get OAuth credentials
        const credentials = await integration.getOAuthCredentials();
        console.log(
          `[OAuth] Got credentials - clientId present: ${!!credentials.clientId}`
        );

        if (!credentials.clientId || !credentials.clientSecret) {
          console.error(`[OAuth] Missing credentials for ${integrationType}`, {
            hasClientId: !!credentials.clientId,
            hasClientSecret: !!credentials.clientSecret,
          });
          return c.json(
            { error: "OAuth credentials not configured for this integration" },
            500
          );
        }

        // Generate state token
        const state: OAuthState = {
          integrationType,
          organizationId,
          userId: user.id,
          redirectUrl,
          nonce: crypto.randomUUID(),
          createdAt: Date.now(),
        };

        const stateToken = encodeOAuthState(state);

        // Build OAuth callback URL
        const callbackUrl = new URL(c.req.url);
        callbackUrl.pathname = `/internal/integrations/${integrationType}/oauth/callback`;

        console.log(`[OAuth] Callback URL: ${callbackUrl.toString()}`);

        // Build authorization URL
        const authUrl = integration.buildAuthorizationUrl(
          credentials,
          stateToken,
          callbackUrl.toString()
        );

        console.log(`[OAuth] Authorization URL generated successfully`);
        return c.json({ authUrl, state: stateToken });
      } catch (error) {
        console.error("[OAuth] Error initiating OAuth:", error);
        console.error(
          "[OAuth] Error stack:",
          error instanceof Error ? error.stack : "No stack"
        );
        return c.json(
          {
            error: "Failed to initiate OAuth",
            details: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    }
  )

  // OAuth callback handler
  // NOTE: This route is intentionally public (no auth middleware) because
  // providers redirect here after OAuth authorization. Security is handled via:
  // 1. State token validation (CSRF protection)
  // 2. State token expiration (5 minutes)
  // 3. Organization access verification from state
  .get("/:type/oauth/callback", async (c) => {
    const integrationType = c.req.param("type");
    const stateToken = c.req.query("state");
    const error = c.req.query("error");

    // Handle OAuth errors
    if (error) {
      const errorDescription = c.req.query("error_description") || error;
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      return c.redirect(
        `${frontendUrl}/settings/integrations?error=${encodeURIComponent(
          errorDescription
        )}`
      );
    }

    // State token is required
    if (!stateToken) {
      return c.json({ error: "Missing state token" }, 400);
    }

    // Decode and validate state
    let state: OAuthState;
    try {
      state = decodeOAuthState(stateToken);
    } catch (error) {
      return c.json({ error: "Invalid state token" }, 400);
    }

    // Check state expiration (5 minutes)
    if (Date.now() - state.createdAt > 5 * 60 * 1000) {
      return c.json({ error: "State token expired" }, 400);
    }

    // Verify integration type matches
    if (state.integrationType !== integrationType) {
      return c.json({ error: "Integration type mismatch" }, 400);
    }

    // Verify user has access to the organization from state
    const organization = await db.query.organizationsTable.findFirst({
      where: {
        id: state.organizationId,
      },
      with: {
        members: {
          where: {
            userId: state.userId,
          },
        },
      },
    });

    if (!organization || organization.members.length === 0) {
      return c.json(
        { error: "User does not have access to this organization" },
        403
      );
    }

    // Get integration from registry
    const integration = integrationRegistry.get(integrationType);
    if (!integration) {
      return c.json({ error: "Unknown integration type" }, 404);
    }

    try {
      // Get OAuth credentials
      const credentials = await integration.getOAuthCredentials();

      // Build callback URL (must match the one used in authorize)
      const callbackUrl = new URL(c.req.url);
      callbackUrl.search = ""; // Remove all query params

      // Collect all query parameters for the integration to handle
      const queryParams: Record<string, string> = {};
      c.req.url
        .split("?")[1]
        ?.split("&")
        .forEach((param) => {
          const [key, value] = param.split("=");
          if (key && value) {
            queryParams[key] = decodeURIComponent(value);
          }
        });

      // Let integration handle the OAuth callback
      // This allows each integration to handle its own OAuth flow
      // (e.g., GitHub App installations, standard OAuth, etc.)
      if (
        !("handleOAuthCallback" in integration) ||
        typeof integration.handleOAuthCallback !== "function"
      ) {
        throw new Error(
          `Integration ${integrationType} does not implement handleOAuthCallback`
        );
      }

      const config = await integration.handleOAuthCallback(
        queryParams,
        credentials,
        callbackUrl.toString()
      );

      // Create integration connection in database
      const connectionId = createId();
      await db.insert(integrationConnectionsTable).values({
        id: connectionId,
        integrationType,
        organizationId: state.organizationId,
        config,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const redirectPath = state.redirectUrl || "/settings/integrations";
      return c.redirect(
        `${frontendUrl}${redirectPath}?success=true&connectionId=${connectionId}`
      );
    } catch (error) {
      console.error("OAuth callback error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const redirectPath = state.redirectUrl || "/settings/integrations";
      return c.redirect(
        `${frontendUrl}${redirectPath}?error=${encodeURIComponent(
          errorMessage
        )}`
      );
    }
  })

  // Get available resources (repositories, collections, etc.) for a connection
  .get("/:connectionId/resources", authenticatedWithOrganization, async (c) => {
    const connectionId = c.req.param("connectionId");
    const organizationId = c.get("organizationId");

    // Fetch connection from database
    const connection = await db.query.integrationConnectionsTable.findFirst({
      where: { id: connectionId },
    });

    if (!connection || connection.organizationId !== organizationId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    // Get integration from registry
    const integration = integrationRegistry.get(connection.integrationType);
    if (!integration) {
      return c.json({ error: "Unknown integration type" }, 404);
    }

    // Check if integration supports resources
    if (!supportsResources(integration)) {
      return c.json(
        { error: "Integration does not support resource listing" },
        400
      );
    }

    try {
      const resources = await integration.fetchResources({
        id: connection.id,
        integrationType: connection.integrationType,
        organizationId: connection.organizationId,
        config: connection.config as Record<string, any>,
        enabled: connection.enabled,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      });

      return c.json({ resources });
    } catch (error) {
      console.error("Failed to fetch resources:", error);
      return c.json(
        {
          error: "Failed to fetch resources",
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  })

  // Update connection config (e.g., select repo after OAuth)
  .patch(
    "/:connectionId/config",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z.object({
        config: z.record(z.string(), z.any()),
      })
    ),
    async (c) => {
      const connectionId = c.req.param("connectionId");
      const organizationId = c.get("organizationId");
      const { config } = c.req.valid("json");

      // Fetch connection from database
      const connection = await db.query.integrationConnectionsTable.findFirst({
        where: { id: connectionId },
      });

      if (!connection || connection.organizationId !== organizationId) {
        return c.json({ error: "Connection not found" }, 404);
      }

      // Merge new config with existing
      const existingConfig = (connection.config as Record<string, any>) || {};
      const updatedConfig = { ...existingConfig, ...config };

      // Update in database
      await db
        .update(integrationConnectionsTable)
        .set({
          config: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnectionsTable.id, connectionId));

      return c.json({ success: true, config: updatedConfig });
    }
  )

  // Create a new link for a connection
  .post(
    "/:connectionId/links",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        config: z.record(z.string(), z.any()),
      })
    ),
    async (c) => {
      const connectionId = c.req.param("connectionId");
      const organizationId = c.get("organizationId");
      const { name, config } = c.req.valid("json");

      // Verify connection exists and belongs to org
      const connection = await db.query.integrationConnectionsTable.findFirst({
        where: { id: connectionId },
      });

      if (!connection || connection.organizationId !== organizationId) {
        return c.json({ error: "Connection not found" }, 404);
      }

      // Create the link
      const linkId = createId();
      await db.insert(integrationLinksTable).values({
        id: linkId,
        name,
        connectionId,
        organizationId,
        config,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return c.json({ success: true, linkId });
    }
  )

  // Update a link
  .patch(
    "/links/:linkId",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).optional(),
        config: z.record(z.string(), z.any()).optional(),
        enabled: z.boolean().optional(),
      })
    ),
    async (c) => {
      const linkId = c.req.param("linkId");
      const organizationId = c.get("organizationId");
      const updates = c.req.valid("json");

      // Verify link exists and belongs to org
      const link = await db.query.integrationLinksTable.findFirst({
        where: { id: linkId },
      });

      if (!link || link.organizationId !== organizationId) {
        return c.json({ error: "Link not found" }, 404);
      }

      // Update the link
      await db
        .update(integrationLinksTable)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(integrationLinksTable.id, linkId));

      return c.json({ success: true });
    }
  )

  // Get document count for a link
  .get(
    "/links/:linkId/documents/count",
    authenticatedWithOrganization,
    async (c) => {
      const linkId = c.req.param("linkId");
      const organizationId = c.get("organizationId");

      // Verify link exists and belongs to org
      const link = await db.query.integrationLinksTable.findFirst({
        where: { id: linkId },
      });

      if (!link || link.organizationId !== organizationId) {
        return c.json({ error: "Link not found" }, 404);
      }

      // Count documents associated with this link (not deleted)
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.integrationLinkId, linkId),
            isNull(documentsTable.deletedAt)
          )
        );

      return c.json({ count: Number(count[0]?.count || 0) });
    }
  )

  // Delete a link
  .delete("/links/:linkId", authenticatedWithOrganization, async (c) => {
    const linkId = c.req.param("linkId");
    const organizationId = c.get("organizationId");
    const deleteDocuments = c.req.query("deleteDocuments") === "true";

    // Verify link exists and belongs to org
    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: linkId },
    });

    if (!link || link.organizationId !== organizationId) {
      return c.json({ error: "Link not found" }, 404);
    }

    // If deleteDocuments is true, delete all documents associated with this link
    if (deleteDocuments) {
      await db
        .update(documentsTable)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(documentsTable.integrationLinkId, linkId),
            isNull(documentsTable.deletedAt)
          )
        );
    }

    // Delete the link (documents will have their integration_link_id set to null via FK if not deleted)
    await db
      .delete(integrationLinksTable)
      .where(eq(integrationLinksTable.id, linkId));

    return c.json({ success: true });
  })

  // Sync/pull documents from a specific link
  .post("/links/:linkId/sync", authenticatedWithOrganization, async (c) => {
    const linkId = c.req.param("linkId");
    const organizationId = c.get("organizationId");
    const user = c.get("user");

    try {
      console.log(`[Integrations] Starting sync for link ${linkId}`);

      // Fetch link with its connection
      const link = await db.query.integrationLinksTable.findFirst({
        where: { id: linkId },
        with: {
          connection: true,
        },
      });

      if (!link || link.organizationId !== organizationId) {
        console.error(
          `[Integrations] Link not found or access denied: ${linkId}`
        );
        return c.json({ error: "Link not found" }, 404);
      }

      if (!link.enabled) {
        return c.json({ error: "Link is disabled" }, 400);
      }

      const connection = link.connection;
      if (!connection || !connection.enabled) {
        return c.json({ error: "Connection is disabled" }, 400);
      }

      // Get integration from registry
      const integration = integrationRegistry.get(connection.integrationType);
      if (!integration) {
        return c.json({ error: "Unknown integration type" }, 404);
      }

      console.log(
        `[Integrations] Pulling from ${connection.integrationType} link: ${link.name}`
      );

      // Merge connection config with link config for the pull
      // Link config contains path-specific info (e.g., repo path)
      const mergedConfig = {
        ...(connection.config as Record<string, any>),
        ...(link.config as Record<string, any>),
      };

      // Create a connection object for token refresh
      const connectionForRefresh = {
        id: connection.id,
        integrationType: connection.integrationType,
        organizationId: connection.organizationId,
        config: mergedConfig,
        enabled: connection.enabled,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      };

      // Refresh access token if needed (for GitHub Apps with expiring tokens)
      if (
        "getAccessToken" in integration &&
        typeof integration.getAccessToken === "function"
      ) {
        try {
          const oldToken = (mergedConfig as any).installationAccessToken;
          await integration.getAccessToken(connectionForRefresh);
          const newToken = (mergedConfig as any).installationAccessToken;

          // Update database if token was refreshed
          if (oldToken !== newToken) {
            console.log(
              `[Integrations] Token refreshed for connection ${connection.id}`
            );
            await db
              .update(integrationConnectionsTable)
              .set({
                config: connection.config,
                updatedAt: new Date(),
              })
              .where(eq(integrationConnectionsTable.id, connection.id));
          }
        } catch (error) {
          console.error(
            `[Integrations] Failed to refresh token for connection ${connection.id}:`,
            error
          );
          // Continue anyway - the getAccessToken in the integration will handle errors
        }
      }

      // Call integration's pull method
      const results = await integration.pull({
        connection: connectionForRefresh,
        organizationId,
        userId: user.id,
      });

      let imported = 0;
      let failed = 0;

      // Helper function to get or create folder by path
      const getOrCreateFolderByPath = async (
        folderPath: string | null | undefined
      ): Promise<string | undefined> => {
        if (!folderPath || folderPath.trim() === "" || folderPath === "/") {
          return undefined; // Root level
        }

        // Normalize path: remove leading/trailing slashes and split
        const parts = folderPath
          .replace(/^\/+|\/+$/g, "")
          .split("/")
          .filter((part) => part.length > 0);

        if (parts.length === 0) {
          return undefined;
        }

        let currentParentId: string | undefined = undefined;

        // Traverse the path, creating folders as needed
        for (const folderName of parts) {
          // Check if folder already exists with this name, parent, and organization
          const [existingFolder] = await db
            .select()
            .from(foldersTable)
            .where(
              and(
                eq(foldersTable.name, folderName),
                eq(foldersTable.organizationId, organizationId),
                isNull(foldersTable.deletedAt),
                currentParentId
                  ? eq(foldersTable.parentId, currentParentId)
                  : isNull(foldersTable.parentId)
              )
            )
            .limit(1);

          if (existingFolder) {
            // Reuse existing folder
            currentParentId = existingFolder.id;
          } else {
            // Create new folder
            const newFolderId = createId();
            await db.insert(foldersTable).values({
              id: newFolderId,
              name: folderName,
              userId: user.id,
              organizationId,
              parentId: currentParentId || null,
            });
            currentParentId = newFolderId;
          }
        }

        return currentParentId;
      };

      // Create documents from pull results
      for (const result of results) {
        if (result.success && result.metadata) {
          try {
            // Get or create folder if folderPath is provided
            const folderPath = result.metadata.folderPath as
              | string
              | null
              | undefined;
            const folderId = await getOrCreateFolderByPath(folderPath);

            const documentId = createId();

            await db.insert(documentsTable).values({
              id: documentId,
              title: result.metadata.title,
              slug: result.metadata.slug,
              jsonContent: result.metadata.content,
              userId: user.id,
              organizationId,
              folderId: folderId || null, // Use created folder or null for root
              integrationLinkId: link.id,
              externalId: result.externalId,
              indexStatus: "pending",
              published: true, // Documents from integrations are published by default
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            imported++;
            console.log(
              `[Integrations] Imported: ${result.externalId}${
                folderPath ? ` (folder: ${folderPath})` : ""
              }`
            );
          } catch (error) {
            failed++;
            console.error(
              `[Integrations] Failed to create document from ${result.externalId}:`,
              error
            );
          }
        } else {
          failed++;
          console.error(`[Integrations] Pull failed: ${result.error}`);
        }
      }

      // Update last synced timestamp
      await db
        .update(integrationLinksTable)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationLinksTable.id, linkId));

      console.log(
        `[Integrations] Sync complete. Imported: ${imported}, Failed: ${failed}`
      );

      // If sync succeeded, ensure connection status is active
      if (connection.status !== "active") {
        await db
          .update(integrationConnectionsTable)
          .set({
            status: "active",
            statusMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(integrationConnectionsTable.id, connection.id));
      }

      return c.json({ success: true, imported, failed });
    } catch (error) {
      console.error("[Integrations] Error during sync:", error);
      console.error(
        "[Integrations] Error stack:",
        error instanceof Error ? error.stack : "No stack"
      );

      // Update connection status to error if sync failed
      try {
        // Get the link and connection to update status
        const linkRow = await db
          .select()
          .from(integrationLinksTable)
          .where(eq(integrationLinksTable.id, linkId))
          .limit(1);

        if (linkRow[0]) {
          await db
            .update(integrationConnectionsTable)
            .set({
              status: "error",
              statusMessage:
                error instanceof Error ? error.message : "Sync failed",
              updatedAt: new Date(),
            })
            .where(eq(integrationConnectionsTable.id, linkRow[0].connectionId));
        }
      } catch (updateError) {
        console.error(
          "[Integrations] Failed to update connection status:",
          updateError
        );
      }

      return c.json(
        {
          error: "Failed to sync",
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
