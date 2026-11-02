import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { migrer } from "./schema-migrations.js";
import { basculerAncienMoteur } from "./bascule.js";
import { applyRolePasswords } from "./role-passwords.js";
import { chargerCatalogues, ligneBilanCatalogues } from "./catalogues-chargement.js";

// D-7 : la migration (DDL) se fait avec le rôle `fadi_migrator` (`DATABASE_MIGRATION_URL`) ; l'API n'a aucun droit DDL.
// Sans `DATABASE_MIGRATION_URL` (développement local, base d'un seul rôle), `DATABASE_URL` est utilisé.
const connectionString = process.env["DATABASE_MIGRATION_URL"] || process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_MIGRATION_URL (ou DATABASE_URL) is not set.");
}

async function main() {
  const sqlPath = fileURLToPath(new URL("./init.sql", import.meta.url));
  const sql = readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString, max: 1, application_name: "fadi-migrate" });
  try {
    // BD-2 : base de départ (init.sql) si nouvelle ou modifiée, puis migrations numérotées manquantes (db/migrations).
    const rapport = await migrer(pool, { baseSql: sql, dossier: new URL("./migrations/", import.meta.url) });
    // eslint-disable-next-line no-console
    console.log(`Schema applied (init.sql). Base de départ ${rapport.baseAppliquee ? "appliquée" : "inchangée"} ; ${rapport.appliquees.length} migration(s) appliquée(s).`);
    // BD-9.6 (D-GD-29) : catalogues de données du Parcours chargés en base depuis les fichiers livrés (idempotent).
    // eslint-disable-next-line no-console
    console.log(ligneBilanCatalogues(await chargerCatalogues(pool)));
    const roles = await applyRolePasswords(pool);
    // eslint-disable-next-line no-console
    if (roles.length) console.log(`D-7 : mot de passe appliqué pour ${roles.join(", ")}.`);
    const b = await basculerAncienMoteur(pool);
    // eslint-disable-next-line no-console
    if (b.supprimees) console.log(`Bascule de l'Atelier : ${b.convertis} projet(s) repris dans le modèle typé, tables de l'ancien moteur supprimées.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
