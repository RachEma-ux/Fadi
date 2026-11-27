/**
 * Recette « Niveaux d'étage » de la Planche (cas 4 du catalogue des extensions, étape 1 : D4-F5-001, D4-F5-054 ;
 * maquette validée le 27 novembre 2026) :
 * - panneau « Niveaux » dans la colonne de droite ; premier niveau saisi, « Ajouter un niveau » propose l'étage suivant ;
 * - altitude NGF « non évaluée » sans niveau de référence, calculée dès qu'il est saisi ;
 * - « Travailler sur ce niveau » pose le plan de travail à l'altitude du niveau ; un objet créé ensuite lui est rattaché ;
 * - changer l'altitude du niveau déplace ses objets en un seul pas d'annulation, Annuler les remet ;
 * - Info entité montre le niveau de l'objet et son altitude ; aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-niveaux node apps/web/e2e/planche-niveaux.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-niveaux";
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
await inscrireDansLaPage(page, `niveaux-${Date.now()}@example.com`, "planche-niveaux-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const panneau = page.locator("[data-planche-niveaux]");
const lignes = panneau.locator("[data-planche-niveau]");

// --- Panneau et premier niveau ---------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau-icone='niveaux']").click();
await panneau.waitFor();
check("panneau Niveaux ouvert depuis la colonne de droite", (await page.evaluate(() => window.fadiPlanche.panneau())) === "niveaux");
check("sans niveau : le panneau le dit", (await panneau.locator("[data-planche-niveaux-vide]").count()) === 1);
await panneau.locator("[data-planche-niveau-champ='nom']").fill("RDC");
await panneau.locator("[data-planche-niveau-champ='altitude']").fill("0");
await panneau.locator("[data-planche-niveau-champ='hauteur']").fill("2,85");
await panneau.locator("[data-planche-commande='ajouter-niveau']").click();
await lignes.first().waitFor();
await panneau.locator("[data-planche-commande='ajouter-niveau']").click();
await page.waitForFunction(() => document.querySelectorAll("[data-planche-niveau]").length === 2);
const noms = await lignes.locator("td:first-child").allTextContents();
check("« Ajouter un niveau » propose l'étage suivant : R+1 au-dessus du RDC", JSON.stringify(noms.map((n) => n.trim())) === JSON.stringify(["R+1", "RDC"]), noms.join(" | "));
const niveaux = Object.values((await modele()).annotations?.niveaux ?? {});
const r1 = niveaux.find((n) => n.nom === "R+1");
check("R+1 enregistré à +2,85 m, hauteur 2,85 m", r1 && Math.abs(r1.altitude - 2.85) < 1e-9 && Math.abs(r1.hauteur - 2.85) < 1e-9, JSON.stringify(niveaux));
check("altitude NGF non évaluée sans niveau de référence", (await lignes.first().locator("[data-planche-niveau-ngf]").getAttribute("data-planche-niveau-ngf")) === "non-evaluee");

// --- Niveau de référence → altitude NGF -----------------------------------------------------------------------------
await panneau.locator("[data-planche-niveaux-reference]").fill("375,20");
await panneau.locator("[data-planche-niveaux-reference]").press("Enter");
await page.waitForFunction(() => document.querySelector("[data-planche-niveau] [data-planche-niveau-ngf]")?.getAttribute("data-planche-niveau-ngf") !== "non-evaluee");
const ngf = await lignes.first().locator("[data-planche-niveau-ngf]").textContent();
check("altitude NGF de R+1 = 375,20 + 2,85", ngf?.trim() === "378,05 m", ngf ?? "");

// --- Niveau de travail : plan de travail et rattachement des objets créés ------------------------------------------
await lignes.first().click();
await panneau.locator("[data-planche-commande='travailler-niveau']").click();
const ctx = await page.evaluate(() => window.fadiPlanche.contexteTravail().contexte);
check("« Travailler sur ce niveau » pose le plan de travail à +2,85 m", ctx.repere && Math.abs(ctx.repere.origine.z - 2.85) < 1e-9 && ctx.plan === "xy", JSON.stringify(ctx.repere?.origine));
check("le niveau de travail est marqué dans la liste", (await panneau.locator("[data-planche-niveau-travail]").count()) === 1);
await page.screenshot({ path: `${OUT}/1-niveaux-travail.png` });

// Rectangle tracé sur le plan de travail, puis groupé : l'objet créé est rattaché au niveau de travail.
const vue = page.locator("[data-planche-vue] canvas");
const boite = await vue.boundingBox();
// Le plan de travail est surélevé : le premier coin est pris au centre de la vue (projeté sur ce plan), la taille tapée.
const cx = boite.x + boite.width / 2;
const cy = boite.y + boite.height / 2;
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("r");
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.click(cx, cy);
await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
await page.keyboard.type("3;2");
await page.keyboard.press("Enter");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length > 0);
await page.keyboard.press("Space");
await page.keyboard.press("Control+a");
await page.keyboard.press("Control+g");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 1);
let m = await modele();
const occ = Object.values(m.racine.occurrences)[0];
check("l'objet créé sur le niveau de travail lui est rattaché", occ.niveau === r1.id, JSON.stringify({ niveau: occ.niveau }));

// --- Changer l'altitude du niveau : ses objets suivent en un pas ; Annuler les remet -----------------------------
const zAvant = occ.transformation[11];
const pasAvant = await pas();
await lignes.first().click();
await panneau.locator("[data-planche-niveau-champ='altitude']").fill("3,10");
await panneau.locator("[data-planche-niveau-champ='altitude']").press("Enter");
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pasAvant);
m = await modele();
const occApres = m.racine.occurrences[occ.id];
check("changer l'altitude du niveau déplace son objet du même écart (+0,25 m), en un pas", Math.abs(occApres.transformation[11] - zAvant - 0.25) < 1e-9 && (await pas()) === pasAvant + 1, `${zAvant} → ${occApres.transformation[11]}`);
await page.screenshot({ path: `${OUT}/2-niveau-modifie.png` });
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((n) => window.fadiPlanche.pas() === n, pasAvant);
m = await modele();
check("Annuler remet le niveau et son objet", Math.abs(m.racine.occurrences[occ.id].transformation[11] - zAvant) < 1e-9 && Math.abs(m.annotations.niveaux[r1.id].altitude - 2.85) < 1e-9);

// --- Info entité : niveau et altitude de l'objet ---------------------------------------------------------------------
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("Control+a");
await page.waitForFunction((id) => JSON.stringify(window.fadiPlanche.selection()).includes(id), occ.id);
await page.locator("[data-planche-panneau-icone='info-entite']").click();
const info = page.locator("[data-planche-info-niveau]");
await info.waitFor();
check("Info entité : l'objet porte R+1", (await info.inputValue()) === r1.id);
const altitudeInfo = await page.locator("[data-planche-info-niveau-altitude]").textContent();
check("Info entité : altitude du niveau et altitude NGF", altitudeInfo?.trim() === "+2,85 m · 378,05 m NGF", altitudeInfo ?? "");
await page.screenshot({ path: `${OUT}/3-info-entite.png` });

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette des niveaux d'étage : tous les contrôles passent.");
