import { Hono } from "hono";
import { db } from "@lydie/database";
import { extensionConnectionsTable, documentsTable } from "@lydie/database";
import { eq } from "drizzle-orm";
import { createId } from "@lydie/core/id";
import {
  GitHubExtension,
  encodeOAuthState,
  decodeOAuthState,
  type OAuthState,
  type OAuthExtension,
} from "@lydie/extensions";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authenticatedWithOrganization } from "./middleware";

// Registry of available extensions
const extensionRegistry = new Map<string, OAuthExtension>([
  ["github", new GitHubExtension()],
]);

/**
 * OAuth flow:
 * 1. POST /extensions/:type/oauth/authorize - Initiate OAuth, returns auth URL
 * 2. Provider redirects to GET /extensions/:type/oauth/callback
 * 3. Backend exchanges code for token, creates connection
 * 4. Redirects to frontend with success/error
 */
export const ExtensionsRoute = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>()
  // Initiate OAuth flow
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
        const extensionType = c.req.param("type");
        const { redirectUrl } = c.req.valid("json");
        const user = c.get("user");
        const organizationId = c.get("organizationId");

        console.log(
          `[OAuth] Initiating ${extensionType} OAuth for org ${organizationId}`
        );

        // Get extension from registry
        const extension = extensionRegistry.get(extensionType);
        if (!extension) {
          console.error(`[OAuth] Unknown extension type: ${extensionType}`);
          return c.json({ error: "Unknown extension type" }, 404);
        }

        // Get OAuth credentials
        const credentials = await extension.getOAuthCredentials();
        console.log(
          `[OAuth] Got credentials - clientId present: ${!!credentials.clientId}`
        );

        if (!credentials.clientId || !credentials.clientSecret) {
          console.error(`[OAuth] Missing credentials for ${extensionType}`, {
            hasClientId: !!credentials.clientId,
            hasClientSecret: !!credentials.clientSecret,
          });
          return c.json(
            { error: "OAuth credentials not configured for this extension" },
            500
          );
        }

        // Generate state token
        const state: OAuthState = {
          extensionType,
          organizationId,
          userId: user.id,
          redirectUrl,
          nonce: crypto.randomUUID(),
          createdAt: Date.now(),
        };

        const stateToken = encodeOAuthState(state);

        // Build OAuth callback URL
        const callbackUrl = new URL(c.req.url);
        callbackUrl.pathname = `/internal/extensions/${extensionType}/oauth/callback`;

        console.log(`[OAuth] Callback URL: ${callbackUrl.toString()}`);

        // Build authorization URL
        const authUrl = extension.buildAuthorizationUrl(
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
  // GitHub redirects here after OAuth authorization. Security is handled via:
  // 1. State token validation (CSRF protection)
  // 2. State token expiration (5 minutes)
  // 3. Organization access verification from state
  .get("/:type/oauth/callback", async (c) => {
    const extensionType = c.req.param("type");
    const code = c.req.query("code");
    const stateToken = c.req.query("state");
    const error = c.req.query("error");

    // Handle OAuth errors
    if (error) {
      const errorDescription = c.req.query("error_description") || error;
      // Redirect to frontend with error
      return c.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/settings/extensions?error=${encodeURIComponent(errorDescription)}`
      );
    }

    if (!code || !stateToken) {
      return c.json({ error: "Missing code or state parameter" }, 400);
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

    // Verify extension type matches
    if (state.extensionType !== extensionType) {
      return c.json({ error: "Extension type mismatch" }, 400);
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

    // Get extension from registry
    const extension = extensionRegistry.get(extensionType);
    if (!extension) {
      return c.json({ error: "Unknown extension type" }, 404);
    }

    try {
      // Get OAuth credentials
      const credentials = await extension.getOAuthCredentials();

      // Build callback URL (must match the one used in authorize)
      const callbackUrl = new URL(c.req.url);
      callbackUrl.search = ""; // Remove query params
      callbackUrl.searchParams.delete("code");
      callbackUrl.searchParams.delete("state");

      // Exchange code for token
      const tokenResponse = await extension.exchangeCodeForToken(
        code,
        credentials,
        callbackUrl.toString()
      );

      // Transform OAuth response to extension config
      const config = await extension.transformOAuthResponse(tokenResponse);

      // Create extension connection in database
      const connectionId = createId();
      await db.insert(extensionConnectionsTable).values({
        id: connectionId,
        extensionType,
        organizationId: state.organizationId,
        config,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Redirect to frontend with success
      const redirectUrl = state.redirectUrl || "/settings/extensions";
      return c.redirect(
        `${redirectUrl}?success=true&connectionId=${connectionId}`
      );
    } catch (error) {
      console.error("OAuth callback error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const redirectUrl = state.redirectUrl || "/settings/extensions";
      return c.redirect(
        `${redirectUrl}?error=${encodeURIComponent(errorMessage)}`
      );
    }
  })

  // Get available repositories (for GitHub after initial OAuth)
  .get(
    "/:connectionId/repositories",
    authenticatedWithOrganization,
    async (c) => {
      const connectionId = c.req.param("connectionId");
      const organizationId = c.get("organizationId");

      // Fetch connection from database
      const connection = await db.query.extensionConnectionsTable.findFirst({
        where: { id: connectionId },
      });

      if (!connection || connection.organizationId !== organizationId) {
        return c.json({ error: "Connection not found" }, 404);
      }

      // Only GitHub supports fetching repositories
      if (connection.extensionType !== "github") {
        return c.json(
          { error: "Extension does not support repositories" },
          400
        );
      }

      const extension = new GitHubExtension();
      const config = connection.config as any;

      try {
        const repositories = await extension.fetchRepositories(
          config.accessToken
        );
        return c.json({ repositories });
      } catch (error) {
        console.error("Failed to fetch repositories:", error);
        return c.json({ error: "Failed to fetch repositories" }, 500);
      }
    }
  )

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
      const connection = await db.query.extensionConnectionsTable.findFirst({
        where: { id: connectionId },
      });

      if (!connection || connection.organizationId !== organizationId) {
        return c.json({ error: "Connection not found" }, 404);
      }

      // Merge new config with existing
      const updatedConfig = { ...connection.config, ...config };

      // Update in database
      await db
        .update(extensionConnectionsTable)
        .set({
          config: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(extensionConnectionsTable.id, connectionId));

      return c.json({ success: true, config: updatedConfig });
    }
  )

  // Sync/pull documents from external source
  .post("/:connectionId/sync", authenticatedWithOrganization, async (c) => {
    try {
      const connectionId = c.req.param("connectionId");
      const organizationId = c.get("organizationId");
      const user = c.get("user");

      console.log(`[Extensions] Starting sync for connection ${connectionId}`);

      // Fetch connection from database
      const connection = await db.query.extensionConnectionsTable.findFirst({
        where: { id: connectionId },
      });

      if (!connection || connection.organizationId !== organizationId) {
        console.error(
          `[Extensions] Connection not found or access denied: ${connectionId}`
        );
        return c.json({ error: "Connection not found" }, 404);
      }

      if (!connection.enabled) {
        return c.json({ error: "Connection is disabled" }, 400);
      }

      // Get extension from registry
      const extension = extensionRegistry.get(connection.extensionType);
      if (!extension) {
        return c.json({ error: "Unknown extension type" }, 404);
      }

      console.log(`[Extensions] Pulling from ${connection.extensionType}`);

      // Call extension's pull method
      const results = await extension.pull({
        connection: {
          id: connection.id,
          extensionType: connection.extensionType,
          organizationId: connection.organizationId,
          config: connection.config as Record<string, any>,
          enabled: connection.enabled,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
        organizationId,
        userId: user.id,
      });

      let imported = 0;
      let failed = 0;

      // Create documents from pull results
      for (const result of results) {
        if (result.success && result.metadata) {
          try {
            const documentId = createId();

            await db.insert(documentsTable).values({
              id: documentId,
              title: result.metadata.title,
              slug: result.metadata.slug,
              jsonContent: result.metadata.content,
              userId: user.id,
              organizationId,
              folderId: null,
              indexStatus: "pending",
              published: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            imported++;
            console.log(`[Extensions] Imported: ${result.externalId}`);
          } catch (error) {
            failed++;
            console.error(
              `[Extensions] Failed to create document from ${result.externalId}:`,
              error
            );
          }
        } else {
          failed++;
          console.error(`[Extensions] Pull failed: ${result.error}`);
        }
      }

      console.log(
        `[Extensions] Sync complete. Imported: ${imported}, Failed: ${failed}`
      );
      return c.json({ success: true, imported, failed });
    } catch (error) {
      console.error("[Extensions] Error during sync:", error);
      console.error(
        "[Extensions] Error stack:",
        error instanceof Error ? error.stack : "No stack"
      );
      return c.json(
        {
          error: "Failed to sync",
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
