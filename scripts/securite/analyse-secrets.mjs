#!/usr/bin/env node
/**
 * Analyse de secrets du suivi public (SUIVI-10) : secrets, URL sensibles et géométries privées de clients, sans
 * dépendance (ni service payant, ni paquet tiers) — motifs connus + liste d'autorisations motivées.
 *
 * Ce qui est lu : les fichiers suivis par Git (`git ls-files`), au commit courant ; avec `--historique BASE`, aussi les
 * lignes AJOUTÉES par chaque commit de `BASE..HEAD` (un secret ajouté puis retiré dans la même PR reste dans l'historique
 * publié). Fichiers binaires ignorés (octet nul), sauf pour la règle des géométries (par extension).
 *
 * Règles :
 *  - secrets : clés AWS, jetons GitHub / GitLab / Slack / Stripe / Google / OpenAI / Anthropic, clés privées PEM,
 *    jetons JWT, affectations de mot de passe / clé / jeton à une valeur littérale longue ;
 *  - URL sensibles : identifiants dans l'URL (`scheme://user:mot-de-passe@hôte`, hors hôtes locaux), paramètres de
 *    signature ou de jeton (`X-Amz-Signature`, `sig`, `token`, `access_token`, `api_key`…), webhooks Slack / Discord ;
 *  - géométries privées : fichiers de modèle ou de relevé (IFC, DXF, DWG, DGN, STEP, LAS / LAZ / E57, RVT, SKP, 3DM,
 *    OBJ, PLY) hors des dossiers de corpus et d'exemples déclarés.
 *
 * Autorisations : `scripts/securite/secrets-autorises.json` — chaque entrée {fichier (glob simple), regle, motif?, raison}
 * ; une entrée sans raison ou qui ne sert plus à rien fait échouer l'analyse (pas d'autorisation dormante).
 *
 *   node scripts/securite/analyse-secrets.mjs                 # dépôt courant
 *   node scripts/securite/analyse-secrets.mjs --historique origin/main
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGLES = [
  { id: 'cle-aws', motif: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'jeton-github', motif: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { id: 'jeton-gitlab', motif: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'jeton-slack', motif: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'cle-stripe', motif: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { id: 'cle-google', motif: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'cle-openai-anthropic', motif: /\bsk-(?:ant-)?(?:api\d{2}-|proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: 'cle-privee', motif: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'jwt', motif: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    id: 'affectation-secrete',
    // mot_de_passe / password / secret / token / api_key = "valeur littérale d'au moins 12 caractères sans espace".
    motif: /\b(?:password|passwd|mot_de_passe|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b["']?\s*[:=]\s*["'`]([^"'`\s$]{12,})["'`]/i,
  },
  // Mot de passe littéral seulement : une variable (`${…}`, `$VAR`, `\(…\)`) n'est pas un secret écrit.
  { id: 'url-identifiants', motif: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`$]+:([^\s@/'"`$\\(\[{]{3,})@(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|db|postgres|host|example\.(?:com|org))(?:[:/?#'"`\s]|$))[^\s'"`]+/i },
  { id: 'url-signee', motif: /[?&](?:X-Amz-Signature|X-Goog-Signature|sig|signature|token|access_token|api_key|apikey|key)=[A-Za-z0-9%._-]{16,}/ },
  { id: 'webhook', motif: /https:\/\/(?:hooks\.slack\.com\/services\/[A-Z0-9/]+|discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+)/ },
];
export const GEOMETRIE = /\.(?:ifc|ifczip|dxf|dwg|dgn|step|stp|las|laz|e57|rvt|rfa|skp|3dm|obj|ply)$/i;

// Glob simple : « **/ » = zéro ou plusieurs dossiers, « ** » = tout, « * » = tout sauf « / ».
export function correspond(glob, chemin) {
  const simple = (p) => p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  const re = glob.split('**/').map((morceau) => morceau.split('**').map(simple).join('.*')).join('(?:.*/)?');
  return new RegExp(`^${re}$`).test(chemin);
}

/** Constats d'un texte (une ligne = un constat par règle). */
export function analyserTexte(fichier, texte) {
  const out = [];
  texte.split('\n').forEach((ligne, i) => {
    for (const r of REGLES) {
      const m = r.motif.exec(ligne);
      if (m) out.push({ fichier, ligne: i + 1, regle: r.id, extrait: masquer(m[0]) });
    }
  });
  return out;
}
/** Un constat n'affiche jamais le secret : 4 premiers caractères, puis la longueur. */
export const masquer = (s) => `${s.slice(0, 4)}… (${s.length} caractères)`;

export function analyserFichiers(fichiers, lire) {
  const out = [];
  for (const f of fichiers) {
    if (GEOMETRIE.test(f)) out.push({ fichier: f, ligne: 0, regle: 'geometrie', extrait: f });
    const b = lire(f);
    if (!b || b.includes(0)) continue;
    out.push(...analyserTexte(f, b.toString('utf8')));
  }
  return out;
}

/** Applique les autorisations : rend les constats restants et les autorisations invalides ou inutilisées. */
export function filtrer(constats, autorisations) {
  const servies = new Set();
  const erreurs = [];
  autorisations.forEach((a, i) => {
    if (!a.fichier || !a.regle || !(typeof a.raison === 'string' && a.raison.trim().length >= 15)) erreurs.push(`autorisation ${i} : fichier, règle et raison (≥ 15 caractères) obligatoires`);
  });
  const restants = constats.filter((c) => {
    const i = autorisations.findIndex((a) => a.regle === c.regle && correspond(a.fichier, c.fichier) && (!a.motif || c.extrait.startsWith(a.motif.slice(0, 4))));
    if (i >= 0) { servies.add(i); return false; }
    return true;
  });
  autorisations.forEach((a, i) => { if (!servies.has(i)) erreurs.push(`autorisation inutilisée (à retirer) : ${a.fichier} / ${a.regle}`); });
  return { restants, erreurs };
}

function git(racine, ...args) {
  return execFileSync('git', ['-C', racine, ...args], { maxBuffer: 1 << 30 });
}

/** Lignes ajoutées par les commits de BASE..HEAD : { fichier, texte } par fichier et par commit. */
export function ajoutsHistorique(racine, base) {
  const sortie = git(racine, 'log', '--format=commit %H', '-p', '--unified=0', '--no-renames', '--diff-filter=AM', `${base}..HEAD`).toString('utf8');
  const out = [];
  let fichier = null, commit = null, lignes = [];
  const pousser = () => { if (fichier && lignes.length) out.push({ fichier, commit, texte: lignes.join('\n') }); lignes = []; };
  for (const l of sortie.split('\n')) {
    if (l.startsWith('commit ')) { pousser(); commit = l.slice(7); fichier = null; }
    else if (l.startsWith('+++ ')) { pousser(); fichier = l.startsWith('+++ b/') ? l.slice(6) : null; }
    else if (l.startsWith('+') && fichier) lignes.push(l.slice(1));
  }
  pousser();
  return out;
}

export function analyserDepot(racine, { historique } = {}) {
  const fichiers = git(racine, 'ls-files', '-z').toString('utf8').split('\0').filter(Boolean);
  const lire = (f) => { const p = join(racine, f); return existsSync(p) ? readFileSync(p) : null; };
  let constats = analyserFichiers(fichiers, lire);
  if (historique) {
    for (const a of ajoutsHistorique(racine, historique)) {
      if (GEOMETRIE.test(a.fichier)) constats.push({ fichier: a.fichier, ligne: 0, regle: 'geometrie', extrait: a.fichier, commit: a.commit });
      constats.push(...analyserTexte(a.fichier, a.texte).map((c) => ({ ...c, ligne: 0, commit: a.commit })));
    }
    const vus = new Set();
    constats = constats.filter((c) => { const k = `${c.fichier}|${c.regle}|${c.extrait}`; if (vus.has(k)) return false; vus.add(k); return true; });
  }
  const autorisations = JSON.parse(readFileSync(join(racine, 'scripts/securite/secrets-autorises.json'), 'utf8')).autorisations;
  return { analyses: fichiers.length, ...filtrer(constats, autorisations) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const i = process.argv.indexOf('--historique');
  const historique = i > 0 ? process.argv[i + 1] : undefined;
  const r = analyserDepot(racine, { historique });
  if (r.restants.length || r.erreurs.length) {
    for (const c of r.restants) console.error(`SECRET_POSSIBLE ${c.regle} ${c.fichier}${c.ligne ? `:${c.ligne}` : ''}${c.commit ? ` (commit ${c.commit.slice(0, 12)})` : ''} — ${c.extrait}`);
    for (const e of r.erreurs) console.error(`AUTORISATION ${e}`);
    console.error(`Analyse de secrets : ${r.restants.length} constat(s), ${r.erreurs.length} erreur(s) d'autorisation. Retirer le secret (et le révoquer s'il est réel) ou motiver une autorisation dans scripts/securite/secrets-autorises.json.`);
    process.exit(1);
  }
  console.log(`Analyse de secrets : ${r.analyses} fichiers suivis${historique ? ` et ajouts de ${historique}..HEAD` : ''}, aucun secret, URL sensible ni géométrie privée non autorisés.`);
}
