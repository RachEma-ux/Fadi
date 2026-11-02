#!/usr/bin/env node
/**
 * Recette du chantier Axes, lot AX-4 (phase C ; concept Axes 1.0, § 7 ; AX10 à AX12) dans le Sandbox :
 * - « Changer les axes » (menu contextuel) et Maj + F4 ouvrent l'édition d'origine du composant ;
 * - AX10 : objet, définition et nombre d'occurrences montrés avant l'aperçu ; portée « toutes » (dont celles hors de la
 *   sélection) : origine au centre de la base, AUCUN sommet monde ne bouge, un seul pas, Annuler rétablit tout ;
 * - portée « cette occurrence » : la copie est rendue unique, l'autre occurrence garde sa définition ;
 * - orientation alignée sur le repère de travail ; refus d'un point libre non numérique ;
 * - AX12 : lot de deux objets (définitions distinctes), un seul pas ;
 * - aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/sandbox-origine node apps/web/e2e/sandbox-origine.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/sandbox-origine";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => erreurs.push(e.message));

const vue = () => page.locator("[data-planche-vue]");
const touche = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(90);
};
const ecran = async (q) => {
  const b = await page.locator("[data-planche-vue] canvas").boundingBox();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};
const cliquer = async (q, options = {}) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.click(e.x, e.y, options);
  await page.waitForTimeout(80);
};
/** Sommets monde de tout le modèle, arrondis au µm : « rien n'a bougé ». */
const monde = () =>
  page.evaluate(() => {
    const m = window.fadiPlanche.modele();
    const r = [];
    const mul = (A, B) => A.map((_, i) => { const l = Math.floor(i / 4), c = i % 4; let x = 0; for (let k = 0; k < 4; k++) x += A[l * 4 + k] * B[k * 4 + c]; return x; });
    const app = (M, p) => [M[0] * p.x + M[1] * p.y + M[2] * p.z + M[3], M[4] * p.x + M[5] * p.y + M[6] * p.z + M[7], M[8] * p.x + M[9] * p.y + M[10] * p.z + M[11]];
    const parcourir = (c, M) => {
      for (const s of Object.values(c.sommets)) r.push(app(M, s.position).map((x) => (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6)).join(","));
      for (const o of Object.values(c.occurrences)) parcourir(m.definitions[o.definition].contenu, mul(M, o.transformation));
    };
    parcourir(m.racine, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return r.sort().join(";");
  });
const etat = () =>
  page.evaluate(() => {
    const P = window.fadiPlanche;
    const m = P.modele();
    return { pas: P.pas(), selection: P.selection(), occurrences: Object.values(m.racine.occurrences).map((o) => ({ id: o.id, definition: o.definition, t: o.transformation })), definitions: Object.keys(m.definitions).length };
  });

try {
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `origine-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "sandbox-origine-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  await page.waitForTimeout(400);
  await vue().focus();

  // Un rectangle 2 × 1 m, groupé (Ctrl + G), copié-collé : deux occurrences d'une même définition.
  await touche("r");
  await cliquer({ x: 1, y: 1, z: 0 });
  await cliquer({ x: 3, y: 2, z: 0 });
  await touche("Space");
  await touche("Control+a");
  await touche("Control+g");
  await touche("Control+c");
  await touche("Control+v");
  let e = await etat();
  check("deux occurrences d'une même définition, la copie sélectionnée", e.occurrences.length === 2 && e.occurrences[0].definition === e.occurrences[1].definition && e.selection.length === 1, JSON.stringify(e.occurrences.map((o) => o.definition)));
  const copie = e.selection[0];

  // Maj + F4 : panneau, objet et portée annoncés avant l'aperçu.
  await vue().focus();
  await touche("Shift+F4");
  const panneau = page.locator("[data-planche-origine]");
  check("Maj + F4 : édition d'origine ouverte", (await panneau.count()) === 1);
  check("AX10 : objet et définition partagée par 2 occurrences annoncés", /partagée par 2 occurrence/.test(await page.locator("[data-origine-objet]").innerText()), await page.locator("[data-origine-objet]").innerText());
  check("AX10 : portée « toutes » : 2 occurrences, dont 1 hors de la sélection", /2, dont 1 hors de la sélection/.test(await panneau.innerText()));
  await page.click('[data-origine-preset="base"]');
  check("aperçu : nouvelle origine monde annoncée", /Nouvelle origine \(monde\)/.test(await page.locator("[data-origine-apercu]").innerText()));
  const avant = await monde();
  const pas0 = (await etat()).pas;
  await page.click("[data-origine-appliquer]");
  e = await etat();
  check("AX10 : appliqué en un pas, aucun sommet monde déplacé, toujours une seule définition partagée", e.pas === pas0 + 1 && (await monde()) === avant && e.occurrences[0].definition === e.occurrences[1].definition && (await panneau.count()) === 0);
  check("message : origine changée, 2 occurrences, aucun sommet déplacé", /2 occurrence\(s\), aucun sommet déplacé/.test(await page.locator("[data-planche-message]").innerText().catch(() => "")));
  const tCopie = e.occurrences.find((o) => o.id === copie).t;
  await vue().focus();
  await touche("Control+z");
  e = await etat();
  check("Annuler : transformations d'origine rétablies, monde identique", e.pas === pas0 && (await monde()) === avant && JSON.stringify(e.occurrences.find((o) => o.id === copie).t) !== JSON.stringify(tCopie));

  // Portée « cette occurrence » par le menu contextuel « Changer les axes ».
  const centreCopie = await page.evaluate((id) => {
    const m = window.fadiPlanche.modele();
    const o = m.racine.occurrences[id];
    const M = o.transformation;
    const pts = Object.values(m.definitions[o.definition].contenu.sommets).map((s) => s.position);
    const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
    return { x: M[0] * c.x + M[1] * c.y + M[2] * c.z + M[3], y: M[4] * c.x + M[5] * c.y + M[6] * c.z + M[7], z: M[8] * c.x + M[9] * c.y + M[10] * c.z + M[11] };
  }, copie);
  await cliquer(centreCopie, { button: "right" });
  const entree = page.locator('[data-planche-menu-contextuel] [data-planche-menu="origine-composant"]');
  check("menu contextuel : « Changer les axes » actif sur un composant", (await entree.count()) === 1 && !(await entree.isDisabled()));
  await entree.click();
  await page.check('[data-origine-portee="occurrence"]');
  await page.check('[data-origine-mode="local"]');
  await page.fill('[data-origine-local="x"]', "abc");
  check("point libre non numérique : refus affiché, Appliquer grisé", (await page.locator("[data-origine-appliquer]").isDisabled()) && /nombre fini/.test(await panneau.innerText()));
  await page.fill('[data-origine-local="x"]', "1");
  await page.fill('[data-origine-local="y"]', "1");
  await page.check('[data-origine-orientation="travail"]');
  const def0 = (await etat()).definitions;
  await page.click("[data-origine-appliquer]");
  e = await etat();
  const autre = e.occurrences.find((o) => o.id !== copie);
  check("portée « cette occurrence » : copie rendue unique (nouvelle définition), l'autre inchangée, monde immobile", e.definitions === def0 + 1 && e.occurrences.find((o) => o.id === copie).definition !== autre.definition && (await monde()) === avant);

  // AX12 — lot : deux objets (définitions désormais distinctes), un seul pas.
  await vue().focus();
  await touche("Control+a");
  const pas1 = (await etat()).pas;
  await touche("Shift+F4");
  check("AX12 : lot annoncé (2 éligibles, 0 écarté, 2 définitions)", /2 objet\(s\) éligible\(s\), 0 écarté\(s\), 2 définition/.test(await page.locator("[data-origine-lot]").innerText()));
  await page.click('[data-origine-preset="boite"]');
  await page.click("[data-origine-appliquer]");
  e = await etat();
  check("AX12 : lot appliqué en un seul pas, monde immobile", e.pas === pas1 + 1 && (await monde()) === avant);
  await vue().focus();
  await touche("Control+z");
  check("AX12 : un seul Annuler défait tout le lot", (await etat()).pas === pas1 && (await monde()) === avant);
  await page.screenshot({ path: join(OUT, "origine.png") });
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (err) {
  console.error(err);
  echecs++;
} finally {
  await browser.close();
}
console.log(echecs === 0 ? "RECETTE ORIGINE : OK" : `RECETTE ORIGINE : ${echecs} échec(s)`);
process.exit(echecs === 0 ? 0 : 1);
