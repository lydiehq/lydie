import { db, organizationsTable, usersTable } from "@lydie/database"
import { eq } from "drizzle-orm"
import { createId } from "@lydie/core/id"
import { createOrganization } from "@lydie/core/organization"
import type { InferSelectModel } from "drizzle-orm"

type User = InferSelectModel<typeof usersTable>
type Organization = InferSelectModel<typeof organizationsTable>

export async function createTestUser(options?: {
	prefix?: string
	userId?: string
	organizationPrefix?: string
	organizationName?: string
}): Promise<{
	user: User
	organization: Organization
	cleanup: () => Promise<void>
}> {
	const userId = options?.userId ?? createId()
	const prefix = options?.prefix ?? "test"
	const userEmail = `${prefix}-${userId}@playwright.test`
	const userName = `Test ${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${userId}`

	await db.insert(usersTable).values({
		id: userId,
		email: userEmail,
		name: userName,
		emailVerified: true,
	})

	const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1)

	if (!user) {
		throw new Error(`Failed to create test user ${userId}`)
	}

	const organization = await createTestOrganization(userId, {
		prefix: options?.organizationPrefix ?? `test-org-${prefix}`,
		name: options?.organizationName ?? `Test Organization ${userId}`,
	})

	const cleanup = async () => {
		try {
			await db.delete(organizationsTable).where(eq(organizationsTable.id, organization.id))
			await db.delete(usersTable).where(eq(usersTable.id, user.id))
		} catch (error) {
			console.error(`Failed to cleanup test user ${userId}:`, error)
		}
	}

	return { user, organization, cleanup }
}

export async function createTestOrganization(
	userId: string,
	options?: {
		prefix?: string
		name?: string
		slug?: string
	},
): Promise<Organization> {
	const prefix = options?.prefix ?? "test-org"
	const orgSlug = options?.slug ?? `${prefix}-${userId}`
	const orgName = options?.name ?? `Test Organization ${userId}`

	const { organizationId } = await createOrganization({
		name: orgName,
		slug: orgSlug,
		userId: userId,
	})

	const [organization] = await db
		.select()
		.from(organizationsTable)
		.where(eq(organizationsTable.id, organizationId))
		.limit(1)

	if (!organization) {
		throw new Error(`Failed to create organization ${organizationId}`)
	}

	return organization
}
