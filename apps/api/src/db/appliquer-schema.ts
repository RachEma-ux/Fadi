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
 * - chaque application réussie est consignée dans `admin.schema_applications` (empreinte du script, durée, essais) ;
 * - BD-8 (D-7) : connectée en administrateur (super-utilisateur du conteneur), la migration ne fait en administrateur que
 *   l'amorçage (extension de statistiques, lecture des tables de configuration des extensions par `fadi_backup`), puis
 *   applique `init.sql` sous le rôle `fadi_migrator` (`SET ROLE`) : le schéma est écrit sans droit de super-utilisateur et
 *   ses objets appartiennent à `fadi_owner`. Aucun mot de passe supplémentaire n'est nécessaire. Base neuve (rôles absents)
 *   ou refus de droit (42501) : application en administrateur, signalée au journal. `MIGRATION_EN_ADMINISTRATEUR=1` force
 *   l'ancien comportement.
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
  /** Rôle sous lequel `init.sql` a été appliqué (BD-8 : `fadi_migrator` attendu en production). */
  readonly role: string;
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  const empreinte = createHash("sha256").update(sql).digest("hex");
  const max = Math.max(1, entier(env, "MIGRATION_TENTATIVES", 6));
  const client: PoolClient = await pool.connect();
  const debut = Date.now();
  let tentatives = 0;
  try {
    await client.query("SET application_name = 'fadi-migration'");
    await client.query("SET statement_timeout = 0");
    // Attente sans limite d'une autre migration (verrou consultatif), puis délai court pour les verrous de tables.
    await client.query("SELECT pg_advisory_lock($1)", [VERROU_MIGRATION]);
    try {
      const { rows: [moi] } = await client.query<{ su: boolean; migrateur: boolean }>(
        "SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_migrator') AS migrateur");
      let pgss: ResultatSchema["pgStatStatements"] | null = null;
      let roleDdl: string | null = null;
      if (moi?.su && moi.migrateur && env["MIGRATION_EN_ADMINISTRATEUR"] !== "1") {
        pgss = await activerPgStatStatements(client);
        await amorcerSauvegarde(client);
        await client.query("SET ROLE fadi_migrator");
        roleDdl = "fadi_migrator";
      }
      await client.query(`SET lock_timeout = '${delaiVerrou(env["MIGRATION_LOCK_TIMEOUT"])}'`);
      for (;;) {
        tentatives += 1;
        try {
          await client.query(sql);
          break;
        } catch (e) {
          if ((e as { code?: string }).code === "42501" && roleDdl) {
            journal(`Migration : droit refusé au rôle ${roleDdl} (${(e as Error).message}) ; schéma appliqué en administrateur (repli signalé, BD-8).`);
            await client.query("RESET ROLE");
            roleDdl = null;
            tentatives -= 1;
            continue;
          }
          if ((e as { code?: string }).code !== "55P03" || tentatives >= max) throw e;
          const attente = Math.min(30_000, 1000 * 2 ** (tentatives - 1));
          journal(`Migration : table occupée par l'application (essai ${tentatives}/${max}), rien n'est appliqué ; nouvel essai dans ${attente / 1000} s.`);
          await pause(attente);
        }
      }
      await client.query("RESET ROLE");
      if (pgss === null) pgss = await activerPgStatStatements(client);
      const dureeMs = Date.now() - debut;
      const { rows: [r] } = await client.query<{ role: string }>("SELECT coalesce($1::text, current_user) AS role", [roleDdl]);
      await client.query(
        "INSERT INTO admin.schema_applications (empreinte, duree_ms, tentatives, role) VALUES ($1, $2, $3, $4)",
        [empreinte, dureeMs, tentatives, r!.role],
      );
      return { empreinte, tentatives, dureeMs, pgStatStatements: pgss, role: r!.role };
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

/**
 * BD-8 : le rôle de sauvegarde `fadi_backup` (lecture seule, et réplication pour la sauvegarde de base BD-7) doit pouvoir
 * sauvegarder toute la base, y compris les tables de
 * configuration des extensions (PostGIS, topologie…), qui appartiennent au super-utilisateur : lecture accordée ici, en
 * administrateur. Rien n'est fait si le rôle n'existe pas.
 */
async function amorcerSauvegarde(client: PoolClient): Promise<void> {
  await client.query(`DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_backup') THEN RETURN; END IF;
  -- BD-7 : sauvegarde de base quotidienne (pg_basebackup) par ce même rôle, sur le socket local du conteneur.
  IF NOT (SELECT rolreplication FROM pg_roles WHERE rolname = 'fadi_backup') THEN ALTER ROLE fadi_backup REPLICATION; END IF;
  FOR r IN SELECT DISTINCT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO fadi_backup', r.nspname);
  END LOOP;
  FOR r IN SELECT c.oid::regclass AS t FROM pg_extension e CROSS JOIN LATERAL unnest(e.extconfig) AS cfg(oid) JOIN pg_class c ON c.oid = cfg.oid LOOP
    EXECUTE format('GRANT SELECT ON %s TO fadi_backup', r.t);
  END LOOP;
END $$`);
}
