#!/usr/bin/env node
/**
 * Extraction de l'outil Parcelle (« Parcelle — Atelier satellite », document
 * HTML embarqué en base64 dans `EMB.parcel` du prototype, chargé dans
 * l'iframe de l'étape 01) :
 *
 *   node apps/web/scripts/extract-parcelle.mjs <chemin-du-html>
 *
 * Produit `apps/web/public/parcelle/index.html` : le document tel quel
 * (Leaflet 1.9.4, proj4, JSZip, géométrie, import KML/KMZ, annotations,
 * voirie MapTiler, dossier, Design Parcel 2.0, export KML…) avec deux
 * adaptations, les mêmes que celles que le prototype lui appliquait :
 *
 * 1. `local-files.js` (persistance localStorage « parcours-ancienne-
 *    parcelles-v1 ») est remplacé par `parcelle-bridge.js` : l'outil
 *    parle nativement une API `/api/parcels` (voir `project-files.js`)
 *    — le pont la dirige vers `/projects/<id>/parcels` de Fadi, avec
 *    les identifiants de session ;
 * 2. le point d'intégration `fileManager.init().catch(()=>{});` expose
 *    `window.ParcoursParcel = {capture, load}` et prévient la page hôte
 *    (`postMessage`), comme `flow-v62` le faisait pour transmettre la
 *    parcelle au dossier et au modèle.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error("usage: extract-parcelle.mjs <Parcours_V8_19_Escalier_B_Mezzanine.html>");
  process.exit(2);
}
const html = readFileSync(htmlPath, "utf8");
const sha256 = createHash("sha256").update(html).digest("hex");
const EXPECTED_SHA = "e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9";
if (sha256 !== EXPECTED_SHA) {
  console.error(`Empreinte inattendue : ${sha256}`);
  process.exit(1);
}

// EMB={"parcel":"<base64>", ...} dans le bloc anonyme #3
const embAt = html.indexOf('EMB={"parcel":"');
if (embAt < 0) throw new Error("EMB.parcel introuvable");
const start = embAt + 'EMB={"parcel":"'.length;
const end = html.indexOf('"', start);
let doc = Buffer.from(html.slice(start, end), "base64").toString("utf8");
if (!doc.includes("<title>Parcelle — Atelier satellite</title>")) throw new Error("document Parcelle non reconnu");

// 1. local-files.js → pont vers l'API Fadi
const localFiles = /<script data-source="local-files\.js">[\s\S]*?<\/script>/;
if (!localFiles.test(doc)) throw new Error("local-files.js introuvable");
doc = doc.replace(localFiles, '<script src="./parcelle-bridge.js"></script>');

// 2. point d'intégration de app.js
const marker = "fileManager.init().catch(()=>{});";
if (doc.split(marker).length !== 2) throw new Error("point d'intégration absent ou multiple");
doc = doc.replace(
  marker,
  "window.ParcoursParcel={capture:captureFile,load:restoreFile,files:fileManager,ready:false};" +
    "fileManager.init().then(()=>{window.ParcoursParcel.ready=true;parent.postMessage({type:'parcelle:ready'},location.origin);})" +
    ".catch(e=>{document.getElementById('file-status').textContent='Parcelle : '+e.message;parent.postMessage({type:'parcelle:error',message:e.message},location.origin);});",
);

const outDir = join(here, "..", "public", "parcelle");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), doc);
writeFileSync(
  join(outDir, "README.md"),
  `# Outil Parcelle — extrait tel quel du prototype

Source : \`EMB.parcel\` de \`Parcours_V8_19_Escalier_B_Mezzanine.html\` (SHA-256 \`${sha256}\`),
document « Parcelle — Atelier satellite » (${doc.length} octets après adaptation). Généré par
\`apps/web/scripts/extract-parcelle.mjs\` — ne pas modifier \`index.html\` à la main.

Modules du document (attribut \`data-source\`) : vendor/leaflet.js, vendor/proj4.js, geometry.js,
satellite.js, vendor/jszip.min.js, google-earth.js, design-parcel.js, file-data.js, project-files.js,
map-format.js, parcel-annotations.js, earth-layer.js, vendor/roads-mvt.js, roads.js, roads-view.js,
road-width.js, frontage.js, dossier-panels.js, parcel-list.js, panel-folds.js, design-panel.js,
atelier-export.js, app.js — plus \`parcelle-bridge.js\` (Fadi) à la place de \`local-files.js\`.

Contrat serveur attendu par \`project-files.js\`, servi par \`apps/api/src/routes/parcels.ts\` :
\`GET /projects/:id/parcels\`, \`GET|PUT|DELETE /projects/:id/parcels/:parcelId\` (révision par fichier, 409 en cas d'écriture périmée).
`,
);
console.log(`parcelle/index.html ${doc.length} o`);
