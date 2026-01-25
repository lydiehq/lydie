import type { CustomFieldSchema } from "./types";

export function validateCustomFields(
  customFields: Record<string, string | number> | undefined,
  schema: CustomFieldSchema | undefined,
): { valid: boolean; errors: string[] } {
  if (!schema) return { valid: true, errors: [] };

  const errors: string[] = [];
  const fields = customFields || {};

  for (const fieldDef of schema.fields) {
    const value = fields[fieldDef.key];

    // Check required fields
    if (fieldDef.required && (value === undefined || value === "")) {
      errors.push(`Field "${fieldDef.label}" is required`);
      continue;
    }

    // Type validation
    if (value !== undefined && typeof value !== fieldDef.type) {
      errors.push(`Field "${fieldDef.label}" must be a ${fieldDef.type}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
