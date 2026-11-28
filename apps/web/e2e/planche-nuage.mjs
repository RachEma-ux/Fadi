/**
 * Recette « Nuage de points » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 7f : D10-F23a-009) :
 * - Ctrl+Maj+Espace, Maj+I, N ouvre « Nuage de points » ; sans nuage, le panneau propose de charger un relevé ;
 * - LAZ et E57 refusés avec leur motif ;
 * - un relevé LAS géoréférencé (pièce de 9,60 × 7,60 m, mur de refend) est archivé et posé en référence verrouillée,
 *   coin minimal à l'origine : fichier, points, boîte de découpe et points de la tranche affichés ;
 * - l'outil Ligne s'accroche à un point mesuré de la tranche avec l'écart au point visé ;
 * - une poignée de la boîte, glissée dans la vue, réduit la boîte et la tranche ;
 * - points choisis au clic (outil Sélection) sur le mur est : trois dans une seule tranche sont refusés (presque
 *   alignés) ; six dans deux tranches, Maj+N ajuste un plan, écarts en millimètres ;
 * - après rechargement, le nuage est relu de l'archive ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-nuage node apps/web/e2e/planche-nuage.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-nuage";
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
await inscrireDansLaPage(page, `nuage-${Date.now()}@example.com`, "planche-nuage-ci-123", BASE);
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

const ecran = async (q) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};

/** LAS 1.2, format de point 0, échelle 0,001 m, décalage (2 600 000 ; 1 200 000 ; 400) : relevé de démonstration. */
function las(points) {
  const debut = 227;
  const o = Buffer.alloc(debut + points.length * 20);
  o.write("LASF", 0, "latin1");
  o[24] = 1;
  o[25] = 2;
  o.writeUInt16LE(debut, 94);
  o.writeUInt32LE(debut, 96);
  o[104] = 0;
  o.writeUInt16LE(20, 105);
  o.writeUInt32LE(points.length, 107);
  [0.001, 0.001, 0.001, 2_600_000, 1_200_000, 400].forEach((v, i) => o.writeDoubleLE(v, 131 + i * 8));
  points.forEach(([x, y, z], i) => {
    const b = debut + i * 20;
    o.writeInt32LE(Math.round(x / 0.001), b);
    o.writeInt32LE(Math.round(y / 0.001), b + 4);
    o.writeInt32LE(Math.round(z / 0.001), b + 8);
  });
  return o;
}
// Murs d'une pièce de 9,60 × 7,60 m et un refend, points tous les 5 cm sur 2,50 m de haut, bruit de 0 à 3 mm (positif :
// le coin minimal reste à 0). Mur est : six points repérés, trois à 1,10 m et trois à 2,00 m, écartés de 0 à 3 mm du nu
// x = 9,60 m.
let graine = 7;
const bruit = () => ((graine = (graine * 9301 + 49297) % 233280) / 233280) * 0.003;
const pts = [[0, 0, 0]];
const mur = (x1, y1, x2, y2) => {
  const n = Math.round(Math.hypot(x2 - x1, y2 - y1) / 0.05);
  for (let i = 0; i <= n; i++) for (let k = 0; k <= 50; k++) pts.push([x1 + ((x2 - x1) * i) / n + bruit(), y1 + ((y2 - y1) * i) / n + bruit(), k * 0.05]);
};
mur(0, 0, 9.6, 0);
mur(9.6, 0, 9.6, 7.6);
mur(9.6, 7.6, 0, 7.6);
mur(0, 7.6, 0, 0);
mur(4.4, 0, 4.4, 3.6);
mur(4.4, 3.6, 9.6, 3.6);
const reperes = [0.825, 1.825, 2.825, 4.325, 5.325, 6.325].map((y, i) => [9.6 + [0, 0.003, 0.001, 0.002, 0.003, 0][i], y, i % 2 ? 2 : 1.1]);
pts.push(...reperes);
const fichierLas = las(pts.map(([x, y, z]) => [x, y, z]));

await troisTemps("Shift+I", "n");
const pan = page.locator("[data-planche-nuage]");
await pan.waitFor();
check("Ctrl+Maj+Espace, Maj+I, N ouvre « Nuage de points »", (await panneau()) === "nuage");
const tete = (await page.locator("[data-planche-panneau='nuage'] [data-planche-panneau-raccourci]").textContent()) ?? "";
check("l'en-tête montre l'icône et le raccourci en trois temps", tete.includes("Maj+I") && tete.trim().endsWith("N") && (await page.locator("[data-planche-panneau='nuage'] h3 svg").count()) === 1, tete);
check("sans nuage : le panneau propose de charger un relevé", (await pan.locator("[data-planche-nuage-vide]").count()) === 1 && (await pan.locator("[data-planche-commande='charger-reference']").count()) === 1);
const ajuster = () => pan.locator("[data-planche-commande='ajuster-plan-nuage']");

const charger = async (nom, octets) => {
  const [choix] = await Promise.all([page.waitForEvent("filechooser"), pan.locator("[data-planche-commande='charger-reference']").click()]);
  await choix.setFiles({ name: nom, mimeType: "application/octet-stream", buffer: octets });
  await page.waitForTimeout(400);
};
await charger("releve.laz", Buffer.from("LASF"));
check("LAZ refusé avec son motif", ((await pan.locator("[data-planche-nuage-erreur]").textContent()) ?? "").includes("LAZ"));
await charger("releve.e57", Buffer.from("ASTM-E57"));
check("E57 refusé avec son motif", ((await pan.locator("[data-planche-nuage-erreur]").textContent()) ?? "").includes("E57"));

await charger("releve-rez.las", fichierLas);
await pan.locator("[data-planche-nuage-fiche]").waitFor();
await page.waitForFunction(() => !!window.fadiPlanche.poigneesNuage());
const fiche = (await pan.locator("[data-planche-nuage-fiche]").textContent()) ?? "";
const chiffres = (t) => t.replace(/[\s\u00a0\u202f\u2019']/g, "");
const total = String(pts.length);
check("relevé archivé et posé : fichier, points, unité", fiche.includes("releve-rez.las (archivé)") && chiffres(fiche).includes(`${total},affichés${total}`) && fiche.includes("mètre, Z vertical"), fiche);
const ref = await page.evaluate(() => Object.values(window.fadiPlanche.modele().annotations?.references ?? {})[0]);
check("posé en référence verrouillée, coin minimal à l'origine", ref?.format === "las" && ref?.verrouille === true && ref?.nuage?.points === pts.length && Math.abs(ref.placement.x + 2_600_000) < 1e-6 && Math.abs(ref.placement.z + 400) < 1e-6, JSON.stringify(ref?.placement));
const boite1 = (await pan.locator("[data-planche-nuage-boite]").textContent()) ?? "";
const dansTranche = (t) => Number((/(\d[\d\s\u202f\u2019']*) points dans la tranche/.exec(t)?.[1] ?? "0").replace(/\D/g, ""));
check("boîte de découpe 9,60 × 7,60 m et points de la tranche", boite1.includes("9,60 × 7,60 m") && dansTranche(boite1) > 0, boite1);
check("Ajuster un plan grisé sans trois points choisis, Maj+N affiché", (await ajuster().isDisabled()) && ((await ajuster().textContent()) ?? "").includes("Maj+N") && ((await ajuster().getAttribute("title")) ?? "").includes("trois points"));
check("la bulle « poignées dans la vue » est posée sur la vue", await page.locator("[data-planche-nuage-bulle]").isVisible());

await page.screenshot({ path: `${OUT}/nuage.png` });

// Accrochage : outil Ligne, survol d'un point repéré du mur est.
await vue.focus();
await page.keyboard.press("l");
const r0 = await ecran({ x: 9.6, y: 0.825, z: 1.1 });
await page.mouse.move(r0.x - 30, r0.y, { steps: 3 });
await page.mouse.move(r0.x + 1, r0.y, { steps: 6 });
await page.waitForTimeout(150);
const bulle = (await page.locator(".planche-infobulle").textContent()) ?? "";
check("la Ligne s'accroche à un point mesuré, écart au point visé affiché", /Point mesuré · écart au point visé \d+ mm/.test(bulle), bulle);
await page.keyboard.press("Escape");

// Poignée nord-est glissée vers le centre : boîte et tranche réduites.
const coins = await page.evaluate(() => window.fadiPlanche.poigneesNuage());
const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
const ne = { x: b.x + coins[2].x, y: b.y + coins[2].y };
const cible = await ecran({ x: 7, y: 5, z: 1.1 });
await page.mouse.move(ne.x, ne.y);
await page.mouse.down();
await page.mouse.move(cible.x, cible.y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
const boite2 = (await pan.locator("[data-planche-nuage-boite]").textContent()) ?? "";
check("une poignée glissée dans la vue règle la boîte, la tranche suit", /7,0\d × 5,0\d m/.test(boite2) && dansTranche(boite2) < dansTranche(boite1), boite2);
await page.mouse.move(ne.x - 200, ne.y + 200);
// Boîte rendue entière pour choisir les points du mur est.
await page.mouse.move(cible.x, cible.y);
await page.mouse.down();
await page.mouse.move(ne.x + 40, ne.y - 40, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);

// Points choisis au clic (outil Sélection) dans la tranche à 1,10 m, puis dans une tranche à 2,00 m ; Maj+N ajuste un plan.
const choisir = async (liste) => {
  await vue.focus();
  await page.keyboard.press("Space");
  for (const [x, y, z] of liste) {
    const e = await ecran({ x, y, z });
    await page.mouse.move(e.x, e.y, { steps: 2 });
    await page.mouse.click(e.x, e.y);
    await page.waitForTimeout(60);
  }
};
const majN = async () => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press("Shift+I");
  await page.waitForTimeout(60);
  await page.keyboard.press("Shift+N");
  await page.waitForTimeout(150);
};
await choisir(reperes.filter((r) => r[2] === 1.1));
check("Ajuster un plan disponible à trois points choisis", !(await ajuster().isDisabled()));
await majN();
check("trois points d'une seule tranche le long du mur : presque alignés, refus nommé", ((await pan.locator("[data-planche-nuage-erreur]").textContent()) ?? "").includes("presque alignés"));
await pan.locator("[data-planche-nuage-altitude]").fill("2000");
await page.waitForTimeout(100);
await choisir(reperes.filter((r) => r[2] === 2));
const choisis = (await pan.locator("[data-planche-nuage-resultat]").textContent()) ?? "";
check("six points mesurés choisis au clic, dans deux tranches", choisis.includes("Points choisis : 6"), choisis);
await majN();
const res = (await pan.locator("[data-planche-nuage-resultat='plan']").textContent()) ?? "";
const mm = /écart quadratique moyen (\d+) mm, plus grand écart (\d+) mm/.exec(res);
check("Maj+N : plan ajusté sur 6 points, écarts de quelques millimètres", !!mm && res.includes("6 points choisis") && Number(mm[1]) <= 3 && Number(mm[2]) <= 4, res);
await page.screenshot({ path: `${OUT}/plan-ajuste.png` });

// Tranche hors du relevé : aucun point, rien à accrocher.
await pan.locator("[data-planche-nuage-altitude]").fill("9000");
check("tranche hors du relevé : aucun point", dansTranche((await pan.locator("[data-planche-nuage-boite]").textContent()) ?? "") === 0);
await pan.locator("[data-planche-nuage-altitude]").fill("1100");

await page.reload();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);
await troisTemps("Shift+I", "n");
await pan.waitFor();
await page.waitForFunction(() => !!window.fadiPlanche.poigneesNuage(), null, { timeout: 30000 }).catch(() => {});
check("après rechargement : le nuage est relu de l'archive", chiffres((await pan.locator("[data-planche-nuage-fiche]").textContent()) ?? "").includes(`${total},affichés${total}`) && dansTranche((await pan.locator("[data-planche-nuage-boite]").textContent()) ?? "") > 0);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs) {
  console.log(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette nuage de points : tout est conforme.");
