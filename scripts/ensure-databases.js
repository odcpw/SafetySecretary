#!/usr/bin/env node
/**
 * Ensures all required databases exist (registry, demo).
 * Run with: npm run db:ensure
 *
 * Uses raw pg connection via Prisma's underlying driver.
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const DATABASES = ["safetysecretary_registry", "safetysecretary_demo"];

async function main() {
  const adminUrl = process.env.POSTGRES_ADMIN_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
  const client = new PrismaClient({ datasources: { db: { url: adminUrl } } });

  try {
    await client.$connect();
    console.log("Connected to postgres");

    for (const dbName of DATABASES) {
      const result = await client.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;

      if (result.length === 0) {
        // Can't use parameterized query for CREATE DATABASE, but dbName is from our hardcoded list
        await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
        console.log(`Created database: ${dbName}`);
      } else {
        console.log(`Database exists: ${dbName}`);
      }
    }

    console.log("All databases ready");
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error("Failed to ensure databases:", err.message);
  process.exit(1);
});
