import { test, expect, afterAll } from "bun:test";
import { createZeroClient, factory, type ZeroClient } from "@lydie/test-utils";
import {
  db,
  integrationConnectionsTable,
  integrationActivityLogsTable,
} from "@lydie/database";
import { createId } from "@lydie/core/id";
import { eq } from "drizzle-orm";
import { queries } from "@lydie/zero/queries";

// Track created resources for cleanup
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdConnections: string[] = [];
const createdActivityLogs: string[] = [];
const zeroClients: ZeroClient[] = [];

afterAll(async () => {
  // Close all Zero clients
  for (const client of zeroClients) {
    await client.close();
  }

  // Cleanup all test data
  for (const logId of createdActivityLogs) {
    await db
      .delete(integrationActivityLogsTable)
      .where(eq(integrationActivityLogsTable.id, logId));
  }
  for (const connId of createdConnections) {
    await db
      .delete(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, connId));
  }
  for (const orgId of createdOrgs) {
    await factory.cleanupOrganization(orgId);
  }
  for (const userId of createdUsers) {
    await factory.cleanupUser(userId);
  }
});

test("integrationActivityLogs.byIntegrationType prevents cross-organization access", async () => {
  // Arrange: Create two orgs with their own integration connections
  const { user: userA, organization: orgA } = await factory.createUser({
    prefix: "userA",
  });
  createdUsers.push(userA.id);
  createdOrgs.push(orgA.id);

  const orgB = await factory.createOrganization(userA.id, { name: "Org B" });
  createdOrgs.push(orgB.id);

  // Create connection for Org B
  const connectionBId = createId();
  await db.insert(integrationConnectionsTable).values({
    id: connectionBId,
    organizationId: orgB.id,
    integrationType: "github",
    status: "active",
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdConnections.push(connectionBId);

  // Create activity log for Org B
  const activityLogId = createId();
  await db.insert(integrationActivityLogsTable).values({
    id: activityLogId,
    connectionId: connectionBId,
    integrationType: "github",
    activityType: "push",
    activityStatus: "success",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdActivityLogs.push(activityLogId);

  // Create Zero client with access to both orgs
  const zero = await createZeroClient({
    userId: userA.id,
    organizations: [
      {
        id: orgA.id,
        name: orgA.name,
        slug: orgA.slug,
      },
      {
        id: orgB.id,
        name: orgB.name,
        slug: orgB.slug,
      },
    ],
  });
  zeroClients.push(zero);

  // Act: User tries to access Org B's activity logs using Org A's ID
  const query = queries.integrationActivityLogs.byIntegrationType({
    organizationId: orgA.id, // Org A's ID
    integrationType: "github", // But this will return Org B's logs!
  });

  await zero.preload(query).complete;
  const result = await zero.run(query);

  // Assert: Should return empty (currently fails - returns Org B's data)
  // This test will FAIL until the bug is fixed
  expect(result).toHaveLength(0);
});

test("integrationActivityLogs.byIntegrationType returns data for correct organization", async () => {
  // Arrange: Create user with organization
  const { user, organization } = await factory.createUser({
    prefix: "userCorrect",
  });
  createdUsers.push(user.id);
  createdOrgs.push(organization.id);

  // Create connection for the organization
  const connectionId = createId();
  await db.insert(integrationConnectionsTable).values({
    id: connectionId,
    organizationId: organization.id,
    integrationType: "github",
    status: "active",
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdConnections.push(connectionId);

  // Create activity log for the organization
  const activityLogId = createId();
  await db.insert(integrationActivityLogsTable).values({
    id: activityLogId,
    connectionId: connectionId,
    integrationType: "github",
    activityType: "pull",
    activityStatus: "success",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdActivityLogs.push(activityLogId);

  // Create Zero client
  const zero = await createZeroClient({
    userId: user.id,
    organizations: [
      {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    ],
  });
  zeroClients.push(zero);

  // Act: User queries with correct organization
  const query = queries.integrationActivityLogs.byIntegrationType({
    organizationId: organization.id,
    integrationType: "github",
  });

  await zero.preload(query).complete;
  const result = await zero.run(query);

  // Assert: Should return the activity log
  expect(result.length).toBeGreaterThanOrEqual(1);
  const foundLog = result.find((log: any) => log.id === activityLogId);
  expect(foundLog).toBeDefined();
  expect(foundLog.activity_type).toBe("pull");
});
