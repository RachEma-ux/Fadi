#!/usr/bin/env node
/**
 * Recette « rendu et repères » de Studio (lot REND) — par l'interface et dans le navigateur de la CI (Chromium de
 * Playwright, rendu **logiciel** : toutes les mesures sont étiquetées « Chromium logiciel (CI) », jamais présentées comme
 * celles d'un appareil réel ; la recette sur appareil physique est `docs/workstreams/studio/recettes/RECETTE-APPAREILS.md`).
 *
 *  - TR-EX-055 : graphismes (spline, hachure transparente, symbole) créés par la boîte « Graphismes » (Maj+F6), rendus sur
 *    la planche SVG, enregistrés et exportés ; scène de fidélité comparée SVG / Canvas / GPU (traits relus, encre) ;
 *  - TR-EX-023 : système de projet (Ctrl+Maj+F2) versionné, point converti explicitement, versions relues ;
 *  - F.1-02 / F.1-01 : moteur Canvas de la planche refusé sans rapport ; activé par un rapport qualifiant synthétique
 *    (chemin d'activation), mêmes coordonnées et même désignation ; rapport réel de comparaison SVG / Canvas mesuré ici
 *    et jugé par la règle (gain ET non-régression) ;
 *  - TR-EX-098 : règle appliquée à deux accélérations mesurées en CI — l'index spatial (gain p95 et mêmes cibles) et le
 *    moteur Canvas ;
 *  - TR-EX-056 : rendu 3D à la demande qualifié sur le corpus S4 (aucune trame au repos, trames pendant l'orbite) ;
 *    WebGPU demandé → repli WebGL2 déclaré avec sa raison ;
 *  - TR-EX-014 : import DXF avec sa provenance (empreinte, unité, auteur, restrictions) ; modèle externe IFC avec repère
 *    source et restrictions, provenance exportée ;
 *  - TR-EX-059 : disponibilité du fil principal pendant la lecture d'un gros DXF dans le Worker, comparée à la même lecture
 *    sur le fil principal ;
 *  - C.1-01 / C.1-02 / TR-EX-052 : mesure spatiale complète (S1–S5, S7 × 100 / 10 000 / 100 000 primitives) dans le
 *    navigateur, choix de l'index rapproché de DEC-09, comparaison à la cible DEC-13 (INP p75 ≤ 200 ms).
 * Rapports JSON + Markdown dans OUT (sous atelier-captures/, publiés en artefact par la CI).
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-rend node apps/web/e2e/studio-rend.mjs
 * (TAILLES=100,10000,100000 REQUETES=100 pour la mesure spatiale ; COMMIT pour l'identifier hors CI)
 * Appareil physique (RECETTE-APPAREILS.md) : HEADED=1 (navigateur affiché, GPU de la machine) ou CDP_URL=http://localhost:9222
 * (navigateur d'un téléphone relié par `adb forward`). L'étiquette du rapport suit le moteur WebGL relevé : rendu
 * logiciel (SwiftShader, llvmpipe…) ou appareil réel.
 */
import { chromium } from "playwright";
import { build } from "esbuild";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-rend";
const ICI = dirname(fileURLToPath(import.meta.url));
const WEB = join(ICI, "..");
const RACINE = join(WEB, "../..");
const TAILLES = (process.env.TAILLES ?? "100,10000,100000").split(",").map(Number);
const REQUETES = Number(process.env.REQUETES ?? "100");
let ETIQUETTE = "Chromium logiciel (CI) — rendu logiciel, pas un appareil réel";
let RENDU_LOGICIEL = true;
const commit = (() => { if (process.env.GITHUB_SHA || process.env.COMMIT) return process.env.GITHUB_SHA ?? process.env.COMMIT; try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: RACINE }).toString().trim(); } catch { return "non relevé"; } })();
mkdirSync(OUT, { recursive: true });
const erreurs = [];
const rapport = { recette: "studio-rend", etiquette: ETIQUETTE, date: new Date().toISOString(), commit, machine: { plateforme: `${platform()} ${release()}`, processeur: cpus()[0]?.model ?? "non relevé", coeurs: cpus().length, memoire: `${Math.round(totalmem() / 2 ** 30)} Gio`, node: process.version }, resultats: {} };

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

// ——— Bundles : modèle et modules purs pour Node (commandes du corpus) et pour la page de mesure ———
const tmp = join(OUT, ".bundle");
mkdirSync(tmp, { recursive: true });
await build({
  stdin: { contents: 'export { commandesDuDocument, genererCorpus } from "@parcours/atelier-model/studio-corpus";\nexport { studioSha256, exportStudioSvg } from "@parcours/atelier-model";\n', resolveDir: WEB, loader: "ts" },
  bundle: true, platform: "node", format: "esm", outfile: join(tmp, "noeud.mjs"), logLevel: "error",
});
const N = await import(pathToFileURL(join(tmp, "noeud.mjs")).href);
const page2 = await build({
  stdin: {
    contents: [
      'export * from "./src/modules/studio/planche2d/rendus/comparaison-moteurs";',
      'export { sceneFidelite } from "./src/modules/studio/planche2d/rendus/scene-fidelite";',
      'export { mesurerCorpus, analyserChoixIndex, comparerALaCible, statistiques, BUDGET_INP_P75_MS } from "./src/modules/studio/planche2d/mesure-spatiale";',
      'export { exportStudioSvg, lireDxfStudio, studioEvaluerAcceleration, STUDIO_RAPPORT_ACCELERATION_SCHEMA } from "@parcours/atelier-model";',
      'export { SCENES_DOCUMENTS } from "@parcours/atelier-model/studio-corpus";',
    ].join("\n"), resolveDir: WEB, loader: "ts",
  },
  bundle: true, format: "iife", globalName: "__rend", write: false, logLevel: "error",
});
const SCRIPT = page2.outputFiles[0].text;
const RECETTE_IFC = readFileSync(join(RACINE, "packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc"), "utf8");
const dxfDe = (insunits, entites) => ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", String(insunits), "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", ...entites, "0", "ENDSEC", "0", "EOF"].join("\n");

const browser = process.env.CDP_URL
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, ...(process.env.HEADED === "1" ? { headless: false, args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"] } : {}) });
// Moteur WebGL de l'appareil : il fixe l'étiquette de toutes les mesures (jamais « appareil réel » en rendu logiciel).
{
  const c = await browser.newContext().catch(() => browser.contexts()[0]);
  const pg = await c.newPage();
  const moteurWebgl = await pg.evaluate(() => { const g = document.createElement("canvas").getContext("webgl"); if (!g) return null; const e = g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); });
  await pg.close();
  RENDU_LOGICIEL = !moteurWebgl || /swiftshader|llvmpipe|software|softpipe|basic render/i.test(moteurWebgl);
  ETIQUETTE = RENDU_LOGICIEL ? `Chromium logiciel (CI) — rendu logiciel (${moteurWebgl ?? "WebGL indisponible"}), pas un appareil réel` : `Appareil réel — moteur WebGL « ${moteurWebgl} »`;
  rapport.moteurWebgl = moteurWebgl;
  rapport.etiquette = ETIQUETTE;
}
rapport.navigateur = browser.version();
let qualifiantSynthetique = null;
const verdictsAccrochage = { selection: null, coordonnees: null };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-rend-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-rend-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.REND", name: "Studio — rendu et repères" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude rendu et repères" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  // Corpus S4 (immeuble, 100 primitives) : murs, ouvertures, objets extrudés — base des contrôles 2D et 3D.
  const s4 = N.genererCorpus("S4", 100).documents[0];
  const cs4 = N.commandesDuDocument(s4);
  await api("post", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `rend-${randomUUID()}`, baseRevisionId: (await api("get", chemin)).revision.id, commands: cs4 });
  const flou = () => page.evaluate(() => document.activeElement?.blur());
  const enregistrer = async () => {
    await flou();
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  };
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });

  // ——— TR-EX-055 : graphismes créés par la boîte « Graphismes » (Maj+F6) ———
  const creerGraphisme = async (remplir) => {
    await flou();
    await page.keyboard.press("Shift+F6");
    const boite = page.locator("[data-studio-graphismes]");
    await boite.waitFor();
    await remplir(boite);
    await boite.locator("[data-studio-graphisme-creer]").click();
    await boite.waitFor({ state: "detached" });
  };
  await creerGraphisme(async (b) => { await b.locator("[data-studio-graphisme-points]").fill("0 -6; 2 -3; 4 -3; 6 -6; 8 -9; 10 -9; 12 -6"); });
  await creerGraphisme(async (b) => {
    await b.locator("[data-studio-graphisme-type]").selectOption("hachure");
    await b.locator("[data-studio-graphisme-points]").fill("14 -9; 20 -9; 20 -4; 14 -4");
    await b.locator("[data-studio-graphisme-angle]").fill("45");
    await b.locator("[data-studio-graphisme-espacement]").fill("0,5");
    await b.locator("[data-studio-graphisme-traits]").waitFor();
    await b.locator("[data-studio-graphisme-opacite]").fill("50");
  });
  await creerGraphisme(async (b) => {
    await b.locator("[data-studio-graphisme-type]").selectOption("symbole");
    await b.locator("[data-studio-graphisme-x]").fill("24"); await b.locator("[data-studio-graphisme-y]").fill("-6");
    await b.locator("[data-studio-graphisme-rotation]").fill("30"); await b.locator("[data-studio-graphisme-echelle]").fill("2");
  });
  const graphismesPlanche = await planche.locator("[data-studio-graphisme]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-studio-graphisme"), type: e.getAttribute("data-studio-type"), opacite: e.getAttribute("opacity"), traits: e.children.length, bezier: !!e.querySelector("path")?.getAttribute("d")?.includes(" C ") })));
  check("TR-EX-055 : Maj+F6 crée spline, hachure et symbole ; la planche SVG les rend (courbe de Bézier `C`, traits de hachure, symbole posé, opacité 0,5)",
    graphismesPlanche.map((g) => g.type).join(" ") === "spline hachure symbole" && graphismesPlanche[0].bezier && graphismesPlanche[1].opacite === "0.5" && graphismesPlanche[1].traits > 5 && graphismesPlanche[2].traits === 2, JSON.stringify(graphismesPlanche));
  await enregistrer();
  const apresGraphismes = (await api("get", chemin)).revision.document;
  const svgServeur = await (await context.request.get(`${BASE}${chemin}/export?format=svg`)).text();
  check("TR-EX-055 : enregistrés (révision serveur : 3 graphismes) et exportés en SVG par le serveur (data-graphisme, opacity, C)",
    (apresGraphismes.graphismes ?? []).length === 3 && (svgServeur.match(/data-graphisme=/g) ?? []).length === 3 && svgServeur.includes('opacity="0.5"') && / C /.test(svgServeur), String((apresGraphismes.graphismes ?? []).length));

  // ——— TR-EX-023 : système de projet versionné, conversion explicite ———
  await flou();
  await page.keyboard.press("Control+Shift+F2");
  const sp = page.locator("[data-studio-systeme-projet]");
  await sp.waitFor();
  check("TR-EX-023 : sans déclaration, « Système de projet non déclaré : aucune conversion n’est supposée. »", (await sp.getAttribute("data-studio-systeme-projet-version")) === "aucune" && (await sp.locator("[data-studio-systeme-projet-absent]").count()) === 1);
  const ajouterVersion = async (x, y, r) => {
    await sp.locator("[data-studio-systeme-projet-x]").fill(x); await sp.locator("[data-studio-systeme-projet-y]").fill(y); await sp.locator("[data-studio-systeme-projet-rotation]").fill(r);
    await sp.locator("[data-studio-systeme-projet-ajouter]").click();
  };
  await ajouterVersion("2600000", "1200000", "90");
  await page.waitForFunction(() => document.querySelector("[data-studio-systeme-projet]")?.getAttribute("data-studio-systeme-projet-version") === "1");
  await sp.locator("[data-studio-conversion-x]").fill("3"); await sp.locator("[data-studio-conversion-y]").fill("1");
  const conv1 = await sp.locator("[data-studio-conversion-resultat]").evaluate((e) => [e.getAttribute("data-studio-conversion-resultat"), e.getAttribute("data-studio-conversion-version"), e.textContent]);
  check("TR-EX-023 : point (3 ; 1) du dessin converti vers le projet par la version 1 (rotation 90°) : (2 599 999 ; 1 200 003) m, trace de la version",
    conv1[0] === "2599999.000 1200003.000" && conv1[1] === "1" && conv1[2].includes("transformation version 1"), JSON.stringify(conv1));
  await ajouterVersion("10", "20", "0");
  await page.waitForFunction(() => document.querySelector("[data-studio-systeme-projet]")?.getAttribute("data-studio-systeme-projet-version") === "2");
  const conv2 = await sp.locator("[data-studio-conversion-resultat]").getAttribute("data-studio-conversion-resultat");
  await sp.locator("[data-studio-conversion-sens]").selectOption("depuis-projet");
  await sp.locator("[data-studio-conversion-x]").fill("13"); await sp.locator("[data-studio-conversion-y]").fill("21");
  const inverse = await sp.locator("[data-studio-conversion-resultat]").getAttribute("data-studio-conversion-resultat");
  check("TR-EX-023 : version 2 ajoutée (la version 1 reste) ; conversion par la version en vigueur et retour exact dans le dessin",
    (await sp.locator("[data-studio-systeme-projet-ligne]").count()) === 2 && conv2 === "13.000 21.000" && inverse === "3.000 1.000", `${conv2} / ${inverse}`);
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  await enregistrer();
  const versions = (await api("get", chemin)).revision.document.systemeProjet?.versions ?? [];
  check("TR-EX-023 : versions 1 et 2 enregistrées dans la révision (origine, rotation en radians)", versions.length === 2 && versions[0].origine.x === 2600000 && Math.abs(versions[0].rotation - Math.PI / 2) < 1e-12 && versions[1].version === 2, JSON.stringify(versions));

  // ——— F.1-02 : moteur Canvas de la planche, derrière la règle F.1-01 ———
  const moteur = () => page.evaluate(() => globalThis.__fadiStudioRendu?.moteur());
  check("F.1-02 : par défaut, la planche est rendue en SVG (DEC-08) : aucun canevas, aucun état de moteur affiché",
    (await moteur())?.moteur === "svg" && (await page.locator("[data-studio-planche-canvas]").count()) === 0 && (await page.locator(".studio-sheet").getAttribute("data-studio-moteur-planche")) === "svg");
  // Rapport qualifiant SYNTHÉTIQUE : il exerce le chemin d'activation (ce n'est pas une mesure).
  qualifiantSynthetique = await page.evaluate((s) => ({ schema: s, acceleration: "rendu-canvas-planche", test: "TEST-025 (synthétique, recette)", reference: "svg", candidat: "canvas", environnement: { appareil: "synthétique", renduLogiciel: true, date: new Date().toISOString() }, mesures: [{ scene: "S1", reference: 10, candidat: 5 }], equivalence: [{ critere: "primitives-rendues", ecart: 0, tolerance: 1e-6 }, { critere: "textes-accessibles", ecart: 0, tolerance: 0 }, { critere: "cibles-accrochage", ecart: 0, tolerance: 0 }, { critere: "selection", ecart: 0, tolerance: 0 }] }), "studio-rapport-acceleration/1");
  // Point de désignation : milieu d'une ligne de la planche (point du document), ramené à l'écran par la CTM courante.
  const pointClic = () => page.evaluate(() => {
    const s = document.querySelector('svg[aria-label="Planche de dessin 2D"]');
    const l = s.querySelector("[data-studio-type=line] line");
    const q = s.createSVGPoint(); q.x = (l.x1.baseVal.value + l.x2.baseVal.value) / 2; q.y = (l.y1.baseVal.value + l.y2.baseVal.value) / 2;
    const r = q.matrixTransform(s.getScreenCTM());
    return { x: r.x, y: r.y };
  });
  const designes = () => planche.locator('[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-objet") ?? e.getAttribute("data-studio-graphisme")));
  const pSvg = await pointClic();
  await page.mouse.click(pSvg.x, pSvg.y);
  const selectionSvg = await designes();
  await flou();
  await page.keyboard.press("Escape");
  await page.evaluate((r) => globalThis.__fadiStudioRendu.proposer(r), qualifiantSynthetique);
  const canevas = page.locator("[data-studio-planche-canvas][data-studio-planche-canvas-trace]");
  await canevas.waitFor({ state: "attached" });
  const etat = await page.locator("[data-studio-moteur-etat]").textContent();
  const geom = await page.evaluate(() => {
    const k = document.querySelector("[data-studio-planche-canvas]"), s = document.querySelector('svg[aria-label="Planche de dessin 2D"]');
    const rk = k.getBoundingClientRect(), rs = s.getBoundingClientRect();
    return { k: [rk.left, rk.top, rk.width, rk.height], s: [rs.left + s.clientLeft, rs.top + s.clientTop, s.clientWidth, s.clientHeight], classe: s.getAttribute("class") };
  });
  check("F.1-02 : rapport qualifiant → canevas posé exactement sur la planche (mêmes bords), planche SVG conservée (traits transparents), état « Canvas » annoncé",
    geom.k.every((v, i) => Math.abs(v - geom.s[i]) < 1) && geom.classe === "studio-moteur-canvas" && etat === "Moteur de rendu de la planche : Canvas (rapport de comparaison qualifiant, règle F.1-01)", JSON.stringify(geom));
  // Mêmes coordonnées : chaque sommet de ligne de la planche (point SVG → écran par la CTM) tombe sur de l'encre du canevas.
  const encre = await page.evaluate(() => {
    const s = document.querySelector('svg[aria-label="Planche de dessin 2D"]'), k = document.querySelector("[data-studio-planche-canvas]");
    const ctx = k.getContext("2d"), m = s.getScreenCTM(), rk = k.getBoundingClientRect(), dpr = k.width / rk.width;
    const pts = [...s.querySelectorAll("[data-studio-type=line] line")].slice(0, 40).map((l) => { const p = s.createSVGPoint(); p.x = (l.x1.baseVal.value + l.x2.baseVal.value) / 2; p.y = (l.y1.baseVal.value + l.y2.baseVal.value) / 2; return p.matrixTransform(m); });
    let touches = 0;
    for (const p of pts) {
      const x = Math.round((p.x - rk.left) * dpr), y = Math.round((p.y - rk.top) * dpr);
      const d = ctx.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
      let a = 0; for (let i = 3; i < d.length; i += 4) a = Math.max(a, d[i]);
      if (a > 0) touches++;
    }
    return { points: pts.length, touches };
  });
  verdictsAccrochage.coordonnees = encre;
  check("F.1-02 : mêmes coordonnées — le milieu de chaque ligne de la planche SVG tombe sur un trait du canevas", encre.points > 0 && encre.touches === encre.points, JSON.stringify(encre));
  const pCanvas = await pointClic();
  await page.mouse.click(pCanvas.x, pCanvas.y);
  const selectionCanvas = await designes();
  verdictsAccrochage.selection = selectionSvg.length > 0 && JSON.stringify(selectionCanvas) === JSON.stringify(selectionSvg);
  check("F.1-02 : même désignation — un clic au même point (sous le canevas, transparent aux gestes) désigne le même objet qu'en SVG", verdictsAccrochage.selection, `${selectionSvg} / ${selectionCanvas}`);
  await flou();
  await page.keyboard.press("Escape");
  await page.evaluate(() => globalThis.__fadiStudioRendu.proposer(null));
  await page.locator("[data-studio-planche-canvas]").waitFor({ state: "detached" });
  check("F.1-02 : rapport retiré → retour au SVG (aucun canevas)", (await moteur())?.moteur === "svg");

  // ——— TR-EX-056 : rendu 3D à la demande (corpus S4) et repli WebGPU → WebGL2 ———
  await flou();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+D");
  const vue3d = page.locator("canvas[data-studio-vue3d-canvas]");
  await vue3d.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => { const v = document.querySelector("[data-studio-vue3d]"); return v?.getAttribute("data-studio-maillage") === "done"; });
  const rendus = () => vue3d.evaluate((c) => Number(c.dataset.studioRendus ?? "0"));
  const stable = async () => { let a = await rendus(); for (let i = 0; i < 20; i++) { await page.waitForTimeout(250); const b = await rendus(); if (b === a) return b; a = b; } return a; };
  const r0 = await stable();
  await page.waitForTimeout(1500);
  const r1 = await rendus();
  const boite = await vue3d.boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + 140, boite.y + boite.height / 2 + 30, { steps: 10 });
  await page.mouse.up();
  const r2 = await stable();
  await page.waitForTimeout(1500);
  const r3 = await rendus();
  const volumes = await page.locator("[data-studio-vue3d]").getAttribute("data-studio-volumes");
  rapport.resultats.renduALaDemande = { corpus: "S4 (100)", volumes: Number(volumes), auRepos: r1 - r0, pendantOrbite: r2 - r1, apresOrbite: r3 - r2, etiquette: ETIQUETTE };
  check("TR-EX-056 : rendu à la demande sur S4 — aucune trame pendant 1,5 s de repos, des trames pendant l'orbite, aucune après",
    Number(volumes) > 0 && r1 === r0 && r2 > r1 && r3 === r2, JSON.stringify(rapport.resultats.renduALaDemande));
  const gpuNavigateur = await page.evaluate(async () => ({ gpu: "gpu" in navigator, adaptateur: "gpu" in navigator ? !!(await navigator.gpu.requestAdapter().catch(() => null)) : false }));
  await page.locator("[data-studio-webgpu-demande]").check();
  await page.waitForFunction(() => document.querySelector("[data-studio-moteur-3d-repli]")?.getAttribute("data-studio-moteur-3d-repli") !== "");
  const repli = await page.locator("[data-studio-moteur-3d]").evaluate((e) => ({ moteur: e.getAttribute("data-studio-moteur-3d"), raison: e.getAttribute("data-studio-moteur-3d-repli"), texte: e.textContent }));
  rapport.resultats.repliWebgpu = { navigateur: gpuNavigateur, ...repli };
  const attendue = !gpuNavigateur.gpu ? "webgpu-absent" : !gpuNavigateur.adaptateur ? "adaptateur-absent" : "regle-f101";
  check("TR-EX-056 : WebGPU demandé → repli WebGL2 déclaré, avec la raison constatée dans ce navigateur", repli.moteur === "webgl2" && repli.raison === attendue && repli.texte.startsWith("Moteur 3D : WebGL2 (repli) — "), JSON.stringify(rapport.resultats.repliWebgpu));
  await page.locator("[data-studio-webgpu-demande]").uncheck();
  await page.waitForFunction(() => document.querySelector("[data-studio-moteur-3d]")?.getAttribute("data-studio-moteur-3d-repli") === "");
  await flou();
  await page.keyboard.press("Shift+D");

  // ——— TR-EX-014 : import DXF avec provenance, modèle externe avec repère et restrictions ———
  const dxf = dxfDe(4, ["0", "LINE", "8", "0", "10", "30000", "20", "0", "11", "34000", "21", "0", "0", "LINE", "8", "0", "10", "30000", "20", "0", "11", "30000", "21", "3000"]);
  await flou();
  await page.keyboard.press("Shift+U");
  const imp = page.locator("[data-studio-import-dxf]");
  await imp.waitFor();
  await imp.locator("[data-studio-import-fichier]").setInputFiles({ name: "releve-mm.dxf", mimeType: "application/dxf", buffer: Buffer.from(dxf) });
  const prov = imp.locator("[data-studio-import-provenance]");
  await prov.waitFor();
  await prov.locator("[data-studio-import-auteur]").fill("Géomètre (recette)");
  await prov.locator("[data-studio-import-repere]").fill("repère du relevé");
  await prov.locator("[data-studio-import-restrictions]").fill("usage interne");
  const empreinteAffichee = await prov.getAttribute("data-studio-import-empreinte");
  await imp.locator("[data-studio-import-ajouter]").click();
  await imp.waitFor({ state: "detached" });
  await enregistrer();
  const sources = (await api("get", chemin)).revision.document.sources ?? [];
  const sha = createHash("sha256").update(dxf, "utf8").digest("hex");
  check("TR-EX-014 : import DXF — source enregistrée avec auteur, format et version lue (AC1015), horodatage, unité mm lue, repère, transformation, restrictions et SHA-256 du fichier",
    sources.length === 1 && sources[0].empreinteSha256 === sha && empreinteAffichee === sha && sources[0].versionFormat === "AC1015" && sources[0].uniteLue === "mm" && sources[0].facteur === 0.001
      && sources[0].auteur === "Géomètre (recette)" && sources[0].repereSource === "repère du relevé" && sources[0].restrictions === "usage interne" && sources[0].transformation === "identite" && !Number.isNaN(Date.parse(sources[0].recuLe)), JSON.stringify(sources));
  const recu = await api("post", `${chemin}/modeles-externes`, { reference: "Architecte (recette)", auteur: "Cabinet (recette)", discipline: "architecture", format: "ifc", version: "B", uniteDeclaree: "mm", transformation: { dx: 5, dy: 0, dz: 0, rotation: 0 }, nomFichier: "recette-ifc2x3.ifc", contenu: RECETTE_IFC, repereSource: "repère du modèle architecte", restrictions: "coordination seulement", requestId: `rend-${randomUUID()}` });
  const provenance = await api("get", `${chemin}/modeles-externes/${recu.id}/provenance`);
  check("TR-EX-014 : modèle externe IFC — provenance exportée (auteur, version, schéma lu, unités déclarée et lue, repère source, transformation, restrictions, SHA-256, horodatage)",
    provenance.schema === "studio-provenance-modele/1" && provenance.auteur === "Cabinet (recette)" && provenance.repereSource === "repère du modèle architecte" && provenance.restrictions === "coordination seulement"
      && provenance.empreinteSha256 === createHash("sha256").update(RECETTE_IFC, "utf8").digest("hex") && provenance.unite.declaree === "mm" && provenance.transformation.dx === 5 && !!provenance.schemaFichier && !Number.isNaN(Date.parse(provenance.recuLe)), JSON.stringify(provenance));
  rapport.resultats.provenance = { sourceDxf: sources[0], modeleExterne: provenance };

  // ——— TR-EX-059 : fil principal pendant la lecture d'un gros DXF (Worker) contre la même lecture sur le fil principal ———
  const lignes = [];
  for (let i = 0; i < 19000; i++) lignes.push("0", "LINE", "8", "0", "10", String(i), "20", "0", "11", String(i), "21", "500");
  // Entités non prises (POINT), seulement comptées : elles alourdissent la lecture sans dépasser la borne d'objets du document.
  for (let i = 0; i < 120000; i++) lignes.push("0", "POINT", "8", "0", "10", String(i % 997), "20", String(i % 991), "30", "0");
  const gros = dxfDe(4, lignes);
  await flou();
  await page.keyboard.press("Shift+U");
  await imp.waitFor();
  await imp.locator("[data-studio-import-conserver-non-natifs]").uncheck();
  await page.evaluate(() => {
    const s = (globalThis.__sonde = { trames: [], debut: performance.now(), actif: true, derniere: performance.now(), retards: [] });
    const boucle = (t) => { if (!s.actif) return; s.trames.push([t, t - s.derniere]); s.derniere = t; requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
    const tic = () => { if (!s.actif) return; const attendu = performance.now() + 20; setTimeout(() => { s.retards.push(performance.now() - attendu); tic(); }, 20); };
    tic();
  });
  const t0 = Date.now();
  // Le fichier est remis à la page par Playwright (hors application) ; la lecture commence au choix du fichier.
  await imp.locator("[data-studio-import-fichier]").setInputFiles({ name: "gros.dxf", mimeType: "application/dxf", buffer: Buffer.from(gros) });
  const pose = await page.evaluate(() => performance.now());
  await imp.locator("[data-studio-import-rapport][data-studio-import-a-jour=oui]").waitFor({ timeout: 120000 });
  const dureeWorker = Date.now() - t0;
  const repliFil = await imp.locator("[data-studio-calcul-repli]").count();
  const sonde = await page.evaluate((pose) => {
    const s = globalThis.__sonde; s.actif = false;
    const apres = s.trames.filter(([t, g]) => t - g >= pose);
    const max = (l) => l.reduce((a, b) => Math.max(a, b), 0);
    return { trameMax: max(apres.map(([, g]) => g)), trames: apres.length, trameMaxRemiseDuFichier: max(s.trames.filter(([t, g]) => t - g < pose).map(([, g]) => g)), retardMax: max(s.retards) };
  }, pose);
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  // Même lecture sur le fil principal : durée de la tâche longue (le fil est bloqué pendant tout ce temps).
  const pageMesure = await context.newPage();
  await pageMesure.setContent('<!doctype html><html lang="fr"><body></body></html>');
  await pageMesure.addScriptTag({ content: SCRIPT });
  const direct = await pageMesure.evaluate((t) => { const t0 = performance.now(); const r = globalThis.__rend.lireDxfStudio(t, {}); return { ms: performance.now() - t0, objets: r.rapport.entites.total }; }, gros);
  rapport.resultats.isolationCalcul = {
    fichier: `${(gros.length / 2 ** 20).toFixed(1)} Mo, ${direct.objets} objets`, repliSurFilPrincipal: repliFil > 0,
    worker: { dureeMs: dureeWorker, trameMaxMs: sonde.trameMax, trames: sonde.trames, trameMaxPendantLaRemiseDuFichierMs: sonde.trameMaxRemiseDuFichier, retardMinuterieMaxMs: sonde.retardMax },
    filPrincipal: { tacheLongueMs: direct.ms }, etiquette: ETIQUETTE,
  };
  check("TR-EX-059 : lecture d'un gros DXF dans le Worker — le fil principal continue de rendre (trame la plus longue bien en deçà de la tâche longue de la même lecture sur le fil principal)",
    repliFil === 0 && sonde.trames > 3 && sonde.trameMax < direct.ms / 2, JSON.stringify(rapport.resultats.isolationCalcul));
  await pageMesure.close();
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  await context.close();
} catch (e) {
  console.error(e);
  await browser.close();
  process.exit(1);
}

// ——— Page de mesure : fidélité EX-055, rapports d'accélération (F.1-01, TR-EX-098), mesure spatiale (C.1) ———
const L = 1200, H = 800, REP = 7;
const ctx = await browser.newContext({ viewport: { width: L, height: H } });
const p = await ctx.newPage();
await p.setContent(`<!doctype html><html lang="fr"><body style="margin:0;background:#fff"><div id="hote" style="width:${L}px;height:${H}px"></div></body></html>`);
await p.addScriptTag({ content: SCRIPT });
const scenes = [{ nom: "fidélité EX-055", svg: N.exportStudioSvg((await p.evaluate(() => globalThis.__rend.sceneFidelite()))) }];
for (const s of ["S1", "S3"]) for (const t of [100, 10_000]) scenes.push({ nom: `${s} (${t})`, svg: N.exportStudioSvg(N.genererCorpus(s, t).documents[0]) });
const fidelite = [];
for (const sc of scenes) {
  fidelite.push({ scene: sc.nom, ...(await p.evaluate(async ({ svg, L, H, N }) => {
    const C = globalThis.__rend;
    const hote = document.getElementById("hote");
    const trame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dim = svg.replace(/<svg\b/, `<svg width="${L}" height="${H}"`).replace(/^<\?xml[^>]*>\s*/, "");
    const scene = C.lirePrimitivesSvg(svg);
    const encre = (data) => { const o = new Uint8Array(L * H); for (let i = 0; i < L * H; i++) { const k = i * 4; o[i] = (data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114) < 245 ? 1 : 0; } return o; };
    const pres = (a, b) => { let n = 0, ok = 0; for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) { if (!a[y * L + x]) continue; n++; let t = false; for (let dy = -1; dy <= 1 && !t; dy++) for (let dx = -1; dx <= 1 && !t; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < L && Y < H && b[Y * L + X]) t = true; } if (t) ok++; } return n ? ok / n : null; };
    const k2d = () => { const k = document.createElement("canvas"); k.width = L; k.height = H; const g = k.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, L, H); return g; };
    const url = URL.createObjectURL(new Blob([dim], { type: "image/svg+xml" })); const img = new Image(); img.src = url; await img.decode();
    const gs = k2d(); gs.drawImage(img, 0, 0, L, H); const refSvg = encre(gs.getImageData(0, 0, L, H).data);
    const gc = k2d(); C.dessinerCanvas(gc, scene, L, H); const encreCanvas = encre(gc.getImageData(0, 0, L, H).data);
    const enr = new C.EnregistreurCanvas(); C.dessinerCanvas(enr, scene, L, H);
    const traits = C.comparerTraits(C.traitsSvg(scene), C.traitsCanvas(enr.appels, C.cadreViewBox(scene.viewBox, L, H)));
    const gpu = C.segmentsGpu(scene, L, H);
    // Latence : SVG (insertion + mise en page) ; candidat planche Canvas = canevas tracé + planche SVG conservée (désignation, accessibilité).
    const mesurer = async (f) => { const v = []; await f(); for (let i = 0; i < N; i++) { const t0 = performance.now(); await f(); v.push(performance.now() - t0); await trame(); } return C.statistiquesDurees(v); };
    const lSvg = await mesurer(() => { hote.innerHTML = dim; hote.getBoundingClientRect(); });
    const textesSvg = hote.querySelectorAll("svg text").length;
    const lCanvas = await mesurer(() => { hote.innerHTML = dim; hote.getBoundingClientRect(); const g = k2d(); C.dessinerCanvas(g, scene, L, H); g.getImageData(0, 0, 1, 1); });
    const textesCanvas = hote.querySelectorAll("svg text").length;
    return { primitives: scene.primitives.length, traits, encreCanvasA1px: pres(encreCanvas, refSvg), encreSvgA1px: pres(refSvg, encreCanvas), gpu: { segments: gpu.segments, alphas: [...new Set([...gpu.alphas].map((a) => Math.round(a * 100) / 100))].sort(), textesNonTraces: gpu.textesNonTraces }, latence: { svg: lSvg, plancheCanvas: lCanvas }, textes: { svg: textesSvg, plancheCanvas: textesCanvas } };
  }, { svg: sc.svg, L, H, N: REP })) });
  const f = fidelite[fidelite.length - 1];
  console.log(`✓ ${sc.nom} : traits Canvas manquants ${f.traits.manquants} / en trop ${f.traits.enTrop}, encre Canvas à 1 px du SVG ${(f.encreCanvasA1px * 100).toFixed(1)} %`);
}
rapport.resultats.fidelite = fidelite;
const fid = fidelite[0];
check("TR-EX-055 : scène de fidélité dans le navigateur — Canvas = SVG (aucun trait manquant ni en trop, Bézier et opacités comprises), GPU découpé avec opacités 0,3 / 0,5 / 0,75 / 1",
  fid.traits.manquants === 0 && fid.traits.enTrop === 0 && fid.traits.reference.bezier === 2 && JSON.stringify(fid.gpu.alphas) === JSON.stringify([0.3, 0.5, 0.75, 1]) && fid.encreCanvasA1px > 0.9, JSON.stringify(fid.traits));

// Rapport réel de comparaison SVG / Canvas de la planche (F.1-01) : gain p95 ET non-régression, jugé par la règle.
const corpusMesures = fidelite.slice(1);
const rapportCanvas = {
  schema: "studio-rapport-acceleration/1", acceleration: "rendu-canvas-planche", test: "TEST-025 (studio-rend.mjs, planche SVG + canevas)", reference: "svg", candidat: "canvas",
  environnement: { appareil: ETIQUETTE, renduLogiciel: RENDU_LOGICIEL, navigateur: rapport.navigateur, commit, date: new Date().toISOString() },
  mesures: corpusMesures.map((f) => ({ scene: f.scene, reference: f.latence.svg?.p95 ?? null, candidat: f.latence.plancheCanvas?.p95 ?? null })),
  equivalence: [
    { critere: "primitives-rendues", ecart: Math.max(...corpusMesures.map((f) => (f.traits.manquants + f.traits.enTrop > 0 ? Infinity : f.traits.ecartMax))), tolerance: 1e-6 },
    { critere: "textes-accessibles", ecart: corpusMesures.reduce((n, f) => n + Math.abs(f.textes.svg - f.textes.plancheCanvas), 0), tolerance: 0 },
    { critere: "cibles-accrochage", ecart: verdictsAccrochage.coordonnees && verdictsAccrochage.coordonnees.touches === verdictsAccrochage.coordonnees.points ? 0 : 1, tolerance: 0 },
    { critere: "selection", ecart: verdictsAccrochage.selection ? 0 : 1, tolerance: 0 },
  ],
};
const verdictCanvas = await p.evaluate((r) => globalThis.__rend.studioEvaluerAcceleration("rendu-canvas-planche", r), rapportCanvas);
rapport.resultats.accelerationCanvas = { rapport: rapportCanvas, verdict: verdictCanvas };
check("F.1-01 / TR-EX-098 : rapport réel SVG / Canvas mesuré ici et jugé par la règle — verdict rendu avec ses motifs (gain ET non-régression exigés)",
  typeof verdictCanvas.autorisee === "boolean" && (verdictCanvas.autorisee || verdictCanvas.refus.length > 0) && rapportCanvas.equivalence.slice(1).every((e) => e.ecart === 0), JSON.stringify(verdictCanvas));
writeFileSync(join(OUT, "rapport-acceleration-canvas.json"), `${JSON.stringify({ rapport: rapportCanvas, verdict: verdictCanvas }, null, 2)}\n`);

// ——— C.1-01 / C.1-02 / TR-EX-052 : mesure spatiale complète dans le navigateur ———
const mesureSpatiale = await p.evaluate(({ tailles, requetes }) => {
  const C = globalThis.__rend;
  const mesures = [];
  for (const scene of C.SCENES_DOCUMENTS) for (const taille of tailles) mesures.push(C.mesurerCorpus(scene, taille, { requetes, echauffement: 5, graine: 2026, maintenant: () => performance.now(), dureeMinimaleMs: 1 }));
  return { mesures, analyse: C.analyserChoixIndex(mesures), cible: C.comparerALaCible(mesures), budget: C.BUDGET_INP_P75_MS, environnement: { userAgent: navigator.userAgent, coeurs: navigator.hardwareConcurrency, memoire: navigator.deviceMemory ?? "non relevée" } };
}, { tailles: TAILLES, requetes: REQUETES });
const divergences = mesureSpatiale.mesures.reduce((n, m) => n + m.selection.divergences + m.accrochage.divergences, 0);
const env = { date: new Date().toISOString(), commit, navigateur: rapport.navigateur, ...mesureSpatiale.environnement, machine: rapport.machine, requetes: REQUETES, tailles: TAILLES, etiquette: ETIQUETTE, methode: "performance.now() autour de chaque requête dans la page, rejouée jusqu'à 1 ms au moins puis divisée (horloge du navigateur à 0,1 ms de résolution) ; même suite de requêtes pour les deux chemins, échauffement non compté ; quantiles au rang le plus proche" };
writeFileSync(join(OUT, "mesure-recherches-spatiales.json"), `${JSON.stringify({ environnement: env, ...mesureSpatiale }, null, 2)}\n`);
const ms = (v) => v.toFixed(3);
const md = ["# Mesure des recherches spatiales (C.1-01, C.1-02, TR-EX-052)", "", `${ETIQUETTE}. Commit ${commit} · ${rapport.navigateur} · ${env.date}.`, "",
  "## Environnement", "", ...Object.entries(env).map(([k, v]) => `- ${k} : ${typeof v === "object" ? JSON.stringify(v) : v}`), "",
  "## Mesures (ms)", "", "| Scène | Primitives | Opération | Chemin actuel | Linéaire p50 / p75 / p95 | Index p50 / p75 / p95 | Construction index | Divergences |", "|---|---:|---|---|---:|---:|---:|---:|",
  ...mesureSpatiale.mesures.flatMap((m) => ["selection", "accrochage"].map((op) => `| ${m.scene} | ${m.taille} | ${op} | ${m.cheminActuel[op]} | ${ms(m[op].lineaire.p50)} / ${ms(m[op].lineaire.p75)} / ${ms(m[op].lineaire.p95)} | ${ms(m[op].indexe.p50)} / ${ms(m[op].indexe.p75)} / ${ms(m[op].indexe.p95)} | ${ms(m[op].constructionIndexMs)} | ${m[op].divergences} |`)), "",
  "## Choix de l'index (C.1-02, DEC-09)", "", `- seuil en vigueur : ${mesureSpatiale.analyse.seuil} éléments ; croisement mesuré : sélection ${mesureSpatiale.analyse.croisement.selection ?? "jamais"}, accrochage ${mesureSpatiale.analyse.croisement.accrochage ?? "jamais"}`,
  `- sous le seuil, linéaire admissible : ${mesureSpatiale.analyse.sousLeSeuilLineaireAdmis ? "oui" : "non"} ; au-dessus, index plus rapide : ${mesureSpatiale.analyse.auDessusIndexPlusRapide ? "oui" : "non"} ; divergences : ${mesureSpatiale.analyse.divergences}`,
  `- **seuil DEC-09 ${mesureSpatiale.analyse.coherent ? "cohérent" : "non cohérent"} avec la mesure** (appareil de la mesure : ${ETIQUETTE})`, "",
  `## Cible DEC-13 (INP p75 ≤ ${mesureSpatiale.budget} ms), chemin pris aujourd'hui (TR-EX-052)`, "", "| Scène | Primitives | Opération | Chemin | p75 (ms) | Part du budget | Dans la cible |", "|---|---:|---|---|---:|---:|---|",
  ...mesureSpatiale.cible.map((c) => `| ${c.scene} | ${c.taille} | ${c.operation} | ${c.chemin} | ${ms(c.p75)} | ${(c.partBudget * 100).toFixed(2)} % | ${c.dansLaCible ? "oui" : "non"} |`), "",
  "La requête n'est qu'une partie d'une interaction : « dans la cible » dit seulement qu'elle ne consomme pas à elle seule le budget INP.", ""];
writeFileSync(join(OUT, "mesure-recherches-spatiales.md"), md.join("\n"));
rapport.resultats.mesureSpatiale = { analyse: mesureSpatiale.analyse, horsCible: mesureSpatiale.cible.filter((c) => !c.dansLaCible), divergences };
check(`C.1-01 : mesure complète dans le navigateur — ${mesureSpatiale.mesures.length} corpus (S1–S5, S7 × ${TAILLES.join(" / ")}), 0 divergence index / linéaire, rapport archivé avec machine, navigateur et commit`,
  mesureSpatiale.mesures.length === 6 * TAILLES.length && divergences === 0, `${divergences} divergence(s)`);
check("C.1-02 : choix de l'index rapproché de la mesure (croisement mesuré, seuil DEC-09 jugé)", typeof mesureSpatiale.analyse.coherent === "boolean", JSON.stringify(mesureSpatiale.analyse));
check("TR-EX-052 : chaque recherche comparée à la cible DEC-13 par le chemin pris (p75)", mesureSpatiale.cible.length === mesureSpatiale.mesures.length * 2, `${rapport.resultats.mesureSpatiale.horsCible.length} hors cible`);

// TR-EX-098 (cas positif mesuré) : l'index spatial, gain p95 au-delà du seuil ET mêmes cibles / même sélection.
const audela = mesureSpatiale.mesures.filter((m) => m.taille >= mesureSpatiale.analyse.seuil);
const rapportIndex = {
  schema: "studio-rapport-acceleration/1", acceleration: "index-spatial-2d", test: "C.1 (studio-rend.mjs)", reference: "parcours-lineaire", candidat: "grille-uniforme",
  environnement: { appareil: ETIQUETTE, renduLogiciel: RENDU_LOGICIEL, navigateur: rapport.navigateur, commit, date: new Date().toISOString() },
  mesures: audela.flatMap((m) => ["selection", "accrochage"].map((op) => ({ scene: `${m.scene} ${m.taille} ${op}`, reference: m[op].lineaire.p95, candidat: m[op].indexe.p95 }))),
  equivalence: [{ critere: "cibles-accrochage", ecart: audela.reduce((n, m) => n + m.accrochage.divergences, 0), tolerance: 0 }, { critere: "selection", ecart: audela.reduce((n, m) => n + m.selection.divergences, 0), tolerance: 0 }],
};
const verdictIndex = await p.evaluate((r) => globalThis.__rend.studioEvaluerAcceleration("index-spatial-2d", r), rapportIndex);
rapport.resultats.accelerationIndex = { rapport: rapportIndex, verdict: verdictIndex };
writeFileSync(join(OUT, "rapport-acceleration-index.json"), `${JSON.stringify({ rapport: rapportIndex, verdict: verdictIndex }, null, 2)}\n`);
check("TR-EX-098 : index spatial — gain p95 mesuré ET mêmes cibles d'accrochage / même sélection, jugé par la règle", audela.length === 0 || typeof verdictIndex.autorisee === "boolean", JSON.stringify(verdictIndex));
await ctx.close();
await browser.close();

writeFileSync(join(OUT, "rend-rapport.json"), `${JSON.stringify(rapport, null, 2)}\n`);
const r = rapport.resultats;
writeFileSync(join(OUT, "rend-rapport.md"), [
  "# Recette REND — rendu et repères de Studio", "", `${ETIQUETTE}. Commit ${commit} · ${rapport.navigateur} · ${rapport.date}.`, "",
  "## Fidélité du rendu 2D (TR-EX-055)", "", "| Scène | Primitives | Traits Canvas manquants / en trop | Écart max | Encre Canvas à 1 px du SVG | GPU segments | Opacités GPU |", "|---|---:|---:|---:|---:|---:|---|",
  ...r.fidelite.map((f) => `| ${f.scene} | ${f.primitives} | ${f.traits.manquants} / ${f.traits.enTrop} | ${f.traits.ecartMax.toExponential(2)} | ${f.encreCanvasA1px === null ? "non évalué" : `${(f.encreCanvasA1px * 100).toFixed(1)} %`} | ${f.gpu.segments} | ${f.gpu.alphas.join(", ")} |`), "",
  "## Règle des accélérations (F.1-01, TR-EX-098)", "",
  `- Moteur Canvas de la planche : ${r.accelerationCanvas.verdict.autorisee ? "autorisé" : `refusé (${r.accelerationCanvas.verdict.refus.map((x) => x.motif).join(", ")})`}`,
  `- Index spatial : ${r.accelerationIndex.verdict.autorisee ? "autorisé" : `refusé (${r.accelerationIndex.verdict.refus.map((x) => x.motif).join(", ")})`}`, "",
  "## Rendu 3D (TR-EX-056)", "", `- À la demande (S4) : ${JSON.stringify(r.renduALaDemande)}`, `- Repli WebGPU : ${JSON.stringify(r.repliWebgpu)}`, "",
  "## Isolation du calcul lourd (TR-EX-059)", "", `- ${JSON.stringify(r.isolationCalcul)}`, "",
  "## Mesure spatiale (C.1-01, C.1-02, TR-EX-052)", "", "Voir `mesure-recherches-spatiales.md`.", `- Choix de l'index : ${JSON.stringify(r.mesureSpatiale.analyse)}`, `- Hors cible DEC-13 : ${r.mesureSpatiale.horsCible.length}`, "",
].join("\n"));
console.log(`✓ rapports écrits dans ${OUT} (rend-rapport.md, mesure-recherches-spatiales.md, rapport-acceleration-*.json)`);
