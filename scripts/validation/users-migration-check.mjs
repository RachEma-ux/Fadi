/**
 * Gestion des comptes — Phase 1 : contrôle du schéma sur une base réelle jetable (CI `validate`, après `db:migrate`).
 *
 *   DATABASE_URL=… node scripts/validation/users-migration-check.mjs
 *
 * 1. rejoue `init.sql` deux fois de suite (idempotence) ;
 * 2. un compte créé avec les seules colonnes historiques reste `active` / `user` (aucun comportement modifié) ;
 * 3. les contraintes CHECK refusent les valeurs invalides ;
 * 4. UPDATE et DELETE sur `audit_log` sont refusés ;
 * 5. une session au format historique (jeton brut en clé) est convertie en empreinte au rejeu.
 * Tout se passe dans des transactions annulées (ROLLBACK) : la base n'est pas modifiée au-delà du schéma.
 * Refuse de tourner si l'URL ne désigne pas une base locale (127.0.0.1 / localhost) : jamais la production.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error('Refus : DATABASE_URL doit désigner une base locale jetable.');
  process.exit(2);
}
const sql = readFileSync(new URL('../../apps/api/src/db/init.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
let failures = 0;
const ok = (m) => console.log('✓ ' + m);
const ko = (m) => { failures++; console.log('❌ ' + m); };

async function rejects(label, query, params = []) {
  await client.query('BEGIN');
  try { await client.query(query, params); ko(`${label} : accepté à tort`); }
  catch { ok(`${label} : refusé`); }
  finally { await client.query('ROLLBACK'); }
}

try {
  await client.query(sql); await client.query(sql);
  ok('init.sql rejoué deux fois sans erreur');

  await client.query('BEGIN');
  await client.query("INSERT INTO users (id, email, password_hash) VALUES ('um_check_legacy', 'um-check-legacy@invalid', 'x')");
  const { rows } = await client.query("SELECT status, platform_role, failed_login_count, organization_id FROM users WHERE id = 'um_check_legacy'");
  const r = rows[0];
  if (r.status === 'active' && r.platform_role === 'user' && r.failed_login_count === 0 && r.organization_id === null) ok('compte historique : active / user');
  else ko('compte historique : défauts inattendus ' + JSON.stringify(r));
  await client.query("INSERT INTO sessions (id, user_id, expires_at, token_hash) VALUES ('legacy-raw-token', 'um_check_legacy', now() + interval '1 day', NULL)");
  await client.query(sql);
  const s = await client.query("SELECT id, token_hash = encode(sha256('legacy-raw-token'::bytea), 'hex') AS hashed FROM sessions WHERE user_id = 'um_check_legacy'");
  if (s.rows.length === 1 && s.rows[0].hashed && s.rows[0].id !== 'legacy-raw-token') ok('session historique : jeton remplacé par son empreinte');
  else ko('session historique non convertie');
  await client.query('ROLLBACK');

  await rejects('users.status invalide', "INSERT INTO users (id, email, password_hash, status) VALUES ('um_c1', 'um-c1@invalid', 'x', 'invited')");
  await rejects('users.platform_role invalide', "INSERT INTO users (id, email, password_hash, platform_role) VALUES ('um_c2', 'um-c2@invalid', 'x', 'root')");
  await rejects('invitations.status invalide', "INSERT INTO users (id, email, password_hash) VALUES ('um_c3', 'um-c3@invalid', 'x'); INSERT INTO invitations (id, purpose, email, token_hash, invited_by, status, expires_at) VALUES ('i1', 'platform_account', 'x@invalid', 'h', 'um_c3', 'open', now())");
  await rejects('invitation projet sans projet', "INSERT INTO users (id, email, password_hash) VALUES ('um_c4', 'um-c4@invalid', 'x'); INSERT INTO invitations (id, purpose, email, token_hash, invited_by, expires_at) VALUES ('i2', 'project_participation', 'x@invalid', 'h', 'um_c4', now())");
  await rejects('account_tokens.purpose invalide', "INSERT INTO users (id, email, password_hash) VALUES ('um_c5', 'um-c5@invalid', 'x'); INSERT INTO account_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ('t1', 'um_c5', 'invite', 'h', now())");
  await rejects('accès support > 72 h', "INSERT INTO users (id, email, password_hash) VALUES ('um_c6', 'um-c6@invalid', 'x'); INSERT INTO projects (id, owner_id, code, name) VALUES ('um_p6', 'um_c6', 'C', 'N'); INSERT INTO project_support_grants (id, project_id, admin_id, granted_by, purpose, granted_at, expires_at) VALUES ('g1', 'um_p6', 'um_c6', 'um_c6', 'diagnostic', now(), now() + interval '73 hours')");
  await rejects('mail_outbox.status invalide', "INSERT INTO mail_outbox (id, to_address, template, status) VALUES ('m1', 'x@invalid', 'invitation', 'queued')");

  await client.query('BEGIN');
  const a = await client.query("INSERT INTO audit_log (actor_id, action) VALUES ('um_check', 'auth.login.succeeded') RETURNING id");
  await client.query('SAVEPOINT s');
  try { await client.query('UPDATE audit_log SET action = $1 WHERE id = $2', ['x', a.rows[0].id]); ko('audit_log UPDATE accepté'); }
  catch { ok('audit_log UPDATE refusé'); await client.query('ROLLBACK TO SAVEPOINT s'); }
  try { await client.query('DELETE FROM audit_log WHERE id = $1', [a.rows[0].id]); ko('audit_log DELETE accepté'); }
  catch { ok('audit_log DELETE refusé'); }
  await client.query('ROLLBACK');
} finally {
  await client.end();
}
if (failures) { console.error(`${failures} contrôle(s) en échec`); process.exit(1); }
console.log('✅ schéma Gestion des comptes vérifié');
