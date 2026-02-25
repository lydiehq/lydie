import { db, schema } from "@lydie/database";
import { eq } from "drizzle-orm";

// Note: Stripe customer cleanup should be done manually in Stripe Dashboard
// or via separate Stripe API script if needed

async function deleteUser() {
  const stage = process.env.APP_STAGE || "development";
  if (stage === "production") {
    console.error("❌ Error: This script is not available in production");
    process.exit(1);
  }

  // Get the identifier from command line args
  const identifier = process.argv[2];

  if (!identifier) {
    console.error("❌ Error: Missing required argument");
    console.error("Usage: bun run delete-user <email|userId>");
    process.exit(1);
  }

  console.log(`🔌 Connecting to database...`);
  console.log(`📦 Environment: ${stage}`);

  // Try to find the user by email or ID
  const user = await db.query.usersTable.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { id: identifier },
  });

  if (!user) {
    console.error(`❌ User not found: ${identifier}`);
    process.exit(1);
  }

  console.log(`\n👤 Found user:`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role: ${user.role}`);
  console.log(`\n⚠️  This will delete:`);
  console.log(`   - All workspace billing records where user is billing owner`);
  console.log(`   - All assets (database records only, not S3)`);
  console.log(`   - All sessions`);
  console.log(`   - All accounts`);
  console.log(`   - All memberships (organizations)`);
  console.log(`   - All documents`);
  console.log(`   - All conversations and messages`);
  console.log(`   - All related data (cascades automatically)`);
  console.log(`   - Note: Stripe customer data should be cleaned up separately`);

  console.log(`\n⚠️  DESTRUCTIVE OPERATION: Deleting user ${user.email}...`);

  try {
    // Get organizations where this user is a member
    const memberships = await db
      .select({
        organizationId: schema.membersTable.organizationId,
        organization: schema.organizationsTable,
      })
      .from(schema.membersTable)
      .innerJoin(
        schema.organizationsTable,
        eq(schema.membersTable.organizationId, schema.organizationsTable.id),
      )
      .where(eq(schema.membersTable.userId, user.id));

    console.log(`   Found ${memberships.length} organization membership(s)`);

    // Note: Stripe customer data should be cleaned up separately via Stripe Dashboard

    // Delete workspace billing records where user is billing owner (must be done before deleting user)
    await db
      .delete(schema.workspaceBillingTable)
      .where(eq(schema.workspaceBillingTable.billingOwnerUserId, user.id));
    console.log(`✅ Deleted workspace billing records`);

    await db.delete(schema.assetsTable).where(eq(schema.assetsTable.userId, user.id));
    console.log(`✅ Deleted user assets from database`);

    await db.delete(schema.usersTable).where(eq(schema.usersTable.id, user.id));
    console.log(`✅ User deleted successfully!`);
  } catch (error) {
    console.error(`❌ Error during deletion:`, error);
    throw error;
  }
}

deleteUser().catch((error) => {
  console.error("Error deleting user:", error);
  process.exit(1);
});
