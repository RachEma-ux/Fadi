import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { optionsPool } from "./pool-options.js";
import * as schema from "./schema.js";
import { createRuntimeTestPool } from "../testing/test-database.js";

function createApplicationPool(): Pool {
  // Vitest's mode cannot silently inherit the application's DATABASE_URL.
  if (process.env["VITEST"] === "true" || process.env["NODE_ENV"] === "test") return createRuntimeTestPool();
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.");
  }
  const p = new Pool(optionsPool(connectionString));
  // Une connexion inactive coupée par le serveur (redémarrage, délai) émet « error » sur le pool : sans écouteur, le
  // processus entier s'arrêtait. La connexion est écartée par le pool ; l'erreur est journalisée (sans identifiant).
  p.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: "Connexion inactive à la base perdue.", code: (err as { code?: string }).code ?? null, detail: err.message }));
  });
  return p;
}

export const pool = createApplicationPool();
export const db = drizzle(pool, { schema });
