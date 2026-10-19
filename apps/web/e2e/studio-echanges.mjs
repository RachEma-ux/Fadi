#!/usr/bin/env node
/**
 * Recette Studio — matrice d'échanges en lecture seule (E.6-01 à E.6-05), par l'interface réelle (compte et projet
 * synthétiques créés par les vraies routes) :
 *   1. la commande « Matrice d’échanges » est dans la famille Importer / Exporter, avec son raccourci Q ;
 *   2. Q ouvre la boîte : une ligne par entrée, les exports SVG / DXF / IFC livrés avec leur couverture par type
 *      (rapport de fidélité), DWG / BCF / STEP / OBJ / STL « non livré » avec leur raison, aucun « renoncé » ;
 *   3. aucun champ de saisie hors du filtre ; le filtre par statut ne garde que les entrées du statut choisi ;
 *   4. Échap ferme la boîte.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-echanges.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-echanges-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-echanges-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const projet = (await api("post", "/projects", { code: `P.ECH.${randomUUID().slice(0, 6)}`, name: "Studio — échanges (recette)" })).body;
  const racine = `/projects/${projet.id}/studio/studies`;
  const etude = (await api("post", racine, { name: "Étude échanges" })).body;
  check("préparation : étude créée", Boolean(etude?.study?.id), etude?.study?.id ? "" : JSON.stringify(etude ?? null).slice(0, 200));
  const studyId = etude.study.id, variantId = etude.variant.id;

  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`);
  const outils = page.getByRole("toolbar", { name: /^(Outils de dessin|Drawing tools)$/ });
  await outils.waitFor();

  // 1. Commande dans la famille Importer / Exporter, raccourci Q.
  const bouton = outils.locator('button[data-studio-commande="echanges"]').first();
  await bouton.waitFor({ state: "attached" });
  check("commande « Matrice d’échanges » dans la barre, raccourci Q", (await bouton.getAttribute("aria-keyshortcuts")) === "Q", String(await bouton.getAttribute("aria-keyshortcuts")));
  const famille = await bouton.evaluate((x) => x.closest("[data-studio-famille]")?.getAttribute("data-studio-famille") ?? null);
  check("rangée dans la famille Importer / Exporter", famille === "echanges", String(famille));

  // 2. Q ouvre la boîte.
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.keyboard.press("q");
  const boite = page.getByRole("dialog", { name: "Matrice d’échanges" });
  await boite.waitFor();
  const lignes = boite.locator("tr[data-studio-echange]");
  const n = await lignes.count();
  check("Q ouvre la boîte : une ligne par entrée", n >= 30, `${n} lignes`);
  const statut = async (id) => boite.locator(`tr[data-studio-echange="${id}"]`).getAttribute("data-studio-echange-statut");
  for (const id of ["dessin-svg", "dessin-dxf", "maquette-ifc", "dessin-dxf-import", "feuille-pdf", "dossier-pdf", "tableau-metre-csv", "rendu-png", "paquet-publication", "natif-archive-export"]) {
    check(`livré : ${id}`, (await statut(id)) === "livre");
  }
  for (const id of ["dwg-import", "dwg-export", "bcf-import", "bcf-export", "step-export", "obj-export", "stl-export", "gltf-export"]) {
    check(`non livré : ${id}`, (await statut(id)) === "non-livre");
  }
  check("aucune entrée « renoncé »", (await boite.locator('tr[data-studio-echange-statut="renonce"]').count()) === 0);
  const ifc = boite.locator('tr[data-studio-echange="maquette-ifc"]');
  await ifc.locator("summary").click();
  const fidelite = ifc.locator('[data-studio-echange-fidelite="ifc"]');
  await fidelite.waitFor();
  check("IFC : couverture par type du rapport de fidélité affichée", (await fidelite.locator("tbody tr").count()) >= 10 && (await fidelite.innerText()).includes("Non couvert"));
  const dwg = boite.locator('tr[data-studio-echange="dwg-export"]');
  await dwg.locator("summary").click();
  check("DWG : raison et source D-179 (Atelier) affichées, jamais conforme", /ne vaut pas pour Studio/.test(await dwg.innerText()) && (await dwg.innerText()).includes("D-179"));

  // 3. Lecture seule : aucun champ hors du filtre ; filtre par statut.
  check("aucun champ de saisie dans la boîte", (await boite.locator("input, textarea, [contenteditable]").count()) === 0);
  const filtre = boite.locator("[data-studio-echanges-filtre]");
  await filtre.selectOption("non-livre");
  const nonLivres = await boite.locator("tr[data-studio-echange]").count();
  check("filtre « Non livré » : seules les entrées non livrées", nonLivres > 0 && nonLivres === (await boite.locator('tr[data-studio-echange-statut="non-livre"]').count()), `${nonLivres}`);
  await filtre.selectOption("renonce");
  check("filtre « Renoncé » : aucune entrée", (await boite.locator("[data-studio-echanges-vide]").count()) === 1);
  await page.keyboard.press("Escape");
  await boite.waitFor({ state: "detached" });
  check("Échap ferme la boîte", (await page.getByRole("dialog").count()) === 0);

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs > 0) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette matrice d’échanges : tout est vert.");
