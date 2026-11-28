/**
 * Recette « Lot d'échange daté » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 7e : D10-F14-082) :
 * - Ctrl+Maj+Espace, Maj+I, L ouvre « Lot d'échange » avec l'aperçu du manifeste posé sur la vue ;
 * - sans nom de jeu, Émettre est grisé avec son motif ; DXF et PDF des feuilles cochés sans feuille : refus nommé ;
 * - jeu « DCE lot 02 », IFC structuré et image PNG de la vue, destinataire saisi : Maj+L écrit une archive datée
 *   (sorties, un rapport par sortie, manifeste d'empreintes SHA-256 vérifiées) ;
 * - le registre d'émission montre le lot, le jeu est enregistré ; tous deux restent après rechargement ;
 * - aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-lot-echange node apps/web/e2e/planche-lot-echange.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-lot-echange";
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
await inscrireDansLaPage(page, `lot-echange-${Date.now()}@example.com`, "planche-lot-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const vue = page.locator("[data-planche-vue]");
const panneau = () => page.evaluate(() => window.fadiPlanche.panneau());
/** Trois temps : Ctrl+Maj+Espace, la porte de la famille, puis la touche de la commande. */
const troisTemps = async (porte, touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(porte);
  await page.waitForTimeout(60);
  await page.keyboard.press(touche);
  await page.waitForTimeout(120);
};

// Une boîte 4 × 3 × 2,5 m : rectangle, puis Pousser/Tirer.
const ecran = async (q) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
};
const cliquer = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(50);
};
await vue.focus();
await page.keyboard.press("r");
await cliquer({ x: 0, y: 0, z: 0 });
const coin = await ecran({ x: 2, y: 1.5, z: 0 });
await page.mouse.move(coin.x, coin.y, { steps: 4 });
await saisir("4;3");
await page.keyboard.press("p");
await cliquer({ x: 2, y: 1.5, z: 0 });
await saisir("2,5");
await page.keyboard.press("Escape");
await vue.focus();
await page.keyboard.press(" ");
const faces = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.faces).length);
check("boîte dessinée (6 faces)", faces === 6, String(faces));

await troisTemps("Shift+I", "l");
const pan = page.locator("[data-planche-lot]");
await pan.waitFor();
check("Ctrl+Maj+Espace, Maj+I, L ouvre « Lot d'échange »", (await panneau()) === "lot-echange");
const tete = (await page.locator("[data-planche-panneau='lot-echange'] [data-planche-panneau-raccourci]").textContent()) ?? "";
check("l'en-tête montre l'icône et le raccourci en trois temps", tete.includes("Maj+I") && tete.trim().endsWith("L") && (await page.locator("[data-planche-panneau='lot-echange'] h3 svg").count()) === 1, tete);
check("l'aperçu du manifeste est posé sur la vue", await page.locator("[data-planche-lot-apercu]").isVisible());
const emettre = pan.locator("[data-planche-commande='emettre-lot']");
check("sans nom de jeu : Émettre grisé avec son motif", (await emettre.isDisabled()) && ((await emettre.getAttribute("title")) ?? "").includes("Nommez le jeu"));
check("le bouton rappelle Maj+L et porte son icône", ((await emettre.textContent()) ?? "").includes("Maj+L") && (await emettre.locator("svg").count()) === 1);
check("sorties cochées par défaut : IFC, DXF, PDF, CSV", (await pan.locator("[data-planche-lot-sortie]:checked").evaluateAll((l) => l.map((x) => x.getAttribute("data-planche-lot-sortie")).join(","))) === "ifc,dxf,pdf,csv");
check("détails : schéma IFC et « aucune feuille »", ((await pan.locator("label:has([data-planche-lot-sortie='ifc'])").textContent()) ?? "").includes("IFC4") && ((await pan.locator("label:has([data-planche-lot-sortie='dxf'])").textContent()) ?? "").includes("aucune feuille"));

await pan.locator("[data-planche-lot-nom]").fill("DCE lot 02");
await pan.locator("[data-planche-lot-destinataire]").fill("bureau d'ingénieurs");
await page.waitForTimeout(100);
const apercu = (await page.locator("[data-planche-lot-manifeste]").textContent()) ?? "";
check("aperçu : lot, Planche, destinataire, noms des sorties", apercu.includes("Lot « DCE lot 02 »") && apercu.includes("Destinataire : bureau d'ingénieurs (saisi)") && apercu.includes("-DCE02-modele.ifc") && apercu.includes("rapports/"), apercu.split("\n")[0]);
check("aperçu : nom de l'archive daté", /-DCE02-\d{4}-\d\d-\d\d\.zip$/.test(((await page.locator("[data-planche-lot-archive]").textContent()) ?? "").trim()));
await page.screenshot({ path: `${OUT}/panneau.png` });

await emettre.click();
await page.waitForTimeout(200);
check("DXF des feuilles coché sans feuille : l'émission s'arrête avec son motif", ((await pan.locator("[data-planche-lot-erreur]").textContent()) ?? "").includes("aucune feuille"));

for (const s of ["dxf", "pdf", "csv"]) await pan.locator(`[data-planche-lot-sortie='${s}']`).uncheck();
await pan.locator("[data-planche-lot-sortie='png']").check();
const attente = page.waitForEvent("download");
await troisTemps("Shift+I", "Shift+L");
const telechargement = await attente;
const nom = telechargement.suggestedFilename();
check("Maj+L écrit une archive datée", /-DCE02-\d{4}-\d\d-\d\d\.zip$/.test(nom), nom);
const chemin = resolve(OUT, nom);
await telechargement.saveAs(chemin);

// Archive « stockée » : entrées lues par leur en-tête local.
const zip = readFileSync(chemin);
const entrees = new Map();
for (let i = 0; i + 30 <= zip.length && zip.readUInt32LE(i) === 0x04034b50; ) {
  const taille = zip.readUInt32LE(i + 18), n = zip.readUInt16LE(i + 26), x = zip.readUInt16LE(i + 28);
  const nomEntree = zip.subarray(i + 30, i + 30 + n).toString("utf8");
  entrees.set(nomEntree, zip.subarray(i + 30 + n + x, i + 30 + n + x + taille));
  i += 30 + n + x + taille;
}
const noms = [...entrees.keys()];
check("archive : 2 sorties, 2 rapports, le manifeste", noms.length === 5 && noms.some((x) => x.endsWith("-DCE02-modele.ifc")) && noms.some((x) => x.endsWith("-DCE02-vue.png")) && noms.filter((x) => x.startsWith("rapports/")).length === 2 && noms.includes("manifeste.txt"), noms.join(", "));
const manifeste = entrees.get("manifeste.txt")?.toString("utf8") ?? "";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const justes = noms.filter((x) => x !== "manifeste.txt").every((x) => manifeste.includes(sha(entrees.get(x))));
check("manifeste : empreinte SHA-256 juste de chaque fichier rangé", justes && manifeste.includes("Destinataire : bureau d'ingénieurs"), manifeste.split("\n")[0]);
check("IFC rangé lisible (ISO-10303-21)", (entrees.get(noms.find((x) => x.endsWith(".ifc")))?.toString("utf8") ?? "").startsWith("ISO-10303-21;"));
check("PNG rangé (signature PNG)", entrees.get(noms.find((x) => x.endsWith(".png")))?.subarray(1, 4).toString("ascii") === "PNG");
const note = (await pan.locator("[data-planche-lot-note]").textContent()) ?? "";
check("la note dit ce qui est écrit", note.includes(nom) && note.includes("5 fichiers"), note);
const ligne = await pan.locator("[data-planche-lot-registre] tbody tr").first().allTextContents();
check("registre d'émission : le lot, son jeu, son destinataire et son manifeste", (await pan.locator("[data-planche-lot-registre] tbody tr").count()) === 1 && ligne[0].includes("DCE lot 02") && ligne[0].includes("bureau d'ingénieurs") && ligne[0].includes(sha(entrees.get("manifeste.txt")).slice(0, 4)), ligne[0]);
check("le jeu est enregistré", (await pan.locator("[data-planche-lot-jeux] option").allTextContents()).includes("DCE lot 02"));
await page.screenshot({ path: `${OUT}/emis.png` });

await page.reload();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);
await troisTemps("Shift+I", "l");
await pan.waitFor();
check("après rechargement : registre et jeu restent dans la Planche", (await pan.locator("[data-planche-lot-registre] tbody tr").count()) === 1 && (await pan.locator("[data-planche-lot-jeux] option").allTextContents()).includes("DCE lot 02"));

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs) {
  console.log(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette lot d'échange : tout est conforme.");
