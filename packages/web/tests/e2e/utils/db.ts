import { createId } from "@lydie/core/id";
import { createOrganization } from "@lydie/core/organization";
import {
  collectionFieldsTable,
  collectionsTable,
  db,
  documentsTable,
  membersTable,
  organizationsTable,
  usersTable,
  workspaceBillingTable,
} from "@lydie/database";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";

type User = InferSelectModel<typeof usersTable>;
type Organization = InferSelectModel<typeof organizationsTable>;
type Collection = InferSelectModel<typeof collectionsTable>;
type Document = InferSelectModel<typeof documentsTable>;
type CollectionFields = InferSelectModel<typeof collectionFieldsTable>;

function isDeadlockError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  if (maybeCode === "40P01") {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  return cause ? isDeadlockError(cause) : false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxAttempts = 4,
): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isDeadlockError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const backoffMs = 50 * 2 ** (attempt - 1);
      const jitterMs = Math.floor(Math.random() * 30);

      console.warn(
        `Deadlock during ${label}; retrying (${attempt}/${maxAttempts}) after ${backoffMs + jitterMs}ms`,
      );

      await delay(backoffMs + jitterMs);
      attempt += 1;
    }
  }
}

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

  const [user] = await db
    .insert(usersTable)
    .values({
      id: userId,
      email: userEmail,
      name: userName,
      emailVerified: true,
      role: "admin",
    })
    .returning();

  if (!user) {
    throw new Error(`Failed to create test user ${userId}`);
  }

  const organization = await createTestOrganization(userId, {
    prefix: options?.organizationPrefix ?? `test-org-${prefix}`,
    name: options?.organizationName ?? `Test Organization ${userId}`,
  });

  const cleanup = async () => {
    let failed = false;

    try {
      const ownedMemberships = await withDeadlockRetry(
        () =>
          db
            .select({ organizationId: membersTable.organizationId })
            .from(membersTable)
            .where(and(eq(membersTable.userId, user.id), eq(membersTable.role, "owner"))),
        `owned membership lookup for ${userId}`,
      );

      for (const membership of ownedMemberships) {
        await withDeadlockRetry(
          () =>
            db
              .delete(organizationsTable)
              .where(eq(organizationsTable.id, membership.organizationId)),
          `organization cleanup for ${membership.organizationId}`,
        );
      }
    } catch (error) {
      failed = true;
      console.error(`Failed to cleanup owned organizations for ${userId}:`, error);
    }

    try {
      await withDeadlockRetry(
        () => db.delete(membersTable).where(eq(membersTable.userId, user.id)),
        `membership cleanup for ${userId}`,
      );
    } catch (error) {
      failed = true;
      console.error(`Failed to cleanup memberships for ${user.id}:`, error);
    }

    try {
      await withDeadlockRetry(
        () => db.delete(workspaceBillingTable).where(eq(workspaceBillingTable.billingOwnerUserId, user.id)),
        `workspace billing cleanup for ${userId}`,
      );
    } catch (error) {
      failed = true;
      console.error(`Failed to cleanup workspace billing for ${user.id}:`, error);
    }

    try {
      await withDeadlockRetry(
        () => db.delete(usersTable).where(eq(usersTable.id, user.id)),
        `user cleanup for ${userId}`,
      );
    } catch (error) {
      failed = true;
      console.error(`Failed to cleanup user ${user.id}:`, error);
    }

    if (failed) {
      console.error(`Failed to cleanup test user ${userId}`);
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
      type:
        | "text"
        | "number"
        | "date"
        | "select"
        | "multi-select"
        | "status"
        | "boolean"
        | "relation";
      required: boolean;
      unique: boolean;
      options?: Array<{
        id: string;
        label: string;
        color?: string;
        order: number;
        archived?: boolean;
        stage?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
      }>;
      relation?: {
        targetCollectionId: string;
        many?: boolean;
      };
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

  const [collection] = await db
    .insert(collectionsTable)
    .values({
      id: collectionId,
      name,
      handle,
      organizationId,
      properties,
    })
    .returning();

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
    fieldValues?: Record<string, string | number | boolean | string[] | null>;
  },
): Promise<{ document: Document; fields: CollectionFields | null }> {
  const documentId = createId();
  const title = options?.title ?? `Test Document ${documentId.slice(0, 8)}`;

  const [document] = await db
    .insert(documentsTable)
    .values({
      id: documentId,
      title,
      organizationId,
      collectionId,
      parentId: options?.parentId ?? null,
      published: options?.published ?? false,
    })
    .returning();

  if (!document) {
    throw new Error(`Failed to create document ${documentId}`);
  }

  let fields: CollectionFields | null = null;

  if (options?.fieldValues && Object.keys(options.fieldValues).length > 0) {
    const fieldsId = createId();
    const [fieldsResult] = await db
      .insert(collectionFieldsTable)
      .values({
        id: fieldsId,
        documentId,
        collectionId,
        values: options.fieldValues,
      })
      .returning();

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
