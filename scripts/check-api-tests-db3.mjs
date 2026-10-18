/**
 * Suites API historiques tant que DB-3 n'est pas autorisé (Issue #157, garde DB-1/2).
 *
 * Le registre d'autorités de `apps/api/src/testing/approved-test-authorities.ts` est volontairement vide :
 * toute suite qui importe `db/client.ts` est refusée au chargement (`TARGET_REQUIRED`). Ce contrôle ne
 * contourne pas la garde et ne déclare pas ces suites réussies. Il lit le rapport JSON de Vitest et exige :
 *  - que toute suite chargée passe, avec au moins un test et aucun échec ;
 *  - que toute suite refusée le soit par la garde seule, sans aucun test exécuté ;
 *  - que l'ensemble des suites refusées soit exactement la liste fermée ci-dessous (une nouvelle suite
 *    refusée ou une suite qui se met à tourner, par exemple après DB-3, oblige à réviser la liste).
 * Exemple :
 *   npx --workspace=@fadi/api vitest run --reporter=json --outputFile=../../api-vitest.json
 *   node scripts/check-api-tests-db3.mjs api-vitest.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const GUARD_REFUSAL = 'Test database refused: TARGET_REQUIRED';

/** Suites qui exigent une base attestée : non exécutées tant que DB-3 reste fermé. */
export const DB3_PENDING_SUITES = Object.freeze([
  'src/app.test.ts',
  'src/routes/atelier-automatisation-p2.test.ts',
  'src/routes/atelier-bois-tolerie.test.ts',
  'src/routes/atelier-commands.test.ts',
  'src/routes/atelier-coordination.test.ts',
  'src/routes/atelier-documentation.test.ts',
  'src/routes/atelier-exact.test.ts',
  'src/routes/atelier-mecanique.test.ts',
  'src/routes/atelier-planches.test.ts',
  'src/routes/atelier-reseaux.test.ts',
  'src/routes/atelier-structure.test.ts',
  'src/routes/history.test.ts',
]);

function relative(name) {
  const marker = '/apps/api/';
  const i = name.replaceAll('\\', '/').lastIndexOf(marker);
  return i === -1 ? name : name.slice(i + marker.length);
}

export function checkReport(report, pending = DB3_PENDING_SUITES) {
  const errors = [];
  const refused = [];
  let passedTests = 0;
  if (!report || !Array.isArray(report.testResults) || report.testResults.length === 0) {
    return { errors: ['rapport Vitest vide ou illisible'], refused, passedTests };
  }
  for (const suite of report.testResults) {
    const name = relative(suite.name);
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    const message = String(suite.message ?? '');
    if (suite.status === 'passed') {
      const failed = assertions.filter((a) => a.status !== 'passed' && a.status !== 'skipped' && a.status !== 'pending');
      if (assertions.length === 0) errors.push(`${name} : aucune vérification exécutée`);
      if (failed.length) errors.push(`${name} : ${failed.length} test(s) en échec`);
      passedTests += assertions.filter((a) => a.status === 'passed').length;
    } else if (message.includes(GUARD_REFUSAL) && assertions.length === 0) {
      refused.push(name);
    } else {
      const failed = assertions.filter((a) => a.status === 'failed').map((a) => a.fullName ?? a.title);
      errors.push(`${name} : échec qui n'est pas le refus de la garde DB (${failed.join(' ; ') || message.split('\n')[0] || suite.status})`);
    }
  }
  const expected = new Set(pending);
  for (const name of refused) if (!expected.has(name)) errors.push(`${name} : refusée par la garde mais absente de la liste DB-3 — à examiner`);
  for (const name of pending) if (!refused.includes(name)) errors.push(`${name} : attendue refusée (DB-3 fermé) mais ne l'est pas — réviser la liste`);
  return { errors, refused, passedTests };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) { console.error('usage : node scripts/check-api-tests-db3.mjs <rapport-vitest.json>'); process.exit(2); }
  let report;
  try { report = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (error) { console.error(`rapport illisible : ${error.message}`); process.exit(2); }
  const { errors, refused, passedTests } = checkReport(report);
  console.log(`API : ${passedTests} test(s) réussis hors base.`);
  console.log(`API : ${refused.length} suite(s) NON EXÉCUTÉE(S) — garde DB fermée, DB-3 non autorisé (#157) :`);
  for (const name of refused) console.log(`  - ${name}`);
  if (errors.length) { for (const e of errors) console.error(`✗ ${e}`); process.exit(1); }
  console.log('✓ seules les suites de la liste DB-3 sont refusées, et uniquement par la garde.');
}
