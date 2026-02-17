/**
 * Simplified database/collection model for Lydie
 *
 * Every page can optionally have a childSchema, which defines properties for its children.
 * When childSchema is present, the page acts as a database/table view.
 * When childSchema is null, it's a regular page with free-form children.
 *
 * This replaces the previous "module" concept with a more flexible, Notion-like approach.
 */

/**
 * Field definition for child document schemas
 */
export type FieldDefinition = {
  field: string;
  type: "text" | "datetime" | "select" | "file" | "boolean" | "number";
  required: boolean;
  options?: string[]; // for 'select' only
};

/**
 * Page configuration
 */
export type PageConfig = {
  showChildrenInSidebar: boolean;
  defaultView: "documents" | "table";
};

/**
 * Document properties - stored directly on each document
 * These are like Notion's database properties
 */
export type DocumentProperties = Record<string, string | number | boolean | null>;

/**
 * Default page configuration for new pages
 */
export const DEFAULT_PAGE_CONFIG: PageConfig = {
  showChildrenInSidebar: true,
  defaultView: "documents",
};

/**
 * Get a property value from document properties
 */
export function getProperty(
  properties: DocumentProperties,
  field: string,
): string | number | boolean | null {
  return properties[field] ?? null;
}

/**
 * Set a property value in document properties
 */
export function setProperty(
  properties: DocumentProperties,
  field: string,
  value: string | number | boolean | null,
): DocumentProperties {
  return {
    ...properties,
    [field]: value,
  };
}

/**
 * Check if a document has a child schema (i.e., acts as a database)
 */
export function hasChildSchema(schema: unknown): schema is FieldDefinition[] {
  return Array.isArray(schema) && schema.length > 0;
}

/**
 * Check if a page should show its children in the sidebar
 */
export function shouldShowChildrenInSidebar(pageConfig: PageConfig | null | undefined): boolean {
  return pageConfig?.showChildrenInSidebar ?? DEFAULT_PAGE_CONFIG.showChildrenInSidebar;
}

/**
 * Get the default view for a page
 */
export function getDefaultView(
  pageConfig: PageConfig | null | undefined,
  hasSchema: boolean,
): "documents" | "table" {
  // If there's no schema, always default to documents view
  if (!hasSchema) {
    return "documents";
  }
  // Otherwise respect the page config or default to table when schema exists
  return pageConfig?.defaultView ?? "table";
}

/**
 * Filter documents by property values
 * Used server-side for API queries like GET /api/pages/:id/records
 */
export function filterDocumentsByProperties(
  documents: Array<{ id: string; properties: DocumentProperties }>,
  filters: Record<string, string | number | boolean>,
): typeof documents {
  return documents.filter((doc) => {
    return Object.entries(filters).every(([key, value]) => {
      return doc.properties[key] === value;
    });
  });
}

/**
 * Sort documents by property value
 */
export function sortDocumentsByProperty(
  documents: Array<{ id: string; properties: DocumentProperties }>,
  field: string,
  direction: "asc" | "desc",
): typeof documents {
  return [...documents].sort((a, b) => {
    const aVal = a.properties[field];
    const bVal = b.properties[field];

    if ((aVal === null || aVal === undefined) && (bVal === null || bVal === undefined)) return 0;
    if (aVal === null || aVal === undefined) return direction === "asc" ? 1 : -1;
    if (bVal === null || bVal === undefined) return direction === "asc" ? -1 : 1;

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}
