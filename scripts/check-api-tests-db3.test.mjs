import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReport, DB3_PENDING_SUITES, GUARD_REFUSAL } from './check-api-tests-db3.mjs';

const root = '/w/Fadi/apps/api/';
const refusedSuite = (name) => ({ name: root + name, status: 'failed', message: `${GUARD_REFUSAL}\n at refuse`, assertionResults: [] });
const passedSuite = (name, n = 2) => ({ name: root + name, status: 'passed', message: '', assertionResults: Array.from({ length: n }, (_, i) => ({ status: 'passed', title: `t${i}` })) });
const report = (extra = []) => ({ testResults: [...DB3_PENDING_SUITES.map(refusedSuite), passedSuite('src/lib/history.test.ts', 3), ...extra] });

test('garde fermée : la liste exacte est refusée et le reste passe', () => {
  const r = checkReport(report());
  assert.deepEqual(r.errors, []);
  assert.equal(r.refused.length, DB3_PENDING_SUITES.length);
  assert.equal(r.passedTests, 3);
});

test('un vrai échec de test est signalé, même dans une suite chargée', () => {
  const broken = { ...passedSuite('src/lib/x.test.ts'), status: 'failed', message: '', assertionResults: [{ status: 'failed', fullName: 'x casse' }] };
  assert.match(checkReport(report([broken])).errors.join('\n'), /x casse/);
});

test('un autre refus que TARGET_REQUIRED n\'est pas assimilé à la garde', () => {
  const other = { name: root + 'src/routes/atelier-commands.test.ts', status: 'failed', message: 'Test database refused: ATTESTATION_REJECTED', assertionResults: [] };
  const rows = report().testResults.filter((s) => !s.name.endsWith('atelier-commands.test.ts'));
  const errors = checkReport({ testResults: [...rows, other] }).errors.join('\n');
  assert.match(errors, /n'est pas le refus de la garde/);
  assert.match(errors, /attendue refusée/);
});

test('une nouvelle suite refusée hors liste est signalée', () => {
  assert.match(checkReport(report([refusedSuite('src/routes/nouvelle.test.ts')])).errors.join('\n'), /absente de la liste DB-3/);
});

test('une suite de la liste qui se met à tourner oblige à réviser la liste', () => {
  const rows = report().testResults.map((s) => s.name.endsWith('history.test.ts') && s.name.includes('/routes/') ? passedSuite('src/routes/history.test.ts') : s);
  assert.match(checkReport({ testResults: rows }).errors.join('\n'), /réviser la liste/);
});

test('rapport vide refusé', () => {
  assert.deepEqual(checkReport({ testResults: [] }).errors, ['rapport Vitest vide ou illisible']);
});
