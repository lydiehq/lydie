import { test, testUnauthenticated, expect } from "./fixtures/auth.fixture"
import { createExpiredSession, deleteSessionFromDB, setSessionCookie } from "./utils/auth"
import { db, sessionsTable } from "@lydie/database"
import { eq } from "drizzle-orm"

testUnauthenticated("should not allow unauthed workspace access", async ({ page }) => {
	await page.goto("/w/test-org-slug")
	await page.waitForURL(/\/auth/)
})

test.describe("workspace auth", () => {
	test("authed users should not be able to access auth route", async ({ page, organization }) => {
		await page.goto("/auth")
		await page.waitForURL(`/w/${organization.slug}`)
	})

	test("authenticated users should be be redirected to workspace if accessing root", async ({
		page,
		organization,
		user,
	}) => {
		await page.goto("/")
		await page.waitForURL(`/w/${organization.slug}`)
		await expect(page.getByText(`Welcome back, ${user.name.split(" ")[0]}!`)).toBeVisible()
	})

	test("should logout and redirect to /auth when signing out", async ({ page, organization }) => {
		await page.goto(`/w/${organization.slug}`)
		await page.waitForURL(`/w/${organization.slug}`)
		await page.getByRole("button", { name: organization.name }).first().click()

		await page.getByRole("menuitem", { name: "Sign Out" }).click()

		await page.waitForURL(/\/auth/)
	})
})

test.describe("session expiration", () => {
	test("should redirect to /auth when session is expired", async ({ page, user, organization }) => {
		const { sessionId, token, expiresAt } = await createExpiredSession(user.id, 500)

		await setSessionCookie(page, token, expiresAt)

		await page.goto(`/w/${organization.slug}`)
		await page.waitForURL(/\/auth/)

		// Cleanup
		await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId))
	})

	test("should redirect to /auth when session is revoked on server", async ({
		page,
		user,
		organization,
	}) => {
		const { sessionId, token, expiresAt } = await createExpiredSession(
			user.id,
			60 * 60 * 1000, // 1 hour, valid session
		)

		await setSessionCookie(page, token, expiresAt)

		// First, verify the session works
		await page.goto(`/w/${organization.slug}`)
		await page.waitForURL(`/w/${organization.slug}`)

		// Revoke the session on the server
		await deleteSessionFromDB(sessionId)

		// Try to access the page again - should redirect to auth
		await page.goto(`/w/${organization.slug}`)
		await page.waitForURL(/\/auth/)
	})
})
