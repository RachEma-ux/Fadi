/**
 * Recette « Point de base du projet » de la Planche (cas 4 du catalogue des extensions, étape 2 : D6-F8-001 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-2-point-de-base.png`) :
 * - Ctrl+Maj+B ouvre le panneau Emplacement sur la section « Point de base du projet » ;
 * - H n'est pas saisi : c'est le niveau de référence (« non évaluée » sans lui) ;
 * - saisie refusée nommée ; enregistrement en un pas, Annuler le retire ;
 * - contrôle d'aller-retour : point du dessin et écart nul ;
 * - Info entité : position projetée de l'objet ; Repères : choix d'export « projetées » grisé puis offert ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-point-de-base node apps/web/e2e/planche-point-de-base.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-point-de-base";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `point-de-base-${Date.now()}@example.com`, "planche-point-de-base-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);
const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());

// Extension « Emplacement » activée (désactivée par défaut), comme dans sandbox-module.mjs.
await page.locator("[data-planche-menu-ouvrir]").click();
await page.locator('[data-planche-menu-item="extensions"]').click();
await page.locator('[data-planche-extensions] [data-planche-extension-interrupteur="emplacement"]').click();
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");

// Un objet à l'origine, groupé : sa position projetée est lue dans Info entité.
const vue = page.locator("[data-planche-vue] canvas");
const boite = await vue.boundingBox();
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("r");
await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2, { steps: 4 });
await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
await page.mouse.move(boite.x + boite.width / 2 + 60, boite.y + boite.height / 2 + 30, { steps: 4 });
await page.keyboard.type("3;2");
await page.keyboard.press("Enter");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length > 0);
await page.keyboard.press("Space");
await page.keyboard.press("Control+a");
await page.keyboard.press("Control+g");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 1);

// --- Raccourci et section ----------------------------------------------------------------------------------------------
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("Control+Shift+B");
const section = page.locator("[data-planche-point-de-base]");
await section.waitFor();
check("Ctrl+Maj+B ouvre le panneau Emplacement sur le point de base", (await page.evaluate(() => window.fadiPlanche.panneau())) === "emplacement");
// Le focus est donné après le rendu de la section (effet) : on l'attend, borné, plutôt que de le lire à l'instant.
const focusE = await page.waitForFunction(() => document.activeElement?.getAttribute("data-planche-point-de-base-champ") === "e", null, { timeout: 3000 }).then(() => true, () => false);
check("le champ E reçoit le focus", focusE);
check("sans point de base : la section le dit", (await section.getAttribute("data-planche-point-de-base")) === "absent" && (await section.locator("[data-planche-point-de-base-absent]").count()) === 1);
check("H non évaluée sans niveau de référence", (await section.locator("[data-planche-point-de-base-h]").getAttribute("data-planche-point-de-base-h")) === "non-evaluee");
check("la commande a sa place dans la barre du panneau", (await page.locator("[data-planche-commande='point-de-base']").count()) === 1);

// --- Saisie refusée, puis enregistrement en un pas ----------------------------------------------------------------------
const champ = (c) => section.locator(`[data-planche-point-de-base-champ='${c}']`);
await champ("e").fill("652 410,250");
await champ("n").fill("6 862 175,800");
await champ("systeme").fill("");
await section.locator("[data-planche-point-de-base-enregistrer]").click();
check("système horizontal manquant : refus nommé, rien d'enregistré", (await section.locator("[data-planche-point-de-base-erreur='systeme']").count()) === 1 && !(await modele()).annotations?.reglages?.pointDeBase);
const pasAvant = await pas();
await champ("systeme").fill("EPSG:2154");
await champ("systemeVertical").fill("NGF-IGN69");
await champ("rotation").fill("0");
await champ("rotation").press("Enter");
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pasAvant);
const pb = (await modele()).annotations?.reglages?.pointDeBase;
check("point de base enregistré en un pas", pb && pb.e === 652410.25 && pb.n === 6862175.8 && pb.systeme === "EPSG:2154" && pb.systemeVertical === "NGF-IGN69" && pb.rotation === 0, JSON.stringify(pb));

// --- Contrôle d'aller-retour : non évalué sans référence, puis exact ------------------------------------------------------
const controle = (c) => section.locator(`[data-planche-point-de-base-controle='${c}']`);
await controle("e").fill("652 415,250");
await controle("n").fill("6 862 180,800");
await controle("h").fill("376,20");
check("contrôle non évalué sans niveau de référence", (await section.locator("[data-planche-point-de-base-resultat]").getAttribute("data-planche-point-de-base-resultat")) === "non-evalue");

// Niveau de référence déclaré dans le panneau Niveaux (étape 1) : H et le contrôle s'en servent.
await page.locator("[data-planche-panneau-icone='niveaux']").click();
await page.locator("[data-planche-niveaux-reference]").fill("375,20");
await page.locator("[data-planche-niveaux-reference]").press("Enter");
await page.waitForTimeout(300);
await page.locator("[data-planche-panneau-icone='emplacement']").click();
await section.waitFor();
check("H = niveau de référence", (await section.locator("[data-planche-point-de-base-h]").getAttribute("data-planche-point-de-base-h")) === "375.2");
await controle("e").fill("652 415,250");
await controle("n").fill("6 862 180,800");
await controle("h").fill("376,20");
const ecart = Number(await section.locator("[data-planche-point-de-base-resultat]").getAttribute("data-planche-point-de-base-resultat"));
const texteControle = await section.locator("[data-planche-point-de-base-resultat]").textContent();
check("contrôle d'aller-retour : x 5, y 5, z 1, écart nul", Number.isFinite(ecart) && ecart < 0.001 && /x 5,000.*y 5,000.*z 1,000/.test(texteControle ?? ""), texteControle ?? "");
await section.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/1-point-de-base.png` });

// --- Info entité : position projetée de l'objet --------------------------------------------------------------------------
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("Control+a");
await page.locator("[data-planche-panneau-icone='info-entite']").click();
const position = page.locator("[data-planche-info-position]");
await position.waitFor();
const occ = Object.values((await modele()).racine.occurrences)[0];
const textePosition = (await position.textContent())?.trim() ?? "";
const enTexte = (v) => v.toFixed(3).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
const attenduE = `E ${enTexte(652410.25 + occ.transformation[3])}`;
const attenduN = `N ${enTexte(6862175.8 + occ.transformation[7])}`;
const attenduH = `H ${(375.2 + occ.transformation[11]).toFixed(2).replace(".", ",")}`;
check("Info entité : position projetée E, N, H de l'objet", (await position.getAttribute("data-planche-info-position")) === "projetee" && textePosition.includes(attenduE) && textePosition.includes(attenduN) && textePosition.includes(attenduH), `${textePosition} / ${attenduE} ${attenduN} ${attenduH}`);
await page.screenshot({ path: `${OUT}/2-info-entite.png` });

// --- Export « projetées » offert dans Repères ; Annuler retire le point de base ------------------------------------------
await page.locator("[data-planche-panneau='info-entite'] .canevas-fermer").evaluate((b) => b.click());
await page.locator("[data-planche-panneau-icone='reperes']").click();
const choix = page.locator("[data-reperes-exports='projete']");
await choix.waitFor();
check("Repères : le choix d'export « projetées » est offert", !(await choix.isDisabled()));
const pasPoint = await pas();
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((k) => window.fadiPlanche.pas() === k - 1, pasPoint);
check("Annuler retire le point de base", !(await modele()).annotations?.reglages?.pointDeBase);
check("Repères : sans point de base, le choix « projetées » est grisé avec son motif", await choix.isDisabled());

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette du point de base : tous les contrôles passent.");
