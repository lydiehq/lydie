import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Resource } from "sst";

import { relations } from "./relations";
import * as schema from "./schema";

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
