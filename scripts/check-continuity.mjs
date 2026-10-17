/**
 * Audit documentaire Fadi, sans accès réseau ni écriture.
 * Exemple :
 *   node scripts/check-continuity.mjs
 *   node scripts/check-continuity.mjs --changed-base origin/main
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT, validateRepository, validateChangedPaths } from './continuity.mjs';

let errors = validateRepository(REPO_ROOT);
const args = process.argv.slice(2);
const i = args.indexOf('--changed-base');
if (i !== -1) {
  const ref = args[i + 1];
  if (!ref || ref.startsWith('-')) {
    console.error('CONTINUITY_CHECK_ERROR: une référence Git de base est requise.');
    process.exit(2);
  }
  try {
    const changed = execFileSync('git', ['diff', '--name-only', ref + '...HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 4_000_000,
    }).trim().split('\n').filter(Boolean);
    errors = errors.concat(validateChangedPaths(changed));
    console.log('Fichiers changés par rapport à ' + ref + ' : ' + changed.length);
  } catch (error) {
    console.error('CONTINUITY_CHECK_ERROR: impossible de vérifier le diff Git : ' + error.message);
    process.exit(2);
  }
}
if (errors.length) {
  console.error('CONTINUITY_CHECK_FAILED (' + errors.length + ')');
  for (const error of errors) console.error(' - ' + error);
  process.exit(1);
}
console.log('CONTINUITY_CHECK_OK : structure et checkpoints contrôlés.');
