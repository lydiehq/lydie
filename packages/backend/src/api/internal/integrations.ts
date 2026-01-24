import { Hono } from "hono"
import { db } from "@lydie/database"
import { integrationConnectionsTable, integrationLinksTable, documentsTable } from "@lydie/database"
import { eq, sql, and, isNull } from "drizzle-orm"
import { createId } from "@lydie/core/id"
import { integrationRegistry } from "@lydie/integrations"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { authenticatedWithOrganization } from "./middleware"
import {
  Integration,
  OAuthIntegration,
} from "@lydie/core/integrations/types"
import {
  decodeOAuthState,
  encodeOAuthState,
  OAuthState,
} from "@lydie/core/integrations/oauth"
import { logIntegrationActivity } from "@lydie/core/integrations/activity-log"
import { pullFromIntegrationLink } from "@lydie/core/integrations/pull"

// Helper to check if integration supports OAuth
function supportsOAuth(integration: Integration): integration is Integration & OAuthIntegration {
  return "getOAuthCredentials" in integration
}

export const IntegrationsRoute = new Hono<{
  Variables: {
    user: any
    session: any
    organizationId: string
  }
}>()
  .post(
    "/:type/connect",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z.object({
        organizationId: z.string(),
        config: z.record(z.string(), z.any()),
      }),
    ),
    async (c) => {
      const integrationType = c.req.param("type")
      const { organizationId, config } = c.req.valid("json")
      const orgId = c.get("organizationId")

      if (organizationId !== orgId) {
        return c.json({ error: "Organization mismatch" }, 403)
      }

      const integration = integrationRegistry.get(integrationType)
      if (!integration) {
        return c.json({ error: "Unknown integration type" }, 404)
      }

      try {
        const validation = await integration.validateConnection({
          id: "", // Temporary
          integrationType,
          organizationId,
          config,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        if (!validation.valid) {
          return c.json({ error: validation.error || "Connection validation failed" }, 400)
        }

        const connectionId = createId()
        const user = c.get("user")
        await db.insert(integrationConnectionsTable).values({
          id: connectionId,
          integrationType,
          organizationId,
          config,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        const createdLinkIds: string[] = []
        if (integration.onConnect) {
          const result = integration.onConnect()
          if (result.links && result.links.length > 0) {
            const linkValues = result.links.map((link) => {
              const linkId = createId()
              createdLinkIds.push(linkId)
              return {
                id: linkId,
                name: link.name,
                connectionId,
                organizationId,
                config: link.config,
                integrationType,
                syncStatus: "pulling" as const,
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            })
            await db.insert(integrationLinksTable).values(linkValues)
          }
        }

        await logIntegrationActivity(connectionId, "connect", "success", integrationType)

        if (createdLinkIds.length > 0) {
          Promise.all(
            createdLinkIds.map(async (linkId) => {
              try {
                console.log(`[Integration Connection] Auto-pulling from default link ${linkId}`)
                const result = await pullFromIntegrationLink({
                  linkId,
                  organizationId,
                  userId: user.id,
                  integration,
                })

                if (result.success) {
                  console.log(
                    `[Integration Connection] Auto-pull succeeded for link ${linkId}: imported ${result.imported}, failed ${result.failed}`,
                  )
                  await logIntegrationActivity(connectionId, "pull", "success", integrationType)

                  await db
                    .update(integrationLinksTable)
                    .set({
                      syncStatus: "idle",
                      lastSyncedAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(eq(integrationLinksTable.id, linkId))
                } else {
                  console.error(
                    `[Integration Connection] Auto-pull failed for link ${linkId}: ${result.error}`,
                  )
                  await logIntegrationActivity(connectionId, "pull", "error", integrationType)

                  await db
                    .update(integrationLinksTable)
                    .set({
                      syncStatus: "error",
                      updatedAt: new Date(),
                    })
                    .where(eq(integrationLinksTable.id, linkId))
                }
              } catch (error) {
                console.error(`[Integration Connection] Auto-pull exception for link ${linkId}:`, error)

                await db
                  .update(integrationLinksTable)
                  .set({
                    syncStatus: "error",
                    updatedAt: new Date(),
                  })
                  .where(eq(integrationLinksTable.id, linkId))
              }
            }),
          ).catch((error) => {
            console.error(`[Integration Connection] Error triggering auto-pulls:`, error)
          })
        }

        return c.json({ success: true, connectionId })
      } catch (error) {
        console.error(`Failed to connect ${integrationType}:`, error)
        return c.json(
          {
            error: "Failed to create connection",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        )
      }
    },
  )
  .post(
    "/:type/oauth/authorize",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z
        .object({
          redirectUrl: z.string(),
        })
        .passthrough(), // Allow other properties
    ),
    async (c) => {
      try {
        const integrationType = c.req.param("type")
        const { redirectUrl, ...params } = c.req.valid("json")
        const user = c.get("user")
        const organizationId = c.get("organizationId")

        console.log(`[OAuth] Initiating ${integrationType} OAuth for org ${organizationId}`)

        const integration = integrationRegistry.get(integrationType)
        if (!integration) {
          console.error(`[OAuth] Unknown integration type: ${integrationType}`)
          return c.json({ error: "Unknown integration type" }, 404)
        }

        if (!supportsOAuth(integration)) {
          return c.json({ error: "This integration does not support OAuth" }, 400)
        }

        const credentials = await integration.getOAuthCredentials()
        console.log(`[OAuth] Got credentials - clientId present: ${!!credentials.clientId}`)

        if (!credentials.clientId || !credentials.clientSecret) {
          console.error(`[OAuth] Missing credentials for ${integrationType}`, {
            hasClientId: !!credentials.clientId,
            hasClientSecret: !!credentials.clientSecret,
          })
          return c.json({ error: "OAuth credentials not configured for this integration" }, 500)
        }

        const state: OAuthState = {
          integrationType,
          organizationId,
          userId: user.id,
          redirectUrl,
          nonce: crypto.randomUUID(),
          createdAt: Date.now(),
        }

        const stateToken = encodeOAuthState(state)

        const callbackUrl = new URL(c.req.url)
        callbackUrl.pathname = `/internal/integrations/${integrationType}/oauth/callback`

        console.log(`[OAuth] Callback URL: ${callbackUrl.toString()}`)

        const authUrl = integration.buildAuthorizationUrl(
          credentials,
          stateToken,
          callbackUrl.toString(),
          params as Record<string, string>,
        )

        console.log(`[OAuth] Authorization URL generated successfully`)
        return c.json({ authUrl, state: stateToken })
      } catch (error) {
        console.error("[OAuth] Error initiating OAuth:", error)
        console.error("[OAuth] Error stack:", error instanceof Error ? error.stack : "No stack")
        return c.json(
          {
            error: "Failed to initiate OAuth",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        )
      }
    },
  )
  .get("/:type/oauth/callback", async (c) => {
    const integrationType = c.req.param("type")
    const stateToken = c.req.query("state")
    const error = c.req.query("error")

    if (error) {
      const errorDescription = c.req.query("error_description") || error
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"
      return c.redirect(`${frontendUrl}/settings/integrations?error=${encodeURIComponent(errorDescription)}`)
    }

    if (!stateToken) {
      return c.json({ error: "Missing state token" }, 400)
    }

    let state: OAuthState
    try {
      state = decodeOAuthState(stateToken)
    } catch (error) {
      return c.json({ error: "Invalid state token" }, 400)
    }

    if (Date.now() - state.createdAt > 5 * 60 * 1000) {
      return c.json({ error: "State token expired" }, 400)
    }

    if (state.integrationType !== integrationType) {
      return c.json({ error: "Integration type mismatch" }, 400)
    }

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
    })

    if (!organization || organization.members.length === 0) {
      return c.json({ error: "User does not have access to this organization" }, 403)
    }

    const integration = integrationRegistry.get(integrationType)
    if (!integration) {
      return c.json({ error: "Unknown integration type" }, 404)
    }

    if (!supportsOAuth(integration)) {
      return c.json({ error: "This integration does not support OAuth" }, 400)
    }

    try {
      const credentials = await integration.getOAuthCredentials()

      const callbackUrl = new URL(c.req.url)
      callbackUrl.search = ""

      const queryParams: Record<string, string> = {}
      c.req.url
        .split("?")[1]
        ?.split("&")
        .forEach((param) => {
          const [key, value] = param.split("=")
          if (key && value) {
            queryParams[key] = decodeURIComponent(value)
          }
        })

      const config = await integration.handleOAuthCallback(queryParams, credentials, callbackUrl.toString())

      const connectionId = createId()
      await db.insert(integrationConnectionsTable).values({
        id: connectionId,
        integrationType,
        organizationId: state.organizationId,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const createdLinkIds: string[] = []
      if (integration.onConnect) {
        const result = integration.onConnect()
        if (result.links && result.links.length > 0) {
          const linkValues = result.links.map((link) => {
            const linkId = createId()
            createdLinkIds.push(linkId)
            return {
              id: linkId,
              name: link.name,
              connectionId,
              organizationId: state.organizationId,
              config: link.config,
              integrationType,
              syncStatus: "pulling" as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          })
          await db.insert(integrationLinksTable).values(linkValues)
        }
      }

      // Automatically pull from default links (same behavior as manually created links)
      if (createdLinkIds.length > 0) {
        // Trigger pulls asynchronously (don't block the redirect)
        Promise.all(
          createdLinkIds.map(async (linkId) => {
            try {
              console.log(`[Integration OAuth] Auto-pulling from default link ${linkId}`)
              const result = await pullFromIntegrationLink({
                linkId,
                organizationId: state.organizationId,
                userId: state.userId,
                integration,
              })

              if (result.success) {
                console.log(
                  `[Integration OAuth] Auto-pull succeeded for link ${linkId}: imported ${result.imported}, failed ${result.failed}`,
                )
                await logIntegrationActivity(connectionId, "pull", "success", integrationType)

                await db
                  .update(integrationLinksTable)
                  .set({
                    syncStatus: "idle",
                    lastSyncedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(integrationLinksTable.id, linkId))
              } else {
                console.error(`[Integration OAuth] Auto-pull failed for link ${linkId}: ${result.error}`)
                await logIntegrationActivity(connectionId, "pull", "error", integrationType)

                await db
                  .update(integrationLinksTable)
                  .set({
                    syncStatus: "error",
                    updatedAt: new Date(),
                  })
                  .where(eq(integrationLinksTable.id, linkId))
              }
            } catch (error) {
              console.error(`[Integration OAuth] Auto-pull exception for link ${linkId}:`, error)

              await db
                .update(integrationLinksTable)
                .set({
                  syncStatus: "error",
                  updatedAt: new Date(),
                })
                .where(eq(integrationLinksTable.id, linkId))
            }
          }),
        ).catch((error) => {
          console.error(`[Integration OAuth] Error triggering auto-pulls:`, error)
        })
      }

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"
      const redirectPath = state.redirectUrl || "/settings/integrations"
      return c.redirect(`${frontendUrl}${redirectPath}?success=true&connectionId=${connectionId}`)
    } catch (error) {
      console.error("OAuth callback error:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"
      const redirectPath = state.redirectUrl || "/settings/integrations"
      return c.redirect(`${frontendUrl}${redirectPath}?error=${encodeURIComponent(errorMessage)}`)
    }
  })
  .get("/:connectionId/resources", authenticatedWithOrganization, async (c) => {
    const connectionId = c.req.param("connectionId")
    const organizationId = c.get("organizationId")

    const connection = await db.query.integrationConnectionsTable.findFirst({
      where: { id: connectionId },
    })

    if (!connection || connection.organizationId !== organizationId) {
      return c.json({ error: "Connection not found" }, 404)
    }

    const integration = integrationRegistry.get(connection.integrationType)
    if (!integration) {
      return c.json({ error: "Unknown integration type" }, 404)
    }

    try {
      const resources = await integration.fetchResources({
        id: connection.id,
        integrationType: connection.integrationType,
        organizationId: connection.organizationId,
        config: connection.config as Record<string, any>,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      })

      return c.json({ resources })
    } catch (error) {
      console.error("Failed to fetch resources:", error)
      return c.json(
        {
          error: "Failed to fetch resources",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      )
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
      }),
    ),
    async (c) => {
      const connectionId = c.req.param("connectionId")
      const organizationId = c.get("organizationId")
      const { config } = c.req.valid("json")

      const connection = await db.query.integrationConnectionsTable.findFirst({
        where: { id: connectionId },
      })

      if (!connection || connection.organizationId !== organizationId) {
        return c.json({ error: "Connection not found" }, 404)
      }

      const existingConfig = (connection.config as Record<string, any>) || {}
      const updatedConfig = { ...existingConfig, ...config }

      await db
        .update(integrationConnectionsTable)
        .set({
          config: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnectionsTable.id, connectionId))

      return c.json({ success: true, config: updatedConfig })
    },
  )
  .patch(
    "/links/:linkId",
    authenticatedWithOrganization,
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).optional(),
        config: z.record(z.string(), z.any()).optional(),
      }),
    ),
    async (c) => {
      const linkId = c.req.param("linkId")
      const organizationId = c.get("organizationId")
      const updates = c.req.valid("json")

      const link = await db.query.integrationLinksTable.findFirst({
        where: { id: linkId },
      })

      if (!link || link.organizationId !== organizationId) {
        return c.json({ error: "Link not found" }, 404)
      }

      // Update the link
      await db
        .update(integrationLinksTable)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(integrationLinksTable.id, linkId))

      return c.json({ success: true })
    },
  )
  .get("/links/:linkId/documents/count", authenticatedWithOrganization, async (c) => {
    const linkId = c.req.param("linkId")
    const organizationId = c.get("organizationId")

    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: linkId },
    })

    if (!link || link.organizationId !== organizationId) {
      return c.json({ error: "Link not found" }, 404)
    }

    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentsTable)
      .where(and(eq(documentsTable.integrationLinkId, linkId), isNull(documentsTable.deletedAt)))

    return c.json({ count: Number(count[0]?.count || 0) })
  })

  // Delete a link
  .delete("/links/:linkId", authenticatedWithOrganization, async (c) => {
    const linkId = c.req.param("linkId")
    const organizationId = c.get("organizationId")
    const deleteDocuments = c.req.query("deleteDocuments") === "true"

    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: linkId },
    })

    if (!link || link.organizationId !== organizationId) {
      return c.json({ error: "Link not found" }, 404)
    }

    if (deleteDocuments) {
      await db
        .update(documentsTable)
        .set({ deletedAt: new Date() })
        .where(and(eq(documentsTable.integrationLinkId, linkId), isNull(documentsTable.deletedAt)))
    }

    await db.delete(integrationLinksTable).where(eq(integrationLinksTable.id, linkId))

    return c.json({ success: true })
  })
  .post("/links/:linkId/pull", authenticatedWithOrganization, async (c) => {
    const linkId = c.req.param("linkId")
    const organizationId = c.get("organizationId")
    const user = c.get("user")

    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: linkId },
      with: {
        connection: true,
      },
    })

    if (!link || link.organizationId !== organizationId) {
      return c.json({ error: "Link not found" }, 404)
    }

    if (!link.connection) {
      return c.json({ error: "Connection not found" }, 404)
    }

    const integration = integrationRegistry.get(link.connection.integrationType)
    if (!integration) {
      return c.json({ error: "Unknown integration type" }, 404)
    }

    const result = await pullFromIntegrationLink({
      linkId,
      organizationId,
      userId: user.id,
      integration,
    })

    if (!result.success) {
      return c.json(
        {
          error: "Failed to pull",
          details: result.error,
        },
        500,
      )
    }

    return c.json({
      success: true,
      imported: result.imported,
      failed: result.failed,
    })
  })
