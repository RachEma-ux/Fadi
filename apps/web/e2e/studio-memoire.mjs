#!/usr/bin/env node
/**
 * Recette de mémoire en session longue de Studio (TEST-037, D.3-03) : la vue 3D — l'outil le plus lourd de Studio, qui
 * n'a pas de noyau exact propre (DEC-11) — est fermée puis rouverte CYCLES fois (50 par défaut) sur une variante qui
 * porte un mur et une ouverture.
 *
 *  1. ressources GPU : à chaque réouverture, les compteurs `renderer.info.memory` (géométries, textures) reviennent à
 *     leur valeur de la première ouverture — égalité exacte, aucune tolérance ;
 *  2. tas JavaScript : après CHAUFFE cycles non mesurés (journaux bornés remplis), mesuré après un ramasse-miettes
 *     forcé (protocole CDP), vue fermée, à chaque cycle. La courbe est écrite dans le rapport ; le verdict porte sur la
 *     pente de la régression linéaire des cycles mesurés, comparée au seuil retenu après mesure (ADR-STUDIO-PILOTE-01,
 *     P-08 et DEC-13 : seuil fixé sur mesure, pas a priori) ;
 *  3. écouteurs du document : leur nombre est le même avant et après les cycles (égalité exacte) ;
 *  4. brouillon et révision inchangés : les cycles n'écrivent rien.
 *
 * Mesure sur Chromium (rendu logiciel) : la mémoire GPU réelle d'un appareil reste « non évaluée ».
 *
 * BASE_URL=http://localhost:3001 CYCLES=50 OUT=atelier-captures/studio-memoire node apps/web/e2e/studio-memoire.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-memoire";
const CYCLES = Number(process.env.CYCLES ?? 50);
/**
 * Cycles de chauffe, non mesurés : les journaux bornés de Studio (mesures PERF, journal des ressources) se remplissent
 * jusqu'à leur plafond pendant les premiers cycles ; la croissance qui en résulte est bornée et n'est pas une fuite.
 */
const CHAUFFE = Number(process.env.CHAUFFE ?? 30);
/**
 * Pente maximale admise du tas après ramasse-miettes, en octets par cycle. Seuil retenu après mesure (P-08) : 9,5 Ko/cycle
 * mesurés après correction, contre 37,6 Ko/cycle avec les deux fuites corrigées le 25 octobre 2026 (table DFG de three.js,
 * écouteur clavier des contrôles de caméra). La pente résiduelle décroît quand la chauffe s’allonge (journaux bornés).
 */
const PENTE_MAX = 16 * 1024;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
/** Pente (octets / cycle) de la droite des moindres carrés. */
function pente(points) {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n, my = points.reduce((s, [, y]) => s + y, 0) / n;
  const num = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), den = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-memoire-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-memoire-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.MEM", name: "Studio — mémoire" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude mémoire" });
  const variante = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const tete = async () => (await api("get", variante)).revision.id;
  const pose = await api("post", `${variante}/commands`, {
    contractVersion: "studio-commands/1", requestId: `memoire-${randomUUID()}`, baseRevisionId: await tete(), commands: [
      { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
      { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
    ],
  });
  const revision = pose.revision.id;
  check("préparation : mur et ouverture posés par commandes", !!revision);

  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const cdp = await context.newCDPSession(page);
  const tasApresGc = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    return (await cdp.send("Runtime.getHeapUsage")).usedSize;
  };
  const canevas = page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]");
  const lireGpu = async () => ({ geometries: await canevas.getAttribute("data-studio-gpu-geometries"), textures: await canevas.getAttribute("data-studio-gpu-textures") });
  /** Vue ouverte, maillage de la révision courante terminé ; `attendu` : compteurs attendus (attente bornée). */
  const ouvrir = async (attendu = null) => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+D");
    await canevas.waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector("[data-studio-vue3d]");
      return v?.getAttribute("data-studio-maillage") === "done" && v.getAttribute("data-studio-maillage-revision") === v.getAttribute("data-studio-revision-courante");
    });
    if (attendu) {
      await page.waitForFunction((a) => {
        const c = document.querySelector("canvas[data-studio-vue3d-canvas]");
        return c?.getAttribute("data-studio-gpu-geometries") === a.geometries && c.getAttribute("data-studio-gpu-textures") === a.textures;
      }, attendu, { timeout: 5000 }).catch(() => {});
    } else {
      // Première ouverture : compteurs stables sur une demi-seconde.
      let avant = null;
      for (;;) { const g = await lireGpu(); if (avant && g.geometries === avant.geometries && g.textures === avant.textures && Number(g.geometries) > 0) break; avant = g; await page.waitForTimeout(500); }
    }
    return lireGpu();
  };
  const fermer = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+D");
    await page.locator("[data-studio-vue3d]").waitFor({ state: "detached" });
  };

  /** Écouteurs posés sur `document` (protocole CDP) : leur nombre ne doit pas croître d'une ouverture à l'autre. */
  const ecouteursDocument = async () => {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "document" });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    await cdp.send("Runtime.releaseObject", { objectId: result.objectId });
    return listeners.length;
  };
  const base = await ouvrir();
  await fermer();
  const ecouteursAvant = await ecouteursDocument();
  const ecartsGpu = [];
  for (let c = 1; c <= CHAUFFE; c++) {
    const g = await ouvrir(base);
    if (g.geometries !== base.geometries || g.textures !== base.textures) ecartsGpu.push({ cycle: -c, ...g });
    await fermer();
  }
  const courbe = [];
  for (let c = 1; c <= CYCLES; c++) {
    const g = await ouvrir(base);
    if (g.geometries !== base.geometries || g.textures !== base.textures) ecartsGpu.push({ cycle: c, ...g });
    await fermer();
    courbe.push([c, await tasApresGc()]);
  }
  const ecouteursApres = await ecouteursDocument();
  const p = pente(courbe);
  const rapport = { cycles: CYCLES, chauffe: CHAUFFE, ecouteursAvant, ecouteursApres, base, ecartsGpu, courbe, penteOctetsParCycle: Math.round(p), penteMax: PENTE_MAX, navigateur: browser.version() };
  writeFileSync(join(OUT, "studio-memoire.json"), JSON.stringify(rapport, null, 2));
  console.log(`· tas après GC : cycle 1 ${courbe[0][1]} o, cycle ${CYCLES} ${courbe.at(-1)[1]} o ; pente (${CYCLES} cycles mesurés après ${CHAUFFE} de chauffe) ${Math.round(p)} o/cycle`);
  check(`TEST-037 : ${CHAUFFE + CYCLES} réouvertures de la vue 3D — compteurs GPU identiques à la première ouverture à chaque cycle`, ecartsGpu.length === 0 && Number(base.geometries) > 0, JSON.stringify({ base, ecarts: ecartsGpu.slice(0, 3) }));
  check(`TEST-037 : tas JavaScript après ramasse-miettes sans croissance (pente ≤ ${PENTE_MAX} o/cycle sur ${CYCLES} cycles après ${CHAUFFE} de chauffe)`, CYCLES >= 20 && p <= PENTE_MAX, `${Math.round(p)} o/cycle`);
  check(`TEST-037 : après ${CHAUFFE + CYCLES} cycles, aucun écouteur de plus sur le document (contrôles de caméra libérés)`, ecouteursApres === ecouteursAvant, `${ecouteursAvant} → ${ecouteursApres}`);
  check("TEST-037 : les cycles n'écrivent rien (révision de tête inchangée)", (await tete()) === revision);
  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
  await context.close();
} catch (e) {
  echecs += 1;
  console.error(e);
} finally {
  await browser.close();
}
if (echecs) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette de mémoire Studio : tous les contrôles sont passés.");
