/**
 * Recette « Balises, scènes et gabarit » de la Planche (cas 2 du catalogue, lot 4 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-4/lot4-1` à `lot4-4`) :
 * - Ctrl+Maj+9 ouvre « Nouvelle Planche » ; un gabarit d'agence d'essai importé est archivé en base, résumé (7 balises,
 *   3 réservées, 2 scènes types) ; « Créer la Planche » ouvre une Planche avec ses balises et son pas de 1 mm ;
 * - balise courante « Projeté » : le rectangle tracé la reçoit ; épaisseur et trait saisis dans le tableau ;
 *   Ctrl+Maj+1 verrouille puis déverrouille la balise courante ; la sélection classée sous « Existant » ;
 * - Ctrl+Maj+4 : vue d'état suivante (état existant : « Projeté » masquée), puis retour à tout ;
 * - un plan de coupe posé reçoit la balise réservée « Plans de coupe » ; Info entité · Plan de coupe : distance saisie,
 *   Ctrl+Maj+6 avance d'un pas, profondeur vue limitée (deux plans de rognage) ; échelle 1:50 et Ctrl+Maj+8 créent la
 *   scène face à la coupe, rendue au 1:50 ;
 * - panneau Scènes : projection affichée, état mémorisé, date et heure du soleil saisies ; Ctrl+Maj+5 crée les scènes
 *   types du gabarit ;
 * - Alt+7 enregistre la Planche comme gabarit (fichier téléchargé, archivé en base) ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-balises node apps/web/e2e/planche-balises-scenes.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-balises";
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
await inscrireDansLaPage(page, `balises-${Date.now()}@example.com`, "planche-balises-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const racine = page.locator("[data-sandbox-planche]");
const vue = page.locator("[data-planche-vue]");
const balisesDe = async () => Object.values((await modele()).annotations?.balises ?? {});
const baliseNommee = async (nom) => (await balisesDe()).find((b) => b.nom === nom);
const ecran = async (p) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((q) => window.fadiPlanche.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};
const cliquer = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(60);
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};
const ouvrirPanneau = async (id) => {
  if ((await racine.locator(`[data-planche-panneau='${id}']`).count()) === 0) await racine.locator(`[data-planche-panneau-icone='${id}']`).click();
  return racine.locator(`[data-planche-panneau='${id}']`);
};
const champ = async (loc, valeur) => {
  await loc.fill(valeur);
  await loc.press("Enter");
  await page.waitForTimeout(150);
};

// --- Gabarit d'agence (maquette lot4-4) ----------------------------------------------------------------------------------
const gabarit = {
  format: "fadi-gabarit/1",
  nom: "Agence · Logement",
  source: "Gabarit d'essai de la recette (aucune donnée réelle)",
  unite: "m",
  pas: 0.001,
  balises: [
    { nom: "Existant", couleur: "#333333", epaisseur: 0.35, trait: "continu", phase: "existant" },
    { nom: "À démolir", couleur: "#8f6a1f", epaisseur: 0.35, trait: "tirets", phase: "demolir" },
    { nom: "Projeté", couleur: "#b3261e", epaisseur: 0.5, trait: "continu", phase: "projete" },
    { nom: "Fond de plan", couleur: "#888888", epaisseur: 0.13, verrouillee: true },
    { nom: "Cotes", couleur: "#1a5fd6", epaisseur: 0.18 },
    { nom: "Textes", couleur: "#1a5fd6", epaisseur: 0.18 },
    { nom: "Plans de coupe", couleur: "#1a5fd6", epaisseur: 0.25, trait: "mixte" },
  ],
  reservees: { cotes: "Cotes", textes: "Textes", plans: "Plans de coupe" },
  scenesTypes: [{ genre: "facades", echelle: 100 }, { genre: "coupes", echelle: 50 }],
};
await vue.focus();
await page.keyboard.press("Control+Shift+9");
const pGabarit = racine.locator("[data-planche-panneau='gabarit']");
await pGabarit.waitFor();
check("Ctrl+Maj+9 : panneau « Nouvelle Planche » ouvert", (await pGabarit.locator("h3").textContent())?.includes("Nouvelle Planche") === true);
await page.locator("[data-planche-gabarit-fichier]").setInputFiles({ name: "gabarit-logement.fadi-gabarit.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(gabarit, null, 2), "utf8") });
await pGabarit.locator("[data-planche-gabarit-note]").waitFor();
const noteImport = (await pGabarit.locator("[data-planche-gabarit-note]").textContent()) ?? "";
check("gabarit importé et archivé en base", noteImport.includes("archivé en base") && !noteImport.includes("pas archivé"), noteImport);
const choisi = await pGabarit.locator("[data-planche-gabarit-choix]").inputValue();
check("le gabarit importé est choisi (identifiant de l'archive en base)", choisi !== "" && !choisi.startsWith("local:"), choisi);
check("résumé : 7 balises", ((await pGabarit.locator("[data-planche-gabarit-balises]").textContent()) ?? "") === "7");
const archives = await page.evaluate(async () => (await (await fetch("/sandbox/preferences/fichiers?extension=planche-gabarit", { credentials: "include" })).json()).archives);
check("le fichier du gabarit est rangé tel quel en base pour le compte", archives.length === 1 && archives[0].nom === "gabarit-logement.fadi-gabarit.json", JSON.stringify(archives));
await pGabarit.screenshot({ path: `${OUT}/4-gabarit.png` });
await pGabarit.locator("[data-planche-commande='creer-planche-gabarit']").click();
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.balises ?? {}).length === 7, null, { timeout: 30000 });
let m = await modele();
check("Planche créée depuis le gabarit : 7 balises, pas de 1 mm, gabarit gardé avec le modèle", m.annotations.reglages?.accrochageLongueur === 0.001 && m.annotations.reglages?.gabarit?.nom === "Agence · Logement" && !!m.annotations.reglages?.gabarit?.archive, JSON.stringify(m.annotations.reglages?.gabarit?.archive ?? null));
check("balises réservées posées (cotes, textes, plans)", Object.keys(m.annotations.reglages?.balisesReservees ?? {}).length === 3);

// --- Panneau Balises (maquette lot4-1) -----------------------------------------------------------------------------------
const pBalises = await ouvrirPanneau("balises");
const projete = await baliseNommee("Projeté");
await pBalises.locator("[data-planche-balise-courante]").selectOption(projete.id);
check("balise courante « Projeté »", (await page.evaluate(() => window.fadiPlanche.balise())) === projete.id);
// Un rectangle de 4 × 3 m : il reçoit la balise courante.
await vue.focus();
await page.keyboard.press("r");
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
await page.mouse.move(boite.x + boite.width * 0.35, boite.y + boite.height * 0.55, { steps: 4 });
await page.mouse.click(boite.x + boite.width * 0.35, boite.y + boite.height * 0.55);
await page.mouse.move(boite.x + boite.width * 0.35 + 60, boite.y + boite.height * 0.55 + 30, { steps: 4 });
await saisir("4;3");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 1);
m = await modele();
const face = Object.values(m.racine.faces)[0];
const aretes = Object.values(m.racine.aretes);
check("le rectangle créé reçoit la balise courante (face et 4 arêtes)", face.balise === projete.id && aretes.length === 4 && aretes.every((a) => a.balise === projete.id), JSON.stringify({ face: face.balise, aretes: aretes.map((a) => a.balise) }));
const ligne = pBalises.locator(`[data-planche-balise='${projete.id}']`);
await champ(ligne.locator("[data-planche-balise-epaisseur]"), "0,7");
await ligne.locator("[data-planche-balise-trait]").selectOption("tirets");
await page.waitForTimeout(150);
const pr = await baliseNommee("Projeté");
check("épaisseur et trait saisis dans le tableau", pr.epaisseur === 0.7 && pr.trait === "tirets", JSON.stringify(pr));
await vue.focus();
await page.keyboard.press("Control+Shift+1");
await page.waitForTimeout(150);
check("Ctrl+Maj+1 : balise courante verrouillée, verrou affiché", (await baliseNommee("Projeté")).verrouillee === true && (await ligne.getAttribute("data-planche-balise-verrouillee")) === "oui");
await page.keyboard.press("Control+a");
await page.waitForTimeout(150);
check("balise verrouillée : « Tout sélectionner » ne prend rien de ce qu'elle porte", (await page.evaluate(() => window.fadiPlanche.selection().length)) === 0);
await page.keyboard.press("Control+Shift+1");
await page.waitForTimeout(150);
check("Ctrl+Maj+1 de nouveau : déverrouillée", (await baliseNommee("Projeté")).verrouillee !== true);
// Classer la sélection (le rectangle) sous « Existant ».
const existant = await baliseNommee("Existant");
await vue.focus();
await page.keyboard.press("Space");
await page.keyboard.press("Control+a");
await page.waitForTimeout(150);
check("ligne « Sélection » du panneau : arêtes nues comptées", ((await pBalises.locator("[data-planche-balise-selection]").textContent()) ?? "").includes("4 arêtes nues"), (await pBalises.locator("[data-planche-balise-selection]").textContent()) ?? "");
await pBalises.locator("[data-planche-commande='classer-selection']").click();
await pBalises.locator(`[data-planche-balise-classer-vers='${existant.id}']`).click();
await page.waitForTimeout(200);
m = await modele();
check("la sélection est classée sous « Existant » (face et arêtes)", Object.values(m.racine.faces)[0].balise === existant.id && Object.values(m.racine.aretes).every((a) => a.balise === existant.id));
await page.screenshot({ path: `${OUT}/1-balises.png` });
// Vue d'état.
await vue.focus();
await page.keyboard.press("Control+Shift+4");
await page.waitForTimeout(150);
check("Ctrl+Maj+4 : vue d'état existant, « Projeté » masquée", (await baliseNommee("Projeté")).visible === false && (await baliseNommee("Existant")).visible === true);
await pBalises.locator("[data-planche-commande='vue-etat']").click();
await page.waitForTimeout(150);
check("bouton « Vue d'état » de la barre : état projeté, « À démolir » masquée", (await baliseNommee("À démolir")).visible === false && (await baliseNommee("Projeté")).visible === true);
await vue.focus();
await page.keyboard.press("Control+Shift+4");
await page.waitForTimeout(150);
check("Ctrl+Maj+4 deux fois de plus : retour à tout voir", (await balisesDe()).filter((b) => b.phase).every((b) => b.visible));

// --- Plan de coupe (maquette lot4-3) -------------------------------------------------------------------------------------
const sommets = Object.values(m.racine.sommets).map((v) => v.position);
const centre = { x: (Math.min(...sommets.map((p) => p.x)) + Math.max(...sommets.map((p) => p.x))) / 2, y: (Math.min(...sommets.map((p) => p.y)) + Math.max(...sommets.map((p) => p.y))) / 2 };
await vue.focus();
await page.keyboard.press("Escape");
await page.keyboard.press("p");
await cliquer({ ...centre, z: 0 });
await saisir("2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 6);
await page.keyboard.press("Shift+K");
await cliquer({ ...centre, z: 2 });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.plansDeCoupe ?? {}).length === 1);
m = await modele();
const plan = Object.values(m.annotations.plansDeCoupe)[0];
const reservePlans = await baliseNommee("Plans de coupe");
check("le plan de coupe reçoit la balise réservée « Plans de coupe »", plan.balise === reservePlans.id, String(plan.balise));
await page.evaluate((id) => window.fadiPlanche.selection().length === 1 && window.fadiPlanche.selection()[0] === id, plan.id);
const pInfo = await ouvrirPanneau("info-entite");
await pInfo.locator("[data-planche-coupe-l4]").waitFor();
check("Info entité · Plan de coupe : section affichée", ((await pInfo.locator("h3").textContent()) ?? "").includes("Plan de coupe"));
await champ(pInfo.locator("[data-planche-coupe-distance]"), "1,5");
const n0 = (p) => Math.abs(p.normale.z) > 0.5 ? p.origine.z * Math.sign(p.normale.z) : NaN;
let p1 = Object.values((await modele()).annotations.plansDeCoupe)[0];
check("distance saisie : le plan est à 1,50 m le long de sa normale", Math.abs(n0(p1) - 1.5) < 1e-9, JSON.stringify(p1.origine));
await vue.focus();
await page.keyboard.press("Control+Shift+6");
await page.waitForTimeout(150);
p1 = Object.values((await modele()).annotations.plansDeCoupe)[0];
check("Ctrl+Maj+6 : le plan avance d'un pas (0,10 m)", Math.abs(n0(p1) - 1.6) < 1e-9, JSON.stringify(p1.origine));
await champ(pInfo.locator("[data-planche-coupe-profondeur]"), "6");
p1 = Object.values((await modele()).annotations.plansDeCoupe)[0];
check("profondeur vue limitée à 6 m : deux plans de rognage dans la vue", p1.profondeur === 6 && (await page.evaluate(() => window.fadiPlanche.plansRognage())) === 2);
check("ligne « Balise » : Plans de coupe (réservée)", ((await pInfo.locator("[data-planche-coupe-balise]").textContent()) ?? "").includes("Plans de coupe (réservée)"));
await champ(pInfo.locator("[data-planche-coupe-echelle]"), "1:50");
await page.screenshot({ path: `${OUT}/3-plan-de-coupe.png` });
await vue.focus();
await page.keyboard.press("Control+Shift+8");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.scenes ?? {}).length === 1);
await page.waitForTimeout(300);
const scene = Object.values((await modele()).annotations.scenes)[0];
const rendue = await page.evaluate(() => window.fadiPlanche.echelleRendue());
check("Ctrl+Maj+8 : scène face à la coupe, parallèle, 1:50, coupe seule active", scene.projection === "parallele" && scene.echelle === 50 && scene.etat?.plansActifs.length === 1, JSON.stringify({ p: scene.projection, e: scene.echelle }));
check("la scène est rendue à l'échelle nominale 1:50", rendue !== null && Math.abs(rendue - 50) < 0.5, String(rendue));

// --- Panneau Scènes (maquette lot4-2) ------------------------------------------------------------------------------------
const pScenes = await ouvrirPanneau("scenes");
await pScenes.locator(`[data-planche-scene-l4='${scene.id}']`).click();
await pScenes.locator("[data-planche-scene-memoire]").waitFor();
check("scène listée avec sa projection, état mémorisé affiché", ((await pScenes.locator("[data-planche-scenes-l4]").textContent()) ?? "").includes("parallèle") && ((await pScenes.locator("[data-planche-scene-echelle-lue]").textContent()) ?? "") === "1:50");
await champ(pScenes.locator("[data-planche-scene-soleil]"), "21.06.2026 14:00");
const s1 = (await modele()).annotations.scenes[scene.id];
const opts = await page.evaluate(() => window.fadiPlanche.options());
check("date et heure du soleil saisies, gardées par la scène et appliquées", s1.soleil?.jour === 172 && s1.soleil?.heure === 14 && opts.jour === 172 && opts.heure === 14, JSON.stringify(s1.soleil));
await vue.focus();
await page.keyboard.press("Control+Shift+5");
await page.waitForTimeout(300);
const scenes = Object.values((await modele()).annotations.scenes);
check("Ctrl+Maj+5 : scènes types du gabarit créées (4 façades 1:100, 1 coupe 1:50)", scenes.length === 6 && scenes.filter((s) => s.echelle === 100).length === 4, String(scenes.length));
await pScenes.screenshot({ path: `${OUT}/2-scenes.png` });

// --- Enregistrer la Planche comme gabarit ------------------------------------------------------------------------------
await vue.focus();
const [telechargement] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Alt+7")]);
check("Alt+7 : la Planche est enregistrée comme gabarit (fichier .fadi-gabarit.json)", telechargement.suggestedFilename().endsWith(".fadi-gabarit.json"), telechargement.suggestedFilename());
await page.waitForFunction(async () => (await (await fetch("/sandbox/preferences/fichiers?extension=planche-gabarit", { credentials: "include" })).json()).archives.length === 2, null, { timeout: 15000 }).catch(() => undefined);
const archives2 = await page.evaluate(async () => (await (await fetch("/sandbox/preferences/fichiers?extension=planche-gabarit", { credentials: "include" })).json()).archives);
check("le gabarit enregistré est archivé en base", archives2.length === 2, String(archives2.length));

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} contrôle(s) en échec` : "\nTous les contrôles passent.");
process.exit(echecs ? 1 : 0);
