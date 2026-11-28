/**
 * Recette « Feuilles » de la Planche (cas 4 du catalogue des extensions, étape 6 : D7-F11-013, D7-F11-012, D7-F11-011 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-6-feuilles-pdf.png`) :
 * - ouverte depuis le panneau Plan vectoriel et par Ctrl+Alt+Maj+1, hors de la colonne ; en-tête avec son raccourci ;
 * - nouvelle feuille A3 paysage (Ctrl+Alt+Maj+2), fenêtre de vue de dessus à 1:50 (80 × 60 mm pour 4 × 3 m), 1:100 ;
 * - fenêtre hors du cadre signalée ; cartouche saisi ; état dans le pied ;
 * - PDF vectoriel de la feuille relu (A3 exact), jeu de deux feuilles (A3 + A4 portrait) en un PDF de deux pages ;
 * - fenêtre choisie sur l'aperçu puis supprimée (Ctrl+Alt+Maj+5), Annuler ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-feuilles node apps/web/e2e/planche-feuilles.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-feuilles";
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
await inscrireDansLaPage(page, `feuilles-${Date.now()}@example.com`, "planche-feuilles-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
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
const vue = page.locator("[data-planche-vue]");
// Sol de 4 × 3 m, boîte de 2 m.
await vue.focus();
await page.keyboard.press("r");
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
await page.mouse.move(boite.x + boite.width * 0.35, boite.y + boite.height * 0.55, { steps: 4 });
await page.mouse.click(boite.x + boite.width * 0.35, boite.y + boite.height * 0.55);
await page.mouse.move(boite.x + boite.width * 0.35 + 60, boite.y + boite.height * 0.55 + 30, { steps: 4 });
await saisir("4;3");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 1);
const sommets = Object.values((await modele()).racine.sommets).map((v) => v.position);
const xMin = Math.min(...sommets.map((p) => p.x));
const xMax = Math.max(...sommets.map((p) => p.x));
const yMin = Math.min(...sommets.map((p) => p.y));
const yMax = Math.max(...sommets.map((p) => p.y));
const centre = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 };
await page.keyboard.press("p");
await cliquer({ ...centre, z: 0 });
await saisir("2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 6);
// Plan de coupe posé sur le dessus (z = 2), puis le dessus monté à 3 m : le plan coupe la boîte à mi-hauteur.
await page.keyboard.press("Shift+K");
await cliquer({ ...centre, z: 2 });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.plansDeCoupe ?? {}).length === 1);
await page.keyboard.press("Escape");
await page.keyboard.press("p");
await cliquer({ ...centre, z: 2 });
await saisir("1");
await page.keyboard.press("Space");
const zMax = Math.max(...Object.values((await modele()).racine.sommets).map((v) => v.position.z));
check("boîte 4 × 3 × 3 m coupée par un plan à 2 m", Math.abs(zMax - 3) < 1e-9 && Object.values((await modele()).annotations.plansDeCoupe)[0].actif === true, String(zMax));


// --- Ouverture depuis Plan vectoriel ------------------------------------------------------------------------------------
const panneau = page.locator("[data-planche-feuilles]");
const commande = (id) => page.locator(`[data-planche-panneau='feuilles'] [data-planche-commande='${id}']`);
await vue.focus();
await page.keyboard.press("Control+F7");
await page.locator("[data-planche-plan] [data-planche-commande='feuilles']").click();
await panneau.waitFor();
check("ouvert depuis le panneau Plan vectoriel ; pas de bouton dans la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "feuilles" && (await page.locator("[data-planche-panneau-icone='feuilles']").count()) === 0);
check("en-tête : icône et raccourci Ctrl+Alt+Maj+1", ((await page.locator("[data-planche-panneau='feuilles'] [data-planche-panneau-raccourci]").textContent()) ?? "").includes("Ctrl+Alt+Maj+1") && (await page.locator("[data-planche-panneau='feuilles'] .canevas-panneau-tete h3 svg").count()) === 1);
check("sans feuille : le panneau le dit ; exporter grisé avec son motif", (await panneau.locator("[data-planche-feuilles-vide]").count()) === 1 && (await commande("exporter-feuille-pdf").isDisabled()) && ((await commande("exporter-feuille-pdf").getAttribute("title")) ?? "").includes("Choisissez d'abord une feuille"));
await page.locator("[data-planche-panneau='feuilles'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+Digit1");
await panneau.waitFor();
check("Ctrl+Alt+Maj+1 ouvre les feuilles", (await page.evaluate(() => window.fadiPlanche.panneau())) === "feuilles");

// --- Feuille et fenêtre de vue ---------------------------------------------------------------------------------------------
let pas0 = await pas();
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+Digit2");
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
const feuilles = async () => Object.values((await modele()).annotations.feuilles ?? {});
const f1 = (await feuilles())[0];
check("Ctrl+Alt+Maj+2 : feuille A3 paysage, en un pas", f1 && f1.format === 3 && f1.sens === "paysage" && f1.fenetres.length === 0, JSON.stringify(f1));
await commande("ajouter-fenetre").click();
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.feuilles)[0].fenetres.length === 1);
await page.waitForSelector("[data-planche-fenetre-taille]");
check("fenêtre de vue de dessus à 1:50 : 80 × 60 mm pour 4 × 3 m", (await panneau.locator("[data-planche-fenetre-taille]").getAttribute("data-planche-fenetre-taille")) === "80x60");
await panneau.locator("[data-planche-fenetre-champ='echelle']").selectOption("100");
await page.waitForFunction(() => document.querySelector("[data-planche-fenetre-taille]")?.getAttribute("data-planche-fenetre-taille") === "40x30");
check("échelle 1:100 : 40 × 30 mm", true);
await panneau.locator("[data-planche-fenetre-champ='position']").fill("380 ; 30");
await panneau.locator("[data-planche-fenetre-champ='position']").press("Enter");
await page.waitForSelector("[data-planche-fenetre-depasse]");
check("fenêtre hors du cadre : signalée", true);
await panneau.locator("[data-planche-fenetre-champ='position']").fill("40 ; 30");
await panneau.locator("[data-planche-fenetre-champ='position']").press("Enter");
await page.waitForFunction(() => !document.querySelector("[data-planche-fenetre-depasse]"));
for (const [c, v] of [["numero", "A101"], ["nom", "Plan RDC"], ["indice", "B"], ["projet", "Maison Essai"]]) {
  await panneau.locator(`[data-planche-feuille-champ='${c}']`).fill(v);
  await panneau.locator(`[data-planche-feuille-champ='${c}']`).press("Enter");
}
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.feuilles)[0].cartouche.projet === "Maison Essai");
check("cartouche saisi ; pied « Feuille A101 · A3 paysage · 1 fenêtre(s) de vue (1:100) »", ((await page.locator("[data-planche-feuilles-etat]").textContent()) ?? "").includes("Feuille A101 · A3 paysage · 1 fenêtre(s) de vue (1:100)"), (await page.locator("[data-planche-feuilles-etat]").textContent()) ?? "");
const svg = decodeURIComponent((await panneau.locator("[data-planche-feuille-apercu]").getAttribute("src")) ?? "");
check("aperçu : feuille 420 × 297 mm, cartouche avec le projet, fenêtre choisie encadrée", svg.includes('width="420mm" height="297mm"') && svg.includes("Maison Essai") && svg.includes("rgb(26,95,214)"));
await panneau.screenshot({ path: `${OUT}/1-feuilles.png` });

// --- PDF de la feuille -------------------------------------------------------------------------------------------------------
const telecharger = async (action) => {
  const [d] = await Promise.all([page.waitForEvent("download"), action()]);
  return { nom: d.suggestedFilename(), texte: readFileSync(await d.path(), "latin1") };
};
let pdf = await telecharger(() => commande("exporter-feuille-pdf").click());
check("PDF de la feuille : nommé selon le motif, A3 exact (1190,55 × 841,89 pt), vectoriel", pdf.nom === "A101-Plan_RDC-B.pdf" && pdf.texte.startsWith("%PDF-1.4") && pdf.texte.includes("/MediaBox [0 0 1190.5512 841.8898]") && pdf.texte.includes("/Count 1"), pdf.nom);
check("PDF relu avant téléchargement : la note le dit", ((await panneau.locator("[data-planche-feuilles-note]").textContent()) ?? "").includes("420 × 297 mm"));

// --- Jeu de deux feuilles -------------------------------------------------------------------------------------------------------
pas0 = await pas();
await commande("nouvelle-feuille").click();
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
await panneau.locator("[data-planche-feuille-champ='format']").selectOption("4");
await panneau.locator("[data-planche-feuille-champ='sens']").selectOption("portrait");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.feuilles).some((f) => f.format === 4 && f.sens === "portrait"));
pdf = await telecharger(async () => { await vue.focus(); await page.keyboard.press("Control+Alt+Shift+Digit7"); });
check("Ctrl+Alt+Maj+7 : jeu coché en un PDF de deux pages (A3, A4 portrait)", pdf.texte.includes("/Count 2") && pdf.texte.includes("/MediaBox [0 0 595.2756 841.8898]"), pdf.nom);

// --- Choisir la fenêtre sur l'aperçu, la supprimer, Annuler -------------------------------------------------------------------
await panneau.locator(`[data-planche-feuille='${f1.id}'] button`).click();
const img = panneau.locator("[data-planche-feuille-apercu]");
const b = await img.boundingBox();
await page.mouse.click(b.x + ((40 + 20) / 420) * b.width, b.y + ((30 + 15) / 297) * b.height);
await page.waitForSelector("[data-planche-fenetre='v1']");
pas0 = await pas();
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+Digit5");
await page.waitForFunction((id) => window.fadiPlanche.modele().annotations.feuilles[id].fenetres.length === 0, f1.id);
check("fenêtre choisie sur l'aperçu, supprimée par Ctrl+Alt+Maj+5 en un pas", (await pas()) === pas0 + 1);
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((id) => window.fadiPlanche.modele().annotations.feuilles[id].fenetres.length === 1, f1.id);
check("Annuler rend la fenêtre", true);

// --- Règle d'or -------------------------------------------------------------------------------------------------------------------
const attendus = { "nouvelle-feuille": "Ctrl+Alt+Maj+2", "supprimer-feuille": "Ctrl+Alt+Maj+3", "ajouter-fenetre": "Ctrl+Alt+Maj+4", "supprimer-fenetre": "Ctrl+Alt+Maj+5", "exporter-feuille-pdf": "Ctrl+Alt+Maj+6", "exporter-jeu-pdf": "Ctrl+Alt+Maj+7" };
let regle = true;
for (const [id, r] of Object.entries(attendus)) regle &&= ((await commande(id).getAttribute("title")) ?? "").includes(r) && (await commande(id).locator("svg").count()) === 1;
check("chaque commande du panneau : icône et raccourci", regle);
await page.screenshot({ path: `${OUT}/2-planche.png` });

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette des feuilles : tous les contrôles passent.");
