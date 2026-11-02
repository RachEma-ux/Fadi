#!/usr/bin/env node
/**
 * Documents d'état du chantier Studio, GÉNÉRÉS depuis le registre et tenus au commit courant par la CI (le contrôle
 * échoue si un document ne correspond plus au registre ou aux workflows) :
 *
 *  - `docs/ai-team/reports/etat-studio/CONTROLES-EXECUTES.md` (X.4-03, X.5-01) : contrôles effectivement exécutés
 *    (preuves « scénario exécuté » : fichier, étape de CI, première et dernière exécution citées) séparés des scénarios
 *    absents ou incomplets (obligations de recette ouvertes, tests prescrits non exécutés, recettes Studio non branchées
 *    en CI) ; une CI verte n'y vaut jamais couverture exhaustive.
 *  - `RATTACHEMENT-SOUS-LOTS.md` (X.3-01) et `AGREGATS-RECETTE.md` (rapprochements d'agrégation) : voir
 *    `rattachements-studio.mjs`.
 *  - `docs/ai-team/reports/etat-studio/FICHES-TR.md` (X.3-03) : les 141 fiches de l'annexe C complétées une à une selon
 *    la règle C — libellé exact (REF-02), source, responsable, contrat, composants, lot, décisions, tests positifs et
 *    négatifs prescrits, **preuve** (contrôles positifs exécutés) et **contre-preuve** (contrôles négatifs exécutés :
 *    refus, rejet, échec attendu), état et verdict ; une preuve absente reste « à produire ».
 *
 *   node scripts/registre/etat-studio.mjs            # contrôle : code 1 si un document est périmé
 *   node scripts/registre/etat-studio.mjs --ecrire   # régénère les deux documents
 *   STUDIO_REGISTRE=/chemin/copie.json node scripts/registre/etat-studio.mjs --ecrire
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKLIST, SORTIE_AGREGATS, SORTIE_RATTACHEMENT, controlerPreuvesLots, controlerRattachement, documentAgregats, documentRattachement, gardeTest001, lecteurDepot, sousLotsChecklist } from './rattachements-studio.mjs';

export const SORTIE_CONTROLES = 'docs/ai-team/reports/etat-studio/CONTROLES-EXECUTES.md';
export const SORTIE_FICHES = 'docs/ai-team/reports/etat-studio/FICHES-TR.md';
const REGISTRE = 'docs/workstreams/studio/task-register.json';
const FICHES = 'docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json';
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/architecture-guards.yml'];

const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const cellule = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const court = (s, n = 240) => { const t = cellule(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const libelles = (p) => [...(typeof p.controle === 'string' ? [p.controle] : []), ...(p.controles ?? []), ...(typeof p.libelle === 'string' ? [p.libelle] : [])];
const zurich = (iso) => String(iso ?? '').slice(0, 16).replace('T', ' ');

/** Contrôle négatif (contre-preuve) : marqué « [−] », ou qui vérifie un refus, un rejet, un échec attendu. */
export const NEGATIF = /\[[−-]\]|\b(?:refus|refusée?s?|rejet|rejetée?s?|échec|échoue|interdite?s?|bloquée?s?|jamais|aucune?|sans (?:effet|écrasement|perte|divulguer|doublon)|ne (?:\S+ ){0,3}pas|n['’]\S+ (?:\S+ ){0,2}pas|40[0-9]|41[0-9]|42[0-9]|conflit|périmée?)\b/i;

/** Étapes de CI qui exécutent des fichiers (nom d'étape qui cite le fichier). */
export function etapesCi(textesWorkflows) {
  const out = [];
  for (const [wf, t] of textesWorkflows) {
    for (const m of t.matchAll(/^\s*- name: (.+)$/gm)) out.push({ workflow: wf, nom: m[1].trim() });
  }
  return out;
}

export function controlesExecutes(registre, etapes, recettesStudio, empreinte, textesLanceurs = '') {
  const executes = new Map();
  const prescrits = [];
  for (const t of registre.tasks) {
    (t.preuves ?? []).forEach((p) => {
      if (p.etiquette === 'scénario exécuté') {
        const cle = p.fichier ?? p.trace ?? p.url_execution ?? p.url;
        const e = executes.get(cle) ?? { fichier: cle, libelles: new Set(), ids: new Set(), dates: [], executions: new Set() };
        libelles(p).forEach((l) => e.libelles.add(l));
        e.ids.add(t.id);
        if (p.date) e.dates.push(p.date);
        if (p.url_execution || p.url) e.executions.add(p.url_execution ?? p.url);
        executes.set(cle, e);
      } else if (p.etiquette === 'test prescrit') prescrits.push({ id: t.id, fichier: p.fichier, libelles: libelles(p) });
    });
  }
  const ouvertes = registre.tasks.filter((t) => /^(?:TEST|NAV|REC|TR|E2E)-/.test(t.id) && !['Vérifié', 'Accepté'].includes(t.statut));
  // Branchée : citée par une étape nommée, ou lancée par un script que la CI exécute (p. ex. scripts/validation/*.py).
  const nonBranchees = recettesStudio.filter((f) => !etapes.some((e) => e.nom.includes(f)) && !textesLanceurs.includes(f));
  const parEtat = {};
  for (const t of registre.tasks) {
    const k = `${t.statut} / ${t.tests?.etat ?? '—'}`;
    parEtat[k] = (parEtat[k] ?? 0) + 1;
  }
  const lignes = [
    '# État des contrôles Studio — exécutés et absents',
    '',
    '> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre ; la CI (workflow',
    '> « Continuité de développement ») le recalcule à chaque commit et échoue s’il diffère : il est donc tenu au HEAD testé.',
    `> Registre lu : \`${REGISTRE}\`, SHA-256 \`${empreinte}\`.`,
    '',
    '**Une CI verte n’est pas une couverture exhaustive** (X.4-03) : elle prouve seulement que les contrôles listés en partie 1',
    'ont réussi aux exécutions citées. Les scénarios de la partie 2 ne sont pas couverts, quel que soit l’état de la CI.',
    '',
    '## Répartition des 630 obligations (statut / état des tests)',
    '',
    '| Statut / tests | Nombre |',
    '|---|---:|',
    ...Object.keys(parEtat).sort().map((k) => `| ${k} | ${parEtat[k]} |`),
    '',
    '## 1. Contrôles effectivement exécutés',
    '',
    'Preuves étiquetées « scénario exécuté » (G2-04) : chacune cite le commit, l’exécution GitHub Actions (ou la trace versionnée),',
    'la date et l’environnement de l’étape qui a réussi.',
    '',
    '| Fichier ou trace | Étape de CI qui l’exécute | Libellés exécutés | Obligations | Exécutions citées | Première date citée | Dernière date citée |',
    '|---|---|---:|---:|---:|---|---|',
  ];
  for (const e of [...executes.values()].sort((a, b) => a.fichier.localeCompare(b.fichier))) {
    const etape = etapes.find((x) => e.fichier && x.nom.includes(e.fichier));
    const dates = [...e.dates].sort();
    lignes.push(`| \`${cellule(e.fichier)}\` | ${etape ? court(etape.nom, 90) : (/\.test\./.test(e.fichier) ? 'suite Vitest / node --test du job validate ou du workflow cité' : 'voir la preuve')} | ${e.libelles.size} | ${e.ids.size} | ${e.executions.size} | ${zurich(dates[0])} | ${zurich(dates.at(-1))} |`);
  }
  lignes.push('', `Total : ${executes.size} fichiers ou traces, ${[...executes.values()].reduce((n, e) => n + e.libelles.size, 0)} libellés exécutés.`, '',
    '## 2. Scénarios absents ou incomplets', '',
    `### 2.1 Obligations de recette ouvertes (${ouvertes.length})`, '',
    'Obligations TEST, NAV, REC, TR et E2E qui ne sont ni « Vérifié » ni « Accepté » : leur scénario n’est pas (entièrement) couvert.', '',
    '| ID | Statut | Tests | Ce qui manque (suite du registre) |', '|---|---|---|---|',
    ...ouvertes.sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true })).map((t) => `| ${t.id} | ${t.statut} | ${t.tests?.etat ?? '—'} | ${court(t.suite)} |`),
    '', `### 2.2 Tests prescrits non exécutés (${prescrits.length})`, '');
  if (prescrits.length) {
    lignes.push('| ID | Fichier | Libellés |', '|---|---|---|', ...prescrits.map((p) => `| ${p.id} | \`${cellule(p.fichier)}\` | ${court(p.libelles.join(' ; '))} |`));
  } else lignes.push('Aucun : chaque test ou recette cité par le registre a une exécution réussie retrouvée.');
  lignes.push('', `### 2.3 Recettes Studio présentes mais non branchées en CI (${nonBranchees.length})`, '');
  lignes.push(nonBranchees.length ? nonBranchees.map((f) => `- \`${f}\``).join('\n') : 'Aucune : chaque `apps/web/e2e/studio-*.mjs` est une étape nommée de la CI ou lancée par un script qu’elle exécute.');
  lignes.push('');
  return lignes.join('\n');
}

export function fichesTr(registre, fiches, empreinte) {
  const taches = new Map(registre.tasks.map((t) => [t.id, t]));
  let avecPreuve = 0, avecContre = 0;
  const blocs = [];
  for (const f of [...fiches].sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }))) {
    const t = taches.get(`TR-${f.id}`) ?? {};
    const exec = (t.preuves ?? []).filter((p) => p.etiquette === 'scénario exécuté');
    const pos = [], neg = [];
    for (const p of exec) for (const l of libelles(p)) (NEGATIF.test(l) ? neg : pos).push({ l, p });
    if (pos.length) avecPreuve++;
    if (neg.length) avecContre++;
    const ref = (x) => `${court(x.l, 200)} — \`${x.p.fichier ?? x.p.trace}\`${x.p.commit ? `, commit ${x.p.commit.slice(0, 7)}` : ''}${x.p.date ? `, ${zurich(x.p.date)}` : ''}`;
    const prep = t.preparation_documentaire ?? {};
    blocs.push([
      `### TR-${f.id}`,
      '',
      `- **Libellé exact (REF-02, § w:p ${(f.source_paragraphs ?? []).join(', ')})** : ${court(f.texte_exact, 600)}`,
      `- **Source** : \`${f.source_path}\` (blob ${String(f.source_git_blob ?? '').slice(0, 12)}) · **Responsable** : ${cellule(f.responsable_propose)} · **Lot** : ${cellule(f.lot)}`,
      `- **Contrat** : ${cellule(f.contrats_candidats)} · **Composants candidats** : ${(f.composants_candidats ?? []).map((c) => `\`${c.chemin}\``).join(', ') || 'à produire'}`,
      `- **Décisions** : ${cellule(f.decisions_applicables_a_qualifier) || 'à produire'} · **Scénarios** : ${cellule(f.scenarios_RT_lies_proposes) || 'à produire'}`,
      `- **Test positif prescrit** : ${court(prep.cas_positif_prescrit ?? f.cas_positif_propose, 300) || 'à produire'}`,
      `- **Test négatif prescrit** : ${court(prep.cas_negatif_prescrit ?? f.cas_negatif_propose, 300) || 'à produire'}`,
      `- **Preuve (contrôles positifs exécutés)** : ${pos.length ? `${pos.length}` : 'à produire'}`,
      ...pos.slice(0, 6).map((x) => `  - ${ref(x)}`),
      ...(pos.length > 6 ? [`  - … et ${pos.length - 6} autre(s) au registre`] : []),
      `- **Contre-preuve (contrôles négatifs exécutés)** : ${neg.length ? `${neg.length}` : 'à produire'}`,
      ...neg.slice(0, 6).map((x) => `  - ${ref(x)}`),
      ...(neg.length > 6 ? [`  - … et ${neg.length - 6} autre(s) au registre`] : []),
      `- **État** : ${t.statut ?? 'absent du registre'} · **Tests** : ${t.tests?.etat ?? '—'} · **Verdict de conformité** : ${cellule(t.conformite) || '—'}`,
      `- **Suite** : ${court(t.suite, 400) || '—'}`,
      '',
    ].join('\n'));
  }
  return [
    '# Fiches de traçabilité TR-* (annexe C) — preuve et contre-preuve individuelles',
    '',
    '> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre et les fiches M004 ; la CI le',
    `> recalcule à chaque commit. Registre SHA-256 \`${empreinte}\` ; fiches \`${FICHES}\`.`,
    '',
    'Règle C (Checklist, annexe C) appliquée à chaque fiche : libellé exact, source, responsable, contrat, composant, tests',
    'positifs et négatifs, preuves, décisions, état et verdict ; **une preuve absente reste « à produire »**. Preuve = contrôle',
    'positif exécuté (« scénario exécuté », G2-04) ; contre-preuve = contrôle exécuté qui vérifie le refus, le rejet ou',
    'l’échec attendu (titre marqué « [−] » ou qui le dit : refus, rejet, échec, interdit, jamais, aucun, conflit, code 4xx…).',
    'Cette fiche ne déclare pas, à elle seule, l’exigence conforme ni la fonction livrée.',
    '',
    `**Synthèse** : ${fiches.length} fiches ; ${avecPreuve} avec preuve exécutée, ${avecContre} avec contre-preuve exécutée ;`,
    `${fiches.length - avecPreuve} preuves et ${fiches.length - avecContre} contre-preuves « à produire ».`,
    '',
    ...blocs,
  ].join('\n');
}

export function generer(racine, cheminRegistre = join(racine, REGISTRE)) {
  const brut = readFileSync(cheminRegistre);
  const registre = JSON.parse(brut.toString('utf8'));
  const empreinte = sha256(brut);
  const etapes = etapesCi(WORKFLOWS.filter((w) => existsSync(join(racine, w))).map((w) => [w, readFileSync(join(racine, w), 'utf8')]));
  const recettes = readdirSync(join(racine, 'apps/web/e2e')).filter((f) => /^studio-.+\.mjs$/.test(f)).sort().map((f) => `apps/web/e2e/${f}`);
  const fiches = JSON.parse(readFileSync(join(racine, FICHES), 'utf8')).fiches;
  // Scripts lancés par les workflows (python3 / node scripts/…) : une recette qu'ils lancent est branchée.
  const wfTextes = WORKFLOWS.filter((w) => existsSync(join(racine, w))).map((w) => readFileSync(join(racine, w), 'utf8')).join('\n');
  const lanceurs = [...new Set([...wfTextes.matchAll(/\bscripts\/[\w/.-]+\.(?:py|mjs|sh)\b/g)].map((m) => m[0]))].filter((f) => existsSync(join(racine, f)));
  const textesLanceurs = [wfTextes, ...lanceurs.map((f) => readFileSync(join(racine, f), 'utf8'))].join('\n');
  // X.3-01 et rapprochements d'agrégation : un écart (sous-lot, identifiant, composant, libellé d'une preuve de lot,
  // garde A.2-09) fait échouer la génération — donc la CI.
  const lire = lecteurDepot(racine);
  const existe = (f) => existsSync(join(racine, f));
  const sousLots = sousLotsChecklist(readFileSync(join(racine, CHECKLIST), 'utf8'));
  const ecarts = [
    ...controlerRattachement(fiches, registre.tasks.map((t) => t.id).filter((id) => /^TR-(?:EX|INV|IF|AC)-/.test(id)), sousLots, existe),
    ...controlerPreuvesLots(lire),
    ...gardeTest001(registre),
  ];
  if (ecarts.length) throw new Error(`Rattachements Studio incohérents :\n${ecarts.join('\n')}`);
  return {
    [SORTIE_CONTROLES]: `${controlesExecutes(registre, etapes, recettes, empreinte, textesLanceurs)}`,
    [SORTIE_FICHES]: `${fichesTr(registre, fiches, empreinte)}\n`,
    [SORTIE_RATTACHEMENT]: documentRattachement(fiches, registre, sousLots, existe, empreinte),
    [SORTIE_AGREGATS]: documentAgregats(registre, lire, empreinte),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const docs = generer(racine, process.env.STUDIO_REGISTRE || undefined);
  const ecrire = process.argv.includes('--ecrire');
  let perimes = 0;
  for (const [f, texte] of Object.entries(docs)) {
    const chemin = join(racine, f);
    if (ecrire) { mkdirSync(dirname(chemin), { recursive: true }); writeFileSync(chemin, texte); console.log(`écrit : ${f}`); continue; }
    if (!existsSync(chemin) || readFileSync(chemin, 'utf8') !== texte) { console.error(`PÉRIMÉ : ${f} ne correspond plus au registre (node scripts/registre/etat-studio.mjs --ecrire)`); perimes++; }
  }
  if (!ecrire) {
    if (perimes) process.exit(1);
    console.log('Documents d’état Studio à jour (contrôles exécutés / scénarios absents, fiches TR-*).');
  }
}
