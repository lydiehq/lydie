import type { InferSelectModel } from "drizzle-orm";

import { base64 } from "@better-auth/utils/base64";
import { createHMAC } from "@better-auth/utils/hmac";
import { createRandomStringGenerator } from "@better-auth/utils/random";
import { createId } from "@lydie/core/id";
import { db, membersTable, organizationsTable, sessionsTable, usersTable } from "@lydie/database";
import { test as baseTest } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { Resource } from "sst";

import { createTestUser } from "../utils/db";

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

async function createUserSession(
  userId: string,
  organizationId: string,
): Promise<InferSelectModel<typeof sessionsTable> & { token: string }> {
  const generateRandomString = createRandomStringGenerator("a-z", "0-9", "A-Z", "-_");
  const sessionToken = generateRandomString(32);

  const hmac = createHMAC("SHA-256", "none");
  const secret = Resource.BetterAuthSecret.value;
  const signatureBytes = await hmac.sign(secret, sessionToken);
  const signature = base64.encode(signatureBytes);
  const signedToken = `${sessionToken}.${signature}`;

  const sessionId = createId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(sessionsTable).values({
    id: sessionId,
    token: sessionToken,
    userId: userId,
    expiresAt: expiresAt,
    ipAddress: "::1",
    userAgent: "Playwright",
    activeOrganizationId: organizationId,
  });

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error(`Failed to create session for user ${userId}`);
  }

  return { ...session, token: signedToken };
}

function createStorageState(sessionToken: string, expiresAt: Date, baseURL: string) {
  const url = new URL(baseURL);
  const isSecure = url.protocol === "https:";
  const domain = isSecure ? ".lydie.co" : ".localhost";

  const cookies = [
    {
      name: "better-auth.session_token",
      value: sessionToken,
      domain: domain,
      path: "/",
      expires: expiresAt.getTime() / 1000,
      httpOnly: true,
    },
  ];

  if (isSecure) {
    cookies.push({
      name: "__Secure-better-auth.session_token",
      value: sessionToken,
      domain: domain,
      path: "/",
      expires: expiresAt.getTime() / 1000,
      httpOnly: true,
    });
  }

  return {
    cookies,
    origins: [],
  };
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

      // Add user2 to the same organization by creating a member record
      const member2Id = createId();
      await db.insert(membersTable).values({
        id: member2Id,
        organizationId: organization.id,
        userId: user2Id,
        role: "member",
      });

      // Create sessions for both users
      const session1 = await createUserSession(user1Id, organization.id);
      const session2 = await createUserSession(user2Id, organization.id);

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

      // Store state for user1 (default context)
      const storageState = createStorageState(
        workerData.user1.session.token,
        new Date(workerData.user1.session.expiresAt),
        baseURL,
      );

      const dir = path.dirname(fileName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fileName, JSON.stringify(storageState, null, 2), "utf-8");

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
