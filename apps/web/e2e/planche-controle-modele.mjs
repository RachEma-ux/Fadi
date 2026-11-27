/**
 * Recette « Contrôle du modèle » de la Planche (cas 2 du catalogue, lot 3 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-3/lot3-1` à `lot3-4`) :
 * - l'extension « Contrôle et nettoyage » activée ; un rectangle tracé à la racine ;
 * - Ctrl+Maj+F3 ouvre le relevé et cadre le défaut 1 (géométrie hors objet), sélectionné ; Corriger le groupe en un pas,
 *   l'objet créé est relevé « sans balise » ;
 * - tolérance d'angle saisie dans le panneau, gardée avec le modèle ;
 * - Ctrl+Maj+F5 : vue « Préparer un fond DAO » ; l'objet sélectionné seul, Préparer en un pas ;
 * - Ctrl+Maj+F12 : vue « Pièces du permis » non évaluée sans fichier ; un fichier de règles d'essai chargé, archivé avec
 *   le modèle, les pièces comptées ; site non rattaché ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-controle node apps/web/e2e/planche-controle-modele.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-controle";
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
await inscrireDansLaPage(page, `controle-${Date.now()}@example.com`, "planche-controle-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const racine = page.locator("[data-sandbox-planche]");
const vue = page.locator("[data-planche-vue]");

// --- Extension « Contrôle et nettoyage » ---------------------------------------------------------------------------------
await racine.locator("[data-planche-menu-ouvrir]").click();
await racine.locator('[data-planche-menu-item="extensions"]').click();
await racine.locator('[data-planche-extensions] [data-planche-extension-interrupteur="controle"]').click();
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
check("extension « Contrôle et nettoyage » activée : son panneau est dans la colonne", (await racine.locator('[data-planche-panneau-icone="controle"]').count()) === 1);

// --- Un rectangle à la racine ---------------------------------------------------------------------------------------------
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
const cx = boite.x + boite.width * 0.4;
const cy = boite.y + boite.height * 0.55;
await vue.focus();
await page.keyboard.press("r");
await page.mouse.move(cx, cy, { steps: 4 });
await page.mouse.click(cx, cy);
await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
await page.keyboard.type("4;3");
await page.keyboard.press("Enter");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 1);
await page.keyboard.press("Space");

// --- Parcours : Ctrl+Maj+F3 ouvre le relevé et cadre le premier défaut ------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+F3");
const panneau = page.locator("[data-planche-panneau='controle']");
await panneau.locator("[data-planche-controle-position]").waitFor();
check("Ctrl+Maj+F3 : relevé ouvert, défaut 1 montré", ((await panneau.locator("[data-planche-controle-position]").textContent()) ?? "").startsWith("Défaut 1 sur"), (await panneau.locator("[data-planche-controle-position]").textContent()) ?? "");
check("relevé : 4 arêtes hors objet, aucun sommet presque confondu", ((await panneau.locator("[data-planche-controle-compte='horsObjet']").textContent()) ?? "") === "4" && ((await panneau.locator("[data-planche-controle-compte='confondus']").textContent()) ?? "") === "0");
check("le défaut courant est la géométrie hors objet, sélectionnée", (await panneau.locator("[data-planche-controle-defaut='hors-objet']").count()) === 1 && (await page.evaluate(() => window.fadiPlanche.selection().length)) > 0);
await panneau.screenshot({ path: `${OUT}/1-releve.png` });
let pas0 = await pas();
await panneau.locator("[data-planche-commande='corriger-defaut']").click();
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 1);
check("Corriger : la géométrie est groupée en un pas, l'objet est relevé sans balise", (await pas()) === pas0 + 1 && ((await panneau.locator("[data-planche-controle-compte='sansBalise']").textContent()) ?? "") === "1" && ((await panneau.locator("[data-planche-controle-compte='horsObjet']").textContent()) ?? "") === "0");

// --- Tolérance saisie, gardée avec le modèle -----------------------------------------------------------------------------
await panneau.locator("[data-planche-controle-seuil='planeite']").fill("3");
await panneau.locator("[data-planche-controle-seuil='planeite']").press("Enter");
await page.waitForFunction(() => window.fadiPlanche.modele().annotations?.reglages?.controle?.planeite === 3);
check("tolérance « presque horizontale / verticale » 3° gardée avec le modèle", true);

// --- Fond DAO : l'objet seul sélectionné, Préparer en un pas --------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+a");
await page.keyboard.press("Control+Shift+F5");
const vueDao = panneau.locator("[data-planche-controle-vue='fond-dao']");
await vueDao.waitFor();
check("Ctrl+Maj+F5 : vue « Préparer un fond DAO », titre du panneau complété", ((await panneau.locator("h3").textContent()) ?? "").includes("Préparer un fond DAO"));
pas0 = await pas();
await vueDao.locator("[data-planche-commande='preparer-fond-dao']").click();
await panneau.locator("[data-planche-controle-note]").waitFor();
check("Préparer : une opération, le bilan est annoncé", (await pas()) === pas0 + 1, (await panneau.locator("[data-planche-controle-note]").textContent()) ?? "");
await panneau.screenshot({ path: `${OUT}/2-fond-dao.png` });

// --- Pièces du permis : non évaluée sans fichier, puis fichier d'essai archivé ----------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+F12");
const vuePieces = panneau.locator("[data-planche-controle-vue='pieces']");
await vuePieces.waitFor();
check("Ctrl+Maj+F12 : pièces « non évaluées » sans fichier de règles", (await vuePieces.locator("[data-planche-pieces-non-evaluee]").count()) === 1);
check("site : aucun site de projet rattaché", ((await vuePieces.locator("[data-planche-site='rattache']").textContent()) ?? "") === "non");
const fichier = JSON.stringify({
  source: "Fichier d'essai de la recette, non contractuel",
  pieces: [
    { code: "PC1", libelle: "Plan de situation", attendus: [{ libelle: "Nord", critere: "nord" }] },
    { code: "PC2", libelle: "Plan de masse", attendus: [{ libelle: "Volumes", critere: "geometrie" }, { libelle: "Cotes", critere: "cotes" }] },
  ],
});
pas0 = await pas();
await vuePieces.locator("[data-planche-pieces-charger]").setInputFiles({ name: "regles-essai.json", mimeType: "application/json", buffer: Buffer.from(fichier) });
await page.waitForFunction(() => !!window.fadiPlanche.modele().annotations?.reglages?.reglesPieces);
const m = await modele();
check("fichier de règles archivé tel quel avec le modèle, en un pas", m.annotations.reglages.reglesPieces.texte === fichier && (await pas()) === pas0 + 1);
check("PC1 0 / 1 (nord non déclaré), PC2 1 / 2 (volumes présents, aucune cote)", ((await vuePieces.locator("[data-planche-piece='PC1']").textContent()) ?? "") === "0 / 1" && ((await vuePieces.locator("[data-planche-piece='PC2']").textContent()) ?? "") === "1 / 2");
await panneau.screenshot({ path: `${OUT}/3-pieces.png` });

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette contrôle du modèle : tous les contrôles passent.");
