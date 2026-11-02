import type { Pool } from "pg";

/** Un pool ou un client (`PoolClient`) : seule `query` sert. */
export type Requeteur = Pick<Pool, "query">;

/**
 * BD-1.1 (chantier base-donnees, constats S1 / M2) : application d'`init.sql` sans geler le trafic.
 *
 * `init.sql` s'exécute en une seule transaction implicite et reprend des verrous exclusifs sur des tables chaudes
 * (`users`, `sessions`, `projects`…). Son en-tête fixe `lock_timeout` : si une transaction applicative longue tient un
 * verrou, la migration échoue vite (code 55P03) au lieu de mettre en file toutes les requêtes derrière elle. Comme tout
 * est annulé à l'échec, on peut relancer sans risque : quelques essais espacés, après avoir laissé finir les
 * transactions longues en cours.
 */

export interface ApplySchemaOptions {
  /** Nombre total d'essais (défaut 4). */
  attempts?: number;
  /** Attente avant le n-ième nouvel essai, en ms (défaut 5 s, 10 s, 20 s). */
  backoffMs?: (attempt: number) => number;
  /** Âge au-delà duquel une transaction en cours est signalée et attendue avant de migrer (défaut 60 s). */
  longTransactionSeconds?: number;
  log?: (entry: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
}

const LOCK_NOT_AVAILABLE = "55P03";

const defaultLog = (entry: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
};

export function isLockTimeout(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === LOCK_NOT_AVAILABLE;
}

/** Transactions ouvertes depuis plus de `seconds` sur la base courante (hors la session qui pose la question). */
export async function longTransactions(pool: Requeteur, seconds: number): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND xact_start IS NOT NULL AND xact_start < now() - make_interval(secs => $1)`,
    [seconds],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function applySchema(pool: Requeteur, sql: string, options: ApplySchemaOptions = {}): Promise<{ attempts: number }> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const backoff = options.backoffMs ?? ((n: number) => 5_000 * 2 ** (n - 1));
  const log = options.log ?? defaultLog;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const longSeconds = options.longTransactionSeconds ?? 60;

  for (let attempt = 1; ; attempt += 1) {
    try {
      // pg_stat_activity ne montre les autres sessions qu'aux rôles qui en ont le droit : une erreur ici n'empêche pas de migrer.
      const longues = await longTransactions(pool, longSeconds).catch(() => 0);
      if (longues > 0) log({ level: "warn", message: "migration: transactions longues en cours", count: longues, attempt });
      await pool.query(sql);
      return { attempts: attempt };
    } catch (err) {
      if (!isLockTimeout(err) || attempt >= attempts) throw err;
      const wait = backoff(attempt);
      log({ level: "warn", message: "migration: verrou non obtenu dans le délai (lock_timeout), nouvel essai", attempt, waitMs: wait });
      await sleep(wait);
    }
  }
}
