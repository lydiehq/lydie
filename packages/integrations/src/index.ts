/**
 * @lydie/integrations
 *
 * A package for managing document sync integrations to external platforms
 * like GitHub, Shopify, WordPress, etc.
 */

export * from "./types";
export * from "./integration";
export * from "./registry";
export * from "./oauth";

// Export server-side integrations (for backend use)
// Note: These exports should NOT include React components
export * from "./integrations/github";
export * from "./integrations/shopify";
export * from "./integrations/wordpress";

