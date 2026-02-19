import { base64 } from "@better-auth/utils/base64";
import { createHMAC } from "@better-auth/utils/hmac";
import { createRandomStringGenerator } from "@better-auth/utils/random";
import { createId } from "@lydie/core/id";
import { db, organizationsTable, sessionsTable, usersTable } from "@lydie/database";
import { test as baseTest } from "@playwright/test";
import type { StorageState } from "@playwright/test";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { Resource } from "sst";

import { createTestUser, withDeadlockRetry } from "../utils/db";

// Cache expensive crypto operations at module level
const hmac = createHMAC("SHA-256", "none");
const generateRandomString = createRandomStringGenerator("a-z", "0-9", "A-Z", "-_");

// Cache the secret - it won't change during test run
let cachedSecret: string | undefined;
async function getAuthSecret(): Promise<string> {
  if (!cachedSecret) {
    cachedSecret = Resource.BetterAuthSecret.value;
  }
  return cachedSecret;
}

interface WorkerData {
  user: InferSelectModel<typeof usersTable>;
  organization: InferSelectModel<typeof organizationsTable>;
}

interface AuthenticatedFixtures {
  user: InferSelectModel<typeof usersTable>;
  session: InferSelectModel<typeof sessionsTable> & { token: string };
  organization: InferSelectModel<typeof organizationsTable>;
}

type SessionWithSignedToken = InferSelectModel<typeof sessionsTable> & { token: string };

// Optimized session creation with caching
async function createSession(
  userId: string,
  organizationId: string,
  ttlMs: number = 60 * 60 * 1000,
): Promise<SessionWithSignedToken> {
  const secret = await getAuthSecret();
  const sessionToken = generateRandomString(16); // Reduced from 32 to 16

  const signatureBytes = await hmac.sign(secret, sessionToken);
  const signature = base64.encode(signatureBytes);
  const signedToken = `${sessionToken}.${signature}`;

  const sessionId = createId();
  const expiresAt = new Date(Date.now() + ttlMs);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      id: sessionId,
      token: sessionToken,
      userId,
      expiresAt,
      ipAddress: "::1",
      userAgent: "Playwright",
      activeOrganizationId: organizationId,
    })
    .returning();

  if (!session) {
    throw new Error(`Failed to create session for user ${userId}`);
  }

  return { ...session, token: signedToken };
}

// Create storage state without writing to file (for reuse)
function createStorageState(sessionToken: string, expiresAt: Date, baseURL: string) {
  const url = new URL(baseURL);
  const isSecure = url.protocol === "https:";
  const domain = isSecure ? ".lydie.co" : "localhost";

  const cookies = [
    {
      name: "better-auth.session_token",
      value: sessionToken,
      domain,
      path: "/",
      expires: expiresAt.getTime() / 1000,
      httpOnly: true,
    },
  ];

  if (isSecure) {
    cookies.push({
      name: "__Secure-better-auth.session_token",
      value: sessionToken,
      domain,
      path: "/",
      expires: expiresAt.getTime() / 1000,
      httpOnly: true,
    });
  }

  return { cookies, origins: [] };
}

// Authenticated test with user, session, and organization fixtures
export const test = baseTest.extend<AuthenticatedFixtures, { workerData: WorkerData }>({
  workerData: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const id = workerInfo.workerIndex;
      const userId = createId();
      const { user, organization, cleanup } = await createTestUser({
        prefix: "worker",
        userId,
        organizationPrefix: "test-org-worker",
        organizationName: `Test Organization Worker ${userId}`,
      });

      const workerData: WorkerData = {
        user,
        organization,
      };

      await use(workerData);

      const [userCleanup] = await Promise.allSettled([cleanup()]);

      if (userCleanup.status === "rejected") {
        console.error(`Failed to cleanup test data for worker ${id}`);
      }
    },
    { scope: "worker" },
  ],

  session: async ({ workerData }, use) => {
    const session = await createSession(workerData.user.id, workerData.organization.id);

    await use(session);

    await withDeadlockRetry(
      () => db.delete(sessionsTable).where(eq(sessionsTable.id, session.id)),
      `session cleanup for ${session.id}`,
    );
  },

  storageState: async ({ session, baseURL }, use) => {
    const resolvedBaseURL = baseURL ?? "http://localhost:3000";
    const storageState = createStorageState(
      session.token,
      new Date(session.expiresAt),
      resolvedBaseURL,
    ) satisfies StorageState;

    await use(storageState);
  },

  user: async ({ workerData }, use) => {
    await use(workerData.user);
  },

  organization: async ({ workerData }, use) => {
    await use(workerData.organization);
  },
});

// Export helper for multi-user fixture
export { createSession, createStorageState, hmac, generateRandomString, getAuthSecret };

// Unauthenticated test for testing auth flows and public pages
export const testUnauthenticated = baseTest;

export { expect } from "@playwright/test";
