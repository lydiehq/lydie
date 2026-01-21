import { test as baseTest } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"
import { Resource } from "sst"
import { db, organizationsTable, sessionsTable, usersTable } from "@lydie/database"
import { eq } from "drizzle-orm"
import { createId } from "@lydie/core/id"
import { createHMAC } from "@better-auth/utils/hmac"
import { base64 } from "@better-auth/utils/base64"
import { createRandomStringGenerator } from "@better-auth/utils/random"
import type { InferSelectModel } from "drizzle-orm"
import { createTestUser } from "../utils/db"

interface WorkerData {
	user: InferSelectModel<typeof usersTable>
	session: InferSelectModel<typeof sessionsTable> & { token: string }
	organization: InferSelectModel<typeof organizationsTable>
}

interface AuthenticatedFixtures {
	user: InferSelectModel<typeof usersTable>
	session: InferSelectModel<typeof sessionsTable> & { token: string }
	organization: InferSelectModel<typeof organizationsTable>
}

// Authenticated test with user, session, and organization fixtures
export const test = baseTest.extend<
	AuthenticatedFixtures,
	{ workerStorageState: string; workerData: WorkerData }
>({
	workerData: [
		async ({}, use, workerInfo) => {
			const id = workerInfo.workerIndex
			const userId = createId()
			const { user, organization, cleanup } = await createTestUser({
				prefix: "worker",
				userId,
				organizationPrefix: "test-org-worker",
				organizationName: `Test Organization Worker ${userId}`,
			})

			const generateRandomString = createRandomStringGenerator("a-z", "0-9", "A-Z", "-_")
			const sessionToken = generateRandomString(32)

			const hmac = createHMAC("SHA-256", "none")
			const secret = Resource.BetterAuthSecret.value
			const signatureBytes = await hmac.sign(secret, sessionToken)
			const signature = base64.encode(signatureBytes)
			const signedToken = `${sessionToken}.${signature}`

			const sessionId = createId()
			const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

			await db.insert(sessionsTable).values({
				id: sessionId,
				token: sessionToken,
				userId: userId,
				expiresAt: expiresAt,
				ipAddress: "::1",
				userAgent: "Playwright",
				activeOrganizationId: organization.id,
			})

			const [session] = await db
				.select()
				.from(sessionsTable)
				.where(eq(sessionsTable.id, sessionId))
				.limit(1)

			if (!session) {
				throw new Error(`Failed to create session for worker ${id}`)
			}

			const workerData: WorkerData = {
				user,
				session: { ...session, token: signedToken },
				organization,
			}

			await use(workerData)

			try {
				await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId))
				await cleanup()
			} catch (error) {
				console.error(`Failed to cleanup test data for worker ${id}:`, error)
			}
		},
		{ scope: "worker" },
	],

	workerStorageState: [
		async ({ workerData }, use, workerInfo) => {
			const id = workerInfo.workerIndex
			const fileName = path.resolve(workerInfo.project.outputDir, `.auth/worker-${id}.json`)

			const baseURL = workerInfo.project.use?.baseURL || "http://localhost:3000"
			const url = new URL(baseURL)
			const isSecure = url.protocol === "https:"
			const domain = isSecure ? ".lydie.co" : ".localhost"

			const sessionToken = workerData.session.token
			const expiresAt = new Date(workerData.session.expiresAt)

			const cookies = [
				{
					name: "better-auth.session_token",
					value: sessionToken,
					domain: domain,
					path: "/",
					expires: expiresAt.getTime() / 1000,
					httpOnly: true,
				},
			]

			if (isSecure) {
				cookies.push({
					name: "__Secure-better-auth.session_token",
					value: sessionToken,
					domain: domain,
					path: "/",
					expires: expiresAt.getTime() / 1000,
					httpOnly: true,
				})
			}

			const storageState = {
				cookies,
				origins: [],
			}

			const dir = path.dirname(fileName)
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}

			fs.writeFileSync(fileName, JSON.stringify(storageState, null, 2), "utf-8")

			await use(fileName)

			try {
				if (fs.existsSync(fileName)) {
					fs.unlinkSync(fileName)
				}
			} catch (error) {
				console.error(`Failed to cleanup storage state file for worker ${id}:`, error)
			}
		},
		{ scope: "worker" },
	],
	storageState: ({ workerStorageState }, use) => use(workerStorageState),
	user: async ({ workerData }, use) => {
		await use(workerData.user)
	},
	session: async ({ workerData }, use) => {
		await use(workerData.session)
	},
	organization: async ({ workerData }, use) => {
		await use(workerData.organization)
	},
})

// Unauthenticated test for testing auth flows and public pages
export const testUnauthenticated = baseTest

export { expect } from "@playwright/test"
