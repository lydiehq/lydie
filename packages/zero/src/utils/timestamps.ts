/**
 * Timestamp utility functions for mutators
 */

export function withTimestamps<T extends Record<string, any>>(data: T): T & { created_at: number; updated_at: number } {
  const now = Date.now()
  return {
    ...data,
    created_at: now,
    updated_at: now,
  }
}

export function withUpdatedTimestamp<T extends Record<string, any>>(data: T): T & { updated_at: number } {
  return {
    ...data,
    updated_at: Date.now(),
  }
}
