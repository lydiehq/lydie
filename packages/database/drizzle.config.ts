import { defineConfig } from "drizzle-kit"
import { Resource } from "sst"

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  strict: false,
  dbCredentials: {
    url: Resource.PostgresConnectionStringDirect.value,
  },
  schemaFilter: ["public"],
})
