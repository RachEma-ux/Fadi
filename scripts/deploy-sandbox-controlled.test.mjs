// Deploiement controle du Sandbox (deploy-sandbox-controlled.sh) : syntaxe, migration autorisee identique a init.sql,
// et controle de schema « actif + table sandbox_tool_preferences, rien d'autre » exerce sur des cas construits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const script = fs.readFileSync(path.join(racine, 'scripts/deploy-sandbox-controlled.sh'), 'utf8');
const initSql = fs.readFileSync(path.join(racine, 'apps/api/src/db/init.sql'), 'utf8');

const bloc = (debut, fin) => {
  const i = script.indexOf(debut);
  assert.ok(i >= 0, `repere absent : ${debut}`);
  const j = script.indexOf(fin, i + debut.length);
  assert.ok(j >= 0, `fin absente : ${fin}`);
  return script.slice(i + debut.length, j);
};
const migration = bloc("<<'SQL' || true\n", '\nSQL\n');
const controleSchema = bloc('"$RUN/migration-sandbox.sql" > "$RUN/schema-controle.txt" <<\'PY\'\n', '\nPY\n');

function dossier(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fadi-deploiement-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
function verifier(t, actif, cible) {
  const d = dossier(t);
  const f = (nom, contenu) => {
    const p = path.join(d, nom);
    fs.writeFileSync(p, contenu);
    return p;
  };
  return spawnSync('python3', ['-', f('actif.sql', actif), f('cible.sql', cible), f('bloc.sql', `${migration}\n`)], { input: controleSchema, encoding: 'utf8' });
}

test('syntaxe bash valide', () => {
  execFileSync('bash', ['-n', path.join(racine, 'scripts/deploy-sandbox-controlled.sh')]);
});

test('cible et usage : SHA complet, --depuis exige, aucune migration au demarrage', () => {
  assert.match(script, /^TARGET=[0-9a-f]{40}$/m);
  assert.match(script, /--deploy --depuis/);
  assert.match(script, /\['MIGRATE_ON_START'\]='0'/);
  assert.doesNotMatch(script, /MIGRATE_ON_START'\]='1'/);
  // Version servie par /version : construite avec le SHA cible et verifiee apres bascule.
  assert.match(script, /--build-arg "FADI_COMMIT=\$TARGET" --build-arg "FADI_BUILD_DATE=\$BUILD_DATE"/);
  assert.match(script, /"\$URL\/version"/);
});

test('la seule migration autorisee est copiee mot pour mot de init.sql', () => {
  assert.ok(migration.startsWith('CREATE TABLE IF NOT EXISTS sandbox_tool_preferences ('));
  assert.ok(initSql.includes(migration), 'le bloc du script differe de apps/api/src/db/init.sql');
  // Additive seulement : ni DROP TABLE / COLUMN, ni DELETE FROM, ni UPDATE … SET, ni TRUNCATE, ni INSERT.
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b|\bTRUNCATE\b|\bINSERT\s+INTO\b/i);
});

test('controle de schema : actif + table sandbox admis, schema deja a jour admis, toute autre difference refusee', (t) => {
  const actif = initSql.replace(migration, '');
  assert.notEqual(actif, initSql);
  const plus = verifier(t, actif, initSql);
  assert.equal(plus.status, 0, plus.stderr);
  assert.equal(plus.stdout.trim(), 'SCHEMA_PLUS_TABLE_SANDBOX');

  const deja = verifier(t, initSql, initSql);
  assert.equal(deja.status, 0, deja.stderr);
  assert.equal(deja.stdout.trim(), 'SCHEMA_DEJA_A_JOUR');

  const autre = verifier(t, actif, `${initSql}\nCREATE TABLE IF NOT EXISTS autre_table (id text);\n`);
  assert.notEqual(autre.status, 0);
  assert.match(autre.stderr, /au-dela de la table sandbox_tool_preferences/);

  const sansBloc = verifier(t, actif, actif);
  assert.notEqual(sansBloc.status, 0);
  assert.match(sansBloc.stderr, /absent ou en double/);
});
