import { db, sessionsTable } from "@lydie/database";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { createSession, createStorageState } from "../fixtures/auth.fixture";

const GET_SESSION_PATH = "/internal/public/auth/get-session";

export async function createExpiredSession(
  userId: string,
  organizationId: string,
  ttlMs: number = 500,
): Promise<{
  sessionId: string;
  token: string;
  expiresAt: Date;
}> {
  const session = await createSession(userId, organizationId, ttlMs);

  return {
    sessionId: session.id,
    token: session.token,
    expiresAt: new Date(session.expiresAt),
  };
}

export async function deleteSessionFromDB(sessionId: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}

export async function setSessionCookie(
  page: Page,
  token: string,
  expiresAt: Date,
  baseURL: string = "http://localhost:3000",
): Promise<void> {
  const storageState = createStorageState(token, expiresAt, baseURL);
  await page.context().addCookies(storageState.cookies);
}

export function createGetSessionRequestCounter(page: Page) {
  let count = 0;

  const onRequest = (request: { url: () => string; method: () => string }) => {
    if (request.method() === "GET" && request.url().includes(GET_SESSION_PATH)) {
      count += 1;
    }
  };

  page.on("request", onRequest);

  return {
    getCount: () => count,
    reset: () => {
      count = 0;
    },
    dispose: () => {
      page.off("request", onRequest);
    },
  };
}
