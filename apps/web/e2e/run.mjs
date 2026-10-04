#!/usr/bin/env node
/**
 * Scénario de bout en bout, découpé par module (cahier des charges, annexe D ; tâche L0.5).
 *
 * Le parcours de caractérisation (celui rejoué sur le prototype, docs/migration/reference.md) est le même
 * qu'avant le découpage : nouveau projet et 21 étapes, arbitrages Harmonie, programmation et bibliothèque,
 * chiffrage, exemple P.118 importé (référence protégée, variante en copie), Atelier natif et acceptation
 * P.118, bilan du bâtiment conçu, outil Parcelle et MapTiler simulé, péremption, archive, analyses,
 * documents, collaboration et partage, hors-ligne (Atelier et saisies), sources, Harmonie transversale,
 * Paramètres, accessibilité (axe-core, WCAG 2.2 AA), présentation téléphone, captures ordinateur (1280) et
 * téléphone (390) dans docs/migration/captures/webapp/.
 *
 * Chaque fichier de `scenarios/` appartient à un propriétaire (§9) et exporte des segments ; `PLAN` les
 * enchaîne dans l'ordre historique du parcours, avec la même base, le même navigateur et la même page :
 * mêmes contrôles, même nombre, même ordre que l'ancien `parcours-scenario.mjs`. Le total des contrôles
 * (et leur répartition par fichier) est imprimé et comparé à `attendu.json` : une baisse non justifiée
 * échoue. Justifier une baisse = mettre à jour `attendu.json` (compte, répartition et une entrée
 * d'historique avec le motif) dans le même commit, relu par le chef de projet.
 *
 * Prérequis : l'API construite qui sert le build de l'application (README, « End-to-end scenario »).
 *   node apps/web/e2e/run.mjs                       chaîne complète (CI)
 *   node apps/web/e2e/run.mjs --only 05-atelier     un fichier, précédé des segments dont il dépend
 *   node apps/web/e2e/run.mjs --plan [--only …]     affiche les segments retenus sans lancer le navigateur
 * Variables : BASE_URL (défaut http://localhost:4173), CHROMIUM_PATH.
 *
 * `--only` est une aide au développement : il exécute les segments du fichier demandé, précédés de
 * l'inscription et des segments qui produisent les valeurs qu'ils lisent (`lit` / `produit`) ou dont ils
 * continuent la page (`suit`), ou dont ils dépendent par l'état du serveur ou du navigateur (`prerequis`,
 * renseigné quand il est connu). Seule la chaîne complète fait foi (CI).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AXE_SCRIPT, BASE, OUT, axeCheck, bilan, check, launch, measure, measures } from "./lib/contexte.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));

/** Les fichiers de l'annexe D, un propriétaire chacun. */
const FICHIERS = [
  "00-compte.mjs",
  "01-import-exemple.mjs",
  "02-parcours-etapes.mjs",
  "03-parcelle.mjs",
  "04-programmation.mjs",
  "05-atelier.mjs",
  "06-harmonie.mjs",
  "07-documents.mjs",
  "08-collaboration.mjs",
  "09-hors-ligne.mjs",
  "10-accueil-parametres.mjs",
  "11-accessibilite.mjs",
  "12-mesures.mjs",
  "14-nouvel-atelier.mjs",
];

/**
 * Ordre d'exécution (celui du parcours historique). `lit` : valeurs relues dans le contexte partagé ;
 * `produit` : valeurs déposées pour la suite ; `suit` : segment dont la page est reprise telle quelle ;
 * `prerequis` : dépendances connues par l'état du serveur ou du navigateur (« fichier#segment »).
 */
const PLAN = [
  { fichier: "00-compte.mjs", segment: "inscription", lit: [], produit: ["email"] },
  { fichier: "02-parcours-etapes.mjs", segment: "nouveauProjet", lit: [], produit: ["projectUrl"] },
  { fichier: "06-harmonie.mjs", segment: "etape01Vierge", lit: ["projectUrl"], produit: ["parcelleHarmonie", "h01"] },
  { fichier: "06-harmonie.mjs", segment: "etape02", lit: [], produit: [], suit: "etape01Vierge" },
  { fichier: "04-programmation.mjs", segment: "etape06Repartition", lit: ["projectUrl"], produit: [] },
  { fichier: "04-programmation.mjs", segment: "bibliotheque", lit: ["projectUrl"], produit: [] },
  { fichier: "02-parcours-etapes.mjs", segment: "etape14Finance", lit: ["projectUrl"], produit: [] },
  { fichier: "02-parcours-etapes.mjs", segment: "etapes17et19", lit: ["projectUrl"], produit: [] },
  { fichier: "01-import-exemple.mjs", segment: "importExemple", lit: [], produit: ["exampleUrl"] },
  { fichier: "10-accueil-parametres.mjs", segment: "accueil", lit: ["exampleUrl"], produit: [] },
  { fichier: "01-import-exemple.mjs", segment: "exempleEtapes", lit: ["exampleUrl"], produit: ["variantUrl"] },
  { fichier: "05-atelier.mjs", segment: "atelierExemple", lit: ["email", "exampleUrl"], produit: ["examplePid", "rdcWallsOf", "atelierUrl", "atelierPid"] },
  { fichier: "05-atelier.mjs", segment: "acceptationP118", lit: ["email", "atelierUrl", "atelierPid"], produit: [], suit: "atelierExemple" },
  { fichier: "06-harmonie.mjs", segment: "etape10Harmonie", lit: ["exampleUrl", "variantUrl", "examplePid"], produit: [] },
  { fichier: "06-harmonie.mjs", segment: "bilanBatiment", lit: [], produit: ["maptilerLog"], suit: "etape10Harmonie" },
  { fichier: "03-parcelle.mjs", segment: "etape01Exemple", lit: ["parcelleHarmonie", "h01", "exampleUrl", "variantUrl", "maptilerLog"], produit: [] },
  { fichier: "06-harmonie.mjs", segment: "peremption", lit: ["variantUrl"], produit: [], prerequis: ["03-parcelle.mjs#etape01Exemple"] },
  { fichier: "07-documents.mjs", segment: "archive", lit: ["exampleUrl", "examplePid"], produit: [] },
  { fichier: "04-programmation.mjs", segment: "referenceEtape07", lit: ["exampleUrl", "examplePid"], produit: [] },
  { fichier: "07-documents.mjs", segment: "analyses", lit: ["exampleUrl"], produit: [] },
  { fichier: "07-documents.mjs", segment: "catalogue", lit: ["exampleUrl", "variantUrl"], produit: [], prerequis: ["06-harmonie.mjs#peremption", "07-documents.mjs#archive"] },
  { fichier: "08-collaboration.mjs", segment: "commentaires", lit: ["email", "exampleUrl"], produit: [] },
  { fichier: "09-hors-ligne.mjs", segment: "atelierHorsLigne", lit: ["exampleUrl", "rdcWallsOf", "atelierUrl", "atelierPid"], produit: [] },
  { fichier: "09-hors-ligne.mjs", segment: "saisiesHorsLigne", lit: ["projectUrl"], produit: ["testPid"] },
  { fichier: "07-documents.mjs", segment: "sources", lit: ["exampleUrl"], produit: [] },
  { fichier: "08-collaboration.mjs", segment: "partage", lit: ["email", "projectUrl", "testPid"], produit: [] },
  { fichier: "06-harmonie.mjs", segment: "pageTransversale", lit: ["examplePid", "testPid"], produit: [] },
  { fichier: "10-accueil-parametres.mjs", segment: "parametres", lit: ["email"], produit: [], prerequis: ["03-parcelle.mjs#etape01Exemple"] },
  { fichier: "04-programmation.mjs", segment: "bibliothequeP118", lit: ["exampleUrl"], produit: [] },
  { fichier: "11-accessibilite.mjs", segment: "ecrans", lit: ["exampleUrl", "variantUrl", "atelierUrl"], produit: [] },
  { fichier: "02-parcours-etapes.mjs", segment: "telephone", lit: ["projectUrl", "exampleUrl"], produit: [] },
  { fichier: "14-nouvel-atelier.mjs", segment: "ouverture", lit: ["exampleUrl"], produit: [] },
  { fichier: "14-nouvel-atelier.mjs", segment: "gestes", lit: ["email", "atelierUrl", "atelierPid"], produit: [] },
  { fichier: "14-nouvel-atelier.mjs", segment: "vue3d", lit: ["atelierUrl"], produit: [] },
  { fichier: "14-nouvel-atelier.mjs", segment: "pousserTirer", lit: ["atelierUrl", "atelierPid"], produit: [] },
  { fichier: "14-nouvel-atelier.mjs", segment: "mesures3d", lit: ["email", "atelierUrl", "atelierPid"], produit: [] },
  { fichier: "12-mesures.mjs", segment: "bilan", lit: [], produit: [] },
];

/** @returns {never} */
function usage(message) {
  if (message) console.error(message);
  console.error("Usage : node apps/web/e2e/run.mjs [--only <fichier de scenarios/>] [--plan]");
  process.exit(2);
}

// Arguments.
const args = process.argv.slice(2);
let only = null;
let planOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--only") only = args[++i] ?? usage("--only attend un nom de fichier.");
  else if (args[i].startsWith("--only=")) only = args[i].slice("--only=".length);
  else if (args[i] === "--plan") planOnly = true;
  else usage(`Argument inconnu : ${args[i]}`);
}
if (only !== null) {
  only = basename(only);
  if (!only.endsWith(".mjs")) only += ".mjs";
  if (!FICHIERS.includes(only)) usage(`Fichier inconnu : ${only} (attendus : ${FICHIERS.join(", ")}).`);
}

// Référence des contrôles, cohérente avec elle-même (une baisse se justifie dans l'historique).
const attendu = JSON.parse(readFileSync(join(ICI, "attendu.json"), "utf8"));
{
  const somme = FICHIERS.reduce((n, f) => n + (attendu.parFichier?.[f] ?? NaN), 0);
  const dernier = attendu.historique?.at(-1);
  if (somme !== attendu.controles || dernier?.controles !== attendu.controles || !dernier?.motif) {
    usage(`attendu.json incohérent : controles = ${attendu.controles}, somme par fichier = ${somme}, dernière entrée d'historique = ${JSON.stringify(dernier)} (chaque fichier de l'annexe D a son compte, et l'historique se termine par le compte courant et son motif).`);
  }
}

// Segments : chaque fonction exportée figure au plan, et inversement.
const modules = {};
for (const f of FICHIERS) modules[f] = await import(`./scenarios/${f}`);
for (const e of PLAN) if (typeof modules[e.fichier]?.[e.segment] !== "function") usage(`Segment absent : ${e.fichier}#${e.segment}`);
for (const f of FICHIERS) {
  for (const [nom, valeur] of Object.entries(modules[f])) {
    if (typeof valeur === "function" && !PLAN.some((e) => e.fichier === f && e.segment === nom)) usage(`Segment hors plan : ${f}#${nom} (l'ajouter à PLAN dans run.mjs).`);
  }
}

/** Indices du plan à exécuter : tout, ou le fichier demandé et la fermeture de ses dépendances. */
function selection() {
  if (only === null) return PLAN.map((_, i) => i);
  const garde = new Set();
  const index = (ref, avant) => {
    const [f, s] = ref.split("#");
    const j = PLAN.findIndex((e) => e.fichier === f && e.segment === s);
    if (j < 0 || j >= avant) usage(`Dépendance introuvable avant le segment ${avant} : ${ref}`);
    return j;
  };
  const ajoute = (i) => {
    if (garde.has(i)) return;
    garde.add(i);
    const e = PLAN[i];
    for (const nom of e.lit) {
      let j = -1;
      for (let k = i - 1; k >= 0; k--) if (PLAN[k].produit.includes(nom)) { j = k; break; }
      if (j < 0) usage(`Aucun segment ne produit « ${nom} » avant ${e.fichier}#${e.segment}`);
      ajoute(j);
    }
    if (e.suit) ajoute(index(`${e.fichier}#${e.suit}`, i));
    for (const ref of e.prerequis ?? []) ajoute(index(ref, i));
  };
  ajoute(0); // l'inscription ouvre la session de tous les segments
  PLAN.forEach((e, i) => e.fichier === only && ajoute(i));
  return [...garde].sort((a, b) => a - b);
}
const retenus = selection();

if (planOnly) {
  for (const i of retenus) console.log(`${String(i + 1).padStart(2)}. scenarios/${PLAN[i].fichier}#${PLAN[i].segment}`);
  console.log(`${retenus.length} segment(s) sur ${PLAN.length} ; contrôles attendus : ${only ? `${attendu.parFichier[only]} (${only})` : attendu.controles}.`);
  process.exit(0);
}

// Même navigateur, même contexte, même page pour tous les segments.
const browser = await chromium.launch(launch);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));
const sc = { BASE, OUT, AXE_SCRIPT, browser, ctx, page, consoleErrors, check, measure, axeCheck, measures };

let interruption = null;
for (const i of retenus) {
  const e = PLAN[i];
  bilan.fichierCourant = e.fichier;
  try {
    await modules[e.fichier][e.segment](sc);
  } catch (err) {
    interruption = { e, err };
    break;
  }
}
await browser.close();

if (interruption) {
  console.log(`✗ scénario interrompu dans scenarios/${interruption.e.fichier}#${interruption.e.segment} — ${interruption.err?.message ?? interruption.err}`);
  console.error(interruption.err);
}

// Comptabilité des contrôles.
let baisse = false;
const fichiersCompares = only ? [only] : FICHIERS;
for (const f of fichiersCompares) {
  const n = bilan.parFichier[f] ?? 0;
  const ref = attendu.parFichier[f];
  const ecart = n < ref ? `baisse de ${ref - n}` : n > ref ? `hausse de ${n - ref} (à reporter dans attendu.json)` : "conforme";
  console.log(`Σ scenarios/${f} : ${n} contrôle(s), attendu ${ref} — ${ecart}`);
  if (n < ref) baisse = true;
}
if (!only) {
  console.log(`Σ total : ${bilan.total} contrôle(s), attendu ${attendu.controles} (apps/web/e2e/attendu.json)`);
  if (bilan.total < attendu.controles) baisse = true;
}
if (baisse && !interruption) console.log("✗ contrôles : baisse non justifiée par rapport à apps/web/e2e/attendu.json (justifier = mettre à jour la référence et son historique, avec le motif)");

const failures = bilan.failures;
console.log(failures ? `${failures} vérification(s) en échec` : interruption || baisse ? "Scénario non conforme." : "Scénario conforme.");
process.exit(failures || interruption || baisse ? 1 : 0);
