import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { applicationPoolConfig } from "./pool-config.js";
import * as schema from "./schema.js";
import { createRuntimeTestPool } from "../testing/test-database.js";

function createApplicationPool(): Pool {
  // Vitest's mode cannot silently inherit the application's DATABASE_URL.
  if (process.env["VITEST"] === "true" || process.env["NODE_ENV"] === "test") return createRuntimeTestPool();
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.");
  }
  const created = new Pool(applicationPoolConfig(connectionString));
  // Une erreur sur un client inactif (redémarrage de PostgreSQL, coupure réseau) est émise sur le pool : sans écouteur,
  // Node lève une exception non gérée et le processus s'arrête. Le pool remplace lui-même le client fautif.
  created.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: "pg_pool_idle_client_error", detail: err.message }));
  });
  return created;
}

export const pool = createApplicationPool();
export const db = drizzle(pool, { schema });
