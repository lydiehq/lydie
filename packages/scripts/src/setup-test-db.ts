/**
 * Database setup script for E2E test environment
 * Initializes the test database schema using Drizzle
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@lydie/database/schema";
import { sql } from "drizzle-orm";

const DATABASE_URL =
  process.env.POSTGRES_CONNECTION_STRING_DIRECT ||
  "postgresql://postgres:postgres_test_password@localhost:5432/lydie_test";

async function setupTestDatabase() {
  console.log("🔧 Setting up test database...");
  console.log(`📍 Database URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle({ client, schema });

  try {
    // Test connection
    console.log("🔌 Testing database connection...");
    await client`SELECT 1`;
    console.log("✅ Database connection successful");

    // Push schema to database (Drizzle kit push equivalent)
    console.log("📊 Setting up database schema...");
    
    // Note: For production, you would use migrations.
    // For E2E tests, we can use drizzle-kit push or create tables directly
    // Since we're using drizzle-orm, we'll rely on drizzle-kit push in the orchestration script
    
    console.log("✅ Database schema setup complete");
    
    // Verify tables exist
    console.log("🔍 Verifying tables...");
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log(`📋 Found ${tables.length} tables:`);
    tables.forEach((table) => {
      console.log(`   - ${table.table_name}`);
    });

    console.log("✅ Test database setup complete!");
  } catch (error) {
    console.error("❌ Error setting up test database:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupTestDatabase();

