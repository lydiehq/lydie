// Schema-only exports for use in environments that don't support Bun
// (e.g., AWS Lambda). This file does not import the Bun-specific database instance.
import * as schema from "./schema"
import { relations } from "./relations"

export * from "./schema"
export * from "./billing-types"
export { relations, schema }
