#!/usr/bin/env node
/**
 * Contrôle automatique d'une PR du chantier Studio (Checklist V1.0 §9.2, PR-01 à PR-06 et PR-09 ; Plan §9.2) : le corps
 * de la PR suit le modèle `.github/PULL_REQUEST_TEMPLATE.md` (section « Unité de travail ») et la branche suit le
 * protocole `docs/continuity/README.md`.
 *
 *  - PR-01 : une Issue propre à l'unité de travail est liée (`Refs #n` / `Closes #n`), autre que le programme #156 et le
 *            canal #166 ; l'existence des Issues est vérifiée par le workflow (API GitHub).
 *  - PR-02 : besoin, sources, identifiants d'exigences (au moins un identifiant du référentiel) et périmètre inclus / exclu.
 *  - PR-03 : composant, contrats, décisions et migrations.
 *  - PR-04 : scénarios positifs et négatifs, preuves attendues, retour arrière.
 *  - PR-05 : branche courte `feat|fix|chore|docs/<issue>-<sujet>` dont l'Issue est liée ; preuves fournies (commit, test,
 *            recette, commande ou exécution).
 *  - PR-06 : codé, testé, déployé et accepté renseignés séparément ; « Testé » cite des tests ou recettes exécutés — une
 *            capture d'écran seule n'est jamais une preuve métier.
 *  - PR-09 : revalidation à la reprise — le HEAD de main revalidé (SHA) est contenu dans la branche et dans la base, et la
 *            CI de la reprise est citée.
 *
 * Périmètre : PR qui modifient un fichier du chantier Studio (`Studio/`, `docs/workstreams/studio/`, modules et paquets
 * Studio, recettes `studio-*`, `docs/ai-team/`). Exemption unique : PR ouverte par `github-actions[bot]` depuis une
 * branche `automation/…` (instantanés automatiques, corps généré).
 *
 *   node scripts/registre/controle-pr.mjs --corps corps.md --branche feat/123-x --base origin/main [--tete SHA] [--auteur login]
 *     [--sortie-issues fichier]   # numéros des Issues propres liées, un par ligne
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PERIMETRE_STUDIO = /^(?:Studio\/|docs\/workstreams\/studio\/|docs\/ai-team\/|apps\/web\/src\/modules\/studio\/|packages\/atelier-model\/src\/studio\/|apps\/api\/src\/(?:routes|lib|testing)\/studio|apps\/web\/e2e\/studio-)/;
export const CHAMPS = {
  'PR-02': ['Besoin', 'Sources', 'Identifiants d’exigences', 'Périmètre inclus', 'Périmètre exclu'],
  'PR-03': ['Composant', 'Contrats', 'Décisions', 'Migrations'],
  'PR-04': ['Scénarios positifs', 'Scénarios négatifs', 'Preuves attendues', 'Retour arrière'],
  'PR-06': ['Codé', 'Testé', 'Déployé', 'Accepté'],
  'PR-09': ['Revalidation à la reprise'],
};
const ISSUES_TRANSVERSES = new Set([156, 166]);
const BRANCHE = /^(?:feat|fix|chore|docs)\/(\d+)-[a-z0-9][a-z0-9-]*$/;
const ID_EXIGENCE = /\b(?:EX|INV|IF|AC|TEST|NAV|DEC|REC|TR-[A-Z]+|[A-Z]{2,8})-\d{2,3}\b|\b[A-Z]\.\d-\d{2}\b/;
const PREUVE = /\b[0-9a-f]{7,40}\b|\.test\.(?:ts|tsx|mjs)|apps\/web\/e2e\/[\w-]+\.mjs|\bnpm (?:run )?\w|\bnode --test\b|\bvitest\b|\/actions\/runs\/\d+/;
const IMAGE = /\.(?:png|jpe?g|gif|webp)\b|!\[[^\]]*\]\(/i;
const VIDE = /^(?:|…|\.\.\.|à compléter|a completer|à remplir|todo|tbd|nn|#nn|refs #nn|-)$/i;

const normaliser = (s) => s.replace(/'/g, '’').toLowerCase();
/** Valeur d'un champ « - **Libellé** : valeur » (jusqu'au champ ou à la section suivants). */
export function champ(corps, libelle) {
  const lignes = corps.split(/\r?\n/);
  const cible = normaliser(libelle);
  for (let i = 0; i < lignes.length; i++) {
    const m = /^\s*[-*]\s*\*\*(.+?)\*\*\s*:\s*(.*)$/.exec(lignes[i]);
    if (!m || normaliser(m[1]).replace(/\s*\(.*\)$/, '') !== cible) continue;
    const valeur = [m[2]];
    for (let j = i + 1; j < lignes.length && !/^\s*[-*]\s*\*\*.+?\*\*\s*:/.test(lignes[j]) && !/^#{1,6}\s/.test(lignes[j]); j++) valeur.push(lignes[j]);
    return valeur.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return null;
}

export function issuesLiees(corps) {
  return [...new Set([...corps.matchAll(/\b(?:refs?|closes?|closed|fix(?:es|ed)?|resolves?|resolved)\b:?\s+#(\d+)/gi)].map((m) => Number(m[1])))];
}

/**
 * Écarts du corps et de la branche d'une PR. `contient(sha)` : le commit est-il contenu dans la branche ET dans la base
 * (le workflow le vérifie par `git merge-base --is-ancestor`).
 */
export function controlerPr({ corps, branche, auteur = '', fichiers = [], contient = () => true }) {
  if (auteur === 'github-actions[bot]' && branche.startsWith('automation/')) return { applicable: false, ecarts: [], raison: 'PR automatique (github-actions[bot], branche automation/…)' };
  if (!fichiers.some((f) => PERIMETRE_STUDIO.test(f))) return { applicable: false, ecarts: [], raison: 'aucun fichier du chantier Studio modifié' };
  const ecarts = [];
  const issues = issuesLiees(corps);
  const propres = issues.filter((n) => !ISSUES_TRANSVERSES.has(n));
  if (!propres.length) ecarts.push('PR-01 : aucune Issue propre à l’unité de travail liée (« Refs #n » ou « Closes #n », autre que #156 et #166)');
  for (const [id, libelles] of Object.entries(CHAMPS)) {
    for (const l of libelles) {
      const v = champ(corps, l);
      if (v === null) ecarts.push(`${id} : champ « ${l} » absent (modèle .github/PULL_REQUEST_TEMPLATE.md, section « Unité de travail »)`);
      else if (VIDE.test(v.replace(/\s+/g, ' ').trim())) ecarts.push(`${id} : champ « ${l} » vide`);
    }
  }
  const ids = champ(corps, 'Identifiants d’exigences');
  if (ids && !VIDE.test(ids) && !ID_EXIGENCE.test(ids)) ecarts.push('PR-02 : « Identifiants d’exigences » ne cite aucun identifiant du référentiel (EX-nnn, INV-nnn, TEST-nnn, X.5-02…)');
  const b = BRANCHE.exec(branche);
  if (!b) ecarts.push(`PR-05 : branche « ${branche} » hors du protocole (feat|fix|chore|docs/<issue>-<sujet>, docs/continuity/README.md)`);
  else if (!issues.includes(Number(b[1]))) ecarts.push(`PR-05 : l’Issue #${b[1]} de la branche n’est pas liée dans la PR`);
  const preuves = [champ(corps, 'Preuves attendues'), champ(corps, 'Testé')].filter(Boolean).join('\n');
  if (preuves && !PREUVE.test(preuves)) ecarts.push('PR-05 : aucune preuve vérifiable (commit, test, recette, commande ou exécution de CI) dans « Preuves attendues » / « Testé »');
  const teste = champ(corps, 'Testé');
  if (teste && !VIDE.test(teste)) {
    const sansImages = teste.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\S+\.(?:png|jpe?g|gif|webp)\b/gi, '');
    if (IMAGE.test(teste) && !PREUVE.test(sansImages)) ecarts.push('PR-06 : « Testé » ne cite qu’une capture : une capture de bouton n’est pas une preuve métier (citer le test ou la recette exécutés)');
    else if (!PREUVE.test(teste) && !/^non\b/i.test(teste)) ecarts.push('PR-06 : « Testé » ne cite aucun test, recette, commande ou exécution');
  }
  const reprise = champ(corps, 'Revalidation à la reprise');
  if (reprise && !VIDE.test(reprise)) {
    const sha = /\b([0-9a-f]{7,40})\b/.exec(reprise)?.[1];
    if (!sha) ecarts.push('PR-09 : « Revalidation à la reprise » ne cite pas le SHA du HEAD de main revalidé');
    else if (!contient(sha)) ecarts.push(`PR-09 : le HEAD revalidé ${sha} n’est pas contenu dans la branche et dans la base (revalider après la reprise)`);
    if (!/\/actions\/runs\/\d+|\bCI\b/i.test(reprise)) ecarts.push('PR-09 : « Revalidation à la reprise » ne cite pas la CI revalidée');
  }
  return { applicable: true, ecarts, issues: propres };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const base = arg('--base') ?? 'origin/main';
  const git = (...a) => execFileSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  // Tête de la PR (--tete) : jamais le commit de fusion de test de GitHub, qui contient toujours la base.
  const tete = arg('--tete') ?? 'HEAD';
  const fichiers = git('diff', '--name-only', `${base}...${tete}`).split('\n').filter(Boolean);
  const ancetre = (sha, de) => { try { execFileSync('git', ['-C', racine, 'merge-base', '--is-ancestor', sha, de]); return true; } catch { return false; } };
  const r = controlerPr({
    corps: readFileSync(arg('--corps'), 'utf8'), branche: arg('--branche') ?? '', auteur: arg('--auteur') ?? '', fichiers,
    contient: (sha) => ancetre(sha, tete) && ancetre(sha, base),
  });
  if (!r.applicable) { console.log(`Contrôle de PR Studio non applicable : ${r.raison}.`); process.exit(0); }
  if (r.ecarts.length) { for (const e of r.ecarts) console.error(e); console.error(`PR non conforme au protocole Studio (${r.ecarts.length} écart(s)).`); process.exit(1); }
  console.log(`PR conforme au protocole Studio (PR-01 à PR-06, PR-09) ; Issues propres : ${r.issues.map((n) => `#${n}`).join(', ')}.`);
  // Numéros des Issues propres, relus par le workflow qui vérifie leur existence (API GitHub).
  if (arg('--sortie-issues')) writeFileSync(arg('--sortie-issues'), r.issues.join('\n'));
}
