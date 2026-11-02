import type { PoolConfig } from "pg";

/** Entier positif lu dans l'environnement (0 admis : désactive le délai) ; valeur absente ou invalide → défaut. */
export function entier(env: Record<string, string | undefined>, cle: string, defaut: number): number {
  const v = env[cle];
  if (v === undefined || v.trim() === "") return defaut;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : defaut;
}

/**
 * Réglages du pool de l'API (chantier bases-de-donnees, BD-1). Sans eux, une requête ou une transaction restée ouverte
 * n'était jamais interrompue et l'attente d'une connexion libre était illimitée.
 * - `DB_POOL_MAX` (10) : connexions simultanées au plus ;
 * - `DB_STATEMENT_TIMEOUT_MS` (120 000) : durée maximale d'une instruction, appliquée par le serveur (0 = aucune) ;
 * - `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (120 000) : transaction ouverte et inactive fermée par le serveur (0 = aucune) ;
 * - `DB_CONNECTION_TIMEOUT_MS` (10 000) : attente maximale d'une connexion libre du pool ;
 * - `DB_IDLE_TIMEOUT_MS` (30 000) : une connexion inactive est rendue au serveur.
 * Les imports GeoData de référence tournent dans un processus séparé (`geodata-reference`) avec leurs propres connexions.
 */
export function optionsPool(connectionString: string, env: Record<string, string | undefined> = process.env): PoolConfig {
  return {
    connectionString,
    application_name: env["DB_APPLICATION_NAME"] || "fadi-api",
    max: Math.max(1, entier(env, "DB_POOL_MAX", 10)),
    idleTimeoutMillis: entier(env, "DB_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: entier(env, "DB_CONNECTION_TIMEOUT_MS", 10_000),
    statement_timeout: entier(env, "DB_STATEMENT_TIMEOUT_MS", 120_000),
    idle_in_transaction_session_timeout: entier(env, "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", 120_000),
  };
}
