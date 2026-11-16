import type { ChangelogEntry } from "./types.ts";

// Per device: the date of the newest entry this person has seen.
export const SEEN_KEY = "seen";

type Storage = {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
};

export function newestDate(entries: readonly ChangelogEntry[]): string | null {
  return entries[0]?.date ?? null;
}

export function hasUnseen(entries: readonly ChangelogEntry[], seen: string | null): boolean {
  const newest = newestDate(entries);
  return newest !== null && (seen === null || newest > seen);
}

export function markSeen(storage: Storage, entries: readonly ChangelogEntry[]): void {
  const newest = newestDate(entries);
  if (newest && hasUnseen(entries, storage.get<string>(SEEN_KEY))) storage.set(SEEN_KEY, newest);
}
