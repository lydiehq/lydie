import { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { db, apiKeysTable } from "@lydie/database"
import { createHash } from "crypto"
import { eq } from "drizzle-orm"
import { rateLimiter } from "hono-rate-limiter"

interface ApiAuthEnv {
  Variables: {
    organizationId: string
    apiKeyId: string
  }
}

// Rate limiting middleware for external API
// Limits requests per API key: 1000 requests per 15 minutes
// Should be applied after apiKeyAuth middleware
export const externalRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,
  keyGenerator: (c) => {
    const apiKeyId = c.get("apiKeyId")
    if (apiKeyId) {
      return `apikey:${apiKeyId}`
    }
    return c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown"
  },
  message: {
    error: "Rate limit exceeded",
    message: "Too many requests. Please try again later.",
  },
})

export const apiKeyAuth: MiddlewareHandler<ApiAuthEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader) {
    throw new HTTPException(401, {
      message: "No API key provided",
    })
  }

  const key = authHeader.split(" ")[1]

  if (!key) {
    throw new HTTPException(401, {
      message: "Invalid API key",
    })
  }

  const hashedKey = createHash("sha256").update(key).digest("hex")

  const apiKey = await db.query.apiKeysTable.findFirst({
    where: {
      AND: [{ hashedKey }, { revoked: false }],
    },
  })

  if (!apiKey) {
    throw new HTTPException(401, {
      message: "Invalid or revoked API key",
    })
  }

  const idOrSlug = c.req.param("idOrSlug")

  const organization = await db.query.organizationsTable.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  })

  if (!organization) {
    throw new HTTPException(404, {
      message: "Organization not found",
    })
  }

  // Validate that the API key belongs to the organization specified in the URL
  if (apiKey.organizationId !== organization.id) {
    throw new HTTPException(403, {
      message: "API key does not have access to this organization",
    })
  }

  await db.update(apiKeysTable).set({ lastUsedAt: new Date() }).where(eq(apiKeysTable.id, apiKey.id))

  c.set("organizationId", apiKey.organizationId)
  c.set("apiKeyId", apiKey.id)
  await next()
}
