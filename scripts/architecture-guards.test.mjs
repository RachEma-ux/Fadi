import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkModuleDependencies } from './check-module-deps.mjs';
import { checkIsolation } from './check-fadi-isolation.mjs';

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fadi-guards-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = {
    'packages/a/manifest.json': JSON.stringify({ name: '@test/a', allowedDependencies: [] }),
    'packages/a/package.json': JSON.stringify({ name: '@test/a', types: './src/index.ts' }),
    'packages/a/src/index.ts': 'export const a = 1;',
    'apps/web/package.json': '{"name":"@test/web"}',
    'apps/web/src/index.ts': 'export const web = 1;',
    'apps/api/package.json': '{"name":"@test/api"}',
    'apps/api/src/index.ts': 'export const api = 1;',
    ...files,
  };
  for (const [name, body] of Object.entries(data)) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
  }
  return root;
}
function modular(name, files, rule) {
  test(name, t => {
    const result = checkModuleDependencies(fixture(t, files));
    if (rule) assert.ok(result.errors.some(e => e.includes(rule)), JSON.stringify(result));
    else assert.deepEqual(result.errors, []);
  });
}
const b = {
  'packages/b/manifest.json': '{"name":"@test/b","allowedDependencies":[]}',
  'packages/b/package.json': '{"name":"@test/b","types":"./src/index.ts"}',
  'packages/b/src/index.ts': 'export const b = 2;',
};
modular('M01 témoin : paquet pur conforme', {}, null);
modular('M02 paquet tiers interdit', { 'packages/a/src/index.ts': 'import React from "react";' }, 'UNDECLARED_PACKAGE');
modular('M03 chemin relatif web -> API (.js résolu en .ts)', { 'apps/web/src/probe.ts': 'import {api} from "../../api/src/index.js";' }, 'FORBIDDEN_BOUNDARY');
modular('M04 chemin relatif vers paquet hors manifeste', { ...b, 'packages/a/src/index.ts': 'import {b} from "../../b/src/index.js";' }, 'UNDECLARED_PACKAGE');
modular('M05 frontière entre ontologies du même paquet', { 'packages/a/src/ontologies/mechanical/index.ts': 'export {n} from "../timber/index.js";', 'packages/a/src/ontologies/timber/index.ts': 'export const n=1;' }, 'ONTOLOGY_BOUNDARY');
modular('M06 import dynamique calculé refusé', { 'packages/a/src/index.ts': 'const name="react"; export const p=import(name);' }, 'NON_LITERAL_IMPORT');
modular('M07 cycle déclaré', { ...b, 'packages/a/manifest.json': '{"name":"@test/a","allowedDependencies":["@test/b"]}', 'packages/b/manifest.json': '{"name":"@test/b","allowedDependencies":["@test/a"]}' }, 'DEPENDENCY_CYCLE');
modular('Import relatif autorisé par le manifeste', { ...b, 'packages/a/manifest.json': '{"name":"@test/a","allowedDependencies":["@test/b"]}', 'packages/a/src/index.ts': 'import {b} from "../../b/src/index.js"; export const a=b;' }, null);
modular('Graphe déclaré acyclique', { ...b, 'packages/a/manifest.json': '{"name":"@test/a","allowedDependencies":["@test/b"]}' }, null);
modular('Alias tsconfig vers API détecté', { 'apps/web/tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@private/*":["../api/src/*"]}}}', 'apps/web/src/probe.ts': 'import {api} from "@private/index";' }, 'FORBIDDEN_BOUNDARY');
modular('Alias tsconfig interne autorisé', { 'apps/web/tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@ui/*":["src/*"]}}}', 'apps/web/src/probe.ts': 'import {web} from "@ui/index";' }, null);
modular('Alias tsconfig de paquet hors manifeste détecté', { ...b, 'packages/a/tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@b/*":["../b/src/*"]}}}', 'packages/a/src/index.ts': 'import {b} from "@b/index";' }, 'UNDECLARED_PACKAGE');
modular('API -> web interdit', { 'apps/api/src/probe.ts': 'import {web} from "../../web/src/index.js";' }, 'FORBIDDEN_BOUNDARY');
modular('Paquet pur -> application interdit', { 'packages/a/src/index.ts': 'import {web} from "../../../apps/web/src/index.js";' }, 'FORBIDDEN_BOUNDARY');
modular('Réexport détecté même en ligne', { 'apps/web/src/probe.ts': 'const x=1; export {api} from "../../api/src/index.js";' }, 'FORBIDDEN_BOUNDARY');
modular('Import dynamique littéral autorisé', { 'packages/a/src/probe.ts': 'export const p=import("./index.js");' }, null);
modular('Import dynamique littéral interdit', { 'apps/web/src/probe.ts': 'export const p=import("../../api/src/index.js");' }, 'FORBIDDEN_BOUNDARY');
modular('Template string littéral analysé', { 'apps/web/src/probe.ts': 'export const p=import(`../../api/src/index.js`);' }, 'FORBIDDEN_BOUNDARY');
modular('Template calculé refusé', { 'apps/web/src/probe.ts': 'export const p=import(`./${name}.js`);' }, 'NON_LITERAL_IMPORT');
modular('require CommonJS analysé', { 'apps/web/src/probe.cjs': 'const x=require("../../api/src/index.js");' }, 'FORBIDDEN_BOUNDARY');
modular('require calculé refusé', { 'packages/a/src/probe.cts': 'const x=require(name);' }, 'NON_LITERAL_IMPORT');
modular('import type() analysé dans d.ts', { 'apps/web/src/probe.d.ts': 'type X=import("../../api/src/index.js");' }, 'FORBIDDEN_BOUNDARY');
modular('Import equals analysé', { 'apps/web/src/probe.cts': 'import X = require("../../api/src/index.js");' }, 'FORBIDDEN_BOUNDARY');
modular('Commentaires et textes ressemblant à des imports ignorés', { 'packages/a/src/probe.ts': '// import("react")\nconst text = "import React from react"; export const x = "window.location";' }, null);
modular('API navigateur dans paquet pur refusée', { 'packages/a/src/index.ts': 'export const x=window.location;' }, 'BROWSER_API');
modular('Dépendances vitest et node permises dans tests', { 'packages/a/src/index.test.ts': 'import {test} from "vitest"; import fs from "node:fs";' }, null);
modular('Import local introuvable bloque', { 'packages/a/src/probe.ts': 'import "./absent.js";' }, 'UNRESOLVED_LOCAL_IMPORT');
modular('Source extérieure au dépôt refusée', { 'apps/web/src/probe.ts': 'import "/etc/passwd";' }, 'OUTSIDE_REPOSITORY');
modular('Import HTTP refusé', { 'apps/web/src/probe.ts': 'import "https://example.invalid/module.js";' }, 'REMOTE_IMPORT');
modular('import.meta.glob ne passe pas silencieusement', { 'apps/web/src/probe.ts': 'const x=import.meta.glob("./*.ts");' }, 'NON_LITERAL_IMPORT');
modular('Manifeste incohérent refusé', { 'packages/a/manifest.json': '{"name":"@other/a","allowedDependencies":[]}' }, 'MANIFEST_NAME');
modular('Cycle auto-référencé refusé', { 'packages/a/manifest.json': '{"name":"@test/a","allowedDependencies":["@test/a"]}' }, 'DEPENDENCY_CYCLE');
modular('Erreur syntaxique du fichier refusée', { 'packages/a/src/index.ts': 'export const = ;' }, 'PARSE_ERROR');
modular('JSON malformé refusé', { 'packages/a/manifest.json': '{broken' }, 'CONFIG_INVALID');
modular('Imports dans une même ontologie autorisés', { 'packages/a/src/ontologies/mechanical/a.ts': 'import "./b.js";', 'packages/a/src/ontologies/mechanical/b.ts': 'export {};' }, null);
test('Source symbolique refuse le contournement', t => {
  const root=fixture(t); fs.symlinkSync(path.join(root,'apps/api/src/index.ts'),path.join(root,'apps/web/src/link.ts'));
  assert.ok(checkModuleDependencies(root).errors.some(e => e.includes('SYMLINK')));
});
function isolation(name, files, fail) {
  test(name,t => { const r=checkIsolation(fixture(t,files)); assert.equal(r.errors.length > 0, fail, JSON.stringify(r)); });
}
isolation('I01 référence nominale dans le code', { 'apps/web/src/probe.ts': 'const x="DrawAll";' }, true);
isolation('I02 lockfile racine', { 'package-lock.json': '{"packages":{"node_modules/drawall":{"version":"1.0.0"}}}' }, true);
isolation('I03 SVG', { 'apps/web/public/icon.svg': '<svg><title>DrawAll</title></svg>' }, true);
isolation('I04 identifiants DA historiques conservés', { 'apps/web/src/probe.ts': 'const fiche="DA-10-01";' }, false);
isolation('Lockfiles et graphie alternative', { 'pnpm-lock.yaml': 'package: draw-all' }, true);
isolation('Configuration Docker', { 'docker-compose.yml': 'image: draw_all:latest' }, true);
isolation('Sous-module externe nommé', { '.gitmodules': 'url=https://github.com/other/DrawAll.git' }, true);
isolation('Référence dans chemin de ressource', { 'apps/web/public/drawall.txt': 'x' }, true);
isolation('Configuration infra', { 'infra/config.yml': 'url: https://other.invalid/DrawAll' }, true);
isolation('Métadonnée lisible dans un binaire', { 'apps/web/public/asset.bin': Buffer.from('\0DrawAll\0') }, true);
isolation('Historique documentaire explicitement hors périmètre', { 'packages/a/README.md': 'Historique DrawAll, non normatif.' }, false);
test('Les exclusions documentaires et les binaires sont comptés', t => {
  const r=checkIsolation(fixture(t,{'packages/a/README.md':'Historique','apps/web/public/x.bin':Buffer.from([0,1,2])}));
  assert.deepEqual(r.errors,[]); assert.equal(r.binaryFiles.length,1); assert.equal(r.excludedDocs.length,1);
});
test('Configuration symbolique refuse le contournement', t => {
  const root=fixture(t); fs.symlinkSync(path.join(root,'apps/web/package.json'),path.join(root,'package-lock.json'));
  assert.ok(checkIsolation(root).errors.some(e=>e.includes('symbolique')));
});
