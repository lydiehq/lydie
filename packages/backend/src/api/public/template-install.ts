import { Hono } from "hono"
import { authClient } from "@lydie/core/auth"

const app = new Hono()

// Template installation redirect handler
app.get("/", async (c) => {
  try {
    const templateSlug = c.req.query("template")
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"

    if (!templateSlug) {
      return c.json({ error: "Template slug is required" }, 400)
    }

    // Check if user is authenticated by getting session
    const session = await authClient.api.getSession({
      headers: c.req.raw.headers,
    })

    // If not authenticated, redirect to auth with template parameter
    if (!session?.session || !session?.user) {
      const authUrl = new URL("/auth", frontendUrl)
      authUrl.searchParams.set("template", templateSlug)
      return c.redirect(authUrl.toString())
    }

    // Get organizations from session (populated by customSession plugin)
    const organizations = (session.session as any).organizations || []

    if (organizations.length === 0) {
      // No organizations - redirect to create workspace with template parameter
      const newWorkspaceUrl = new URL("/new", frontendUrl)
      newWorkspaceUrl.searchParams.set("template", templateSlug)
      return c.redirect(newWorkspaceUrl.toString())
    }

    // Check if user has an active organization
    const activeOrganization = (session.session as any).activeOrganization

    if (activeOrganization) {
      // User has an active organization - redirect to that organization with install parameter
      const installUrl = new URL(`/w/${activeOrganization.slug}`, frontendUrl)
      installUrl.searchParams.set("installTemplate", templateSlug)
      return c.redirect(installUrl.toString())
    }

    // No active organization - redirect to first organization with install parameter
    const firstOrg = organizations[0]
    const installUrl = new URL(`/w/${firstOrg.slug}`, frontendUrl)
    installUrl.searchParams.set("installTemplate", templateSlug)
    return c.redirect(installUrl.toString())
  } catch (error) {
    console.error("Error in template install handler:", error)
    return c.json({ error: "Failed to process template installation" }, 500)
  }
})

export default app
