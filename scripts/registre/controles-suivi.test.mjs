/**
 * Contrôles de cohérence du suivi Studio (scripts/registre/controles-suivi.mjs) et documents d'état générés
 * (scripts/registre/etat-studio.mjs) : chaque règle est contrôlée sur une donnée synthétique (positif), puis cassée
 * (mutation : le contrôle doit échouer), puis sur le dépôt réel.
 *
 *   node --test scripts/registre/controles-suivi.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arc08, chaines, controlerDepot, decisionsCitees, scenarios, suivi01, suivi02, suivi08, suivi09 } from './controles-suivi.mjs';
import { NEGATIF, controlesExecutes, fichesTr } from './etat-studio.mjs';
import {
  CHECKLIST, COMPOSANTS_SOUS_LOTS, PREUVES_LOTS, RATTACHEMENT_SOUS_LOTS, citesDe, controlerPreuvesLots, controlerRattachement, documentAgregats,
  gardeTest001, lecteurDepot, lotsDeFiche, rapportAgregats, sousLotsChecklist,
} from './rattachements-studio.mjs';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const lecteur = (m) => (f) => m.get(f) ?? '';

test('SUIVI-01 — aucune branche permanente : la branche de PR automatique est supprimée avec sa PR et retirée sans PR ouverte', () => {
  const daily = readFileSync(join(RACINE, '.github/workflows/studio-checklist-daily.yml'), 'utf8');
  assert.deepEqual(suivi01([['studio-checklist-daily.yml', daily]]), []);
  assert.match(suivi01([['w.yml', daily.replace('delete-branch: true', 'delete-branch: false')]]).join(), /delete-branch: true attendu/);
  assert.match(suivi01([['w.yml', daily.replaceAll('if: always()', 'if: success()')]]).join(), /aucune étape « if: always\(\) »/);
  assert.deepEqual(suivi01([['autre.yml', 'jobs: {}']]), []);
});

test('ARC-08 — Studio/ reste documentaire : aucun code produit ne charge ni n’importe un fichier de Studio/', () => {
  const sains = new Map([
    ['apps/web/src/a.tsx', 'export const T = () => <nav aria-label="Studio">Studio</nav>;'],
    ['packages/atelier-model/src/studio/src.ts', 'const S = src("Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7", "Plan");'],
    ['apps/api/src/x.test.ts', 'const REF02 = "Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx"; lire(REF02);'],
    ['apps/web/src/y.test.ts', "const faux = ['c.ts', 'import carte from \"../../Studio/carte.html?raw\";'];"],
    ['Studio/Fadi_Studio_Plan_Implementation_V1_0.md', '# Plan'],
  ]);
  assert.deepEqual(arc08([...sains.keys()], lecteur(sains)), []);
  for (const [f, code, motif] of [
    ['apps/web/src/b.ts', 'import carte from "../../../Studio/Fadi_Studio_Mind_Maps_Interactives.html?raw";', /le code produit importe/],
    ['apps/api/src/c.ts', 'const t = readFileSync(join(RACINE, "Studio", "Fadi_Studio_Checklist_Execution_V1_0.md"));', /charge un fichier de Studio/],
    ['apps/web/src/d.test.ts', 'import plan from "../../../../Studio/plan.md?raw";', /un test importe/],
    ['packages/x/src/e.ts', 'const m = await import("../../../Studio/x.json");', /importe/],
    ['Studio/outil.mjs', 'export {}', /fichier de code ou manifeste/],
  ]) assert.match(arc08([f], () => code).join(), motif, f);
});

test('SUIVI-02 — une seule autorité normative : copie (contenu, nom, en-tête) hors de Studio/ refusée ; blob épinglé du registre issu de Studio/', () => {
  const contenu = new Map([['Studio/Plan_V1.md', '# Fadi — Studio\n## Plan\nTexte'], ['docs/autre.md', '# Autre\n']]);
  const blobs = new Map([['Studio/Plan_V1.md', 'b1'], ['docs/autre.md', 'b2']]);
  const registre = { tasks: [{ id: 'SRC-01', preuves: [{ type: 'source', blob: 'b1' }] }] };
  assert.deepEqual(suivi02([...contenu.keys()], blobs, lecteur(contenu), new Set(['b1']), registre), []);
  const copie = (f, b, t) => suivi02([...contenu.keys(), f], new Map([...blobs, [f, b]]), lecteur(new Map([...contenu, [f, t]])), new Set(['b1']), registre).join();
  assert.match(copie('docs/copie.md', 'b1', ''), /copie de Studio\/Plan_V1\.md/);
  assert.match(copie('docs/x/Plan_V1.md', 'b9', 'autre'), /copie de Studio\/Plan_V1\.md/);
  assert.match(copie('docs/reecrit.md', 'b8', '# Fadi — Studio\n\n## Plan\nAutre texte'), /reproduit l'en-tête/);
  assert.match(suivi02([...contenu.keys()], blobs, lecteur(contenu), new Set(['b1']), { tasks: [{ id: 'SRC-01', preuves: [{ type: 'source', blob: 'zz' }] }] }).join(), /jamais contenu d'un fichier de Studio/);
});

test('SUIVI-08 — ADR nommées et rangées selon le protocole, sans doublon ; registre de tâches unique ; décisions uniques', () => {
  const base = new Map([
    ['docs/continuity/decisions/README.md', '- [ADR-STUDIO-NAV-01](ADR-STUDIO-NAV-01.md)'],
    ['docs/continuity/decisions/ADR-STUDIO-NAV-01.md', '# ADR-STUDIO-NAV-01 — Navigation\n### P-01 — Délégation\n### P-02 — Responsabilités'],
    ['docs/atelier/decisions.md', '| D-001 | 2026 | x |\n| D-002 | 2026 | y |'],
    ['docs/workstreams/axes/DECISIONS.md', '## AX-D1 — Délégation\n## AX-D2 — Périmètre'],
    ['docs/workstreams/studio/task-register.json', ''],
  ]);
  const json = (m) => (f) => (m.has(f) ? (f.endsWith('task-register.json') ? { tasks: Array.from({ length: 630 }, (_, i) => ({ id: `T-${i}`, statut: 'À faire' })) } : m.get(f)) : null);
  assert.deepEqual(suivi08([...base.keys()], lecteur(base), json(new Map(base))), []);
  const avec = (f, t, j) => { const m = new Map([...base, [f, t]]); return suivi08([...m.keys()], lecteur(m), (x) => (x === f && j ? j : json(m)(x))).join(); };
  assert.match(avec('docs/ai-team/ADR-STUDIO-X-01.md', '# ADR-STUDIO-X-01 — Hors dossier'), /hors de docs\/continuity\/decisions/);
  assert.match(avec('docs/continuity/decisions/adr-mal-nommee.md', '# ADR-STUDIO-Y-01 — Nom'), /nom de fichier différent/);
  assert.match(avec('docs/continuity/decisions/ADR-STUDIO-Z-01.md', '# ADR-STUDIO-Z-01 — Non indexée'), /absente de l'index/);
  assert.match(avec('docs/ai-team/copie-registre.json', '', { tasks: Array.from({ length: 630 }, (_, i) => ({ id: `T-${i}`, statut: 'Vérifié' })) }), /second registre de tâches/);
  assert.match(avec('docs/workstreams/autre/DECISIONS.md', '| D-002 | 2026 | doublon |'), /décision D-002 définie dans/);
  assert.match(avec('docs/workstreams/axes/DECISIONS.md', '## AX-D1 — a\n## AX-D1 — b'), /AX-D1 définie deux fois/);
});

test('X.3-02 / SUIVI-07 — chaînes obligation → lot → composants → TEST/NAV → DEC → décision versionnée, contrôlées', () => {
  assert.deepEqual(scenarios('001,022 ; 005,008 secondaires seulement'), ['TEST-001', 'TEST-022', 'TEST-005', 'TEST-008']);
  assert.deepEqual(scenarios('TEST spécifiques outil §19.3'), ['§19.3']);
  assert.deepEqual(scenarios('035,NAV-003'), ['TEST-035', 'NAV-003']);
  assert.equal(decisionsCitees('DEC-01 à DEC-18 selon fonction').length, 18);
  const registre = { tasks: [
    { id: 'TR-EX-001', preuves: [{ type: 'test_automatise', fichier: 'a.test.ts' }] }, { id: 'TEST-001' }, { id: 'NAV-002' },
    { id: 'DEC-01', statut: 'Accepté', preuves: [{ type: 'decision_deleguee', fichier: 'adr.md' }] },
  ] };
  const fiche = { id: 'EX-001', lot: 'I/A/E', scenarios_RT_lies_proposes: '001,NAV-002', decisions_applicables_a_qualifier: 'DEC-01', composants_candidats: [{ chemin: 'apps/web/src/App.tsx' }] };
  const matrice = 'id,tests_proposes,decision_retenue,dec_techniques\nEX-001,"001,NAV-002",M002-D01,DEC-01\n';
  const decisions = '## M002-D01 — Référence\n';
  const docs = new Map([['adr.md', '### DEC-01 retenue'], ['a.test.ts', ''], ['apps/web/src/App.tsx', '']]);
  const ok = chaines(registre, [fiche], matrice, decisions, lecteur(docs), (f) => docs.has(f));
  assert.deepEqual(ok.ecarts, []);
  assert.deepEqual(ok.resume, [{ id: 'EX-001', lot: 'I/A/E', scenarios: ['TEST-001', 'NAV-002'], decisions: ['DEC-01'] }]);
  const casse = (f = fiche, m = matrice, d = docs, r = registre) => chaines(r, [f], m, decisions, lecteur(d), (x) => d.has(x)).ecarts.join();
  assert.match(casse({ ...fiche, lot: 'Z' }), /lot du Plan absent ou inconnu/);
  assert.match(casse({ ...fiche, scenarios_RT_lies_proposes: '001,NAV-099' }, matrice.replace('NAV-002', 'NAV-099')), /scénario NAV-099 absent du registre/);
  assert.match(casse(fiche, matrice.replace('"001,NAV-002"', '001')), /scénarios de la matrice/);
  assert.match(casse({ ...fiche, decisions_applicables_a_qualifier: 'DEC-07' }), /décision DEC-07 absente du registre/);
  assert.match(casse(fiche, matrice, new Map([['adr.md', 'sans la décision'], ['a.test.ts', ''], ['apps/web/src/App.tsx', '']])), /DEC-01 — arbitrée sans décision versionnée/);
  assert.match(casse({ ...fiche, composants_candidats: [{ chemin: 'apps/web/src/Disparu.tsx' }] }), /composant apps\/web\/src\/Disparu\.tsx absent du dépôt/);
  assert.match(casse({ ...fiche, composants_candidats: [] }), /aucun composant candidat/);
  assert.match(casse(fiche, matrice.replace('M002-D01', 'M002-D09')), /M002-D09 absente/);
  assert.match(casse(fiche, matrice, new Map([['adr.md', 'DEC-01'], ['apps/web/src/App.tsx', '']])), /preuve a\.test\.ts absente/);
});

test('SUIVI-09 — rapports lourds déclarés avec empreinte et raison ; empreintes des preuves stables ; exécutions citées avec leur verdict', () => {
  const octets = new Map([['docs/ai-team/reports/gros.json', Buffer.alloc(2 * 1024 * 1024, 1)], ['docs/x.md', Buffer.from('x')]]);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const taille = (f) => octets.get(f).length;
  const lireO = (f) => octets.get(f);
  const registre = (preuves) => ({ tasks: [{ id: 'T', preuves }] });
  const declare = [{ fichier: 'docs/ai-team/reports/gros.json', sha256: sha(octets.get('docs/ai-team/reports/gros.json')), raison: 'Rapport historique figé, cité.' }];
  const f = [...octets.keys()];
  assert.deepEqual(suivi09(f, taille, lireO, () => null, registre([]), declare), []);
  assert.match(suivi09(f, taille, lireO, () => null, registre([]), []).join(), /rapport lourd .* non déclaré/);
  assert.match(suivi09(f, taille, lireO, () => null, registre([]), [{ ...declare[0], sha256: '0'.repeat(64) }]).join(), /SHA-256 déclaré périmé/);
  assert.match(suivi09(f, taille, lireO, () => null, registre([{ fichier: 'docs/x.md', sha256: '0'.repeat(64) }]), declare).join(), /ne désigne pas docs\/x\.md/);
  assert.deepEqual(suivi09(f, taille, lireO, () => Buffer.from('ancien'), registre([{ fichier: 'docs/x.md', sha256: sha(Buffer.from('ancien')), commit: 'c'.repeat(40) }]), declare), []);
  assert.match(suivi09(f, taille, lireO, () => null, registre([{ url_execution: 'https://github.com/o/r/actions/runs/12?x=1' }]), declare).join(), /instable ou mal formée/);
  assert.match(suivi09(f, taille, lireO, () => null, registre([{ etiquette: 'scénario exécuté', url_execution: 'https://github.com/o/r/actions/runs/12/job/3', environnement: 'CI' }]), declare).join(), /verdict de l'exécution absent/);
});

test('X.4-03 / X.3-03 — documents d’état : exécutés séparés des absents, preuve et contre-preuve par fiche, « à produire » sinon', () => {
  const exec = (controles) => ({ type: 'test_automatise', fichier: 'a.test.ts', controles, etiquette: 'scénario exécuté', commit: 'c'.repeat(40), url_execution: 'https://github.com/o/r/actions/runs/1/job/2', date: '2026-10-25T10:00:00+02:00', environnement: 'success' });
  const registre = { tasks: [
    { id: 'TR-EX-001', statut: 'Vérifié', tests: { etat: 'Exécuté' }, conformite: 'Non évaluée', preuves: [exec(['EX-001 [+] crée l’étude', 'EX-001 [−] projet d’autrui refusé'])] },
    { id: 'TR-EX-002', statut: 'En cours', tests: { etat: 'Non exécuté' }, conformite: 'Non évaluée', suite: 'Fonction absente.', preuves: [{ type: 'test_automatise', fichier: 'b.test.ts', controle: 'à écrire', etiquette: 'test prescrit' }] },
  ] };
  const fiches = [{ id: 'EX-001', texte_exact: 'EX-001 — Autonomie.', source_paragraphs: [81] }, { id: 'EX-002', texte_exact: 'EX-002 — Contexte.', source_paragraphs: [82] }];
  const md = fichesTr(registre, fiches, 'e'.repeat(64));
  assert.match(md, /### TR-EX-001[\s\S]*\*\*Preuve \(contrôles positifs exécutés\)\*\* : 1\n  - EX-001 \[\+\] crée l’étude/);
  assert.match(md, /\*\*Contre-preuve \(contrôles négatifs exécutés\)\*\* : 1\n  - EX-001 \[−\] projet d’autrui refusé/);
  assert.match(md, /### TR-EX-002[\s\S]*\*\*Preuve \(contrôles positifs exécutés\)\*\* : à produire[\s\S]*\*\*Contre-preuve \(contrôles négatifs exécutés\)\*\* : à produire/);
  assert.match(md, /2 fiches ; 1 avec preuve exécutée, 1 avec contre-preuve exécutée/);
  for (const l of ['NAV-004 : projet d’autrui refusé sans divulguer son code', 'INV-005 [−] commande partielle', 'diffuser → 409 manifest_mismatch', 'aucune révision en double']) assert.ok(NEGATIF.test(l), l);
  for (const l of ['INV-001 [+] l’approbation enregistre le manifeste', 'étude créée avec sa variante initiale']) assert.ok(!NEGATIF.test(l), l);
  const etat = controlesExecutes(registre, [{ workflow: 'ci.yml', nom: 'Recette (apps/web/e2e/studio-a.mjs)' }], ['apps/web/e2e/studio-a.mjs', 'apps/web/e2e/studio-b.mjs'], 'e'.repeat(64));
  assert.match(etat, /Une CI verte n’est pas une couverture exhaustive/);
  assert.match(etat, /## 1\. Contrôles effectivement exécutés[\s\S]*`a\.test\.ts`/);
  assert.match(etat, /### 2\.1 Obligations de recette ouvertes \(1\)[\s\S]*\| TR-EX-002 \| En cours \| Non exécuté \| Fonction absente\. \|/);
  assert.match(etat, /### 2\.2 Tests prescrits non exécutés \(1\)[\s\S]*b\.test\.ts/);
  assert.match(etat, /### 2\.3 Recettes Studio présentes mais non branchées en CI \(1\)\n\n- `apps\/web\/e2e\/studio-b\.mjs`/);
});

test('dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes complètes', () => {
  const r = controlerDepot(RACINE);
  for (const id of ['SUIVI-01', 'ARC-08', 'SUIVI-02', 'SUIVI-08', 'X.3-02', 'SUIVI-09']) assert.deepEqual(r[id], [], id);
  assert.equal(r.chaines.resume.length, 141);
  assert.equal(r.chaines.resume.filter((x) => x.scenarios.length && x.decisions.length).length, 141);
  assert.ok(readFileSync(join(RACINE, 'scripts/registre/rapports-lourds.json'), 'utf8').includes('task-register.json'));
});

// --- X.3-01 et rapprochements d'agrégation (scripts/registre/rattachements-studio.mjs, lot G5) ----------------------

const lireJson = (f) => JSON.parse(readFileSync(join(RACINE, f), 'utf8'));
const FICHES_M004 = () => lireJson('docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json').fiches;
const REGISTRE = () => lireJson('docs/workstreams/studio/task-register.json');
const existeDepot = (f) => existsSync(join(RACINE, f));
const trDuRegistre = () => REGISTRE().tasks.map((t) => t.id).filter((id) => /^TR-(?:EX|INV|IF|AC)-/.test(id));
const sousLotsDepot = () => sousLotsChecklist(readFileSync(join(RACINE, CHECKLIST), 'utf8'));

test('X.3-01 [+] les 141 fiches EX / INV / IF / AC reliées à leurs sous-lots (Checklist) et composants, identifiants inchangés', () => {
  const fiches = FICHES_M004();
  const sousLots = sousLotsDepot();
  for (const s of ['I.1', 'A.1', 'A.5', 'B.3', 'X.1', 'C.2', 'D.2', 'E.6', 'F.1', 'F.3', 'R.5']) assert.ok(sousLots.has(s), s);
  assert.equal(sousLots.size, 37);
  assert.equal(fiches.length, 141);
  assert.deepEqual(Object.keys(RATTACHEMENT_SOUS_LOTS).sort(), fiches.map((f) => f.id).sort());
  assert.deepEqual(controlerRattachement(fiches, trDuRegistre(), sousLots, existeDepot), []);
  assert.deepEqual(lotsDeFiche('B/X/F option'), ['B', 'X', 'F']);
  assert.deepEqual(lotsDeFiche('X/pilotage'), ['X']);
});

test('X.3-01 [−] identifiant changé, sous-lot inconnu ou hors des lots de la fiche, lot sans sous-lot, composant absent : refusés', () => {
  const fiches = FICHES_M004();
  const sousLots = sousLotsDepot();
  const tr = trDuRegistre();
  const renomme = fiches.map((f) => (f.id === 'EX-050' ? { ...f, id: 'EX-950' } : f));
  assert.match(controlerRattachement(renomme, tr, sousLots, existeDepot).join('\n'), /EX-050 rattaché mais absent des fiches REF-02[\s\S]*TR-EX-050 au registre sans fiche[\s\S]*EX-950 sans sous-lot/);
  const avec = (id, sl) => ({ ...RATTACHEMENT_SOUS_LOTS, [id]: sl });
  assert.match(controlerRattachement(fiches, tr, sousLots, existeDepot, avec('EX-050', ['C.9'])).join(), /EX-050 → C\.9 : sous-lot absent de la Checklist/);
  assert.match(controlerRattachement(fiches, tr, sousLots, existeDepot, avec('EX-050', ['A.2'])).join(), /EX-050 → A\.2 : le lot A n'est pas un lot de la fiche \(C\)[\s\S]*aucun sous-lot du lot C/);
  assert.match(controlerRattachement(fiches, tr, sousLots, existeDepot, avec('EX-021', ['A.4'])).join(), /EX-021 : aucun sous-lot du lot C porté par la fiche \(A\/C\)/);
  assert.match(controlerRattachement(fiches, tr, sousLots, existeDepot, RATTACHEMENT_SOUS_LOTS, { ...COMPOSANTS_SOUS_LOTS, 'D.2': ['apps/web/src/modules/studio/exact/absent.ts'] }).join(), /D\.2 : composant Studio absent/);
  assert.match(controlerRattachement(fiches, tr.filter((x) => x !== 'TR-AC-011'), sousLots, existeDepot).join(), /AC-011 sans obligation TR-AC-011 au registre/);
});

test('rapprochements [+] chaque TEST / AC cité par les huit agrégats rapproché de son obligation, de ses preuves et de ce qui manque', () => {
  assert.deepEqual(citesDe('Joindre les preuves des scénarios TEST-001 à TEST-014, TEST-027 et TEST-034/035 applicables'), [...Array.from({ length: 14 }, (_, i) => `TEST-${String(i + 1).padStart(3, '0')}`), 'TEST-027', 'TEST-034', 'TEST-035']);
  assert.deepEqual(citesDe('Joindre TEST-025/026/032/033/035 applicables'), ['TEST-025', 'TEST-026', 'TEST-032', 'TEST-033', 'TEST-035']);
  assert.deepEqual(citesDe('Joindre TEST-022 à TEST-025 et AC-004/005'), ['TEST-022', 'TEST-023', 'TEST-024', 'TEST-025', 'AC-004', 'AC-005']);
  assert.deepEqual(citesDe('Joindre les preuves AC-007 à AC-010 applicables.'), ['AC-007', 'AC-008', 'AC-009', 'AC-010']);
  const registre = REGISTRE();
  const lire = lecteurDepot(RACINE);
  assert.deepEqual(controlerPreuvesLots(lire), []);
  const r = rapportAgregats(registre, lire);
  assert.deepEqual(r.map((a) => a.id), ['A.2-09', 'REC-A-02', 'REC-B-01', 'REC-C-02', 'REC-E-01', 'REC-E-02', 'F.3-04', 'J6']);
  const de = (id) => r.find((a) => a.id === id);
  assert.equal(de('REC-A-02').groupes[0].obligations.length, 17);
  assert.deepEqual(de('REC-E-02').groupes[0].obligations.map((o) => o.obligation), ['TR-AC-007', 'TR-AC-008', 'TR-AC-009', 'TR-AC-010']);
  // Une obligation livrée par un lot et pas encore reportée est couverte « à reporter » ; une obligation ouverte sans preuve manque.
  const test011 = de('REC-A-02').groupes[0].obligations.find((o) => o.id === 'TEST-011');
  if (!['Vérifié', 'Accepté'].includes(test011.statut)) assert.match(test011.manque, /lot PUB.*à reporter au registre/);
  const ac010 = de('REC-E-02').groupes[0].obligations.find((o) => o.id === 'AC-010');
  if (!['Vérifié', 'Accepté'].includes(ac010.statut)) {
    assert.ok(de('REC-E-02').manques.some((o) => o.id === 'AC-010'));
    assert.match(ac010.manque, /Approuver.*fonction absente/);
  }
  assert.match(de('REC-C-02').externe, /GPU/);
  const md = documentAgregats(registre, lire, 'e'.repeat(64));
  for (const a of r) assert.match(md, new RegExp(`### ${a.id.replace('.', '\\.')}\\n`));
});

test('rapprochements [−] une preuve de lot dont le libellé n’est plus écrit, ou un fichier disparu, fait échouer la génération', () => {
  const lire = lecteurDepot(RACINE);
  const libelle = PREUVES_LOTS['TEST-027'].preuves[1][1][0];
  const altere = (f) => (f === 'apps/web/e2e/studio-exigences.mjs' ? lire(f).replaceAll(libelle, "libellé réécrit") : lire(f));
  assert.match(controlerPreuvesLots(altere).join(), /TEST-027 : libellé absent de apps\/web\/e2e\/studio-exigences\.mjs/);
  assert.match(controlerPreuvesLots((f) => (f === 'apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts' ? null : lire(f))).join(), /TR-AC-004 : fichier absent/);
});

test('A.2-09 [+] / [−] TEST-001 n’est clos qu’à la preuve exécutée de la publication du dessin (E.3-07) ; clos avant, ou sans elle : refusé', () => {
  const registre = REGISTRE();
  assert.deepEqual(gardeTest001(registre), []);
  const t001 = (r) => r.tasks.find((t) => t.id === 'TEST-001');
  const sansPublication = structuredClone(registre);
  for (const p of t001(sansPublication).preuves) if (p.controles) p.controles = p.controles.filter((l) => !/^E\.3-07\b/.test(l));
  assert.match(gardeTest001(sansPublication).join(), /clos sans preuve exécutée de la publication du dessin/);
  const closAvant = structuredClone(registre);
  t001(closAvant).historique[0].statut = 'Vérifié';
  assert.match(gardeTest001(closAvant).join(), /ne cite pas le rapport de la recette de publication/);
  const fermetureSansRapport = structuredClone(registre);
  const h = t001(fermetureSansRapport).historique;
  h[h.findIndex((e) => e.statut === 'Vérifié')].preuve = 'ailleurs.md';
  assert.match(gardeTest001(fermetureSansRapport).join(), /ne cite pas le rapport de la recette de publication/);
});

