#!/usr/bin/env node
/**
 * Recette du chantier Axes, lot AX-5 (phase D ; concept Axes 1.0, AX13 et AX16) dans le Sandbox :
 * - AX13 : repère enregistré LIÉ à une face ; face poussée → « la face a changé » (base gardée) ; « Mettre à jour depuis
 *   la face » → à jour ; face effacée → « face supprimée, base conservée », aucune mise à jour proposée ; « Détacher » ;
 * - AX16 : exports OBJ en coordonnées du modèle (en-tête par défaut) puis du repère de travail (en-tête et message
 *   l'annoncent, sommets exprimés dans le repère) ; « coordonnées d'origine » grisée avec son motif sans import ;
 * - aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/sandbox-reperes-lies node apps/web/e2e/sandbox-reperes-lies.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/sandbox-reperes-lies";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => erreurs.push(e.message));

const vue = () => page.locator("[data-planche-vue]");
const touche = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(90);
};
const cliquer = async (q) => {
  const b = await page.locator("[data-planche-vue] canvas").boundingBox();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  await page.mouse.move(b.x + e.x, b.y + e.y, { steps: 4 });
  await page.mouse.click(b.x + e.x, b.y + e.y);
  await page.waitForTimeout(80);
};
const reperes = () => page.evaluate(() => window.fadiPlanche.modele().annotations?.reperes ?? {});
const panneauReperes = async () => {
  if ((await page.locator('[data-planche-panneau="reperes"]').count()) === 0) await page.click('[data-planche-panneau-icone="reperes"]');
};
const fermerPanneau = async () => {
  if ((await page.locator('[data-planche-panneau="reperes"]').count()) > 0) await page.click('[data-planche-panneau-icone="reperes"]');
};
const sante = async (id) => {
  await panneauReperes();
  return page.locator(`[data-repere-enregistre="${id}"] [data-reperes-sante]`).getAttribute("data-reperes-sante");
};
async function exporterObj() {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    (async () => {
      await page.click("[data-planche-menu-ouvrir]");
      await page.click('[data-planche-menu-item="exporter"]');
      await page.click('[data-planche-exporter="obj"]');
    })(),
  ]);
  return readFileSync(await dl.path(), "utf8");
}

try {
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `lies-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "sandbox-lies-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  await page.waitForTimeout(400);
  await vue().focus();

  // Une dalle 4 × 2 m ; sa face sélectionnée.
  await touche("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await cliquer({ x: 4, y: 2, z: 0 });
  await touche("Space");
  await cliquer({ x: 2, y: 1, z: 0 });
  const face = await page.evaluate(() => window.fadiPlanche.selection()[0]);

  // AX13 — repère lié.
  await touche("Alt+Shift+Digit0");
  await page.fill("[data-reperes-nom]", "Dalle");
  await page.click("[data-reperes-lier]");
  let r = await reperes();
  const id = Object.keys(r)[0];
  check("AX13 : repère lié à la face (identifiant de face, instantané de contrôle), à jour", r[id]?.source.mode === "lie" && r[id].source.face === face && (await sante(id)) === "sain", JSON.stringify(r[id]?.source));

  // Pousser / tirer la face de 1 m : la face change, le repère garde sa base (panneau fermé : la vue est dégagée).
  await fermerPanneau();
  await vue().focus();
  await touche("p");
  await cliquer({ x: 2, y: 1, z: 0 });
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  await touche("Space");
  r = await reperes();
  const santeApres = await sante(id);
  check("AX13 : face poussée → « la face a changé », base du repère inchangée", santeApres === "perime" && r[id].origine.z === 0, `${santeApres} ; z = ${r[id].origine.z}`);
  await panneauReperes();
  await page.click(`[data-reperes-maj-source="${id}"]`);
  r = await reperes();
  const centreFace = await page.evaluate((f) => {
    const m = window.fadiPlanche.modele();
    const pts = m.racine.faces[f].exterieur.map((k) => m.racine.sommets[k].position);
    return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length, nz: m.racine.faces[f].normale.z };
  }, face);
  check("« Mettre à jour depuis la face » : base recalculée sur LA face liée (origine = son centre, Z = sa normale), révision 2, à jour", Math.abs(r[id].origine.x - centreFace.x) < 1e-9 && Math.abs(r[id].origine.z - centreFace.z) < 1e-9 && Math.abs(r[id].z.z - centreFace.nz) < 1e-9 && r[id].revision === 2 && (await sante(id)) === "sain", JSON.stringify({ o: r[id].origine, z: r[id].z, centreFace }));

  // Face effacée : une seconde dalle, liée puis effacée — manquant, aucune mise à jour proposée, aucune face devinée.
  await fermerPanneau();
  await vue().focus();
  await touche("r");
  await cliquer({ x: 8, y: 0, z: 0 });
  await cliquer({ x: 10, y: 2, z: 0 });
  await touche("Space");
  await cliquer({ x: 9, y: 1, z: 0 });
  const face2 = await page.evaluate(() => window.fadiPlanche.selection()[0]);
  await touche("Alt+Shift+Digit0");
  await page.fill("[data-reperes-nom]", "Seconde dalle");
  await page.click("[data-reperes-lier]");
  const id2 = Object.keys(await reperes()).find((k) => k !== id);
  await fermerPanneau();
  await vue().focus();
  await cliquer({ x: 9, y: 1, z: 0 });
  await touche("Delete");
  r = await reperes();
  const faceExiste = await page.evaluate((f) => !!window.fadiPlanche.modele().racine.faces[f], face2);
  check("AX13 : face supprimée → « face supprimée, base conservée », pas de mise à jour proposée, référence gardée", !faceExiste && (await sante(id2)) === "manquant" && (await page.locator(`[data-reperes-maj-source="${id2}"]`).count()) === 0 && r[id2].source.face === face2);
  await page.click(`[data-reperes-detacher-lien="${id2}"]`);
  check("Détacher du lien → instantané", (await sante(id2)) === "instantane");

  // AX16 — coordonnées des exports.
  await panneauReperes();
  check("« Coordonnées d'origine » grisée sans import consigné, avec son motif", await page.locator('[data-reperes-exports="source"]').isDisabled());
  const modele = await exporterObj();
  check("export OBJ en coordonnées du modèle : en-tête par défaut (mètres)", /unités : mètres/.test(modele.split("\n")[0]), modele.split("\n")[0]);
  await fermerPanneau();
  await vue().focus();
  await touche("Shift+Y");
  await page.keyboard.type("[10;0;0]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  await panneauReperes();
  await page.check('[data-reperes-exports="travail"]');
  const travail = await exporterObj();
  const xs = (t) => t.split("\n").filter((l) => l.startsWith("v ")).map((l) => Number(l.split(" ")[1]));
  check("export OBJ dans le repère de travail (origine x = 10) : en-tête explicite, sommets décalés de −10 en x", /repère de travail/.test(travail.split("\n")[0]) && Math.max(...xs(travail)) <= Math.max(...xs(modele)) - 10 + 1e-6, `${travail.split("\n")[0]} ; max x ${Math.max(...xs(modele))} → ${Math.max(...xs(travail))}`);
  check("le message d'export annonce les coordonnées utilisées", /repère de travail/.test(await page.locator("[data-planche-message]").innerText().catch(() => "")));
  await panneauReperes();
  await page.check('[data-reperes-exports="modele"]');
  await page.screenshot({ path: join(OUT, "reperes-lies.png") });
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (err) {
  console.error(err);
  echecs++;
} finally {
  await browser.close();
}
console.log(echecs === 0 ? "RECETTE REPÈRES LIÉS : OK" : `RECETTE REPÈRES LIÉS : ${echecs} échec(s)`);
process.exit(echecs === 0 ? 0 : 1);
