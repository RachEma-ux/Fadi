/**
 * BD-9.6 : chargement des catalogues de données du Parcours en base, en ligne de commande.
 *
 *   npm run db:catalogues:charger            (développement : tsx)
 *   node apps/api/dist/catalogues-charger.js (image de production)
 *
 * Idempotent : un fichier dont l'empreinte est déjà publiée ne change rien. La migration (`db:migrate`, service
 * `migrate`) le fait déjà après les migrations ; cette commande sert à recharger sans migrer. Rôle : celui de la
 * migration (`DATABASE_MIGRATION_URL`, sinon `DATABASE_URL` en développement) — `fadi_app` n'a que la lecture.
 */
import "dotenv/config";
import { Pool } from "pg";
import { chargerCatalogues, ligneBilanCatalogues } from "./catalogues-chargement.js";

const connectionString = process.env["DATABASE_MIGRATION_URL"] || process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL (ou DATABASE_URL) is not set.");

async function main() {
  const pool = new Pool({ connectionString, max: 1, application_name: "fadi-catalogues" });
  try {
    // eslint-disable-next-line no-console
    console.log(ligneBilanCatalogues(await chargerCatalogues(pool)));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
