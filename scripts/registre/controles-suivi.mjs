#!/usr/bin/env node
/**
 * Contrôles de cohérence du suivi Studio (Checklist V1.0 §9.1, §X.3, ARC-08), lus sur le dépôt, sans réseau ni base :
 *
 *  - SUIVI-01 : aucune branche permanente — un workflow qui crée une branche de PR automatique la supprime avec sa PR et
 *              la retire, même en échec, si aucune PR ouverte ne la porte.
 *  - ARC-08  : Studio/ reste un dossier documentaire, distinct du module exécutable — aucun code produit
 *              (apps/<app>/src, packages/<paquet>/src, hors tests) ne vise un chemin de Studio/ ; aucun test ne l'importe
 *              (lecture comme texte de référence admise) ; Studio/ ne contient aucun fichier de code ni manifeste.
 *  - SUIVI-02 : une seule autorité normative — aucune copie d'un document directeur de Studio/ (même contenu, même nom
 *              ou même en-tête) ailleurs dans le dépôt ; les preuves `source` du registre épinglent un blob qui a été le
 *              contenu d'un fichier de Studio/.
 *  - SUIVI-08 : noms du protocole sans registre dupliqué — ADR seulement dans docs/continuity/decisions/, nommée par son
 *              identifiant, unique et listée dans l'index ; un seul registre vivant de tâches ; identifiants de décision
 *              uniques dans chaque journal et entre journaux.
 *  - SUIVI-07 / X.3-02 : chaînes obligation → lot → TEST/NAV → DEC → ADR — chaque fiche EX/INV/IF/AC a un lot du Plan,
 *              ses scénarios TEST/NAV existent au registre, ses DEC existent et chaque DEC arbitrée cite une décision
 *              versionnée qui la nomme ; matrice 141 = fiches ; dépendances DEC du registre résolues.
 *  - SUIVI-09 : rapports lourds identifiés — tout fichier de plus de 1 Mio du suivi (docs/ai-team/reports, docs/workstreams)
 *              est déclaré avec son SHA-256 dans scripts/registre/rapports-lourds.json ; chaque preuve qui porte un SHA-256
 *              désigne une version réelle (commit cité ou version courante) ; chaque exécution citée est une URL GitHub
 *              Actions stable et son verdict figure dans la preuve.
 *
 *   node scripts/registre/controles-suivi.mjs            # tous les contrôles ; code 1 si écart
 *   STUDIO_REGISTRE=/chemin/copie.json node scripts/registre/controles-suivi.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRE = 'docs/workstreams/studio/task-register.json';
export const FICHES = 'docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json';
export const MATRICE = 'docs/ai-team/reports/mission-004/A1/matrice-141-exigences-composants-tests-preuves.csv';
export const DECISIONS_M002 = 'docs/ai-team/reports/mission-003/DECISIONS-M002-D01-D08.md';
export const RAPPORTS_LOURDS = 'scripts/registre/rapports-lourds.json';
export const REF02 = 'Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx';
const SEUIL_LOURD = 1024 * 1024;

export const git = (racine, ...a) => execFileSync('git', ['-C', racine, ...a], { maxBuffer: 1 << 30 });
export const fichiersSuivis = (racine) => git(racine, 'ls-files', '-z').toString('utf8').split('\0').filter(Boolean);
const lire = (racine, f) => readFileSync(join(racine, f), 'utf8');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
/** Code sans commentaires (une mention dans un commentaire n'est pas un usage). */
export const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');

// --- ARC-08 -------------------------------------------------------------------------------------------------------
const CODE_PRODUIT = /^(?:apps|packages)\/[^/]+\/src\/.+\.(?:ts|tsx|js|mjs|cjs|jsx)$/;
const TEST = /\.test\.(?:ts|tsx|js|mjs)$|\/e2e\//;
// Chargement d'un fichier de Studio/ par le code : appel d'accès (lecture, URL, chemin) dont les arguments visent Studio/.
// Citer une source (« Studio/…md, §5.7 » dans une donnée) ou afficher le nom « Studio » n'est pas un chargement.
const VISE_STUDIO = /\b(?:readFileSync|readFile|createReadStream|existsSync|readdirSync|fetch|new\s+URL|join|resolve|import)\s*\([^)\n]*(?:["'`][^"'`\n]*\bStudio\/|["'`]Studio["'`])/;
// Import statique en tête d'instruction, import dynamique ou require d'un fichier de Studio/.
const IMPORTE_STUDIO = /^\s*(?:import|export)\b[^;\n]*\bfrom\s*["'`][^"'`\n]*\bStudio\/|^\s*import\s*["'`][^"'`\n]*\bStudio\/|\b(?:import|require)\s*\(\s*["'`][^"'`\n]*\bStudio\//m;
const CODE_DANS_STUDIO = /\.(?:ts|tsx|js|mjs|cjs|jsx|py|sh)$|(?:^|\/)package\.json$/;

export function arc08(fichiers, contenu) {
  const ecarts = [];
  for (const f of fichiers) {
    if (f.startsWith('Studio/')) {
      if (CODE_DANS_STUDIO.test(f)) ecarts.push(`ARC-08 : ${f} — fichier de code ou manifeste dans le dossier documentaire Studio/`);
      continue;
    }
    if (!CODE_PRODUIT.test(f)) continue;
    const c = sansCommentaires(contenu(f));
    if (IMPORTE_STUDIO.test(c)) ecarts.push(`ARC-08 : ${f} — ${TEST.test(f) ? 'un test' : 'le code produit'} importe un fichier de Studio/ (seule la lecture d'un test comme texte de référence est admise)`);
    else if (!TEST.test(f) && VISE_STUDIO.test(c)) ecarts.push(`ARC-08 : ${f} — le code produit charge un fichier de Studio/`);
  }
  return ecarts;
}

// --- SUIVI-01 -----------------------------------------------------------------------------------------------------
/**
 * Aucune branche permanente (protocole de continuité) : un workflow qui crée une branche de PR automatique la supprime
 * avec sa PR (`delete-branch: true`) et la retire, même en échec, quand aucune PR ouverte ne la porte.
 */
export function suivi01(workflows) {
  const ecarts = [];
  for (const [f, t] of workflows) {
    if (!/peter-evans\/create-pull-request/.test(t)) continue;
    if (!/^\s*delete-branch:\s*true\s*$/m.test(t)) ecarts.push(`SUIVI-01 : ${f} — branche de PR automatique conservée (delete-branch: true attendu)`);
    const etapes = t.split(/\n(?=\s*- (?:name|uses):)/);
    if (!etapes.some((e) => /if:\s*always\(\)/.test(e) && /push origin --delete/.test(e) && /--state open/.test(e))) ecarts.push(`SUIVI-01 : ${f} — aucune étape « if: always() » ne retire la branche automatique restée sans PR ouverte`);
  }
  return ecarts;
}

// --- SUIVI-02 -----------------------------------------------------------------------------------------------------
const NORMATIF = /^Studio\/.+\.(?:md|docx|html)$/;
const entete = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join('\n');

export function suivi02(fichiers, blobs, contenu, blobsHistoriquesStudio, registre) {
  const ecarts = [];
  const normatifs = fichiers.filter((f) => NORMATIF.test(f));
  const parBlob = new Map(normatifs.map((f) => [blobs.get(f), f]));
  const parNom = new Map(normatifs.map((f) => [basename(f), f]));
  const parEntete = new Map(normatifs.filter((f) => f.endsWith('.md')).map((f) => [entete(contenu(f)), f]));
  for (const f of fichiers) {
    if (f.startsWith('Studio/')) continue;
    const meme = parBlob.get(blobs.get(f)) ?? parNom.get(basename(f));
    if (meme) ecarts.push(`SUIVI-02 : ${f} — copie de ${meme} hors de Studio/ (seconde autorité normative)`);
    else if (f.endsWith('.md')) {
      const e = parEntete.get(entete(contenu(f)));
      if (e) ecarts.push(`SUIVI-02 : ${f} — reproduit l'en-tête de ${e} hors de Studio/`);
    }
  }
  for (const t of registre.tasks) {
    (t.preuves ?? []).forEach((p, k) => {
      if (p.type === 'source' && p.blob && !blobsHistoriquesStudio.has(p.blob)) ecarts.push(`SUIVI-02 : ${t.id} preuves[${k}] — blob ${p.blob} jamais contenu d'un fichier de Studio/`);
    });
  }
  return ecarts;
}

// --- SUIVI-08 -----------------------------------------------------------------------------------------------------
const DOSSIER_ADR = 'docs/continuity/decisions/';
const ID_ADR = /^#\s+(ADR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2})\b/;

export function suivi08(fichiers, contenu, json) {
  const ecarts = [];
  const adr = new Map();
  for (const f of fichiers.filter((x) => x.endsWith('.md'))) {
    const m = ID_ADR.exec(contenu(f).split('\n', 1)[0] ?? '');
    if (!m) continue;
    if (!f.startsWith(DOSSIER_ADR)) ecarts.push(`SUIVI-08 : ${f} — ADR ${m[1]} hors de ${DOSSIER_ADR}`);
    if (basename(f) !== `${m[1]}.md`) ecarts.push(`SUIVI-08 : ${f} — nom de fichier différent de l'identifiant ${m[1]}`);
    if (adr.has(m[1])) ecarts.push(`SUIVI-08 : ${m[1]} défini deux fois (${adr.get(m[1])}, ${f})`);
    adr.set(m[1], f);
  }
  const index = fichiers.includes(`${DOSSIER_ADR}README.md`) ? contenu(`${DOSSIER_ADR}README.md`) : '';
  for (const [id, f] of adr) if (f.startsWith(DOSSIER_ADR) && !index.includes(`${id}.md`)) ecarts.push(`SUIVI-08 : ${id} absente de l'index ${DOSSIER_ADR}README.md`);
  // Un seul registre vivant de tâches (objets avec id et statut).
  for (const f of fichiers.filter((x) => x.endsWith('.json') && x.startsWith('docs/'))) {
    const d = json(f);
    const t = d && Array.isArray(d.tasks) ? d.tasks : null;
    if (t && t.length >= 100 && t.every((x) => x && typeof x.id === 'string' && 'statut' in x) && f !== REGISTRE) ecarts.push(`SUIVI-08 : ${f} — second registre de tâches (${t.length} entrées) ; le registre unique est ${REGISTRE}`);
  }
  // Identifiants de décision uniques dans chaque journal et entre journaux.
  const definis = new Map();
  const journaux = fichiers.filter((f) => f === 'docs/atelier/decisions.md' || /^docs\/workstreams\/[^/]+\/DECISIONS\.md$/.test(f) || (f.startsWith(DOSSIER_ADR) && ID_ADR.test(contenu(f).split('\n', 1)[0] ?? '')));
  for (const f of journaux) {
    const c = contenu(f);
    const ids = [...c.matchAll(/^\|\s*(D-\d{3})\s*\|/gm), ...c.matchAll(/^#{2,4}\s+((?:[A-Z]{1,6}-)?(?:D|P)-?\d{1,3})\s+—/gm)].map((m) => m[1]);
    const local = new Set();
    for (const id of ids) {
      if (local.has(id)) ecarts.push(`SUIVI-08 : ${f} — décision ${id} définie deux fois`);
      local.add(id);
      const cle = /^P-\d+$/.test(id) ? `${f}#${id}` : id; // P-nn est local à son ADR
      if (definis.has(cle) && definis.get(cle) !== f) ecarts.push(`SUIVI-08 : décision ${id} définie dans ${definis.get(cle)} et ${f}`);
      definis.set(cle, f);
    }
  }
  return ecarts;
}

// --- SUIVI-07 / X.3-02 ----------------------------------------------------------------------------------------------
const LETTRES_LOT = new Set(['I', 'A', 'B', 'C', 'D', 'E', 'F', 'R', 'X']);
const liste = (s) => String(s ?? '').split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
/** Scénarios cités par une fiche : identifiants TEST-nnn (écrits « nnn »), NAV-nnn, et sections de REF-02 (« §19.3 »). */
export function scenarios(texte) {
  const s = String(texte ?? '');
  const ids = [...s.matchAll(/\b(?:(TEST|NAV)-)?(\d{3})\b/g)].map((m) => `${m[1] ?? 'TEST'}-${m[2]}`);
  const sections = [...s.matchAll(/§(\d+(?:\.\d+)*)/g)].map((m) => `§${m[1]}`);
  return [...new Set([...ids, ...sections])];
}
/** Décisions citées : DEC-nn, plages « DEC-01 à DEC-18 » développées. */
export function decisionsCitees(texte) {
  const s = String(texte ?? '');
  const out = [];
  for (const m of s.matchAll(/DEC-(\d{2})(?:\s*(?:à|-)\s*DEC-(\d{2}))?/g)) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= b; n++) out.push(`DEC-${String(n).padStart(2, '0')}`);
  }
  return [...new Set(out)];
}

function csv(texte) {
  const lignes = [];
  let champ = '', ligne = [], guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guillemets = false; else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; } else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; } else if (c !== '\r') champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [tete, ...corps] = lignes;
  return corps.filter((l) => l.length > 1).map((l) => Object.fromEntries(tete.map((k, i) => [k, l[i] ?? ''])));
}

/** Chaînes de traçabilité : écarts et résumé par fiche. */
export function chaines(registre, fiches, matriceCsv, decisionsM002, contenu, existe, sectionsRef02 = new Set()) {
  const ecarts = [];
  const taches = new Map(registre.tasks.map((t) => [t.id, t]));
  const matrice = new Map(csv(matriceCsv).map((r) => [r.id, r]));
  const ids = fiches.map((f) => f.id);
  const tr = registre.tasks.filter((t) => t.id.startsWith('TR-')).map((t) => t.id.slice(3));
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...matrice.keys()].sort())) ecarts.push('X.3-02 : identifiants de la matrice 141 ≠ identifiants des fiches');
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...tr].sort())) ecarts.push('X.3-02 : identifiants des fiches ≠ tâches TR-* du registre');
  const resume = [];
  for (const f of fiches) {
    const m = matrice.get(f.id) ?? {};
    const lot = String(f.lot ?? '');
    const lettres = lot.split(/[/+\s,]+/).map((x) => x.trim()).filter((x) => /^[A-Z]$/.test(x));
    if (!lettres.length || lettres.some((l) => !LETTRES_LOT.has(l))) ecarts.push(`X.3-02 : ${f.id} — lot du Plan absent ou inconnu (${lot})`);
    const scen = scenarios(f.scenarios_RT_lies_proposes);
    if (JSON.stringify(scenarios(m.tests_proposes)) !== JSON.stringify(scen)) ecarts.push(`X.3-02 : ${f.id} — scénarios de la matrice (${m.tests_proposes}) ≠ fiche (${f.scenarios_RT_lies_proposes})`);
    if (!scen.length) ecarts.push(`X.3-02 : ${f.id} — aucun scénario TEST/NAV ni section de REF-02 (${f.scenarios_RT_lies_proposes})`);
    for (const x of scen) {
      if (x.startsWith('§') ? !sectionsRef02.has(x) : !taches.has(x)) ecarts.push(`X.3-02 : ${f.id} — scénario ${x} absent ${x.startsWith('§') ? 'de REF-02' : 'du registre'}`);
    }
    const decs = [...new Set([...decisionsCitees(f.decisions_applicables_a_qualifier), ...decisionsCitees(m.dec_techniques)])];
    if (!decs.length) ecarts.push(`X.3-02 : ${f.id} — aucune décision DEC rattachée`);
    for (const d of decs) if (!taches.has(d)) ecarts.push(`X.3-02 : ${f.id} — décision ${d} absente du registre`);
    for (const d of liste(m.decision_retenue)) if (!decisionsM002.includes(`## ${d} `)) ecarts.push(`X.3-02 : ${f.id} — décision ${d} absente de ${DECISIONS_M002}`);
    const t = taches.get(`TR-${f.id}`);
    for (const p of t?.preuves ?? []) if (p.fichier && !existe(p.fichier)) ecarts.push(`X.3-02 : TR-${f.id} — preuve ${p.fichier} absente du dépôt`);
    resume.push({ id: f.id, lot, scenarios: scen, decisions: decs });
  }
  // Chaque DEC arbitrée (Vérifié / Accepté) cite une décision versionnée qui la nomme.
  const nomme = new Map();
  for (const t of registre.tasks.filter((x) => /^DEC-\d{2}$/.test(x.id) && ['Vérifié', 'Accepté'].includes(x.statut))) {
    const docs = (t.preuves ?? []).filter((p) => ['decision_deleguee', 'adr_proposee'].includes(p.type) && p.fichier);
    const ok = docs.some((p) => existe(p.fichier) && new RegExp(`\\b${t.id}\\b`).test(contenu(p.fichier)));
    if (!ok) ecarts.push(`X.3-02 : ${t.id} — arbitrée sans décision versionnée qui la nomme (preuve decision_deleguee)`);
    nomme.set(t.id, docs.map((p) => p.fichier));
  }
  // Dépendances DEC du registre résolues.
  for (const t of registre.tasks) {
    for (const d of decisionsCitees(t.dependances?.decisions_applicables_a_instruire)) if (!taches.has(d)) ecarts.push(`X.3-02 : ${t.id} — dépendance ${d} absente du registre`);
  }
  return { ecarts, resume, decisions: nomme };
}

/** Paragraphes de `word/document.xml` d'un DOCX (archive ZIP lue sans dépendance) ; sections « 19.3 » → « §19.3 ». */
export function sectionsDocx(octets) {
  const xml = entreeZip(octets, 'word/document.xml').toString('utf8');
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0].replace(/<[^>]+>/g, ''));
  return new Set(paras.map((p) => /^(\d+(?:\.\d+)*)\.\s/.exec(p)?.[1]).filter(Boolean).map((n) => `§${n}`));
}
export function entreeZip(octets, nom) {
  let i = octets.length - 22;
  while (i >= 0 && octets.readUInt32LE(i) !== 0x06054b50) i--;
  const n = octets.readUInt16LE(i + 10);
  let p = octets.readUInt32LE(i + 16);
  for (let k = 0; k < n; k++) {
    const methode = octets.readUInt16LE(p + 10), taille = octets.readUInt32LE(p + 20);
    const ln = octets.readUInt16LE(p + 28), lx = octets.readUInt16LE(p + 30), lc = octets.readUInt16LE(p + 32);
    const local = octets.readUInt32LE(p + 42);
    if (octets.toString('utf8', p + 46, p + 46 + ln) === nom) {
      const debut = local + 30 + octets.readUInt16LE(local + 26) + octets.readUInt16LE(local + 28);
      const brut = octets.subarray(debut, debut + taille);
      return methode === 8 ? inflateRawSync(brut) : brut;
    }
    p += 46 + ln + lx + lc;
  }
  throw new Error(`${nom} absent de l'archive`);
}

// --- SUIVI-09 -----------------------------------------------------------------------------------------------------
const SUIVI = /^docs\/(?:ai-team\/reports|workstreams)\//;

export function suivi09(fichiers, taille, octets, octetsAuCommit, registre, declares) {
  const ecarts = [];
  const parFichier = new Map(declares.map((d) => [d.fichier, d]));
  for (const f of fichiers.filter((x) => SUIVI.test(x))) {
    if (taille(f) <= SEUIL_LOURD) continue;
    const d = parFichier.get(f);
    if (!d) ecarts.push(`SUIVI-09 : ${f} — rapport lourd (${taille(f)} octets) non déclaré dans ${RAPPORTS_LOURDS} (le conserver en artefact identifié, ou le déclarer avec son SHA-256 et sa raison)`);
    else if (d.sha256 !== sha256(octets(f)) && f !== REGISTRE) ecarts.push(`SUIVI-09 : ${f} — SHA-256 déclaré périmé`);
  }
  for (const d of declares) {
    if (!fichiers.includes(d.fichier)) ecarts.push(`SUIVI-09 : ${d.fichier} déclaré lourd mais absent`);
    if (!(typeof d.raison === 'string' && d.raison.length >= 15)) ecarts.push(`SUIVI-09 : ${d.fichier} — raison absente`);
  }
  for (const t of registre.tasks) {
    (t.preuves ?? []).forEach((p, k) => {
      const ou = `${t.id} preuves[${k}]`;
      if (p.sha256 && p.fichier) {
        const b = p.commit ? octetsAuCommit(p.commit, p.fichier) : (fichiers.includes(p.fichier) ? octets(p.fichier) : null);
        if (!b || sha256(b) !== p.sha256) ecarts.push(`SUIVI-09 : ${ou} — SHA-256 ${p.sha256.slice(0, 12)} ne désigne pas ${p.fichier}${p.commit ? ` au commit ${p.commit.slice(0, 12)}` : ' (version courante)'}`);
      }
      for (const cle of ['url_execution', 'url']) {
        const u = p[cle];
        if (typeof u === 'string' && /\/actions\/runs\//.test(u)) {
          if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+(?:\/job\/\d+)?$/.test(u)) ecarts.push(`SUIVI-09 : ${ou} — URL d'exécution instable ou mal formée (${u})`);
          if (p.etiquette === 'scénario exécuté' && !/\bsuccess\b/.test(String(p.environnement ?? ''))) ecarts.push(`SUIVI-09 : ${ou} — verdict de l'exécution absent de la preuve (environnement)`);
        }
      }
    });
  }
  return ecarts;
}

// --- Exécution sur le dépôt -------------------------------------------------------------------------------------------
export function controlerDepot(racine, cheminRegistre = join(racine, REGISTRE)) {
  const fichiers = fichiersSuivis(racine);
  const ensemble = new Set(fichiers);
  const cache = new Map();
  const contenu = (f) => { if (!cache.has(f)) cache.set(f, existsSync(join(racine, f)) ? lire(racine, f) : ''); return cache.get(f); };
  const json = (f) => { if (statSync(join(racine, f)).size > 8 * SEUIL_LOURD) return null; try { return JSON.parse(contenu(f)); } catch { return null; } };
  const blobs = new Map(git(racine, 'ls-files', '-s').toString('utf8').split('\n').filter(Boolean).map((l) => { const [meta, f] = l.split('\t'); return [f, meta.split(' ')[1]]; }));
  const historiques = new Set(git(racine, 'log', '--format=', '--raw', '--no-abbrev', '--', 'Studio').toString('utf8').split('\n').map((l) => l.split(/\s+/)[3]).filter(Boolean));
  for (const b of blobs.entries()) if (b[0].startsWith('Studio/')) historiques.add(b[1]);
  const registre = JSON.parse(readFileSync(cheminRegistre, 'utf8'));
  const fiches = JSON.parse(contenu(FICHES)).fiches;
  const declares = JSON.parse(contenu(RAPPORTS_LOURDS)).rapports;
  const octetsAuCommit = (c, f) => { try { return git(racine, 'show', `${c}:${f}`); } catch { return null; } };
  const c = chaines(registre, fiches, contenu(MATRICE), contenu(DECISIONS_M002), contenu, (f) => ensemble.has(f) || existsSync(join(racine, f)), sectionsDocx(readFileSync(join(racine, REF02))));
  const workflows = fichiers.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f)).map((f) => [f, contenu(f)]);
  return {
    'SUIVI-01': suivi01(workflows),
    'ARC-08': arc08(fichiers, contenu),
    'SUIVI-02': suivi02(fichiers, blobs, contenu, historiques, registre),
    'SUIVI-08': suivi08(fichiers, contenu, json),
    'X.3-02': c.ecarts,
    'SUIVI-09': suivi09(fichiers, (f) => statSync(join(racine, f)).size, (f) => readFileSync(join(racine, f)), octetsAuCommit, registre, declares),
    chaines: c,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const r = controlerDepot(racine, process.env.STUDIO_REGISTRE || undefined);
  let n = 0;
  for (const [id, ecarts] of Object.entries(r)) {
    if (id === 'chaines') continue;
    for (const e of ecarts) { console.error(e); n++; }
    console.log(`${id} : ${ecarts.length ? `${ecarts.length} écart(s)` : 'conforme'}`);
  }
  const complets = r.chaines.resume.filter((x) => x.scenarios.length && x.decisions.length).length;
  console.log(`Chaînes X.3-02 : ${r.chaines.resume.length} obligations, ${complets} avec lot, scénarios TEST/NAV et décisions DEC ; ${r.chaines.decisions.size} DEC arbitrées rattachées à leur décision versionnée.`);
  process.exit(n ? 1 : 0);
}
