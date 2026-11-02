import type { PoolConfig } from "pg";

function entier(env: NodeJS.ProcessEnv, nom: string, defaut: number): number {
  const brut = env[nom];
  if (brut === undefined || brut === "") return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nom} doit être un entier positif ou nul (reçu : ${brut}).`);
  return n;
}

/**
 * BD-1.2 (chantier base-donnees, constat Q1) : délais bornés pour le pool de l'API.
 * - `connectionTimeoutMillis` : une requête qui n'obtient pas de connexion échoue au lieu d'attendre sans limite ;
 * - `statement_timeout` : une requête pathologique est interrompue par le serveur (les traitements longs légitimes
 *   relèvent leur délai localement avec `SET LOCAL statement_timeout`) ;
 * - `idle_in_transaction_session_timeout` : une transaction oubliée ouverte est fermée par le serveur ;
 * - `application_name` : distingue l'API, la migration et les scripts dans `pg_stat_activity`.
 * Valeur 0 = pas de délai (comportement antérieur), pour un retour arrière sans nouvelle image.
 */
export function applicationPoolConfig(connectionString: string, env: NodeJS.ProcessEnv = process.env): PoolConfig {
  return {
    connectionString,
    max: entier(env, "PG_POOL_MAX", 10),
    idleTimeoutMillis: entier(env, "PG_POOL_IDLE_MS", 30_000),
    connectionTimeoutMillis: entier(env, "PG_CONNECTION_TIMEOUT_MS", 10_000),
    statement_timeout: entier(env, "PG_STATEMENT_TIMEOUT_MS", 60_000),
    idle_in_transaction_session_timeout: entier(env, "PG_IDLE_IN_TRANSACTION_MS", 60_000),
    application_name: env["PG_APP_NAME"] || "fadi-api",
  };
}
