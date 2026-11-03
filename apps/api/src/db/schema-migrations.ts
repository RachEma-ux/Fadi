/**
 * BD-2 (chantier base-donnees, constats M1, M2, M4, S1) : migrations versionnées.
 *
 * Avant : `init.sql` (plus de 4 000 lignes) était rejoué en entier à chaque déploiement, en une transaction, et
 * reprenait des verrous exclusifs sur des dizaines de tables à chaque fois.
 *
 * Désormais :
 * - `init.sql` est la **base de départ** (version `0000`). Il n'est rejoué que si son contenu a changé depuis la
 *   dernière application (empreinte SHA-256 tenue dans `schema_migrations`) ; il est gelé (test), toute évolution
 *   passe par un fichier numéroté.
 * - Les évolutions sont des fichiers `db/migrations/NNNN_nom.sql`, appliqués une seule fois, dans l'ordre, chacun dans
 *   sa transaction, sous `lock_timeout` (relancés sur 55P03 comme la base de départ) et en tant que `fadi_owner` quand ce
 *   rôle existe (propriété et droits par défaut D-7).
 * - Un fichier `NNNN_nom.concurrent.sql` s'exécute hors transaction, instruction par instruction : seul moyen de créer
 *   un index sans bloquer les écritures (`CREATE INDEX CONCURRENTLY`). Un index laissé invalide par un échec est
 *   supprimé avant d'être recréé.
 * - Un fichier déjà appliqué dont le contenu a changé est refusé : on n'édite pas l'histoire, on ajoute un fichier.
 * - Un verrou consultatif (le même que `db/appliquer-schema.ts`, #379) garantit qu'un seul processus migre à la fois.
 * - La base de départ est appliquée par `appliquerSchemaClient` (#379, BD-5) : `MIGRATION_LOCK_TIMEOUT` (5 s), réessais,
 *   journal `admin.schema_applications`, extension `pg_stat_statements` si la bibliothèque est chargée.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { appliquerSchemaClient, type ResultatSchema, VERROU_MIGRATION } from "./appliquer-schema.js";

/** Erreur « verrou non obtenu dans le délai » (lock_timeout, SQLSTATE 55P03). */
export const isLockTimeout = (err: unknown): boolean => (err as { code?: string } | null)?.code === "55P03";

export const VERSION_BASE = "0000";
const MOTIF = /^(\d{4})_([a-z0-9_]+?)(\.concurrent)?\.sql$/;

export interface FichierMigration {
  version: string;
  nom: string;
  fichier: string;
  sql: string;
  empreinte: string;
  sansTransaction: boolean;
}

export const empreinte = (sql: string): string => createHash("sha256").update(sql, "utf8").digest("hex");

/** Fichiers numérotés d'un dossier, triés ; un nom hors convention ou une version en double est une erreur. */
export function lireMigrations(dossier: URL): FichierMigration[] {
  let noms: string[];
  try {
    noms = readdirSync(dossier).filter((n) => n.endsWith(".sql"));
  } catch {
    return [];
  }
  const fichiers = noms.map((fichier) => {
    const m = MOTIF.exec(fichier);
    if (!m) throw new Error(`Migration au nom non conforme : ${fichier} (attendu NNNN_nom.sql ou NNNN_nom.concurrent.sql)`);
    const sql = readFileSync(new URL(fichier, dossier), "utf8");
    return { version: m[1]!, nom: m[2]!, fichier, sql, empreinte: empreinte(sql), sansTransaction: Boolean(m[3]) };
  });
  fichiers.sort((a, b) => a.version.localeCompare(b.version));
  for (let i = 0; i < fichiers.length; i++) {
    if (fichiers[i]!.version === VERSION_BASE) throw new Error(`La version ${VERSION_BASE} est réservée à init.sql : ${fichiers[i]!.fichier}`);
    if (i > 0 && fichiers[i]!.version === fichiers[i - 1]!.version) throw new Error(`Version de migration en double : ${fichiers[i]!.version}`);
  }
  return fichiers;
}

/** Instructions d'un fichier sans transaction : séparées par `;` en fin de ligne, commentaires `--` retirés. */
export function instructions(sql: string): string[] {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Nom de l'index créé par une instruction `CREATE [UNIQUE] INDEX CONCURRENTLY [IF NOT EXISTS] nom`, sinon null. */
export function indexCree(instruction: string): string | null {
  const m = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/i.exec(instruction);
  return m ? m[1]!.replaceAll('"', "") : null;
}

export interface RapportMigration {
  baseAppliquee: boolean;
  appliquees: string[];
  /** Résultat de l'application de la base de départ, quand elle a été (re)jouée. */
  base?: ResultatSchema;
}

interface Options {
  baseSql: string;
  dossier: URL;
  log?: (entree: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
  essais?: number;
  /** Application de la base de départ (par défaut : `appliquerSchemaClient`, lock_timeout, relances et journal). */
  appliquerBase?: (client: PoolClient, sql: string) => Promise<ResultatSchema | void>;
}

async function roleProprietaire(client: PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') AND pg_has_role(current_user, 'fadi_owner', 'MEMBER') AS ok",
  );
  return Boolean(rows[0]?.ok);
}

async function avecRelance<T>(f: () => Promise<T>, o: Options, contexte: string): Promise<T> {
  const essais = Math.max(1, o.essais ?? 4);
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let essai = 1; ; essai++) {
    try {
      return await f();
    } catch (err) {
      if (!isLockTimeout(err) || essai >= essais) throw err;
      const attente = 5_000 * 2 ** (essai - 1);
      o.log?.({ level: "warn", message: `migration ${contexte} : verrou non obtenu (lock_timeout), nouvel essai`, essai, attenteMs: attente });
      await sleep(attente);
    }
  }
}

async function appliquerFichier(client: PoolClient, f: FichierMigration, proprietaire: boolean, o: Options): Promise<void> {
  const debut = Date.now();
  const enregistrer = (q: PoolClient) =>
    q.query("INSERT INTO schema_migrations (version, name, checksum, duration_ms) VALUES ($1, $2, $3, $4)", [f.version, f.nom, f.empreinte, Date.now() - debut]);
  if (!f.sansTransaction) {
    await avecRelance(async () => {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query("SET LOCAL statement_timeout = '10min'");
        if (proprietaire) await client.query("SET LOCAL ROLE fadi_owner");
        await client.query(f.sql);
        await enregistrer(client);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      }
    }, o, f.fichier);
    return;
  }
  // Hors transaction : chaque instruction est validée seule ; un fichier interrompu est repris au début (instructions
  // idempotentes exigées : IF NOT EXISTS / IF EXISTS, vérifié par le contrôle des migrations).
  await client.query("SET lock_timeout = '3s'");
  await client.query("SET statement_timeout = 0");
  if (proprietaire) await client.query("SET ROLE fadi_owner");
  try {
    for (const instruction of instructions(f.sql)) {
      const index = indexCree(instruction);
      if (index) {
        const { rows } = await client.query<{ invalide: boolean }>(
          "SELECT NOT i.indisvalid AS invalide FROM pg_index i WHERE i.indexrelid = to_regclass($1)",
          [index],
        );
        if (rows[0]?.invalide) {
          o.log?.({ level: "warn", message: `migration ${f.fichier} : index invalide ${index} supprimé avant recréation` });
          await avecRelance(() => client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${index}`), o, f.fichier);
        }
      }
      await avecRelance(() => client.query(instruction), o, f.fichier);
    }
    await client.query("RESET ROLE");
    await enregistrer(client);
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    await client.query("RESET lock_timeout").catch(() => undefined);
    await client.query("RESET statement_timeout").catch(() => undefined);
  }
}

/**
 * Amène la base au dernier état : base de départ si nouvelle ou changée, puis migrations numérotées manquantes.
 * Lève sans rien marquer comme appliqué si une étape échoue.
 */
export async function migrer(pool: Pool, o: Options): Promise<RapportMigration> {
  const log = o.log ?? ((e: Record<string, unknown>) => console.log(JSON.stringify(e))); // eslint-disable-line no-console
  const opts = { ...o, log };
  const fichiers = lireMigrations(o.dossier);
  const client = await pool.connect();
  const rapport: RapportMigration = { baseAppliquee: false, appliquees: [] };
  try {
    await client.query("SELECT pg_advisory_lock($1)", [VERROU_MIGRATION]);
    try {
      const existe = (await client.query<{ t: string | null }>("SELECT to_regclass('public.schema_migrations')::text AS t")).rows[0]?.t;
      const faites = new Map<string, string>();
      if (existe) {
        for (const r of (await client.query<{ version: string; checksum: string }>("SELECT version, checksum FROM schema_migrations")).rows) faites.set(r.version, r.checksum);
      }
      const empreinteBase = empreinte(o.baseSql);
      if (faites.get(VERSION_BASE) !== empreinteBase) {
        log({ level: "info", message: faites.has(VERSION_BASE) ? "migration : init.sql a changé, base de départ rejouée" : "migration : base de départ (init.sql) appliquée" });
        const base = await (o.appliquerBase ?? ((c: PoolClient, sql: string) =>
          appliquerSchemaClient(c, sql, process.env, (m) => log({ level: "warn", message: m }), o.sleep)))(client, o.baseSql);
        if (base) rapport.base = base;
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, 'init', $2)
           ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
          [VERSION_BASE, empreinteBase],
        );
        rapport.baseAppliquee = true;
      }
      for (const f of fichiers) {
        const deja = faites.get(f.version);
        if (deja !== undefined) {
          if (deja !== f.empreinte) throw new Error(`Migration ${f.fichier} déjà appliquée mais modifiée depuis (empreinte différente) : ne pas modifier une migration appliquée, en ajouter une nouvelle.`);
          continue;
        }
        const proprietaire = await roleProprietaire(client);
        const debut = Date.now();
        await appliquerFichier(client, f, proprietaire, opts);
        log({ level: "info", message: `migration appliquée : ${f.fichier}`, dureeMs: Date.now() - debut });
        rapport.appliquees.push(f.fichier);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [VERROU_MIGRATION]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
  return rapport;
}
