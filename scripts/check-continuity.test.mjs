import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  REQUIRED_FILES,
  validateRepository,
  validateWorkstream,
  validateChangedPaths,
  initializeWorkstream,
  statusReport,
} from './continuity.mjs';

function isolatedCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fadi-continuity-'));
  const dst = path.join(root, 'docs/workstreams/architecture-webapp');
  fs.mkdirSync(dst, { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'docs/workstreams/README.md'), path.join(root, 'docs/workstreams/README.md'));
  for (const name of REQUIRED_FILES) {
    fs.copyFileSync(path.join(REPO_ROOT, 'docs/workstreams/architecture-webapp', name), path.join(dst, name));
  }
  return { root, dst };
}

test('référentiel de continuité réellement présent et valide', () => {
  assert.deepEqual(validateRepository(REPO_ROOT), []);
});

test('dossier de chantier complet valide', (t) => {
  const { root } = isolatedCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(validateWorkstream(root, 'architecture-webapp'), []);
});

test('HANDOFF.md manquant = échec explicite', (t) => {
  const { root, dst } = isolatedCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.unlinkSync(path.join(dst, 'HANDOFF.md'));
  assert.ok(validateWorkstream(root, 'architecture-webapp').some((s) => s.includes('HANDOFF.md manquant')));
});

test('en-tête de reprise absent = échec explicite', (t) => {
  const { root, dst } = isolatedCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(dst, 'HANDOFF.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Prochaine action', '## Prochaine tâche'));
  assert.ok(validateWorkstream(root, 'architecture-webapp').some((s) => s.includes('Prochaine action')));
});

test('modèle incomplet, conflit Git ou secret détectés', (t) => {
  const { root, dst } = isolatedCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(dst, 'HANDOFF.md');
  fs.appendFileSync(file, '\n__TASK_UNSET__\n<<<<<<< HEAD\n-----BEGIN OPENSSH PRIVATE KEY-----\n');
  const issues = validateWorkstream(root, 'architecture-webapp');
  assert.ok(issues.some((s) => s.includes('modèle')));
  assert.ok(issues.some((s) => s.includes('conflit')));
  assert.ok(issues.some((s) => s.includes('clé privée')));
});

test('un changement de chantier exige STATUS et HANDOFF dans le même diff', () => {
  const prefix = 'docs/workstreams/architecture-webapp/';
  assert.equal(validateChangedPaths([prefix + 'CONTEXT.md']).length, 2);
  assert.equal(validateChangedPaths([prefix + 'HANDOFF.md']).length, 1);
  assert.deepEqual(validateChangedPaths([prefix + 'CONTEXT.md', prefix + 'STATUS.md', prefix + 'HANDOFF.md']), []);
  assert.deepEqual(validateChangedPaths(['apps/api/src/index.ts']), []);
});

test('dates STATUS/HANDOFF divergentes sont refusées', (t) => {
  const { root, dst } = isolatedCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(dst, 'STATUS.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Mis à jour : 2026-10-17', 'Mis à jour : 2026-10-18'));
  assert.ok(validateWorkstream(root, 'architecture-webapp').some((s) => s.includes('Dates STATUS/HANDOFF')));
});

test('initialisation locale produit quatre fichiers complets et met à jour l’index', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fadi-init-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, 'docs/continuity/templates');
  fs.mkdirSync(base, { recursive: true });
  for (const name of REQUIRED_FILES) {
    fs.copyFileSync(path.join(REPO_ROOT, 'docs/continuity/templates', name), path.join(base, name));
  }
  const idx = path.join(root, 'docs/workstreams/README.md');
  fs.mkdirSync(path.dirname(idx), { recursive: true });
  fs.writeFileSync(idx, '# Dossiers\n\n| Chantier | État | Dossier | Issue |\n| --- | --- | --- | --- |\n\n## Ouvrir un chantier\n');
  initializeWorkstream(root, 'test-nouveau', 501);
  assert.deepEqual(validateWorkstream(root, 'test-nouveau'), []);
  assert.ok(fs.readFileSync(idx, 'utf8').includes('issues/501'));
  assert.match(statusReport(root, 'test-nouveau'), /=== HANDOFF\.md ===/);
  assert.throws(() => initializeWorkstream(root, 'test-nouveau', 501), /existant/);
  assert.throws(() => initializeWorkstream(root, '../autre', 501), /Slug invalide/);
});
