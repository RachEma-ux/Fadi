/**
 * Recette « Visionneuse hors ligne » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 7d : D10-F14-085) :
 * - Ctrl+Maj+Espace, Maj+I (famille Échanges), V ouvre « Visionneuse hors ligne » ; maquette vide : export grisé avec
 *   son motif ; la recherche de l'encadré trouve les deux commandes ;
 * - une boîte et deux vues enregistrées : triangles, vues cochées, version, empreinte et taille estimée affichées ;
 * - une vue décochée, Ctrl+Maj+Espace, Maj+I, Maj+V écrit un seul fichier .html daté ;
 * - le fichier s'ouvre hors ligne (aucune requête réseau) : nom, « Lecture seule », version et empreinte du panneau,
 *   maquette en 3D (WebGL), une seule vue, orbite, plan de coupe horizontal, mesure entre deux points ;
 * - aucune erreur JavaScript, ni dans la Planche ni dans la visionneuse.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-visionneuse node apps/web/e2e/planche-visionneuse.mjs
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-visionneuse";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `visionneuse-${Date.now()}@example.com`, "planche-vis-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const vue = page.locator("[data-planche-vue]");
const panneau = () => page.evaluate(() => window.fadiPlanche.panneau());
/** Trois temps : Ctrl+Maj+Espace, la porte de la famille, puis la touche de la commande. */
const troisTemps = async (porte, touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(porte);
  await page.waitForTimeout(60);
  await page.keyboard.press(touche);
  await page.waitForTimeout(120);
};

await troisTemps("Shift+I", "v");
const pan = page.locator("[data-planche-visionneuse]");
await pan.waitFor();
check("Ctrl+Maj+Espace, Maj+I, V ouvre « Visionneuse hors ligne »", (await panneau()) === "visionneuse");
const tete = (await page.locator("[data-planche-panneau='visionneuse'] [data-planche-panneau-raccourci]").textContent()) ?? "";
check("l'en-tête montre l'icône et le raccourci en trois temps", tete.includes("Maj+I") && tete.trim().endsWith("V") && (await page.locator("[data-planche-panneau='visionneuse'] h3 svg").count()) === 1, tete);
const exporter = pan.locator("[data-planche-commande='exporter-visionneuse']");
check("maquette vide : Exporter grisé avec son motif", (await exporter.isDisabled()) && ((await exporter.getAttribute("title")) ?? "").includes("La maquette est vide"));
check("le bouton rappelle Maj+V et porte son icône", ((await exporter.textContent()) ?? "").includes("Maj+V") && (await exporter.locator("svg").count()) === 1);
check("sans vue enregistrée : la visionneuse s'ouvre sur l'ensemble", (await pan.locator("[data-planche-visionneuse-sans-vue]").count()) === 1);

// La recherche de l'encadré trouve les deux commandes de la visionneuse.
await vue.focus();
await page.keyboard.press("Control+Shift+Space");
await page.locator("[data-planche-deux-temps]").waitFor();
await page.keyboard.press("Tab");
await page.locator("[data-planche-deux-temps-recherche]").fill("visionneuse");
await page.waitForTimeout(100);
const trouves = await page.locator("[data-planche-deux-temps-resultat]").allTextContents();
check("la recherche de l'encadré trouve les deux commandes", trouves.some((x) => x.includes("Visionneuse hors ligne")) && trouves.some((x) => x.includes("Exporter la visionneuse")), trouves.join(" | "));
await page.keyboard.press("Escape");
await page.waitForTimeout(100);

// Une boîte 4 × 3 × 2,5 m : rectangle, puis Pousser/Tirer.
const ecran = async (q) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
};
const cliquer = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(50);
};
// Le panneau ouvert couvrirait les points visés : il est refermé.
await page.locator("section.planche-panneau .canevas-fermer").first().click();
await page.waitForTimeout(150);
await vue.focus();
await page.keyboard.press("r");
await cliquer({ x: 0, y: 0, z: 0 });
const coin = await ecran({ x: 2, y: 1.5, z: 0 });
await page.mouse.move(coin.x, coin.y, { steps: 4 });
await saisir("4;3");
await page.keyboard.press("p");
await cliquer({ x: 2, y: 1.5, z: 0 });
await saisir("2,5");
await page.keyboard.press("Escape");
await vue.focus();
await page.keyboard.press(" ");
const faces = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.faces).length);
check("boîte dessinée (6 faces)", faces === 6, String(faces));

// Deux vues enregistrées.
await page.locator("[data-planche-panneau-icone='scenes']").click();
await page.locator("[data-planche-scene-ajouter]").click();
await page.waitForTimeout(100);
await page.locator("[data-planche-scene-ajouter]").click();
await page.waitForTimeout(100);
const scenes = await page.evaluate(() => Object.values(window.fadiPlanche.modele().annotations?.scenes ?? {}).map((s) => s.id));
check("deux vues enregistrées", scenes.length === 2, String(scenes.length));

await troisTemps("Shift+I", "v");
await pan.waitFor();
const triangles = (await pan.locator("[data-planche-visionneuse-triangles]").textContent()) ?? "";
check("contenu : maquette et ses 12 triangles", triangles.includes("12 triangles"), triangles);
check("les deux vues sont cochées", (await pan.locator("[data-planche-visionneuse-vue]:checked").count()) === 2);
const version = (await pan.locator("[data-planche-visionneuse-version]").textContent()) ?? "";
const empreinte = (await pan.locator("[data-planche-visionneuse-empreinte]").textContent()) ?? "";
const taille = (await pan.locator("[data-planche-visionneuse-taille]").textContent()) ?? "";
check("version en heure suisse, empreinte abrégée, taille estimée", /^\d\d\.\d\d\.\d{4}, \d{1,2} h \d\d$/.test(version) && /^[0-9a-f]{4} [0-9a-f]{4} … [0-9a-f]{4}$/.test(empreinte) && /(ko|Mo) \(estimée\)$/.test(taille), `${version} · ${empreinte} · ${taille}`);
await pan.locator(`[data-planche-visionneuse-vue='${scenes[1]}']`).uncheck();
await page.screenshot({ path: `${OUT}/panneau.png` });

const attente = page.waitForEvent("download");
await troisTemps("Shift+I", "Shift+V");
const telechargement = await attente;
const nom = telechargement.suggestedFilename();
check("Maj+V écrit un seul fichier .html daté", /-visionneuse-\d{4}-\d\d-\d\d\.html$/.test(nom), nom);
const chemin = resolve(OUT, nom);
await telechargement.saveAs(chemin);
const note = (await pan.locator("[data-planche-visionneuse-note]").textContent().catch(() => "")) ?? "";
check("la note dit ce qui est écrit", note.includes(nom) && note.includes("12 triangles") && note.includes("vues : 1"), note);

// Le fichier, hors ligne.
const hors = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, offline: true });
const requetes = [];
await hors.route("**/*", (r) => {
  if (!r.request().url().startsWith("file:")) requetes.push(r.request().url());
  return r.request().url().startsWith("file:") ? r.continue() : r.abort();
});
const v = await hors.newPage();
const erreursV = [];
v.on("pageerror", (e) => erreursV.push(e.message));
await v.goto(pathToFileURL(chemin).href);
await v.waitForSelector("body[data-pret]");
check("la visionneuse s'ouvre et affiche la 3D (WebGL)", (await v.getAttribute("body", "data-pret")) === "oui", (await v.locator("[data-erreur]").textContent()) ?? "");
check("12 triangles dans la visionneuse", (await v.getAttribute("body", "data-triangles")) === "12");
const enTete = (await v.locator("[data-version]").textContent()) ?? "";
check("« Lecture seule », version et empreinte du panneau", (await v.locator(".ro").textContent()) === "Lecture seule" && enTete.includes(version) && enTete.includes(empreinte), enTete);
const vues = await v.locator("[data-vue]").allTextContents();
check("une seule vue : celle restée cochée, active à l'ouverture", vues.length === 1 && (await v.getAttribute("body", "data-vue-active")) === "0", vues.join(" | "));
check("aucune balise : pas de bouton Balises", await v.locator("[data-outil='balises']").isHidden());
await v.waitForTimeout(300);
const toile = await v.locator("[data-scene]").boundingBox();
const pixel = (x, y) => v.evaluate(([x, y]) => {
  const c = document.querySelector("[data-scene]");
  const g = c.getContext("webgl");
  const p = new Uint8Array(4);
  const r = c.getBoundingClientRect();
  g.readPixels(Math.round((x / r.width) * c.width), Math.round((1 - y / r.height) * c.height), 1, 1, g.RGBA, g.UNSIGNED_BYTE, p);
  return [...p];
}, [x, y]);
const centre = await pixel(toile.width / 2, toile.height / 2);
const fond = await pixel(4, 4);
check("la maquette est dessinée (centre différent du fond)", centre.join() !== fond.join(), `${centre} / ${fond}`);
await v.screenshot({ path: `${OUT}/visionneuse.png` });
// Orbite : glisser quitte la vue enregistrée.
await v.mouse.move(toile.x + toile.width / 2, toile.y + toile.height / 2);
await v.mouse.down();
await v.mouse.move(toile.x + toile.width / 2 + 120, toile.y + toile.height / 2 + 20, { steps: 6 });
await v.mouse.up();
check("orbite : glisser tourne la vue", (await v.getAttribute("body", "data-vue-active")) === "-1");
await v.locator("[data-vue]").first().click();
check("la vue enregistrée se rappelle", (await v.getAttribute("body", "data-vue-active")) === "0");
// Plan de coupe horizontal.
await v.locator("[data-outil='coupe']").click();
await v.locator("[data-coupe-curseur]").evaluate((e) => {
  e.value = "1.25";
  e.dispatchEvent(new Event("input"));
});
check("plan de coupe horizontal à 1,25 m", ((await v.locator("[data-coupe-altitude]").textContent()) ?? "") === "Horizontal, altitude 1,25 m" && (await v.getAttribute("body", "data-coupe")) === "1.25");
await v.screenshot({ path: `${OUT}/visionneuse-coupe.png` });
// Mesure : deux points sur la maquette.
await v.locator("[data-outil='mesure']").click();
// Deux points de la maquette : pris sur une grille, là où l'image n'est pas le fond.
const surMaquette = [];
for (let y = 0.2; y < 0.9 && surMaquette.length < 40; y += 0.05) for (let x = 0.1; x < 0.95; x += 0.05) {
  const p = await pixel(toile.width * x, toile.height * y);
  if (p.join() !== fond.join()) surMaquette.push([toile.width * x, toile.height * y]);
}
const [p1, p2] = [surMaquette[0], surMaquette[surMaquette.length - 1]];
await v.mouse.click(toile.x + p1[0], toile.y + p1[1]);
await v.mouse.click(toile.x + p2[0], toile.y + p2[1]);
await v.waitForTimeout(150);
const mesure = (await v.locator("[data-mesure]").textContent()) ?? "";
check("mesure entre deux points, en mètres", (await v.locator("[data-mesure]").isVisible()) && / m · /.test(mesure) && Number(await v.getAttribute("body", "data-mesure-m")) > 0, mesure);
await v.screenshot({ path: `${OUT}/visionneuse-mesure.png` });
check("hors ligne : aucune requête réseau", requetes.length === 0, requetes.join(", "));
check("rien n'est modifiable : aucun champ de saisie", (await v.locator("input:not([type=range]):not([type=checkbox]), textarea, [contenteditable]").count()) === 0);
check("aucune erreur JavaScript dans la visionneuse", erreursV.length === 0, erreursV.join(" | "));
await hors.close();

check("aucune erreur JavaScript dans la Planche", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs) {
  console.log(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette visionneuse : tout est conforme.");
