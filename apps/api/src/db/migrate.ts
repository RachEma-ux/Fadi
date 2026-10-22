import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { basculerAncienMoteur } from "./bascule.js";
import { applyRolePasswords } from "./role-passwords.js";

// D-7 : la migration (DDL) se fait avec le rôle `fadi_migrator` (`DATABASE_MIGRATION_URL`) ; l'API n'a aucun droit DDL.
// Sans `DATABASE_MIGRATION_URL` (développement local, base d'un seul rôle), `DATABASE_URL` est utilisé.
const connectionString = process.env["DATABASE_MIGRATION_URL"] || process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_MIGRATION_URL (ou DATABASE_URL) is not set.");
}

async function main() {
  const sqlPath = fileURLToPath(new URL("./init.sql", import.meta.url));
  const sql = readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString });
  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log("Schema applied (init.sql).");
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
