/**
 * Application du schéma idempotent (`init.sql`) — chantier bases-de-donnees, BD-5. Un seul chemin pour `npm run db:migrate`,
 * le service de migration à usage unique (`MIGRATE_ONLY=1`) et `MIGRATE_ON_START=1`.
 *
 * Garde-fous (le script est rejoué en entier à chaque déploiement, dans une seule transaction implicite, et prend des
 * verrous exclusifs sur les tables qu'il modifie pendant que l'application tourne) :
 * - un verrou consultatif empêche deux migrations simultanées ;
 * - `lock_timeout` court (`MIGRATION_LOCK_TIMEOUT`, 5s) : la migration n'attend jamais longtemps derrière une requête de
 *   l'application — sinon toutes les requêtes suivantes s'empileraient derrière elle et l'application serait figée ;
 * - un verrou indisponible (55P03) n'applique rien (la transaction est annulée en entier) ; nouvel essai après une pause
 *   croissante, `MIGRATION_TENTATIVES` (6) essais au plus, puis échec franc (le déploiement s'arrête) ;
 * - chaque application réussie est consignée dans `admin.schema_applications` (empreinte du script, durée, essais).
 */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { entier } from "./pool-options.js";

/** Clé du verrou consultatif de la migration (constante, propre à Fadi). */
export const VERROU_MIGRATION = 7_314_202_611;

export interface ResultatSchema {
  readonly empreinte: string;
  readonly tentatives: number;
  readonly dureeMs: number;
  readonly pgStatStatements: "active" | "indisponible" | "non-chargee";
}

const pauseParDefaut = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Délai PostgreSQL accepté pour `lock_timeout` (« 5s », « 500ms », « 2min ») ; autre valeur → défaut. */
export function delaiVerrou(v: string | undefined): string {
  return v && /^\d+(ms|s|min)?$/.test(v.trim()) ? v.trim() : "5s";
}

export async function appliquerSchema(
  pool: Pool,
  sql: string,
  env: Record<string, string | undefined> = process.env,
  journal: (m: string) => void = (m) => console.log(m), // eslint-disable-line no-console
): Promise<ResultatSchema> {
  const client: PoolClient = await pool.connect();
  try {
    // Attente sans limite d'une autre migration (verrou consultatif), puis application journalisée.
    await client.query("SELECT pg_advisory_lock($1)", [VERROU_MIGRATION]);
    try {
      return await appliquerSchemaClient(client, sql, env, journal);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [VERROU_MIGRATION]).catch(() => undefined);
    }
  } finally {
    // La connexion peut revenir au pool de l'API (MIGRATE_ON_START sans identifiant de migration) : réglages remis à
    // leurs valeurs de connexion (délais du pool compris).
    await client.query("RESET ALL").catch(() => undefined);
    client.release();
  }
}

/**
 * Cœur de l'application, sur une connexion qui tient déjà le verrou consultatif `VERROU_MIGRATION` (l'exécuteur des
 * migrations versionnées, `db/schema-migrations.ts`, l'appelle pour la base de départ `init.sql`) : `lock_timeout` court,
 * réessais sur 55P03, extension des statistiques, journal `admin.schema_applications`. Les délais de session sont
 * rétablis à la fin.
 */
export async function appliquerSchemaClient(
  client: PoolClient,
  sql: string,
  env: Record<string, string | undefined> = process.env,
  journal: (m: string) => void = (m) => console.log(m), // eslint-disable-line no-console
  pause: (ms: number) => Promise<void> = pauseParDefaut,
): Promise<ResultatSchema> {
  const empreinte = createHash("sha256").update(sql).digest("hex");
  const max = Math.max(1, entier(env, "MIGRATION_TENTATIVES", 6));
  const debut = Date.now();
  let tentatives = 0;
  try {
    await client.query("SET application_name = 'fadi-migration'");
    await client.query("SET statement_timeout = 0");
    await client.query(`SET lock_timeout = '${delaiVerrou(env["MIGRATION_LOCK_TIMEOUT"])}'`);
    for (;;) {
      tentatives += 1;
      try {
        await client.query(sql);
        break;
      } catch (e) {
        if ((e as { code?: string }).code !== "55P03" || tentatives >= max) throw e;
        const attente = Math.min(30_000, 1000 * 2 ** (tentatives - 1));
        journal(`Migration : table occupée par l'application (essai ${tentatives}/${max}), rien n'est appliqué ; nouvel essai dans ${attente / 1000} s.`);
        await pause(attente);
      }
    }
    const pgss = await activerPgStatStatements(client);
    const dureeMs = Date.now() - debut;
    await client.query(
      "INSERT INTO admin.schema_applications (empreinte, duree_ms, tentatives, role) VALUES ($1, $2, $3, current_user)",
      [empreinte, dureeMs, tentatives],
    );
    return { empreinte, tentatives, dureeMs, pgStatStatements: pgss };
  } finally {
    await client.query("RESET lock_timeout").catch(() => undefined);
    await client.query("RESET statement_timeout").catch(() => undefined);
  }
}

/**
 * Statistiques des requêtes (BD-6) : l'extension `pg_stat_statements` n'est créée que si le serveur charge la bibliothèque
 * (`shared_preload_libraries`, réglé dans les fichiers compose) et si le rôle de migration en a le droit (extension non
 * « trusted ») ; sinon rien n'échoue.
 */
async function activerPgStatStatements(client: PoolClient): Promise<ResultatSchema["pgStatStatements"]> {
  const { rows } = await client.query<{ libs: string }>("SELECT current_setting('shared_preload_libraries') AS libs");
  if (!/\bpg_stat_statements\b/.test(rows[0]?.libs ?? "")) return "non-chargee";
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    return "active";
  } catch {
    return "indisponible";
  }
}
