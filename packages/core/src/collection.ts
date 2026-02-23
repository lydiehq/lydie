export type PropertyOptionStage = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type PropertyOption = {
  id: string;
  label: string;
  color?: string;
  order: number;
  archived?: boolean;
  stage?: PropertyOptionStage;
};

export type PropertyDefinition = {
  name: string;
  type: "text" | "number" | "date" | "select" | "multi-select" | "status" | "boolean" | "relation";
  required: boolean;
  unique: boolean;
  options?: PropertyOption[];
  relation?: {
    targetCollectionId: string;
  };
  derived?: {
    sourceField: string;
    transform: "slugify";
    editable: boolean;
    warnOnChangeAfterPublish?: boolean;
  };
};

export function resolveRelationTargetCollectionId(
  relation: PropertyDefinition["relation"] | null | undefined,
  currentCollectionId: string,
): string {
  const targetCollectionId = relation?.targetCollectionId;

  if (!targetCollectionId || targetCollectionId === "self") {
    return currentCollectionId;
  }

  return targetCollectionId;
}

export type FieldValue = string | number | boolean | string[] | null;

export type FieldValues = Record<string, FieldValue>;

export function isCollection(properties: unknown): properties is PropertyDefinition[] {
  return Array.isArray(properties) && properties.length > 0;
}

export function getFieldValue(values: FieldValues, fieldName: string): FieldValue {
  return values[fieldName] ?? null;
}

export function setFieldValue(
  values: FieldValues,
  fieldName: string,
  value: FieldValue,
): FieldValues {
  return {
    ...values,
    [fieldName]: value,
  };
}

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

    const aComparable = Array.isArray(aVal) ? aVal.join(",") : aVal;
    const bComparable = Array.isArray(bVal) ? bVal.join(",") : bVal;

    if (aComparable < bComparable) return direction === "asc" ? -1 : 1;
    if (aComparable > bComparable) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

export function mergeInheritedSchema(
  parentSchemas: PropertyDefinition[][],
  childSchema: PropertyDefinition[],
): PropertyDefinition[] {
  const inheritedProperties = parentSchemas.flat();
  const propertyMap = new Map<string, PropertyDefinition>();

  for (const prop of inheritedProperties) {
    propertyMap.set(prop.name, prop);
  }

  for (const prop of childSchema) {
    propertyMap.set(prop.name, prop);
  }

  return Array.from(propertyMap.values());
}

export function parsePath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function getParentIdFromPath(path: string): string | null {
  const parts = parsePath(path);
  if (parts.length <= 1) return null;
  return parts[parts.length - 2] || null;
}
