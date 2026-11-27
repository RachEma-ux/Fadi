/**
 * Recette des références verrouillées et des raccourcis en deux temps (cas 4, lot C4, étape 3 : D10-F14-024,
 * D10-F23a-011 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-3-reference.png` ; décision du
 * 27 novembre 2026 : raccourcis en deux temps) :
 * - Ctrl+Maj+Espace ouvre l'encadré des secondes touches, Échap l'annule ; Ctrl+Maj+Espace puis R ouvre le panneau ;
 * - Charger (…, C) : OBJ en centimètres archivé en base, référence verrouillée, jamais fusionnée au dessin ;
 * - verrouillée, placement refusé ; Déverrouiller (…, L), placement modifié ; Masquer (…, M) ;
 * - Contrôle de récolement (…, K) avec tolérance déclarée : sommets hors tolérance comptés exactement ;
 * - Recharger (…, Maj+C) : version 2, placement gardé ; Supprimer (…, S) puis Annuler ; aucune erreur JS.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-references node apps/web/e2e/planche-references.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-references";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

/** OBJ d'un parallélépipède (centimètres) de 0 à l × p × h. */
function obj(l, p, h) {
  const v = [[0, 0, 0], [l, 0, 0], [l, p, 0], [0, p, 0], [0, 0, h], [l, 0, h], [l, p, h], [0, p, h]];
  const f = [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]];
  return Buffer.from(`# relevé de récolement\n${v.map((x) => `v ${x.join(" ")}`).join("\n")}\n${f.map((x) => `f ${x.join(" ")}`).join("\n")}\n`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `references-${Date.now()}@example.com`, "planche-references-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const references = async () => Object.values((await modele()).annotations?.references ?? {});
const vue = page.locator("[data-planche-vue]");
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(touche);
};
const ecran = async (p) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((q) => window.fadiPlanche.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};

// --- Raccourcis en deux temps -----------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+Space");
const encadre = page.locator("[data-planche-deux-temps]");
await encadre.waitFor();
check("Ctrl+Maj+Espace ouvre l'encadré des secondes touches (7 commandes des références au moins)", (await encadre.locator("[data-planche-deux-temps-commande]").count()) >= 7 && ((await encadre.textContent()) ?? "").includes("Ctrl+Maj+Espace"));
await page.screenshot({ path: `${OUT}/deux-temps.png` });
await page.keyboard.press("Escape");
await encadre.waitFor({ state: "detached" });
check("Échap annule, rien n'est ouvert", (await page.evaluate(() => window.fadiPlanche.panneau())) !== "references");
await deuxTemps("r");
await page.locator("[data-planche-references]").waitFor();
check("Ctrl+Maj+Espace puis R ouvre le panneau Références", (await page.evaluate(() => window.fadiPlanche.panneau())) === "references" && (await page.locator("[data-planche-references-vide]").count()) === 1);

// --- Dessin : un rectangle au sol (sommets à contrôler) -----------------------------------------------------------------
await page.locator("[data-planche-panneau='references'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("r");
const boite = await page.locator("[data-planche-vue] canvas").first().boundingBox();
const p1 = { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2 };
await page.mouse.move(p1.x, p1.y, { steps: 4 });
await page.mouse.click(p1.x, p1.y);
await page.mouse.move(p1.x + 60, p1.y - 30, { steps: 4 });
await page.keyboard.type("3;2");
await page.keyboard.press("Enter");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length > 0);
await page.keyboard.press("Space");
const faces0 = Object.keys((await modele()).racine.faces).length;

// --- Charger une référence (OBJ en centimètres) -------------------------------------------------------------------------
await deuxTemps("r");
await page.locator("[data-planche-reference-unite]").selectOption("cm");
const OBJ1 = obj(1000, 1000, 300);
const choix = page.waitForEvent("filechooser");
await deuxTemps("c");
await (await choix).setFiles({ name: "releve-recolement.obj", mimeType: "text/plain", buffer: OBJ1 });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.references ?? {}).length === 1);
let [r] = await references();
check("Charger (Ctrl+Maj+Espace, C) : référence verrouillée, v1, 12 triangles, unité cm", r.verrouille && r.visible && r.version === 1 && r.triangles === 12 && r.echelle === 0.01 && r.format === "obj", JSON.stringify(r));
check("jamais fusionnée : le dessin garde ses faces", Object.keys((await modele()).racine.faces).length === faces0);
const lu = await page.evaluate(async (id) => { const x = await fetch(`/sandbox/references/${id}`, { credentials: "include" }); return { statut: x.status, octets: [...new Uint8Array(await x.arrayBuffer())] }; }, r.fichier.id);
check("le fichier est archivé en base et relu à l'identique", lu.statut === 200 && Buffer.from(lu.octets).equals(OBJ1) && r.fichier.taille === OBJ1.length);
await page.locator(`[data-planche-reference='${r.id}'][data-etat='chargee']`).waitFor();
check("la liste montre la référence relue", true);

// --- Verrou et placement -----------------------------------------------------------------------------------------------
check("verrouillée : placement non modifiable", await page.locator("[data-planche-reference-placement='x']").isDisabled());
await deuxTemps("l");
await page.waitForFunction(() => !Object.values(window.fadiPlanche.modele().annotations.references)[0].verrouille);
await page.locator("[data-planche-reference-placement='x']").fill("1");
await page.locator("[data-planche-reference-placement='x']").press("Enter");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.references)[0].placement.x === 1);
check("Déverrouiller (…, L) puis X = 1 m : placement modifié", true);
await deuxTemps("l");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.references)[0].verrouille);
await page.screenshot({ path: `${OUT}/reference.png` });

// --- Récolement --------------------------------------------------------------------------------------------------------
await page.locator("[data-planche-reference-tolerance]").fill("2");
await page.locator("[data-planche-reference-tolerance]").press("Enter");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.references)[0].tolerance === 0.02);
await deuxTemps("k");
const res = page.locator("[data-planche-recolement]");
await res.waitFor();
// Attendu : distance de chaque sommet du dessin à la boîte [1 ; 11] × [0 ; 10] × [0 ; 3] (sommets au sol : écart horizontal).
const m = await modele();
const sommets = Object.values(m.racine.sommets).map((s) => s.position);
const dist = (p) => Math.hypot(Math.max(0, 1 - p.x, p.x - 11), Math.max(0, 0 - p.y, p.y - 10), Math.max(0, 0 - p.z, p.z - 3));
const attendu = sommets.filter((p) => dist(p) > 0.02).length;
check("Contrôler (…, K) : sommets hors tolérance comptés exactement", attendu > 0 && (await res.getAttribute("data-planche-recolement")) === String(attendu), `${await res.getAttribute("data-planche-recolement")} / ${attendu} · ${await res.textContent()}`);
await page.screenshot({ path: `${OUT}/recolement.png` });
await page.locator("[data-planche-reference-tolerance]").fill("3");
await page.locator("[data-planche-reference-tolerance]").press("Enter");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.references)[0].tolerance === 0.03);
check("tolérance changée après le contrôle : résultat périmé retiré", (await res.count()) === 0);

// --- Masquer, recharger, supprimer ------------------------------------------------------------------------------------
await deuxTemps("m");
await page.waitForFunction(() => !Object.values(window.fadiPlanche.modele().annotations.references)[0].visible);
check("Masquer (…, M)", true);
await deuxTemps("m");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.references)[0].visible);
const choix2 = page.waitForEvent("filechooser");
await deuxTemps("Shift+C");
await (await choix2).setFiles({ name: "releve-recolement-v2.obj", mimeType: "text/plain", buffer: obj(1000, 1000, 320) });
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.references)[0].version === 2);
[r] = await references();
check("Recharger (…, Maj+C) : version 2, placement gardé, nouveau fichier", r.placement.x === 1 && r.nom === "releve-recolement-v2.obj" && r.verrouille, JSON.stringify(r));
const pas0 = await pas();
await deuxTemps("s");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.references ?? {}).length === 0);
check("Supprimer (…, S) : un pas", (await pas()) === pas0 + 1);
await vue.focus();
await page.keyboard.press("Control+z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.references ?? {}).length === 1);
check("Annuler la rend", true);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette des références : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette des références : tous les contrôles passent.");
