import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.DATABASE_URL_DIRECT || "postgres://lydie:lydie@localhost:5432/lydie";

if (!connectionString) {
  throw new Error("DATABASE_URL_DIRECT environment variable is required");
}

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  strict: false,
  dbCredentials: {
    url: connectionString,
  },
  schemaFilter: ["public"],
});
