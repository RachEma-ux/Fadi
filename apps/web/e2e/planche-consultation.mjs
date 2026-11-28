/**
 * Recette des liens de consultation (cas 4, étape 7d : D11-F18-018 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7d) :
 * - Fichier ▸ Partager un lien ouvre le panneau (en-tête : icône et raccourci Ctrl+Alt+7) ; « Créer le lien »
 *   (Ctrl+Alt+Maj+9) fige la Planche sans la modifier ; Copier (Ctrl+Alt+9) donne l'adresse ;
 * - téléphone, sans compte : nom et version datée visibles, lecture seule, Orbiter / Mesurer / Cadrer ; deux points
 *   accrochés donnent la longueur, « ≈ » quand elle est arrondie ; un lien sans mesure grise « Mesurer » ;
 * - Révoquer (Ctrl+Alt+8) : le lien répond « lien indisponible » ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-consultation node apps/web/e2e/planche-consultation.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-consultation";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `consultation-${Date.now()}@example.com`, "planche-consultation-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const ecran = async (p) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((q) => window.fadiPlanche.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};

// Boîte 4 × 3 × 2 m.
await vue.focus();
await page.keyboard.press("r");
const cadre = await page.locator("[data-planche-vue] canvas").boundingBox();
await page.mouse.move(cadre.x + cadre.width * 0.35, cadre.y + cadre.height * 0.55, { steps: 4 });
await page.mouse.click(cadre.x + cadre.width * 0.35, cadre.y + cadre.height * 0.55);
await page.mouse.move(cadre.x + cadre.width * 0.35 + 60, cadre.y + cadre.height * 0.55 + 30, { steps: 4 });
await saisir("4;3");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 1);
const sommets = Object.values((await modele()).racine.sommets).map((v) => v.position);
const xMin = Math.min(...sommets.map((p) => p.x));
const xMax = Math.max(...sommets.map((p) => p.x));
const yMin = Math.min(...sommets.map((p) => p.y));
const yMax = Math.max(...sommets.map((p) => p.y));
await page.keyboard.press("p");
const c = await ecran({ x: (xMin + xMax) / 2, y: (yMin + yMax) / 2, z: 0 });
await page.mouse.move(c.x, c.y, { steps: 4 });
await page.mouse.click(c.x, c.y);
await saisir("2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 6);
await page.keyboard.press("Space");
await page.keyboard.press("Escape");

// --- Fichier ▸ Partager un lien -----------------------------------------------------------------------------------------
await page.locator("[data-planche-menu-ouvrir]").click();
await page.locator("[data-planche-menu-item='partager-lien']").click();
const panneau = page.locator("[data-planche-consultations]");
await panneau.waitFor();
check("Fichier ▸ Partager un lien ouvre le panneau", (await page.evaluate(() => window.fadiPlanche.panneau())) === "consultations");
check("en-tête : icône et raccourci Ctrl+Alt+7", ((await page.locator("[data-planche-panneau='consultations'] [data-planche-panneau-raccourci]").textContent()) ?? "").includes("Ctrl+Alt+7") && (await page.locator("[data-planche-panneau='consultations'] .canevas-panneau-tete h3 svg").count()) === 1);
await page.waitForSelector("[data-planche-consultations-vide]");
const pas0 = await pas();
const m0 = JSON.stringify(await modele());
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+Digit9");
await page.waitForSelector("[data-planche-consultation][data-etat='actif']");
check("Ctrl+Alt+Maj+9 crée un lien ; la Planche n'est pas modifiée", (await pas()) === pas0 && JSON.stringify(await modele()) === m0);
const jeton = await page.locator("[data-planche-consultation]").first().getAttribute("data-planche-consultation");
check("jeton aléatoire de 32 caractères", /^[A-Za-z0-9_-]{32}$/.test(jeton ?? ""), jeton ?? "");
await vue.focus();
await page.keyboard.press("Control+Alt+Digit9");
const adresse = `${BASE}/consultation/${jeton}`;
// La note « Lien créé » est déjà affichée : attendre celle de la copie, pas seulement une note.
await page.waitForFunction((a) => (document.querySelector("[data-planche-consultations-note]")?.textContent ?? "").includes(a), adresse, { timeout: 10000 }).catch(() => {});
const note = (await page.locator("[data-planche-consultations-note]").textContent()) ?? "";
check("Ctrl+Alt+9 copie l'adresse du lien", note.includes(adresse), note);
await page.screenshot({ path: `${OUT}/consultation-panneau.png` });

// --- Téléphone, sans compte ---------------------------------------------------------------------------------------------
const tel = await browser.newContext({ ...devices["iPhone 13"], locale: "fr-CH" });
const p2 = await tel.newPage();
p2.on("pageerror", (e) => erreurs.push(`téléphone : ${e.message}`));
await p2.goto(adresse);
await p2.waitForSelector("[data-consultation='pret']", { timeout: 60000 });
await p2.waitForFunction(() => !!window.fadiConsultation);
await p2.waitForTimeout(400);
check("sans compte : nom et version datée « lecture seule »", ((await p2.locator("[data-consultation-nom]").textContent()) ?? "").length > 0 && /Version du .*lecture seule/.test((await p2.locator("[data-consultation-version]").textContent()) ?? ""));
check("barre Orbiter / Mesurer / Cadrer ; aucune commande d'édition", (await p2.locator("[data-consultation-mode]").count()) === 2 && (await p2.locator("[data-consultation-cadrer]").count()) === 1 && (await p2.locator("[data-planche-commande], [data-planche-outil]").count()) === 0);
await p2.locator("[data-consultation-mode='mesurer']").tap();
const surTel = async (p) => {
  const b = await p2.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await p2.evaluate((q) => window.fadiConsultation.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};
for (const p of [{ x: xMin, y: yMin, z: 2 }, { x: xMax, y: yMax, z: 0 }]) {
  const e = await surTel(p);
  await p2.mouse.move(e.x, e.y);
  await p2.mouse.click(e.x, e.y);
  await p2.waitForTimeout(200);
}
await p2.waitForSelector("[data-consultation-longueur]");
const longueur = (await p2.locator("[data-consultation-longueur]").textContent()) ?? "";
check("deux points accrochés : diagonale √29 m, « ≈ » car arrondie", longueur === "≈ 5,39 m", longueur);
await p2.screenshot({ path: `${OUT}/consultation-telephone.png` });

// --- Lien sans mesure -------------------------------------------------------------------------------------------------
await page.locator("[data-planche-consultation-champ='mesure']").selectOption("non");
await page.locator("[data-planche-commande='creer-lien']").click();
await page.waitForFunction(() => document.querySelectorAll("[data-planche-consultation]").length === 2);
const jeton2 = await page.locator("[data-planche-consultation]").first().getAttribute("data-planche-consultation");
await p2.goto(`${BASE}/consultation/${jeton2}`);
await p2.waitForSelector("[data-consultation='pret']");
check("lien sans mesure : « Mesurer » grisé", await p2.locator("[data-consultation-mode='mesurer']").isDisabled());

// --- Révoquer -----------------------------------------------------------------------------------------------------------
await page.locator(`[data-planche-consultation='${jeton}'] button`).first().click();
await vue.focus();
await page.keyboard.press("Control+Alt+Digit8");
await page.waitForSelector(`[data-planche-consultation='${jeton}'][data-etat='revoque']`);
check("Ctrl+Alt+8 révoque : « Révoqué » dans la liste", ((await page.locator(`[data-planche-consultation='${jeton}']`).textContent()) ?? "").includes("Révoqué"));
await p2.goto(adresse);
await p2.waitForSelector("[data-consultation='indisponible']");
check("lien révoqué : « Lien indisponible »", ((await p2.locator("h1").textContent()) ?? "").includes("Lien indisponible"));

// --- Ouverture au clavier ------------------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau='consultations'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("Control+Alt+Digit7");
await panneau.waitFor();
check("Ctrl+Alt+7 ouvre le panneau ; pas de bouton dans la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "consultations" && (await page.locator("[data-planche-panneau-icone='consultations']").count()) === 0);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette des liens de consultation : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette des liens de consultation : tous les contrôles passent.");
