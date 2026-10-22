#!/usr/bin/env node
/**
 * DB-3 (Issue #157, accord du maître d'ouvrage du 22 octobre 2026) : prépare une base de test JETABLE et signe son
 * attestation, pour que les suites API qui exigent une base réelle tournent derrière la garde DB-1/2.
 *
 * Ce script ne contourne pas la garde : il produit exactement ce qu'elle vérifie (apps/api/src/testing/) —
 *  - un rôle de test sans privilège d'administration (ni superuser, createdb, createrole, replication, bypassrls),
 *    qui lit et écrit les tables de `public` (et peut y créer les tables qu'une suite de migration reconstitue) ;
 *  - le marqueur `fadi_test_meta.provisioning`, propriété de l'administrateur, lisible et non modifiable par le
 *    rôle de test ;
 *  - un descripteur signé Ed25519 (domaine `FADI-TEST-DATABASE/v1\0`, au plus 55 minutes), lié au run, au commit,
 *    au serveur, aux versions PostgreSQL / PostGIS et au marqueur.
 * La clé privée vient de FADI_TEST_DB_SIGNING_KEY (secret GitHub, jamais dans le dépôt) ; sa clé publique doit
 * déjà figurer, sous DB3_KEY_ID, dans le registre relu `approved-test-authorities.ts` : rien n'est enrôlé ici.
 *
 * Entrées (environnement) :
 *   DB3_ADMIN_URL              postgresql://admin:…@127.0.0.1:port/base (rôle propriétaire de la base jetable)
 *   FADI_TEST_DB_SIGNING_KEY   clé privée Ed25519 au format PEM (PKCS#8)
 *   DB3_KEY_ID                 identifiant de la clé dans le registre
 *   DB3_RUN_ID, DB3_COMMIT_SHA identifiants du run et commit (40 hexadécimaux)
 *   DB3_SORTIE                 dossier où écrire attestation.json (0600) et env (variables TEST_DATABASE_*)
 * Le mot de passe du rôle de test est tiré au hasard à chaque préparation ; il n'est jamais affiché.
 */
import { createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DOMAINE = "FADI-TEST-DATABASE/v1\0";
const ROLE = "fadi_test";
const DUREE_MS = 55 * 60 * 1000;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRE = join(RACINE, "apps/api/src/testing/approved-test-authorities.ts");

function echec(message) { console.error(`DB-3 : ${message}`); process.exit(1); }
function exiger(nom, motif) {
  const valeur = process.env[nom];
  if (!valeur || (motif && !motif.test(valeur))) echec(`${nom} absent ou invalide`);
  return valeur;
}

const adminUrl = exiger("DB3_ADMIN_URL");
const cle = exiger("FADI_TEST_DB_SIGNING_KEY");
const keyId = exiger("DB3_KEY_ID", /^[a-zA-Z0-9_-]{1,100}$/);
const runId = exiger("DB3_RUN_ID", /^[a-zA-Z0-9_-]{1,100}$/);
const commitSha = exiger("DB3_COMMIT_SHA", /^[a-f0-9]{40}$/);
const sortie = exiger("DB3_SORTIE");
if (Object.entries(process.env).some(([k, v]) => k.startsWith("PG") && v)) echec("variables PG* présentes : la garde les refuse");

let privee, publique;
try {
  privee = createPrivateKey(cle);
  publique = createPublicKey(privee).export({ type: "spki", format: "pem" }).toString();
} catch { echec("FADI_TEST_DB_SIGNING_KEY illisible (PEM Ed25519 attendu)"); }
if (privee.asymmetricKeyType !== "ed25519") echec("la clé de signature doit être Ed25519");
// La clé publique doit déjà être enrôlée sous keyId dans le registre relu (aucun enrôlement ici).
const corps = publique.replace(/-----[A-Z ]+-----|\s/g, "");
const registre = readFileSync(REGISTRE, "utf8");
const entree = registre.match(new RegExp(`["']${keyId}["']\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
if (!entree || entree[1].replace(/-----[A-Z ]+-----|\\n|\s/g, "") !== corps) {
  echec(`la clé publique de FADI_TEST_DB_SIGNING_KEY n'est pas enrôlée sous « ${keyId} » dans approved-test-authorities.ts`);
}

const admin = new URL(adminUrl);
if (admin.hostname !== "127.0.0.1" || !admin.port) echec("DB3_ADMIN_URL doit viser 127.0.0.1 avec un port explicite (base jetable locale)");
const base = decodeURIComponent(admin.pathname.slice(1));
if (!/^[a-z][a-z0-9_]{0,62}$/.test(base)) echec("nom de base invalide");
const motDePasse = randomBytes(24).toString("hex");
const markerId = `marqueur-${randomBytes(8).toString("hex")}`;
const issuedAt = Date.now();
const expiresAt = issuedAt + DUREE_MS;

const sql = new pg.Client({ connectionString: adminUrl });
await sql.connect();
try {
  await sql.query("BEGIN");
  const existe = await sql.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1", [ROLE]);
  const attributs = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT";
  await sql.query(`${existe.rowCount ? "ALTER" : "CREATE"} ROLE ${ROLE} ${attributs} PASSWORD '${motDePasse}'`);
  await sql.query(`GRANT CONNECT ON DATABASE ${base} TO ${ROLE}`);
  // CREATE sur public : une suite reconstitue une base d'avant le lot 4 (table atelier_store créée puis supprimée).
  await sql.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${ROLE}`);
  await sql.query(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  await sql.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`);
  // Marqueur : propriété de l'administrateur, lecture seule pour le rôle de test.
  await sql.query("CREATE SCHEMA IF NOT EXISTS fadi_test_meta");
  await sql.query(`CREATE TABLE IF NOT EXISTS fadi_test_meta.provisioning (
    singleton boolean PRIMARY KEY CHECK (singleton), run_id text NOT NULL, marker_id text NOT NULL,
    schema_version integer NOT NULL, expires_at_ms bigint NOT NULL)`);
  await sql.query(`REVOKE ALL ON SCHEMA fadi_test_meta FROM PUBLIC, ${ROLE}`);
  await sql.query(`REVOKE ALL ON fadi_test_meta.provisioning FROM PUBLIC, ${ROLE}`);
  await sql.query(`GRANT USAGE ON SCHEMA fadi_test_meta TO ${ROLE}`);
  await sql.query(`GRANT SELECT ON fadi_test_meta.provisioning TO ${ROLE}`);
  await sql.query(`INSERT INTO fadi_test_meta.provisioning VALUES (true, $1, $2, 1, $3)
    ON CONFLICT (singleton) DO UPDATE SET run_id = EXCLUDED.run_id, marker_id = EXCLUDED.marker_id,
      schema_version = 1, expires_at_ms = EXCLUDED.expires_at_ms`, [runId, markerId, expiresAt]);
  await sql.query("COMMIT");
} catch (error) {
  await sql.query("ROLLBACK").catch(() => undefined);
  echec(`préparation de la base refusée (${error.code ?? "erreur"})`);
} finally { await sql.end(); }

// Identité observée par le rôle de test lui-même, par le même transport que la garde.
const test = new pg.Client({ host: "127.0.0.1", port: Number(admin.port), database: base, user: ROLE, password: motDePasse });
await test.connect();
let identite;
try {
  ({ rows: [identite] } = await test.query(`SELECT pg_catalog.host(pg_catalog.inet_server_addr()) AS adresse, pg_catalog.inet_server_port() AS port,
    pg_catalog.current_setting('server_version_num') AS version, public.postgis_lib_version() AS postgis`));
  // Le rôle de test ne doit pas pouvoir modifier le marqueur.
  const ecriture = await test.query("UPDATE fadi_test_meta.provisioning SET run_id = run_id").then(() => true, () => false);
  if (ecriture) echec("le rôle de test peut modifier le marqueur");
} finally { await test.end(); }

const descripteur = {
  schemaVersion: 1, environment: "ephemeral", disposable: true, runId, commitSha, issuedAt, expiresAt,
  transport: { host: "127.0.0.1", port: Number(admin.port), database: base, role: ROLE },
  tls: { mode: "disable", ca: "" },
  identity: { serverAddress: identite.adresse, serverPort: identite.port, serverVersion: identite.version, postgisVersion: identite.postgis, markerId },
};
const payload = JSON.stringify(descripteur);
const signature = sign(null, Buffer.from(DOMAINE + payload), privee).toString("base64");

mkdirSync(sortie, { recursive: true, mode: 0o700 });
const fichier = join(sortie, "attestation.json");
writeFileSync(fichier, JSON.stringify({ keyId, payload, signature }), { mode: 0o600 });
const url = `postgresql://${ROLE}:${motDePasse}@127.0.0.1:${admin.port}/${base}`;
writeFileSync(join(sortie, "env"), [
  `TEST_DATABASE_URL=${url}`, `TEST_DATABASE_RUN_ID=${runId}`, `TEST_DATABASE_COMMIT_SHA=${commitSha}`,
  `TEST_DATABASE_ATTESTATION_FILE=${fichier}`, "",
].join("\n"), { mode: 0o600 });
console.log(`DB-3 : base « ${base} » préparée (rôle ${ROLE} sans privilège d'administration, marqueur ${markerId}), attestation signée par « ${keyId} », valable jusqu'à ${new Date(expiresAt).toISOString()}.`);
