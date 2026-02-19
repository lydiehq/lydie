import { createId } from "@lydie/core/id";
import { createOrganization } from "@lydie/core/organization";
import {
  collectionFieldsTable,
  collectionsTable,
  db,
  documentsTable,
  organizationsTable,
  usersTable,
} from "@lydie/database";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

type User = InferSelectModel<typeof usersTable>;
type Organization = InferSelectModel<typeof organizationsTable>;
type Collection = InferSelectModel<typeof collectionsTable>;
type Document = InferSelectModel<typeof documentsTable>;
type CollectionFields = InferSelectModel<typeof collectionFieldsTable>;

export async function createTestUser(options?: {
  prefix?: string;
  userId?: string;
  organizationPrefix?: string;
  organizationName?: string;
}): Promise<{
  user: User;
  organization: Organization;
  cleanup: () => Promise<void>;
}> {
  const userId = options?.userId ?? createId();
  const prefix = options?.prefix ?? "test";
  const userEmail = `${prefix}-${userId}@playwright.test`;
  const userName = `Test ${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${userId}`;

  await db.insert(usersTable).values({
    id: userId,
    email: userEmail,
    name: userName,
    emailVerified: true,
  });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) {
    throw new Error(`Failed to create test user ${userId}`);
  }

  const organization = await createTestOrganization(userId, {
    prefix: options?.organizationPrefix ?? `test-org-${prefix}`,
    name: options?.organizationName ?? `Test Organization ${userId}`,
  });

  const cleanup = async () => {
    try {
      await db.delete(organizationsTable).where(eq(organizationsTable.id, organization.id));
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
    } catch (error) {
      console.error(`Failed to cleanup test user ${userId}:`, error);
    }
  };

  return { user, organization, cleanup };
}

export async function createTestOrganization(
  userId: string,
  options?: {
    prefix?: string;
    name?: string;
    slug?: string;
  },
): Promise<Organization> {
  const prefix = options?.prefix ?? "test-org";
  const orgSlug = options?.slug ?? `${prefix}-${userId}`;
  const orgName = options?.name ?? `Test Organization ${userId}`;

  const { organizationId } = await createOrganization({
    name: orgName,
    slug: orgSlug,
    userId: userId,
  });

  const [organization] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error(`Failed to create organization ${organizationId}`);
  }

  return organization;
}

export async function createTestCollection(
  organizationId: string,
  options?: {
    name?: string;
    handle?: string;
    properties?: Array<{
      name: string;
      type: "text" | "number" | "date" | "select" | "multi-select" | "boolean" | "relation";
      required: boolean;
      unique: boolean;
      options?: string[];
    }>;
  },
): Promise<Collection> {
  const collectionId = createId();
  const name = options?.name ?? `Test Collection ${collectionId.slice(0, 8)}`;
  const handle = options?.handle ?? `test-collection-${collectionId.slice(0, 8)}`;
  const properties =
    options?.properties?.map((p) => ({
      ...p,
      required: p.required ?? false,
      unique: p.unique ?? false,
    })) ?? [];

  await db.insert(collectionsTable).values({
    id: collectionId,
    name,
    handle,
    organizationId,
    properties,
  });

  const [collection] = await db
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.id, collectionId))
    .limit(1);

  if (!collection) {
    throw new Error(`Failed to create collection ${collectionId}`);
  }

  return collection;
}

export async function createTestCollectionDocument(
  organizationId: string,
  collectionId: string,
  options?: {
    title?: string;
    parentId?: string | null;
    published?: boolean;
    fieldValues?: Record<string, string | number | boolean | null>;
  },
): Promise<{ document: Document; fields: CollectionFields | null }> {
  const documentId = createId();
  const title = options?.title ?? `Test Document ${documentId.slice(0, 8)}`;

  await db.insert(documentsTable).values({
    id: documentId,
    title,
    organizationId,
    collectionId,
    parentId: options?.parentId ?? null,
    published: options?.published ?? false,
  });

  const [document] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error(`Failed to create document ${documentId}`);
  }

  let fields: CollectionFields | null = null;

  if (options?.fieldValues && Object.keys(options.fieldValues).length > 0) {
    const fieldsId = createId();
    await db.insert(collectionFieldsTable).values({
      id: fieldsId,
      documentId,
      collectionId,
      values: options.fieldValues,
    });

    const [fieldsResult] = await db
      .select()
      .from(collectionFieldsTable)
      .where(eq(collectionFieldsTable.id, fieldsId))
      .limit(1);

    fields = fieldsResult ?? null;
  }

  return { document, fields };
}

export async function deleteTestCollection(collectionId: string): Promise<void> {
  await db.delete(collectionsTable).where(eq(collectionsTable.id, collectionId));
}

export async function deleteTestDocument(documentId: string): Promise<void> {
  await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
}
