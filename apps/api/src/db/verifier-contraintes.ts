import "dotenv/config";
import { Pool, type PoolClient } from "pg";

/**
 * Contrôle des contraintes « NOT VALID » (chantier bases-de-donnees, BD-5). `init.sql` recrée à chaque application des
 * contraintes NOT VALID : elles s'appliquent à toute nouvelle écriture, sans rebalayer les lignes déjà présentes. Ce
 * contrôle vérifie, sans rien modifier, que les lignes existantes les respectent aussi : chaque contrainte est validée
 * dans une transaction **annulée** (ROLLBACK) ; une violation est signalée, jamais corrigée.
 *
 *   npm run db:verifier-contraintes        (rôle propriétaire des tables : DATABASE_MIGRATION_URL, sinon DATABASE_URL)
 *
 * Code de sortie : 0 si toutes les contraintes sont respectées, 1 sinon (violation ou contrôle impossible).
 */
export interface ResultatContrainte {
  readonly table: string;
  readonly contrainte: string;
  readonly etat: "respectee" | "violee" | "non-controlee";
  readonly detail: string | null;
}

export async function verifierContraintes(client: PoolClient): Promise<ResultatContrainte[]> {
  const { rows } = await client.query<{ tbl: string; con: string }>(
    `SELECT c.conrelid::regclass::text AS tbl, c.conname AS con FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE NOT c.convalidated AND c.contype IN ('c', 'f') AND n.nspname IN ('public', 'auth', 'admin')
     ORDER BY 1, 2`,
  );
  const resultats: ResultatContrainte[] = [];
  for (const { tbl, con } of rows) {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '5min'");
      const ident = (await client.query<{ q: string }>("SELECT format('ALTER TABLE %s VALIDATE CONSTRAINT %I', $1::regclass, $2::text) AS q", [tbl, con])).rows[0]!.q;
      await client.query(ident);
      resultats.push({ table: tbl, contrainte: con, etat: "respectee", detail: null });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      const violee = code.startsWith("23");
      resultats.push({ table: tbl, contrainte: con, etat: violee ? "violee" : "non-controlee", detail: `${code} ${(e as Error).message}`.trim() });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  }
  return resultats;
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_MIGRATION_URL"] || process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_MIGRATION_URL (ou DATABASE_URL) is not set.");
  const pool = new Pool({ connectionString, max: 1, application_name: "fadi-verifier-contraintes" });
  const client = await pool.connect();
  try {
    const r = await verifierContraintes(client);
    const ko = r.filter((x) => x.etat !== "respectee");
    // eslint-disable-next-line no-console
    for (const x of ko) console.log(`${x.etat === "violee" ? "VIOLÉE" : "NON CONTRÔLÉE"} ${x.table}.${x.contrainte} : ${x.detail}`);
    // eslint-disable-next-line no-console
    console.log(`Contraintes NOT VALID : ${r.length} contrôlées, ${r.length - ko.length} respectées, ${ko.filter((x) => x.etat === "violee").length} violées, ${ko.filter((x) => x.etat === "non-controlee").length} non contrôlées. Rien n'a été modifié.`);
    process.exitCode = ko.length ? 1 : 0;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error((err as Error).message);
    process.exit(1);
  });
}
