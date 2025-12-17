/**
 * Core utility functions used across the application.
 * Frontend-compatible utilities (no Node.js dependencies).
 */

import { serializeToPlainText } from "./serialization/text";

/**
 * Generates a URL-friendly slug from a text string.
 * Converts to lowercase, removes special characters, and replaces spaces/hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/[\s_-]+/g, "-") // Replace spaces and _ with -
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing -
}

/**
 * Convert TipTap JSON content to plaintext.
 * Uses the PlainTextBuilder to extract text content only.
 */
export function convertTipTapToPlaintext(jsonContent: any): string {
  try {
    const plainText = serializeToPlainText(jsonContent);
    return plainText;
  } catch (error) {
    console.error("Error converting TipTap JSON to plaintext:", error);
    // Fallback to JSON string if conversion fails
    return JSON.stringify(jsonContent, null, 2);
  }
}
