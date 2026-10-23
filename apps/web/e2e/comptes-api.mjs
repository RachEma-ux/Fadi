/**
 * Recette de la gestion des comptes par l'API réelle (docs/workstreams/users-management, phases 1 à 4) — sans navigateur.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://… MAILPIT_URL=http://localhost:8025 node apps/web/e2e/comptes-api.mjs
 *
 * L'API doit tourner avec FADI_ADMIN_ENABLED=true, FADI_ENCRYPTION_KEY défini, un transport de courriel : Mailpit
 * (`MAILPIT_URL`, liens lus par son API HTTP) ou `MAIL_TRANSPORT=console` avec `API_LOG` (journal de l'API). La base
 * (`DATABASE_URL`, **locale et jetable** — refus sinon) sert à l'horloge simulée : invitation et accès support périmés,
 * suppression datée de 31 jours, quota de courriels rempli. Chaque compte est unique au passage (adresses aléatoires).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const MAILPIT = process.env.MAILPIT_URL?.replace(/\/$/, '');
const API_LOG = process.env.API_LOG;
const dbUrl = process.env.DATABASE_URL ?? '';
if (!['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)) throw new Error('DATABASE_URL doit désigner une base locale jetable');
const sql = new pg.Client({ connectionString: dbUrl });
await sql.connect();

let failures = 0;
const check = (label, ok, detail) => {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.log(`❌ ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`); }
};
const uid = () => randomUUID().replaceAll('-', '').slice(0, 12);
const mail = (tag) => `comptes-${tag}-${uid()}@example.test`;
const strong = () => `phrase-de-passe-${uid()}`;

/** Un client HTTP avec son propre cookie (un « navigateur »). */
function agent() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
    async call(method, path, body, headers = {}) {
      const res = await fetch(BASE + path, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const [name, value] = pair.split('=');
        if (name === 'fadi_session') continue;
        cookie = value ? `${name}=${value}` : (cookie.startsWith(`${name}=`) ? '' : cookie);
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { status: res.status, body: json };
    },
  };
}

// --- TOTP (RFC 6238) pour la recette -------------------------------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  let bits = 0, value = 0; const out = [];
  for (const ch of s.replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, '0');
}
const step = () => Math.floor(Date.now() / 30000);

// --- Courriels ------------------------------------------------------------------------------------------------------
async function lastLink(to, pathPart) {
  for (let i = 0; i < 40; i++) {
    let text = '';
    if (MAILPIT) {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
      const msg = list.messages?.[0];
      if (msg) text = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()).Text ?? '';
    } else if (API_LOG) {
      text = readFileSync(API_LOG, 'utf8').split('\n').filter((l) => l.includes(`"to":"${to}"`)).map((l) => { try { return JSON.parse(l).text; } catch { return ''; } }).join('\n');
    }
    const links = [...text.matchAll(/https?:\/\/\S+#jeton=([A-Za-z0-9_%-]+)/g)].filter((m) => m[0].includes(pathPart));
    if (links.length) return decodeURIComponent(links[links.length - 1][1]);
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
async function mailCount(to, atLeast) {
  for (let i = 0; i < 30; i++) {
    const n = await mailCountOnce(to);
    if (n >= atLeast) return n;
    await new Promise((r) => setTimeout(r, 500));
  }
  return mailCountOnce(to);
}
async function mailCountOnce(to) {
  if (MAILPIT) return (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()).messages_count ?? 0;
  return readFileSync(API_LOG, 'utf8').split('\n').filter((l) => l.includes(`"to":"${to}"`)).length;
}

try {
  // ===== Phase 2 — politique de mot de passe, connexion, anti-abus =====
  const A = agent();
  const aEmail = mail('a'), aPass = strong();
  check('mot de passe de 11 caractères refusé', (await A.call('POST', '/auth/register', { email: aEmail, password: 'abcdefghijk' })).body?.reason === 'too_short');
  check('mot de passe compromis refusé', (await A.call('POST', '/auth/register', { email: aEmail, password: 'password1234' })).body?.reason === 'common');
  const reg = await A.call('POST', '/auth/register', { email: aEmail, password: aPass });
  check('inscription avec 12 caractères ou plus', reg.status === 201 && reg.body.platformRole === 'user' && reg.body.emailVerified === false, reg);
  const verifyToken = await lastLink(aEmail, '/compte/verifier-email');
  check('courriel de vérification reçu', !!verifyToken);
  check('adresse vérifiée par le lien', (await A.call('POST', '/auth/verify-email/confirm', { token: verifyToken })).body?.verified === true);
  check('lien de vérification à usage unique', (await A.call('POST', '/auth/verify-email/confirm', { token: verifyToken })).status === 400);
  check('/auth/me : adresse vérifiée', (await A.call('GET', '/auth/me')).body?.emailVerified === true);

  const { rows: [{ token_hash: th, n }] } = await sql.query("SELECT max(token_hash) AS token_hash, count(*)::int AS n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1", [aEmail]);
  const rawCookie = A.cookie.split('=')[1];
  check('jeton de session jamais stocké en clair', n >= 1 && th && !th.includes(rawCookie) && (await sql.query('SELECT count(*)::int AS c FROM sessions WHERE id = $1 OR token_hash = $1', [rawCookie])).rows[0].c === 0);
  const { rows: [{ password_hash: ph }] } = await sql.query('SELECT password_hash FROM users WHERE email = $1', [aEmail]);
  check('mot de passe haché en Argon2id (19 MiB, t=2, p=1)', ph.startsWith('$argon2id$v=19$m=19456,t=2,p=1$') && !ph.includes(aPass));

  const X = agent();
  const unknown = await X.call('POST', '/auth/login', { email: mail('inconnu'), password: aPass });
  const wrong = await X.call('POST', '/auth/login', { email: aEmail, password: 'mauvais-mot-de-passe' });
  check('réponse identique : compte inconnu / mauvais mot de passe', unknown.status === 401 && wrong.status === 401 && JSON.stringify(unknown.body) === JSON.stringify(wrong.body), { unknown, wrong });

  const L = agent(), lEmail = mail('verrou'), lPass = strong();
  await L.call('POST', '/auth/register', { email: lEmail, password: lPass });
  for (let i = 0; i < 5; i++) await X.call('POST', '/auth/login', { email: lEmail, password: `faux-${i}-mot-de-passe` });
  const lockedLogin = await X.call('POST', '/auth/login', { email: lEmail, password: lPass });
  check('verrouillage progressif après 5 échecs (même réponse, même avec le bon mot de passe)', lockedLogin.status === 401 && lockedLogin.body?.error === 'invalid_credentials', lockedLogin);
  const lockRow = (await sql.query('SELECT failed_login_count, locked_until > now() AS locked FROM users WHERE email = $1', [lEmail])).rows[0];
  check('compteur d\'échecs et verrou posés', lockRow.failed_login_count === 5 && lockRow.locked === true, lockRow);

  const csrf = await A.call('POST', '/auth/me/password', { currentPassword: aPass, newPassword: strong() }, { origin: 'https://attaquant.example' });
  check('CSRF : origine étrangère refusée', csrf.status === 403 && csrf.body?.error === 'csrf_refused', csrf);
  const csrf2 = await A.call('PATCH', '/auth/me', { displayName: 'A' }, { 'sec-fetch-site': 'cross-site' });
  check('CSRF : Sec-Fetch-Site cross-site refusé', csrf2.status === 403, csrf2);

  // Changement de mot de passe : les autres sessions tombent, la courante reste.
  const A2 = agent();
  check('seconde session de A', (await A2.call('POST', '/auth/login', { email: aEmail, password: aPass })).status === 200);
  const aPass2 = strong();
  const changed = await A.call('POST', '/auth/me/password', { currentPassword: aPass, newPassword: aPass2 });
  check('changement de mot de passe', changed.status === 200 && changed.body.revokedSessions >= 1, changed);
  check('autre session révoquée (401)', (await A2.call('GET', '/auth/me')).status === 401);
  check('session courante conservée', (await A.call('GET', '/auth/me')).status === 200);

  // Sessions : liste, « déconnecter les autres ».
  const A3 = agent();
  await A3.call('POST', '/auth/login', { email: aEmail, password: aPass2 });
  const list = await A.call('GET', '/auth/me/sessions');
  check('sessions ouvertes listées, courante marquée', list.body?.sessions?.length >= 2 && list.body.sessions.filter((s) => s.current).length === 1, list);
  check('déconnecter les autres', (await A.call('DELETE', '/auth/me/sessions')).body?.revoked >= 1 && (await A3.call('GET', '/auth/me')).status === 401);

  // ===== Phase 3 — administrateur =====
  const B = agent(), bEmail = mail('admin'), bPass = strong();
  await B.call('POST', '/auth/register', { email: bEmail, password: bPass });
  check('non-admin : /admin/users → 404', (await A.call('GET', '/admin/users')).status === 404);
  check('anonyme : /admin/users → 404', (await X.call('GET', '/admin/users')).status === 404);
  const out = execFileSync('node', ['apps/api/scripts/create-admin.mjs', bEmail], { env: { ...process.env }, encoding: 'utf8' });
  check('create-admin.mjs promeut un compte existant sans afficher de secret', /promu administrateur/.test(out) && !out.includes(bPass), out);
  check('promotion : sessions fermées', (await B.call('GET', '/auth/me')).status === 401);
  const bLogin = await B.call('POST', '/auth/login', { email: bEmail, password: bPass });
  check('admin sans double authentification : connexion simple', bLogin.status === 200 && bLogin.body.platformRole === 'admin');
  const noMfa = await B.call('GET', '/admin/users');
  check('admin sans TOTP : /admin refusé (mfa_required)', noMfa.status === 403 && noMfa.body?.error === 'mfa_required', noMfa);
  const setup = await B.call('POST', '/auth/me/mfa/setup');
  check('enrôlement TOTP : QR code et secret', setup.status === 200 && setup.body.qrSvg?.includes('<svg') && /^otpauth:\/\/totp\//.test(setup.body.otpauthUri), setup.status);
  const secret = setup.body.secret;
  const { rows: [{ totp_secret_enc: enc }] } = await sql.query('SELECT totp_secret_enc FROM users WHERE email = $1', [bEmail]);
  check('secret TOTP chiffré en base', enc.startsWith('v1.') && !enc.includes(secret));
  check('code faux refusé à l\'activation', (await B.call('POST', '/auth/me/mfa/enable', { code: '000000' })).status === 400);
  const s0 = step();
  const enabled = await B.call('POST', '/auth/me/mfa/enable', { code: totp(secret, s0) });
  check('TOTP activé, 10 codes de secours', enabled.status === 200 && enabled.body.recoveryCodes?.length === 10, enabled);
  const recovery = enabled.body.recoveryCodes;
  check('codes de secours hachés en base', (await sql.query('SELECT count(*)::int AS c FROM auth.user_recovery_codes r JOIN users u ON u.id = r.user_id WHERE u.email = $1 AND r.code_hash = ANY($2)', [bEmail, recovery.map((c) => c.replace('-', ''))])).rows[0].c === 0);
  check('administration accessible avec TOTP', (await B.call('GET', '/admin/users')).status === 200);
  await B.call('POST', '/auth/logout');
  const step1 = await B.call('POST', '/auth/login', { email: bEmail, password: bPass });
  check('connexion en 2 étapes : 202 mfaRequired', step1.status === 202 && step1.body.mfaRequired === true, step1);
  check('étape partielle : pas encore authentifié', (await B.call('GET', '/auth/me')).status === 401);
  const replay = await B.call('POST', '/auth/login/mfa', { code: totp(secret, s0) });
  check('rejeu du même code refusé', replay.status === 401, replay);
  const viaRecovery = await B.call('POST', '/auth/login/mfa', { recoveryCode: recovery[0] });
  check('code de secours accepté', viaRecovery.status === 200, viaRecovery);
  await B.call('POST', '/auth/logout');
  await B.call('POST', '/auth/login', { email: bEmail, password: bPass });
  check('code de secours à usage unique', (await B.call('POST', '/auth/login/mfa', { recoveryCode: recovery[0] })).status === 401);
  const next = Math.max(step(), s0 + 1);
  const viaTotp = await B.call('POST', '/auth/login/mfa', { code: totp(secret, next) });
  check('connexion par TOTP', viaTotp.status === 200, viaTotp);
  const bSession = (await sql.query('SELECT extract(epoch FROM s.absolute_expires_at - s.created_at)::int AS d FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1 AND s.revoked_at IS NULL AND NOT s.mfa_pending ORDER BY s.created_at DESC LIMIT 1', [bEmail])).rows[0];
  check('session administrateur plafonnée à 24 h', bSession?.d === 86400, bSession);

  const users = await B.call('GET', `/admin/users?q=${encodeURIComponent(aEmail)}`);
  check('admin : recherche par adresse', users.body?.users?.length === 1 && users.body.users[0].email === aEmail, users.body);
  check('admin : filtre par rôle', (await B.call('GET', '/admin/users?role=admin&pageSize=100')).body?.users?.some((u) => u.email === bEmail));
  const bId = (await B.call('GET', '/auth/me')).body.id;
  check('garde-fou : pas de changement de son propre rôle', (await B.call('PATCH', `/admin/users/${bId}/role`, { role: 'user' })).status === 422);
  check('garde-fou : pas de suspension de soi-même', (await B.call('POST', `/admin/users/${bId}/suspend`)).status === 422);

  // ===== Phase 4 — invitations =====
  const cEmail = mail('invite-plateforme');
  const inv = await B.call('POST', '/admin/users/invitations', { email: cEmail });
  check('admin : invitation à créer un compte', inv.status === 201 && inv.body.invitation.status === 'pending' && inv.body.mail.queued === true, inv);
  check('aucun compte créé par l\'invitation', (await sql.query('SELECT count(*)::int AS c FROM users WHERE email = $1', [cEmail])).rows[0].c === 0);
  const resend = await B.call('POST', '/admin/users/invitations', { email: cEmail });
  check('renvoi : la même invitation, aucun doublon', resend.status === 200 && resend.body.resent === true && resend.body.invitation.id === inv.body.invitation.id, resend);
  // Le renvoi remplace le jeton : attendre le second courriel avant de lire le lien (le premier lien ne vaut plus rien).
  await mailCount(cEmail, 2);
  const cToken = await lastLink(cEmail, '/compte/invitation');
  const C = agent();
  const lookup = await C.call('POST', '/auth/invitations/lookup', { token: cToken });
  check('consultation de l\'invitation', lookup.status === 200 && lookup.body.invitation.email === cEmail && lookup.body.accountExists === false && lookup.body.refusal === null, lookup);
  check('activation : mot de passe faible refusé', (await C.call('POST', '/auth/activate', { token: cToken, password: 'court', acceptTerms: true })).status === 400);
  const act = await C.call('POST', '/auth/activate', { token: cToken, password: strong(), acceptTerms: true });
  check('activation : compte créé, adresse vérifiée, connecté', act.status === 201 && act.body.user.email === cEmail && act.body.user.emailVerified === true, act);
  check('lien d\'invitation à usage unique', (await agent().call('POST', '/auth/activate', { token: cToken, password: strong(), acceptTerms: true })).status === 409);

  // Projet de A ; invitation d'une adresse sans compte ; lien transféré ; acceptation.
  const project = await A.call('POST', '/projects', { code: `UM-${uid().slice(0, 6)}`, name: 'Projet comptes' });
  check('projet de A', project.status === 201, project);
  const pid = project.body.id;
  const dEmail = mail('invite-projet');
  const pinv = await A.call('POST', `/projects/${pid}/members`, { email: dEmail, role: 'editeur' });
  check('partage à une adresse sans compte : invitation 202', pinv.status === 202 && pinv.body.invitation.projectRole === 'editeur', pinv);
  check('invitation listée pour le propriétaire', (await A.call('GET', `/projects/${pid}/members`)).body?.invitations?.some((i) => i.email === dEmail));
  const dToken = await lastLink(dEmail, '/compte/invitation');
  const E = agent(), eEmail = mail('autre');
  await E.call('POST', '/auth/register', { email: eEmail, password: strong() });
  const forwarded = await E.call('POST', '/auth/invitations/accept', { token: dToken });
  check('lien transféré à un autre compte : refusé (wrong_account)', forwarded.status === 403 && forwarded.body.error === 'wrong_account', forwarded);
  check('E n\'a pas accès au projet', (await E.call('GET', `/projects/${pid}`)).status === 404);
  const D = agent();
  const dAct = await D.call('POST', '/auth/activate', { token: dToken, password: strong(), acceptTerms: true });
  check('activation : rattaché au projet avec le rôle invité', dAct.status === 201 && dAct.body.projectId === pid, dAct);
  check('accès au projet de l\'invité', (await D.call('GET', `/projects/${pid}`)).status === 200);
  const dId = dAct.body.user.id;

  // Invitation expirée et invitant révoqué (horloge simulée par la base).
  const fEmail = mail('expire');
  await A.call('POST', `/projects/${pid}/members`, { email: fEmail, role: 'lecteur' });
  const fToken = await lastLink(fEmail, '/compte/invitation');
  await sql.query("UPDATE auth.invitations SET expires_at = now() - interval '1 minute' WHERE email = $1", [fEmail]);
  const expired = await agent().call('POST', '/auth/activate', { token: fToken, password: strong(), acceptTerms: true });
  check('invitation expirée : aucune activation', expired.status === 409 && expired.body.error === 'expired', expired);
  const gEmail = mail('annulee');
  const ginv = await A.call('POST', `/projects/${pid}/members`, { email: gEmail, role: 'lecteur' });
  const gToken = await lastLink(gEmail, '/compte/invitation');
  check('annulation par le propriétaire', (await A.call('DELETE', `/projects/${pid}/members/invitations/${ginv.body.invitation.id}`)).status === 204);
  check('invitation annulée : aucune activation', (await agent().call('POST', '/auth/activate', { token: gToken, password: strong(), acceptTerms: true })).body?.error === 'cancelled');
  const hEmail = mail('declin');
  await A.call('POST', `/projects/${pid}/members`, { email: hEmail, role: 'lecteur' });
  const hToken = await lastLink(hEmail, '/compte/invitation');
  check('déclin', (await agent().call('POST', '/auth/invitations/decline', { token: hToken })).body?.declined === true);
  check('invitation déclinée : aucune activation', (await agent().call('POST', '/auth/activate', { token: hToken, password: strong(), acceptTerms: true })).body?.error === 'declined');

  // ===== Phase 3 — accès support (D-2) =====
  check('admin sans accès support : projet → 404', (await B.call('GET', `/projects/${pid}`)).status === 404);
  const grants = await A.call('GET', `/projects/${pid}/support-grants`);
  check('propriétaire : administrateurs éligibles listés', grants.body?.admins?.some((a) => a.id === bId) && grants.body.maxHours === 72, grants.body);
  check('accès support > 72 h refusé', (await A.call('POST', `/projects/${pid}/support-grants`, { adminId: bId, hours: 73, purpose: 'diagnostic' })).status === 400);
  check('accès support à un non-admin refusé', (await A.call('POST', `/projects/${pid}/support-grants`, { adminId: dId, hours: 2, purpose: 'diagnostic' })).status === 422);
  check('seul le propriétaire accorde', (await D.call('POST', `/projects/${pid}/support-grants`, { adminId: bId, hours: 2, purpose: 'diagnostic' })).status === 403);
  const grant = await A.call('POST', `/projects/${pid}/support-grants`, { adminId: bId, hours: 2, purpose: 'Diagnostic du ticket 42' });
  check('accès support accordé (lecture seule, 2 h)', grant.status === 201 && grant.body.grant.active === true, grant);
  check('admin avec accès support : lecture OK', (await B.call('GET', `/projects/${pid}`)).status === 200);
  check('projet listé pour l\'admin avec le rôle support', (await B.call('GET', '/projects')).body?.some((p) => p.id === pid && p.role === 'support' && p.supportExpiresAt));
  check('bandeau : l\'admin voit son accès et son échéance', (await B.call('GET', `/projects/${pid}/support-grants`)).body?.you === 'support');
  const write = await B.call('DELETE', `/projects/${pid}`);
  check('accès support : écriture 403', write.status === 403 && (await sql.query('SELECT count(*)::int AS c FROM projects WHERE id = $1', [pid])).rows[0].c === 1, write);
  check('accès support : commentaire 403', (await B.call('POST', `/projects/${pid}/collaboration/comments`, { body: 'test' })).status === 403);
  const exp = await B.call('GET', `/projects/${pid}/archive`);
  check('accès support : export 403', exp.status === 403 && exp.body?.error === 'support_no_export', exp);
  check('accès support : membres et invitations du propriétaire masqués', (await B.call('GET', `/projects/${pid}/members`)).body?.invitations === undefined);
  check('chaque lecture journalisée', (await sql.query("SELECT count(*)::int AS c FROM admin.audit_log WHERE action = 'support.accessed' AND target_id = $1", [pid])).rows[0].c >= 2);
  check('propriétaire prévenu de l\'ouverture', (await A.call('GET', '/notifications')).body?.items?.some((i) => i.id.startsWith('support:')));
  await sql.query('UPDATE project_support_grants SET granted_at = granted_at - interval \'3 hours\', expires_at = now() - interval \'1 minute\' WHERE id = $1', [grant.body.grant.id]);
  check('accès support expiré : 404', (await B.call('GET', `/projects/${pid}`)).status === 404);
  const grant2 = await A.call('POST', `/projects/${pid}/support-grants`, { adminId: bId, hours: 1, purpose: 'Second diagnostic' });
  check('révocation par le propriétaire', (await A.call('DELETE', `/projects/${pid}/support-grants/${grant2.body.grant.id}`)).status === 204);
  check('accès support révoqué : 404', (await B.call('GET', `/projects/${pid}`)).status === 404);

  // ===== Phase 4 — suspension, réactivation =====
  const lockRes = await D.call('PUT', `/projects/${pid}/lock`);
  const susp = await B.call('POST', `/admin/users/${dId}/suspend`);
  check('suspension', susp.status === 200 && susp.body.user.status === 'suspended', susp);
  check('session du suspendu révoquée (401)', (await D.call('GET', '/auth/me')).status === 401);
  check('réservation d\'édition libérée', lockRes.status >= 400 || (await sql.query('SELECT editing_lock FROM projects WHERE id = $1', [pid])).rows[0].editing_lock === null);
  const dLogin = await agent().call('POST', '/auth/login', { email: dEmail, password: 'x'.repeat(12) });
  check('suspendu : mauvais mot de passe → identifiants invalides', dLogin.status === 401);
  check('courriel « compte suspendu »', (await mailCount(dEmail, 2)) >= 2);
  check('suspendre deux fois : transition refusée', (await B.call('POST', `/admin/users/${dId}/suspend`)).status === 409);
  check('réactivation', (await B.call('POST', `/admin/users/${dId}/reactivate`)).body?.user?.status === 'active');
  const detail = await B.call('GET', `/admin/users/${dId}`);
  check('fiche : projets, historique d\'audit', detail.body?.projects?.some((p) => p.id === pid) && detail.body.audit.some((a) => a.action === 'admin.user.suspended'), detail.body);
  check('journal : aucune adresse e-mail', (await sql.query("SELECT count(*)::int AS c FROM admin.audit_log WHERE metadata::text LIKE '%@%'")).rows[0].c === 0);

  // ===== Phase 4 — mot de passe oublié =====
  const fp1 = await X.call('POST', '/auth/forgot-password', { email: aEmail });
  const fp2 = await X.call('POST', '/auth/forgot-password', { email: mail('fantome') });
  check('mot de passe oublié : réponse identique', fp1.status === 202 && JSON.stringify(fp1.body) === JSON.stringify(fp2.body), { fp1, fp2 });
  const resetToken = await lastLink(aEmail, '/compte/reinitialiser');
  check('réinitialisation : mot de passe faible refusé sans brûler le lien', (await X.call('POST', '/auth/reset-password', { token: resetToken, password: 'court' })).status === 400);
  const aPass3 = strong();
  check('réinitialisation', (await X.call('POST', '/auth/reset-password', { token: resetToken, password: aPass3 })).body?.reset === true);
  check('réinitialisation : toutes les sessions révoquées', (await A.call('GET', '/auth/me')).status === 401);
  check('lien de réinitialisation à usage unique', (await X.call('POST', '/auth/reset-password', { token: resetToken, password: strong() })).status === 400);
  check('connexion avec le nouveau mot de passe', (await A.call('POST', '/auth/login', { email: aEmail, password: aPass3 })).status === 200);

  // ===== Phase 4 — export et suppression (D-5) =====
  const ex = await A.call('GET', '/auth/me/export');
  check('export JSON des données personnelles', ex.status === 200 && ex.body.profile.email === aEmail && Array.isArray(ex.body.auditLog) && ex.body.projectsOwned.some((p) => p.id === pid), ex.status);
  const own = await A.call('DELETE', '/auth/me', { password: aPass3, confirm: 'SUPPRIMER' });
  check('suppression refusée : projet partagé possédé', own.status === 409 && own.body.error === 'owns_shared_projects' && own.body.projects.some((p) => p.id === pid), own);
  const F = agent(), fe = mail('suppression'), fp = strong();
  await F.call('POST', '/auth/register', { email: fe, password: fp });
  const solo = await F.call('POST', '/projects', { code: `SOLO-${uid().slice(0, 4)}`, name: 'Projet solitaire' });
  await F.call('POST', `/projects/${solo.body.id}/collaboration/comments`, { body: 'Note avant départ' });
  const del = await F.call('DELETE', '/auth/me', { password: fp, confirm: 'SUPPRIMER' });
  check('suppression programmée à 30 jours', del.status === 202 && new Date(del.body.deletionAt) > new Date(Date.now() + 29 * 864e5), del);
  check('connexion bloquée pendant le délai', (await F.call('POST', '/auth/login', { email: fe, password: fp })).body?.error === 'deletion_pending');
  const cancelToken = await lastLink(fe, '/compte/annuler-suppression');
  check('annulation par le lien', (await X.call('POST', '/auth/cancel-deletion', { token: cancelToken })).body?.cancelled === true);
  check('connexion rétablie', (await F.call('POST', '/auth/login', { email: fe, password: fp })).status === 200);
  await F.call('DELETE', '/auth/me', { password: fp, confirm: 'SUPPRIMER' });
  const fId = (await sql.query('SELECT id FROM users WHERE email = $1', [fe])).rows[0].id;
  execFileSync('npm', ['run', 'db:account-jobs', '--workspace=@fadi/api', '--', `--now=${new Date(Date.now() + 15 * 864e5).toISOString()}`], { env: process.env, encoding: 'utf8' });
  check('avant 30 jours : rien n\'est anonymisé', (await sql.query('SELECT status FROM users WHERE id = $1', [fId])).rows[0].status === 'active');
  execFileSync('npm', ['run', 'db:account-jobs', '--workspace=@fadi/api', '--', `--now=${new Date(Date.now() + 31 * 864e5).toISOString()}`], { env: process.env, encoding: 'utf8' });
  const anon = (await sql.query('SELECT email, display_name, status, totp_secret_enc, password_hash FROM users WHERE id = $1', [fId])).rows[0];
  check('anonymisation après 30 jours (horloge simulée)', anon.status === 'closed' && anon.email === `deleted-${fId}@invalid` && anon.display_name === 'Compte supprimé' && !anon.password_hash.startsWith('$argon2'), anon);
  check('projet non partagé supprimé', (await sql.query('SELECT count(*)::int AS c FROM projects WHERE id = $1', [solo.body.id])).rows[0].c === 0);
  check('journal : l\'identifiant reste, sans adresse', (await sql.query("SELECT count(*)::int AS c FROM admin.audit_log WHERE target_id = $1 AND action = 'account.anonymized'", [fId])).rows[0].c === 1);
  check('ancienne adresse : connexion impossible', (await F.call('POST', '/auth/login', { email: fe, password: fp })).status === 401);

  // ===== D-1 — garde-fou de quota : bascule vers le lien à copier =====
  // Remplit la file jusqu'au quota de l'API (même valeur que MAIL_DAILY_LIMIT côté serveur, 150 par défaut).
  const filler = Number(process.env.MAIL_DAILY_LIMIT ?? 150) + 5;
  await sql.query("INSERT INTO admin.mail_outbox (id, to_address, template, status, payload) SELECT 'mail_quota_' || g || '_' || $1, 'quota@example.test', 'verify_email', 'sent', '{}' FROM generate_series(1, $2) g", [uid(), filler]);
  const qEmail = mail('quota');
  const qinv = await B.call('POST', '/admin/users/invitations', { email: qEmail });
  check('quota atteint : courriel non envoyé, lien à copier rendu', qinv.status === 201 && qinv.body.mail.queued === false && qinv.body.mail.reason === 'daily_quota' && /#jeton=/.test(qinv.body.mail.link), qinv.body.mail);
  check('quota : événement journalisé', (await sql.query("SELECT count(*)::int AS c FROM admin.audit_log WHERE action = 'mail.quota_exceeded'")).rows[0].c >= 1);
  await sql.query("UPDATE admin.mail_outbox SET status = 'skipped' WHERE to_address = 'quota@example.test'");
  check('file : aucune charge résiduelle sur les courriels envoyés', (await sql.query("SELECT count(*)::int AS c FROM admin.mail_outbox WHERE status IN ('sent', 'failed') AND payload <> '{}'::jsonb")).rows[0].c === 0);
} finally {
  await sql.end();
}

console.log(failures ? `\n${failures} contrôle(s) en échec` : '\n✅ recette Gestion des comptes (API) réussie');
process.exit(failures ? 1 : 0);
