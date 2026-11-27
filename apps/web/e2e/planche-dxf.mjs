/**
 * Recette « Feuilles en DXF et statut des travaux » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 5 :
 * D10-F14-005, D10-F14-143, D10-F14-123 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-5-dxf.png`) :
 * - Ctrl+Maj+Espace puis T ouvre « Statut des travaux » ; X, A, J posent le statut sur les objets choisis, en un pas ;
 *   un second appui sur le statut commun le retire ; Annuler ; compte par statut ;
 * - la vue colore les arêtes par statut ; le filtre Existant / Projeté masque ce qui n'appartient pas à l'état ;
 *   les couleurs sont réglables ;
 * - Ctrl+Maj+Espace puis D ouvre « Feuilles en DXF » ; Maj+D exporte un fichier DXF R2000 par feuille cochée (millimètres
 *   papier, calques normalisés, suffixe de statut), puis un fichier par vue en mètres ; une vue vide n'écrit rien ;
 * - chaque commande : icône et raccourci ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-dxf node apps/web/e2e/planche-dxf.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-dxf";
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
await inscrireDansLaPage(page, `dxf-${Date.now()}@example.com`, "planche-dxf-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const focus = () => vue.focus();
const ecran = async (q) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};
const survoler = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  return e;
};
const cliquer = async (q) => {
  const e = await survoler(q);
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(60);
};
const tripleCliquer = async (q) => {
  const e = await survoler(q);
  await page.mouse.click(e.x, e.y, { clickCount: 3 });
  await page.waitForTimeout(80);
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};
const selectionner = async () => {
  await focus();
  await page.keyboard.press(" ");
};
const deuxTemps = async (touche) => {
  await focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(touche);
  await page.waitForTimeout(80);
};
const occurrences = async () => Object.values((await modele()).racine.occurrences);
/** Choisit l'objet sous le point (le panneau ouvert, qui couvre la vue, est d'abord fermé). */
const choisir = async (q, id) => {
  const f = page.locator(".planche-panneau .canevas-fermer");
  if (await f.count()) await f.first().evaluate((b) => b.click());
  await selectionner();
  await page.keyboard.press("Escape");
  await cliquer(q);
  await page.waitForFunction((x) => window.fadiPlanche.selection().includes(x), id);
};
const aretes = () => page.evaluate(() => window.fadiPlanche.aretesParStatut());

// --- Deux boîtes groupées, coupées par un plan à 2 m ------------------------------------------------------------------------
// A : 4 × 3 m, 2 m, plan de coupe posé sur le dessus, puis montée à 3 m ; B : 4 × 3 m à x = −6, 3 m.
await focus();
await page.keyboard.press("r");
await cliquer({ x: 0, y: 0, z: 0 });
await survoler({ x: 1, y: 1, z: 0 });
await saisir("4;3");
await page.keyboard.press("p");
await cliquer({ x: 2, y: 1.5, z: 0 });
await saisir("2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 6);
await page.keyboard.press("Shift+K");
await cliquer({ x: 2, y: 1.5, z: 2 });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.plansDeCoupe ?? {}).length === 1);
await page.keyboard.press("Escape");
await page.keyboard.press("p");
await cliquer({ x: 2, y: 1.5, z: 2 });
await saisir("1");
await selectionner();
await tripleCliquer({ x: 2, y: 1.5, z: 3 });
await page.keyboard.press("Control+g");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 1);
await focus();
await page.keyboard.press("Escape");
await page.keyboard.press("r");
await cliquer({ x: -6, y: 0, z: 0 });
await survoler({ x: -5, y: 1, z: 0 });
await saisir("4;3");
await page.keyboard.press("p");
await cliquer({ x: -4, y: 1.5, z: 0 });
await saisir("3");
await selectionner();
await tripleCliquer({ x: -4, y: 1.5, z: 3 });
await page.keyboard.press("Control+g");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 2);
const [occA, occB] = (await occurrences()).map((o) => o.id);
check("deux boîtes groupées (A et B), un plan de coupe", !!occA && !!occB);

// --- Statut des travaux ------------------------------------------------------------------------------------------------------
const statut = page.locator("[data-planche-panneau='statut-travaux']");
const commandeStatut = (id) => statut.locator(`[data-planche-commande='${id}']`);
await selectionner();
await page.keyboard.press("Escape");
await deuxTemps("t");
await statut.waitFor();
check("Ctrl+Maj+Espace puis T ouvre « Statut des travaux », hors de la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "statut-travaux" && (await page.locator("[data-planche-panneau-icone='statut-travaux']").count()) === 0);
check("en-tête : icône et raccourci Ctrl+Maj+Espace, T", ((await statut.locator("[data-planche-panneau-raccourci]").textContent()) ?? "").includes("T") && (await statut.locator(".canevas-panneau-tete h3 svg").count()) === 1);
check("sans sélection : statuts grisés avec leur motif", (await commandeStatut("statut-projete").isDisabled()) && ((await commandeStatut("statut-projete").getAttribute("title")) ?? "").includes("Choisissez d'abord"));
await choisir({ x: 2, y: 1.5, z: 3 }, occA);
let pas0 = await pas();
await deuxTemps("a");
await page.waitForFunction((id) => window.fadiPlanche.modele().racine.occurrences[id].statut === "a-demolir", occA);
check("A (…, A) : boîte A à démolir, en un pas", (await pas()) === pas0 + 1);
await choisir({ x: -4, y: 1.5, z: 3 }, occB);
await deuxTemps("j");
await page.waitForFunction((id) => window.fadiPlanche.modele().racine.occurrences[id].statut === "projete", occB);
check("B (…, J) : boîte B projetée ; bouton Projeté enfoncé", (await commandeStatut("statut-projete").getAttribute("aria-pressed")) === "true");
check("compte : 0 existant · 1 à démolir · 1 projeté · 0 sans statut", (await statut.locator("[data-planche-statut-compte]").getAttribute("data-planche-statut-compte")) === "0/1/1/0");
pas0 = await pas();
await deuxTemps("j");
await page.waitForFunction((id) => window.fadiPlanche.modele().racine.occurrences[id].statut === undefined, occB);
check("second appui sur J : statut retiré, en un pas", (await pas()) === pas0 + 1);
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((id) => window.fadiPlanche.modele().racine.occurrences[id].statut === "projete", occB);
check("Annuler rend le statut projeté", true);
await choisir({ x: -4, y: 1.5, z: 3 }, occB);
await deuxTemps("x");
await page.waitForFunction((id) => window.fadiPlanche.modele().racine.occurrences[id].statut === "existant", occB);
check("B (…, X) : existant ; compte 1 existant · 1 à démolir", (await statut.locator("[data-planche-statut-compte]").getAttribute("data-planche-statut-compte")) === "1/1/0/0");
await commandeStatut("statut-projete").click();
await page.waitForFunction((id) => window.fadiPlanche.modele().racine.occurrences[id].statut === "projete", occB);
check("bouton Projeté du panneau : B de nouveau projetée", true);

// Vue : arêtes colorées par statut, filtre d'état.
let n = await aretes();
check("vue : arêtes à démolir (tirets jaunes) et projetées (rouges) tracées à part", n["a-demolir"] === 12 && n.projete === 12, JSON.stringify(n));
await statut.locator("[data-planche-statut-etat='existant']").click();
await page.waitForFunction(() => window.fadiPlanche.options().etatTravaux === "existant");
n = await aretes();
check("filtre Existant : à démolir montré, projeté masqué", n["a-demolir"] === 12 && !n.projete, JSON.stringify(n));
await statut.locator("[data-planche-statut-etat='projete']").click();
n = await aretes();
check("filtre Projeté : projeté montré, à démolir masqué", n.projete === 12 && !n["a-demolir"], JSON.stringify(n));
await statut.screenshot({ path: `${OUT}/1-statut.png` });
await statut.locator("[data-planche-statut-etat='tout']").click();
await statut.locator("[data-planche-statut-couleur='projete']").evaluate((i) => {
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  s.call(i, "#0055aa");
  i.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForFunction(() => window.fadiPlanche.options().couleursStatut.projete === "#0055aa");
check("couleur du projeté réglable (convention SIA 400 par défaut)", true);
await page.screenshot({ path: `${OUT}/2-planche-statut.png` });

// --- Feuilles : A101 avec une vue de dessus à 1:100, A102 sans vue -----------------------------------------------------------
const feuilles = page.locator("[data-planche-feuilles]");
await focus();
await page.keyboard.press("Control+Alt+Shift+Digit1");
await feuilles.waitFor();
pas0 = await pas();
await focus();
await page.keyboard.press("Control+Alt+Shift+Digit2");
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
await page.locator("[data-planche-panneau='feuilles'] [data-planche-commande='ajouter-fenetre']").click();
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.feuilles)[0].fenetres.length === 1);
await feuilles.locator("[data-planche-fenetre-champ='echelle']").selectOption("100");
for (const [c, v] of [["numero", "A101"], ["nom", "Plan RDC"]]) {
  await feuilles.locator(`[data-planche-feuille-champ='${c}']`).fill(v);
  await feuilles.locator(`[data-planche-feuille-champ='${c}']`).press("Enter");
}
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.feuilles)[0].nom === "Plan RDC");
pas0 = await pas();
await page.locator("[data-planche-panneau='feuilles'] [data-planche-commande='nouvelle-feuille']").click();
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);

// --- Feuilles en DXF ---------------------------------------------------------------------------------------------------------
const dxf = page.locator("[data-planche-panneau='feuilles-dxf']");
await deuxTemps("d");
await dxf.waitFor();
check("Ctrl+Maj+Espace puis D ouvre « Feuilles en DXF », hors de la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "feuilles-dxf" && (await page.locator("[data-planche-panneau-icone='feuilles-dxf']").count()) === 0);
check("deux feuilles cochées ; A101 : « A3 · 1:100 »", (await dxf.locator("[data-planche-dxf-coche]:checked").count()) === 2 && ((await dxf.locator("[data-planche-dxf-feuille='A101'] small").textContent()) ?? "") === "A3 · 1:100");
check("table des calques : 7 calques et le suffixe de statut", (await dxf.locator("[data-planche-dxf-calques]").getAttribute("data-planche-dxf-calques")) === "7" && ((await dxf.locator("[data-planche-dxf-calques]").textContent()) ?? "").includes("FADI_HACHURES"));
const telechargements = [];
page.on("download", (d) => telechargements.push(d));
const attendre = async (n) => {
  for (let i = 0; i < 100 && telechargements.length < n; i++) await page.waitForTimeout(100);
  return Promise.all(telechargements.splice(0, n).map(async (d) => ({ nom: d.suggestedFilename(), texte: readFileSync(await d.path(), "utf8") })));
};
await deuxTemps("Shift+D");
let fichiers = await attendre(2);
for (const f of fichiers) writeFileSync(`${OUT}/${f.nom}`, f.texte);
const a101 = fichiers.find((f) => f.nom.startsWith("A101"));
/** Valeur d'une variable d'en-tête DXF : paire (9, variable) puis première paire du code donné. */
const valeur = (texte, variable, code) => {
  const l = texte.split(/\r?\n/).map((x) => x.trim());
  for (let k = 0; k + 1 < l.length; k += 2)
    if (l[k] === "9" && l[k + 1] === variable) {
      for (let q = k + 2; q + 1 < l.length; q += 2) if (l[q] === code) return l[q + 1];
      return null;
    }
  return null;
};
check("Maj+D : deux fichiers DXF, nommés selon le motif des feuilles", fichiers.length === 2 && !!a101 && a101.nom === "A101-Plan_RDC.dxf", fichiers.map((f) => f.nom).join(", "));
check("A101 : DXF R2000 (AC1015), millimètres ($INSUNITS 4)", a101 && valeur(a101.texte, "$ACADVER", "1") === "AC1015" && valeur(a101.texte, "$INSUNITS", "70") === "4");
check("A101 : calques du cadre, des textes, coupés à démolir, vus projetés", a101 && ["FADI_CADRE", "FADI_TEXTES", "FADI_COUPE_A_DEMOLIR", "FADI_VU_PROJETE"].every((k) => a101.texte.includes(`\n${k}\n`)));
check("note : fichiers écrits et relus", ((await dxf.locator("[data-planche-dxf-note]").textContent()) ?? "").includes("2 fichier(s) DXF écrit(s) et relu(s)"));
await dxf.screenshot({ path: `${OUT}/3-dxf.png` });

// Vues en mètres : la feuille sans vue n'écrit rien.
await dxf.locator("[data-planche-dxf-contenu='vues']").check();
await dxf.locator("[data-planche-commande='exporter-dxf']").click();
fichiers = await attendre(1);
await page.waitForTimeout(400);
for (const f of fichiers) writeFileSync(`${OUT}/${f.nom}`, f.texte);
check("chaque vue en mètres : un seul fichier (A101, vue 1), $INSUNITS 6", fichiers.length === 1 && telechargements.length === 0 && fichiers[0].nom === "A101-Plan_RDC-v1.dxf" && valeur(fichiers[0].texte, "$INSUNITS", "70") === "6", fichiers.map((f) => f.nom).join(", "));
await dxf.locator("[data-planche-dxf-coche='A101']").uncheck();
await dxf.locator("[data-planche-commande='exporter-dxf']").click();
await page.waitForSelector("[data-planche-dxf-erreur]");
check("seule la feuille sans vue cochée : rien écrit, signalé", telechargements.length === 0);
await dxf.locator("[data-planche-dxf-coche]:checked").uncheck();
check("aucune feuille cochée : Exporter grisé avec son motif", (await dxf.locator("[data-planche-commande='exporter-dxf']").isDisabled()) && ((await dxf.locator("[data-planche-commande='exporter-dxf']").getAttribute("title")) ?? "").includes("Cochez au moins une feuille"));

// --- Règle d'or ----------------------------------------------------------------------------------------------------------------
let regle = ((await dxf.locator("[data-planche-commande='exporter-dxf']").getAttribute("title")) ?? "").includes("Ctrl+Maj+Espace, Maj+D") && (await dxf.locator("[data-planche-commande='exporter-dxf'] svg").count()) === 1;
await deuxTemps("t");
await statut.waitFor();
for (const [id, r] of [["statut-existant", "X"], ["statut-a-demolir", "A"], ["statut-projete", "J"]]) regle &&= ((await commandeStatut(id).getAttribute("title")) ?? "").includes(`Ctrl+Maj+Espace, ${r}`) && (await commandeStatut(id).locator("svg").count()) === 1;
check("chaque commande des deux panneaux : icône et raccourci", regle);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette des feuilles en DXF : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette des feuilles en DXF et du statut des travaux : tous les contrôles passent.");
