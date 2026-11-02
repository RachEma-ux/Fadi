/**
 * Rattachements du chantier Studio, GÉNÉRÉS et contrôlés (appelés par `etat-studio.mjs`, tenus au commit par la CI) :
 *
 *  - X.3-01 — `docs/ai-team/reports/etat-studio/RATTACHEMENT-SOUS-LOTS.md` : les 141 fiches EX / INV / IF / AC reliées à
 *    leurs **sous-lots** (A.1, A.2…, titres relus dans la Checklist) et à leurs composants — candidats M004 (fiche) et
 *    composants Studio actuels (déclarés par sous-lot, et dérivés des preuves exécutées du registre) —, **sans changer
 *    leurs identifiants** : l'ensemble des identifiants est celui de REF-02 (fiches M004) et des TR-* du registre.
 *  - Rapprochements d'agrégation (A.2-09, REC-A-02, REC-B-01, REC-C-02, REC-E-01, REC-E-02, F.3-04, J6) —
 *    `docs/ai-team/reports/etat-studio/AGREGATS-RECETTE.md` : pour chaque TEST-xxx / AC-xxx cité par l'agrégat, l'obligation
 *    du registre, ses preuves exécutées, les preuves livrées au code par les lots d'achèvement et pas encore reportées au
 *    registre (`PREUVES_LOTS`, libellés relus mot pour mot dans les fichiers), et ce qui manque réellement.
 *
 * Décisions (G5, réversibles) : le rattachement aux sous-lots est une décision de traçabilité Fadi — chaque sous-lot
 * appartient à un lot du plan porté par la fiche (règle contrôlée) ; il ne qualifie ni ne déclare conforme la fiche.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SORTIE_RATTACHEMENT = 'docs/ai-team/reports/etat-studio/RATTACHEMENT-SOUS-LOTS.md';
export const SORTIE_AGREGATS = 'docs/ai-team/reports/etat-studio/AGREGATS-RECETTE.md';
export const CHECKLIST = 'Studio/Fadi_Studio_Checklist_Execution_V1_0.md';

const cellule = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const court = (s, n = 260) => { const t = cellule(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const numerique = (a, b) => a.localeCompare(b, 'fr', { numeric: true });

// --- X.3-01 : sous-lots ------------------------------------------------------------------------------------------

/**
 * Rattachement de chaque fiche à ses sous-lots (décision G5). Contrôlé : chaque sous-lot existe dans la Checklist,
 * appartient à un lot que la fiche porte (« Lots du plan »), et chaque lot porté par la fiche a au moins un sous-lot.
 */
export const RATTACHEMENT_SOUS_LOTS = Object.freeze({
  'EX-001': ['I.2', 'A.1', 'E.3'], 'EX-002': ['I.4', 'A.1', 'E.1'], 'EX-003': ['I.3', 'A.1', 'A.5', 'E.3'],
  'EX-004': ['I.4', 'A.2', 'E.3'], 'EX-005': ['I.4', 'A.3', 'E.1'], 'EX-006': ['I.4', 'A.4', 'E.1'],
  'EX-007': ['I.4', 'A.5', 'E.2', 'E.4'],
  'EX-008': ['A.5', 'C.2', 'X.4'], 'EX-009': ['A.1', 'C.2', 'X.4'], 'EX-010': ['A.5', 'C.2', 'X.2'], 'EX-011': ['A.5', 'C.2', 'X.2'],
  'EX-012': ['A.1', 'R.2'], 'EX-013': ['A.1', 'A.4', 'R.2'], 'EX-014': ['A.1', 'R.1'], 'EX-015': ['A.4', 'R.1'],
  'EX-016': ['A.5', 'R.1'], 'EX-017': ['A.5', 'R.2'], 'EX-018': ['A.5', 'R.1'], 'EX-019': ['A.1', 'R.1'],
  'EX-020': ['A.2', 'C.2'], 'EX-021': ['A.4', 'C.2'], 'EX-022': ['A.4', 'C.2'], 'EX-023': ['A.2', 'A.3', 'C.1'],
  'EX-024': ['A.5', 'C.1'], 'EX-025': ['A.2', 'C.1'],
  'EX-026': ['B.1', 'X.4', 'F.3'], 'EX-027': ['B.1', 'X.4', 'F.3'], 'EX-028': ['B.1', 'X.2', 'F.3'], 'EX-029': ['B.2', 'X.2', 'F.3'],
  'EX-030': ['B.1', 'B.3', 'X.4', 'F.3'], 'EX-031': ['B.1', 'X.2', 'F.3'],
  'EX-032': ['B.2', 'I.5'], 'EX-033': ['B.2', 'I.5'], 'EX-034': ['B.2', 'I.3'], 'EX-035': ['B.2', 'I.5'], 'EX-036': ['B.2', 'I.5'],
  'EX-037': ['B.2', 'I.5'],
  'EX-038': ['B.3', 'R.1'], 'EX-039': ['B.3', 'R.1'], 'EX-040': ['B.3', 'R.1'], 'EX-041': ['B.3', 'R.1'], 'EX-042': ['B.3', 'R.1'],
  'EX-043': ['B.3', 'R.3'], 'EX-044': ['B.3', 'R.4'],
  'EX-045': ['A.5', 'D.1', 'R.3'], 'EX-046': ['A.5', 'D.1', 'R.4'], 'EX-047': ['A.5', 'D.2', 'R.2'], 'EX-048': ['A.5', 'D.2', 'R.3'],
  'EX-049': ['A.5', 'D.2', 'R.3'],
  'EX-050': ['C.2'], 'EX-051': ['C.2'], 'EX-052': ['C.1'], 'EX-053': ['C.1'], 'EX-054': ['C.1'],
  'EX-055': ['A.2', 'C.2', 'F.1'], 'EX-056': ['A.3', 'C.2', 'F.1'], 'EX-057': ['A.3', 'C.2', 'F.1'], 'EX-058': ['A.3', 'C.2', 'F.1'],
  'EX-059': ['D.1'], 'EX-060': ['D.1'], 'EX-061': ['D.2'], 'EX-062': ['D.3'], 'EX-063': ['D.3'],
  'EX-064': ['E.1'], 'EX-065': ['E.1'], 'EX-066': ['E.1', 'E.6'], 'EX-067': ['E.1', 'E.6'], 'EX-068': ['E.1'], 'EX-069': ['E.2'],
  'EX-070': ['E.2'],
  'EX-071': ['E.5', 'F.2'], 'EX-072': ['E.5', 'F.2'], 'EX-073': ['E.5', 'F.2'],
  'EX-074': ['E.3', 'E.4'], 'EX-075': ['E.3'], 'EX-076': ['E.3', 'E.4'], 'EX-077': ['E.3'], 'EX-078': ['E.3'], 'EX-079': ['E.6'],
  'EX-080': ['E.6'], 'EX-081': ['E.4'], 'EX-082': ['E.4'],
  'EX-083': ['E.4', 'X.2'], 'EX-084': ['E.2', 'X.2'], 'EX-085': ['E.4', 'X.2'], 'EX-086': ['E.2', 'X.2'],
  'EX-087': ['A.1', 'R.1', 'X.2'], 'EX-088': ['A.1', 'R.1', 'X.2'], 'EX-089': ['A.1', 'R.2', 'X.2'], 'EX-090': ['A.1', 'R.2', 'X.2'],
  'EX-091': ['A.1', 'R.1', 'X.2'],
  'EX-092': ['X.2'], 'EX-093': ['X.2'], 'EX-094': ['X.2'], 'EX-095': ['X.1'], 'EX-096': ['X.4'], 'EX-097': ['X.1'], 'EX-098': ['X.1'],
  'EX-099': ['X.1'], 'EX-100': ['X.5'], 'EX-101': ['X.4'],
  'EX-102': ['X.3'], 'EX-103': ['X.3', 'X.5'], 'EX-104': ['X.3'],
  'INV-001': ['E.4'], 'INV-002': ['A.4', 'C.2'], 'INV-003': ['A.4', 'R.1'], 'INV-004': ['E.1'], 'INV-005': ['A.5', 'R.2'],
  'INV-006': ['C.2'], 'INV-007': ['X.1'], 'INV-008': ['C.2'], 'INV-009': ['B.2', 'I.5'], 'INV-010': ['X.2'],
  'INV-011': ['A.5', 'D.2', 'R.3'], 'INV-012': ['E.4'], 'INV-013': ['A.4', 'R.1'], 'INV-014': ['B.3', 'R.3'], 'INV-015': ['B.2', 'I.5'],
  'IF-001': ['I.3', 'A.1', 'E.3'], 'IF-002': ['A.2', 'C.1'], 'IF-003': ['A.5', 'D.1', 'D.2', 'R.1'], 'IF-004': ['A.5', 'D.1', 'R.1'],
  'IF-005': ['B.3', 'R.1'], 'IF-006': ['A.5', 'R.1', 'X.2'], 'IF-007': ['D.1', 'D.2'], 'IF-008': ['E.3'], 'IF-009': ['E.4'],
  'IF-010': ['E.2'], 'IF-011': ['A.5', 'D.1', 'R.4'],
  'AC-001': ['A.4', 'C.2'], 'AC-002': ['B.3', 'R.1'], 'AC-003': ['A.5', 'D.2', 'R.3'], 'AC-004': ['C.1'], 'AC-005': ['X.1'],
  'AC-006': ['D.2'], 'AC-007': ['E.5', 'F.2'], 'AC-008': ['E.3'], 'AC-009': ['E.4'], 'AC-010': ['E.4', 'X.2'], 'AC-011': ['X.3', 'X.5'],
});

/** Composants Studio actuels de chaque sous-lot (chemins contrôlés au dépôt). */
export const COMPOSANTS_SOUS_LOTS = Object.freeze({
  'I.1': ['apps/web/src/modules/studio/routes-studio.ts'],
  'I.2': ['apps/web/src/modules/studio/StudioShell.tsx', 'apps/web/src/modules/studio/routes-studio.ts', 'apps/web/src/modules/studio/accueil'],
  'I.3': ['apps/web/src/modules/studio/contexte', 'apps/api/src/lib/studio-contexte.ts'],
  'I.4': ['apps/web/src/modules/studio/domaines', 'apps/web/src/modules/studio/espace'],
  'I.5': ['apps/web/src/modules/studio/planche2d/alternatives-gestes.ts', 'apps/web/src/modules/studio/hors-ligne/AvisFileLocale.tsx'],
  'A.1': ['packages/atelier-model/src/studio/document-2d.ts', 'apps/api/src/lib/studio-commands.ts', 'apps/api/src/lib/studio-migrations.ts', 'apps/api/src/lib/studio-variantes.ts'],
  'A.2': ['apps/web/src/modules/studio/planche2d', 'packages/atelier-model/src/studio/document-2d.ts'],
  'A.3': ['apps/web/src/modules/studio/vue3d', 'packages/atelier-model/src/studio/objets-3d', 'packages/atelier-model/src/studio/solides-libres.ts'],
  'A.4': ['packages/atelier-model/src/studio/architecture', 'packages/atelier-model/src/studio/copie-independante.ts'],
  'A.5': ['packages/atelier-model/src/studio/commandes', 'packages/atelier-model/src/studio/cmd', 'packages/atelier-model/src/studio/history.ts', 'packages/atelier-model/src/studio/concurrence.ts', 'apps/api/src/lib/studio-commands.ts'],
  'B.1': ['packages/atelier-model/src/studio/registry.ts', 'packages/atelier-model/src/studio/manifeste-outils.ts', 'packages/atelier-model/src/studio/registre'],
  'B.2': ['apps/web/src/modules/studio/planche2d/profils.ts', 'apps/web/src/modules/studio/planche2d/CatalogueOutils.tsx', 'apps/api/src/lib/studio-profils.ts'],
  'B.3': ['apps/web/src/modules/studio/chargement', 'apps/web/src/modules/studio/hors-ligne'],
  'C.1': ['apps/web/src/modules/studio/planche2d/index-spatial.ts', 'apps/web/src/modules/studio/planche2d/accrochage'],
  'C.2': ['packages/atelier-model/src/studio/projections.ts', 'apps/web/src/modules/studio/vue3d/etat-projection.ts'],
  'D.1': ['apps/web/src/modules/studio/taches/ordonnanceur.ts', 'apps/web/src/modules/studio/taches/pool-studio.ts'],
  'D.2': ['apps/web/src/modules/studio/exact/client-exact.ts', 'apps/web/src/modules/studio/exact/booleen-session.ts', 'docs/studio/SPEC-REDEMARRAGE-NOYAU-EXACT.md'],
  'D.3': ['apps/web/src/modules/studio/taches/transferts.ts', 'apps/web/src/modules/studio/chargement/gestionnaire-ressources.ts'],
  'E.1': ['packages/atelier-model/src/studio/exigences', 'packages/atelier-model/src/studio/conclusions-controle.ts', 'apps/api/src/lib/studio-modeles-externes.ts'],
  'E.2': ['apps/api/src/lib/studio-observations.ts', 'packages/atelier-model/src/studio/rapprochement-observations.ts', 'apps/web/src/modules/studio/observations'],
  'E.3': ['packages/atelier-model/src/studio/quantites.ts', 'packages/atelier-model/src/studio/feuille.ts', 'packages/atelier-model/src/studio/dossier-conception.ts', 'apps/api/src/lib/studio-dossiers.ts'],
  'E.4': ['apps/api/src/lib/studio-publications.ts', 'apps/api/src/lib/studio-publication-statuts.ts', 'packages/atelier-model/src/studio/workflow.ts', 'apps/api/src/lib/studio-delegations.ts'],
  'E.5': ['packages/atelier-model/src/studio/scenes', 'apps/web/src/modules/studio/vue3d'],
  'E.6': ['packages/atelier-model/src/studio/echanges', 'packages/atelier-model/src/studio/ifc.ts', 'packages/atelier-model/src/studio/import-dxf.ts'],
  'F.1': ['packages/atelier-model/src/studio/accelerations.ts', 'apps/web/src/modules/studio/planche2d/rendus'],
  'F.2': ['apps/api/src/lib/studio-illustrations.ts', 'apps/web/src/modules/studio/illustration'],
  'F.3': ['apps/api/src/lib/studio-agents.ts', 'apps/api/src/routes/mcp-studio.ts'],
  'R.1': ['apps/api/src/lib/studio-migrations.ts', 'apps/api/src/lib/studio-bascule.ts'],
  'R.2': ['apps/api/src/lib/studio-archive.ts', 'apps/api/src/lib/studio-archive-manifest.ts'],
  'R.3': ['apps/web/e2e/studio-navigation.mjs'],
  'R.4': ['apps/api/src/lib/studio-bascule.ts'],
  'R.5': ['apps/api/src/lib/studio-surveillance.ts', 'apps/api/src/routes/admin/surveillance.ts'],
  'X.1': ['packages/atelier-model/src/studio/corpus', 'apps/web/src/modules/studio/chargement/perf.ts'],
  'X.2': ['apps/api/src/lib/studio-commands.ts', 'apps/api/src/routes/studio-permissions.test.ts'],
  'X.3': ['scripts/registre/controles-suivi.mjs', 'scripts/registre/etat-studio.mjs', 'scripts/registre/rattachements-studio.mjs'],
  'X.4': ['scripts/check-module-deps.mjs', 'apps/api/src/lib/studio-contrats-routes.ts'],
  'X.5': ['scripts/registre/controle-preuves.test.mjs', 'docs/workstreams/studio'],
});

/** Sous-lots de la Checklist : « ### A.2 — Titre » ou « ### 5.2 Lot A — A.1 Titre ». */
export function sousLotsChecklist(texte) {
  const m = new Map();
  let lot = null;
  for (const l of texte.split('\n')) {
    const a = /^### ([A-Z]\.\d) — (.+)$/.exec(l) ?? /^### 5\.\d (?:Lot|Transversal) [A-Z] — ([A-Z]\.\d) (.+)$/.exec(l);
    if (a) { m.set(a[1], a[2].trim()); continue; }
    const enTete = /^### (5\.\d (?:Lot|Transversal) [A-Z] — .+)$/.exec(l);
    if (enTete) { lot = enTete[1].trim(); continue; }
    // Premier sous-lot sans titre propre (I.1 sous « 5.1 Lot I », F.1 sous « 5.8 Lot F ») : ses tâches le définissent.
    const tache = /^- \[[ x]\] \*\*([A-Z]\.\d)-\d+\*\*/.exec(l);
    if (tache && !m.has(tache[1]) && lot) m.set(tache[1], `tâches ${tache[1]} sous « ${lot} »`);
  }
  return m;
}

/** Lots du plan portés par une fiche (« A/D/R » → A, D, R ; « X/pilotage » → X ; « F option » → F). */
export const lotsDeFiche = (lot) => [...new Set(String(lot).split('/').map((x) => x.trim().charAt(0)).filter((c) => /[A-Z]/.test(c)))];

/** Source exécutée d'un fichier de preuve : `x.test.ts` / `x.preuves-y.test.ts` → `x.ts` (ou `.tsx`), sinon son dossier. */
export function composantDePreuve(f, existe) {
  if (!f || /\/e2e\//.test(f) || !/\.test\.(?:ts|tsx|mjs)$/.test(f)) return null;
  const base = f.replace(/(?:\.[\w-]+)?\.test\.(?:ts|tsx|mjs)$/, '');
  for (const ext of ['.ts', '.tsx', '.mjs']) if (existe(base + ext)) return base + ext;
  return dirname(f);
}

/** Écarts du rattachement (vide = complet). `existe(chemin)` relit le dépôt. */
export function controlerRattachement(fiches, idsRegistreTr, sousLots, existe, rattachement = RATTACHEMENT_SOUS_LOTS, composants = COMPOSANTS_SOUS_LOTS) {
  const ecarts = [];
  const ids = fiches.map((f) => f.id);
  if (new Set(ids).size !== ids.length) ecarts.push('X.3-01 : identifiant de fiche dupliqué');
  const attendus = new Set(ids);
  for (const id of Object.keys(rattachement)) if (!attendus.has(id)) ecarts.push(`X.3-01 : ${id} rattaché mais absent des fiches REF-02 (identifiant changé ?)`);
  for (const id of idsRegistreTr) if (!attendus.has(id.replace(/^TR-/, ''))) ecarts.push(`X.3-01 : ${id} au registre sans fiche`);
  for (const f of fiches) {
    if (!idsRegistreTr.includes(`TR-${f.id}`)) ecarts.push(`X.3-01 : ${f.id} sans obligation TR-${f.id} au registre`);
    const sl = rattachement[f.id];
    if (!sl?.length) { ecarts.push(`X.3-01 : ${f.id} sans sous-lot`); continue; }
    const lots = lotsDeFiche(f.lot);
    for (const s of sl) {
      if (!sousLots.has(s)) ecarts.push(`X.3-01 : ${f.id} → ${s} : sous-lot absent de la Checklist`);
      if (!lots.includes(s.charAt(0))) ecarts.push(`X.3-01 : ${f.id} → ${s} : le lot ${s.charAt(0)} n'est pas un lot de la fiche (${f.lot})`);
    }
    for (const l of lots) if (!sl.some((s) => s.charAt(0) === l)) ecarts.push(`X.3-01 : ${f.id} : aucun sous-lot du lot ${l} porté par la fiche (${f.lot})`);
    const candidats = (f.composants_candidats ?? []).map((c) => c.chemin);
    if (!candidats.length) ecarts.push(`X.3-01 : ${f.id} sans composant candidat`);
    for (const c of candidats) if (!existe(c)) ecarts.push(`X.3-01 : ${f.id} : composant candidat absent ${c}`);
  }
  for (const [s, cs] of Object.entries(composants)) {
    if (!sousLots.has(s)) ecarts.push(`X.3-01 : composants déclarés pour un sous-lot inconnu ${s}`);
    for (const c of cs) if (!existe(c)) ecarts.push(`X.3-01 : ${s} : composant Studio absent ${c}`);
  }
  return ecarts;
}

export function documentRattachement(fiches, registre, sousLots, existe, empreinte) {
  const taches = new Map(registre.tasks.map((t) => [t.id, t]));
  const parSousLot = new Map([...sousLots.keys()].map((s) => [s, []]));
  const lignes = [];
  for (const f of [...fiches].sort((a, b) => numerique(a.id, b.id))) {
    const sl = RATTACHEMENT_SOUS_LOTS[f.id] ?? [];
    sl.forEach((s) => parSousLot.get(s)?.push(f.id));
    const t = taches.get(`TR-${f.id}`) ?? {};
    const derives = [...new Set((t.preuves ?? []).filter((p) => p.etiquette === 'scénario exécuté').map((p) => composantDePreuve(p.fichier, existe)).filter(Boolean))].sort();
    const studio = [...new Set(sl.flatMap((s) => COMPOSANTS_SOUS_LOTS[s] ?? []))];
    lignes.push(`| ${f.id} | ${cellule(f.lot)} | ${sl.map((s) => `${s} ${court(sousLots.get(s), 40)}`).join(' ; ')} | ${(f.composants_candidats ?? []).length} | ${studio.map((c) => `\`${c}\``).join(', ')} | ${derives.length ? derives.map((c) => `\`${c}\``).join(', ') : 'à produire'} | ${cellule(t.statut ?? '—')} |`);
  }
  const vides = [...parSousLot].filter(([, v]) => !v.length).map(([s]) => s);
  return [
    '# Rattachement des fiches EX / INV / IF / AC aux sous-lots et aux composants (X.3-01)',
    '',
    '> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` (module `scripts/registre/rattachements-studio.mjs`) ; la CI',
    `> le recalcule à chaque commit. Registre SHA-256 \`${empreinte}\` ; sous-lots relus dans \`${CHECKLIST}\`.`,
    '',
    'Règle contrôlée (`controlerRattachement`, `node --test scripts/registre/controles-suivi.test.mjs`) : les identifiants sont',
    'exactement ceux des 141 fiches REF-02 (M004) et des obligations TR-* du registre — aucun renuméroté ; chaque fiche a au',
    'moins un sous-lot ; chaque sous-lot existe dans la Checklist et appartient à un lot que la fiche porte ; chaque lot porté a',
    'au moins un sous-lot ; chaque composant (candidat M004 ou Studio actuel) existe au dépôt. Le rattachement est une décision',
    'de traçabilité (lot G5) : il ne qualifie ni ne déclare conforme la fiche.',
    '',
    `**Synthèse** : ${fiches.length} fiches ; ${sousLots.size} sous-lots ; ${vides.length} sous-lot(s) sans fiche rattachée${vides.length ? ` (${vides.join(', ')} : tâches d'exploitation ou de pilotage sans exigence REF-02 propre)` : ''}.`,
    '',
    '## Fiches',
    '',
    '| Fiche | Lots du plan | Sous-lots | Candidats M004 | Composants Studio (sous-lots) | Composants des preuves exécutées | État TR |',
    '|---|---|---|---:|---|---|---|',
    ...lignes,
    '',
    '## Index par sous-lot',
    '',
    '| Sous-lot | Titre (Checklist) | Fiches |',
    '|---|---|---|',
    ...[...parSousLot].sort(([a], [b]) => numerique(a, b)).map(([s, ids]) => `| ${s} | ${cellule(sousLots.get(s))} | ${ids.join(', ') || '—'} |`),
    '',
  ].join('\n');
}

// --- Rapprochements d'agrégation ------------------------------------------------------------------------------------

/** Identifiants cités : « TEST-001 à TEST-014 », « TEST-034/035 », « AC-007 à AC-010 », « TEST-025/026/032 ». */
export function citesDe(texte) {
  const out = [];
  for (const m of String(texte).matchAll(/\b(TEST|AC)-(\d{3})((?:\/\d{3})*)(?:\s+à\s+(?:TEST|AC)-(\d{3}))?/g)) {
    const [, type, debut, suite, fin] = m;
    const n = (x) => `${type}-${String(x).padStart(3, '0')}`;
    if (fin) for (let i = Number(debut); i <= Number(fin); i++) out.push(n(i));
    else { out.push(n(debut)); for (const x of suite.split('/').filter(Boolean)) out.push(n(x)); }
  }
  return [...new Set(out)];
}
/** Obligation du registre d'un identifiant cité (AC-xxx → TR-AC-xxx). */
export const obligationDe = (id) => (id.startsWith('AC-') ? `TR-${id}` : id);

/**
 * Agrégats : les cités viennent de la description du registre ; pour les jalons ou livrables qui ne citent rien,
 * les facettes sont déclarées ici (décision G5, d'après la Checklist §5 et les scénarios TEST).
 */
export const AGREGATS = Object.freeze({
  'A.2-09': { garde: 'TEST-001' },
  'REC-A-02': {},
  'REC-B-01': { facettes: { 'manifeste et chargeurs': ['TEST-016', 'TEST-017'], 'Manager et profils persistants': ['TEST-018', 'TEST-019'], 'politique de cache et hors connexion': ['TEST-020', 'TEST-021', 'TEST-036'], 'rapport réseau / mémoire': ['AC-002'] } },
  'REC-C-02': { externe: 'évaluation des profils GPU sur appareil réel : aucun GPU physique ni téléphone dans cet environnement (runner Linux, rendu logiciel SwiftShader) — DEC-13 ; recette `docs/workstreams/studio/recettes/RECETTE-APPAREILS.md`' },
  'REC-E-01': {},
  'REC-E-02': {},
  'F.3-04': {},
  'J6': { facettes: { BIM: ['TEST-027', 'TEST-028'], 'visualisation de base': ['TEST-026'], 'métrés': ['TEST-009', 'TEST-010', 'AC-008'], observations: ['TEST-029'], 'revue et publication': ['TEST-030', 'TEST-031', 'TEST-038', 'AC-009'] } },
});

/**
 * Preuves livrées au code par les lots d'achèvement (huit lots intégrés : API, REG, DEC, F, CMD, PUB, REND, OUT) et pas
 * encore reportées au registre. Chaque libellé est relu mot pour mot dans son fichier à la génération (échec sinon).
 */
export const PREUVES_LOTS = Object.freeze({
  'TEST-011': { lot: 'PUB', preuves: [
    ['packages/atelier-model/src/studio/studio-invariants.test.ts', ["TEST-011 [+] annuler puis rétablir la modification d'une baie : mêmes identités, volume net 3,18 puis 3,096 m³, documents identiques"]],
    ['apps/api/src/routes/studio-pub.preuves-pub.test.ts', ["TEST-011 [+] API : après annuler puis rétablir l'opération, la publication diffusée reste lisible et vérifiable (mêmes empreintes), son manifeste inchangé"]],
    ['apps/web/e2e/studio-pub.mjs', ['TEST-011 : chaque fichier du paquet relu à la même empreinte']],
  ] },
  'TEST-027': { lot: 'PUB', preuves: [
    ['packages/atelier-model/src/studio/studio-invariants.test.ts', ["TEST-027 [+] modifier le rectangle dessiné (2 × 1 → 3 × 1) fait passer l'écart signé de 0 à +1 m² ; l'exigence n'est pas réécrite"]],
    ['apps/web/e2e/studio-exigences.mjs', ['TEST-027 : mur allongé par commande (nouvelle révision)', 'TEST-027 : exigence identique après la modification du dessin (même version, mêmes valeurs)', 'TEST-027 : écart calculé et visible (mesure 11,6 m³ contre ≤ 10 m³, +1,6)']],
  ] },
  'TEST-032': { lot: 'F', preuves: [
    ['apps/api/src/routes/studio-illustrations.test.ts', ['TEST-032 [+] un éditeur produit une illustration locale depuis le rendu de la vue : 201, aucune révision, tête inchangée, provenance complète dans la réponse et dans le PNG archivé', "TEST-032 [−] un lecteur ne produit pas d'illustration (403) ; source sans provenance, d'une autre variante ou d'une révision inconnue : refus 422 ; variante archivée : 409 ; rien n'est écrit"]],
    ['apps/web/e2e/studio-lot-f.mjs', ["TEST-032 : aucune révision écrite par l'illustration (tête inchangée)", 'illustration archivée avec ses paramètres et sa provenance']],
  ] },
  'TEST-033': { lot: 'F', preuves: [
    ['apps/api/src/routes/studio-agents.test.ts', ["TEST-033 [+] F.3-02 [+] l'agent propose, rien n'est écrit ; la personne confirme dans Studio ; la révision est celle que la route humaine écrit pour la même enveloppe", "TEST-033 [−] commande protégée sans permission (jeton d'un lecteur), schéma étranger, champ forgé ou révision périmée : refus sans effet, aucune voie privilégiée"]],
    ['apps/web/e2e/studio-lot-f.mjs', ['TEST-033 : la confirmation écrit une révision, par le point d\'entrée commun', 'TEST-033 : idempotence — la même proposition rejouée rend son état confirmé, sans nouvelle écriture']],
  ] },
  'TR-AC-006': { lot: 'OUT', preuves: [
    ['apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts', ['plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée']],
    ['apps/web/e2e/studio-exact.mjs', ['TEST-015 : pas de corruption — document identique (empreinte de contenu), aucune commande en attente']],
  ] },
  'TR-AC-007': { lot: 'F', preuves: [
    ['packages/atelier-model/src/studio/agents/agents.test.ts', ["TR-AC-007 [+] / [−] l'illustration atteste le modèle inchangé et se déclare « non vérifiée » ; un modèle modifié ou une autre révision refusent l'illustration"]],
    ['apps/web/e2e/studio-lot-f.mjs', ['illustration produite : « non vérifiée », modèle source inchangé']],
  ] },
});

/**
 * Requalification sur le code actuel d'obligations encore ouvertes dont la suite du registre est en partie périmée :
 * preuves partielles écrites au dépôt (libellés relus) et ce qui manque encore réellement (vérifié au code le 26 octobre 2026).
 */
export const REQUALIFICATIONS = Object.freeze({
  'TR-AC-002': {
    preuves: [['apps/web/src/modules/studio/chargement/gestionnaire-ressources.test.ts', ['vingt outils usuels activés tour à tour : chaque moteur initialisé au plus une fois (D.3-04, AC-002)']]],
    manque: "la comparaison des requêtes, octets, chunks exécutés et de la mémoire à une **référence**, cache froid et chaud, est mesurée (`apps/web/e2e/studio-mesures-chargement.mjs`, étape de CI) mais sans référence désignée : il faut désigner le build et le profil de charge de référence (DEC-13 ; `DESIGNATION_CONFORMITE`, AC-011) puis archiver le relevé — décision du maître d'ouvrage, aucun taux présumé",
  },
  'TR-AC-004': {
    preuves: [['apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts', ['extrémité et intersection confondues : même point, même cible, même priorité avant et après index (au-dessus du seuil)', "trace des cas ambigus (plusieurs repères à égale distance) : relevée, non vide, même ordre départagé par l'index et le linéaire"]]],
    manque: "la trace des cas ambigus existe désormais (suite du registre périmée sur ce point) ; manque encore : des **références liées** (cotes associatives, liens) parmi les objets du corpus indexé, comparées entre l'index et l'algorithme de référence",
  },
  'TR-AC-005': {
    preuves: [['packages/atelier-model/src/studio/preuves-b.test.ts', ['boîte et prisme poussés / tirés, pivotés, apparence posée puis changée : maillage incrémental = maillage complet à chaque pas, volumes relus']]],
    manque: "poussé / tiré et changement de matériau désormais comparés avant / après le maillage incrémental ; manque encore : orbite et zoom comparés avant / après optimisation, et l'évaluation des profils GPU sur appareil réel, séparée de SwiftShader — EXTERNE (aucun GPU physique ici, DEC-13)",
  },
  'TR-AC-010': {
    preuves: [
      ['apps/api/src/routes/studio-invariants.preuves-d2.test.ts', ["AC-010 [−] le concepteur (éditeur) dont le profil affiche toutes les mutations reçoit un refus d'exécution de l'approbation ; rien n'est écrit"]],
      ['apps/api/src/routes/studio-profils-import.test.ts', ["profil importé contenant « Publier » sans le droit de publier (éditeur, lecteur) : refusé 403, rien n'est écrit ; le propriétaire, qui publie, l'importe"]],
    ],
    manque: "refus serveur de l'approbation au concepteur et import de profil sans effet sur les droits : au dépôt (l'import de profil existe, suite du registre périmée sur ce point) ; manque encore : « Approuver » n'est pas un outil du catalogue Studio (`STUDIO_TOOLS`), donc aucune découverte par recherche — fonction absente",
  },
});

const libellesPreuve = (p) => [...(typeof p.controle === 'string' ? [p.controle] : []), ...(p.controles ?? []), ...(typeof p.libelle === 'string' ? [p.libelle] : [])];

/** Libellés absents de leur fichier (vide = toutes les preuves des lots sont écrites au dépôt). */
export function controlerPreuvesLots(lire, preuvesLots = PREUVES_LOTS, requalifications = REQUALIFICATIONS) {
  const ecarts = [];
  for (const [id, { preuves }] of [...Object.entries(preuvesLots), ...Object.entries(requalifications)]) {
    for (const [f, libs] of preuves) {
      const c = lire(f);
      if (c === null) { ecarts.push(`${id} : fichier absent ${f}`); continue; }
      for (const l of libs) if (!c.includes(l)) ecarts.push(`${id} : libellé absent de ${f} : ${l}`);
    }
  }
  return ecarts;
}

/**
 * Garde A.2-09 : TEST-001 reste non clos jusqu'à la preuve exécutée de la composition et de la publication du dessin
 * (lot E, E.3-07). Lu dans le registre : son historique ne montre aucun état clos avant l'entrée qui cite la recette de
 * publication, et son état clos actuel porte une preuve exécutée dont un contrôle est la publication E.3-07.
 */
export function gardeTest001(registre) {
  const t = registre.tasks.find((x) => x.id === 'TEST-001');
  if (!t) return ['A.2-09 : TEST-001 absent du registre'];
  const clos = (s) => ['Vérifié', 'Accepté'].includes(s);
  const ecarts = [];
  const publication = (t.preuves ?? []).filter((p) => p.etiquette === 'scénario exécuté' && libellesPreuve(p).some((l) => /^E\.3-07\b/.test(l)));
  if (clos(t.statut) && !publication.length) ecarts.push('A.2-09 : TEST-001 clos sans preuve exécutée de la publication du dessin (E.3-07)');
  const h = t.historique ?? [];
  const fermeture = h.findIndex((e) => clos(e.statut));
  if (fermeture >= 0) {
    for (const e of h.slice(0, fermeture)) if (clos(e.statut)) ecarts.push('A.2-09 : TEST-001 clos dans son historique avant la preuve de publication');
    if (clos(h[fermeture].statut_precedent)) ecarts.push('A.2-09 : TEST-001 déjà clos avant l\'entrée de fermeture');
    if (!publication.some((p) => p.rapport && h[fermeture].preuve === p.rapport)) ecarts.push('A.2-09 : l\'entrée de fermeture de TEST-001 ne cite pas le rapport de la recette de publication');
  } else if (clos(t.statut)) ecarts.push('A.2-09 : TEST-001 clos sans entrée de fermeture dans son historique');
  return ecarts;
}

/** État d'une obligation citée : preuves au registre, preuves des lots, ce qui manque. */
export function etatObligation(id, registre, lire) {
  const ob = obligationDe(id);
  const t = registre.tasks.find((x) => x.id === ob);
  if (!t) return { id, obligation: ob, statut: 'absente du registre', preuvesRegistre: [], preuvesLots: null, manque: 'obligation absente du registre' };
  const exec = (t.preuves ?? []).filter((p) => p.etiquette === 'scénario exécuté');
  const preuvesRegistre = exec.map((p) => ({ fichier: p.fichier ?? p.trace ?? p.url, libelles: libellesPreuve(p), date: p.date ?? null }));
  const lots = PREUVES_LOTS[ob] ?? PREUVES_LOTS[id] ?? null;
  const verifie = ['Vérifié', 'Accepté'].includes(t.statut) && exec.length > 0;
  let manque;
  if (verifie) manque = /appareil réel|physique|build candidat/i.test(t.suite ?? '') ? `rien au dépôt ; reste hors dépôt : ${court(t.suite, 200)}` : 'rien au dépôt';
  else if (lots) manque = `preuve livrée au code (lot ${lots.lot}), exécutée en CI, à reporter au registre (statut actuel « ${t.statut} »)`;
  else if (REQUALIFICATIONS[ob]) manque = `requalifié sur le code : ${REQUALIFICATIONS[ob].manque}`;
  else manque = court(t.suite || 'aucune preuve exécutée', 320);
  return { id, obligation: ob, statut: t.statut, tests: t.tests?.etat ?? '—', preuvesRegistre, preuvesLots: lots, preuvesPartielles: REQUALIFICATIONS[ob]?.preuves ?? null, manque, couvert: verifie || !!lots };
}

/** Rapport d'agrégation (structure) : par agrégat, ses cités groupés et leur état. */
export function rapportAgregats(registre, lire) {
  const out = [];
  for (const [id, def] of Object.entries(AGREGATS)) {
    const t = registre.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`agrégat ${id} absent du registre`);
    const groupes = def.facettes ? Object.entries(def.facettes) : [['cités par la description', citesDe(t.description)]];
    if (def.garde) groupes.splice(0, groupes.length, ['cité par la description', [def.garde]]);
    const etats = groupes.map(([nom, ids]) => ({ nom, obligations: ids.map((x) => etatObligation(x, registre, lire)) }));
    const toutes = etats.flatMap((g) => g.obligations);
    const garde = def.garde === 'TEST-001' ? gardeTest001(registre) : [];
    const manques = toutes.filter((o) => !o.couvert);
    out.push({ id, description: t.description, statut: t.statut, suite: t.suite, groupes: etats, garde, externe: def.externe ?? null, manques, aReporter: toutes.filter((o) => o.couvert && o.preuvesLots && !['Vérifié', 'Accepté'].includes(o.statut)) });
  }
  return out;
}

export function documentAgregats(registre, lire, empreinte) {
  const rapport = rapportAgregats(registre, lire);
  const blocs = rapport.map((a) => {
    const verdict = a.garde.length ? `garde en échec : ${a.garde.join(' ; ')}` : a.manques.length ? `**incomplet** — ${a.manques.length} obligation(s) sans preuve exécutée : ${a.manques.map((o) => o.id).join(', ')}` : a.aReporter.length ? `**preuves au dépôt pour toutes les obligations citées** ; ${a.aReporter.length} à reporter au registre (${a.aReporter.map((o) => o.id).join(', ')})` : '**preuves au dépôt pour toutes les obligations citées**';
    const lignes = [
      `### ${a.id}`, '',
      `- **Agrégat** : ${cellule(a.description)}`,
      `- **Statut au registre** : ${a.statut} · **Verdict du rapprochement** : ${verdict}${a.externe ? ` ; **hors dépôt (EXTERNE)** : ${a.externe}` : ''}`,
      ...(a.id === 'A.2-09' ? [`- **Garde A.2-09** (\`gardeTest001\`) : ${a.garde.length ? a.garde.join(' ; ') : 'TEST-001 n\'a été clos qu\'à l\'entrée d\'historique qui cite la recette de publication, et sa preuve exécutée porte le contrôle E.3-07 (composition et publication du dessin).'}`] : []),
      '',
      '| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |',
      '|---|---|---|---|---|---|---|',
    ];
    for (const g of a.groupes) {
      for (const o of g.obligations) {
        const reg = o.preuvesRegistre.length ? o.preuvesRegistre.map((p) => `\`${cellule(p.fichier)}\` (${p.libelles.length})`).join(', ') : '—';
        const lots = o.preuvesLots ? `lot ${o.preuvesLots.lot} : ${o.preuvesLots.preuves.map(([f, l]) => `\`${f}\` (${l.length})`).join(', ')}` : o.preuvesPartielles ? `partielles : ${o.preuvesPartielles.map(([f, l]) => `\`${f}\` (${l.length})`).join(', ')}` : '—';
        lignes.push(`| ${cellule(g.nom)} | ${o.id} | ${o.obligation} | ${o.statut} / ${o.tests ?? '—'} | ${reg} | ${lots} | ${cellule(o.manque)} |`);
      }
    }
    lignes.push('');
    return lignes.join('\n');
  });
  return [
    '# Rapprochements d\'agrégation des recettes Studio',
    '',
    '> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` (module `scripts/registre/rattachements-studio.mjs`) ;',
    `> la CI le recalcule à chaque commit. Registre SHA-256 \`${empreinte}\`.`,
    '',
    'Pour chaque agrégat (A.2-09, REC-A-02, REC-B-01, REC-C-02, REC-E-01, REC-E-02, F.3-04, J6), chaque TEST-xxx / AC-xxx cité',
    '(relu dans la description du registre ; facettes déclarées pour REC-B-01 et J6, qui n\'en citent pas) est rapproché de',
    'son obligation : preuves « scénario exécuté » du registre (libellés contrôlés mot pour mot en CI par',
    '`registre-libelles.test.ts`), preuves livrées au code par les huit lots d\'achèvement et pas encore reportées au registre',
    '(libellés relus dans leurs fichiers à chaque génération), et ce qui manque réellement. Ce rapport ne modifie pas le registre',
    'et ne déclare aucun agrégat clos : le report des preuves et la clôture restent à faire au registre.',
    '',
    ...blocs,
  ].join('\n');
}

/** Lecture du dépôt (null si absent). */
export const lecteurDepot = (racine) => (f) => (existsSync(join(racine, f)) ? readFileSync(join(racine, f), 'utf8') : null);
