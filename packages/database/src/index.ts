import { drizzle } from "drizzle-orm/bun-sql";
import { Resource } from "sst";
import * as schema from "./schema";
import { relations } from "./relations";
import { SQL } from "bun";

const pg = new SQL(Resource.PostgresConnectionStringDirect.value);

export const db = drizzle({
  client: pg,
  schema,
  relations,
});

export * from "./schema";
export * from "./billing-types";
export { schema };
