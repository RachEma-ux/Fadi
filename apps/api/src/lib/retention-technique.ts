/**
 * BD-6.1 (chantier base-donnees, constats M16, S7, Q14) : purge des données techniques devenues inutiles.
 *
 * Sans cette tâche, rien n'effaçait les sessions expirées ou révoquées (adresse IP et navigateur compris), les jetons de
 * compte expirés ou utilisés, ni les lignes de la file de courriels déjà traitées (adresse du destinataire).
 *
 * Durée de conservation : **30 jours** pour les trois catégories, décision du maître d'ouvrage D-BD-11 (2 novembre 2026,
 * à reporter au registre de traitement). Chaque durée peut être changée par variable d'environnement, ou la purge
 * désactivée par la valeur `desactive` :
 *   FADI_RETENTION_SESSIONS_JOURS   jours après l'expiration (ou la révocation) d'une session
 *   FADI_RETENTION_JETONS_JOURS     jours après l'expiration (ou l'usage) d'un jeton de compte
 *   FADI_RETENTION_COURRIELS_JOURS  jours après la création d'un courriel envoyé, échoué ou non envoyé (2 au minimum :
 *                                   le quota glissant de 24 h compte les courriels envoyés)
 * Suppression par lots de 5 000 lignes, sous verrou consultatif (une seule instance à la fois).
 */
import type { Pool } from "pg";

export interface ConfigRetention {
  sessionsJours: number | null;
  jetonsJours: number | null;
  courrielsJours: number | null;
}

/** D-BD-11 : durée de conservation par défaut, en jours. */
export const DUREE_RETENTION_JOURS = 30;

function jours(env: NodeJS.ProcessEnv, nom: string, minimum: number): number | null {
  const brut = env[nom];
  if (brut === undefined || brut.trim() === "") return DUREE_RETENTION_JOURS;
  if (brut.trim() === "desactive") return null;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < minimum) throw new Error(`${nom} doit être un nombre entier de jours, au moins ${minimum} (reçu : ${brut}).`);
  return n;
}

export function configRetention(env: NodeJS.ProcessEnv = process.env): ConfigRetention {
  return {
    sessionsJours: jours(env, "FADI_RETENTION_SESSIONS_JOURS", 1),
    jetonsJours: jours(env, "FADI_RETENTION_JETONS_JOURS", 1),
    courrielsJours: jours(env, "FADI_RETENTION_COURRIELS_JOURS", 2),
  };
}

export const retentionActive = (c: ConfigRetention) => c.sessionsJours !== null || c.jetonsJours !== null || c.courrielsJours !== null;

const LOT = 5_000;

/** Requêtes de purge (une par catégorie), paramètre $1 = jours, $2 = taille de lot. */
export const PURGES = {
  sessions: `DELETE FROM sessions WHERE id IN (
      SELECT id FROM sessions
       WHERE greatest(expires_at, coalesce(absolute_expires_at, expires_at)) < now() - make_interval(days => $1)
          OR revoked_at < now() - make_interval(days => $1)
       LIMIT $2)`,
  jetons: `DELETE FROM auth.account_tokens WHERE id IN (
      SELECT id FROM auth.account_tokens
       WHERE expires_at < now() - make_interval(days => $1) OR used_at < now() - make_interval(days => $1)
       LIMIT $2)`,
  courriels: `DELETE FROM admin.mail_outbox WHERE id IN (
      SELECT id FROM admin.mail_outbox
       WHERE status IN ('sent', 'failed', 'skipped') AND created_at < now() - make_interval(days => $1)
       LIMIT $2)`,
} as const;

export interface BilanRetention { sessions: number; jetons: number; courriels: number; ignore?: "verrou-occupe" }

export async function runRetentionTechnique(pool: Pool, config: ConfigRetention = configRetention()): Promise<BilanRetention> {
  const bilan: BilanRetention = { sessions: 0, jetons: 0, courriels: 0 };
  if (!retentionActive(config)) return bilan;
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtext('fadi:retention-technique')) AS ok");
    if (!rows[0]?.ok) return { ...bilan, ignore: "verrou-occupe" };
    try {
      for (const [cle, duree] of [["sessions", config.sessionsJours], ["jetons", config.jetonsJours], ["courriels", config.courrielsJours]] as const) {
        if (duree === null) continue;
        for (;;) {
          const r = await client.query(PURGES[cle], [duree, LOT]);
          bilan[cle] += r.rowCount ?? 0;
          if ((r.rowCount ?? 0) < LOT) break;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('fadi:retention-technique'))").catch(() => undefined);
    }
  } finally {
    client.release();
  }
  return bilan;
}
