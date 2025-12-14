import { drizzle } from "drizzle-orm/postgres-js";
import { Resource } from "sst";
import * as schema from "./schema";
import { relations } from "./relations";
import { default as postgres } from "postgres";
// import { SQL } from "bun";

// Not gonna be properly able to use Bun's SQL client before this is resolved:
// https://github.com/drizzle-team/drizzle-orm/issues/4942 (not sure if Bun or
// Drizzle issue)
// const pg = new SQL(Resource.PostgresConnectionStringDirect.value);

const pg = postgres(Resource.PostgresConnectionStringDirect.value);

export const db = drizzle({
  client: pg,
  schema,
  relations,
});

export * from "./schema";
export * from "./billing-types";
export { schema };
