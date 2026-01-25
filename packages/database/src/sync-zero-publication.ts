import { sql } from "drizzle-orm";
import { Resource } from "sst";

import { db } from ".";

const PUBLICATION_NAME = "zero_data";
const SCHEMA = "public";

async function main() {
  // Only run in production - PlanetScale is only used in production
  const stage = Resource.App.stage;
  if (stage !== "production") {
    console.error("❌ This script should only be run in production.");
    console.error(`   Current stage: ${stage || "unknown"}`);
    console.error("   PlanetScale publications are only needed in production.");
    process.exit(1);
  }

  console.log(`Starting Zero publication sync for stage: ${stage}...`);

  try {
    // 1. Fetch all base tables from the schema
    // Note: We cast to any because the driver return type might vary, but postgres-js returns row objects
    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ${SCHEMA} 
      AND table_type = 'BASE TABLE'
    `);

    const allTables = tablesResult.map((row: any) => row.table_name as string);
    console.log(`Found ${allTables.length} base tables in '${SCHEMA}' schema.`);

    if (allTables.length === 0) {
      console.warn("No tables found. Exiting.");
      process.exit(0);
    }

    // 2. Check if publication exists
    const pubResult = await db.execute(sql`
      SELECT pubname 
      FROM pg_publication 
      WHERE pubname = ${PUBLICATION_NAME}
    `);

    const pubExists = pubResult.length > 0;
    // Quote table names to handle special characters or case sensitivity
    const tableList = allTables.map((t) => `"${t}"`).join(", ");

    if (!pubExists) {
      console.log(`Publication '${PUBLICATION_NAME}' does not exist. Creating it...`);
      // CREATE PUBLICATION "name" FOR TABLE "t1", "t2"...
      // PlanetScale doesn't support FOR ALL TABLES, so we list them explicitly
      await db.execute(sql.raw(`CREATE PUBLICATION "${PUBLICATION_NAME}" FOR TABLE ${tableList}`));
      console.log(
        `✅ Successfully created publication '${PUBLICATION_NAME}' for ${allTables.length} tables.`,
      );
    } else {
      console.log(`Publication '${PUBLICATION_NAME}' exists. Checking for table changes...`);

      // 3. Fetch tables currently in the publication
      const pubTablesResult = await db.execute(sql`
        SELECT tablename 
        FROM pg_publication_tables 
        WHERE pubname = ${PUBLICATION_NAME}
      `);

      const currentPubTables = new Set(pubTablesResult.map((row: any) => row.tablename as string));

      const tablesToAdd = allTables.filter((t) => !currentPubTables.has(t));
      const tablesToRemove = [...currentPubTables].filter((t) => !allTables.includes(t));

      if (tablesToAdd.length === 0 && tablesToRemove.length === 0) {
        console.log("✅ Publication is already up to date.");
      } else {
        if (tablesToAdd.length > 0) {
          console.log(`Adding ${tablesToAdd.length} table(s): ${tablesToAdd.join(", ")}`);
          const addList = tablesToAdd.map((t) => `"${t}"`).join(", ");
          await db.execute(sql.raw(`ALTER PUBLICATION "${PUBLICATION_NAME}" ADD TABLE ${addList}`));
        } else {
          console.log("No tables to add.");
        }

        if (tablesToRemove.length > 0) {
          console.log(`Removing ${tablesToRemove.length} table(s): ${tablesToRemove.join(", ")}`);
          const removeList = tablesToRemove.map((t) => `"${t}"`).join(", ");
          await db.execute(
            sql.raw(`ALTER PUBLICATION "${PUBLICATION_NAME}" DROP TABLE ${removeList}`),
          );
        } else {
          console.log("No tables to remove.");
        }
        console.log("✅ Publication updated successfully.");
      }
    }
  } catch (error) {
    console.error("❌ Error syncing publication:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
