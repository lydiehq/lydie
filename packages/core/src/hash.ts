/**
 * Node.js-specific hash utilities.
 * Uses Node.js crypto module - not compatible with browser environments.
 */

import { createHash } from "node:crypto"

/**
 * Generate a hash for content to detect changes.
 * Uses SHA-256 for consistent hashing.
 */
export function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}
