#!/usr/bin/env node
/**
 * Amorçage d'un administrateur de la plateforme (docs/workstreams/users-management, phase 3).
 *
 *   DATABASE_URL=… node apps/api/scripts/create-admin.mjs <adresse e-mail>
 *
 * - Compte existant et actif : promu administrateur (sessions fermées : la suivante suit les limites administrateur),
 *   action journalisée (`admin.user.promoted_by_script`).
 * - Aucun compte : une invitation d'amorçage (7 jours) qui donnera le rôle administrateur à l'activation est déposée
 *   dans la file de courriels ; le serveur l'envoie (MAIL_TRANSPORT). Le lien n'est **jamais** affiché ici.
 * Le script n'affiche aucun secret (ni jeton, ni lien, ni chaîne de connexion). L'administrateur devra activer la
 * double authentification avant d'accéder à /admin (D-6).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  console.error('usage : node apps/api/scripts/create-admin.mjs <adresse e-mail>');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL non défini.');
  process.exit(2);
}
const publicUrl = (process.env.APP_PUBLIC_URL ?? process.env.WEB_ORIGIN?.split(',')[0] ?? '').trim().replace(/\/$/, '');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query('SELECT id, status, platform_role, deletion_requested_at FROM users WHERE email = $1 FOR UPDATE', [email]);
  const user = rows[0];
  if (user) {
    if (user.status !== 'active' || user.deletion_requested_at) {
      await client.query('ROLLBACK');
      console.error(`Refus : le compte n'est pas actif (${user.deletion_requested_at ? 'suppression programmée' : user.status}).`);
      process.exit(1);
    }
    if (user.platform_role === 'admin') {
      await client.query('ROLLBACK');
      console.log('Ce compte est déjà administrateur : rien à faire.');
      process.exit(0);
    }
    await client.query("UPDATE users SET platform_role = 'admin' WHERE id = $1", [user.id]);
    await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
    await client.query("INSERT INTO admin.audit_log (actor_id, action, target_type, target_id, metadata) VALUES (NULL, 'admin.user.promoted_by_script', 'user', $1, '{}'::jsonb)", [user.id]);
    await client.query('COMMIT');
    console.log(`Compte ${user.id} promu administrateur. Étape suivante : se reconnecter et activer la double authentification (Mon compte).`);
  } else {
    if (!publicUrl) {
      await client.query('ROLLBACK');
      console.error('APP_PUBLIC_URL (ou WEB_ORIGIN) est requis pour construire le lien d\'invitation.');
      process.exit(2);
    }
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await client.query("UPDATE auth.invitations SET status = 'cancelled', responded_at = now() WHERE email = $1 AND purpose = 'platform_account' AND status = 'pending'", [email]);
    const id = `inv_${randomUUID()}`;
    await client.query("INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, grant_platform_role, expires_at) VALUES ($1, 'platform_account', $2, $3, NULL, 'admin', $4)", [id, email, hash, expires]);
    await client.query("INSERT INTO admin.audit_log (actor_id, action, target_type, target_id, metadata) VALUES (NULL, 'invitation.created', 'invitation', $1, $2)", [id, JSON.stringify({ purpose: 'platform_account', grantPlatformRole: 'admin', by: 'create-admin.mjs' })]);
    const link = `${publicUrl}/compte/invitation#jeton=${encodeURIComponent(token)}`;
    const expiresAt = expires.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    await client.query("INSERT INTO admin.mail_outbox (id, to_address, template, locale, payload) VALUES ($1, $2, 'invitation', 'fr', $3)", [`mail_${randomUUID()}`, email, JSON.stringify({ link, expiresAt })]);
    await client.query('COMMIT');
    console.log(`Aucun compte pour cette adresse : invitation administrateur ${id} déposée dans la file de courriels (valable 7 jours).`);
    console.log('Le serveur l\'envoie si MAIL_TRANSPORT est configuré ; sinon, créez le compte par l\'inscription puis relancez ce script pour le promouvoir.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`Échec : ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}
