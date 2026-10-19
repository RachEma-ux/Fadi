/**
 * Maintenance : supprime les volumes immuables qu'aucune publication ne cite (`lib/volumes-gc.ts`). Idempotent.
 *   npm run db:volumes-gc              → supprime les orphelins, affiche le bilan (JSON)
 *   npm run db:volumes-gc -- --essai   → compte seulement (transaction annulée)
 */
import "dotenv/config";
import { Pool } from "pg";
import { nettoyerVolumes } from "../lib/volumes-gc.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set.");

async function main() {
  const pool = new Pool({ connectionString });
  try {
    const bilan = await nettoyerVolumes(pool, { essai: process.argv.includes("--essai") });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(bilan));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
