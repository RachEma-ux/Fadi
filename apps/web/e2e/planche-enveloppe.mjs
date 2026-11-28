/**
 * Recette du contrôle de l'enveloppe (cas 4, étape 7c : D6-F20b-004 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7c) :
 * - deux cubes importés (OBJ) : l'enveloppe de 10 m et un projet de 4 m dedans ; panneau par Ctrl+Alt+Maj+0 (en-tête
 *   avec icône et raccourci), « Définir l'enveloppe » (Ctrl+Alt+3) sur l'objet choisi, « Contrôler » (Ctrl+Alt+4) ;
 * - contrôle calculé dans un travailleur : « Vérifiée » ; un troisième cube qui dépasse : « Écart » au point le plus
 *   défavorable (distance exacte), faces hors enveloppe hachurées dans la vue, recalcul après l'opération ;
 * - règle de hauteur (Ctrl+Alt+5) : sans seuil « Non évaluée » ; seuil et source saisis : écart et marge signée ;
 *   suppression (Ctrl+Alt+6) ; un clic sur une ligne cadre la vue ; persistance ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-enveloppe node apps/web/e2e/planche-enveloppe.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-enveloppe";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

/** Cube [a, b]³ en OBJ (12 triangles orientés vers l'extérieur). */
const cube = (a, b) =>
  Buffer.from(
    [[a, a, a], [b, a, a], [b, b, a], [a, b, a], [a, a, b], [b, a, b], [b, b, b], [a, b, b]].map((p) => `v ${p.join(" ")}`).join("\n") +
      "\nf 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n",
  );

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `enveloppe-${Date.now()}@example.com`, "planche-enveloppe-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const vue = page.locator("[data-planche-vue]");
const occurrences = async () => Object.keys((await modele()).racine.occurrences).sort();
async function importer(nom, octets) {
  const deja = new Set(await occurrences());
  const n = deja.size;
  const ouvert = (await page.locator("[data-planche-enveloppe]").count()) > 0;
  await page.locator("[data-planche-menu-ouvrir]").click();
  if (!(await page.locator("[data-planche-importer='obj']").isVisible().catch(() => false))) await page.locator("[data-planche-menu-item='importer']").click();
  const choix = page.waitForEvent("filechooser");
  await page.locator("[data-planche-importer='obj']").click();
  await (await choix).setFiles({ name: nom, mimeType: "text/plain", buffer: octets });
  await page.waitForFunction((k) => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === k + 1 && !document.querySelector("[data-planche-import-cours]"), n);
  await page.waitForTimeout(200);
  // Cas 2, lot 6 : l'import OBJ ouvre son rapport (panneau « Importer ») ; on revient au panneau de l'enveloppe.
  if (ouvert && (await page.locator("[data-planche-enveloppe]").count()) === 0) {
    await vue.focus();
    await page.keyboard.press("Control+Alt+Shift+Digit0");
    await page.locator("[data-planche-enveloppe]").waitFor();
  }
  return (await occurrences()).find((id) => !deja.has(id));
}
const ecran = async (p) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((q) => window.fadiPlanche.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};

const env = await importer("enveloppe.obj", cube(0, 10));
const projet = await importer("projet.obj", cube(2, 6));
check("deux cubes importés (enveloppe, projet)", env && projet && env !== projet, `${env} · ${projet}`);

// --- Panneau au clavier -------------------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+Digit0");
const panneau = page.locator("[data-planche-enveloppe]");
await panneau.waitFor();
check("Ctrl+Alt+Maj+0 ouvre l'enveloppe ; pas de bouton dans la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "enveloppe" && (await page.locator("[data-planche-panneau-icone='enveloppe']").count()) === 0);
check("en-tête : icône et raccourci Ctrl+Alt+Maj+0", ((await page.locator("[data-planche-panneau='enveloppe'] [data-planche-panneau-raccourci]").textContent()) ?? "").includes("Ctrl+Alt+Maj+0") && (await page.locator("[data-planche-panneau='enveloppe'] .canevas-panneau-tete h3 svg").count()) === 1);
check("« Définir l'enveloppe » indisponible sans objet choisi", await page.locator("[data-planche-commande='definir-enveloppe']").isDisabled());

// --- Désigner l'enveloppe : clic sur une de ses faces ------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Shift+Z");
await page.waitForTimeout(300);
await page.keyboard.press("Space");
// Zoom étendu (Maj+Z) : les deux cubes sont vus ; un coin de face de l'enveloppe, loin du projet.
let choisi = false;
for (const p of [{ x: 9, y: 0, z: 9 }, { x: 0, y: 9, z: 9 }, { x: 9, y: 9, z: 10 }, { x: 1, y: 1, z: 10 }, { x: 9, y: 1, z: 0 }]) {
  const e = await ecran(p);
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(120);
  const s = await page.evaluate(() => window.fadiPlanche.selection());
  if (s.length === 1 && s[0] === env) {
    choisi = true;
    break;
  }
}
if (!choisi) {
  await page.screenshot({ path: `${OUT}/choix.png` });
  console.log(JSON.stringify(await Promise.all([{ x: 9, y: 0, z: 9 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }].map(ecran))), JSON.stringify(await page.evaluate(() => window.fadiPlanche.outil())));
}
check("l'enveloppe est choisie dans la vue", choisi, JSON.stringify(await page.evaluate(() => window.fadiPlanche.selection())));
await vue.focus();
await page.keyboard.press("Control+Alt+Digit3");
await page.waitForFunction((id) => window.fadiPlanche.modele().annotations?.enveloppe?.objet === id, env);
check("Ctrl+Alt+3 désigne l'objet choisi comme enveloppe", true);
await vue.focus();
await page.keyboard.press("Control+Alt+Digit4");
await page.waitForFunction(() => window.fadiPlanche.modele().annotations?.enveloppe?.controle === true);
await page.waitForSelector("[data-planche-enveloppe-table='pret'] [data-planche-enveloppe-ligne='contenu']");
const etat = (id) => page.locator(`[data-planche-enveloppe-ligne='${id}']`).getAttribute("data-etat");
check("Ctrl+Alt+4 active le contrôle ; en-tête « contrôle actif »", ((await page.locator("[data-planche-enveloppe-etat]").textContent()) ?? "") === "contrôle actif");
check("projet dedans : « Vérifiée »", (await etat("contenu")) === "verifiee");

// --- Un cube qui dépasse : écart au point le plus défavorable ------------------------------------------------------------
const hors = await importer("hors.obj", cube(8, 12));
await page.waitForFunction(() => document.querySelector("[data-planche-enveloppe-ligne='contenu']")?.getAttribute("data-etat") === "ecart");
const ligne = await page.locator("[data-planche-enveloppe-ligne='contenu']").innerText();
const attendu = Math.sqrt(12).toFixed(2).replace(".", ",");
check("cube qui dépasse : « Écart », distance au point le plus défavorable (√12 m), marge négative", ligne.includes(`${attendu} m hors`) && ligne.includes(`−${attendu} m`), ligne.replace(/\s+/g, " "));
check("pied : coordonnées du point le plus défavorable", ((await page.locator("[data-planche-enveloppe-pire]").textContent()) ?? "").includes("12,00"));
check("vue : étiquette au point le plus défavorable", (await page.locator(".planche-etiquette-enveloppe").count()) === 1);
check("le troisième cube est importé", !!hors);
await page.screenshot({ path: `${OUT}/enveloppe-ecart.png` });

// --- Règle de hauteur ---------------------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Alt+Digit5");
await page.waitForSelector("[data-planche-enveloppe-ligne='r1']");
check("Ctrl+Alt+5 ajoute une règle : sans seuil « Non évaluée »", (await etat("r1")) === "non-evaluee" && (await page.locator("[data-planche-enveloppe-motif='sans-seuil']").count()) === 1);
const champ = (c) => page.locator(`[data-planche-enveloppe-champ='${c}']`);
await champ("libelle").fill("Hauteur au faîtage");
await champ("libelle").press("Enter");
await champ("seuil").fill("11,5");
await champ("seuil").press("Enter");
await champ("source").fill("Saisie de recette");
await champ("source").press("Enter");
await page.waitForFunction(() => document.querySelector("[data-planche-enveloppe-ligne='r1']")?.getAttribute("data-etat") === "ecart");
const r1 = await page.locator("[data-planche-enveloppe-ligne='r1']").innerText();
check("seuil 11,5 m saisi avec sa source : point le plus haut 12 m, « Écart », marge −0,50 m", r1.includes("Hauteur au faîtage (Saisie de recette)") && r1.includes("12,00 m") && r1.includes("11,50 m") && r1.includes("−0,50 m"), r1.replace(/\s+/g, " "));
check("vue : seuil saisi tracé et nommé", ((await page.locator(".planche-etiquette-seuil").first().textContent()) ?? "").includes("Hauteur au faîtage"));
await champ("seuil").fill("13");
await champ("seuil").press("Enter");
await page.waitForFunction(() => document.querySelector("[data-planche-enveloppe-ligne='r1']")?.getAttribute("data-etat") === "verifiee");
check("seuil 13 m : « Vérifiée », marge +1,00 m", (await page.locator("[data-planche-enveloppe-ligne='r1']").innerText()).includes("+1,00 m"));

// --- Cadrer sur une ligne -----------------------------------------------------------------------------------------------
const avant = await page.evaluate(() => window.fadiPlanche.camera());
await page.locator("[data-planche-enveloppe-ligne='contenu'] button").click();
await page.waitForTimeout(300);
const apres = await page.evaluate(() => window.fadiPlanche.camera());
check("un clic sur la ligne cadre la vue sur le point", JSON.stringify(avant.position) !== JSON.stringify(apres.position));
await page.screenshot({ path: `${OUT}/enveloppe-panneau.png` });

// --- Persistance, suppression, arrêt -------------------------------------------------------------------------------------
const relu = await page.evaluate(() => JSON.parse(JSON.stringify(window.fadiPlanche.modele())).annotations.enveloppe);
check("persistance : enveloppe, contrôle et règle dans le modèle", relu.objet === env && relu.controle === true && relu.regles[0].seuil === 13 && relu.regles[0].source === "Saisie de recette");
await page.locator("[data-planche-enveloppe-ligne='r1'] button").click();
await vue.focus();
await page.keyboard.press("Control+Alt+Digit6");
await page.waitForFunction(() => window.fadiPlanche.modele().annotations.enveloppe.regles.length === 0);
check("Ctrl+Alt+6 supprime la règle choisie", true);
await vue.focus();
await page.keyboard.press("Control+Alt+Digit4");
await page.waitForFunction(() => window.fadiPlanche.modele().annotations.enveloppe.controle === false);
check("Ctrl+Alt+4 arrête le contrôle : plus de marque dans la vue", (await page.locator(".planche-etiquette-enveloppe").count()) === 0 && (await page.locator("[data-planche-enveloppe-vide]").count()) === 1);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette de l'enveloppe : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette de l'enveloppe : tous les contrôles passent.");
