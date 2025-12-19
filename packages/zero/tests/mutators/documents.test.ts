import { test, expect, afterAll } from "bun:test";
import { createZeroClient, factory, type ZeroClient } from "@lydie/test-utils";
import { db, documentsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

// Track created resources for cleanup
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdDocs: string[] = [];
const zeroClients: ZeroClient[] = [];

afterAll(async () => {
  // Close all Zero clients
  for (const client of zeroClients) {
    await client.close();
  }

  // Cleanup all test data
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

test("document.rename prevents unauthorized document modification", async () => {
  // Arrange: Create two users with separate organizations
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

  // Create document in Org B (owned by User B)
  const docB = await factory.createDocument({
    organizationId: orgB.id,
    userId: userB.id,
    title: "Original Title",
  });
  createdDocs.push(docB.id);

  // Create Zero client for User A (who should NOT have access to docB)
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

  // Act & Assert: User A tries to rename User B's document
  // This should fail with an authorization error
  await expect(async () => {
    await (zeroA.mutate as any).document.rename({
      documentId: docB.id,
      title: "Hacked Title",
    }).server;
  }).toThrow();

  // Verify the document was NOT modified in the database
  const [updatedDoc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, docB.id))
    .limit(1);

  expect(updatedDoc).toBeDefined();
  expect(updatedDoc!.title).toBe("Original Title");
});

test("document.moveToFolder prevents unauthorized document modification", async () => {
  // Arrange: Create two users with separate organizations
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
    title: "Document B",
    folderId: null,
  });
  createdDocs.push(docB.id);

  // Create Zero client for User A
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

  // Act & Assert: User A tries to move User B's document
  await expect(async () => {
    await (zeroA.mutate as any).document.moveToFolder({
      documentId: docB.id,
      folderId: "some-folder-id",
    }).server;
  }).toThrow();

  // Verify the document was NOT modified in the database
  const [updatedDoc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, docB.id))
    .limit(1);

  expect(updatedDoc).toBeDefined();
  expect(updatedDoc!.folderId).toBeNull();
});

test("document.rename allows authorized modification", async () => {
  // Arrange: Create user with document
  const { user, organization } = await factory.createUser({
    prefix: "userAuth",
  });
  createdUsers.push(user.id);
  createdOrgs.push(organization.id);

  // Create document owned by user
  const doc = await factory.createDocument({
    organizationId: organization.id,
    userId: user.id,
    title: "Original Title",
  });
  createdDocs.push(doc.id);

  // Create Zero client for the user
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

  // Act: User renames their own document
  await (zero.mutate as any).document.rename({
    documentId: doc.id,
    title: "New Title",
  }).server;

  // Assert: Document should be updated in the database
  const [updatedDoc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, doc.id))
    .limit(1);

  expect(updatedDoc).toBeDefined();
  expect(updatedDoc!.title).toBe("New Title");
});
