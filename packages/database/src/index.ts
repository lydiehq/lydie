import { drizzle } from "drizzle-orm/postgres-js"
import { Resource } from "sst"
import * as schema from "./schema"
import { relations } from "./relations"
import postgres from "postgres"

// const pg = new SQL(Resource.PostgresConnectionStringDirect.value);
const pg = postgres(Resource.PostgresConnectionStringDirect.value)

export const db = drizzle({
  client: pg,
  schema,
  relations,
})

export * from "./schema"
export * from "./billing-types"
export { schema }
