/**
 * Recette « Redresser une photo » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 7c : D10-F23a-003) :
 * - Ctrl+Maj+Espace puis Z ouvre « Redresser une photo » ; sans photo, Poser est grisé avec son motif ;
 * - une photo de façade prise de biais (rectangle 4 × 3 m en perspective) est lue ; les quatre coins sont pointés au
 *   clic, la loupe suit le pointeur ; sans dimensions, Poser reste grisé ;
 * - un point de contrôle au croisement des diagonales (centre du rectangle) : résidus « non évalués » avant sa saisie,
 *   écart faible quand il est juste, alerte de façade non plane quand il est faux ;
 * - Maj+R pose la photo redressée en fond, dans un plan vertical (origine, azimut), en un pas ; la photo d'origine est
 *   archivée en base ; Annuler retire tout ; Q efface les points ;
 * - chaque commande : icône et raccourci ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-redressement node apps/web/e2e/planche-redressement.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-redressement";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

// Photo 800 × 600 : la façade (rectangle 4 × 3 m) vue de biais, coins bas gauche, bas droit, haut droit, haut gauche.
const L = 800, H = 600;
const COINS = [[100, 520], [700, 560], [650, 80], [140, 120]];
// Centre du rectangle = croisement des diagonales de sa vue en perspective.
const croisement = (() => {
  const [[x1, y1], , [x3, y3]] = COINS;
  const [, [x2, y2], , [x4, y4]] = COINS;
  const d = (x1 - x3) * (y2 - y4) - (y1 - y3) * (x2 - x4);
  const a = x1 * y3 - y1 * x3, b = x2 * y4 - y2 * x4;
  return [(a * (x2 - x4) - (x1 - x3) * b) / d, (a * (y2 - y4) - (y1 - y3) * b) / d];
})();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `redressement-${Date.now()}@example.com`, "planche-redr-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const photo = Buffer.from(
  (
    await page.evaluate(
      ({ L, H, COINS }) => {
        const c = document.createElement("canvas");
        c.width = L;
        c.height = H;
        const g = c.getContext("2d");
        g.fillStyle = "#87a";
        g.fillRect(0, 0, L, H);
        g.fillStyle = "#ddd";
        g.beginPath();
        COINS.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
        return c.toDataURL("image/png");
      },
      { L, H, COINS },
    )
  ).split(",")[1],
  "base64",
);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(touche);
  await page.waitForTimeout(80);
};
const archives = [];
page.on("request", (r) => {
  if (r.method() === "POST" && r.url().endsWith("/sandbox/fonds")) archives.push(r.url());
});

await deuxTemps("z");
const pan = page.locator("[data-planche-redressement]");
await pan.waitFor();
check("Ctrl+Maj+Espace puis Z ouvre « Redresser une photo », hors de la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "redressement" && (await page.locator("[data-planche-panneau-icone='redressement']").count()) === 0);
check("sans photo : Poser grisé avec son motif", (await pan.locator("[data-planche-commande='poser-redressee']").isDisabled()) && ((await pan.locator("[data-planche-commande='poser-redressee']").getAttribute("title")) ?? "").includes("Choisissez d'abord une photo"));
await page.locator("[data-planche-redressement-entree]").setInputFiles({ name: "facade.png", mimeType: "image/png", buffer: photo });
const toile = pan.locator("[data-planche-redressement-photo]");
await toile.waitFor();
await page.waitForTimeout(300);
check("photo lue (800 × 600 px)", ((await pan.locator("[data-planche-redressement-lu]").textContent()) ?? "").includes("facade.png · 800 × 600 px"));
let boite = await toile.boundingBox();
// Le panneau grandit à mesure des saisies : la position de la photo est relue avant chaque pointé.
const viser = async ([u, v]) => {
  await toile.scrollIntoViewIfNeeded();
  boite = await toile.boundingBox();
  await page.mouse.move(boite.x + (u / L) * boite.width, boite.y + (v / H) * boite.height);
  await page.mouse.down();
  await page.mouse.up();
};
await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
check("la loupe suit le pointeur", (await pan.locator("[data-planche-redressement-loupe]").count()) === 1);
for (const c of COINS) await viser(c);
check("quatre coins pointés", ((await pan.locator("[data-planche-redressement-coins]").textContent()) ?? "").includes("4 sur 4") && (await pan.getAttribute("data-planche-redressement")) === "4");
check("sans dimensions : Poser grisé avec son motif", ((await pan.locator("[data-planche-commande='poser-redressee']").getAttribute("title")) ?? "").includes("Saisissez la largeur et la hauteur"));
await pan.locator("[data-planche-redressement-champ='largeur']").fill("4");
await pan.locator("[data-planche-redressement-champ='hauteur']").fill("3");
check("résidus non évalués sans point de contrôle", ((await pan.locator("[data-planche-redressement-residus]").textContent()) ?? "").includes("non évalués"));
await viser(croisement);
await pan.locator("[data-planche-redressement-controle='E-s']").fill("2");
await pan.locator("[data-planche-redressement-controle='E-t']").fill("1,5");
const juste = (await pan.locator("[data-planche-redressement-residus]").textContent()) ?? "";
const ecart = Number((/E : ([\d,]+) m/.exec(juste)?.[1] ?? "9").replace(",", "."));
check("contrôle au centre : écart faible (pointé au clic), sans alerte", ecart < 0.03 && (await pan.locator("[data-planche-redressement-alerte]").count()) === 0, juste);
await pan.locator("[data-planche-redressement-controle='E-s']").fill("2,5");
check("contrôle faux de 50 cm : alerte de façade non plane", (await pan.locator("[data-planche-redressement-alerte]").count()) === 1);
await pan.locator("[data-planche-redressement-controle='E-s']").fill("2");
await pan.locator("[data-planche-redressement-champ='x']").fill("1");
await pan.locator("[data-planche-redressement-champ='y']").fill("2");
await pan.locator("[data-planche-redressement-champ='azimut']").fill("90");
await page.screenshot({ path: `${OUT}/01-pointe.png` });
const pas0 = await pas();
await deuxTemps("Shift+R");
await page.waitForFunction(() => !!document.querySelector("[data-planche-redressement-note], [data-planche-redressement-erreur]"));
check("Maj+R : aucune erreur", (await pan.locator("[data-planche-redressement-erreur]").count()) === 0, (await pan.locator("[data-planche-redressement-erreur]").textContent().catch(() => "")) ?? "");
const m = await modele();
const fonds = Object.values(m.annotations?.fonds ?? {});
const f = fonds[0];
check("Maj+R : un seul pas, un fond posé", (await pas()) === pas0 + 1 && fonds.length === 1);
check("fond vertical : origine (1 ; 2), azimut 90°, rectangle 4 × 3 m journalisé", !!f?.vertical && f.vertical.x === 1 && f.vertical.y === 2 && Math.abs(f.vertical.azimut - Math.PI / 2) < 1e-9 && f.vertical.redressement.largeur === 4 && f.vertical.redressement.hauteur === 3 && f.vertical.redressement.controles === 1 && f.cale === true, JSON.stringify(f?.vertical));
// Le rectangle va de s = 0 à 4 : son bord gauche (s = 0) tombe sur l'origine ; échelle d'environ 4 m pour la largeur.
const s0 = f.pose.x, sMax = f.pose.x + f.pose.echelle * f.largeurPx;
check("le cadre redressé couvre le rectangle (s de 0 à 4 m)", s0 <= 0.01 && sMax >= 3.99, `${s0} → ${sMax}`);
check("la photo d'origine est archivée en base", archives.length === 1 && !!f.original);
await page.screenshot({ path: `${OUT}/02-pose.png` });
// Vue du fond redressé dans son plan vertical : panneau fermé, dessin cadré.
await page.locator("[data-planche-panneau='redressement'] .canevas-fermer").click();
await page.getByRole("button", { name: "Cadrer" }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/03-fond-vertical.png` });
await vue.focus();
await page.keyboard.press("Control+z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.fonds ?? {}).length === 0);
check("Annuler retire le fond redressé", true);
await deuxTemps("Shift+X");
check("Q efface les points pointés", (await pan.getAttribute("data-planche-redressement")) === "0");

let regle = true;
for (const [id, r] of [["poser-redressee", "Maj+R"], ["effacer-points-redressement", "Maj+X"]]) regle &&= ((await pan.locator(`[data-planche-commande='${id}']`).getAttribute("title")) ?? "").includes(`Ctrl+Maj+Espace, ${r}`) && (await pan.locator(`[data-planche-commande='${id}'] svg`).count()) === 1;
check("chaque commande du panneau : icône et raccourci", regle);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette du redressement : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette du redressement : tous les contrôles passent.");
