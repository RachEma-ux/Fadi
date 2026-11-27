/**
 * Recette « Murs » de la Planche (cas 4 du catalogue des extensions, étape 4 : D4-F5-003 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-4-murs.png`) :
 * - Ctrl+Maj+M active l'outil Mur : barre d'options (épaisseur, hauteur, référence, Murs depuis les arêtes) ;
 * - une épaisseur invalide est signalée et bloque la pose ;
 * - un tracé en L (longueurs tapées) pose un mur en un pas : épaisseur, hauteur, longueur d'axe, une jonction en L ;
 * - Murs depuis les arêtes : arêtes choisies, grisé sans arête, un mur par chaîne en un pas ;
 * - Annuler revient en arrière ; aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-murs node apps/web/e2e/planche-murs.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-murs";
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
await inscrireDansLaPage(page, `murs-${Date.now()}@example.com`, "planche-murs-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const murs = async () => Object.values((await modele()).annotations?.murs ?? {});
const vue = page.locator("[data-planche-vue]");
const barre = page.locator("[data-planche-mur-barre]");
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
const cx = boite.x + boite.width * 0.4;
const cy = boite.y + boite.height * 0.6;

// --- Outil et barre d'options ----------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+M");
await barre.waitFor();
check("Ctrl+Maj+M active l'outil Mur", (await page.evaluate(() => window.fadiPlanche.outil())) === "mur");
check("barre d'options : nom et raccourci, épaisseur 0,20, hauteur 2,50", ((await barre.textContent()) ?? "").includes("Mur (Ctrl+Maj+M)") && (await barre.locator("[data-planche-mur-champ='epaisseur']").inputValue()) === "0,20" && (await barre.locator("[data-planche-mur-champ='hauteur']").inputValue()) === "2,50", (await barre.textContent()) ?? "");
check("référence : Axe choisi, trois choix", (await barre.locator("[data-planche-option-valeur='reference:axe']").getAttribute("aria-pressed")) === "true" && (await barre.locator("[data-planche-option-valeur^='reference:']").count()) === 3);
check("sans arête choisie : « Murs depuis les arêtes » grisé avec son motif", (await barre.locator("[data-planche-commande='murs-depuis-aretes']").isDisabled()) && ((await barre.locator("[data-planche-commande='murs-depuis-aretes']").getAttribute("title")) ?? "").includes("arêtes horizontales"));

// Épaisseur invalide : signalée, aucune pose.
await barre.locator("[data-planche-mur-champ='epaisseur']").fill("0");
check("épaisseur nulle : signalée", (await barre.locator("[data-planche-mur-erreur]").count()) === 1);
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.click(cx, cy);
check("épaisseur nulle : aucun point posé, motif à la consigne", ((await page.locator("body").textContent()) ?? "").includes("Tapez d'abord une épaisseur et une hauteur positives"));
await barre.locator("[data-planche-mur-champ='epaisseur']").fill("0,20");
await page.waitForFunction(() => !document.querySelector("[data-planche-mur-erreur]"));

// --- Tracé en L : 4 m puis 3 m, Entrée ------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Escape");
const pas0 = await pas();
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.click(cx, cy);
await page.mouse.move(cx + 120, cy, { steps: 6 });
await page.keyboard.press("ArrowRight");
await page.keyboard.type("4");
await page.keyboard.press("Enter");
await page.keyboard.press("ArrowRight");
await page.mouse.move(cx + 120, cy - 120, { steps: 6 });
await page.keyboard.press("ArrowLeft");
await page.keyboard.type("3");
await page.keyboard.press("Enter");
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("Enter");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.murs ?? {}).length === 1);
let [w] = await murs();
const longueur = w.axe.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - w.axe[i].x, p.y - w.axe[i].y), 0);
check("mur posé en un pas : 0,20 × 2,50, axe de 7,00 m, référence axe", (await pas()) === pas0 + 1 && w.epaisseur === 0.2 && w.hauteur === 2.5 && Math.abs(longueur - 7) < 1e-6 && w.reference === "axe", JSON.stringify({ pas: (await pas()) - pas0, axe: w.axe, longueur }));
check("le mur est sélectionné", JSON.stringify(await page.evaluate(() => window.fadiPlanche.selection())).includes(w.occurrence));

await page.screenshot({ path: `${OUT}/1-mur-en-l.png` });
// Info entité : épaisseur, longueur d'axe, une jonction en L.
await page.locator("[data-planche-panneau-icone='info-entite']").click();
const info = page.locator("[data-planche-panneau='info-entite']");
await info.locator("[data-planche-info-mur]").waitFor({ state: "attached" });
check("Info entité : épaisseur 0,20 m, longueur d'axe 7,00 m, jonctions 1 en L", (await info.locator("[data-planche-info-mur-epaisseur]").textContent()) === "0,20 m" && (await info.locator("[data-planche-info-mur-longueur]").textContent()) === "7,00 m" && (await info.locator("[data-planche-info-mur-jonctions]").getAttribute("data-planche-info-mur-jonctions")) === "1/0/0", (await info.textContent()) ?? "");
await info.screenshot({ path: `${OUT}/2-info-entite.png` });
await page.locator("[data-planche-panneau='info-entite'] .canevas-fermer").evaluate((b) => b.click());

// --- Murs depuis les arêtes : un segment tracé à la ligne, choisi, puis la commande ---------------------------------------
await vue.focus();
await page.keyboard.press("l");
const a0 = Object.keys((await modele()).racine.aretes).length;
await page.mouse.move(cx - 200, cy + 150, { steps: 4 });
await page.mouse.click(cx - 200, cy + 150);
await page.mouse.move(cx - 100, cy + 150, { steps: 4 });
await page.keyboard.press("ArrowRight");
await page.keyboard.type("2");
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().racine.aretes).length === n + 1, a0);
await page.keyboard.press("Space");
await page.keyboard.press("Control+a");
await page.keyboard.press("Control+Shift+M");
await barre.waitFor();
const pas1 = await pas();
check("arêtes choisies : « Murs depuis les arêtes » disponible", !(await barre.locator("[data-planche-commande='murs-depuis-aretes']").isDisabled()));
await page.keyboard.press("Control+Shift+H");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.murs ?? {}).length === 2);
const nouveau = (await murs()).find((x) => x.id !== w.id);
check("Ctrl+Maj+H : un mur sur la chaîne d'arêtes, en un pas, note affichée", (await pas()) === pas1 + 1 && Math.abs(Math.hypot(nouveau.axe[1].x - nouveau.axe[0].x, nouveau.axe[1].y - nouveau.axe[0].y) - 2) < 1e-6 && ((await barre.locator("[data-planche-mur-note]").textContent()) ?? "").includes("1 mur(s) posé(s)"), JSON.stringify(nouveau?.axe));
await page.screenshot({ path: `${OUT}/3-murs-depuis-aretes.png` });

// --- Annuler -----------------------------------------------------------------------------------------------------------
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.murs ?? {}).length === 1);
check("Annuler retire le mur posé depuis les arêtes", (await murs()).length === 1);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette des murs : tous les contrôles passent.");
