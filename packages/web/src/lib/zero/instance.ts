import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { type Schema, schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";

const ZERO_INSTANCE_KEY = Symbol.for("__lydie_zero_instance__");

const CACHE_PRELOAD = { ttl: "10s" } as const;

export function getZeroInstance(auth: any): Zero<Schema> {
  const globalWithZero = globalThis as any;

  const userID = auth?.session?.userId ?? "anon";
  const cacheURL = auth?.session ? import.meta.env.VITE_ZERO_URL : undefined;

  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    const existingInstance = globalWithZero[ZERO_INSTANCE_KEY];

    if (existingInstance && (existingInstance as any).userID === userID) {
      return existingInstance;
    }
  }

  const newInstance = new Zero({
    hiddenTabDisconnectDelay: 5 * 60 * 1000, // 5 minutes (same as default)
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
  const globalWithZero = globalThis as any;
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
  zero.preload(queries.organizations.documentTree({ organizationSlug }), CACHE_PRELOAD);
}

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
