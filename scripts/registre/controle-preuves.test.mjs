/**
 * Règles de preuve du registre Studio (docs/ai-team/controle_preuves.py) et corrections de preuves
 * (docs/ai-team/tableau_registre.py --corrections), contrôlées en boîte noire sur des registres synthétiques :
 * X.5-02 (« Vérifié » daté, versionné, prouvé), G2-04 (étiquette de chaque preuve), PR-07 (« Implémenté »), PR-08
 * (statut / conformité / tests distincts et cohérents), BLOC-07 (non-applicabilité motivée, jamais une exigence de
 * produit). Chaque règle est aussi contrôlée par mutation : la donnée cassée fait échouer le contrôle.
 *
 *   node --test scripts/registre/controle-preuves.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const CONTROLE = join(RACINE, 'docs/ai-team/controle_preuves.py');
const TABLEAU = join(RACINE, 'docs/ai-team/tableau_registre.py');
const SHA = 'a'.repeat(40);

const execution = (extra = {}) => ({
  type: 'test_automatise', fichier: 'apps/x/y.test.ts', controle: 'cas nommé', limite: 'exécuté en CI',
  etiquette: 'scénario exécuté', commit: SHA, url_execution: 'https://github.com/RachEma-ux/Fadi/actions/runs/1/job/2',
  date: '2026-10-25T10:00:00+02:00', environnement: 'GitHub Actions, job validate', ...extra,
});
const lecture = (extra = {}) => ({
  type: 'document', fichier: 'docs/x.md', limite: 'lecture justifiée', etiquette: 'lecture statique',
  commit: SHA, date: '2026-10-25T10:00:00+02:00', environnement: 'Lecture du dépôt Git', ...extra,
});
const source = { type: 'source', url: 'https://github.com/x/y/blob/z/f.md#L1', etiquette: 'lecture statique', commit: SHA, date: '2026-10-25T10:00:00+02:00', environnement: 'Lecture' };
const tache = (id, extra = {}) => ({
  id, statut: 'Vérifié', conformite: 'Non évaluée pour le produit Studio', tests: { etat: 'Exécuté', portee: 'CI de main' },
  cloture: { condition_verifiee: true }, preuves: [source, execution()], ...extra,
});

function controler(taches) {
  const d = mkdtempSync(join(tmpdir(), 'preuves-'));
  const f = join(d, 'registre.json');
  writeFileSync(f, JSON.stringify({ tasks: taches }));
  const r = spawnSync('python3', [CONTROLE, '--registre', f], { encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}
const echoue = (taches, motif) => {
  const r = controler(taches);
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, motif);
};

test('X.5-02 — un « Vérifié » avec un scénario exécuté complet ou une lecture justifiée complète est conforme', () => {
  const r = controler([tache('A-01'), tache('A-02', { tests: { etat: 'Non applicable', portee: 'Critère documentaire satisfait.' }, preuves: [source, lecture()] })]);
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /PREUVES_CONFORMES/);
});

test('X.5-02 — « Vérifié » refusé sans preuve conforme : pointeur de source seul, préparation de groupe, commit, date ou environnement absents', () => {
  echoue([tache('A-01', { tests: { etat: 'Non applicable', portee: 'Critère documentaire satisfait.' }, preuves: [source] })], /A-01 : « Vérifié » — aucune preuve conforme/);
  const groupe = lecture({ limite: 'Préparation par groupe ; ce lien ne démontre pas à lui seul la condition de clôture de cet ID.' });
  echoue([tache('A-01', { tests: { etat: 'Non applicable', portee: 'Critère documentaire satisfait.' }, preuves: [groupe] })], /aucune preuve conforme/);
  for (const manque of ['commit', 'date', 'environnement', 'url_execution']) {
    const p = execution(); delete p[manque];
    echoue([tache('A-01', { preuves: [p] })], /A-01 : « Vérifié » —/);
  }
  echoue([tache('A-01', { preuves: [execution({ commit: '3e992b6' })] })], /commit \(40 caractères/);
  echoue([tache('A-01', { preuves: [execution({ date: '2026-10-25' })] })], /date ISO 8601 avec fuseau/);
});

test('X.5-02 — tests « Exécuté » exigent un scénario exécuté complet ; « Accepté » soumis à la même règle', () => {
  echoue([tache('A-01', { preuves: [lecture()] })], /tests déclarés « Exécuté » sans scénario exécuté complet/);
  echoue([tache('A-01', { statut: 'Accepté', tests: { etat: 'Non exécuté', portee: 'Décision' }, preuves: [source] })], /« Accepté » — aucune preuve conforme/);
});

test('G2-04 — chaque preuve porte une étiquette lecture statique / test prescrit / scénario exécuté, cohérente avec ce qu’elle cite', () => {
  const sans = execution(); delete sans.etiquette;
  echoue([tache('A-01', { preuves: [sans, execution()] })], /étiquette absente ou inconnue.*\(G2-04\)/);
  echoue([tache('A-01', { preuves: [execution({ etiquette: 'vérifié' }), execution()] })], /étiquette absente ou inconnue/);
  echoue([tache('A-01', { preuves: [execution({ etiquette: 'lecture statique' }), execution()] })], /« lecture statique » pour un test ou une recette cités par libellé/);
  echoue([tache('A-01', { preuves: [lecture({ etiquette: 'test prescrit' }), execution()] })], /« test prescrit » sans fichier de test ou de recette/);
  const prescrit = execution({ etiquette: 'test prescrit' }); delete prescrit.url_execution;
  assert.equal(controler([tache('A-01', { statut: 'En cours', tests: { etat: 'Non exécuté', portee: 'à exécuter' }, preuves: [prescrit] })]).code, 0);
  const incomplet = execution(); delete incomplet.date;
  echoue([tache('A-01', { statut: 'En cours', tests: { etat: 'Non exécuté', portee: 'x' }, preuves: [incomplet] })], /« scénario exécuté » sans date ISO 8601/);
});

test('PR-07 — « Implémenté » admis avec une preuve qui cite un fichier, jamais avec la clôture vérifiée ; état inconnu refusé', () => {
  const prescrit = execution({ etiquette: 'test prescrit' }); delete prescrit.url_execution;
  const impl = (extra) => tache('A-01', { statut: 'Implémenté', tests: { etat: 'Non exécuté', portee: 'test prescrit' }, cloture: { condition_verifiee: false }, preuves: [prescrit], ...extra });
  assert.equal(controler([impl()]).code, 0);
  echoue([impl({ preuves: [source] })], /« Implémenté » sans preuve qui cite un fichier produit \(PR-07\)/);
  echoue([impl({ cloture: { condition_verifiee: true } })], /« Implémenté » avec condition de clôture vérifiée/);
  echoue([impl({ statut: 'Fait' })], /hors des états .*Implémenté/);
});

test('PR-08 — statut, conformité et état des tests distincts et cohérents', () => {
  echoue([tache('A-01', { conformite: undefined })], /trois champs distincts \(PR-08\)/);
  echoue([tache('A-01', { tests: { portee: 'x' } })], /trois champs distincts/);
  echoue([tache('A-01', { statut: 'En cours', tests: { etat: 'Non exécuté', portee: 'x' } })], /tests « Non exécuté » alors qu’une preuve est un scénario exécuté/);
  echoue([tache('A-01', { tests: { etat: 'Partiel', portee: 'x' } })], /« Vérifié » avec tests « Partiel »/);
});

test('BLOC-07 — non-applicabilité motivée, jamais pour une obligation de produit ; exclusion rattachée à sa décision', () => {
  const na = (id, portee = 'Critère documentaire satisfait.') => tache(id, { tests: { etat: 'Non applicable', portee }, preuves: [lecture()] });
  assert.equal(controler([na('SEQ-01')]).code, 0);
  echoue([na('SEQ-01', 'vide')], /« Non applicable » sans motivation/);
  for (const id of ['TR-EX-001', 'TEST-001', 'NAV-001']) echoue([na(id)], new RegExp(`${id} : obligation de produit déclarée « Non applicable »`));
  const exclue = (preuves, suite = 'Option exclue du pilote (DEC-15).') => tache('F.3-01', { statut: 'Accepté', tests: { etat: 'Non exécuté', portee: 'x' }, suite, preuves });
  const decision = lecture({ type: 'decision_deleguee', fichier: 'docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md' });
  assert.equal(controler([exclue([decision])]).code, 0);
  echoue([exclue([lecture()])], /exclusion sans décision citée/);
  echoue([exclue([decision], 'Option exclue du pilote.')], /exclusion sans décision citée/);
});

// --- Corrections (tableau_registre.py --corrections) ---------------------------------------------------------------

function registreComplet() {
  const taches = Array.from({ length: 630 }, (_, n) => ({ id: `T-${String(n).padStart(3, '0')}`, mission: 'M13', agent: 'A2', description: 'Examiner.', statut: 'À définir', conformite: 'Non évaluée', tests: { etat: 'Non exécuté', portee: 'x' }, preuves: [], cloture: { condition_verifiee: false } }));
  const brut = { type: 'test_automatise', fichier: 'apps/x/y.test.ts', controle: 'cas', limite: 'CI' };
  taches[0] = { ...taches[0], statut: 'Vérifié', tests: { etat: 'Exécuté', portee: 'CI' }, preuves: [brut], cloture: { condition_verifiee: true } };
  return { tasks: taches, progress: { P630: { V630: 1, pourcentage: 0.2, IDs: ['T-000'] } } };
}
function corriger(registre, corrections, ecrire = true) {
  const d = mkdtempSync(join(tmpdir(), 'corrections-'));
  mkdirSync(join(d, 'docs/workstreams/studio'), { recursive: true });
  const f = join(d, 'docs/workstreams/studio/task-register.json');
  writeFileSync(f, `${JSON.stringify(registre, null, 2)}\n`);
  const c = join(d, 'c.json');
  writeFileSync(c, JSON.stringify({ schema: 'corrections-registre-v1', origine: 'test', ...corrections }));
  const r = spawnSync('python3', [TABLEAU, '--root', d, '--corrections', c, ...(ecrire ? ['--ecrire'] : [])], { encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, registre: JSON.parse(readFileSync(f, 'utf8')) };
}
const empreintePython = (p) => execFileSync('python3', ['-c', 'import json,sys,hashlib; p=json.loads(sys.argv[1]); print(hashlib.sha256(json.dumps(p, ensure_ascii=False, sort_keys=True).encode()).hexdigest())', JSON.stringify(p)], { encoding: 'utf8' }).trim();

test('corrections — ajouts de champs absents sur la preuve visée par son empreinte ; jamais de remplacement', () => {
  const reg = registreComplet();
  const p = reg.tasks[0].preuves[0];
  const ajouts = { etiquette: 'scénario exécuté', commit: SHA, url_execution: 'https://github.com/RachEma-ux/Fadi/actions/runs/1/job/2', date: '2026-10-25T10:00:00+02:00', environnement: 'CI' };
  const ok = corriger(reg, { preuves: [{ id: 'T-000', index: 0, empreinte_preuve: empreintePython(p), ajouts }] });
  assert.equal(ok.code, 0, ok.sortie);
  assert.deepEqual(ok.registre.tasks[0].preuves[0], { ...p, ...ajouts });
  // Une preuve ajoutée devant elle entre-temps : retrouvée par son empreinte.
  const decale = registreComplet();
  decale.tasks[0].preuves.unshift({ type: 'source', url: 'u' });
  assert.equal(corriger(decale, { preuves: [{ id: 'T-000', index: 0, empreinte_preuve: empreintePython(p), ajouts }] }).code, 0);
  // Preuve changée depuis la préparation, champ déjà présent, champ non admis : refus, rien écrit.
  const change = corriger(reg, { preuves: [{ id: 'T-000', index: 0, empreinte_preuve: 'f'.repeat(64), ajouts }] });
  assert.equal(change.code, 1); assert.match(change.sortie, /changée depuis la préparation/);
  const deja = corriger(reg, { preuves: [{ id: 'T-000', index: 0, empreinte_preuve: empreintePython(p), ajouts: { controle: 'autre' } }] });
  assert.equal(deja.code, 1); assert.match(deja.sortie, /non admis/);
  assert.equal(deja.registre.tasks[0].preuves[0].controle, 'cas');
});

test('corrections — une descente ne fait que retirer « Vérifié » (vers Implémenté ou En cours), P630 recalculé, jamais de promotion', () => {
  const reg = registreComplet();
  const bas = corriger(reg, { statuts: [{ id: 'T-000', statut_avant: 'Vérifié', statut: 'Implémenté', raison: 'aucune preuve conforme', suite: 'Exécuter le test en CI.' }] });
  assert.equal(bas.code, 0, bas.sortie);
  assert.equal(bas.registre.tasks[0].statut, 'Implémenté');
  assert.equal(bas.registre.tasks[0].cloture.condition_verifiee, false);
  assert.deepEqual(bas.registre.progress.P630, { V630: 0, pourcentage: 0, IDs: [] });
  assert.match(bas.sortie, /1 Implémenté/);
  const haut = corriger(reg, { statuts: [{ id: 'T-001', statut_avant: 'À définir', statut: 'Vérifié', raison: 'r', suite: 's' }] });
  assert.equal(haut.code, 1); assert.match(haut.sortie, /ne fait que retirer « Vérifié »/);
  const tests = corriger(reg, { tests: [{ id: 'T-000', tests_avant: { etat: 'Autre' }, tests: { etat: 'Non applicable', portee: 'p' } }] });
  assert.equal(tests.code, 1);
});

test('PR-07 — compteurs des checkpoints : « Implémenté » compté dans la phrase des quatre checkpoints, facultatif tant qu’il vaut 0', () => {
  const reg = registreComplet();
  reg.tasks[1] = { ...reg.tasks[1], statut: 'Implémenté', preuves: [{ type: 'test_automatise', fichier: 'a.test.ts' }] };
  const d = mkdtempSync(join(tmpdir(), 'compteurs-'));
  mkdirSync(join(d, 'docs/workstreams/studio'), { recursive: true });
  writeFileSync(join(d, 'docs/workstreams/studio/task-register.json'), JSON.stringify(reg));
  const ecrire = (phrase) => {
    for (const c of ['ai-team/STATUS.md', 'ai-team/HANDOFF.md', 'studio/STATUS.md', 'studio/HANDOFF.md']) {
      mkdirSync(join(d, 'docs/workstreams', c, '..'), { recursive: true });
      writeFileSync(join(d, 'docs/workstreams', c), phrase);
    }
    return spawnSync('python3', [TABLEAU, '--root', d, '--controle'], { encoding: 'utf8' });
  };
  assert.equal(ecrire('628 À définir / 0 En cours / 1 Implémenté / 0 Bloqué / 1 Vérifié / 0 Accepté, P630=1/630').status, 0);
  const sans = ecrire('628 À définir / 0 En cours / 0 Bloqué / 1 Vérifié / 0 Accepté, P630=1/630');
  assert.equal(sans.status, 1);
  assert.match(sans.stderr, /compteurs/);
});
