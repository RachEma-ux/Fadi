import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { pool } from "./db/client.js";
import { basculerAncienMoteur } from "./db/bascule.js";
import { applyRolePasswords } from "./db/role-passwords.js";
import { mailRuntime } from "./lib/mailer/index.js";
import { startAccountWorkers } from "./lib/account-jobs.js";

const port = Number(process.env["PORT"] ?? 3001);
const host = process.env["HOST"];

/**
 * `MIGRATE_ON_START=1` (conteneur, hébergement durable) : le schéma idempotent (`db/init.sql`, CREATE … IF NOT EXISTS /
 * ADD COLUMN IF NOT EXISTS) est appliqué avant d'écouter — la même chose que `npm run db:migrate`, sans outil de
 * développement dans l'image.
 */
/**
 * `MIGRATE_ONLY=1` : service de migration à usage unique (docker-compose `migrate`) — applique le schéma et les mots de
 * passe des rôles avec `DATABASE_MIGRATION_URL`, puis s'arrête sans écouter. Le processus de l'API, lui, ne reçoit jamais
 * cet identifiant en production (revue Codex de la PR #255) : voir `refuseMigrationCredential`.
 */
const MIGRATE_ONLY = process.env["MIGRATE_ONLY"] === "1";

async function migrateOnStart(): Promise<void> {
  if (process.env["MIGRATE_ON_START"] !== "1" && !MIGRATE_ONLY) return;
  const sql = readFileSync(fileURLToPath(new URL("./db/init.sql", import.meta.url)), "utf8");
  // D-7 : DDL avec le rôle migrateur quand il est fourni ; l'API elle-même n'a aucun droit DDL.
  const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
  const migrationPool = migrationUrl ? new Pool({ connectionString: migrationUrl, max: 1 }) : pool;
  try {
    await migrationPool.query(sql);
    // eslint-disable-next-line no-console
    console.log("Schema applied (init.sql).");
    const roles = await applyRolePasswords(migrationPool);
    // eslint-disable-next-line no-console
    if (roles.length) console.log(`D-7 : mot de passe appliqué pour ${roles.join(", ")}.`);
    const b = await basculerAncienMoteur(migrationPool);
    // eslint-disable-next-line no-console
    if (b.supprimees) console.log(`Bascule de l'Atelier : ${b.convertis} projet(s) repris dans le modèle typé.`);
  } finally {
    if (migrationPool !== pool) await migrationPool.end();
  }
}

/**
 * D-7 : l'API ne doit pas pouvoir créer d'objets en base. En production, un rôle avec le droit CREATE sur `public`
 * (super-utilisateur, propriétaire) est refusé au démarrage ; en développement, simple avertissement.
 * `ALLOW_PRIVILEGED_DB_ROLE=1` n'existe que pour le retour arrière documenté (ancienne DATABASE_URL, RUNBOOK.md).
 */
/**
 * D-7 : en production, le processus qui sert l'API ne détient pas l'identifiant de migration (administrateur de la base) —
 * sinon une compromission du processus le relirait dans son environnement et contournerait `fadi_app`. La migration se
 * fait dans le service à usage unique (`MIGRATE_ONLY=1`). `ALLOW_PRIVILEGED_DB_ROLE=1` reste réservé au retour arrière.
 */
function refuseMigrationCredential(): void {
  if (MIGRATE_ONLY || !process.env["DATABASE_MIGRATION_URL"]) return;
  const message = "DATABASE_MIGRATION_URL est fourni au processus de l'API : la migration doit tourner dans le service à usage unique (MIGRATE_ONLY=1, docker-compose `migrate`), jamais dans l'API (D-7, RUNBOOK.md).";
  if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_PRIVILEGED_DB_ROLE"] !== "1") throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ level: "warn", message }));
}

async function checkLeastPrivilege(): Promise<void> {
  const { rows } = await pool.query("SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create, current_user AS role");
  const row = rows[0] as { can_create: boolean; role: string } | undefined;
  if (!row?.can_create) return;
  const message = `Le rôle de connexion de l'API (${row.role}) peut créer des objets dans le schéma public : utilisez fadi_app (D-7, RUNBOOK.md).`;
  if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_PRIVILEGED_DB_ROLE"] !== "1") throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ level: "warn", message }));
}
Promise.resolve()
  .then(refuseMigrationCredential)
  .then(migrateOnStart)
  .then(async () => {
    if (!MIGRATE_ONLY) return;
    // eslint-disable-next-line no-console
    console.log("Migration terminée (MIGRATE_ONLY) : arrêt sans écouter.");
    await pool.end();
    process.exit(0);
  })
  .then(checkLeastPrivilege)
  .then(() => {
    // Courriel (D-1) : configuration invalide = refus de démarrer (MAIL_FROM ≠ SMTP_USER, console en production…).
    const { config } = mailRuntime();
    // eslint-disable-next-line no-console
    console.log(`Courriel : transport ${config.transport}${config.transport === "disabled" ? " (aucun envoi : liens à copier affichés)" : ""}${config.transport === "smtp" ? (config.allowReservedDomains ? " ; domaines réservés envoyés (MAIL_ALLOW_RESERVED_DOMAINS, serveur de capture)" : " ; domaines réservés jamais envoyés") : ""}.`);
    // File de courriels et anonymisation différée (D-5) ; `ACCOUNT_WORKERS=0` les coupe (deuxième processus, outils).
    if (process.env["ACCOUNT_WORKERS"] !== "0") startAccountWorkers();
    const app = createApp();
    const server = app.listen(host ? { port, host } : { port }, () => {
      // eslint-disable-next-line no-console
      console.log(`Fadi API listening on :${port}${process.env["WEB_DIST"] ? " (sert aussi l'application)" : ""}`);
    });
    // Connexions persistantes gardées plus longtemps que celles des relais et des clients (60 s) : un client qui
    // réutilise une connexion au moment où le serveur la ferme recevrait sinon un ECONNRESET.
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: (err as Error).message }));
    process.exit(1);
  });
