import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { type Schema, schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";

const ZERO_INSTANCE_KEY = Symbol.for("__lydie_zero_instance__");

// Cache configuration following zbugs pattern
// Short TTL ensures data stays fresh while allowing instant navigation
export const CACHE_PRELOAD = { ttl: "10s" } as const;

interface GlobalWithZero {
  [ZERO_INSTANCE_KEY]?: Zero<Schema>;
}

export function getZeroInstance(auth: any): Zero<Schema> {
  const globalWithZero = globalThis as GlobalWithZero;

  const userID = auth?.session?.userId ?? "anon";
  const cacheURL = auth?.session ? import.meta.env.VITE_ZERO_URL : undefined;

  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    const existingInstance = globalWithZero[ZERO_INSTANCE_KEY];

    if (existingInstance && (existingInstance as any).userID === userID) {
      return existingInstance;
    }
  }

  const newInstance = new Zero({
    hiddenTabDisconnectDelay: 5 * 60 * 1000, // 5 minutes
    userID,
    schema,
    context: auth?.session,
    cacheURL,
    mutators,
  });

  globalWithZero[ZERO_INSTANCE_KEY] = newInstance;

  return newInstance;
}

export function clearZeroInstance(): void {
  const globalWithZero = globalThis as GlobalWithZero;
  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    console.log("Clearing Zero instance");
    delete globalWithZero[ZERO_INSTANCE_KEY];
  }
}

export function preloadSidebarData(
  zero: Zero<Schema>,
  organizationSlug: string,
  _organizationId: string,
): void {
  // Preload documents, integration connections, and links in one query
  zero.preload(queries.organizations.documentTree({ organizationSlug }), CACHE_PRELOAD);
}

/**
 * Preload workspace data for instant navigation.
 * Following the zbugs pattern: preload "any data the app needs within one click".
 *
 * This preloads:
 * - Document tree (sidebar structure)
 * - Recent documents (~100 most recently updated, with full content/relationships)
 * - Organization members (for user avatars/info throughout UI)
 */
export function preloadWorkspaceData(
  zero: Zero<Schema>,
  organizationSlug: string,
  organizationId: string,
): void {
  // Sidebar structure - documents tree and integration links
  zero.preload(queries.organizations.documentTree({ organizationSlug }), CACHE_PRELOAD);

  // Recent documents for fast navigation - preloaded with full relationships
  // so navigating to any recent doc is instant
  zero.preload(queries.documents.recent({ organizationId, limit: 100 }), CACHE_PRELOAD);

  // Organization members - needed for user avatars, mentions, etc.
  zero.preload(queries.members.byOrganization({ organizationId }), CACHE_PRELOAD);
}
