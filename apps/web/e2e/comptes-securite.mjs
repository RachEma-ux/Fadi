#!/usr/bin/env node
/**
 * Recette de non-régression des trois correctifs de sécurité de la gestion des comptes (PR #255, revue de `c7dbc92`),
 * par l'API réelle sur une base locale jetable :
 *
 *  1. Double authentification liée à la session : activer le TOTP dans le navigateur A ne donne pas `/admin/*` au
 *     navigateur B ouvert avant (session au mot de passe seul) ; B est révoqué ; connexion TOTP et code de secours ;
 *     session partielle (« code attendu ») refusée ; session sans preuve (héritée) refusée ; promotion.
 *  2. Garde du dernier administrateur atomique : demandes concurrentes (deux auto-suppressions, suppressions croisées,
 *     suppression contre suspension, suppression contre rétrogradation) — il reste toujours un administrateur actif,
 *     la demande refusée ne laisse aucun état partiel. Exige une base vierge (aucun autre administrateur) :
 *     `COMPTES_SECURITE_BASE_VIERGE=1`, sinon ces scénarios sont déclarés NON EXÉCUTÉS.
 *  3. Accès support sans export : routes de documents, archive, téléchargements, GET / HEAD, barre oblique finale,
 *     identifiant encodé en pourcent, casse ; refus avant toute production, trace de production ou copie ; lectures
 *     permises et journalisées ; le propriétaire garde l'export, un nouveau lecteur l'obtient quand le propriétaire le lui accorde (E2).
 *  4. Échecs de connexion simultanés : compteur incrémenté atomiquement.
 *  5. Corbeille et « Anonymiser maintenant » (UM-27, amendement de D-5) : liste, demandeur, restauration par la voie
 *     d'annulation (statut antérieur rétabli), refus (hors corbeille, soi-même, adresse non ressaisie, projets partagés,
 *     non-administrateur), même anonymisation que la tâche des 30 jours, journal, double appel et appels simultanés.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://…@127.0.0.1/… node apps/web/e2e/comptes-securite.mjs
 *   (API lancée avec FADI_ADMIN_ENABLED=true, FADI_ENCRYPTION_KEY, MAIL_TRANSPORT=console ou smtp)
 */
import { createHmac, randomUUID } from 'node:crypto';
import { appelPlaywright, inviterEtAccepter } from './lib-invitations.mjs';
import { partagerEnBase, retirerPartagesEnBase } from './lib-partage-sql.mjs';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
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
const mail = (tag) => `secu-${tag}-${uid()}@example.test`;
const strong = () => `phrase-de-passe-${uid()}`;

/** Un client HTTP avec son propre cookie (un « navigateur »). */
function agent() {
  let cookie = '';
  return {
    async call(method, path, body, headers = {}) {
      const res = await fetch(BASE + path, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)),
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
      return { status: res.status, body: json, headers: res.headers };
    },
  };
}

// --- TOTP (RFC 6238) : codes successifs d'un même compte, anti-rejeu respecté (fenêtre ±1 pas) -------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  let bits = 0, value = 0; const out = [];
  for (const ch of s.replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totpAt(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, '0');
}
const nowStep = () => Math.floor(Date.now() / 30000);
/** Le code suivant d'un compte : un pas jamais utilisé, dans la fenêtre acceptée (attend le pas suivant au besoin). */
async function nextCode(acct) {
  let s = acct.lastStep === undefined ? nowStep() - 1 : acct.lastStep + 1;
  while (s > nowStep() + 1) await new Promise((r) => setTimeout(r, 1000));
  if (s < nowStep() - 1) s = nowStep() - 1;
  acct.lastStep = s;
  return totpAt(acct.secret, s);
}

/** Compte inscrit ; `a` est la session ouverte par l'inscription (mot de passe seul). */
async function register(tag) {
  const acct = { email: mail(tag), password: strong() };
  acct.a = agent();
  const r = await acct.a.call('POST', '/auth/register', { email: acct.email, password: acct.password });
  if (r.status !== 201) throw new Error(`inscription ${tag} : ${r.status}`);
  acct.id = r.body.id;
  return acct;
}
/** Nouvelle session au mot de passe ; renvoie l'agent et le statut (202 = code attendu). */
async function passwordLogin(acct) {
  const b = agent();
  const r = await b.call('POST', '/auth/login', { email: acct.email, password: acct.password });
  return { b, r };
}
/** Session complète d'un compte à double authentification (mot de passe puis code TOTP). */
async function mfaLogin(acct) {
  const { b, r } = await passwordLogin(acct);
  if (r.status !== 202) throw new Error(`connexion ${acct.email} : ${r.status} (code attendu)`);
  const m = await b.call('POST', '/auth/login/mfa', { code: await nextCode(acct) });
  if (m.status !== 200) throw new Error(`code ${acct.email} : ${m.status} ${JSON.stringify(m.body)}`);
  return b;
}
/** Active le TOTP depuis la session `client` ; garde secret et codes de secours. */
async function enableMfa(acct, client) {
  const s = await client.call('POST', '/auth/me/mfa/setup');
  if (s.status !== 200) throw new Error(`mfa/setup : ${s.status} ${JSON.stringify(s.body)}`);
  acct.secret = s.body.secret;
  acct.lastStep = undefined;
  const e = await client.call('POST', '/auth/me/mfa/enable', { code: await nextCode(acct) });
  if (e.status !== 200) throw new Error(`mfa/enable : ${e.status} ${JSON.stringify(e.body)}`);
  acct.recovery = e.body.recoveryCodes;
  return e;
}
const promote = (email) => execFileSync('node', ['apps/api/scripts/create-admin.mjs', email], { env: { ...process.env }, encoding: 'utf8' });
const columnExists = async (schema, table, column) => (await sql.query(
  'SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3', [schema, table, column])).rowCount === 1;
const userRow = async (id) => (await sql.query('SELECT status, platform_role, deletion_requested_at FROM users WHERE id = $1', [id])).rows[0];
const activeAdminCount = async () => Number((await sql.query("SELECT count(*)::int AS n FROM users WHERE platform_role = 'admin' AND status = 'active' AND deletion_requested_at IS NULL")).rows[0].n);

// =====================================================================================================================
// 1. Double authentification liée à la session
// =====================================================================================================================
console.log('— 1. Double authentification liée à la session');
const boss = await register('boss');
promote(boss.email);
const A = (await passwordLogin(boss)).b;
const B = (await passwordLogin(boss)).b;
check('administrateur sans TOTP : /admin refusé (403 mfa_required) — l’enrôlement reste accessible', (await A.call('GET', '/admin/users')).body?.error === 'mfa_required');
const enabled = await enableMfa(boss, A);
check('navigateur A : TOTP activé', enabled.body?.enabled === true);
const bAdmin = await B.call('GET', '/admin/users');
check('navigateur B (ouvert avant l’enrôlement, mot de passe seul) : /admin refusé', bAdmin.status !== 200, { status: bAdmin.status, body: bAdmin.body });
check('navigateur B : session révoquée par l’activation (401 sur /auth/me)', (await B.call('GET', '/auth/me')).status === 401);
check('navigateur A (a prouvé le code) : /admin accessible', (await A.call('GET', '/admin/users')).status === 200);
const enabledAudit = (await sql.query("SELECT metadata FROM admin.audit_log WHERE action = 'auth.mfa.enabled' AND target_id = $1 ORDER BY id DESC LIMIT 1", [boss.id])).rows[0];
check('activation journalisée avec le nombre de sessions révoquées', Number(enabledAudit?.metadata?.revokedSessions) >= 1, enabledAudit);

const { b: C, r: cLogin } = await passwordLogin(boss);
check('connexion : mot de passe seul → 202 code attendu', cLogin.status === 202);
check('session partielle : /admin 404, /auth/me 401', (await C.call('GET', '/admin/users')).status === 404 && (await C.call('GET', '/auth/me')).status === 401);
check('session partielle : /auth/me/mfa/setup refusé (401)', (await C.call('POST', '/auth/me/mfa/setup')).status === 401);
check('code TOTP → session complète', (await C.call('POST', '/auth/login/mfa', { code: await nextCode(boss) })).status === 200);
check('session TOTP : /admin accessible', (await C.call('GET', '/admin/users')).status === 200);
const { b: D } = await passwordLogin(boss);
check('code de secours → session complète', (await D.call('POST', '/auth/login/mfa', { recoveryCode: boss.recovery[0] })).status === 200);
check('session par code de secours : /admin accessible', (await D.call('GET', '/admin/users')).status === 200);

if (await columnExists('public', 'sessions', 'mfa_verified_at')) {
  const E = await mfaLogin(boss);
  await sql.query('UPDATE sessions SET mfa_verified_at = NULL WHERE id = (SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND NOT mfa_pending ORDER BY created_at DESC LIMIT 1)', [boss.id]);
  const e = await E.call('GET', '/admin/users');
  check('session sans preuve de double authentification (héritée) : /admin refusé, échec fermé', e.status === 403 && e.body?.error === 'mfa_session_required', { status: e.status, body: e.body });
  check('session sans preuve : le compte reste utilisable hors administration', (await E.call('GET', '/auth/me')).status === 200);
} else {
  check('colonne sessions.mfa_verified_at présente (assurance de session)', false, 'absente');
}

// Promotion : les sessions ouvertes avant ne deviennent jamais des sessions d'administration.
const riser = await register('promu');
const riserEarly = (await passwordLogin(riser)).b;
await enableMfa(riser, riser.a);
check('compte simple : l’activation du TOTP révoque la session ouverte avant', (await riserEarly.call('GET', '/auth/me')).status === 401);
const riserVerified = await mfaLogin(riser);
const promoted = await A.call('PATCH', `/admin/users/${riser.id}/role`, { role: 'admin' });
check('promotion en administrateur par l’administration', promoted.status === 200, promoted);
check('promotion : toutes les sessions ouvertes avant sont révoquées', (await riserVerified.call('GET', '/auth/me')).status === 401 && (await riser.a.call('GET', '/auth/me')).status === 401);
const riserAdmin = await mfaLogin(riser);
check('promu : nouvelle connexion TOTP → /admin accessible', (await riserAdmin.call('GET', '/admin/users')).status === 200);
const plain = await register('promu-sans-totp');
const plainLater = (await passwordLogin(plain)).b;
promote(plain.email);
check('create-admin : sessions antérieures révoquées', (await plain.a.call('GET', '/auth/me')).status === 401 && (await plainLater.call('GET', '/auth/me')).status === 401);
const plainNow = (await passwordLogin(plain)).b;
check('promu sans TOTP : /admin refusé (mfa_required), l’enrôlement reste possible', (await plainNow.call('GET', '/admin/users')).body?.error === 'mfa_required');

// Désactiver puis réactiver : jamais de retour d'une ancienne preuve.
const reEnable = await register('reactive');
await enableMfa(reEnable, reEnable.a);
const reOther = await mfaLogin(reEnable);
const disabled = await reEnable.a.call('POST', '/auth/me/mfa/disable', { password: reEnable.password, code: await nextCode(reEnable) });
check('désactivation du TOTP', disabled.status === 200 && disabled.body?.enabled === false, disabled);
check('désactivation : les autres sessions sont révoquées', (await reOther.call('GET', '/auth/me')).status === 401);
await enableMfa(reEnable, reEnable.a);
promote(reEnable.email);
const reAdmin = await mfaLogin(reEnable);
check('réactivation puis promotion : seule une nouvelle preuve ouvre /admin', (await reAdmin.call('GET', '/admin/users')).status === 200);

// =====================================================================================================================
// 2. Dernier administrateur : demandes concurrentes
// =====================================================================================================================
console.log('— 2. Garde du dernier administrateur sous concurrence');
const auditCount = async (action, targetId) => Number((await sql.query('SELECT count(*)::int AS n FROM admin.audit_log WHERE action = $1 AND target_id = $2', [action, targetId])).rows[0].n);
if (process.env.COMPTES_SECURITE_BASE_VIERGE !== '1') {
  console.log('… NON EXÉCUTÉ : scénarios concurrents du dernier administrateur (base partagée ; COMPTES_SECURITE_BASE_VIERGE=1 sur une base vierge)');
} else {
  // Ramène la plateforme à exactement deux administrateurs actifs, chacun avec une session prouvée.
  const others = (await sql.query("SELECT id FROM users WHERE platform_role = 'admin' AND status = 'active' AND deletion_requested_at IS NULL AND id <> $1", [boss.id])).rows.map((r) => r.id);
  for (const id of others) {
    const r = await A.call('PATCH', `/admin/users/${id}/role`, { role: 'user' });
    if (r.status !== 200) throw new Error(`rétrogradation préalable ${id} : ${r.status}`);
  }
  let survivor = { acct: boss, client: A };
  async function freshPair(tag) {
    const x = await register(tag);
    await enableMfa(x, x.a);
    const p = await survivor.client.call('PATCH', `/admin/users/${x.id}/role`, { role: 'admin' });
    if (p.status !== 200) throw new Error(`promotion ${tag} : ${p.status}`);
    const xc = await mfaLogin(x);
    if (await activeAdminCount() !== 2) throw new Error(`précondition : ${await activeAdminCount()} administrateurs actifs au lieu de 2`);
    return [survivor, { acct: x, client: xc }];
  }
  /**
   * Lance deux demandes en même temps (`effects.p` / `effects.q` : compte visé et action journalisée de chacune) ; vérifie
   * qu'exactement une passe, l'autre étant refusée `last_admin` sans aucun état partiel ; renvoie l'administrateur restant.
   */
  async function race(label, p, q, makeP, makeQ, effects) {
    const side = { p, q };
    const before = { p: await userRow(p.acct.id), q: await userRow(q.acct.id) };
    const audits = { p: await auditCount(effects.p.action, side[effects.p.target].acct.id), q: await auditCount(effects.q.action, side[effects.q.target].acct.id) };
    const [rp, rq] = await Promise.all([makeP(), makeQ()]);
    const res = { p: rp, q: rq };
    const ok = ['p', 'q'].filter((k) => res[k].status >= 200 && res[k].status < 300);
    const refused = ['p', 'q'].filter((k) => res[k].status === 409 && res[k].body?.error === 'last_admin');
    check(`${label} : une seule demande passe, l’autre est refusée (last_admin)`, ok.length === 1 && refused.length === 1, { p: [rp.status, rp.body?.error], q: [rq.status, rq.body?.error] });
    check(`${label} : au moins un administrateur actif reste`, (await activeAdminCount()) >= 1, await activeAdminCount());
    if (ok.length !== 1 || refused.length !== 1) return { acct: boss, client: await mfaLogin(boss) };
    const loser = refused[0];
    const t = effects[loser].target;
    const after = await userRow(side[t].acct.id);
    check(`${label} : la demande refusée ne laisse aucun état partiel`,
      after.status === before[t].status && after.platform_role === before[t].platform_role && String(after.deletion_requested_at) === String(before[t].deletion_requested_at)
        && (await auditCount(effects[loser].action, side[t].acct.id)) === audits[loser], { after, before: before[t] });
    const removed = effects[ok[0]].target;
    const survivorSide = side[removed === 'p' ? 'q' : 'p'];
    const row = await userRow(survivorSide.acct.id);
    check(`${label} : l’administrateur restant est actif et administrateur`, row.status === 'active' && row.platform_role === 'admin' && !row.deletion_requested_at, row);
    check(`${label} : sa session reste ouverte`, (await survivorSide.client.call('GET', '/auth/me')).status === 200);
    return survivorSide;
  }

  // a) deux auto-suppressions
  let [p, q] = await freshPair('self-a');
  survivor = await race('deux auto-suppressions', p, q,
    () => p.client.call('DELETE', '/auth/me', { password: p.acct.password, confirm: 'SUPPRIMER' }),
    () => q.client.call('DELETE', '/auth/me', { password: q.acct.password, confirm: 'SUPPRIMER' }),
    { p: { target: 'p', action: 'account.deletion.requested' }, q: { target: 'q', action: 'account.deletion.requested' } });
  // b) suppressions croisées
  [p, q] = await freshPair('cross');
  survivor = await race('suppressions croisées', p, q,
    () => p.client.call('DELETE', `/admin/users/${q.acct.id}`),
    () => q.client.call('DELETE', `/admin/users/${p.acct.id}`),
    { p: { target: 'q', action: 'admin.user.deletion_requested' }, q: { target: 'p', action: 'admin.user.deletion_requested' } });
  // c) auto-suppression contre suspension (p se supprime pendant que p suspend q)
  [p, q] = await freshPair('suspend');
  survivor = await race('auto-suppression contre suspension', p, q,
    () => p.client.call('DELETE', '/auth/me', { password: p.acct.password, confirm: 'SUPPRIMER' }),
    () => p.client.call('POST', `/admin/users/${q.acct.id}/suspend`),
    { p: { target: 'p', action: 'account.deletion.requested' }, q: { target: 'q', action: 'admin.user.suspended' } });
  // d) suppression contre rétrogradation
  [p, q] = await freshPair('demote');
  survivor = await race('suppression contre rétrogradation', p, q,
    () => p.client.call('DELETE', `/admin/users/${q.acct.id}`),
    () => q.client.call('PATCH', `/admin/users/${p.acct.id}/role`, { role: 'user' }),
    { p: { target: 'q', action: 'admin.user.deletion_requested' }, q: { target: 'p', action: 'admin.user.role_changed' } });
  check('fin des courses : un administrateur actif au moins', (await activeAdminCount()) >= 1);
  // La session de l'administrateur restant sert à la suite.
  globalThis.__survivor = survivor;
}

// =====================================================================================================================
// 3. Accès support : lecture seule, aucun export
// =====================================================================================================================
console.log('— 3. Accès support sans export');
const support = globalThis.__survivor ?? { acct: boss, client: await mfaLogin(boss) };
const owner = await register('proprio');
const imported = await owner.a.call('POST', '/examples/p118-exemple-complet/import');
check('propriétaire : exemple importé', imported.status === 201, imported.status);
const pid = imported.body.id;
const upload = await owner.a.call('POST', `/projects/${pid}/steps/1/files`, Buffer.from('contenu confidentiel'), { 'content-type': 'text/plain', 'x-file-name': 'note.txt', 'x-file-type': 'text/plain' });
check('propriétaire : pièce jointe déposée', upload.status === 201, upload.status);
const fileId = upload.body?.file?.id;
const model = await owner.a.call('GET', `/projects/${pid}/atelier/model`);
const levels = (await owner.a.call('GET', `/projects/${pid}/documents`)).body?.documents?.filter((d) => /^plan-lecture-/.test(d.kind)).map((d) => d.kind.replace('plan-lecture-', '')) ?? [];
check('propriétaire : modèle et plans de niveau disponibles', model.status === 200 && levels.length > 0, { model: model.status, levels });
const reader = await register('lecteur');
check('propriétaire : lecteur invité, invitation acceptée (phase 3)', (await inviterEtAccepter((m, p, b) => owner.a.call(m, p, b), (m, p, b) => reader.a.call(m, p, b), pid, reader.email, 'lecteur')).ok);
// Écart E2 : un nouveau lecteur n'exporte pas ; le propriétaire le lui accorde (le support, lui, ne l'a jamais).
check('lecteur : sans export par défaut (403)', (await reader.a.call('GET', `/projects/${pid}/documents/surfaces`)).status === 403);
check('propriétaire : export accordé au lecteur', (await owner.a.call('PATCH', `/projects/${pid}/members/${reader.id}`, { canExport: true })).status === 200);
const grant = await owner.a.call('POST', `/projects/${pid}/support-grants`, { adminId: support.acct.id, hours: 2, purpose: 'Recette de sécurité' });
check('propriétaire : accès support accordé', grant.status === 201, grant);

const S = support.client;
const encoded = '%' + pid.charCodeAt(0).toString(16) + pid.slice(1);
const produced = async () => Number((await sql.query('SELECT count(*)::int AS n FROM produced_documents WHERE project_id = $1', [pid])).rows[0].n);
const ownedBy = async (id) => Number((await sql.query('SELECT count(*)::int AS n FROM projects WHERE owner_id = $1', [id])).rows[0].n);
const accessed = async () => Number((await sql.query("SELECT count(*)::int AS n FROM admin.audit_log WHERE action = 'support.accessed' AND target_id = $1", [pid])).rows[0].n);

const exportPaths = [
  'documents/surfaces', 'documents/programme', 'documents/fiches', 'documents/dossier-exemple', `documents/plan/${levels[0] ?? 'rdc'}`,
  'documents/atelier/modele.ifc', 'archive', `steps/1/files/${fileId}`, 'design-review/rapport', 'steps/harmonie/rapport', 'steps/1/harmonie/rapport',
  'atelier/journal.csv',
];
const producedBefore = await produced();
const leaks = [];
for (const path of exportPaths) {
  for (const [variant, url] of [
    ['GET', `/projects/${pid}/${path}`], ['GET encodé', `/projects/${encoded}/${path}`], ['GET barre finale', `/projects/${pid}/${path}/`],
    ['GET casse', `/projects/${pid}/${path.replace(/^[a-z]+/, (s) => s.toUpperCase())}`],
  ]) {
    const r = await S.call('GET', url);
    if (r.status === 200 || r.headers.get('content-disposition')) leaks.push(`${variant} ${path} → ${r.status}`);
    else if (r.status !== 403 && r.status !== 404) leaks.push(`${variant} ${path} → ${r.status} (inattendu)`);
  }
  const h = await S.call('HEAD', `/projects/${encoded}/${path}`);
  if (h.status === 200) leaks.push(`HEAD encodé ${path} → 200`);
}
check('support : aucun export, document produit ni téléchargement (GET, HEAD, encodé, barre finale, casse)', leaks.length === 0, leaks);
check('support : aucune trace de production enregistrée', (await produced()) === producedBefore, { before: producedBefore, after: await produced() });
const refusal = await S.call('GET', `/projects/${encoded}/documents/surfaces`);
check('support : refus explicite (403 support_no_export) même avec identifiant encodé', refusal.status === 403 && refusal.body?.error === 'support_no_export', refusal);
const ownedBefore = await ownedBy(support.acct.id);
for (const url of [`/projects/${pid}/copies`, `/projects/${encoded}/copies`, `/projects/${pid}/copies/`]) {
  const r = await S.call('POST', url, { name: 'copie support' });
  check(`support : copie refusée (${url.includes('%') ? 'encodé' : url.endsWith('/') ? 'barre finale' : 'direct'})`, r.status === 403, r);
}
check('support : aucun projet créé par copie', (await ownedBy(support.acct.id)) === ownedBefore);
const readsBefore = await accessed();
const read = await S.call('GET', `/projects/${encoded}`);
check('support : lecture permise (identifiant encodé)', read.status === 200 && read.body?.id === pid, read.status);
check('support : lecture journalisée (support.accessed), identifiant encodé compris', (await accessed()) > readsBefore, { before: readsBefore, after: await accessed() });
check('support : lecture des étapes permise', (await S.call('GET', `/projects/${pid}/steps`)).status === 200);
check('support : écriture refusée (identifiant encodé)', (await S.call('PATCH', `/projects/${encoded}/steps/1`, { fields: {} })).status === 403);

const ownerExport = await owner.a.call('GET', `/projects/${pid}/documents/surfaces`);
check('propriétaire : export inchangé', ownerExport.status === 200);
const readerClient = (await passwordLogin(reader)).b;
const readerExport = await readerClient.call('GET', `/projects/${pid}/documents/surfaces`);
check('lecteur : export accordé effectif', readerExport.status === 200, readerExport.status);
check('lecteur : téléchargement de pièce jointe accordé effectif', (await readerClient.call('GET', `/projects/${pid}/steps/1/files/${fileId}`)).status === 200);

// =====================================================================================================================
// 4. Échecs de connexion simultanés (revue Codex) : compteur incrémenté atomiquement
// =====================================================================================================================
console.log('— 4. Échecs de connexion simultanés');
const victim = await register('echecs');
const attempts = await Promise.all(Array.from({ length: 5 }, () => agent().call('POST', '/auth/login', { email: victim.email, password: 'mauvais-mot-de-passe-1' })));
check('cinq échecs simultanés : tous refusés (401)', attempts.every((r) => r.status === 401), attempts.map((r) => r.status));
const counted = (await sql.query('SELECT failed_login_count, locked_until FROM users WHERE id = $1', [victim.id])).rows[0];
check('cinq échecs simultanés : compteur à 5, compte verrouillé', counted.failed_login_count === 5 && counted.locked_until !== null, counted);

// =====================================================================================================================
// 5. Corbeille et « Anonymiser maintenant » (UM-27, amendement de D-5)
// =====================================================================================================================
console.log('— 5. Corbeille et anonymisation immédiate');
const keeper = await register('corbeille-admin');
promote(keeper.email);
await enableMfa(keeper, (await passwordLogin(keeper)).b);
const K = await mfaLogin(keeper);
const trashOf = async (id) => (await K.call('GET', '/admin/trash')).body?.items?.find((i) => i.id === id);

// Demandée par le titulaire.
const leaver = await register('corbeille-titulaire');
const leaverProject = (await leaver.a.call('POST', '/projects', { code: `TR-${uid().slice(0, 4)}`, name: 'Projet non partagé' })).body;
await leaver.a.call('POST', `/projects/${leaverProject.id}/collaboration/comments`, { body: 'Note conservée' });
check('titulaire : suppression programmée', (await leaver.a.call('DELETE', '/auth/me', { password: leaver.password, confirm: 'SUPPRIMER' })).status === 202);
const inTrash = await trashOf(leaver.id);
const expected = new Date((await userRow(leaver.id)).deletion_requested_at).getTime() + 30 * 864e5;
check('corbeille : compte listé, demandeur « titulaire », statut antérieur, date d’anonymisation à +30 jours',
  inTrash?.requestedBy?.kind === 'user' && inTrash.status === 'active' && new Date(inTrash.anonymisationAt).getTime() === expected && inTrash.sharedProjects === 0, inTrash);
const anyone = await register('corbeille-non-admin');
check('non-administrateur : corbeille et anonymisation → 404', (await anyone.a.call('GET', '/admin/trash')).status === 404
  && (await anyone.a.call('POST', `/admin/users/${leaver.id}/anonymize`, { confirmEmail: leaver.email })).status === 404 && (await anyone.a.call('POST', `/admin/users/${leaver.id}/restore`)).status === 404);
check('anonymisation sans adresse : 400', (await K.call('POST', `/admin/users/${leaver.id}/anonymize`, {})).status === 400);
const mismatch = await K.call('POST', `/admin/users/${leaver.id}/anonymize`, { confirmEmail: anyone.email });
check('adresse ressaisie différente : 422, rien n’est anonymisé', mismatch.status === 422 && mismatch.body?.error === 'confirmation_mismatch' && (await userRow(leaver.id)).status === 'active', mismatch);
const outside = await K.call('POST', `/admin/users/${anyone.id}/anonymize`, { confirmEmail: anyone.email });
check('compte hors corbeille : 409 not_in_trash, rien n’est anonymisé', outside.status === 409 && outside.body?.error === 'not_in_trash' && (await userRow(anyone.id)).status === 'active', outside);
check('soi-même : 422 self_action', (await K.call('POST', `/admin/users/${keeper.id}/anonymize`, { confirmEmail: keeper.email })).body?.error === 'self_action');
const now1 = await K.call('POST', `/admin/users/${leaver.id}/anonymize`, { confirmEmail: leaver.email.toUpperCase() });
check('« Anonymiser maintenant » : 200 (adresse ressaisie, casse indifférente)', now1.status === 200 && now1.body?.anonymized === true, now1);
const gone = (await sql.query('SELECT email, display_name, status, password_hash, totp_secret_enc FROM users WHERE id = $1', [leaver.id])).rows[0];
check('même anonymisation que la tâche des 30 jours : adresse, nom, mot de passe, statut', gone.status === 'closed' && gone.email === `deleted-${leaver.id}@invalid` && gone.display_name === 'Compte supprimé' && gone.password_hash === '!anonymised', gone);
check('projet non partagé supprimé, sessions supprimées', Number((await sql.query('SELECT count(*)::int AS n FROM projects WHERE id = $1', [leaverProject.id])).rows[0].n) === 0
  && Number((await sql.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [leaver.id])).rows[0].n) === 0);
const entry = (await sql.query("SELECT actor_id, metadata::text AS m FROM admin.audit_log WHERE action = 'admin.user.anonymized_now' AND target_id = $1", [leaver.id])).rows;
check('journal : une entrée admin.user.anonymized_now, acteur = administrateur, sans adresse', entry.length === 1 && entry[0].actor_id === keeper.id && !entry[0].m.includes('@')
  && (await auditCount('account.anonymized', leaver.id)) === 0, entry);
const again = await K.call('POST', `/admin/users/${leaver.id}/anonymize`, { confirmEmail: leaver.email });
check('second appel : 409 already_anonymized, aucune seconde entrée au journal', again.status === 409 && again.body?.error === 'already_anonymized' && (await auditCount('admin.user.anonymized_now', leaver.id)) === 1, again);
check('compte anonymisé : absent de la corbeille, restauration refusée', !(await trashOf(leaver.id)) && (await K.call('POST', `/admin/users/${leaver.id}/restore`)).body?.error === 'already_anonymized');
check('ancienne adresse : connexion impossible', (await agent().call('POST', '/auth/login', { email: leaver.email, password: leaver.password })).status === 401);

// Demandée par l'administration, sur un compte suspendu : « Restaurer » rétablit le statut antérieur.
const paused = await register('corbeille-suspendu');
await K.call('POST', `/admin/users/${paused.id}/suspend`);
const byAdmin = await K.call('DELETE', `/admin/users/${paused.id}`);
check('administration : suppression programmée d’un compte suspendu', byAdmin.status === 202, byAdmin);
const pausedItem = await trashOf(paused.id);
check('corbeille : demandeur « administrateur » nommé, statut antérieur « suspendu »', pausedItem?.requestedBy?.kind === 'admin' && pausedItem.requestedBy.actorId === keeper.id && pausedItem.requestedBy.actorEmail === keeper.email && pausedItem.status === 'suspended', pausedItem);
const restored = await K.call('POST', `/admin/users/${paused.id}/restore`);
const pausedRow = await userRow(paused.id);
check('« Restaurer » : suppression annulée, statut antérieur (suspendu) rétabli', restored.status === 200 && pausedRow.status === 'suspended' && pausedRow.deletion_requested_at === null, { restored, pausedRow });
check('restauration journalisée (admin.user.deletion_cancelled), liens d’annulation consommés', (await auditCount('admin.user.deletion_cancelled', paused.id)) === 1
  && Number((await sql.query("SELECT count(*)::int AS n FROM auth.account_tokens WHERE user_id = $1 AND purpose = 'cancel_deletion' AND used_at IS NULL", [paused.id])).rows[0].n) === 0);
check('restaurer deux fois : 409 not_in_trash', (await K.call('POST', `/admin/users/${paused.id}/restore`)).body?.error === 'not_in_trash');
check('restauré : absent de la corbeille', !(await trashOf(paused.id)));

// Projets partagés possédés : la tâche des 30 jours et « Anonymiser maintenant » refusent pareillement.
const sharer = await register('corbeille-partage');
const sharedProject = (await sharer.a.call('POST', '/projects', { code: `SH-${uid().slice(0, 4)}`, name: 'Projet partagé' })).body;
await sharer.a.call('DELETE', '/auth/me', { password: sharer.password, confirm: 'SUPPRIMER' });
// Partage apparu pendant le délai (horloge et données simulées sur la base jetable) : bloque l'anonymisation.
await partagerEnBase(sql, sharedProject.id, anyone.id, 'lecteur'); // lot OP-PONT : participation + rôle `acces`
check('corbeille : projets partagés signalés', (await trashOf(sharer.id))?.sharedProjects === 1);
const blocked = await K.call('POST', `/admin/users/${sharer.id}/anonymize`, { confirmEmail: sharer.email });
check('projets partagés possédés : 409, rien n’est anonymisé', blocked.status === 409 && blocked.body?.error === 'owns_shared_projects' && blocked.body.projects?.some((p) => p.id === sharedProject.id) && (await userRow(sharer.id)).status === 'active', blocked);
await retirerPartagesEnBase(sql, sharedProject.id);

// Appels simultanés : un seul aboutit (verrou d'éligibilité puis verrou de ligne), un seul journal.
const twice = await Promise.all([1, 2].map(() => K.call('POST', `/admin/users/${sharer.id}/anonymize`, { confirmEmail: sharer.email })));
check('deux appels simultanés : un 200, un 409 already_anonymized', twice.map((r) => r.status).sort().join() === '200,409' && twice.some((r) => r.body?.error === 'already_anonymized'), twice.map((r) => [r.status, r.body?.error]));
check('appels simultanés : une seule entrée au journal', (await auditCount('admin.user.anonymized_now', sharer.id)) === 1);

// Administrateur en suppression programmée : déjà hors des administrateurs actifs, son anonymisation ne retire personne.
const second = await register('corbeille-second-admin');
promote(second.email);
check('second administrateur : suppression programmée', (await K.call('DELETE', `/admin/users/${second.id}`)).status === 202);
const activeBefore = await activeAdminCount();
check('administrateur de la corbeille : anonymisé, rôle retiré, administrateurs actifs inchangés', (await K.call('POST', `/admin/users/${second.id}/anonymize`, { confirmEmail: second.email })).status === 200
  && (await userRow(second.id)).platform_role === 'user' && (await activeAdminCount()) === activeBefore);

await sql.end();
if (failures) {
  console.log(`\n${failures} échec(s) — recette sécurité des comptes NON conforme`);
  process.exit(1);
}
console.log('\n✅ recette sécurité des comptes réussie');
