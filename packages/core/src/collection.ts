/**
 * Collection model for Lydie
 *
 * A Collection IS a Document - specifically, a Document with a row in collection_schemas.
 * When a Document has a collection_schemas row, it becomes a Collection.
 * Documents inside Collections are still just Documents - never referred to as "entries".
 *
 * Architecture:
 * - Document: The only content primitive. Can exist anywhere in the workspace tree.
 * - Collection: A Document with a corresponding row in collection_schemas.
 * - Collection membership: Determined by nearest_collection_id (denormalized, nearest ancestor Collection).
 *
 * Schema Inheritance:
 * - Collections can be nested (a Collection can be a child of another Collection)
 * - Child Collections inherit properties from parent Collections via the path column
 * - Inherited properties cannot be removed at the child level
 * - A Document always satisfies the full inherited schema chain
 */

/**
 * Property definition for collection schemas (matches the spec)
 */
export type PropertyDefinition = {
  name: string;
  type: "text" | "number" | "date" | "select" | "multi-select" | "boolean" | "relation";
  required: boolean;
  unique: boolean;
  options?: string[]; // for 'select' and 'multi-select' only
  derived?: {
    sourceField: string;
    transform: "slugify";
    editable: boolean;
    warnOnChangeAfterPublish?: boolean;
  };
};

/**
 * Field values stored in document_field_values table
 */
export type FieldValues = Record<string, string | number | boolean | null>;

/**
 * Legacy type alias for backwards compatibility during migration
 * @deprecated Use PropertyDefinition instead
 */
export type CollectionField = {
  field: string;
  type:
    | "text"
    | "datetime"
    | "select"
    | "file"
    | "boolean"
    | "number"
    | "date"
    | "multi-select"
    | "relation";
  required: boolean;
  options?: string[];
};

/**
 * Convert new PropertyDefinition to legacy CollectionField format
 */
export function toLegacyField(prop: PropertyDefinition): CollectionField {
  return {
    field: prop.name,
    type:
      prop.type === "date"
        ? "datetime"
        : prop.type === "multi-select"
          ? "select"
          : prop.type === "relation"
            ? "text"
            : prop.type,
    required: prop.required,
    options: prop.options,
  };
}

/**
 * Convert legacy CollectionField to new PropertyDefinition format
 */
export function fromLegacyField(field: CollectionField): PropertyDefinition {
  return {
    name: field.field,
    type: field.type === "datetime" ? "date" : field.type === "file" ? "text" : field.type,
    required: field.required,
    unique: false,
    options: field.options,
  };
}

/**
 * Check if a document is a Collection (has a collection_schemas row)
 */
export function isCollection(properties: unknown): properties is PropertyDefinition[] {
  return Array.isArray(properties) && properties.length > 0;
}

/**
 * Get a field value from field values object
 */
export function getFieldValue(
  values: FieldValues,
  fieldName: string,
): string | number | boolean | null {
  return values[fieldName] ?? null;
}

/**
 * Set a field value in field values object
 */
export function setFieldValue(
  values: FieldValues,
  fieldName: string,
  value: string | number | boolean | null,
): FieldValues {
  return {
    ...values,
    [fieldName]: value,
  };
}

/**
 * Filter documents by field values
 */
export function filterDocumentsByFields(
  documents: Array<{ id: string; values: FieldValues }>,
  filters: Record<string, string | number | boolean>,
): typeof documents {
  return documents.filter((doc) => {
    return Object.entries(filters).every(([key, value]) => {
      return doc.values[key] === value;
    });
  });
}

/**
 * Sort documents by field value
 */
export function sortDocumentsByField(
  documents: Array<{ id: string; values: FieldValues }>,
  field: string,
  direction: "asc" | "desc",
): typeof documents {
  return [...documents].sort((a, b) => {
    const aVal = a.values[field];
    const bVal = b.values[field];

    if ((aVal === null || aVal === undefined) && (bVal === null || bVal === undefined)) return 0;
    if (aVal === null || aVal === undefined) return direction === "asc" ? 1 : -1;
    if (bVal === null || bVal === undefined) return direction === "asc" ? -1 : 1;

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Merge inherited schema properties from parent collections
 * This combines properties from all ancestor collections
 */
export function mergeInheritedSchema(
  parentSchemas: PropertyDefinition[][],
  childSchema: PropertyDefinition[],
): PropertyDefinition[] {
  // Start with parent properties (inherited)
  const inheritedProperties = parentSchemas.flat();

  // Create a map of property names to avoid duplicates
  const propertyMap = new Map<string, PropertyDefinition>();

  // Add inherited properties first
  for (const prop of inheritedProperties) {
    propertyMap.set(prop.name, prop);
  }

  // Add child properties (these can override inherited properties)
  for (const prop of childSchema) {
    propertyMap.set(prop.name, prop);
  }

  return Array.from(propertyMap.values());
}

/**
 * Parse path to get ancestor IDs
 * Path format: "uuid1/uuid2/uuid3" where uuid3 is the document's own ID
 */
export function parsePath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/**
 * Get parent ID from path
 */
export function getParentIdFromPath(path: string): string | null {
  const parts = parsePath(path);
  if (parts.length <= 1) return null;
  return parts[parts.length - 2] || null;
}
