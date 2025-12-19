import type { Context } from "@lydie/zero/auth";
import { Zero } from "@rocicorp/zero";
import { schema } from "@lydie/zero/schema";
import { mutators } from "@lydie/zero/mutators";
import { db, sessionsTable } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { Resource } from "sst";
import { createHMAC } from "@better-auth/utils/hmac";
import { base64 } from "@better-auth/utils/base64";
import { createRandomStringGenerator } from "@better-auth/utils/random";

/**
 * Configuration for Zero test environment
 */
export interface ZeroTestConfig {
  serverUrl?: string;
  userId: string;
  organizations?: Array<{
    id: string;
    name: string;
    slug: string | null;
    [key: string]: any;
  }>;
}

/**
 * Type alias for a Zero client instance
 */
export type ZeroClient = Zero;

/**
 * Creates a valid session in the database and returns the signed token
 * This is required because the backend authenticates via better-auth sessions
 */
export async function createTestSession(
  userId: string,
  activeOrganizationId?: string
): Promise<{ sessionId: string; signedToken: string; expiresAt: Date }> {
  const sessionId = createId();
  const generateRandomString = createRandomStringGenerator(
    "a-z",
    "0-9",
    "A-Z",
    "-_"
  );
  const sessionToken = generateRandomString(32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Insert session into database with unsigned token
  await db.insert(sessionsTable).values({
    id: sessionId,
    token: sessionToken,
    userId,
    expiresAt,
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    activeOrganizationId: activeOrganizationId || null,
  });

  // Sign the token using better-auth's HMAC
  const secret = Resource.BetterAuthSecret.value;
  const hmac = createHMAC("SHA-256", "none");
  const signatureBytes = await hmac.sign(secret, sessionToken);
  const signature = base64.encode(signatureBytes);
  const signedToken = `${sessionToken}.${signature}`;

  return { sessionId, signedToken, expiresAt };
}

/**
 * Creates a Zero client instance for testing
 *
 * This properly simulates the full Zero stack including:
 * - Connection to Zero server
 * - Authentication via valid database sessions
 * - Query preloading
 * - Mutation execution
 *
 * NOTE: The Zero server must be running for these tests to work.
 * In dev mode, this is typically at http://localhost:4848
 */
export async function createZeroClient(
  config: ZeroTestConfig
): Promise<ZeroClient> {
  const {
    serverUrl = process.env.ZERO_SERVER_URL || "http://localhost:4848",
    userId,
    organizations = [],
  } = config;

  // Create a valid session in the database
  const activeOrgId =
    organizations.length > 0 ? organizations[0].id : undefined;
  const { signedToken, expiresAt } = await createTestSession(
    userId,
    activeOrgId
  );

  // Create auth context that will be passed to queries/mutators
  const authContext: Context = {
    id: `test-session-${userId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId,
    expiresAt,
    token: signedToken,
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    organizations,
  };

  // Create a custom fetch that includes the session cookie
  // This is required because the backend authenticates via better-auth
  const customFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const cookieHeader = `better-auth.session_token=${signedToken}`;
    const headers = new Headers(init?.headers);
    headers.set("Cookie", cookieHeader);

    return fetch(input, {
      ...init,
      headers,
    });
  };

  const zero = new Zero({
    context: authContext,
    kvStore: "mem",
    logLevel: "error",
    mutators,
    schema,
    server: serverUrl,
    userID: userId,
  });

  return zero;
}

/**
 * Helper to catch assertion errors from mutators
 * Zero mutators throw errors that need special handling in tests
 */
export async function catchAssert(mutatorResult: Promise<unknown>) {
  try {
    await mutatorResult;
  } catch (error) {
    // If it's an expected error (like authorization failure), rethrow it
    // so the test can assert on it
    throw error;
  }
}

/**
 * Helper to assert a mutator was already processed (idempotency check)
 */
export async function assertAlreadyProcessed(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    error.error === "alreadyProcessed"
  ) {
    return;
  }
  throw error;
}
