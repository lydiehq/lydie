import { Hono } from "hono"
import { authClient } from "@lydie/core/auth"
import { db, membersTable } from "@lydie/database"
import { eq } from "drizzle-orm"

const app = new Hono()

// Template installation redirect handler
app.get("/", async (c) => {
  try {
    const templateSlug = c.req.query("template")
    const redirect = c.req.query("redirect") || "/w"

    if (!templateSlug) {
      return c.json({ error: "Template slug is required" }, 400)
    }

    // Check if user is authenticated by getting session
    const session = await authClient.api.getSession({
      headers: c.req.raw.headers,
    })

    // If not authenticated, redirect to auth with template parameter
    if (!session?.session || !session?.user) {
      const authUrl = new URL("/auth", c.req.url)
      authUrl.searchParams.set("template", templateSlug)
      authUrl.searchParams.set("redirect", redirect)
      return c.redirect(authUrl.toString())
    }

    // User is authenticated - fetch their organizations
    const userId = session.user.id
    const memberships = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.userId, userId))

    if (memberships.length === 0) {
      // No organizations - redirect to create workspace with template parameter
      const newWorkspaceUrl = new URL("/new", c.req.url)
      newWorkspaceUrl.searchParams.set("template", templateSlug)
      return c.redirect(newWorkspaceUrl.toString())
    }

    if (memberships.length === 1) {
      // Single organization - redirect directly to install page
      const installUrl = new URL("/install-template", c.req.url)
      installUrl.searchParams.set("template", templateSlug)
      return c.redirect(installUrl.toString())
    }

    // Multiple organizations - redirect to organization selection page
    const installUrl = new URL("/install-template", c.req.url)
    installUrl.searchParams.set("template", templateSlug)
    return c.redirect(installUrl.toString())
  } catch (error) {
    console.error("Error in template install handler:", error)
    return c.json({ error: "Failed to process template installation" }, 500)
  }
})

export default app
