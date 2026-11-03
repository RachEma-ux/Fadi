/**
 * BD-2.3 (chantier base-donnees, constats M5 / S1) : validation des contraintes `NOT VALID`.
 *
 * `init.sql` ajoute ses clés étrangères et CHECK avec `NOT VALID` (sans parcourir les tables). Tant qu'elles ne sont
 * pas validées, les lignes antérieures ne sont jamais contrôlées. Ce script valide chaque contrainte séparément, hors
 * transaction longue : `VALIDATE CONSTRAINT` ne prend qu'un verrou `SHARE UPDATE EXCLUSIVE` (lectures et écritures
 * continuent) ; un verrou non obtenu en 3 s passe à la suivante. Une contrainte que des lignes existantes violent est
 * listée, jamais forcée : corriger les données, puis relancer.
 *
 *   DATABASE_MIGRATION_URL=… npm run db:validate-constraints            # valide
 *   DATABASE_MIGRATION_URL=… npm run db:validate-constraints -- --essai # liste seulement
 *
 * À lancer hors pic. Volontairement hors du déploiement : une donnée historique non conforme ne doit pas bloquer une
 * mise en production.
 */
import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env["DATABASE_MIGRATION_URL"] || process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL (ou DATABASE_URL) is not set.");
const essai = process.argv.includes("--essai");

async function main() {
  const pool = new Pool({ connectionString, max: 1, application_name: "fadi-validate-constraints" });
  const client = await pool.connect();
  const bilan = { validees: 0, violees: [] as string[], verrouillees: [] as string[], restantes: 0 };
  try {
    const { rows } = await client.query<{ tbl: string; conname: string; contype: string }>(
      `SELECT c.conrelid::regclass::text AS tbl, c.conname, c.contype
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE NOT c.convalidated AND n.nspname IN ('public', 'auth', 'admin')
        ORDER BY c.contype, c.conrelid::regclass::text, c.conname`,
    );
    bilan.restantes = rows.length;
    // eslint-disable-next-line no-console
    console.log(`${rows.length} contrainte(s) NOT VALID.`);
    if (essai) {
      // eslint-disable-next-line no-console
      for (const r of rows) console.log(`  ${r.contype === "f" ? "FK   " : "CHECK"} ${r.tbl}.${r.conname}`);
      return;
    }
    const roleOwner = (await client.query<{ ok: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') AND pg_has_role(current_user, 'fadi_owner', 'MEMBER') AS ok")).rows[0]?.ok;
    if (roleOwner) await client.query("SET ROLE fadi_owner");
    await client.query("SET lock_timeout = '3s'");
    await client.query("SET statement_timeout = 0");
    for (const r of rows) {
      const nom = `${r.tbl}.${r.conname}`;
      try {
        await client.query(`ALTER TABLE ${r.tbl} VALIDATE CONSTRAINT ${JSON.stringify(r.conname)}`);
        bilan.validees += 1;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "55P03") bilan.verrouillees.push(nom);
        else if (code === "23514" || code === "23503") bilan.violees.push(nom);
        else throw err;
      }
    }
    bilan.restantes = rows.length - bilan.validees;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: bilan.violees.length ? "warn" : "info", message: "validate-constraints", ...bilan }));
    if (bilan.violees.length) {
      // eslint-disable-next-line no-console
      console.log("Contraintes violées par des lignes existantes (corriger les données, puis relancer) :\n  " + bilan.violees.join("\n  "));
      process.exitCode = 2;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
