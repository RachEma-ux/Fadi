/**
 * Recette « Sélecteur d'étage » de la Planche (cas 4 du catalogue, lot C1, étape 1a : D4-F5-002, D1-F19-036 ; maquette
 * `c1-etape-1a-selecteur-etage.png`, découpage et hauteur de plan 1,10 m décidés le 28 novembre 2026) :
 * - Ctrl+Maj+Espace, Maj+B, E ouvre le sélecteur posé dans la vue (icône et raccourci dans son en-tête) ;
 * - choisir R+1 l'isole (l'objet du RDC n'est plus rendu), en fait le niveau de travail et pose la coupe à +1,10 m ;
 * - la hauteur de plan se règle dans le sélecteur (un pas d'annulation) et dans la colonne Coupe du panneau Niveaux ;
 *   une hauteur hors de l'étage est refusée ;
 * - « Tous les étages » lève l'isolement et la coupe ; Échap ferme le sélecteur ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-etage node apps/web/e2e/planche-etage.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-etage";
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
await inscrireDansLaPage(page, `etage-${Date.now()}@example.com`, "planche-etage-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const faces = () => page.evaluate(() => window.fadiPlanche.facesRendues());
const coupe = () => page.evaluate(() => window.fadiPlanche.coupeEtage());
const panneau = page.locator("[data-planche-niveaux]");
const lignes = panneau.locator("[data-planche-niveau]");
const hote = page.locator("[data-planche-vue]");
const canvas = page.locator("[data-planche-vue] canvas");

// --- Deux niveaux, un objet sur chacun (niveau de travail, rectangle groupé) --------------------------------------------
await page.locator("[data-planche-panneau-icone='niveaux']").click();
await panneau.waitFor();
await panneau.locator("[data-planche-niveau-champ='nom']").fill("RDC");
await panneau.locator("[data-planche-niveau-champ='altitude']").fill("0");
await panneau.locator("[data-planche-niveau-champ='hauteur']").fill("2,85");
await panneau.locator("[data-planche-commande='ajouter-niveau']").click();
await lignes.first().waitFor();
await panneau.locator("[data-planche-commande='ajouter-niveau']").click();
await page.waitForFunction(() => document.querySelectorAll("[data-planche-niveau]").length === 2);
const niveaux = Object.values((await modele()).annotations?.niveaux ?? {});
const rdc = niveaux.find((n) => n.nom === "RDC");
const r1 = niveaux.find((n) => n.nom === "R+1");

const objetSur = async (ligne, n) => {
  await ligne.click();
  await panneau.locator("[data-planche-commande='travailler-niveau']").click();
  const b = await canvas.boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await hote.focus();
  await page.keyboard.press("r");
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.click(cx, cy);
  await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
  await page.keyboard.type("3;2");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length > 0);
  await page.keyboard.press("Space");
  // Les faces libres (hors objets) sont groupées : le groupe est rattaché au niveau de travail.
  await page.evaluate(() => {
    const r = window.fadiPlanche.modele().racine;
    window.fadiPlanche.choisir([...Object.keys(r.faces), ...Object.keys(r.aretes)]);
  });
  await hote.focus();
  await page.keyboard.press("Control+g");
  await page.waitForFunction((k) => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === k, n);
  await panneau.locator("[data-planche-commande='travailler-niveau']").click();
};
await objetSur(lignes.last(), 1);
await objetSur(lignes.first(), 2);
let m = await modele();
const occs = Object.values(m.racine.occurrences);
check("un objet sur le RDC, un objet sur R+1", occs.some((o) => o.niveau === rdc.id) && occs.some((o) => o.niveau === r1.id), JSON.stringify(occs.map((o) => o.niveau)));
const toutes = await faces();
check("sans étage isolé : tout est rendu, aucune coupe", toutes >= 2 && (await coupe()) === null, String(toutes));

// --- Commande « Étage » en trois temps : sélecteur posé dans la vue --------------------------------------------------
await hote.focus();
await page.keyboard.press("Control+Shift+Space");
await page.locator("[data-planche-deux-temps]").waitFor();
await page.keyboard.press("Shift+B");
await page.waitForTimeout(60);
await page.keyboard.press("e");
const sel = page.locator("[data-planche-etage]");
await sel.waitFor();
check("Ctrl+Maj+Espace, Maj+B, E ouvre le sélecteur d'étage dans la vue", (await sel.count()) === 1 && (await sel.getAttribute("data-planche-etage")) === "tous");
check("en-tête : icône et raccourci de la commande", (await sel.locator(".planche-etage-tete svg").count()) === 1 && ((await sel.locator(".planche-etage-tete kbd").textContent()) ?? "").includes("Maj+B, E"));
const ordre = await sel.locator("[data-planche-etage-niveau]").evaluateAll((l) => l.map((x) => x.textContent.trim()));
check("étages du plus haut au plus bas, puis « Tous les étages »", ordre[0].startsWith("R+1") && ordre[1].startsWith("RDC") && ordre[2] === "Tous les étages", ordre.join(" | "));

// --- Choisir R+1 : isolé, niveau de travail, coupe à +1,10 m ------------------------------------------------------------
await sel.locator(`[data-planche-etage-niveau='${r1.id}']`).click();
await page.waitForFunction((id) => document.querySelector("[data-planche-etage]")?.getAttribute("data-planche-etage") === id, r1.id);
const isolees = await faces();
check("R+1 isolé : l'objet du RDC n'est plus rendu", isolees < toutes && isolees > 0, `${toutes} → ${isolees}`);
check("coupe horizontale à +1,10 m au-dessus de R+1 (+3,95 m)", Math.abs((await coupe()) - 3.95) < 1e-9 && (await page.evaluate(() => window.fadiPlanche.plansRognage())) >= 1, String(await coupe()));
const ctx = await page.evaluate(() => window.fadiPlanche.contexteTravail().contexte);
check("R+1 devient le niveau de travail (plan de travail à +2,85 m)", Math.abs(ctx.repere?.origine.z - 2.85) < 1e-9 && ctx.plan === "xy" && (await panneau.locator(`[data-planche-niveau-travail]`).getAttribute("data-planche-niveau")) === r1.id);
check("hauteur de plan affichée : 1,10", (await sel.locator("[data-planche-etage-coupe]").inputValue()) === "1,10");
await page.screenshot({ path: `${OUT}/1-etage-isole.png` });

// --- Hauteur de plan réglée dans le sélecteur (un pas), refus hors de l'étage, colonne Coupe -------------------------
const pas0 = await pas();
await sel.locator("[data-planche-etage-coupe]").fill("1,5");
await sel.locator("[data-planche-etage-coupe]").press("Enter");
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
m = await modele();
check("hauteur de plan 1,50 m enregistrée sur R+1, en un pas", m.annotations.niveaux[r1.id].coupe === 1.5 && Math.abs((await coupe()) - 4.35) < 1e-9, String(await coupe()));
check("colonne Coupe du panneau Niveaux : 1,50", (await panneau.locator(`[data-planche-niveau-coupe='${r1.id}']`).inputValue()) === "1,50");
await panneau.locator(`[data-planche-niveau-coupe='${rdc.id}']`).fill("3");
await panneau.locator(`[data-planche-niveau-coupe='${rdc.id}']`).press("Enter");
await panneau.locator("[data-planche-niveaux-erreur='coupe']").waitFor();
check("une hauteur de plan hors de l'étage est refusée avec son motif", (await pas()) === pas0 + 1 && (await modele()).annotations.niveaux[rdc.id].coupe === undefined);
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((n) => window.fadiPlanche.pas() === n, pas0);
check("Annuler rend 1,10 m", Math.abs((await coupe()) - 3.95) < 1e-9);

// --- Tous les étages, Échap -------------------------------------------------------------------------------------------
await sel.locator("[data-planche-etage-niveau='tous']").click();
await page.waitForFunction(() => document.querySelector("[data-planche-etage]")?.getAttribute("data-planche-etage") === "tous");
check("« Tous les étages » : tout est rendu, plus de coupe d'étage", (await faces()) === toutes && (await coupe()) === null);
await sel.locator(`[data-planche-etage-niveau='${rdc.id}']`).click();
await page.waitForFunction(() => window.fadiPlanche.coupeEtage() !== null);
await sel.locator(`[data-planche-etage-niveau='${rdc.id}']`).press("Escape");
await sel.waitFor({ state: "detached" });
check("Échap ferme le sélecteur et rend tous les étages", (await faces()) === toutes && (await coupe()) === null);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette du sélecteur d'étage : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette du sélecteur d'étage : tous les contrôles passent.");
