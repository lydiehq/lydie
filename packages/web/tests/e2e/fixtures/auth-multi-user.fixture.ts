import { createId } from "@lydie/core/id";
import { db, membersTable, organizationsTable, sessionsTable, usersTable } from "@lydie/database";
import { test as baseTest } from "@playwright/test";
import type { Browser, BrowserContext, Page, StorageState } from "@playwright/test";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { createTestUser, withDeadlockRetry } from "../utils/db";
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
  user2Context: BrowserContext;
  user2Page: Page;
}

// Multi-user authenticated test with two users in the same organization
export const test = baseTest.extend<
  MultiUserAuthenticatedFixtures,
  { workerData: WorkerData }
>({
  workerData: async ({}, use, testInfo) => {
    const runSuffix = `${testInfo.workerIndex}-${testInfo.parallelIndex}-${createId()}`;
    const user1Id = createId();
    const user2Id = createId();

    const { user: user1, organization, cleanup: cleanupUser1 } = await createTestUser({
      prefix: `collab-user1-${runSuffix}`,
      userId: user1Id,
      organizationPrefix: `test-org-collab-${runSuffix}`,
      organizationName: `Test Collaboration Org ${runSuffix}`,
    });

    const [user2] = await db
      .insert(usersTable)
      .values({
        id: user2Id,
        email: `collab-user2-${runSuffix}@playwright.test`,
        name: `Test Collab User 2 ${runSuffix}`,
        emailVerified: true,
      })
      .returning();

    if (!user2) {
      throw new Error(`Failed to create second user ${user2Id}`);
    }

    const member2Id = createId();
    await db.insert(membersTable).values({
      id: member2Id,
      organizationId: organization.id,
      userId: user2.id,
      role: "member",
    });

    const session1 = await createSession(user1.id, organization.id);
    const session2 = await createSession(user2.id, organization.id);

    const workerData: WorkerData = {
      user1: { user: user1, session: session1 },
      user2: { user: user2, session: session2 },
      organization,
    };

    await use(workerData);

    let failed = false;
    const cleanupSteps: Array<{ label: string; run: () => Promise<unknown> }> = [
      {
        label: `session cleanup 1 for ${runSuffix}`,
        run: () => db.delete(sessionsTable).where(eq(sessionsTable.id, session1.id)),
      },
      {
        label: `session cleanup 2 for ${runSuffix}`,
        run: () => db.delete(sessionsTable).where(eq(sessionsTable.id, session2.id)),
      },
      {
        label: `member cleanup for ${runSuffix}`,
        run: () => db.delete(membersTable).where(eq(membersTable.id, member2Id)),
      },
      {
        label: `secondary user cleanup for ${runSuffix}`,
        run: () => db.delete(usersTable).where(eq(usersTable.id, user2.id)),
      },
    ];

    for (const step of cleanupSteps) {
      try {
        await withDeadlockRetry(step.run, step.label);
      } catch (error) {
        failed = true;
        console.error(`Failed ${step.label}:`, error);
      }
    }

    if (failed) {
      console.error(`Failed to cleanup test data for ${runSuffix}`);
    }

    const [cleanupPrimary] = await Promise.allSettled([cleanupUser1()]);
    if (cleanupPrimary.status === "rejected") {
      console.error(`Failed primary collab user cleanup for ${runSuffix}`);
    }
  },

  storageState: async ({ workerData }, use, testInfo) => {
    const baseURL = testInfo.project.use?.baseURL || "http://localhost:3000";
    const storageState: StorageState = createStorageState(
      workerData.user1.session.token,
      new Date(workerData.user1.session.expiresAt),
      baseURL,
    );
    await use(storageState);
  },

  user1: async ({ workerData }, use) => {
    await use(workerData.user1);
  },

  user2: async ({ workerData }, use) => {
    await use(workerData.user2);
  },

  organization: async ({ workerData }, use) => {
    await use(workerData.organization);
  },

  user2Context: async ({ browser, workerData, baseURL }, use) => {
    const context = await createUser2Context(
      browser,
      workerData,
      baseURL ?? "http://localhost:3000",
    );

    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  user2Page: async ({ user2Context }, use) => {
    const page = await user2Context.newPage();
    await use(page);
  },
});

// Helper to create a second browser context for user2
export async function createUser2Context(
  browser: Browser,
  workerData: WorkerData,
  baseURL: string,
) {
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
