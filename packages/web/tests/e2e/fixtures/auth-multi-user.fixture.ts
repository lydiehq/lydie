import * as fs from "node:fs";
import * as path from "node:path";

import { createId } from "@lydie/core/id";
import { db, membersTable, organizationsTable, sessionsTable, usersTable } from "@lydie/database";
import { test as baseTest } from "@playwright/test";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { createTestUser } from "../utils/db";
import { createSession, createStorageState } from "./auth.fixture";

interface UserData {
  user: InferSelectModel<typeof usersTable>;
  session: InferSelectModel<typeof sessionsTable> & { token: string };
}

interface WorkerData {
  user1: UserData;
  user2: UserData;
  organization: InferSelectModel<typeof organizationsTable>;
}

interface MultiUserAuthenticatedFixtures {
  user1: UserData;
  user2: UserData;
  organization: InferSelectModel<typeof organizationsTable>;
}

// Multi-user authenticated test with two users in the same organization
export const test = baseTest.extend<
  MultiUserAuthenticatedFixtures,
  { workerStorageState: string; workerData: WorkerData }
>({
  workerData: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const id = workerInfo.workerIndex;
      const orgId = createId();

      // Create two users in the same organization
      const user1Id = createId();
      const user2Id = createId();

      // Create first user with organization
      const {
        user: user1,
        organization,
        cleanup: cleanup1,
      } = await createTestUser({
        prefix: "collab-user1",
        userId: user1Id,
        organizationPrefix: `test-org-collab-${orgId}`,
        organizationName: `Test Collaboration Org ${orgId}`,
      });

      // Create second user
      await db.insert(usersTable).values({
        id: user2Id,
        email: `collab-user2-${user2Id}@playwright.test`,
        name: `Test Collab User 2 ${user2Id}`,
        emailVerified: true,
      });

      const [user2] = await db.select().from(usersTable).where(eq(usersTable.id, user2Id)).limit(1);

      if (!user2) {
        throw new Error(`Failed to create second user ${user2Id}`);
      }

      // Add user2 to the same organization
      const member2Id = createId();
      await db.insert(membersTable).values({
        id: member2Id,
        organizationId: organization.id,
        userId: user2Id,
        role: "member",
      });

      // Create sessions for both users using shared helper
      const session1 = await createSession(user1Id, organization.id);
      const session2 = await createSession(user2Id, organization.id);

      const workerData: WorkerData = {
        user1: { user: user1, session: session1 },
        user2: { user: user2, session: session2 },
        organization,
      };

      await use(workerData);

      // Cleanup
      try {
        await db.delete(sessionsTable).where(eq(sessionsTable.id, session1.id));
        await db.delete(sessionsTable).where(eq(sessionsTable.id, session2.id));
        await db.delete(membersTable).where(eq(membersTable.userId, user2Id));
        await db.delete(usersTable).where(eq(usersTable.id, user2Id));
        await cleanup1();
      } catch (error) {
        console.error(`Failed to cleanup test data for worker ${id}:`, error);
      }
    },
    { scope: "worker" },
  ],

  workerStorageState: [
    async ({ workerData }, use, workerInfo) => {
      const id = workerInfo.workerIndex;
      const fileName = path.resolve(workerInfo.project.outputDir, `.auth/worker-multi-${id}.json`);

      const baseURL = workerInfo.project.use?.baseURL || "http://localhost:3000";

      // Store state for user1 (default context) using shared helper
      const storageState = createStorageState(
        workerData.user1.session.token,
        new Date(workerData.user1.session.expiresAt),
        baseURL,
      );

      const dir = path.dirname(fileName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fileName, JSON.stringify(storageState), "utf-8");

      await use(fileName);

      try {
        if (fs.existsSync(fileName)) {
          fs.unlinkSync(fileName);
        }
      } catch (error) {
        console.error(`Failed to cleanup storage state file for worker ${id}:`, error);
      }
    },
    { scope: "worker" },
  ],

  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  user1: async ({ workerData }, use) => {
    await use(workerData.user1);
  },

  user2: async ({ workerData }, use) => {
    await use(workerData.user2);
  },

  organization: async ({ workerData }, use) => {
    await use(workerData.organization);
  },
});

// Helper to create a second browser context for user2
export async function createUser2Context(browser: any, workerData: WorkerData, baseURL: string) {
  const storageState = createStorageState(
    workerData.user2.session.token,
    new Date(workerData.user2.session.expiresAt),
    baseURL,
  );

  return await browser.newContext({
    storageState,
    baseURL,
  });
}

export { expect } from "@playwright/test";
