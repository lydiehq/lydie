import type { PropertyDefinition } from "@lydie/core/collection";

export function toFieldValue(
  fieldDef: PropertyDefinition,
  value: string,
): string | number | boolean | string[] | null {
  if (fieldDef.type === "boolean") {
    return value === "true";
  }
  if (fieldDef.type === "number") {
    return value === "" ? null : Number(value);
  }
  if (fieldDef.type === "date") {
    return value === "" ? null : value;
  }
  if (fieldDef.type === "multi-select") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return value === "" ? null : value;
}

export function getEditableValue(
  fieldDef: PropertyDefinition | undefined,
  value: string | number | boolean | string[] | null | undefined,
): string {
  if (fieldDef?.type === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === null || value === undefined ? "" : String(value);
}

export function isFreeformField(fieldDef: PropertyDefinition | undefined): boolean {
  if (!fieldDef) {
    return true;
  }

  return (
    fieldDef.type === "text" ||
    fieldDef.type === "number" ||
    fieldDef.type === "date" ||
    fieldDef.type === "boolean"
  );
}
