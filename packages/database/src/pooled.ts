import { drizzle } from "drizzle-orm/postgres-js";
import { Resource } from "sst";
import * as schema from "./schema";
import { relations } from "./relations";
import postgres from "postgres";

// Pooled connection via pgBouncer for Lambda functions. Also uses postgres-js
// as Bun is not supported in Lambda.
const pg = postgres(Resource.PostgresConnectionStringPooled.value);

export const db = drizzle({
  client: pg,
  schema,
  relations,
});
