/**
 * Recette « Accrochage et saisie » de la Planche (cas 2 du catalogue, lot 2 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-2/lot2-1` à `lot2-4`) :
 * - Alt+F8 ouvre le panneau « Accrochage » : sept genres actifs ; Alt+3 force l'intersection pour le prochain point,
 *   le même raccourci l'annule ;
 * - Info modèle : unité centimètres avec un contrôle d'écart nul, retour aux mètres ; paramètre « module » ajouté ;
 * - Mesures : « module*2 » trace une ligne de 1,20 m ;
 * - Mètre : un guide à 0,60 m, « x5 » le répète cinq fois en un pas ; Alt+F9 ouvre « Mètre · Mesure » (mesure décomposée,
 *   « NGF ? » sans altitude déclarée) ;
 * - Info entité d'une arête : longueur saisie 1,50 m ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-accrochage node apps/web/e2e/planche-accrochage-saisie.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-accrochage";
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
await inscrireDansLaPage(page, `accrochage-${Date.now()}@example.com`, "planche-accrochage-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
const cx = boite.x + boite.width * 0.35;
const cy = boite.y + boite.height * 0.6;
const fermer = (id) => page.locator(`[data-planche-panneau='${id}'] .canevas-fermer`).evaluate((b) => b.click());

// --- Panneau « Accrochage » ---------------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Alt+F8");
const acc = page.locator("[data-planche-panneau='accrochage']");
await acc.waitFor();
check("Alt+F8 ouvre « Accrochage » : sept genres actifs, aucun panneau ajouté à la colonne", (await acc.locator("[data-planche-accrochage-genre]").count()) === 7 && (await page.locator("[data-planche-panneau-icone]").count()) === 17);
await vue.focus();
await page.keyboard.press("Alt+3");
await page.waitForFunction(() => document.querySelector("[data-planche-panneau='accrochage'] [data-planche-commande='forcer-intersection']")?.getAttribute("aria-pressed") === "true");
check("Alt+3 : intersection seulement pour le prochain point", true);
await acc.screenshot({ path: `${OUT}/1-accrochage.png` });
await vue.focus();
await page.keyboard.press("Alt+3");
await page.waitForFunction(() => document.querySelector("[data-planche-panneau='accrochage'] [data-planche-commande='forcer-intersection']")?.getAttribute("aria-pressed") !== "true");
check("Alt+3 une seconde fois : annulé", true);
await fermer("accrochage");

// --- Info modèle : unité, paramètre -------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau-icone='info-modele']").click();
const im = page.locator("[data-planche-panneau='info-modele']");
await im.locator("[data-planche-unite]").waitFor();
let pas0 = await pas();
await im.locator("[data-planche-unite]").selectOption("cm");
await page.waitForFunction(() => window.fadiPlanche.modele().annotations?.reglages?.uniteSaisie === "cm");
check("unité centimètres : un pas, contrôle d'écart « 0 sur … valeurs »", (await pas()) === pas0 + 1 && ((await im.locator("[data-planche-unite-controle]").textContent()) ?? "").startsWith("0 sur"), (await im.locator("[data-planche-unite-controle]").textContent()) ?? "");
await im.locator("[data-planche-unite]").selectOption("m");
await page.waitForFunction(() => window.fadiPlanche.modele().annotations?.reglages?.uniteSaisie === "m");
await im.locator("[data-planche-parametre-nom]").fill("module");
await im.locator("[data-planche-parametre-valeur]").fill("0,60");
await im.locator("[data-planche-parametre-ajouter]").click();
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations?.reglages?.parametres ?? {}).some((p) => p.nom === "module" && p.valeur === 0.6));
check("paramètre « module » = 0,60 m ajouté et listé", (await im.locator("[data-planche-parametre='module']").count()) === 1);
check("ressaut : « non évalué » sans valeur saisie", ((await im.locator("[data-planche-ressaut-aide]").textContent()) ?? "").includes("pas évalué"));
await im.screenshot({ path: `${OUT}/2-info-modele.png` });
await fermer("info-modele");

// --- Mesures : expression avec paramètre --------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("l");
const a0 = Object.keys((await modele()).racine.aretes).length;
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.click(cx, cy);
await page.mouse.move(cx + 140, cy, { steps: 6 });
await page.keyboard.press("ArrowRight");
await page.locator("#planche-mesures").fill("module*2");
await page.locator("#planche-mesures").press("Enter");
await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().racine.aretes).length === n + 1, a0);
await vue.focus();
await page.keyboard.press("Escape");
const m1 = await modele();
const arete = Object.values(m1.racine.aretes).find((a) => {
  const p = m1.racine.sommets[a.a].position;
  const q = m1.racine.sommets[a.b].position;
  return Math.abs(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) - 1.2) < 1e-6;
});
check("« module*2 » dans Mesures : une ligne de 1,20 m", !!arete);

// --- Mètre : guide en réseau, panneau Mètre · Mesure --------------------------------------------------------------------
await page.locator("[data-planche-outil='metre']").click();
await vue.focus();
const g0 = Object.keys((await modele()).annotations?.guides ?? {}).length;
const pa = m1.racine.sommets[arete.a].position;
const pb = m1.racine.sommets[arete.b].position;
const milieu = await page.evaluate((p) => window.fadiPlanche.versEcran(p), { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 });
await page.mouse.move(milieu.x, milieu.y, { steps: 4 });
await page.mouse.click(milieu.x, milieu.y);
await page.mouse.move(milieu.x, milieu.y - 80, { steps: 6 });
await page.keyboard.type("0.6");
await page.keyboard.press("Enter");
await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().annotations?.guides ?? {}).length === n + 1, g0);
pas0 = await pas();
await page.locator("#planche-mesures").fill("x5");
await page.locator("#planche-mesures").press("Enter");
await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().annotations?.guides ?? {}).length === n + 6, g0);
check("Mètre : guide à 0,60 m puis « x5 » : six guides, le réseau en un pas", (await pas()) === pas0 + 1);
await vue.focus();
await page.keyboard.press("Alt+F9");
const mm = page.locator("[data-planche-panneau='metre-mesure']");
await mm.waitFor();
check("Alt+F9 : « Mètre · Mesure » décompose la dernière mesure (0,600 m), « NGF ? » sans altitude déclarée", ((await mm.locator("[data-planche-metre-longueur]").textContent()) ?? "") === "0,600 m" && ((await mm.locator("[data-planche-metre-ngf]").textContent()) ?? "") === "NGF ?", (await mm.textContent()) ?? "");
await page.screenshot({ path: `${OUT}/3-metre-mesure.png` });
await fermer("metre-mesure");

// --- Info entité d'une arête : longueur saisie --------------------------------------------------------------------------
await page.locator("[data-planche-outil='selection']").click();
await page.mouse.move(milieu.x, milieu.y, { steps: 4 });
await page.mouse.click(milieu.x, milieu.y);
await page.waitForFunction((id) => window.fadiPlanche.selection().includes(id), Object.entries(m1.racine.aretes).find(([, a]) => a === arete || (a.a === arete.a && a.b === arete.b))[0]);
await page.locator("[data-planche-panneau-icone='info-entite']").click();
const ie = page.locator("[data-planche-panneau='info-entite']");
await ie.locator("[data-planche-arete-longueur]").waitFor();
check("Info entité · Arête : longueur 1,200 m, direction et sommets lisibles", ((await ie.locator("[data-planche-arete-longueur]").inputValue()) ?? "") === "1,200 m" && (await ie.locator("[data-planche-sommet-debut]").count()) === 1);
await ie.locator("[data-planche-arete-longueur]").fill("1,5");
await ie.locator("[data-planche-arete-longueur]").press("Enter");
await page.waitForFunction(([a, b]) => {
  const m = window.fadiPlanche.modele();
  const p = m.racine.sommets[a]?.position;
  const q = m.racine.sommets[b]?.position;
  return p && q && Math.abs(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) - 1.5) < 1e-6;
}, [arete.a, arete.b]);
check("longueur saisie 1,5 : l'arête mesure 1,50 m", true);
await ie.screenshot({ path: `${OUT}/4-info-entite-arete.png` });

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette accrochage et saisie : tous les contrôles passent.");
