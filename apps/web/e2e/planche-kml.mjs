/**
 * Recette « KML / KMZ » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 7b : D10-R-003) :
 * - Ctrl+Maj+Espace puis W ouvre « KML / KMZ » ; un KML est lu (un polygone troué, une ligne, un point ; superposition
 *   d'image et altitudes signalées non lues) ; sans point de base, Importer est grisé avec son motif ;
 * - point de base en EPSG:2154 (défini dans Fadi) : Maj+W projette par l'API et pose à plat en un pas (un groupe pour
 *   le polygone, guides pour la ligne, point de guide pour le point, chacun étiqueté) ; le fichier est archivé ;
 *   Annuler retire tout ;
 * - point de base en EPSG:2056 sans définition connue : refus nommé ; un .prj d'un autre système est refusé ; le .prj
 *   LV95 (sans code d'autorité) est accepté par Y, puis un KMZ près de Zurich est posé par Maj+W ; .prj archivé ;
 * - chaque commande : icône et raccourci ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-kml node apps/web/e2e/planche-kml.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-kml";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

// Origine de Lambert 93 (3° E, 46,5° N) = point de base (700 000 ; 6 600 000) : le dessin est autour de 0.
const anneau = (lon, lat, d) => `${lon - d},${lat - d},0 ${lon + d},${lat - d},0 ${lon + d},${lat + d},0 ${lon - d},${lat + d},0 ${lon - d},${lat - d},0`;
const kml = (lon, lat) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Relevé de recette</name>
<GroundOverlay><name>Photo</name><Icon><href>photo.jpg</href></Icon></GroundOverlay>
<Folder><name>Parcelles</name>
<Placemark><name>Parcelle 12</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${anneau(lon, lat, 0.0004)}</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>${anneau(lon, lat, 0.0001)}</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
</Folder>
<Placemark><name>Clôture</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>${lon - 0.0006},${lat},410 ${lon},${lat + 0.0006},410 ${lon + 0.0006},${lat},410</coordinates></LineString></Placemark>
<Placemark><name>Arbre</name><Point><coordinates>${lon + 0.0008},${lat + 0.0008},0</coordinates></Point></Placemark>
</Document></kml>`;
writeFileSync(`${OUT}/releve.kml`, kml(3, 46.5));

// KMZ : archive ZIP « stockée » (sans compression) contenant doc.kml, près de Zurich.
const crc = (b) => {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
};
const zipStocke = (nom, donnees) => {
  const n = Buffer.from(nom, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc(donnees), 14);
  local.writeUInt32LE(donnees.length, 18);
  local.writeUInt32LE(donnees.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc(donnees), 16);
  central.writeUInt32LE(donnees.length, 20);
  central.writeUInt32LE(donnees.length, 24);
  central.writeUInt16LE(n.length, 28);
  const debutCentral = local.length + n.length + donnees.length;
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 8);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(central.length + n.length, 12);
  fin.writeUInt32LE(debutCentral, 16);
  return Buffer.concat([local, n, donnees, central, n, fin]);
};
writeFileSync(`${OUT}/zurich.kmz`, zipStocke("doc.kml", Buffer.from(kml(8.5417, 47.3769), "utf8")));
// .prj : LV95 au format ESRI (sans code d'autorité) et Lambert 93 avec son code (autre système que le point de base).
writeFileSync(`${OUT}/lv95.prj`, 'PROJCS["CH1903+_LV95",GEOGCS["GCS_CH1903+",DATUM["D_CH1903+",SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Hotine_Oblique_Mercator_Azimuth_Center"],PARAMETER["False_Easting",2600000.0],PARAMETER["False_Northing",1200000.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Azimuth",90.0],PARAMETER["Longitude_Of_Center",7.439583333333333],PARAMETER["Latitude_Of_Center",46.95240555555556],UNIT["Meter",1.0]]');
writeFileSync(`${OUT}/lambert93.prj`, 'PROJCS["RGF93 / Lambert-93",GEOGCS["RGF93",DATUM["Reseau_Geodesique_Francais_1993",SPHEROID["GRS 1980",6378137,298.257222101]],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",49],PARAMETER["standard_parallel_2",44],PARAMETER["latitude_of_origin",46.5],PARAMETER["central_meridian",3],PARAMETER["false_easting",700000],PARAMETER["false_northing",6600000],UNIT["metre",1],AUTHORITY["EPSG","2154"]]');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `kml-${Date.now()}@example.com`, "planche-kml-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(touche);
  await page.waitForTimeout(80);
};
const archives = [];
page.on("request", (r) => {
  if (r.method() === "POST" && r.url().endsWith("/sandbox/references")) archives.push(r.headers()["x-fadi-format"]);
});

// Extension « Emplacement » activée (désactivée par défaut) pour déclarer le point de base, comme planche-point-de-base.mjs.
await page.locator("[data-planche-menu-ouvrir]").click();
await page.locator('[data-planche-menu-item="extensions"]').click();
await page.locator('[data-planche-extensions] [data-planche-extension-interrupteur="emplacement"]').click();
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
const declarerPointDeBase = async (e, n, systeme) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+B");
  const section = page.locator("[data-planche-point-de-base]");
  await section.waitFor();
  const champ = (c) => section.locator(`[data-planche-point-de-base-champ='${c}']`);
  const avant = await pas();
  await champ("e").fill(e);
  await champ("n").fill(n);
  await champ("systeme").fill(systeme);
  await champ("rotation").fill("0");
  await champ("rotation").press("Enter");
  await page.waitForFunction((k) => window.fadiPlanche.pas() === k + 1, avant);
};

// --- Lecture, sans point de base ---------------------------------------------------------------------------------------------
await deuxTemps("w");
const pan = page.locator("[data-planche-kml]");
await pan.waitFor();
check("Ctrl+Maj+Espace puis W ouvre « KML / KMZ », hors de la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "import-kml" && (await page.locator("[data-planche-panneau-icone='import-kml']").count()) === 0);
await page.locator("[data-planche-import-kml-entree]").setInputFiles(`${OUT}/releve.kml`);
await page.waitForFunction(() => document.querySelector("[data-planche-kml]")?.getAttribute("data-planche-kml") === "3");
const lu = (await pan.locator("[data-planche-kml-lu]").textContent()) ?? "";
check("KML lu : 1 polygone, 1 ligne, 1 point", lu.includes("releve.kml") && lu.includes("1 polygone") && lu.includes("1 ligne") && lu.includes("1 point"), lu);
const omis = (await pan.locator("[data-planche-kml-omis]").textContent()) ?? "";
check("superposition d'image et altitudes signalées non lues", omis.includes("images superposées") && omis.includes("altitudes"), omis);
check("sans point de base : Importer grisé avec son motif", (await pan.locator("[data-planche-commande='importer-kml']").isDisabled()) && ((await pan.locator("[data-planche-commande='importer-kml']").getAttribute("title")) ?? "").includes("Déclarez d'abord le point de base"));

// --- Point de base en Lambert 93 : import en un pas ------------------------------------------------------------------------
await declarerPointDeBase("700 000", "6 600 000", "EPSG:2154");
await deuxTemps("w");
await pan.waitFor();
check("le panneau affiche le système du point de base", ((await pan.locator("[data-planche-kml-systeme]").textContent()) ?? "") === "EPSG:2154");
await page.screenshot({ path: `${OUT}/01-lu.png` });
const pas0 = await pas();
await deuxTemps("Shift+W");
await page.waitForFunction(() => !!document.querySelector("[data-planche-kml-note], [data-planche-kml-erreur]"));
check("Maj+W : aucune erreur", (await pan.locator("[data-planche-kml-erreur]").count()) === 0, (await pan.locator("[data-planche-kml-erreur]").textContent().catch(() => "")) ?? "");
let m = await modele();
check("Maj+W : un seul pas d'historique", (await pas()) === pas0 + 1);
const occs = Object.values(m.racine.occurrences);
check("le polygone devient un groupe nommé d'après son dossier", occs.length === 1 && Object.values(m.definitions).some((d) => d.nom === "Parcelles / Parcelle 12"), JSON.stringify(Object.values(m.definitions).map((d) => d.nom)));
const guides = Object.values(m.annotations?.guides ?? {});
check("ligne en 2 guides segments, point en guide point", guides.filter((g) => g.genre === "segment").length === 2 && guides.filter((g) => g.genre === "point").length === 1, JSON.stringify(guides.map((g) => g.genre)));
const textes = Object.values(m.annotations?.textes ?? {}).map((x) => x.texte).sort();
check("ligne et point étiquetés de leur nom", textes.join("|") === "Arbre|Clôture", textes.join("|"));
const arbre = guides.find((g) => g.genre === "point");
// 0,0008° à 46,5° N : environ 61 m vers l'est et 89 m vers le nord ; posé à plat.
check("projection autour de l'origine, posé à plat (z = 0)", !!arbre && arbre.origine.x > 55 && arbre.origine.x < 67 && arbre.origine.y > 82 && arbre.origine.y < 96 && arbre.origine.z === 0 && guides.every((g) => g.origine.z === 0), JSON.stringify(arbre?.origine));
check("note : source « définition connue de Fadi »", ((await pan.locator("[data-planche-kml-note]").textContent()) ?? "").includes("définition connue de Fadi"));
check("le fichier reçu est archivé en base (KML)", archives.includes("kml"), archives.join(","));
await page.screenshot({ path: `${OUT}/02-importe.png` });
await vue.focus();
await page.keyboard.press("Control+z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 0);
m = await modele();
check("Annuler retire le groupe, les guides et les textes", Object.keys(m.annotations?.guides ?? {}).length === 0 && Object.keys(m.annotations?.textes ?? {}).length === 0);

// --- Point de base en LV95 : système inconnu, .prj ---------------------------------------------------------------------------
await declarerPointDeBase("2 683 000", "1 247 000", "EPSG:2056");
await deuxTemps("w");
await pan.waitFor();
await page.locator("[data-planche-import-kml-entree]").setInputFiles(`${OUT}/zurich.kmz`);
await page.waitForFunction(() => (document.querySelector("[data-planche-kml-lu]")?.textContent ?? "").includes("zurich.kmz"));
check("KMZ lu (doc.kml de l'archive)", ((await pan.locator("[data-planche-kml-lu]").textContent()) ?? "").includes("1 polygone"));
const pas1 = await pas();
await deuxTemps("Shift+W");
await pan.locator("[data-planche-kml-erreur]").waitFor();
check("EPSG:2056 sans définition : refus nommé, rien posé", ((await pan.locator("[data-planche-kml-erreur]").textContent()) ?? "").includes("fournissez son .prj") && (await pas()) === pas1);
await deuxTemps("y");
await page.locator("[data-planche-import-kml-prj-entree]").setInputFiles(`${OUT}/lambert93.prj`);
await page.waitForFunction(() => (document.querySelector("[data-planche-kml-erreur]")?.textContent ?? "").includes("EPSG:2154"));
check("un .prj d'un autre système est refusé", ((await pan.locator("[data-planche-kml-definition]").textContent()) ?? "").includes("connue de Fadi"));
await page.locator("[data-planche-import-kml-prj-entree]").setInputFiles(`${OUT}/lv95.prj`);
await page.waitForFunction(() => (document.querySelector("[data-planche-kml-definition]")?.textContent ?? "").includes("lv95.prj"));
check("le .prj LV95 est accepté (nom lu)", ((await pan.locator("[data-planche-kml-note]").textContent()) ?? "").includes("CH1903+_LV95") && (await pan.locator("[data-planche-kml-erreur]").count()) === 0);
await deuxTemps("Shift+W");
await page.waitForFunction(() => (document.querySelector("[data-planche-kml-note]")?.textContent ?? "").includes("définition du .prj"));
m = await modele();
const pointZ = Object.values(m.annotations?.guides ?? {}).find((g) => g.genre === "point");
// Zurich (8,5417 ; 47,3769) ≈ (2 683 303 ; 1 247 925) en LV95 ; l'arbre est 0,0008° plus loin, soit environ 60 m et 89 m.
check("KMZ posé par le .prj LV95, autour de 300 m et 1 000 m du point de base", (await pas()) === pas1 + 1 && !!pointZ && pointZ.origine.x > 330 && pointZ.origine.x < 400 && pointZ.origine.y > 970 && pointZ.origine.y < 1050, JSON.stringify(pointZ?.origine));
check("le KMZ et le .prj sont archivés en base", archives.includes("kmz") && archives.includes("prj"), archives.join(","));
await page.screenshot({ path: `${OUT}/03-prj.png` });

// --- Règle d'or ----------------------------------------------------------------------------------------------------------------
let regle = true;
for (const [id, r] of [["importer-kml", "Maj+W"], ["definition-systeme", "Y"]]) regle &&= ((await pan.locator(`[data-planche-commande='${id}']`).getAttribute("title")) ?? "").includes(`Ctrl+Maj+Espace, ${r}`) && (await pan.locator(`[data-planche-commande='${id}'] svg`).count()) === 1;
check("chaque commande du panneau : icône et raccourci", regle);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette KML / KMZ : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette KML / KMZ : tous les contrôles passent.");
