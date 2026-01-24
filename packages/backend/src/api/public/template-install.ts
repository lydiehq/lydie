import { Hono } from "hono"
import { authClient } from "@lydie/core/auth"

const app = new Hono()

app.get("/", async (c) => {
  try {
    const templateSlug = c.req.query("template")
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"

    if (!templateSlug) {
      return c.json({ error: "Template slug is required" }, 400)
    }

    const session = await authClient.api.getSession({
      headers: c.req.raw.headers,
    })

    if (!session?.session || !session?.user) {
      const authUrl = new URL("/auth", frontendUrl)
      authUrl.searchParams.set("template", templateSlug)
      return c.redirect(authUrl.toString())
    }

    const organizations = (session.session as any).organizations || []

    if (organizations.length === 0) {
      const newWorkspaceUrl = new URL("/new", frontendUrl)
      newWorkspaceUrl.searchParams.set("template", templateSlug)
      return c.redirect(newWorkspaceUrl.toString())
    }

    const activeOrganizationSlug = (session.session as any).activeOrganizationSlug

    if (activeOrganizationSlug) {
      const installUrl = new URL(`/w/${activeOrganizationSlug}`, frontendUrl)
      installUrl.searchParams.set("installTemplate", templateSlug)
      return c.redirect(installUrl.toString())
    }

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
