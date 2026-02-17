/**
 * Collection model for Lydie
 *
 * A Collection IS a Page - specifically, a Page with a collection_schema attached.
 * When a Page has collection_schema, it becomes a Collection and its direct children
 * become entries that must conform to its schema.
 *
 * Architecture:
 * - Page: Base unit of content. Can exist anywhere in the workspace tree.
 * - Collection: A Page with collection_schema. Its children are entries.
 * - Entry: A child Page of a Collection. Belongs to exactly one Collection.
 *
 * Schema Inheritance:
 * - Collections can be nested (a Collection can be a child of another Collection)
 * - Child Collections inherit fields from parent Collections
 * - Inherited fields cannot be removed at the child level
 * - An entry always satisfies the full inherited schema chain
 */

/**
 * Field definition for collection schemas
 */
export type CollectionField = {
  field: string;
  type: "text" | "datetime" | "select" | "file" | "boolean" | "number";
  required: boolean;
  options?: string[]; // for 'select' only
};

/**
 * Collection configuration
 */
export type CollectionConfig = {
  showChildrenInSidebar: boolean;
  defaultView: "documents" | "table";
};

/**
 * Document properties - stored directly on each document
 * These are the values for collection fields
 */
export type DocumentProperties = Record<string, string | number | boolean | null>;

/**
 * Default collection configuration
 */
export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
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
 * Check if a page has collection_schema (i.e., is a Collection)
 */
export function isCollection(collectionSchema: unknown): collectionSchema is CollectionField[] {
  return Array.isArray(collectionSchema) && collectionSchema.length > 0;
}

/**
 * Check if a collection should show its entries in the sidebar
 */
export function shouldShowChildrenInSidebar(
  config: CollectionConfig | null | undefined,
): boolean {
  return config?.showChildrenInSidebar ?? DEFAULT_COLLECTION_CONFIG.showChildrenInSidebar;
}

/**
 * Get the default view for a collection
 */
export function getDefaultView(
  config: CollectionConfig | null | undefined,
  hasFields: boolean,
): "documents" | "table" {
  // If there are no fields, always default to documents view
  if (!hasFields) {
    return "documents";
  }
  // Otherwise respect the config or default to table when fields exist
  return config?.defaultView ?? "table";
}

/**
 * Filter documents by property values
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

/**
 * Merge inherited schema fields from parent collections
 * This combines fields from all ancestor collections
 */
export function mergeInheritedSchema(
  parentSchemas: CollectionField[][],
  childSchema: CollectionField[],
): CollectionField[] {
  // Start with parent fields (inherited)
  const inheritedFields = parentSchemas.flat();
  
  // Create a map of field names to avoid duplicates
  const fieldMap = new Map<string, CollectionField>();
  
  // Add inherited fields first
  for (const field of inheritedFields) {
    fieldMap.set(field.field, field);
  }
  
  // Add child fields (these can override inherited fields)
  for (const field of childSchema) {
    fieldMap.set(field.field, field);
  }
  
  return Array.from(fieldMap.values());
}
