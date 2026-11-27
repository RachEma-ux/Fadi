/**
 * Recette de l'import hors du fil principal (cas 4, étape 7a : D10-F14-027 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7a) :
 * - premier import : le débit de l'appareil est mesuré (étalonnage), la borne en découle et est gardée ;
 * - un terrain OBJ de 45 000 triangles (trente fois l'ancien plafond de 1 500) : progression affichée, la page continue de
 *   peindre pendant l'insertion, un groupe posé en une opération (Annuler le retire) ;
 * - Échap pendant l'import : annulé, dessin inchangé ; au-delà de la borne : refusé, rien d'inséré ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-import node apps/web/e2e/planche-import.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-import";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

/** Terrain gaufré n × n en OBJ (deux triangles par case, aucune paire coplanaire). */
function terrainObj(n) {
  const l = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) l.push(`v ${i * 0.5} ${j * 0.5} ${(((i * 7 + j * 13) % 5) * 0.1 + i * j * 1e-3).toFixed(4)}`);
  const k = (i, j) => j * (n + 1) + i + 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) l.push(`f ${k(i, j)} ${k(i + 1, j)} ${k(i + 1, j + 1)}`, `f ${k(i, j)} ${k(i + 1, j + 1)} ${k(i, j + 1)}`);
  return Buffer.from(l.join("\n"));
}
const CUBE = Buffer.from("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `import-${Date.now()}@example.com`, "planche-import-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.evaluate(() => localStorage.removeItem("fadi.sandbox.planche.import.debit"));

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const nbObjets = async () => Object.keys((await modele()).racine.occurrences).length;
const message = () => page.locator(".planche-message, [data-planche-message]").first().textContent().catch(() => "");
const dialogue = page.locator("[data-planche-import-cours]");
async function importer(nom, octets) {
  await page.locator("[data-planche-menu-ouvrir]").click();
  if (!(await page.locator("[data-planche-importer='obj']").isVisible().catch(() => false))) await page.locator("[data-planche-menu-item='importer']").click();
  const choix = page.waitForEvent("filechooser");
  await page.locator("[data-planche-importer='obj']").click();
  await (await choix).setFiles({ name: nom, mimeType: "text/plain", buffer: octets });
}
const attendreFin = () => page.waitForFunction(() => !document.querySelector("[data-planche-import-cours]"), null, { timeout: 120000 });

// --- 1. Premier import : étalonnage, borne gardée ------------------------------------------------------------------
await importer("cube.obj", CUBE);
await page.waitForFunction(() => window.fadiPlanche.pas() > 0 || /Import/.test(document.body.textContent ?? ""), null, { timeout: 60000 });
await attendreFin();
await page.waitForTimeout(300);
console.log("  message : " + ((await message()) ?? ""));
const debit = await page.evaluate(() => JSON.parse(localStorage.getItem("fadi.sandbox.planche.import.debit") ?? "null"));
check("premier import : débit de l'appareil mesuré et gardé", debit && debit.trianglesParSeconde > 0 && typeof debit.mesure === "string", JSON.stringify(debit));
const m1 = await modele();
const def1 = Object.values(m1.definitions)[0];
check("cube OBJ : un groupe de 6 faces", (await nbObjets()) === 1 && def1 && Object.keys(def1.contenu.faces).length === 6);
const borne = Math.max(1000, Math.floor((debit.trianglesParSeconde * 20) / 1000) * 1000);
console.log(`  borne de cet appareil : ${borne} triangles (${debit.trianglesParSeconde} triangles/s)`);

// --- 2. Terrain de 45 000 triangles : progression, page vivante, une opération ----------------------------------------
const GROS = 150; // 45 000 triangles
const avant = await page.evaluate(() => window.fadiPlanche.pas());
// Images peintes pendant l'import : le fil principal n'est pas bloqué.
await page.evaluate(() => {
  window.__images = 0;
  window.__peindre = true;
  const boucle = () => {
    window.__images++;
    if (window.__peindre) requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
});
const t0 = Date.now();
await importer("terrain.obj", terrainObj(GROS));
await page.waitForSelector("[data-planche-import-insertion]", { timeout: 60000 });
await page.screenshot({ path: `${OUT}/import-en-cours.png` });
const texte = (await dialogue.textContent()) ?? "";
check("dialogue : insertion « … / 45 000 triangles » et borne affichée", /45[\s  ’']?000 triangles/.test(texte) && (await dialogue.locator("[data-planche-import-borne]").count()) === 1, texte.slice(0, 160));
await attendreFin();
const duree = Date.now() - t0;
const images = await page.evaluate(() => {
  window.__peindre = false;
  return window.__images;
});
check("la page continue de peindre pendant l'import", images >= Math.min(20, duree / 100), `${images} images en ${duree} ms`);
const m2 = await modele();
const terrain = Object.values(m2.definitions).sort((a, b) => Object.keys(b.contenu.faces).length - Object.keys(a.contenu.faces).length)[0];
check("terrain : un groupe de 45 000 faces posé", (await nbObjets()) === 2 && terrain && Object.keys(terrain.contenu.faces).length === GROS * GROS * 2, `${duree} ms`);
check("une seule opération (Annuler retire le terrain)", (await page.evaluate(() => window.fadiPlanche.pas())) === avant + 1);
await page.keyboard.press("Control+Z");
await page.waitForTimeout(300);
check("Annuler : le terrain est retiré", (await nbObjets()) === 1);

// --- 3. Échap pendant l'import : annulé, dessin inchangé ---------------------------------------------------------------
const pasAvant = await page.evaluate(() => window.fadiPlanche.pas());
await importer("terrain.obj", terrainObj(GROS));
await page.waitForSelector("[data-planche-import-cours]");
await page.keyboard.press("Escape");
await attendreFin();
await page.waitForTimeout(400);
check("Échap : import annulé, dessin inchangé", (await nbObjets()) === 1 && (await page.evaluate(() => window.fadiPlanche.pas())) === pasAvant, (await message()) ?? "");

// --- 4. Au-delà de la borne : refusé, rien d'inséré ---------------------------------------------------------------------
await page.evaluate(() => localStorage.setItem("fadi.sandbox.planche.import.debit", JSON.stringify({ trianglesParSeconde: 50, mesure: new Date().toISOString() })));
await importer("terrain.obj", terrainObj(40)); // 3 200 triangles > borne de 1 000
await attendreFin();
await page.waitForTimeout(300);
const refus = (await page.locator("body").textContent()) ?? "";
check("au-delà de la borne : refusé avec la taille et la borne, rien d'inséré", (await nbObjets()) === 1 && /Import refusé : 3[\s  ’']?200 triangles/.test(refus) && /1[\s  ’']?000 triangles/.test(refus));
await page.screenshot({ path: `${OUT}/import-refuse.png` });

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette de l'import : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette de l'import : tous les contrôles passent.");
