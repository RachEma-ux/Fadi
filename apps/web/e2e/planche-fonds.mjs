/**
 * Recette des fonds calés (cas 4, lot C4, étape 1 : D10-F23a-002 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-1-calage.png`) :
 * - Importer un fond (Ctrl+Alt+Maj+F3) : l'image devient un fond à l'échelle provisoire 1 px = 1 cm, non calé ;
 * - outil Calage (Ctrl+Alt+Maj+F2) : deux clics posent A et B ; la longueur saisie et Caler (Ctrl+Alt+Maj+F4) fixent
 *   l'échelle, A restant en place ;
 * - méthode par paires : trois points, positions saisies, résidus et écart moyen affichés ;
 * - opacité ; Verrouiller (Ctrl+Alt+Maj+F5) refuse un nouveau point ; Supprimer le point (Ctrl+Alt+Maj+F6) ;
 *   Supprimer le fond (Ctrl+Alt+Maj+F7) puis Annuler ; panneau par Ctrl+Alt+Maj+F1 ; persistance ; aucune erreur JS.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-fonds node apps/web/e2e/planche-fonds.mjs
 */
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-fonds";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

/** PNG uni de l × h (photo d'essai). */
function png(l, h) {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const bloc = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const lignes = Buffer.alloc((l * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) lignes.set([120, 140 + (y % 50), 130], y * (l * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", ihdr), bloc("IDAT", deflateSync(lignes)), bloc("IEND", Buffer.alloc(0))]);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `fonds-${Date.now()}@example.com`, "planche-fonds-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const fonds = async () => Object.values((await modele()).annotations?.fonds ?? {});
const ecran = async (p) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((q) => window.fadiPlanche.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};
const cliquer = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(80);
};
const vue = page.locator("[data-planche-vue]");
/** Clic de l'outil Calage : le panneau (qui se rouvre à chaque point) est fermé avant pour ne pas couvrir le fond. */
const cliquerFond = async (q) => {
  const fermer = page.locator("[data-planche-panneau='fonds'] .canevas-fermer");
  if (await fermer.count()) await fermer.evaluate((b) => b.click());
  await page.waitForTimeout(100);
  await vue.focus();
  await cliquer(q);
};
const proche = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// --- Importer un fond --------------------------------------------------------------------------------------------------
await vue.focus();
const choix = page.waitForEvent("filechooser");
await page.keyboard.press("Control+Alt+Shift+F3");
await (await choix).setFiles({ name: "plan-recu.png", mimeType: "image/png", buffer: png(800, 600) });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.fonds ?? {}).length === 1);
let [f] = await fonds();
check("Ctrl+Alt+Maj+F3 importe l'image : fond non calé, 1 px = 1 cm provisoire, PNG gardé", f.nom === "plan-recu.png" && !f.cale && f.largeurPx === 800 && f.hauteurPx === 600 && proche(f.pose.echelle, 0.01) && f.image.startsWith("data:image/png;base64,"), JSON.stringify({ nom: f.nom, e: f.pose.echelle, l: f.largeurPx }));
const panneau = page.locator("[data-planche-fonds]");
await panneau.waitFor();
check("le panneau Fonds calés s'ouvre ; état « non calé »", (await page.evaluate(() => window.fadiPlanche.panneau())) === "fonds" && (await page.locator(`[data-planche-fond='${f.id}'][data-cale='non']`).count()) === 1);
check("en-tête : icône et raccourci Ctrl+Alt+Maj+F1", ((await page.locator("[data-planche-panneau='fonds'] [data-planche-panneau-raccourci]").textContent()) ?? "").includes("Ctrl+Alt+Maj+F1") && (await page.locator("[data-planche-panneau='fonds'] .canevas-panneau-tete h3 svg").count()) === 1);

// --- Outil Calage, méthode par longueur ---------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F2");
check("Ctrl+Alt+Maj+F2 choisit l'outil Calage", (await page.evaluate(() => window.fadiPlanche.outil())) === "calage");
let pas0 = await pas();
await cliquerFond({ x: 1, y: 1, z: 0 });
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
await cliquerFond({ x: 5, y: 1, z: 0 });
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 2, pas0);
[f] = await fonds();
const [A, B] = f.points;
check("deux clics posent A et B au pixel visé, un pas chacun", f.points.length === 2 && A.id === "A" && B.id === "B" && Math.abs(A.pixel.u - 100) < 3 && Math.abs(A.pixel.v - 500) < 3 && Math.abs(B.pixel.u - 500) < 3, JSON.stringify(f.points.map((p) => p.pixel)));
check("tableau des points : deux lignes, résidu « non évalué »", (await page.locator("[data-planche-point-calage]").count()) === 2 && ((await page.locator("[data-planche-residu='A']").textContent()) ?? "").length > 0);
await page.screenshot({ path: `${OUT}/fonds-points.png` });
const distPx = Math.hypot(B.pixel.u - A.pixel.u, B.pixel.v - A.pixel.v);
const avantA = { x: f.pose.x + f.pose.echelle * A.pixel.u, y: f.pose.y - f.pose.echelle * A.pixel.v };
await page.locator("[data-planche-fonds-longueur]").fill("8");
await page.locator("[data-planche-fonds-longueur]").press("Enter");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.fonds)[0].longueur === 8);
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F4");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.fonds)[0].cale);
[f] = await fonds();
const apresA = { x: f.pose.x + f.pose.echelle * A.pixel.u, y: f.pose.y - f.pose.echelle * A.pixel.v };
check("Caler (Ctrl+Alt+Maj+F4) : échelle = longueur / distance, A reste en place", proche(f.pose.echelle, 8 / distPx, 1e-9) && proche(apresA.x, avantA.x) && proche(apresA.y, avantA.y) && proche(f.pose.rotation, 0), `${f.pose.echelle} · ${JSON.stringify(apresA)}`);
check("fond marqué calé dans la liste", (await page.locator(`[data-planche-fond='${f.id}'][data-cale='oui']`).count()) === 1);

// --- Méthode par paires : trois points, résidus ------------------------------------------------------------------------
await page.locator("[data-planche-fonds-methode='paires']").check();
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.fonds)[0].methode === "paires");
// Troisième point : dans le fond calé (A en (1 ; 1), le fond va vers +x et +y).
await vue.focus();
pas0 = await pas();
await cliquerFond({ x: 3, y: 4, z: 0 });
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
[f] = await fonds();
check("troisième point C posé", f.points.length === 3 && f.points[2].id === "C");
// Positions saisies : une similitude exacte (1 px = 1 cm, origine (0 ; 6)) — résidus nuls.
const cible = (p) => `${(0.01 * p.pixel.u).toFixed(3)} ; ${(6 - 0.01 * p.pixel.v).toFixed(3)}`;
for (const p of f.points) {
  const c = page.locator(`[data-planche-cible='${p.id}']`);
  await c.fill(cible(p));
  await c.press("Enter");
  await page.waitForFunction((id) => Object.values(window.fadiPlanche.modele().annotations.fonds)[0].points.find((q) => q.id === id).cible !== null, p.id);
}
check("avant Caler, les résidus mesurent l'écart de la pose actuelle", !((await page.locator("[data-planche-fonds-moyen]").textContent()) ?? "").includes(" 0,0 cm"));
await page.locator("[data-planche-commande='caler-fond']").click();
await page.waitForFunction(() => Math.abs(Object.values(window.fadiPlanche.modele().annotations.fonds)[0].pose.echelle - 0.01) < 1e-6);
[f] = await fonds();
check("résidus et écart moyen affichés (0,0 cm)", ((await page.locator("[data-planche-residu='C']").textContent()) ?? "").includes("0,0 cm") && ((await page.locator("[data-planche-fonds-moyen]").textContent()) ?? "").includes("0,0"), await page.locator("[data-planche-fonds-moyen]").textContent());
check("calage par paires : similitude retrouvée (1 px = 1 cm, origine 0 ; 6)", proche(f.pose.x, 0) && proche(f.pose.y, 6) && proche(f.pose.rotation, 0), JSON.stringify(f.pose));
// Position illisible : message, rien n'est changé.
await page.locator("[data-planche-cible='A']").fill("douze");
await page.locator("[data-planche-cible='A']").press("Enter");
check("position illisible : message d'erreur", (await page.locator("[data-planche-fonds-erreur]").count()) === 1);
await page.locator("[data-planche-cible='A']").fill(cible(f.points[0]));
await page.locator("[data-planche-cible='A']").press("Enter");

// --- Opacité, verrouillage ---------------------------------------------------------------------------------------------
await page.locator("[data-planche-fonds-opacite]").fill("40");
await page.waitForFunction(() => Math.abs(Object.values(window.fadiPlanche.modele().annotations.fonds)[0].opacite - 0.4) < 1e-6);
check("opacité réglée à 40 %", true);
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F5");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.fonds)[0].verrouille);
check("Ctrl+Alt+Maj+F5 verrouille le fond ; champs désactivés", (await page.locator("[data-planche-cible='A']").isDisabled()) && (await page.locator("[data-planche-commande='caler-fond']").isDisabled()));
pas0 = await pas();
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F2");
const sur = await page.evaluate(() => Object.values(window.fadiPlanche.modele().annotations.fonds)[0]);
await cliquerFond({ x: sur.pose.x + sur.pose.echelle * 300, y: sur.pose.y - sur.pose.echelle * 300, z: 0 });
await page.waitForTimeout(250);
check("fond verrouillé : un clic de l'outil Calage ne pose aucun point", (await pas()) === pas0 && (await fonds())[0].points.length === 3);
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F1");
await panneau.waitFor();
await page.locator("[data-planche-commande='verrouiller-fond']").click();
await page.waitForFunction(() => !Object.values(window.fadiPlanche.modele().annotations.fonds)[0].verrouille);
check("la même commande déverrouille", true);
await page.screenshot({ path: `${OUT}/fonds-cale.png` });

// --- Supprimer le point, le fond ---------------------------------------------------------------------------------------
await page.locator("[data-planche-point-calage='C'] button").click();
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F6");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.fonds)[0].points.length === 2);
check("Ctrl+Alt+Maj+F6 supprime le point choisi", (await fonds())[0].points.map((p) => p.id).join() === "A,B");
const relu = await page.evaluate(() => JSON.parse(JSON.stringify(window.fadiPlanche.modele())).annotations.fonds);
check("persistance : le fond, son image et sa pose sont dans le modèle sérialisé", Object.values(relu).some((x) => x.image.startsWith("data:image/png") && x.cale && x.points.length === 2));
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F7");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations.fonds ?? {}).length === 0);
check("Ctrl+Alt+Maj+F7 supprime le fond", (await page.locator("[data-planche-fonds-vide]").count()) === 1);
await vue.focus();
await page.keyboard.press("Control+Z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations.fonds ?? {}).length === 1);
check("Annuler le rend", true);

// --- Ouverture au clavier ----------------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau='fonds'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+F1");
await panneau.waitFor();
check("Ctrl+Alt+Maj+F1 ouvre les fonds ; pas de bouton dans la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "fonds" && (await page.locator("[data-planche-panneau-icone='fonds']").count()) === 0);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette des fonds calés : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette des fonds calés : tous les contrôles passent.");
