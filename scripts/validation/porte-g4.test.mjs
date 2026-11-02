// X.2-04 / BLOC-06 (ADR-STUDIO-PILOTE-01, P-12) : la porte G4 refuse la livraison tant qu'un défaut éliminatoire
// (BLOC-01 à BLOC-07) n'est pas vérifié au registre ou que sa preuve ne tient pas, en nommant défaut, preuve et
// propriétaire ; aucune mesure de performance n'entre dans la décision. node --test scripts/validation/porte-g4.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ELIMINATOIRES, evaluerPorteG4, libelleEcrit, principal, rapportMarkdown } from './porte-g4.mjs';

const fichiers = new Map([
  ['apps/x.test.ts', 'describe("BLOC", () => { it("BLOC-0x [+] scénario vérifié", () => {}); it("refus \\"cité\\" exact", () => {}); });'],
]);
const lire = (f) => fichiers.get(f) ?? null;
const tache = (id, extra = {}) => ({ id, agent: 'A5', description: `Défaut ${id}`, statut: 'Vérifié', preuves: [{ type: 'test_automatise', fichier: 'apps/x.test.ts', controles: ['BLOC-0x [+] scénario vérifié'] }], ...extra });
const registre = (surcharges = {}) => ({ tasks: ELIMINATOIRES.map((id) => tache(id, surcharges[id])) });

test('X.2-04 [+] tous les défauts éliminatoires vérifiés avec une preuve qui tient : livraison admise', () => {
  const r = evaluerPorteG4(registre(), lire);
  assert.equal(r.decision, 'livraison-admise');
  assert.deepEqual(r.defauts, []);
  assert.deepEqual(r.verifies.map((v) => v.id), ELIMINATOIRES);
  assert.equal(libelleEcrit(fichiers.get('apps/x.test.ts'), 'BLOC > BLOC-0x [+] scénario vérifié'), true);
  assert.equal(libelleEcrit(fichiers.get('apps/x.test.ts'), 'refus "cité" exact'), true);
});

test('BLOC-06 [−] un défaut non vérifié refuse la livraison et nomme défaut, preuve et propriétaire', () => {
  const r = evaluerPorteG4(registre({ 'BLOC-03': { statut: 'En cours', suite: 'Conflit non couvert', blocage: { responsable: 'A2' } } }), lire);
  assert.equal(r.decision, 'livraison-refusee');
  assert.deepEqual(r.defauts, [{ id: 'BLOC-03', defaut: 'Défaut BLOC-03', proprietaire: 'A2', motif: 'non-verifie', statut: 'En cours', preuve: 'Conflit non couvert' }]);
  assert.match(rapportMarkdown(r), /\| BLOC-03 — Défaut BLOC-03 \| non-verifie \(statut : En cours\) \| Conflit non couvert \| A2 \|/);
});

test('BLOC-06 [−] une preuve qui ne tient pas (fichier absent, libellé introuvable, aucune preuve exécutable) refuse la livraison', () => {
  const r = evaluerPorteG4(registre({
    'BLOC-01': { preuves: [{ type: 'recette_e2e', fichier: 'apps/web/e2e/absente.mjs', controles: ['x'] }] },
    'BLOC-02': { preuves: [{ type: 'test_automatise', fichier: 'apps/x.test.ts', controles: ['libellé réécrit'] }] },
    'BLOC-05': { preuves: [{ type: 'document', fichier: 'docs/note.md' }] },
  }), lire);
  assert.equal(r.decision, 'livraison-refusee');
  assert.deepEqual(r.defauts.map((d) => [d.id, d.motif]), [['BLOC-01', 'preuve-ne-tient-pas'], ['BLOC-02', 'preuve-ne-tient-pas'], ['BLOC-05', 'sans-preuve-executable']]);
  assert.deepEqual(r.defauts[0].preuve, [{ fichier: 'apps/web/e2e/absente.mjs', libelle: null, motif: 'fichier-absent' }]);
  assert.deepEqual(r.defauts[1].preuve, [{ fichier: 'apps/x.test.ts', libelle: 'libellé réécrit', motif: 'libelle-introuvable' }]);
  // Défaut absent du registre : refus aussi.
  assert.equal(evaluerPorteG4({ tasks: [] }, lire).defauts.length, ELIMINATOIRES.length);
});

test('X.2-04 [−] un gain de performance ne neutralise jamais un défaut : les mesures sont rapportées, non prises en compte', () => {
  const r = evaluerPorteG4(registre({ 'BLOC-04': { statut: 'À faire' } }), lire, { fps: 240, moyenneMs: 2 });
  assert.equal(r.decision, 'livraison-refusee');
  assert.deepEqual(r.mesures, { fournies: { fps: 240, moyenneMs: 2 }, prises_en_compte: false });
});

test('BLOC-06 [+] exécution : rapport JSON et Markdown écrits, sortie 1 sur refus (0 avec --avertir), 2 sur registre illisible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'porte-g4-'));
  const reg = join(dir, 'registre.json');
  writeFileSync(reg, JSON.stringify({ tasks: [] }));
  const muet = { log: () => {}, error: () => {} };
  assert.equal(principal(['--registre', reg, '--rapport', join(dir, 'r.json'), '--markdown', join(dir, 'r.md')], muet), 1);
  const rapport = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
  assert.equal(rapport.decision, 'livraison-refusee');
  assert.equal(rapport.defauts[0].id, 'BLOC-01');
  assert.match(readFileSync(join(dir, 'r.md'), 'utf8'), /livraison REFUSÉE/);
  assert.equal(principal(['--registre', reg, '--avertir'], muet), 0);
  writeFileSync(reg, '{');
  assert.equal(principal(['--registre', reg], muet), 2);
});

test('BLOC-06 [+] registre réel : chaque défaut éliminatoire est jugé ; un défaut vérifié a des preuves exécutables qui tiennent', () => {
  const r = evaluerPorteG4(JSON.parse(readFileSync(new URL('../../docs/workstreams/studio/task-register.json', import.meta.url), 'utf8')), (f) => {
    try { return readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'); } catch { return null; }
  });
  assert.deepEqual([...r.verifies.map((v) => v.id), ...r.defauts.map((d) => d.id)].sort(), [...ELIMINATOIRES]);
  for (const d of r.defauts) assert.notEqual(d.motif, 'preuve-ne-tient-pas', `${d.id} : ${JSON.stringify(d.preuve)}`);
});
