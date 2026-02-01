import { mutators } from "@lydie/zero/mutators";
import { type Schema, schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";

const ZERO_INSTANCE_KEY = Symbol.for("__lydie_zero_instance__");

interface GlobalWithZero {
  [ZERO_INSTANCE_KEY]?: Zero<Schema>;
}

// Track the current userID separately from the instance
let currentUserID = "anon";

/**
 * Get or create the Zero instance
 *
 * Console-style: Create immediately without waiting for auth
 * Zero authenticates via cookies, so we can connect right away
 */
export function getZeroInstance(auth?: { session?: { userId?: string } | null }): Zero<Schema> {
  const globalWithZero = globalThis as GlobalWithZero;

  // Extract userID from auth if available, otherwise use "initializing"
  const userID = auth?.session?.userId ?? "initializing";
  currentUserID = userID;

  const cacheURL = import.meta.env.VITE_ZERO_URL;

  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    const existingInstance = globalWithZero[ZERO_INSTANCE_KEY];

    // If we already have an instance with the same userID, reuse it
    if ((existingInstance as any).userID === userID) {
      return existingInstance;
    }

    // If transitioning from "initializing" to real user, recreate
    if ((existingInstance as any).userID === "initializing" && userID !== "initializing") {
      console.log("[Zero] Transitioning from initializing to user:", userID);
      // Close old instance
      existingInstance.close();
      delete globalWithZero[ZERO_INSTANCE_KEY];
    }
  }

  console.log("[Zero] Creating new instance for userID:", userID);

  const newInstance = new Zero({
    hiddenTabDisconnectDelay: 5 * 60 * 1000, // 5 minutes
    userID,
    schema,
    auth: auth?.session,
    server: cacheURL,
    mutators,
  });

  globalWithZero[ZERO_INSTANCE_KEY] = newInstance;

  return newInstance;
}

/**
 * Update the Zero instance after auth resolves
 * This is called lazily when auth data becomes available
 */
export function updateZero(userID: string, context?: any): void {
  const globalWithZero = globalThis as GlobalWithZero;
  const existingInstance = globalWithZero[ZERO_INSTANCE_KEY];

  if (!existingInstance) {
    console.warn("[Zero] No instance exists to update");
    return;
  }

  // Only recreate if userID actually changed
  if ((existingInstance as any).userID === userID) {
    return;
  }

  console.log("[Zero] Recreating instance for new userID:", userID);

  // Close and recreate with new userID and context
  existingInstance.close();
  delete globalWithZero[ZERO_INSTANCE_KEY];

  // Create new instance with context
  const newInstance = new Zero({
    hiddenTabDisconnectDelay: 5 * 60 * 1000,
    userID,
    schema,
    auth: context,
    server: import.meta.env.VITE_ZERO_URL,
    mutators,
  });

  globalWithZero[ZERO_INSTANCE_KEY] = newInstance;
  currentUserID = userID;
}

export function clearZeroInstance(): void {
  const globalWithZero = globalThis as GlobalWithZero;
  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    console.log("[Zero] Clearing instance");
    globalWithZero[ZERO_INSTANCE_KEY].close();
    delete globalWithZero[ZERO_INSTANCE_KEY];
  }
  currentUserID = "anon";
}

export function getCurrentUserID(): string {
  return currentUserID;
}
