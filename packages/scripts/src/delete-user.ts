import { db, usersTable, assetsTable } from "@lydie/database"
import { eq } from "drizzle-orm"
import { Resource } from "sst"

async function deleteUser() {
	// Get the identifier from command line args
	const identifier = process.argv[2]

	if (!identifier) {
		console.error("Usage: bun run delete-user <email|userId>")
		process.exit(1)
	}

	console.log(`Connecting to database...`)
	console.log(`Environment: ${Resource.App.stage}`)

	// Try to find the user by email or ID
	const user = await db.query.usersTable.findFirst({
		where: {
			...(identifier.includes("@") ? { email: identifier } : { id: identifier }),
		},
	})

	if (!user) {
		console.error(`User not found: ${identifier}`)
		process.exit(1)
	}

	console.log(`Found user:`)
	console.log(`  ID: ${user.id}`)
	console.log(`  Name: ${user.name}`)
	console.log(`  Email: ${user.email}`)
	console.log(`  Role: ${user.role}`)
	console.log(`\n⚠️  This will delete:`)
	console.log(`  - All assets (database records only, not S3)`)
	console.log(`  - All sessions`)
	console.log(`  - All accounts`)
	console.log(`  - All memberships (organizations)`)
	console.log(`  - All documents`)
	console.log(`  - All conversations and messages`)
	console.log(`  - All related data (cascades automatically)`)

	// Ask for confirmation (in a real script, you might want to add readline)
	console.log(`\n⚠️  DESTRUCTIVE OPERATION: Deleting user ${user.email}...`)

	await db.delete(assetsTable).where(eq(assetsTable.userId, user.id))
	console.log(`✅ Deleted user assets from database`)

	await db.delete(usersTable).where(eq(usersTable.id, user.id))

	console.log(`✅ User deleted successfully!`)
	process.exit(0)
}

deleteUser().catch((error) => {
	console.error("Error deleting user:", error)
	process.exit(1)
})
