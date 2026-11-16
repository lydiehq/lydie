// A .base file's text ⇄ a database definition (`./base.ts` does the mapping). Kept apart because it
// loads `yaml`: reached only through the `@lydie/contract/files` entry point, so code that just
// needs operations and entities (an app starting up) does not load a YAML parser.
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { uuidsForUlids } from "../ids.ts";
import { fromBaseObject, toBaseObject } from "./base.ts";
import type { BaseDefinition, FromBaseOptions, FromBaseResult, ToBaseOptions } from "./base.ts";

export function toBase(def: BaseDefinition, options: ToBaseOptions = {}): string {
  return stringifyYaml(toBaseObject(def, options), { lineWidth: 0, aliasDuplicateObjects: false });
}

export function fromBase(text: string, options: FromBaseOptions): FromBaseResult {
  let parsed: unknown;
  const warnings: string[] = [];
  try {
    // A file written before ids were UUIDs names them as ULIDs: read as the same ids.
    parsed = parseYaml(uuidsForUlids(text)) ?? {};
  } catch (error) {
    warnings.push(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    parsed = {};
  }
  const base =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const result = fromBaseObject(base, options);
  return { ...result, warnings: [...warnings, ...result.warnings] };
}
