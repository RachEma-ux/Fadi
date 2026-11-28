/**
 * Recette du PDF reçu (cas 4, lot C4, étape 4 : D10-F14-008, D10-F14-009, D10-S-004 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-4-pdf-recu.png`) :
 * - Ctrl+Maj+Espace puis P ouvre le panneau ; Ouvrir (…, Maj+P) lit un PDF de deux pages (contenu compressé) ;
 * - l'original est archivé en base et relu à l'identique ;
 * - page 1 vectorielle : traits, cercle reconstruit, échelle 1:100 proposée d'après le texte ;
 * - Barre d'échelle (…, B) : deux clics sur la barre de 50 mm, 5 m tapés, 1:100 concordante ;
 * - Confirmer (…, Maj+E), Mesurer (…, E) : 100 mm papier = 10 m ; Insérer (…, I) : groupe d'arêtes à l'échelle, un pas ;
 * - page 2 scannée : Poser en fond (…, F) à l'échelle de la page ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-pdf-recu node apps/web/e2e/planche-pdf-recu.mjs
 */
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-pdf-recu";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const PT = 72 / 25.4;
const mm = (v) => (v * PT).toFixed(4);
/** Cercle en quatre Bézier, centre (cx ; cy) et rayon r en millimètres. */
const cercle = (cx, cy, r) => {
  const k = 0.5522847498 * r;
  const P = (x, y) => `${mm(x)} ${mm(y)}`;
  return `${P(cx + r, cy)} m ${P(cx + r, cy + k)} ${P(cx + k, cy + r)} ${P(cx, cy + r)} c ${P(cx - k, cy + r)} ${P(cx - r, cy + k)} ${P(cx - r, cy)} c ${P(cx - r, cy - k)} ${P(cx - k, cy - r)} ${P(cx, cy - r)} c ${P(cx + k, cy - r)} ${P(cx + r, cy - k)} ${P(cx + r, cy)} c S`;
};

/** PDF de deux pages A4 : plan vectoriel compressé (page 1), image JPEG pleine page (page 2). */
function pdf(jpeg) {
  const plan = [
    "0.35 w",
    `${mm(20)} ${mm(150)} ${mm(100)} ${mm(50)} re S`,
    `${mm(70)} ${mm(150)} m ${mm(70)} ${mm(200)} l S`,
    cercle(95, 175, 10),
    `${mm(20)} ${mm(20)} m ${mm(70)} ${mm(20)} l S`,
    `${mm(20)} ${mm(18)} ${mm(50)} ${mm(2)} re f`,
    "BT /F1 9 Tf 150 60 Td (ECHELLE 1:100) Tj ET",
  ].join("\n");
  const z = deflateSync(Buffer.from(plan, "latin1"));
  const scan = `q ${mm(210)} 0 0 ${mm(297)} 0 0 cm /Im0 Do Q`;
  const parties = [];
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Contents 4 0 R >>",
    [`<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, z, "\nendstream"],
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Contents 6 0 R /Resources << /XObject << /Im0 7 0 R >> >> >>",
    `<< /Length ${scan.length} >>\nstream\n${scan}\nendstream`,
    [`<< /Type /XObject /Subtype /Image /Width 210 /Height 297 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"],
  ];
  parties.push(Buffer.from("%PDF-1.5\n%\xe2\xe3\xcf\xd3\n", "latin1"));
  objets.forEach((o, i) => {
    parties.push(Buffer.from(`${i + 1} 0 obj\n`, "latin1"));
    for (const x of [o].flat()) parties.push(typeof x === "string" ? Buffer.from(x, "latin1") : x);
    parties.push(Buffer.from("\nendobj\n", "latin1"));
  });
  parties.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parties);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `pdf-recu-${Date.now()}@example.com`, "planche-pdf-recu-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

// Un vrai JPEG (scan simulé) fabriqué par le navigateur.
const jpeg = Buffer.from(
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 210;
    c.height = 297;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 210, 297);
    g.strokeStyle = "#000";
    g.strokeRect(20, 20, 100, 50);
    const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
    return [...new Uint8Array(await b.arrayBuffer())];
  }),
);
const PDF = pdf(jpeg);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(touche);
};
/** Clic sur l'aperçu au point papier (mm, origine en bas à gauche). */
const cliquerApercu = async (x, y) => {
  const p = await page.evaluate(([x, y]) => {
    const g = document.querySelector("[data-planche-pdf-apercu] g");
    const q = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
    return { x: q.x, y: q.y };
  }, [x, y]);
  await page.mouse.click(p.x + 1, p.y - 1);
};

// --- Panneau et lecture -------------------------------------------------------------------------------------------------
await deuxTemps("p");
await page.locator("[data-planche-pdf]").waitFor();
check("Ctrl+Maj+Espace puis P ouvre le panneau PDF reçu", (await page.evaluate(() => window.fadiPlanche.panneau())) === "pdf-recu" && (await page.locator("[data-planche-pdf-vide]").count()) === 1);
const choix = page.waitForEvent("filechooser");
await deuxTemps("Shift+P");
await (await choix).setFiles({ name: "plan-ARCH-RDC.pdf", mimeType: "application/pdf", buffer: PDF });
await page.locator("[data-planche-pdf-page='2']").waitFor();
const p1 = page.locator("[data-planche-pdf-page='1']");
// Rectangle (4) + mur (1) + barre d'échelle (1) ; cercle reconstruit (1) ; aplat de la barre non repris.
check("Ouvrir (…, Maj+P) : deux pages, page 1 à 6 traits et 1 cercle reconstruit", (await p1.getAttribute("data-traits")) === "6" && (await p1.getAttribute("data-arcs")) === "1", `${await p1.getAttribute("data-traits")} traits, ${await p1.getAttribute("data-arcs")} arcs`);
check("page 2 : une image (scan)", (await page.locator("[data-planche-pdf-page='2']").getAttribute("data-images")) === "1");
await page.waitForFunction(() => (document.querySelector("[data-planche-pdf-fichier]")?.getAttribute("data-planche-pdf-fichier") ?? "") !== "");
const idFichier = await page.locator("[data-planche-pdf-fichier]").getAttribute("data-planche-pdf-fichier");
const lu = await page.evaluate(async (id) => { const x = await fetch(`/sandbox/references/${id}`, { credentials: "include" }); return { statut: x.status, octets: [...new Uint8Array(await x.arrayBuffer())] }; }, idFichier);
check("le PDF d'origine est archivé en base et relu à l'identique", lu.statut === 200 && Buffer.from(lu.octets).equals(PDF));
check("échelle 1:100 proposée d'après le texte de la page", (await page.locator("[data-planche-pdf-proposee]").getAttribute("data-planche-pdf-proposee")) === "100");
check("rien n'est insérable avant confirmation", await page.locator("[data-planche-commande='inserer-pdf']").isDisabled());

// --- Barre d'échelle ----------------------------------------------------------------------------------------------------
await deuxTemps("b");
await cliquerApercu(20, 20);
await cliquerApercu(70, 20);
await page.locator("[data-planche-pdf-longueur-barre]").fill("5");
const eb = await page.locator("[data-planche-pdf-echelle-barre]").getAttribute("data-planche-pdf-echelle-barre");
check("Barre d'échelle (…, B) : 50 mm pointés pour 5 m, soit 1:100, concordante", eb === "100.000" && ((await page.locator("[data-planche-pdf-echelle-barre]").textContent()) ?? "").includes("concordante"), eb ?? "");
await page.screenshot({ path: `${OUT}/barre-echelle.png` });

// --- Confirmer, mesurer --------------------------------------------------------------------------------------------------
await deuxTemps("Shift+E");
await page.waitForFunction(() => !document.querySelector("[data-planche-commande='inserer-pdf']").disabled);
check("Confirmer l'échelle (…, Maj+E) : 1:100", (await page.locator("[data-planche-pdf-echelle]").inputValue()) === "100");
await deuxTemps("e");
await cliquerApercu(20, 200);
await cliquerApercu(120, 200);
const mesure = await page.locator("[data-planche-pdf-mesure]").getAttribute("data-planche-pdf-mesure");
check("Mesurer (…, E) : 100 mm papier accrochés = 10,00 m à 1:100", mesure === "10.0000", mesure ?? "");
await page.screenshot({ path: `${OUT}/mesure.png` });

// --- Insérer ------------------------------------------------------------------------------------------------------------
await page.locator("[data-planche-pdf-origine='x']").fill("1");
const pas0 = await pas();
await deuxTemps("i");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 1);
const m = await modele();
const occ = Object.values(m.racine.occurrences)[0];
const def = m.definitions[occ.definition];
const xs = Object.values(def.contenu.sommets).map((s) => s.position);
const proche = (a, b) => Math.abs(a - b) < 1e-6;
check("Insérer (…, I) : un groupe nommé d'après le fichier et la page, un pas", def.nom === "plan-ARCH-RDC.pdf · p. 1" && (await pas()) === pas0 + 1 && (def.description ?? "").includes(idFichier), def.nom);
check("à l'échelle : coin (20 ; 150) mm → (1 + 2 ; 15) m, au niveau ± 0,00", xs.some((p) => proche(p.x, 3) && proche(p.y, 15) && proche(p.z, 0)) && xs.some((p) => proche(p.x, 13) && proche(p.y, 20)), JSON.stringify(xs.slice(0, 4)));
check("le cercle est une vraie courbe (rayon 1 m)", Object.values(def.contenu.courbes).some((c) => c.genre === "cercle" && Math.abs(c.rayon - 1) < 1e-4), JSON.stringify(Object.values(def.contenu.courbes).map((c) => [c.genre, c.rayon])));
await page.screenshot({ path: `${OUT}/inseree.png` });
await vue.focus();
await page.keyboard.press("Control+z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 0);
check("Annuler retire la page insérée", true);

// --- Page scannée en fond -------------------------------------------------------------------------------------------------
await deuxTemps("p");
await page.locator("[data-planche-pdf-page='2'] button").click();
check("page scannée : insertion refusée, échelle à confirmer", await page.locator("[data-planche-commande='poser-fond-pdf']").isDisabled());
await page.locator("[data-planche-pdf-echelle]").fill("50");
await deuxTemps("Shift+E");
await deuxTemps("f");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.fonds ?? {}).length === 1, null, { timeout: 30000 });
const fond = Object.values((await modele()).annotations.fonds)[0];
// Page A4 à 1:50 : 210 mm = 10,5 m de large, origine X = 1.
const largeur = fond.pose.echelle * fond.largeurPx;
check("Poser en fond (…, F) : la page A4 à 1:50 mesure 10,5 m, coin haut gauche en (1 ; 14,85)", Math.abs(largeur - 10.5) < 1e-6 && proche(fond.pose.x, 1) && Math.abs(fond.pose.y - 14.85) < 1e-6 && fond.cale && !!fond.original, JSON.stringify(fond.pose));

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette du PDF reçu : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette du PDF reçu : tous les contrôles passent.");
