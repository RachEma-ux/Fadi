/**
 * DB-3 — base de test jetable attestée (autorisation du propriétaire : Issue #166 ; clé publique enregistrée par le
 * propriétaire dans `apps/api/src/testing/approved-test-authorities.ts`, entrée `owner-db3-2026-10`).
 *
 * Exécuté par la CI (job `validate`) sur le service PostGIS éphémère du job, **après** `npm run db:migrate` :
 *  1. marqueur `fadi_test_meta.provisioning` créé par le compte d'administration du conteneur, lisible mais **non
 *     modifiable** par le rôle de test ;
 *  2. rôle de test = `fadi_app` (D-7 : aucun DDL, ni super-utilisateur, ni CREATEDB / CREATEROLE / REPLICATION /
 *     BYPASSRLS — vérifié ici) ; il reçoit en plus, **dans cette base jetable seulement**, le droit TRUNCATE nécessaire
 *     à la remise à zéro des suites (`resetTestDatabase`) ;
 *  3. identité relevée par une connexion du rôle de test (adresse et port vus du serveur, versions PostgreSQL / PostGIS) ;
 *  4. descripteur canonique lié au run (`gh-<run>-<tentative>`) et au commit, valable 55 min (≤ 1 h exigé par la garde),
 *     signé Ed25519 avec la clé privée du secret `FADI_TEST_DB_SIGNING_KEY` ; la clé publique dérivée doit être
 *     **exactement** celle du registre (sinon refus : le secret ne correspond pas à la clé enregistrée).
 * N'affiche jamais la clé, le mot de passe ni la signature ; seulement des empreintes.
 *
 * Variables : FADI_TEST_DB_SIGNING_KEY (PEM PKCS#8, ou ce PEM encodé en base64), DB3_ADMIN_URL (compte d'administration,
 * base de travail), DB3_DATABASE (`fadi_db3_*`), DB3_TEST_ROLE, DB3_TEST_PASSWORD, DB3_ATTESTATION_FILE,
 * GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_SHA.
 * Code de sortie 78 : secret absent (blocage déclaré, rien n'est provisionné).
 */
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const DOMAIN = 'FADI-TEST-DATABASE/v1\0';
const KEY_ID = 'owner-db3-2026-10';
const env = process.env;
const fail = (code, message) => { console.error(`✗ DB-3 : ${message}`); process.exit(code); };

const rawKey = (env.FADI_TEST_DB_SIGNING_KEY ?? '').trim();
if (!rawKey) fail(78, 'secret FADI_TEST_DB_SIGNING_KEY absent — base attestée non provisionnée');

const database = env.DB3_DATABASE ?? '';
const role = env.DB3_TEST_ROLE ?? '';
const password = env.DB3_TEST_PASSWORD ?? '';
if (!/^fadi_db3_[a-z0-9_]{1,40}$/.test(database)) fail(2, 'DB3_DATABASE doit être une base jetable fadi_db3_*');
if (!/^[a-z][a-z0-9_]{0,62}$/.test(role) || !/^[A-Za-z0-9]{16,128}$/.test(password)) fail(2, 'rôle ou mot de passe de test invalide');
const admin = new URL(env.DB3_ADMIN_URL ?? 'postgresql://invalid');
if (admin.hostname !== '127.0.0.1') fail(2, 'le serveur doit être le service local du job (127.0.0.1)');
if (env.CI !== 'true') fail(2, 'réservé à la CI (base éphémère du job)');
const runId = `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`;
const commitSha = env.GITHUB_SHA ?? '';
if (!/^gh-\d+-\d+$/.test(runId) || !/^[a-f0-9]{40}$/.test(commitSha)) fail(2, 'run ou commit GitHub invalide');

// Clé privée : PEM direct, ou PEM encodé en base64 (secret sur une ligne).
let privateKey;
try {
  const pem = rawKey.includes('-----BEGIN') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf8');
  privateKey = createPrivateKey(pem);
} catch { fail(3, 'FADI_TEST_DB_SIGNING_KEY illisible (PEM PKCS#8 Ed25519 attendu)'); }
if (privateKey.asymmetricKeyType !== 'ed25519') fail(3, 'la clé du secret n\'est pas Ed25519');
const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
const registry = readFileSync(new URL('../../apps/api/src/testing/approved-test-authorities.ts', import.meta.url), 'utf8');
const enrolledB64 = registry.match(/MCowBQYDK2VwAyEA[A-Za-z0-9+/=]+/)?.[0];
if (!enrolledB64 || !Buffer.from(enrolledB64, 'base64').equals(derived)) fail(3, 'la clé du secret ne correspond pas à la clé publique enregistrée (owner-db3-2026-10)');
const fingerprint = createHash('sha256').update(derived).digest('hex').slice(0, 16);

// 1–2. Marqueur protégé et rôle de test au moindre privilège.
const now = Date.now();
const issuedAt = now - 1_000;
const expiresAt = issuedAt + 55 * 60_000;
const markerId = `marker-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`;
const adminUrl = new URL(admin); adminUrl.pathname = `/${database}`;
const a = new pg.Client({ connectionString: adminUrl.toString() });
await a.connect();
try {
  const attrs = (await a.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1', [role])).rows[0];
  if (!attrs) fail(4, `rôle ${role} absent (la migration doit le créer)`);
  if (Object.values(attrs).some((v) => v !== false)) fail(4, `rôle ${role} trop privilégié pour une base de test`);
  await a.query('CREATE SCHEMA fadi_test_meta');
  await a.query('CREATE TABLE fadi_test_meta.provisioning (singleton boolean PRIMARY KEY CHECK (singleton), run_id text NOT NULL, marker_id text NOT NULL, schema_version integer NOT NULL, expires_at_ms bigint NOT NULL)');
  await a.query('INSERT INTO fadi_test_meta.provisioning VALUES (true, $1, $2, 1, $3)', [runId, markerId, expiresAt]);
  await a.query(`GRANT USAGE ON SCHEMA fadi_test_meta TO ${role}`);
  await a.query(`GRANT SELECT ON fadi_test_meta.provisioning TO ${role}`);
  // Remise à zéro des suites (TRUNCATE … CASCADE vers les tables liées) : base jetable seulement, jamais en production.
  await a.query(`GRANT TRUNCATE ON ALL TABLES IN SCHEMA public, auth TO ${role}`);
} finally { await a.end(); }

// 3. Identité vue par le rôle de test ; le marqueur doit être lisible et non modifiable par lui.
const testUrl = `postgresql://${role}:${password}@127.0.0.1:${admin.port || 5432}/${database}`;
const t = new pg.Client({ connectionString: testUrl });
await t.connect();
let identity;
try {
  const row = (await t.query("SELECT pg_catalog.host(pg_catalog.inet_server_addr()) AS addr, pg_catalog.inet_server_port() AS port, pg_catalog.current_setting('server_version_num') AS ver, public.postgis_lib_version() AS postgis")).rows[0];
  identity = { serverAddress: row.addr, serverPort: row.port, serverVersion: row.ver, postgisVersion: row.postgis, markerId };
  let writable = true;
  try { await t.query("UPDATE fadi_test_meta.provisioning SET run_id = run_id"); } catch { writable = false; }
  if (writable) fail(5, 'le marqueur est modifiable par le rôle de test');
} finally { await t.end(); }

// 4. Descripteur canonique signé.
const payload = JSON.stringify({
  schemaVersion: 1, environment: 'ephemeral', disposable: true, runId, commitSha, issuedAt, expiresAt,
  transport: { host: '127.0.0.1', port: Number(admin.port || 5432), database, role },
  tls: { mode: 'disable', ca: '' },
  identity,
});
const signature = sign(null, Buffer.from(DOMAIN + payload), privateKey).toString('base64');
writeFileSync(env.DB3_ATTESTATION_FILE, JSON.stringify({ keyId: KEY_ID, payload, signature }), { mode: 0o600 });
console.log(`✓ DB-3 : base ${database}, rôle ${role} (aucun privilège d'administration), marqueur protégé ${markerId}`);
console.log(`✓ DB-3 : attestation signée par ${KEY_ID} (empreinte ${fingerprint}), run ${runId}, commit ${commitSha.slice(0, 12)}, valable 55 min`);
console.log(`  serveur vu : ${identity.serverAddress}:${identity.serverPort}, PostgreSQL ${identity.serverVersion}, PostGIS ${identity.postgisVersion}`);
