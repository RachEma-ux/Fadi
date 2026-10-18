import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { createRuntimeTestPool } from "../testing/test-database.js";

function createApplicationPool(): Pool {
  // Vitest's mode cannot silently inherit the application's DATABASE_URL.
  if (process.env["VITEST"] === "true" || process.env["NODE_ENV"] === "test") return createRuntimeTestPool();
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.");
  }
  return new Pool({ connectionString });
}

export const pool = createApplicationPool();
export const db = drizzle(pool, { schema });
