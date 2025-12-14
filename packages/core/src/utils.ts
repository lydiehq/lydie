/**
 * Core utility functions used across the application.
 * Frontend-compatible utilities (no Node.js dependencies).
 */

import { renderContentToHTML } from "./content";

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
 * Converts TipTap JSON to HTML first using the custom renderer,
 * then strips HTML tags to get plaintext.
 */
export function convertTipTapToPlaintext(jsonContent: any): string {
  try {
    // Convert TipTap JSON to HTML first using our custom renderer
    const html = renderContentToHTML(jsonContent);

    // Strip HTML tags to get plaintext
    return html.replace(/<[^>]*>/g, "");
  } catch (error) {
    console.error("Error converting TipTap JSON to plaintext:", error);
    // Fallback to JSON string if conversion fails
    return JSON.stringify(jsonContent, null, 2);
  }
}
