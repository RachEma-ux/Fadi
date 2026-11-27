/**
 * Recette « Formats des fabricants » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 7a : D10-F14-038,
 * D10-F14-036, D10-F23a-012 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7a-fabricants.png`) :
 * - Ctrl+Maj+Espace puis N ouvre « Formats des fabricants » ; un glTF est lu (objets, triangles, matière, maillage
 *   répété, unité et axe Y lus) ; Maj+N importe en un pas, hors du fil principal : le maillage posé deux fois devient un
 *   composant (deux occurrences), la matière lue est ajoutée et posée ; le fichier est archivé en base ; Annuler retire
 *   tout ;
 * - un FBX est refusé avec son motif ;
 * - Ctrl+Maj+Espace puis U ouvre le même panneau pour un relevé au capteur : un PLY sans unité ni axe (à déclarer) est
 *   posé par Maj+U en référence verrouillée, axe Y gardé sur la fiche ;
 * - chaque commande : icône et raccourci ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-fabricants node apps/web/e2e/planche-fabricants.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-fabricants";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

// glTF reçu : un tabouret (boîte 0,4 × 0,45 × 0,4 m) posé deux fois (la seconde tournée de 90° autour de Y), matière
// « Chêne » ; tampon intégré en base64.
const P = [0, 0, 0, 0.4, 0, 0, 0.4, 0.45, 0, 0, 0.45, 0, 0, 0, 0.4, 0.4, 0, 0.4, 0.4, 0.45, 0.4, 0, 0.45, 0.4];
const T = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const tampon = Buffer.alloc(P.length * 4 + T.length * 2);
P.forEach((x, i) => tampon.writeFloatLE(x, i * 4));
T.forEach((x, i) => tampon.writeUInt16LE(x, P.length * 4 + i * 2));
const gltf = {
  asset: { version: "2.0", generator: "Recette Fadi" },
  buffers: [{ byteLength: tampon.length, uri: `data:application/octet-stream;base64,${tampon.toString("base64")}` }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: P.length * 4 },
    { buffer: 0, byteOffset: P.length * 4, byteLength: T.length * 2 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [0, 0, 0], max: [0.4, 0.45, 0.4] },
    { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
  ],
  materials: [{ name: "Chêne", pbrMetallicRoughness: { baseColorFactor: [0.5, 0.25, 0.1, 1] } }],
  meshes: [{ name: "Tabouret", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  nodes: [
    { name: "Tabouret A", mesh: 0 },
    { name: "Tabouret B", mesh: 0, translation: [2, 0, 0], rotation: [0, 0.7071068, 0, 0.7071068] },
  ],
  scenes: [{ nodes: [0, 1] }],
  scene: 0,
};
writeFileSync(`${OUT}/tabourets.gltf`, JSON.stringify(gltf));
writeFileSync(`${OUT}/meuble.fbx`, Buffer.concat([Buffer.from("Kaydara FBX Binary  \0", "latin1"), Buffer.alloc(16)]));
// Relevé de pièce (PLY texte, Y vertical, en mètres) : sol 4 × 3 m et un mur de 2,5 m.
writeFileSync(`${OUT}/piece.ply`, `ply\nformat ascii 1.0\ncomment Releve de recette\nelement vertex 8\nproperty float x\nproperty float y\nproperty float z\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n4 0 0\n4 0 -3\n0 0 -3\n0 0 0\n4 0 0\n4 2.5 0\n0 2.5 0\n4 0 1 2 3\n4 4 5 6 7\n`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `fabricants-${Date.now()}@example.com`, "planche-fab-ci-123", BASE);
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

// --- glTF en objets du dessin ----------------------------------------------------------------------------------------------
await deuxTemps("n");
const pan = page.locator("[data-planche-fabricant]");
await pan.waitFor();
check("Ctrl+Maj+Espace puis N ouvre « Formats des fabricants », hors de la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "import-fabricant" && (await page.locator("[data-planche-panneau-icone='import-fabricant']").count()) === 0);
check("sans fichier : Importer grisé avec son motif", (await pan.locator("[data-planche-commande='importer-fabricant']").isDisabled()) && ((await pan.locator("[data-planche-commande='importer-fabricant']").getAttribute("title")) ?? "").includes("Choisissez d'abord un fichier glTF"));
await page.locator("[data-planche-import-fabricant-entree]").setInputFiles(`${OUT}/meuble.fbx`);
await pan.locator("[data-planche-fabricant-erreur]").waitFor();
check("FBX refusé avec son motif (bibliothèque nécessaire)", ((await pan.locator("[data-planche-fabricant-erreur]").textContent()) ?? "").includes("FBX est un format propriétaire"));
await page.locator("[data-planche-import-fabricant-entree]").setInputFiles(`${OUT}/tabourets.gltf`);
await page.waitForFunction(() => document.querySelector("[data-planche-fabricant]")?.getAttribute("data-planche-fabricant") === "2");
const lu = (await pan.locator("[data-planche-fabricant-lu]").textContent()) ?? "";
check("fichier lu : 2 objets, 24 triangles", lu.includes("tabourets.gltf") && lu.includes("GLTF") && lu.includes("2 objet") && lu.includes("24 triangles"), lu);
check("unité (mètre) et axe Y lus dans le fichier", (await pan.locator("[data-planche-fabricant-unite]").inputValue()) === "1" && (await pan.locator("[data-planche-fabricant-axe='y']").isChecked()));
check("1 matière lue, 1 maillage répété", ((await pan.locator("[data-planche-fabricant-matieres]").textContent()) ?? "") === "1" && ((await pan.locator("[data-planche-fabricant-repetes]").textContent()) ?? "") === "1");
const dims = ((await pan.locator("[data-planche-fabricant-dimensions]").textContent()) ?? "").replace(/[  ]/g, " ");
check("dimensions après axe Y : hauteur 0,45 m en Z", dims.endsWith("× 0,45 m"), dims);
await page.screenshot({ path: `${OUT}/01-lu.png` });
const pas0 = await pas();
await deuxTemps("Shift+N");
await pan.locator("[data-planche-fabricant-note]").waitFor();
let m = await modele();
const occs = Object.values(m.racine.occurrences);
const defs = Object.values(m.definitions);
check("Maj+N : un seul pas d'historique", (await pas()) === pas0 + 1);
check("maillage répété : un composant, deux occurrences", defs.length === 1 && defs[0].genre === "composant" && occs.length === 2 && occs.every((o) => o.definition === defs[0].id), JSON.stringify(defs.map((d) => d.genre)));
const mats = Object.values(m.annotations?.materiaux ?? {});
check("matière « Chêne » ajoutée et posée sur les deux objets", mats.length === 1 && mats[0].nom === "Chêne" && occs.every((o) => o.materiau === mats[0].id), JSON.stringify(mats));
const tourne = occs.find((o) => Math.abs(o.transformation[3] - 2) < 1e-6);
check("seconde pose tournée de 90° autour de la verticale, à 2 m", !!tourne && Math.abs(Math.abs(tourne.transformation[1]) - 1) < 1e-6, JSON.stringify(tourne?.transformation));
check("le fichier reçu est archivé en base (glTF)", archives.includes("gltf"), archives.join(","));
await page.screenshot({ path: `${OUT}/02-importe.png` });
await page.keyboard.press("Control+z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 0);
check("Annuler retire les objets et la matière", Object.keys((await modele()).annotations?.materiaux ?? {}).length === 0);

// --- Relevé au capteur en référence --------------------------------------------------------------------------------------
await deuxTemps("u");
await pan.waitFor();
await page.locator("[data-planche-import-fabricant-entree]").setInputFiles(`${OUT}/piece.ply`);
await page.waitForFunction(() => document.querySelector("[data-planche-fabricant]")?.getAttribute("data-planche-fabricant") === "1");
check("PLY : unité et axe à déclarer (non portés par le fichier)", ((await pan.textContent()) ?? "").includes("Non portée par le fichier") && ((await pan.textContent()) ?? "").includes("Non porté par le fichier"));
await pan.locator("[data-planche-fabricant-axe='y']").check();
const dims2 = ((await pan.locator("[data-planche-fabricant-dimensions]").textContent()) ?? "").replace(/[  ]/g, " ");
check("axe Y déclaré : 4 × 3 × 2,5 m", dims2 === "4 × 3 × 2,5 m", dims2);
await deuxTemps("Shift+U");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.references ?? {}).length === 1);
m = await modele();
const ref = Object.values(m.annotations.references)[0];
check("Maj+U : relevé posé en référence verrouillée (PLY, axe Y, 2 faces)", ref.format === "ply" && ref.axe === "y" && ref.verrouille === true && ref.triangles === 4 && Object.keys(m.racine.occurrences).length === 0, JSON.stringify(ref));
check("le relevé est archivé en base (PLY)", archives.includes("ply"), archives.join(","));
await page.screenshot({ path: `${OUT}/03-releve.png` });

// --- Règle d'or ----------------------------------------------------------------------------------------------------------------
let regle = true;
for (const [id, r] of [["importer-fabricant", "Maj+N"], ["poser-releve", "Maj+U"]]) regle &&= ((await pan.locator(`[data-planche-commande='${id}']`).getAttribute("title")) ?? "").includes(`Ctrl+Maj+Espace, ${r}`) && (await pan.locator(`[data-planche-commande='${id}'] svg`).count()) === 1;
check("chaque commande du panneau : icône et raccourci", regle);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette des formats des fabricants : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette des formats des fabricants : tous les contrôles passent.");
