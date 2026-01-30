import { db, schema } from "@lydie/database";
import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";
import { Resource } from "sst";

const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
});

async function findPolarCustomersByEmail(email: string): Promise<string[]> {
  try {
    const response = await polarClient.customers.list({
      email: email,
    });

    return (response.result?.items || [])
      .filter((customer: any) => customer.email === email)
      .map((customer: any) => customer.id);
  } catch (error) {
    console.error("Error finding Polar customers:", error);
    return [];
  }
}

async function deletePolarCustomers(email: string) {
  const customerIds = await findPolarCustomersByEmail(email);

  if (customerIds.length === 0) {
    console.log(`ℹ️  No Polar customers found for email: ${email}`);
    return;
  }

  console.log(`   Found ${customerIds.length} Polar customer(s) for ${email}`);

  for (const customerId of customerIds) {
    try {
      await polarClient.customers.delete({
        id: customerId,
      });
      console.log(`✅ Deleted Polar customer: ${customerId}`);
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`ℹ️  Polar customer already deleted: ${customerId}`);
      } else {
        console.error(`⚠️  Failed to delete Polar customer ${customerId}:`, error.message);
        // Continue with other deletions even if one fails
      }
    }
  }
}

async function deleteUser() {
  if (Resource.App.stage === "production") {
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
  console.log(`📦 Environment: ${Resource.App.stage}`);

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
  console.log(`   - All assets (database records only, not S3)`);
  console.log(`   - All sessions`);
  console.log(`   - All accounts`);
  console.log(`   - All memberships (organizations)`);
  console.log(`   - All documents`);
  console.log(`   - All conversations and messages`);
  console.log(`   - All related data (cascades automatically)`);
  console.log(`   - Polar customer data (if exists)`);

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

    // Delete Polar customers by email (handles organizations)
    await deletePolarCustomers(user.email);

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
