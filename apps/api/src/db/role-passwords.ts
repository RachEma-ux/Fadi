/**
 * D-7 : mots de passe des rôles PostgreSQL au moindre privilège, lus dans l'environnement du serveur (jamais dans le
 * dépôt, jamais journalisés) et appliqués après la migration par un rôle qui en a le droit (super-utilisateur ou
 * CREATEROLE). Variable absente : rôle inchangé.
 *   FADI_APP_DB_PASSWORD → fadi_app · FADI_MIGRATOR_DB_PASSWORD → fadi_migrator
 *   FADI_RETENTION_DB_PASSWORD → fadi_retention · FADI_BACKUP_DB_PASSWORD → fadi_backup
 */
import type { Pool } from "pg";

export const ROLE_PASSWORD_ENV: Readonly<Record<string, string>> = Object.freeze({
  fadi_app: "FADI_APP_DB_PASSWORD",
  fadi_migrator: "FADI_MIGRATOR_DB_PASSWORD",
  fadi_retention: "FADI_RETENTION_DB_PASSWORD",
  fadi_backup: "FADI_BACKUP_DB_PASSWORD",
});

/** Applique les mots de passe fournis ; renvoie les rôles mis à jour (noms seulement). */
export async function applyRolePasswords(pool: Pick<Pool, "query">, env: Record<string, string | undefined> = process.env): Promise<string[]> {
  const wanted = Object.entries(ROLE_PASSWORD_ENV).filter(([, key]) => !!env[key]);
  if (!wanted.length) return [];
  const { rows } = await pool.query("SELECT (rolsuper OR rolcreaterole) AS can FROM pg_roles WHERE rolname = session_user");
  if (!(rows[0] as { can?: boolean } | undefined)?.can) return [];
  const done: string[] = [];
  for (const [role, key] of wanted) {
    const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (!exists.rows.length) continue;
    // `format(%I, %L)` côté serveur : nom et valeur correctement cités, aucune concaténation côté client.
    const { rows: stmt } = await pool.query("SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql", [role, env[key]]);
    await pool.query((stmt[0] as { sql: string }).sql);
    done.push(role);
  }
  return done;
}
