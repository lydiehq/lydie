import { db, usersTable, organizationsTable, documentsTable, foldersTable } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { createOrganization } from "@lydie/core/organization";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

type User = InferSelectModel<typeof usersTable>;
type Organization = InferSelectModel<typeof organizationsTable>;
type Document = InferSelectModel<typeof documentsTable>;
type Folder = InferSelectModel<typeof foldersTable>;

/**
 * Factory for creating test data
 * Inspired by the ztest repository's Factory pattern
 */
export class TestFactory {
  /**
   * Create a test user with an organization
   */
  async createUser(options?: {
    prefix?: string;
    userId?: string;
    organizationName?: string;
  }): Promise<{ user: User; organization: Organization }> {
    const userId = options?.userId ?? createId();
    const prefix = options?.prefix ?? "test";
    const userEmail = `${prefix}-${userId}@test.local`;
    const userName = `Test ${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${userId}`;

    await db.insert(usersTable).values({
      id: userId,
      email: userEmail,
      name: userName,
      emailVerified: true,
    });

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`Failed to create test user ${userId}`);
    }

    const organization = await this.createOrganization(userId, {
      name: options?.organizationName ?? `Test Organization ${userId}`,
    });

    return { user, organization };
  }

  /**
   * Create a test organization for a user
   */
  async createOrganization(
    userId: string,
    options?: {
      name?: string;
      slug?: string;
    }
  ): Promise<Organization> {
    const orgSlug = options?.slug ?? `test-org-${createId()}`;
    const orgName = options?.name ?? `Test Organization`;

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

  /**
   * Create a test document
   */
  async createDocument(options: {
    id?: string;
    organizationId: string;
    userId: string;
    title?: string;
    folderId?: string | null;
    jsonContent?: any;
    published?: boolean;
  }): Promise<Document> {
    const docId = options.id ?? createId();
    const title = options.title ?? "Test Document";
    
    await db.insert(documentsTable).values({
      id: docId,
      organizationId: options.organizationId,
      userId: options.userId,
      title,
      slug: `doc-${docId}`,
      jsonContent: options.jsonContent ?? { type: "doc", content: [] },
      folderId: options.folderId ?? null,
      published: options.published ?? false,
      indexStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, docId))
      .limit(1);

    if (!document) {
      throw new Error(`Failed to create document ${docId}`);
    }

    return document;
  }

  /**
   * Create a test folder
   */
  async createFolder(options: {
    id?: string;
    organizationId: string;
    userId: string;
    name?: string;
    parentId?: string | null;
  }): Promise<Folder> {
    const folderId = options.id ?? createId();
    const name = options.name ?? "Test Folder";
    
    await db.insert(foldersTable).values({
      id: folderId,
      organizationId: options.organizationId,
      userId: options.userId,
      name,
      parentId: options.parentId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [folder] = await db
      .select()
      .from(foldersTable)
      .where(eq(foldersTable.id, folderId))
      .limit(1);

    if (!folder) {
      throw new Error(`Failed to create folder ${folderId}`);
    }

    return folder;
  }

  /**
   * Clean up a user and their associated data
   */
  async cleanupUser(userId: string): Promise<void> {
    try {
      // Delete user's organizations (cascade will handle related data)
      const userOrgs = await db
        .select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, userId));

      for (const org of userOrgs) {
        await db
          .delete(organizationsTable)
          .where(eq(organizationsTable.id, org.id));
      }

      // Delete user
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    } catch (error) {
      console.error(`Failed to cleanup user ${userId}:`, error);
    }
  }

  /**
   * Clean up an organization and its associated data
   */
  async cleanupOrganization(organizationId: string): Promise<void> {
    try {
      await db
        .delete(organizationsTable)
        .where(eq(organizationsTable.id, organizationId));
    } catch (error) {
      console.error(`Failed to cleanup organization ${organizationId}:`, error);
    }
  }

  /**
   * Clean up a document
   */
  async cleanupDocument(documentId: string): Promise<void> {
    try {
      await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
    } catch (error) {
      console.error(`Failed to cleanup document ${documentId}:`, error);
    }
  }

  /**
   * Clean up a folder
   */
  async cleanupFolder(folderId: string): Promise<void> {
    try {
      await db.delete(foldersTable).where(eq(foldersTable.id, folderId));
    } catch (error) {
      console.error(`Failed to cleanup folder ${folderId}:`, error);
    }
  }
}

/**
 * Singleton factory instance
 */
export const factory = new TestFactory();

