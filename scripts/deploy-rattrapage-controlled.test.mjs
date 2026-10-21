// Deploiement controle de rattrapage (deploy-rattrapage-controlled.sh) : syntaxe, garde-fous, et controle de schema
// « evolution additive seulement » (CONTROLE_SCHEMA) exerce sur des cas construits a partir de init.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const chemin = path.join(racine, 'scripts/deploy-rattrapage-controlled.sh');
const script = fs.readFileSync(chemin, 'utf8');
const initSql = fs.readFileSync(path.join(racine, 'apps/api/src/db/init.sql'), 'utf8');

const entre = (debut, fin) => {
  const i = script.indexOf(debut);
  assert.ok(i >= 0, `repere absent : ${debut}`);
  const j = script.indexOf(fin, i + debut.length);
  assert.ok(j >= 0, `fin absente : ${fin}`);
  return script.slice(i + debut.length, j);
};
const controleSchema = entre('"$RUN/schema-controle.txt" <<\'PY\'\n', '\nPY\n');

function controler(t, actif, cible) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fadi-rattrapage-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const f = (nom, contenu) => {
    const p = path.join(d, nom);
    fs.writeFileSync(p, contenu);
    return p;
  };
  return spawnSync('python3', ['-', f('actif.sql', actif), f('cible.sql', cible)], { input: controleSchema, encoding: 'utf8' });
}
const refuse = (r, motif) => {
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, motif);
};

test('syntaxe bash valide', () => {
  execFileSync('bash', ['-n', chemin]);
});

test('cible, usage et garde-fous : SHA complet, --depuis exige, aucune migration au demarrage, version construite', () => {
  assert.match(script, /^TARGET=[0-9a-f]{40}$/m);
  assert.match(script, /--deploy --depuis/);
  assert.match(script, /\['MIGRATE_ON_START'\]='0'/);
  assert.doesNotMatch(script, /MIGRATE_ON_START'\]='1'/);
  assert.match(script, /--build-arg "FADI_COMMIT=\$TARGET" --build-arg "FADI_BUILD_DATE=\$BUILD_DATE"/);
  assert.match(script, /"\$URL\/version"/);
  // Migration : le schema de la cible, dans une seule transaction, arretee a la premiere erreur.
  assert.match(script, /psql -U fadi -d fadi -v ON_ERROR_STOP=1 --single-transaction < "\$RUN\/source\/apps\/api\/src\/db\/init.sql"/);
  // Exploitation : paires de versions relues (blob avant, blob apres) ; les autres fichiers sont figes.
  for (const ligne of entre("OPS_ADMIS='", "'\n").split('\n')) assert.match(ligne, /^\S+ [0-9a-f]{40} [0-9a-f]{40}$/);
  assert.match(script, /^OPS_FIGES='docker-compose\.yml scripts\/backup\.sh scripts\/restore\.sh apps\/api\/src\/db\/bascule\.ts'$/m);
});

test('schema : deja a jour, ou ajouts seulement (tables, colonnes facultatives), admis', (t) => {
  const deja = controler(t, initSql, initSql);
  assert.equal(deja.status, 0, deja.stderr);
  assert.equal(deja.stdout.trim(), 'SCHEMA_DEJA_A_JOUR');

  // Actif = init.sql sans la table du Sandbox : la cible n'ajoute qu'une table nouvelle.
  const bloc = initSql.slice(initSql.indexOf('CREATE TABLE IF NOT EXISTS sandbox_tool_preferences'), initSql.indexOf('NOT VALID;', initSql.indexOf('sandbox_tool_preferences_lists_check')) + 'NOT VALID;'.length);
  assert.ok(bloc.length > 100);
  const plus = controler(t, initSql.replace(bloc, ''), initSql);
  assert.equal(plus.status, 0, plus.stderr);
  assert.match(plus.stdout, /^SCHEMA_ADDITIF lignes_ajoutees=\d+ tables_nouvelles=1$/m);

  const colonne = controler(t, initSql, `${initSql}\nALTER TABLE users ADD COLUMN IF NOT EXISTS essai_facultatif jsonb;\n`);
  assert.equal(colonne.status, 0, colonne.stderr);
});

test('schema : toute suppression, reecriture ou modification d une table existante est refusee', (t) => {
  const ligneActive = initSql.split('\n').find((l) => l.startsWith('CREATE TABLE IF NOT EXISTS sessions'));
  assert.ok(ligneActive);
  refuse(controler(t, initSql, initSql.replace(ligneActive, '')), /Schema actif modifie ou retire/);
  refuse(controler(t, initSql, `${initSql}\nDROP TABLE IF EXISTS sessions;\n`), /non additive/);
  refuse(controler(t, initSql, `${initSql}\nDELETE FROM sessions;\n`), /non additive/);
  refuse(controler(t, initSql, `${initSql}\nUPDATE users SET email = lower(email);\n`), /non additive/);
  refuse(controler(t, initSql, `${initSql}\nALTER TABLE users ALTER COLUMN email TYPE varchar(80);\n`), /non additive/);
  refuse(controler(t, initSql, `${initSql}\nALTER TABLE users ADD COLUMN IF NOT EXISTS obligatoire text NOT NULL DEFAULT 'x';\n`), /Table existante modifiee/);
  refuse(controler(t, initSql, `${initSql}\nCREATE UNIQUE INDEX IF NOT EXISTS users_essai ON users (email);\n`), /Index ou declencheur pose sur une table existante/);
});
