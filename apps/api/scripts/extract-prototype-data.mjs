#!/usr/bin/env node
/**
 * Extraction traçable des données métier du prototype
 * `Parcours_V8_19_Escalier_B_Mezzanine.html` (voir docs/migration/reference.md
 * pour l'inventaire du fichier et son empreinte SHA-256).
 *
 *   node apps/api/scripts/extract-prototype-data.mjs <chemin-du-html>
 *
 * Chaque fichier produit sous apps/api/src/data porte `sourceVersion` et le
 * nom du bloc d'origine. Le script ne corrige, ne complète et n'invente
 * rien : il lit les littéraux du prototype et les réécrit en JSON. Les
 * fichiers déjà présents sont enrichis (clés ajoutées), jamais réordonnés,
 * pour garder les diffs lisibles.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "src", "data");
const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error("usage: extract-prototype-data.mjs <Parcours_V8_19_Escalier_B_Mezzanine.html>");
  process.exit(2);
}
const html = readFileSync(htmlPath, "utf8");
const sha256 = createHash("sha256").update(html).digest("hex");
const EXPECTED_SHA = "e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9";
if (sha256 !== EXPECTED_SHA) {
  console.error(`Empreinte inattendue : ${sha256}\nattendue : ${EXPECTED_SHA}\nLe fichier n'est pas la référence auditée dans docs/migration/reference.md.`);
  process.exit(1);
}
const SOURCE_VERSION = "8.19.0";

// --- utilitaires --------------------------------------------------------

function scriptById(id) {
  const marker = `id="${id}"`;
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`bloc <script id="${id}"> introuvable`);
  const gt = html.indexOf(">", at) + 1;
  return html.slice(gt, html.indexOf("</script>", gt));
}

function styleById(id) {
  const marker = `id="${id}"`;
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`bloc <style id="${id}"> introuvable`);
  const gt = html.indexOf(">", at) + 1;
  return html.slice(gt, html.indexOf("</style>", gt));
}

/** Le littéral objet/tableau qui commence au premier `{` ou `[` après `needle` (appariement des crochets, chaînes respectées). */
function literalAfter(text, needle, open = "{") {
  const close = open === "{" ? "}" : "]";
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`littéral introuvable : ${needle}`);
  let i = text.indexOf(open, at);
  let depth = 0;
  let inStr = false;
  let quote = null;
  let esc = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === open || ch === "{" || ch === "[") depth++;
    else if (ch === close || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(text.indexOf(open, at), i + 1);
    }
  }
  throw new Error(`littéral non fermé : ${needle}`);
}

/** Évalue un littéral JS (clés non citées, apostrophes) sans accès à quoi que ce soit. */
function evalLiteral(src) {
  return vm.runInNewContext(`(${src})`, Object.create(null), { timeout: 1000 });
}

function writeJson(relative, value, { pretty = true } = {}) {
  const path = join(DATA, relative);
  writeFileSync(path, pretty ? JSON.stringify(value, null, 2) + "\n" : JSON.stringify(value));
  console.log(`écrit ${relative}`);
}

function readJson(relative) {
  return JSON.parse(readFileSync(join(DATA, relative), "utf8"));
}

// --- 1. registre des 21 étapes (+ cibles de transmission) -----------------

const META = JSON.parse(scriptById("h7-stage-data"));
const stepsFile = readJson("parcours-steps.json");
for (const step of stepsFile.steps) {
  const m = META[String(step.number)];
  if (!m) throw new Error(`h7-stage-data sans étape ${step.number}`);
  // `next` dans h7-stage-data : les étapes qui reçoivent les intentions retenues ici.
  step.transmitsTo = m.next.slice();
}
writeJson("parcours-steps.json", stepsFile);

// --- 2. formulaires métier (BIZ_SCHEMAS / BIZ_INTRO) -----------------------

const host = html; // les littéraux vivent dans le bloc anonyme #3 ; une recherche globale suffit, les noms sont uniques
const schemas = JSON.parse(literalAfter(host, "const BIZ_SCHEMAS="));
const intro = JSON.parse(literalAfter(host, "BIZ_INTRO="));
const forms = {
  sourceVersion: SOURCE_VERSION,
  sourceBlock: "script anonyme #3 (app hôte) — BIZ_SCHEMAS, BIZ_INTRO, content()",
  note: "Chaque étape sans formulaire (01, 10, 11, 21) porte un seul champ « Synthèse / livrable » (clé summary), comme content() du prototype. L'étape 19 ajoute la décision GO / GO sous conditions / À reprendre / NO GO (clé decision).",
  summary: { intro: "Synthèse et transmission du dossier maître.", field: { key: "summary", label: "Synthèse / livrable", type: "textarea" } },
  decisionChoices: ["GO", "GO sous conditions", "À reprendre", "NO GO"],
  intro,
  schemas: Object.fromEntries(
    Object.entries(schemas).map(([n, rows]) => [n, rows.map(([label, key, type]) => ({ key, label, type }))]),
  ),
};
writeJson("parcours-forms.json", forms);

// --- 2b. bibliothèque des bâtiments (building-library-data) ------------------

const buildingLibrary = JSON.parse(scriptById("building-library-data"));
writeJson("building-library.json", buildingLibrary, { pretty: false });

// --- 3. répartition programmatique (PROGRAMME_TYPES / LABELS) ---------------

const programmeTypes = evalLiteral(literalAfter(host, "const PROGRAMME_TYPES="));
const programmeLabels = evalLiteral(literalAfter(host, "const PROGRAMME_LABELS="));
writeJson("programme-repartition.json", {
  sourceVersion: SOURCE_VERSION,
  sourceBlock: "script anonyme #3 (app hôte) — PROGRAMME_TYPES, PROGRAMME_LABELS, programmeStore(), programmeContent()",
  subtitle: "Pré-dimensionnement métier issu de Repartition.docx. Les valeurs sont des références de programmation, pas des minima réglementaires marocains certifiés.",
  defaults: { type: "tertiaire", baseArea: 673, mode: "cible" },
  modes: [
    { key: "min", label: "Basse" },
    { key: "cible", label: "Cible" },
    { key: "max", label: "Haute" },
  ],
  families: Object.entries(programmeLabels).map(([key, label]) => ({ key, label })),
  types: Object.fromEntries(Object.entries(programmeTypes).map(([k, v]) => [k, { label: v.label, ratios: v.ratios }])),
  adjacency: [
    ["Circulations ↔ Accueil", "Essentielle · liaison directe"],
    ["Circulations ↔ Sanitaires", "Essentielle · accès depuis circulation commune"],
    ["Accueil ↔ Sanitaires", "Souhaitable · proche, avec filtre visuel/acoustique"],
    ["Accueil ↔ Technique", "Éloignée / isolée pour les équipements nuisants"],
    ["Sanitaires ↔ Technique", "Technique · adossée ou superposée pour les réseaux"],
    ["Technique ↔ Circulations", "Importante · accès maintenance contrôlé"],
  ],
  statusNote: "Statut : référence métier / hypothèse projet. Les exigences PMR, incendie, sanitaires et dimensions doivent être contrôlées séparément dans le cadre réglementaire applicable au projet.",
  transfer: {
    title: "Programme transmis à l’Atelier Architectural",
    rules: "Règles actives : accès sanitaires depuis circulation commune · accueil proche des circulations · technique isolé des espaces de convivialité · réseaux humides regroupés verticalement.",
    control: "Contrôle de conception : ces règles sont des objectifs programmatiques ; elles ne remplacent pas la vérification réglementaire et BET.",
  },
});

// --- 4. Harmonie par étape : profils, états, règles ------------------------

const h7 = scriptById("h7-app");
const STATES = evalLiteral(literalAfter(h7, "const STATES="));
const PROFILES = evalLiteral(literalAfter(h7, "const PROFILES="));
const aliases = evalLiteral(literalAfter(h7, "const aliases="));
writeJson("harmonie-profiles.json", {
  sourceVersion: SOURCE_VERSION,
  sourceBlock: "script h7-app (Parcours V7 · Harmonie par étape) — STATES, PROFILES, profile(), buildProposals(), decide(), retained",
  states: STATES,
  retainedStates: ["retained", "adapted", "translated", "drawn", "verified"],
  aliases,
  defaultProfile: {
    label: "Type à préciser",
    site: "Comparer accueil extérieur, espace ouvert et desserte sans supposer un usage intérieur.",
    usage: "Définir les usages avant de distribuer des locaux.",
    decor: "Définir les fonctions avant de choisir les ambiances.",
  },
  mixedTrainingOffices: {
    requires: ["enseignement", "tertiaire"],
    label: "Formation & bureaux",
    site: "Étudier une arrivée groupée pour la formation, un accès quotidien lisible et une pause extérieure protégée de la desserte.",
    usage: "Séparer les périodes d’affluence de la formation et la concentration des bureaux ; mutualiser seulement les supports compatibles.",
  },
  profiles: PROFILES,
  whyRule: "id<=4 → profil.site ; id<12 → profil.usage ; id===21 → profil.decor ; sinon « Préserver les intentions retenues tout en explicitant les réserves et responsabilités. »",
  decideRules: [
    "adapted / dismissed : motif d'au moins 8 caractères",
    "translated / drawn / verified : responsable requis et preuve d'au moins 8 caractères",
    "drawn : étape >= 10 seulement (« L’état dessiné se renseigne dans l’Atelier ou dans l’Esquisse. »)",
    "verified : refusé si l'étape est à réexaminer (données courantes changées)",
    "retenir une proposition de parti écarte les autres propositions de parti retenues (« Variante remplacée par … »)",
    "toute intention retenue remet à faire les étapes cibles ; avant l'étape 19, elle rétrograde un GO / GO sous conditions en « À reprendre »",
  ],
});

// --- 4b. moteur Harmony V6 : référentiel des règles, types, phases, lectures, directions, Gua, sources ---
// Le script `harmony-engine-v6` s'exécute sans DOM (IIFE sur `globalThis`) :
// évalué dans un bac à sable pour en lire les tables telles quelles.
{
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(scriptById("harmony-engine-v6"), sandbox, { timeout: 2000 });
  const E = sandbox.HarmonyEngine;
  if (!E?.RULES?.length) throw new Error("harmony-engine-v6 : tables introuvables");
  writeJson("harmony-engine.json", {
    sourceVersion: SOURCE_VERSION,
    sourceBlock: "script harmony-engine-v6 (HarmonyEngine) — VERSION, RULE_VERSION, TYPES, PHASES, READINGS, RULES, DIRS, GUA, SOURCES, FLIGHT",
    version: E.VERSION,
    ruleVersion: E.RULE_VERSION,
    types: E.TYPES,
    phases: E.PHASES,
    readings: E.READINGS,
    rules: E.RULES,
    dirs: E.DIRS,
    gua: E.GUA,
    sources: E.SOURCES,
    flight: E.FLIGHT,
  });
}

// --- 5. exemple complet : réponses des formulaires + cas de programme -------

const resolved = JSON.parse(scriptById("p118-resolved-data"));
const template = JSON.parse(scriptById("p118-resolved-template"));
const exemple = readJson("examples/p118-exemple-complet.json");
exemple.business = resolved.business;
// Données du site de l'exemple (étape 01) : `Object.assign(dat.site, {...})`
// de p118-resolved-app — `D` y est l'objet de données de l'exemple.
const resolvedApp = scriptById("p118-resolved-app");
const siteLiteral = literalAfter(resolvedApp, "Object.assign(dat.site,");
exemple.siteObservations = vm.runInNewContext(`(${siteLiteral})`, { D: { assumptions: exemple.assumptions, date: exemple.date } }, { timeout: 1000 });
writeJson("examples/p118-exemple-complet.json", exemple);

writeJson(
  "examples/p118-programme-case.json",
  {
    sourceVersion: SOURCE_VERSION,
    sourceBlock: "script p118-resolved-data — programme (Parcours.ProgrammeCase) et roomResponses ; p118-resolved-template — project.data.harmony.config",
    exampleId: exemple.id,
    // Type et composantes déclarés par l'exemple lui-même (profil Harmonie « Formation & bureaux »).
    harmonyConfig: template.project.data.harmony.config,
    programme: resolved.programme,
    roomResponses: resolved.roomResponses,
  },
  { pretty: false },
);

// --- 6. parcelle P.118 : bornes Lambert + WGS84 fournies par la source ------

const nativeParcel = template.native.domains.nativeParcel;
// Les coordonnées WGS84 viennent du CSV joint dans 118_officiel.kmz (SEED888_FILES.kmz) — pas d'une conversion faite ici.
const kmzB64 = literalAfter(host, "const SEED888_FILES=").match(/kmz:'([A-Za-z0-9+/=]+)'/)[1];
const kmz = Buffer.from(kmzB64, "base64");
const csv = extractZipEntry(kmz, "donnees/Bornes_Lambert_S01.csv");
const notice = extractZipEntry(kmz, "donnees/Notice.txt");
const bornes = csv
  .replace(/^﻿/, "")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [id, x, y, lon, lat] = line.split(";");
    return { id, lambert: { frame: "cadastral", crs: "EPSG:26191", x: Number(x), y: Number(y) }, wgs84: { frame: "geographic", lat: Number(lat), lon: Number(lon) } };
  });
writeJson("examples/p118-parcel.json", {
  sourceVersion: SOURCE_VERSION,
  sourceBlock: "p118-resolved-template → native.domains.nativeParcel ; SEED888_FILES.kmz → donnees/Bornes_Lambert_S01.csv et Notice.txt",
  exampleId: exemple.id,
  parcelNumber: nativeParcel.parcelNumber,
  commune: nativeParcel.commune,
  crs: nativeParcel.crs,
  crsHypothesis: "Merchich / Nord Maroc (EPSG:26191), hypothèse cohérente avec Parcelle ; la feuille source indique LAMBERT sans numéro EPSG. Transformation Merchich vers WGS84 (1), translations +31 / +146 / +47 m, précision annoncée de 7 m dans la base EPSG (Notice.txt du KMZ).",
  units: nativeParcel.units,
  vertexOrder: nativeParcel.vertexIds,
  vertices: nativeParcel.vertices.map((v, i) => ({ id: nativeParcel.vertexIds[i], frame: "cadastral", crs: "EPSG:26191", x: v[0], y: v[1] })),
  bornesWgs84FromSource: bornes,
  areaLambert: nativeParcel.area,
  officialArea: nativeParcel.officialArea,
  correctedAreaPrinted: nativeParcel.correctedAreaPrinted,
  perimeter: nativeParcel.perimeter,
  sideLengths: nativeParcel.sideLengths,
  centroid: { frame: "cadastral", crs: "EPSG:26191", x: nativeParcel.centroid[0], y: nativeParcel.centroid[1] },
  notice,
});

// --- 6a. documents de base intégrés (SEED888_FILES) : les deux fichiers de l'exemple, octets conservés -----
// Le prototype les proposait au téléchargement sur la vue d'ensemble du projet d'exemple
// (« Documents de base intégrés » : 118_officiel.kmz, ZONE-I-5.pdf). Fadi les rattache aux
// sources des étapes 01 (parcelle) et 02 (réglementation) à l'import de l'exemple.
const seedFiles = literalAfter(host, "const SEED888_FILES=");
const pdfB64 = seedFiles.match(/pdf:'([A-Za-z0-9+/=]+)'/)[1];
const pdf = Buffer.from(pdfB64, "base64");
mkdirSync(join(DATA, "examples/files"), { recursive: true });
writeFileSync(join(DATA, "examples/files/118_officiel.kmz"), kmz);
writeFileSync(join(DATA, "examples/files/ZONE-I-5.pdf"), pdf);
writeJson("examples/p118-base-documents.json", {
  sourceVersion: SOURCE_VERSION,
  sourceBlock: "SEED888_FILES (dlSeed888) — « Documents de base intégrés » de la vue d'ensemble du projet d'exemple",
  exampleId: exemple.id,
  caption: "Scénario étudié : P.118 — pôle tertiaire, services aux entreprises & formation.",
  files: [
    { file: "118_officiel.kmz", name: "118_officiel.kmz", type: "application/vnd.google-earth.kmz", size: kmz.length, sha256: createHash("sha256").update(kmz).digest("hex"), stepNumber: 1, note: "Parcelle : doc.kml, bornes Lambert et WGS84 (CSV), tracés intérieurs, notice, document cadastral original (PDF), pages PNG" },
    { file: "ZONE-I-5.pdf", name: "ZONE-I-5.pdf", type: "application/pdf", size: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex"), stepNumber: 2, note: "Règlement de la zone I — secteur I5 (source des réponses de l'étape 02)" },
  ],
});

// --- 6b. modèle natif verbatim pour l'Atelier (format design.v13) --------------

// Le moteur de l'Atelier natif lit et écrit ces domaines tels quels
// (`design.v13.project.<id>.<domaine>`). On les conserve byte-à-byte : c'est
// le format de travail du moteur, pas une projection.
writeJson(
  "examples/p118-native-model.json",
  {
    sourceVersion: SOURCE_VERSION,
    sourceBlock: "script p118-resolved-template → native (registry + domains nativeParcel, levels, buildingFootprint, floorDesign, ui)",
    exampleId: exemple.id,
    nativeId: template.native.id,
    registry: template.native.registry,
    domains: template.native.domains,
  },
  { pretty: false },
);

// --- 6c. dossier Harmony de l'exemple (Parcours.Harmony V6 : observations, repères directionnels, locaux, ambiances, revue) et données V6.2 (géoréférencement, hypothèses H-*) ---
const dossierV62 = JSON.parse(scriptById("p118-dossier-v62"));
writeJson(
  "examples/p118-harmony-dossier.json",
  {
    sourceVersion: SOURCE_VERSION,
    sourceBlock: "script p118-resolved-template → project.data.harmony (Parcours.Harmony, schéma 1) ; script p118-dossier-v62 → georeference, assumptions, stages",
    exampleId: exemple.id,
    harmony: template.project.data.harmony,
    georeference: dossierV62.georeference,
    assumptions: dossierV62.assumptions,
    stages: dossierV62.stages,
  },
  { pretty: false },
);

// --- 6d. dossier d'étude de l'exemple : structure (exigences enregistrées, non calculées), circulations mesurées, sources web consultées ---
// `project.data.structure`, `.circulation`, `.webSources` du template résolu : données déclarées de l'exemple,
// lues par le module Analyses métier (hypothèses et exigences distinguées, jamais recalculées) et par Projets et sources.
writeJson(
  "examples/p118-study-dossier.json",
  {
    sourceVersion: SOURCE_VERSION,
    sourceBlock: "script p118-resolved-template → project.data.structure, project.data.circulation, project.data.webSources",
    exampleId: exemple.id,
    structure: template.project.data.structure ?? null,
    circulation: template.project.data.circulation ?? null,
    webSources: template.project.data.webSources ?? [],
  },
  { pretty: false },
);

// --- 7. feuille de style du panneau Harmonie (rapports HTML) ---------------
// `reportHTML` du prototype embarque le contenu de <style id="h7-css"> dans
// chaque rapport téléchargé : conservé tel quel, en-tête de traçabilité en plus.
writeFileSync(
  join(DATA, "harmonie-report.css"),
  `/* Parcours ${SOURCE_VERSION} — <style id="h7-css"> (Harmonie par étape), extrait tel quel pour les rapports Harmonie_Etape_NN_V7.html / Harmonie_Choix_Parcours_V7.html. */\n` + styleById("h7-css").trim() + "\n",
);
console.log("écrit harmonie-report.css");
// `reportHTML` de flow-v62 embarque <style id="flow-v62-css"> (bilan du bâtiment conçu) ; conservé tel quel.
writeFileSync(
  join(DATA, "design-report.css"),
  `/* Parcours ${SOURCE_VERSION} — <style id="flow-v62-css"> (bilan du bâtiment conçu), extrait tel quel pour Bilan_Harmonie_Batiment_V7.html et le bilan en ligne. */\n` + styleById("flow-v62-css").trim() + "\n",
);
console.log("écrit design-report.css");

console.log("extraction terminée — SHA-256 de la source :", sha256);

// --- lecture minimale d'un ZIP (entrées deflate / stored) ------------------
function extractZipEntry(buf, name) {
  // Table centrale : signature 0x02014b50
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let p = cdOffset;
  while (p < eocd) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
      throw new Error(`méthode de compression non gérée : ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entrée absente du KMZ : ${name}`);
}
import { inflateRawSync } from "node:zlib";
