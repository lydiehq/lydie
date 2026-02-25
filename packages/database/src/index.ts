import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { relations } from "./relations";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or DATABASE_URL_DIRECT is required");
}

const pg = postgres(connectionString);

export const db = drizzle({
  client: pg,
  schema,
  relations,
});

export * from "./schema";
export * from "./billing-types";
export { schema };
