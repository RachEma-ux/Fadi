import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkModuleDependencies } from './check-module-deps.mjs';

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
modular('Paquet npm non hissé reste une dépendance externe à autoriser', {
  'packages/a/src/index.ts': 'import {n} from "third-party";',
  'packages/a/node_modules/third-party/package.json': '{"name":"third-party","types":"index.d.ts"}',
  'packages/a/node_modules/third-party/index.d.ts': 'export declare const n: number;',
}, 'UNDECLARED_PACKAGE');
modular('Paquet npm non hissé autorisé par manifeste', {
  'packages/a/manifest.json': '{"name":"@test/a","allowedDependencies":["third-party"]}',
  'packages/a/src/index.ts': 'import {n} from "third-party";',
  'packages/a/node_modules/third-party/package.json': '{"name":"third-party","types":"index.d.ts"}',
  'packages/a/node_modules/third-party/index.d.ts': 'export declare const n: number;',
}, null);
modular('Alias commençant par # résolu avant vérification de frontière', {
  'apps/web/tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"#api/*":["../api/src/*"]}}}',
  'apps/web/src/probe.ts': 'import {api} from "#api/index";',
}, 'FORBIDDEN_BOUNDARY');
