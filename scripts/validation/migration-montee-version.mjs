/**
 * BD-2.6 (chantier base-donnees, constat M8) : contrôle de montée de version du schéma.
 *
 * La CI appliquait jusqu'ici le schéma sur une base neuve seulement. Ce contrôle part du schéma de la branche cible
 * (`origin/main` par défaut, ou `MIGRATION_BASE_REF`), puis applique les migrations du HEAD comme en production
 * (`apps/api/src/db/migrate.ts`), deux fois :
 *   1. la montée réussit et écrit « Schema applied (init.sql). » (contrôle de la préproduction) ;
 *   2. le second passage n'applique plus rien (aucune reprise de verrous, aucune migration rejouée) ;
 *   3. `schema_migrations` contient la base de départ et chaque fichier numéroté du dépôt, avec son empreinte.
 * Base jetable créée puis supprimée sur le serveur du job (`DATABASE_URL`, super-utilisateur de la CI).
 *
 *   DATABASE_URL=postgresql://fadi:…@localhost:5432/fadi_test node scripts/validation/migration-montee-version.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const racine = fileURLToPath(new URL('../..', import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL manquant'); process.exit(2); }
const ref = process.env.MIGRATION_BASE_REF || 'origin/main';
const nomBase = `fadi_montee_${process.pid}`;
const echecs = [];
const verifier = (ok, message, detail) => { console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${message}`); if (!ok) echecs.push({ message, detail }); };

let ancienSql;
try {
  ancienSql = execFileSync('git', ['show', `${ref}:apps/api/src/db/init.sql`], { cwd: racine, encoding: 'utf8', maxBuffer: 32_000_000 });
} catch {
  console.log(`Référence ${ref} introuvable (clone superficiel ?) : contrôle de montée de version non exécuté.`);
  process.exit(0);
}

const urlBase = (nom) => { const u = new URL(url); u.pathname = `/${nom}`; return u.toString(); };
const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`CREATE DATABASE ${nomBase}`);
try {
  const ancienne = new pg.Client({ connectionString: urlBase(nomBase) });
  await ancienne.connect();
  await ancienne.query(ancienSql);
  await ancienne.end();
  console.log(`Schéma de ${ref} appliqué sur ${nomBase}.`);

  const migrer = () => execFileSync('npx', ['tsx', 'apps/api/src/db/migrate.ts'], {
    cwd: racine, encoding: 'utf8', env: { ...process.env, DATABASE_MIGRATION_URL: urlBase(nomBase), DATABASE_URL: urlBase(nomBase) },
  });
  const premier = migrer();
  verifier(premier.includes('Schema applied (init.sql).'), 'montée de version : « Schema applied (init.sql). » écrit', premier);
  const second = migrer();
  verifier(/Base de départ inchangée ; 0 migration\(s\) appliquée\(s\)\./.test(second), 'second passage : rien n\'est rejoué', second);

  const c = new pg.Client({ connectionString: urlBase(nomBase) });
  await c.connect();
  const lignes = (await c.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows;
  const empreinte = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
  const dossier = new URL('../../apps/api/src/db/migrations/', import.meta.url);
  const attendues = [['0000', empreinte(readFileSync(new URL('../../apps/api/src/db/init.sql', import.meta.url), 'utf8'))]];
  for (const n of readdirSync(dossier).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) attendues.push([n.slice(0, 4), empreinte(readFileSync(new URL(n, dossier), 'utf8'))]);
  verifier(JSON.stringify(lignes.map((l) => [l.version, l.checksum])) === JSON.stringify(attendues), `schema_migrations : base de départ et ${attendues.length - 1} migration(s) du dépôt enregistrées avec leur empreinte`, { lignes, attendues });
  const invalides = (await c.query('SELECT indexrelid::regclass::text AS i FROM pg_index WHERE NOT indisvalid')).rows;
  verifier(invalides.length === 0, 'aucun index invalide après la montée', invalides);
  await c.end();
} finally {
  await admin.query(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  await admin.end();
}
if (echecs.length) { console.error(JSON.stringify(echecs, null, 2)); process.exit(1); }
console.log('Montée de version du schéma : contrôles réussis.');
