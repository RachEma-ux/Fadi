import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReport, checkReportDb3Active, DB3_PENDING_SUITES, GUARD_REFUSAL } from './check-api-tests-db3.mjs';

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

const active = (extra = []) => ({ testResults: [...DB3_PENDING_SUITES.map((n) => passedSuite(n, 3)), passedSuite('src/lib/history.test.ts', 2), ...extra] });

test('DB-3 actif : toutes les suites passent, celles de la liste comprises', () => {
  const r = checkReportDb3Active(active());
  assert.deepEqual(r.errors, []);
  assert.equal(r.db3Tests, DB3_PENDING_SUITES.length * 3);
  assert.equal(r.passedTests, DB3_PENDING_SUITES.length * 3 + 2);
});

test('DB-3 actif : une suite encore refusée par la garde est une erreur', () => {
  const rows = active().testResults.map((s) => s.name.endsWith('src/app.test.ts') ? { ...refusedSuite('src/app.test.ts'), message: 'Test database refused: ATTESTATION_REJECTED' } : s);
  const errors = checkReportDb3Active({ testResults: rows }).errors.join('\n');
  assert.match(errors, /refusée par la garde alors que DB-3 est actif/);
  assert.match(errors, /src\/app.test.ts : aucune vérification exécutée/);
});

test('DB-3 actif : un test en échec est signalé', () => {
  const broken = { ...passedSuite('src/routes/history.test.ts'), status: 'failed', assertionResults: [{ status: 'failed', fullName: 'historique casse' }] };
  const rows = active().testResults.map((s) => s.name.endsWith('routes/history.test.ts') ? broken : s);
  assert.match(checkReportDb3Active({ testResults: rows }).errors.join('\n'), /historique casse/);
});

test('DB-3 actif : une suite de la liste absente ou vide est signalée', () => {
  const rows = active().testResults.filter((s) => !s.name.endsWith('atelier-exact.test.ts'));
  assert.match(checkReportDb3Active({ testResults: rows }).errors.join('\n'), /atelier-exact.test.ts : aucune vérification exécutée/);
});

test('DB-3 actif : rapport vide refusé', () => {
  assert.deepEqual(checkReportDb3Active({ testResults: [] }).errors, ['rapport Vitest vide ou illisible']);
});
