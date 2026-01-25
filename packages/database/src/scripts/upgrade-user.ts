import { eq } from "drizzle-orm";
import { Resource } from "sst";

import { db, organizationsTable } from "../index";

async function upgradeUser() {
  // Get the identifier from command line args
  const identifier = process.argv[2];

  if (!identifier) {
    console.error("❌ Error: Missing required argument");
    console.error("Usage: bun run upgrade-user <email|userId>");
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

  // Find all organizations the user is a member of
  const memberships = await db.query.membersTable.findMany({
    where: {
      userId: user.id,
    },
    with: {
      organization: true,
    },
  });

  if (memberships.length === 0) {
    console.error(`❌ User is not a member of any organizations.`);
    process.exit(1);
  }

  console.log(`\n🏢 Found ${memberships.length} organization(s):`);
  for (const membership of memberships) {
    const org = membership.organization;
    console.log(`   - ${org.name} (${org.slug})`);
    console.log(`     Current plan: ${org.subscriptionPlan || "free"}`);
    console.log(`     Current status: ${org.subscriptionStatus || "free"}`);
  }

  console.log(`\n⚠️  This will upgrade all organizations to premium:`);
  console.log(`   - subscriptionPlan: 'pro'`);
  console.log(`   - subscriptionStatus: 'active'`);

  // Upgrade all organizations
  try {
    for (const membership of memberships) {
      const org = membership.organization;
      if (!org) continue;
      await db
        .update(organizationsTable)
        .set({
          subscriptionPlan: "pro",
          subscriptionStatus: "active",
        })
        .where(eq(organizationsTable.id, org.id));

      console.log(`✅ Upgraded ${org.name} to premium`);
    }

    console.log(`\n✅ All organizations upgraded successfully!`);
  } catch (error) {
    console.error(`❌ Error during upgrade:`, error);
    throw error;
  }
}

upgradeUser().catch((error) => {
  console.error("Error upgrading user:", error);
  process.exit(1);
});
