/**
 * Concept normatif du chantier Gestion des comptes (docs/workstreams/users-management/concept.md).
 *
 *   node scripts/users-concept.mjs          → vérifie : empreintes du .docx / .md officiels = concept.md.sha256, et concept.md à jour
 *   node scripts/users-concept.mjs --write  → régénère concept.md et concept.md.sha256 depuis le pair officiel
 *
 * Le .md officiel est le pair du .docx (« Fadi Concept/README.md », §1) ; c'est lui qui est recopié, ses tableaux restant
 * lisibles (pandoc aplatit les tableaux du .docx). Toute nouvelle version du concept oblige à régénérer, donc à relire.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOCX = 'Fadi Concept/Fadi Concept - Users Management.docx';
export const MD = 'Fadi Concept/Fadi Concept - Users Management.md';
export const CONCEPT = 'docs/workstreams/users-management/concept.md';
export const SUMS = 'docs/workstreams/users-management/concept.md.sha256';

const HEADER = `<!-- Source normative du chantier (règle 4 du plan). Copie exacte de « Fadi Concept/Fadi Concept - Users Management.md » v2.2,
     pair Markdown du .docx officiel (parité des mots vérifiée par pandoc le 2026-10-22, voir STATUS.md).
     Ne pas modifier ici : régénérer avec \`node scripts/users-concept.mjs --write\` ; le test anti-dérive
     (apps/api/src/lib/users-concept-drift.test.ts) échoue si le .docx ou le .md change sans régénération. -->

`;

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const read = (rel) => readFileSync(path.join(ROOT, rel));

export function expected() {
  const concept = HEADER + read(MD).toString('utf8');
  const sums = `${sha(read(DOCX))}  ${DOCX}\n${sha(read(MD))}  ${MD}\n${sha(Buffer.from(concept))}  ${CONCEPT}\n`;
  return { concept, sums };
}

export function check() {
  const { concept, sums } = expected();
  const errors = [];
  if (read(SUMS).toString('utf8') !== sums) errors.push(`${SUMS} : empreintes périmées — le concept officiel a changé, régénérer et relire (--write)`);
  if (read(CONCEPT).toString('utf8') !== concept) errors.push(`${CONCEPT} : différent du concept officiel — régénérer (--write)`);
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--write')) {
    const { concept, sums } = expected();
    writeFileSync(path.join(ROOT, CONCEPT), concept);
    writeFileSync(path.join(ROOT, SUMS), sums);
    console.log('concept.md et concept.md.sha256 régénérés');
  } else {
    const errors = check();
    for (const e of errors) console.error('❌ ' + e);
    if (errors.length) process.exit(1);
    console.log('✓ concept.md à jour');
  }
}
