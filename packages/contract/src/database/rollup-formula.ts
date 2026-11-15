// The Obsidian formula closest to a rollup, so a rollup column still shows something useful when
// the .base file is opened in Obsidian. Lydie itself reads the rollup from `lydie.properties`.
import type { PropertyInput, PropertyType } from "./entities.ts";
import { printExpression, refExpr } from "./expression.ts";
import { propertyRef } from "./filters.ts";

export function rollupFormula(
  rollup: PropertyInput,
  properties: readonly PropertyInput[],
  resolve?: (id: string) => { type: PropertyType; key: string } | null,
): string {
  const config = rollup.config.rollup;
  const relation = config && properties.find((p) => p.id === config.relationPropertyId);
  if (!config || !relation) return "null";
  const related = `list(${printExpression(refExpr(propertyRef(relation)))})`;
  if (config.function === "count") return `${related}.length`;
  const target = resolve?.(config.targetPropertyId);
  if (!target) return "null";
  const ref = propertyRef(target);
  const read =
    ref.ns === "note"
      ? `value.asFile().properties[${JSON.stringify(ref.name)}]`
      : ref.ns === "file"
        ? `value.asFile().${ref.name === "name" ? "basename" : ref.name}`
        : "null";
  const values = `${related}.map(${read})`;
  const present = `${values}.filter(!value.isEmpty())`;
  switch (config.function) {
    case "showOriginal":
      return values;
    case "showUnique":
      return `${values}.unique()`;
    case "countValues":
    case "countNotEmpty":
      return `${present}.length`;
    case "countUnique":
      return `${present}.unique().length`;
    case "countEmpty":
      return `${values}.filter(value.isEmpty()).length`;
    case "sum":
      return `${present}.reduce(acc + value, 0)`;
    case "average":
      return `if(${present}.length > 0, ${present}.reduce(acc + value, 0) / ${present}.length, null)`;
    case "min":
    case "earliest":
      return `${present}.sort()[0]`;
    case "max":
    case "latest":
      return `${present}.sort().reverse()[0]`;
    case "checked":
      return `${values}.filter(value == true).length`;
    case "unchecked":
      return `${values}.filter(value != true).length`;
    default:
      return "null";
  }
}
