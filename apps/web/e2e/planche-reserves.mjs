/**
 * Recette des réserves de chantier (cas 4, étape 7b : D11-F18-037 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7b) :
 * - outil Réserve (Ctrl+Maj+V) : un clic sur une face de la boîte groupée épingle la réserve 1 sur l'objet, en un pas ;
 *   le panneau Réserves s'ouvre sur sa fiche ; une épingle numérotée apparaît dans la vue ;
 * - fiche : lot, entreprise, échéance, description, photo (réduite en JPEG) ; une seconde réserve sur un point libre ;
 * - filtres par lot et statut ; Lever (Ctrl+Alt+1) datée du jour, puis Rouvrir ; Supprimer (Ctrl+Alt+2) ;
 * - panneau par Ctrl+Alt+Maj+8, en-tête avec icône et raccourci ; persistance relue ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-reserves node apps/web/e2e/planche-reserves.mjs
 */
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-reserves";
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
await inscrireDansLaPage(page, `reserves-${Date.now()}@example.com`, "planche-reserves-ci-123", BASE);
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
  await page.waitForTimeout(80);
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};
const vue = page.locator("[data-planche-vue]");
const reserves = async () => Object.values((await modele()).annotations?.reserves ?? {}).sort((a, b) => a.numero - b.numero);

// Boîte 4 × 3 × 2 m, groupée.
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
await page.keyboard.press("Space");
await vue.focus();
await page.keyboard.press("Control+A");
await page.keyboard.press("Control+G");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 1);
const occ = Object.keys((await modele()).racine.occurrences)[0];
await page.keyboard.press("Escape");

// --- Outil Réserve : épingle sur la face du dessus ---------------------------------------------------------------------
let pas0 = await pas();
await vue.focus();
await page.keyboard.press("Control+Shift+V");
check("Ctrl+Maj+V choisit l'outil Réserve", (await page.evaluate(() => window.fadiPlanche.outil())) === "reserve");
await cliquer({ x: centre.x + 0.5, y: centre.y + 0.4, z: 2 });
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
let rs = await reserves();
check("un clic épingle la réserve 1 sur l'objet, ouverte et datée du jour, en un pas", rs.length === 1 && rs[0].numero === 1 && rs[0].objet === occ && rs[0].statut === "ouverte" && /^\d{4}-\d{2}-\d{2}$/.test(rs[0].creee) && Math.abs(rs[0].point.z - 2) < 1e-6, JSON.stringify(rs[0] && { objet: rs[0].objet, z: rs[0].point.z }));
const panneau = page.locator("[data-planche-reserves]");
await panneau.waitFor();
check("le panneau Réserves s'ouvre sur sa fiche", (await page.evaluate(() => window.fadiPlanche.panneau())) === "reserves" && (await page.locator("[data-planche-reserve-fiche='1']").count()) === 1);
check("en-tête : icône et raccourci Ctrl+Alt+Maj+8", ((await page.locator("[data-planche-panneau='reserves'] [data-planche-panneau-raccourci]").textContent()) ?? "").includes("Ctrl+Alt+Maj+8") && (await page.locator("[data-planche-panneau='reserves'] .canevas-panneau-tete h3 svg").count()) === 1);
check("épingle « 1 » dans la vue (ouverte)", (await page.locator("[data-reserve][data-statut='ouverte']").count()) === 1 && ((await page.locator("[data-reserve]").first().textContent()) ?? "") === "1");
check("objet nommé dans la fiche", ((await page.locator("[data-planche-reserve-objet]").textContent()) ?? "").length > 0 && !((await page.locator("[data-planche-reserve-objet]").textContent()) ?? "").includes("Point libre"));

// --- Fiche ---------------------------------------------------------------------------------------------------------------
const champ = (c) => page.locator(`[data-planche-reserve-champ='${c}']`);
await champ("lot").fill("Menuiseries ext.");
await champ("lot").press("Enter");
await champ("entreprise").fill("Bois & Co");
await champ("entreprise").press("Enter");
await champ("echeance").fill("2026-12-12");
await champ("description").fill("Joint de calfeutrement absent en allège.");
await champ("lot").click();
await page.waitForTimeout(200);
const choix = page.waitForEvent("filechooser");
await page.locator("[data-planche-reserve-prendre-photo]").click();
await (await choix).setFiles({ name: "photo.png", mimeType: "image/png", buffer: png(2400, 1600) });
await page.waitForSelector("[data-planche-reserve-photo]");
rs = await reserves();
const photo = rs[0].photo ?? "";
check("fiche saisie : lot, entreprise, échéance, description", rs[0].lot === "Menuiseries ext." && rs[0].entreprise === "Bois & Co" && rs[0].echeance === "2026-12-12" && rs[0].description === "Joint de calfeutrement absent en allège.", JSON.stringify({ lot: rs[0].lot, e: rs[0].entreprise, d: rs[0].echeance }));
const dims = await page.locator("[data-planche-reserve-photo]").evaluate((img) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.src = img.src; }));
check("photo jointe : JPEG réduit à 1 280 px", photo.startsWith("data:image/jpeg;base64,") && dims[0] === 1280 && dims[1] === 853, `${dims} · ${photo.length} car.`);
check("input photo : appareil arrière sur tablette", (await page.locator("[data-planche-reserve-photo-fichier]").getAttribute("capture")) === "environment");
await page.screenshot({ path: `${OUT}/reserves-fiche.png` });

// --- Seconde réserve sur un point libre, filtres --------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+V");
pas0 = await pas();
await cliquer({ x: xMin - 1.5, y: yMin - 1, z: 0 });
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
rs = await reserves();
check("réserve 2 sur un point libre", rs.length === 2 && rs[1].numero === 2 && rs[1].objet === null);
await champ("lot").fill("Façades");
await champ("lot").press("Enter");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.reserves).some((r) => r.lot === "Façades"));
await page.locator("[data-planche-reserves-filtre='lot']").selectOption("Façades");
check("filtre par lot : seule la réserve 2", (await page.locator("[data-planche-reserve]").count()) === 1);
await page.locator("[data-planche-reserves-filtre='lot']").selectOption("");

// --- Lever, rouvrir, supprimer ------------------------------------------------------------------------------------------
await page.locator("[data-planche-reserve] button", { hasText: "1" }).first().click();
await vue.focus();
await page.keyboard.press("Control+Alt+Digit1");
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.reserves).some((r) => r.numero === 1 && r.statut === "levee"));
rs = await reserves();
check("Ctrl+Alt+1 lève la réserve 1, datée du jour", rs[0].statut === "levee" && rs[0].levee === rs[0].creee);
check("épingle levée dans la vue, numéro toujours écrit", (await page.locator("[data-reserve][data-statut='levee']").count()) === 1);
await page.locator("[data-planche-reserves-filtre='statut']").selectOption("ouverte");
check("filtre par statut : seule la réserve 2 ouverte", (await page.locator("[data-planche-reserve]").count()) === 1);
await page.locator("[data-planche-reserves-filtre='statut']").selectOption("");
await page.locator("[data-planche-commande='lever-reserve']").click();
await page.waitForFunction(() => Object.values(window.fadiPlanche.modele().annotations.reserves).every((r) => r.statut === "ouverte"));
check("la même commande rouvre la réserve levée", (await reserves())[0].levee === null);
await page.screenshot({ path: `${OUT}/reserves-liste.png` });
// Persistance : le modèle relu garde la photo.
const relu = await page.evaluate(() => JSON.parse(JSON.stringify(window.fadiPlanche.modele())).annotations.reserves);
check("persistance : la réserve et sa photo sont dans le modèle sérialisé", Object.values(relu).some((r) => r.photo && r.photo.startsWith("data:image/jpeg")));
await page.locator("[data-planche-reserve] button", { hasText: "2" }).first().click();
await vue.focus();
await page.keyboard.press("Control+Alt+Digit2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations.reserves).length === 1);
check("Ctrl+Alt+2 supprime la réserve choisie", (await reserves())[0].numero === 1);
await page.keyboard.press("Control+Z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations.reserves).length === 2);
check("Annuler la rend", true);

// --- Ouverture au clavier ------------------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau='reserves'] .canevas-fermer").evaluate((b) => b.click());
await vue.focus();
await page.keyboard.press("Control+Alt+Shift+Digit8");
await panneau.waitFor();
check("Ctrl+Alt+Maj+8 ouvre les réserves ; pas de bouton dans la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "reserves" && (await page.locator("[data-planche-panneau-icone='reserves']").count()) === 0);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette des réserves : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette des réserves : tous les contrôles passent.");
