/**
 * Recette « Locaux » de la Planche (cas 4 du catalogue des extensions, étape 3 : D9-F10-016 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-3-locaux.png`) :
 * - sans face choisie, « Créer un local » est grisé avec son motif ;
 * - une face de sol choisie, Ctrl+Maj+D crée le local (un pas) : surface, périmètre, numéro proposé, étiquette en plan ;
 * - nom, usage et hauteur déclarée modifiés dans le formulaire : volume calculé ;
 * - une paroi déplacée de 0,20 m : la surface suit exactement ; effacer la face : « contour ouvert », hors du total ;
 * - Annuler revient en arrière ; aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-locaux node apps/web/e2e/planche-locaux.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-locaux";
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
await inscrireDansLaPage(page, `locaux-${Date.now()}@example.com`, "planche-locaux-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
// versEcran rend des coordonnées relatives au canevas.
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
const vue = page.locator("[data-planche-vue]");
const panneau = page.locator("[data-planche-locaux]");

// Sol de 4 × 3 m à l'origine.
await vue.focus();
await page.keyboard.press("r");
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
const cx = boite.x + boite.width * 0.35;
const cy = boite.y + boite.height * 0.55;
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.click(cx, cy);
await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
await page.keyboard.type("4;3");
await page.keyboard.press("Enter");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 1);
await page.keyboard.press("Space");
// Le premier coin peut s'accrocher ailleurs que sur l'origine : on relit le sol tracé.
const sommets = Object.values((await modele()).racine.sommets).map((v) => v.position);
const xMin = Math.min(...sommets.map((p) => p.x));
const xMax = Math.max(...sommets.map((p) => p.x));
const yMin = Math.min(...sommets.map((p) => p.y));
const yMax = Math.max(...sommets.map((p) => p.y));
const centre = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2, z: 0 };
check("sol tracé de 4 × 3 m", Math.abs(xMax - xMin - 4) < 1e-9 && Math.abs(yMax - yMin - 3) < 1e-9, JSON.stringify({ xMin, xMax, yMin, yMax }));

// --- Panneau et motif sans face choisie ------------------------------------------------------------------------------
await page.locator("[data-planche-panneau-icone='locaux']").click();
await panneau.waitFor();
check("panneau Locaux ouvert depuis la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "locaux");
check("sans local : le panneau le dit", (await panneau.locator("[data-planche-locaux-vide]").count()) === 1);
check("sans face choisie : « Créer un local » grisé avec son motif", (await panneau.locator("[data-planche-commande='creer-local']").isDisabled()) && ((await panneau.locator("[data-planche-commande='creer-local']").getAttribute("title")) ?? "").includes("Choisissez une seule face de sol"));

// --- Face choisie, Ctrl+Maj+D ---------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau='locaux'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
// Tout sélectionner : la face de sol est la seule face (ses arêtes ne comptent pas).
await page.keyboard.press("Control+a");
const face = Object.keys((await modele()).racine.faces)[0];
check("la face de sol est choisie", JSON.stringify(await page.evaluate(() => window.fadiPlanche.selection())).includes(face));
const pas0 = await pas();
await page.keyboard.press("Control+Shift+D");
await panneau.waitFor();
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
let m = await modele();
const local = Object.values(m.annotations?.locaux ?? {})[0];
check("Ctrl+Maj+D crée le local sur la face, en un pas, numéro « 1 »", local && local.face === face && local.numero === "1", JSON.stringify(local));
const ligne = panneau.locator(`[data-planche-local='${local?.id}']`);
check("surface calculée : 12,00 m², périmètre 14,00 m", Math.abs(Number(await ligne.locator("[data-planche-local-surface]").getAttribute("data-planche-local-surface")) - 12) < 1e-9 && (await ligne.textContent())?.includes("14,00 m"), (await ligne.textContent()) ?? "");
check("hauteur sous plafond non évaluée sans plafond ni déclaration", (await ligne.locator("[data-planche-local-hauteur]").getAttribute("data-planche-local-hauteur")) === "non-evaluee");
check("étiquette liée posée en plan", await page.locator(".planche-etiquette-local").first().textContent().then((t) => (t ?? "").includes("12,00 m²")));

// --- Formulaire : nom, usage, hauteur déclarée -----------------------------------------------------------------------
const champ = (c) => panneau.locator(`[data-planche-local-champ='${c}']`);
await champ("numero").fill("101");
await champ("nom").fill("Séjour");
await champ("usage").fill("Séjour");
await champ("hauteur").fill("2,50");
await champ("hauteur").press("Enter");
await page.waitForFunction((id) => window.fadiPlanche.modele().annotations.locaux[id].numero === "101", local.id);
check("formulaire : numéro, nom, usage et hauteur déclarée enregistrés ; volume 30,00 m³", (await ligne.textContent())?.includes("30,00 m³") && (await ligne.locator("[data-planche-local-hauteur]").getAttribute("data-planche-local-hauteur")) === "declaree", (await ligne.textContent()) ?? "");
await page.screenshot({ path: `${OUT}/1-locaux.png` });
check("« Supprimer le local » : commande avec icône et raccourci (Ctrl+Maj+F3)", ((await panneau.locator("[data-planche-commande='supprimer-local']").getAttribute("title")) ?? "").includes("Ctrl+Maj+F3") && (await panneau.locator("[data-planche-commande='supprimer-local'] svg").count()) === 1 && !(await panneau.locator("[data-planche-commande='supprimer-local']").isDisabled()));

// --- Paroi déplacée de 0,20 m : la surface suit -----------------------------------------------------------------------
await page.locator("[data-planche-panneau='locaux'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("Escape");
await page.keyboard.press("m");
await cliquer({ x: xMax, y: centre.y, z: 0 });
await page.keyboard.press("ArrowRight");
await page.keyboard.type("0,2");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Space");
await page.locator("[data-planche-panneau-icone='locaux']").click();
await panneau.waitFor();
const surface = Number(await ligne.locator("[data-planche-local-surface]").getAttribute("data-planche-local-surface"));
check("paroi déplacée de 0,20 m : surface 12,60 m² exactement", Math.abs(surface - 12.6) < 1e-9, String(surface));

// --- Face effacée : contour ouvert, hors du total ; Annuler la rend ----------------------------------------------------
await page.locator("[data-planche-panneau='locaux'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("Control+a");
await page.keyboard.press("Delete");
await page.waitForFunction((f) => !window.fadiPlanche.modele().racine.faces[f], face);
await page.locator("[data-planche-panneau-icone='locaux']").click();
await panneau.waitFor();
check("face effacée : « contour ouvert », jamais une surface fausse", (await ligne.getAttribute("data-planche-local-etat")) === "contour-ouvert" && (await ligne.locator("[data-planche-local-surface]").count()) === 0);
check("total : 0,00 m² (0 local évalué sur 1)", Number(await panneau.locator("[data-planche-locaux-total]").getAttribute("data-planche-locaux-total")) === 0 && ((await panneau.textContent()) ?? "").includes("0 locaux évalués sur 1"));
await page.screenshot({ path: `${OUT}/2-contour-ouvert.png` });
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((f) => !!window.fadiPlanche.modele().racine.faces[f], face);
check("Annuler rend la face et la surface du local", Math.abs(Number(await ligne.locator("[data-planche-local-surface]").getAttribute("data-planche-local-surface")) - 12.6) < 1e-9);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette des locaux : tous les contrôles passent.");
