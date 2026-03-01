import { authClient } from "@lydie/core/auth";
import { createId } from "@lydie/core/id";
import { db, organizationsTable, sessionsTable, usersTable } from "@lydie/database";
import { test as baseTest } from "@playwright/test";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { createTestUser, withDeadlockRetry } from "../utils/db";

let cachedTestHelpers: any;
async function getTestHelpers() {
  if (cachedTestHelpers) {
    return cachedTestHelpers;
  }

  const context = await authClient.$context;
  const testHelpers = (context as { test?: unknown }).test;

  if (!testHelpers) {
    throw new Error(
      "Better Auth test utils are not enabled. Set BETTER_AUTH_ENABLE_TEST_UTILS=true for E2E runs.",
    );
  }

  cachedTestHelpers = testHelpers;
  return cachedTestHelpers;
}

interface AuthData {
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
  const testHelpers = await getTestHelpers();
  const loginResult = await testHelpers.login({ userId });
  const sessionId = loginResult?.session?.id as string | undefined;
  const signedToken = loginResult?.token as string | undefined;
  const expiresAt = new Date(Date.now() + ttlMs);

  if (!sessionId || !signedToken) {
    throw new Error(`Failed to create Better Auth test session for user ${userId}`);
  }

  await db
    .update(sessionsTable)
    .set({
      expiresAt,
      activeOrganizationId: organizationId,
    })
    .where(eq(sessionsTable.id, sessionId));

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

// Create storage state without writing to file (for reuse)
function createStorageState(sessionToken: string, expiresAt: Date, baseURL: string) {
  const url = new URL(baseURL);
  const isSecure = url.protocol === "https:";
  const domain = isSecure ? ".lydie.co" : "localhost";
  const sameSite = isSecure ? ("None" as const) : ("Lax" as const);

  const cookies = [
    {
      name: "better-auth.session_token",
      value: sessionToken,
      domain,
      path: "/",
      expires: expiresAt.getTime() / 1000,
      httpOnly: true,
      secure: isSecure,
      sameSite,
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
      secure: true,
      sameSite: "None",
    });
  }

  return { cookies, origins: [] };
}

// Authenticated test with user, session, and organization fixtures
export const test = baseTest.extend<
  AuthenticatedFixtures & { authData: AuthData }
>({
  authData: async ({}, use, testInfo) => {
    const userId = createId();
    const runSuffix = `${testInfo.workerIndex}-${testInfo.parallelIndex}-${userId}`;
    const { user, organization, cleanup } = await createTestUser({
      prefix: `test-${runSuffix}`,
      userId,
      organizationPrefix: `test-org-${runSuffix}`,
      organizationName: `Test Organization ${runSuffix}`,
    });

    const authData: AuthData = { user, organization };

    await use(authData);

    const [userCleanup] = await Promise.allSettled([cleanup()]);
    if (userCleanup.status === "rejected") {
      console.error(`Failed to cleanup test data for ${runSuffix}`);
    }
  },

  session: async ({ authData }, use) => {
    const session = await createSession(authData.user.id, authData.organization.id);

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
    );

    await use(storageState);
  },

  user: async ({ authData }, use) => {
    await use(authData.user);
  },

  organization: async ({ authData }, use) => {
    await use(authData.organization);
  },
});

// Export helper for multi-user fixture
export { createSession, createStorageState };

// Unauthenticated test for testing auth flows and public pages
export const testUnauthenticated = baseTest;

export { expect } from "@playwright/test";
