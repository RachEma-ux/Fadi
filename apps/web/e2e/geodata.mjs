#!/usr/bin/env node
/**
 * Recette de GeoData (9ᵉ module, ADR-GEODATA-01/02) dans un vrai navigateur, contre l'API construite qui sert l'application.
 *
 * Amorçage (base jetable de la recette, `DATABASE_URL`) : un compte « gestionnaire » reçoit les rôles GeoData par la ligne
 * de commande, puis le jeu SYNTHÉTIQUE de test (`apps/api/test-corpus/geodata/`) est préparé et publié par la chaîne
 * administrative réelle (`geodata:import-reference`). Aucune donnée réelle n'est inventée.
 *
 * Critères couverts : GEO 01 (compte sans projet), 02 (accès direct, entrée du menu, aucun sélecteur de projet), 05
 * (carte enregistrée relue après reconnexion), 06 (valeur absente distincte de zéro : légende, fiche, table), 07 (GeoJSON
 * projeté refusé à l'import, import valide → couche privée), 08 (un tiers ne voit ni la carte ni la couche), 09 (export
 * autorisé : PNG + fiche de sources avec attribution), 10 (analyse figée), 11 (sans WebGL : message, recherche et table
 * utilisables), 12 (téléphone : un seul panneau ; clavier ; axe-core sans violation critique ou sérieuse), 13 (deux
 * onglets : second enregistrement refusé, copie de « ma version »), interface anglaise sans résidu français.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=… OUT=atelier-captures/geodata node apps/web/e2e/geodata.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/geodata";
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const MDP = "geodata-recette-123";
const suffixe = Date.now().toString(36);
const AVEC_WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const lancer = (args) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args });

async function inscrire(page, email) {
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)/);
}
async function connecter(page, email) {
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)/);
}
const npmApi = (script, args) => execFileSync("npm", ["run", "-s", script, "--workspace=@fadi/api", "--", ...args], { cwd: RACINE, env: process.env, encoding: "utf8" });

const navigateur = await lancer(AVEC_WEBGL);
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await contexte.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
const appelsProjet = [];
page.on("request", (r) => { if (/\/projects\//.test(new URL(r.url()).pathname) && new URL(r.url()).pathname.startsWith("/projects/")) appelsProjet.push(r.url()); });

// --- Amorçage : gestionnaire et jeu synthétique publié par la chaîne administrative ---
const gestionnaire = `gd-gestion-${suffixe}@example.test`;
await inscrire(page, gestionnaire);
for (const role of ["gestionnaire-donnees", "responsable-publication"]) npmApi("geodata:role", ["--email", gestionnaire, "--role", role]);
const sortieImport = npmApi("geodata:import-reference", ["--fiche", "apps/api/test-corpus/geodata/synthetique-unites.fiche.json", "--fichier", "apps/api/test-corpus/geodata/synthetique-unites.geojson", "--preparateur", gestionnaire, "--publier-par", gestionnaire].map((a) => (a.startsWith("apps/") ? join(RACINE, a) : a)));
check("chaîne administrative : jeu synthétique préparé puis publié (ou déjà présent, même empreinte)", /Version publiée|Version déjà présente/.test(sortieImport), sortieImport.split("\n").filter((l) => /Version/.test(l)).join(" | "));
await page.context().clearCookies();

// --- GEO 01 / 02 : compte sans projet, accès direct ---
const alice = `gd-alice-${suffixe}@example.test`;
await inscrire(page, alice);
const projets = await (await page.request.get(`${BASE}/projects`)).json();
check("GEO 01 · le compte n'a aucun projet", Array.isArray(projets) && projets.length === 0);
const entree = page.locator("[data-nav-geodata]");
check("GEO 02 · entrée GeoData dans la navigation générale", (await entree.count()) === 1);
await entree.click();
await page.waitForURL(/\/geodata$/);
await page.locator("[data-geodata-page]").waitFor();
check("GEO 02 · /geodata ouvre directement la carte (aucun tableau de bord intermédiaire)", (await page.locator("[data-gd-moteur]").count()) === 1);
check("GEO 02 · aucun sélecteur ni navigation de projet dans l'espace GeoData", (await page.locator("[data-geodata-page] select, [data-geodata-page] a").evaluateAll((els) => els.filter((e) => /projet/i.test(e.textContent ?? "")).length)) === 0);
check("GEO 02 · titre du bandeau général : GeoData", ((await page.locator(".fadi-topbar-title h1").textContent()) ?? "").trim() === "GeoData");
await page.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
check("carte : moteur chargé (canevas MapLibre)", (await page.locator(".maplibregl-canvas").count()) === 1);

// --- Catalogue, couche, indicateur, légende (GEO 06) ---
const carteCatalogue = page.locator("[data-gd-couche-catalogue]").filter({ hasText: "Unités synthétiques (test)" });
await carteCatalogue.waitFor();
check("catalogue : jeu synthétique signalé comme tel", (await carteCatalogue.locator(".gd-badge-alerte").textContent())?.includes("Jeu synthétique") === true);
await carteCatalogue.getByRole("button", { name: "Fiche de la couche" }).click();
const ficheVersion = carteCatalogue.locator("[data-gd-fiche-version]");
check("catalogue : fiche de version (licence, empreinte, droits par usage)", (await ficheVersion.textContent())?.includes("Empreinte SHA-256") === true && (await ficheVersion.locator(".gd-droits li").count()) === 8);
await carteCatalogue.locator("[data-gd-ajouter]").click();
await page.locator("[data-gd-onglet='couches']").click();
const coucheActive = page.locator("[data-gd-couche-active]").first();
await coucheActive.waitFor();
const choixIndicateur = coucheActive.locator("[data-gd-indicateur]");
const optionEffectif = await choixIndicateur.locator("option").filter({ hasText: "Effectif synthétique" }).getAttribute("value");
await choixIndicateur.selectOption(optionEffectif);
await page.locator("[data-gd-onglet='legende']").click();
const absente = page.locator("[data-gd-legende] [data-classe='absente']");
await absente.waitFor();
check("GEO 06 · légende : entrée « Valeur absente (1) » distincte des classes", ((await absente.textContent()) ?? "").includes("Valeur absente (1)"));
check("GEO 06 · légende : la valeur absente est hachurée (pas seulement une couleur)", (await absente.locator(".gd-hachure").count()) === 1);

// Recherche : coordonnées étiquetées, paire nue refusée, unité par code à zéro initial.
const recherche = page.locator("[data-gd-recherche]");
await recherche.fill("33.5, -7.6");
await recherche.press("Enter");
await page.locator(".gd-resultats").waitFor();
check("recherche : une paire de nombres sans étiquette est refusée (aucun ordre deviné)", ((await page.locator(".gd-resultats").textContent()) ?? "").includes("précisez « lon … lat … »"));
await recherche.fill("003");
await recherche.press("Enter");
await page.locator("[data-gd-resultat='003']").click();
const fiche = page.locator("[data-gd-fiche='003']");
await fiche.waitFor();
const valeurAbsente = fiche.locator("[data-gd-valeur][data-absente]");
check("GEO 06 · fiche : « Valeur absente — Valeur couverte par le secret statistique », jamais 0", ((await valeurAbsente.textContent()) ?? "").includes("Valeur absente — Valeur couverte par le secret statistique"));
await page.screenshot({ path: join(OUT, "01-carte-thematique.png") });

// Table : zéro affiché 0, absence affichée « Valeur absente ».
await page.locator("[data-gd-onglet='couches']").click();
await page.locator("[data-gd-couche-active]").first().getByRole("button", { name: "Table" }).click();
const table = page.locator("[data-gd-table]");
await table.locator("[data-gd-ligne='001']").waitFor();
const ligne1 = await table.locator("[data-gd-ligne='001'] td").allTextContents();
const ligne3 = await table.locator("[data-gd-ligne='003'] td").allTextContents();
check("GEO 06 · table : zéro reste « 0 » et l'absence reste « Valeur absente »", ligne1.includes("0") && ligne3.some((t) => t.startsWith("Valeur absente")), `${ligne1.join("|")} / ${ligne3.join("|")}`);
await table.getByRole("button", { name: "Fermer la table" }).click();

// --- GEO 05 : enregistrer, se reconnecter, retrouver la composition ---
await page.locator("[data-gd-enregistrer]").click();
await page.locator("[data-gd-nom-carte]").fill("Carte de recette");
await page.locator("[data-gd-enregistrer-sous]").click();
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
check("GEO 05 · carte enregistrée (état « Enregistrée »)", true);
const compositionAvant = await page.evaluate(async () => { const r = await fetch("/geodata/api/cartes"); const l = await r.json(); const c = await (await fetch(`/geodata/api/cartes/${l.cartes[0].id}`)).json(); return c; });
await page.context().clearCookies();
await connecter(page, alice);
await page.goto(`${BASE}/geodata`);
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor({ timeout: 20_000 });
const compositionApres = await page.evaluate(async (id) => (await (await fetch(`/geodata/api/cartes/${id}`)).json()).composition, compositionAvant.id);
check("GEO 05 · après reconnexion : la dernière carte se rouvre, composition, versions et seuils identiques", JSON.stringify(compositionApres) === JSON.stringify(compositionAvant.composition));
check("GEO 05 · la couche reste thématique avec ses seuils enregistrés", compositionApres.couches[0]?.style?.mode === "thematique" && Array.isArray(compositionApres.couches[0].style.seuils));

// --- GEO 13 : deux onglets ---
const onglet2 = await contexte.newPage();
await onglet2.goto(`${BASE}/geodata`);
await onglet2.locator("[data-gd-etat-enregistrement='enregistree']").waitFor({ timeout: 20_000 });
await page.locator("[data-gd-onglet='couches']").click();
await page.locator("[data-gd-couche-active] input[type='range']").first().fill("40");
await page.locator("[data-gd-enregistrer]").click();
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
await onglet2.locator("[data-gd-onglet='couches']").click();
await onglet2.locator("[data-gd-couche-active] input[type='range']").first().fill("90");
await onglet2.locator("[data-gd-enregistrer]").click();
await onglet2.locator("[data-gd-conflit]").waitFor();
check("GEO 13 · second onglet : enregistrement périmé refusé, conflit visible", (await onglet2.locator("[data-gd-etat-enregistrement='conflit']").count()) === 1);
await onglet2.locator("[data-gd-copie-conflit]").click();
await onglet2.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
const cartes = await page.evaluate(async () => (await (await fetch("/geodata/api/cartes")).json()).cartes.map((c) => c.nom));
check("GEO 13 · « ma version » enregistrée comme copie, l'original intact", cartes.some((n) => n.endsWith("(ma version)")) && cartes.includes("Carte de recette"), cartes.join(", "));
await onglet2.close();
await page.goto(`${BASE}/geodata`);
await page.locator("[data-gd-etat-enregistrement]").waitFor();

// --- GEO 07 : import GeoJSON personnel ---
await page.locator("[data-gd-volet='import']").click();
const projete = { type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::26191" } }, features: [{ type: "Feature", properties: { nom: "x" }, geometry: { type: "Point", coordinates: [350000, 380000] } }] };
await page.locator("[data-gd-fichier]").setInputFiles({ name: "projete.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(projete)) });
await page.locator("[data-gd-rapport='rejete']").waitFor();
check("GEO 07 · GeoJSON projeté refusé avant traitement, motif affiché", ((await page.locator("[data-gd-rapport='rejete']").textContent()) ?? "").includes("non pris en charge"));
const secteur = { type: "FeatureCollection", features: [{ type: "Feature", properties: { nom: "Secteur importé" }, geometry: { type: "Polygon", coordinates: [[[-8.95, 30.05], [-8.6, 30.05], [-8.6, 30.3], [-8.95, 30.3], [-8.95, 30.05]]] } }] };
await page.locator("[data-gd-fichier]").setInputFiles({ name: "secteur.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(secteur)) });
await page.locator("[data-gd-rapport='valide']").waitFor();
await page.locator("[data-gd-titre-import]").fill("Mon secteur");
await page.locator("[data-gd-confirmer-import]").click();
await page.locator(".gd-succes").waitFor();
const coucheImportee = await page.evaluate(async () => (await (await fetch("/geodata/api/catalogue")).json()).couches.find((c) => c.titre === "Mon secteur"));
check("GEO 07 · import confirmé : couche privée versionnée", coucheImportee?.version?.privee === true);

// --- Zone par coordonnées (clavier) et analyse (GEO 10 côté interface) ---
await page.locator("[data-gd-volet='etudes']").click();
await page.locator("[data-gd-etudes] details summary").click();
const champs = page.locator("[data-gd-etudes] details input");
await champs.nth(0).fill("-9");
await champs.nth(1).fill("30.05");
await champs.nth(2).fill("-8.7");
await champs.nth(3).fill("30.15");
await champs.nth(4).fill("Zone de recette");
await page.locator("[data-gd-etudes] details").getByRole("button", { name: "Créer la zone" }).click();
const zone = page.locator("[data-gd-zone]").filter({ hasText: "Zone de recette" });
await zone.waitFor();
await page.locator("[data-gd-etudes] select").last().selectOption({ label: "Unités synthétiques (test)" });
await zone.locator("[data-gd-analyser]").click();
const analyse = page.locator("[data-gd-analyse]").first();
await analyse.waitFor();
check("analyse : superficie et unités intersectées, limites déclarées", /unité\(s\) intersectée\(s\)/.test((await analyse.textContent()) ?? "") && ((await analyse.textContent()) ?? "").includes("ni population"));
// Mesure indicative au tracé.
await page.locator("[data-gd-outil='distance']").check();
const boite = await page.locator(".maplibregl-canvas").boundingBox();
await page.mouse.click(boite.x + boite.width * 0.4, boite.y + boite.height * 0.5);
await page.mouse.click(boite.x + boite.width * 0.6, boite.y + boite.height * 0.5);
await page.locator("[data-gd-mesure]").waitFor();
check("mesure indicative : distance affichée avec sa méthode", /Distance : .*(m|km)/.test((await page.locator("[data-gd-mesure]").textContent()) ?? "") && ((await page.locator("[data-gd-mesure]").textContent()) ?? "").includes("indicative"));
await page.locator("[data-gd-outil='navigation']").check();

// --- GEO 09 : export autorisé (PNG + fiche) ---
await page.locator("[data-gd-enregistrer]").click().catch(() => undefined);
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
await page.locator("[data-gd-volet='export']").click();
const telechargement = page.waitForEvent("download", { timeout: 30_000 });
await page.locator("[data-gd-exporter]").click();
const png = await telechargement;
const cheminPng = join(OUT, "export.png");
await png.saveAs(cheminPng);
const octets = readFileSync(cheminPng);
check("GEO 09 · export autorisé : image PNG téléchargée", octets.subarray(1, 4).toString() === "PNG" && octets.length > 5000, `${octets.length} octets`);
await page.locator("[data-gd-export-ok]").waitFor();
const lienFiche = await page.locator("[data-gd-export-ok] a").getAttribute("href");
const ficheHtml = await (await page.request.get(`${BASE}${lienFiche}`)).text();
check("GEO 09 · fiche de sources : attribution et nature synthétique déclarées", ficheHtml.includes("Jeu synthétique GeoData — aucune donnée réelle") && ficheHtml.includes("Empreinte SHA-256"));

// --- Accessibilité (axe-core), clavier ---
await page.addScriptTag({ path: AXE });
const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector("[data-geodata-page]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, cibles: v.nodes.slice(0, 3).map((x) => x.target) })));
writeFileSync(join(OUT, "axe-geodata.json"), JSON.stringify(violations, null, 2));
const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
check("GEO 12 · axe-core : aucune violation critique ou sérieuse", graves.length === 0, graves.map((v) => `${v.id} ${JSON.stringify(v.cibles)}`).join(" ; "));
await page.locator("[data-gd-recherche]").focus();
await page.keyboard.press("Tab");
const focusApres = await page.evaluate(() => document.activeElement?.textContent?.trim());
check("GEO 12 · clavier : la recherche mène au bouton « Rechercher »", focusApres === "Rechercher", focusApres);

// --- GEO 12 : téléphone, un seul panneau ouvert à la fois ---
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/geodata`);
await page.locator("[data-geodata-page]").waitFor();
await page.locator("[data-gd-onglet='catalogue']").click();
await page.locator("[data-gd-volet='cartes']").click();
const ouverts = await page.evaluate(() => [document.querySelector(".gd-panneau.gd-ouvert"), document.querySelector("[data-gd-volet-ouvert]")].filter(Boolean).length);
check("GEO 12 · téléphone : un seul panneau principal ouvert", ouverts === 1);
check("GEO 12 · téléphone : aucun débordement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await page.screenshot({ path: join(OUT, "02-telephone.png") });
await page.setViewportSize({ width: 1440, height: 900 });

// --- GEO 08 : un tiers ---
const tiers = await (await navigateur.newContext()).newPage();
await inscrire(tiers, `gd-bob-${suffixe}@example.test`);
const statutCarte = (await tiers.request.get(`${BASE}/geodata/api/cartes/${compositionAvant.id}`)).status();
const statutCouche = (await tiers.request.get(`${BASE}/geodata/api/couches/${coucheImportee.id}`)).status();
const statutFiche = (await tiers.request.get(`${BASE}${lienFiche}`)).status();
check("GEO 08 · un tiers : carte, couche privée et fiche d'export refusées (404)", statutCarte === 404 && statutCouche === 404 && statutFiche === 404, `${statutCarte}/${statutCouche}/${statutFiche}`);

// --- GEO 11 : sans WebGL ---
const sansGl = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--disable-gpu", "--disable-software-rasterizer", "--disable-webgl", "--disable-3d-apis"] });
const p2 = await (await sansGl.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await connecter(p2, alice);
await p2.goto(`${BASE}/geodata`);
await p2.locator("[data-gd-erreur-carte]").waitFor({ timeout: 20_000 });
check("GEO 11 · sans WebGL : message explicite, pas d'animation de chargement sans fin", ((await p2.locator("[data-gd-erreur-carte]").textContent()) ?? "").includes("WebGL") && (await p2.getByText("Chargement de la carte…").count()) === 0);
await p2.locator("[data-gd-recherche]").fill("Unité synthétique B");
await p2.locator("[data-gd-recherche]").press("Enter");
await p2.locator("[data-gd-resultat='002']").click();
await p2.locator("[data-gd-fiche='002']").waitFor();
check("GEO 11 · sans WebGL : recherche et fiche restent utilisables", true);
await sansGl.close();

// --- Interface anglaise : aucun résidu français hors données ---
const en = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await en.goto(`${BASE}/inscription`);
await en.locator("[data-choix-langue]").selectOption("en");
await en.waitForFunction(() => document.documentElement.lang === "en");
await en.fill('input[name="email"]', `gd-en-${suffixe}@example.test`);
await en.fill('input[name="password"]', MDP);
await en.click('button[type="submit"]');
await en.waitForURL(/\/(accueil|projets)/);
const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|carte|couche|valeur)\b/i;
const residus = new Set();
async function releve() {
  await en.waitForTimeout(800);
  for (const t of await en.evaluate(() => {
    const out = [];
    const exclu = (n) => { for (let e = n.parentElement; e; e = e.parentElement) { if (e.getAttribute("translate") === "no" || ["SCRIPT", "STYLE", "TEXTAREA", "CODE", "OPTION"].includes(e.tagName) || e.classList.contains("maplibregl-ctrl-attrib")) return true; const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") return true; } return false; };
    const w = document.createTreeWalker(document.querySelector("[data-geodata-page]"), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.replace(/\s+/g, " ").trim(); if (t.length >= 3 && !exclu(n)) out.push(t); }
    for (const e of document.querySelectorAll("[data-geodata-page] [aria-label], [data-geodata-page] [placeholder], [data-geodata-page] [title]")) for (const a of ["aria-label", "placeholder", "title"]) { const v = e.getAttribute(a); if (v && v.length >= 3) out.push(v); }
    return out;
  })) if (FR.test(t)) residus.add(t);
}
await en.goto(`${BASE}/geodata`);
await en.locator("[data-geodata-page]").waitFor();
await releve();
for (const v of ["cartes", "etudes", "import", "export"]) { await en.locator(`[data-gd-volet='${v}']`).click(); await releve(); }
for (const o of ["couches", "legende"]) { await en.locator(`[data-gd-onglet='${o}']`).click(); await releve(); }
writeFileSync(join(OUT, "residus-anglais.txt"), [...residus].join("\n"));
check("interface anglaise : aucun texte d'interface resté en français", residus.size === 0, [...residus].slice(0, 8).join(" | "));

check("aucun appel à l'API d'un projet depuis GeoData", appelsProjet.length === 0, appelsProjet.slice(0, 3).join(", "));
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await navigateur.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette GeoData : tout est conforme.");
process.exit(echecs ? 1 : 0);
