import { test, expect, afterAll } from "bun:test";
import { createZeroClient, factory, type ZeroClient } from "@lydie/test-utils";
import {
  db,
  documentsTable,
  syncMetadataTable,
  integrationConnectionsTable,
} from "@lydie/database";
import { createId } from "@lydie/core/id";
import { eq } from "drizzle-orm";
import { queries } from "@lydie/zero/queries";

// Track created resources for cleanup
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdDocs: string[] = [];
const createdConnections: string[] = [];
const createdSyncMeta: string[] = [];
const zeroClients: ZeroClient[] = [];

afterAll(async () => {
  // Close all Zero clients
  for (const client of zeroClients) {
    await client.close();
  }

  // Cleanup all test data
  for (const metaId of createdSyncMeta) {
    await db.delete(syncMetadataTable).where(eq(syncMetadataTable.id, metaId));
  }
  for (const connId of createdConnections) {
    await db
      .delete(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, connId));
  }
  for (const docId of createdDocs) {
    await factory.cleanupDocument(docId);
  }
  for (const orgId of createdOrgs) {
    await factory.cleanupOrganization(orgId);
  }
  for (const userId of createdUsers) {
    await factory.cleanupUser(userId);
  }
});

test("syncMetadata.byDocument prevents cross-organization access", async () => {
  // Arrange: Create two orgs with their own documents
  const { user: userA, organization: orgA } = await factory.createUser({
    prefix: "userA",
  });
  createdUsers.push(userA.id);
  createdOrgs.push(orgA.id);

  const orgB = await factory.createOrganization(userA.id, { name: "Org B" });
  createdOrgs.push(orgB.id);

  // Create a connection for Org B
  const connectionId = createId();
  await db.insert(integrationConnectionsTable).values({
    id: connectionId,
    organizationId: orgB.id,
    integrationType: "github",
    status: "active",
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdConnections.push(connectionId);

  // Create document in Org B
  const docB = await factory.createDocument({
    organizationId: orgB.id,
    userId: userA.id,
    title: "Org B Document",
  });
  createdDocs.push(docB.id);

  // Create sync metadata for Org B's document
  const syncMetaId = createId();
  await db.insert(syncMetadataTable).values({
    id: syncMetaId,
    documentId: docB.id,
    connectionId: connectionId,
    externalId: "external-123",
    syncStatus: "synced",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdSyncMeta.push(syncMetaId);

  // Create Zero client for User A with access to both orgs
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

  // Act: User tries to access Org B's sync metadata using Org A's ID
  // This is the security bug - user passes Org A's ID but Org B's document ID
  const query = queries.syncMetadata.byDocument({
    organizationId: orgA.id, // Org A's ID
    documentId: docB.id, // But Org B's document!
  });

  await zero.preload(query).complete;
  const result = await zero.run(query);

  console.log("This is the result", result);

  // Assert: Should return empty (currently fails - returns data)
  // This test will FAIL until the bug is fixed, proving the vulnerability exists
  expect(result).toHaveLength(0);
});

test("syncMetadata.byDocument returns data for correct organization", async () => {
  // Arrange: Create user with organization
  const { user, organization } = await factory.createUser({
    prefix: "userCorrect",
  });
  createdUsers.push(user.id);
  createdOrgs.push(organization.id);

  // Create a connection for the organization
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

  // Create document in the organization
  const doc = await factory.createDocument({
    organizationId: organization.id,
    userId: user.id,
    title: "Test Document",
  });
  createdDocs.push(doc.id);

  // Create sync metadata for the document
  const syncMetaId = createId();
  await db.insert(syncMetadataTable).values({
    id: syncMetaId,
    documentId: doc.id,
    connectionId: connectionId,
    externalId: "external-456",
    syncStatus: "synced",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdSyncMeta.push(syncMetaId);

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

  // Act: User queries with correct organization and document
  const query = queries.syncMetadata.byDocument({
    organizationId: organization.id,
    documentId: doc.id,
  });

  await zero.preload(query).complete;
  const result = await zero.run(query);

  // Assert: Should return the sync metadata
  expect(result).toHaveLength(1);
  console.log(result);
  expect(result[0].id).toBe(syncMetaId);
  expect(result[0].external_id).toBe("external-456");
});

test("syncMetadata.byDocument throws error when user lacks organization access", async () => {
  // Arrange: Create two separate users with their own organizations
  const { user: userA, organization: orgA } = await factory.createUser({
    prefix: "userA",
  });
  createdUsers.push(userA.id);
  createdOrgs.push(orgA.id);

  const { user: userB, organization: orgB } = await factory.createUser({
    prefix: "userB",
  });
  createdUsers.push(userB.id);
  createdOrgs.push(orgB.id);

  // Create document in Org B
  const docB = await factory.createDocument({
    organizationId: orgB.id,
    userId: userB.id,
    title: "Org B Document",
  });
  createdDocs.push(docB.id);

  // Create Zero client for User A (only has access to Org A)
  const zeroA = await createZeroClient({
    userId: userA.id,
    organizations: [
      {
        id: orgA.id,
        name: orgA.name,
        slug: orgA.slug,
      },
    ],
  });
  zeroClients.push(zeroA);

  // Act & Assert: Should throw an error
  await expect(async () => {
    const query = queries.syncMetadata.byDocument({
      organizationId: orgB.id, // User A doesn't have access to Org B
      documentId: docB.id,
    });
    await zeroA.preload(query).complete;
    await zeroA.run(query);
  }).toThrow();
});
