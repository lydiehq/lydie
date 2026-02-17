import { createId } from "@lydie/core/id";
import { db, sessionsTable } from "@lydie/database";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

export async function createExpiredSession(
  userId: string,
  ttlMs: number = 500,
): Promise<{
  sessionId: string;
  token: string;
  expiresAt: Date;
}> {
  const sessionId = createId();
  const token = createId();
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.insert(sessionsTable).values({
    id: sessionId,
    userId,
    token,
    expiresAt,
  });

  return { sessionId, token, expiresAt };
}

export async function deleteSessionFromDB(sessionId: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}

export async function setSessionCookie(page: Page, token: string, expiresAt: Date): Promise<void> {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: token,
      domain: "localhost",
      path: "/",
      expires: Math.floor(expiresAt.getTime() / 1000),
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
