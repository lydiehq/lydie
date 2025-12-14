import { drizzle } from "drizzle-orm/bun-sql";
import { Resource } from "sst";
import * as schema from "./schema";
import { relations } from "./relations";
import { SQL } from "bun";

// Pooled connection via pgBouncer for Lambda functions
const pg = new SQL(Resource.PostgresConnectionStringPooled.value);

export const db = drizzle({
  client: pg,
  schema,
  relations,
});
