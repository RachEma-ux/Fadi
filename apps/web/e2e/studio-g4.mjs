#!/usr/bin/env node
/**
 * Recette « mesures et qualité » de Studio (lot G4) — application construite servie par l'API, Chromium de Playwright.
 * Toutes les mesures portent l'étiquette de l'appareil relevé (moteur WebGL non masqué) : sur le runner de la CI, rendu
 * **logiciel** (SwiftShader), jamais présenté comme un appareil réel ni comme un GPU (EX-097, DEC-13).
 *
 *  1. TR-EX-097 / TR-AC-002 / REC-B-02 (TEST-016) / J5 : barre de vingt outils usuels ouverte REPETITIONS fois à cache
 *     froid (contexte neuf, sans service worker) puis chaud (service worker installé) ; requêtes, octets transférés,
 *     octets servis par le serveur, morceaux JavaScript **exécutés** (couverture V8 : fonction de tête évaluée), tas après
 *     ramasse-miettes, moteurs initialisés, fichiers demandés ; médianes comparées à la référence versionnée
 *     `apps/web/e2e/references/studio-g4-reference.json` avec **verdict** (`studioComparerAReference`) ; LCP, INP et CLS de
 *     chaque chargement confrontés au p75 aux budgets de DEC-13 (`studioConfronterCwv`) ; protocole EX-097 complet
 *     (matériel, navigateur, mémoire, GPU / pilote, écran, caches, réseau, build, commit, répétitions, opérations,
 *     aberrants, méthode, traces) et conclusion GPU tirée d'un rendu logiciel ou de `renderer.render()` refusée ;
 *  2. TR-AC-005 / MES-03 : orbite, zoom, pousser / tirer, changement de matériau (et sélection) comparés avant / après
 *     optimisation dans le navigateur, vrai `renderer.render()` (WebGL), postes mesurés séparément ; GPU « non évalué » ;
 *  3. TR-EX-059 : réactivité du fil principal **pendant un booléen exact lourd** (noyau OCCT dans son Worker) : trames,
 *     interactions (Event Timing) faites pendant le calcul, verdict `studioJugerReactivite` ; contre-épreuve : le même
 *     sondage pendant une occupation du fil principal de même durée rend « bloque ».
 *
 * Rapports JSON + Markdown et trace Chromium d'un chargement à froid dans OUT (sous atelier-captures/, artefact de la CI).
 * Rétablir la référence (révision suivante, motif obligatoire) : ECRIRE_REFERENCE=1 MOTIF="…" node apps/web/e2e/studio-g4.mjs
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-g4 REPETITIONS=5 node apps/web/e2e/studio-g4.mjs
 */
import { chromium } from "playwright";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-g4";
const REPETITIONS = Number(process.env.REPETITIONS ?? "5");
/** Parties jouées (toutes par défaut) ; SOMMETS : sommets de chaque profil du booléen lourd (borne du profil : 1 024). */
const PARTIES = new Set((process.env.PARTIES ?? "1,2,3").split(","));
const SOMMETS = Number(process.env.SOMMETS ?? "320");
const ICI = dirname(fileURLToPath(import.meta.url));
const WEB = join(ICI, "..");
const RACINE = join(WEB, "../..");
const REFERENCE = join(ICI, "references/studio-g4-reference.json");
const VIEWPORT = { width: 1280, height: 900 };
const commit = (() => { if (process.env.GITHUB_SHA || process.env.COMMIT) return process.env.GITHUB_SHA ?? process.env.COMMIT; try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: RACINE }).toString().trim(); } catch { return null; } })();
mkdirSync(OUT, { recursive: true });

let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
}

// ——— Modèle de mesure (pur) et comparaison 3D (navigateur) ———
const tmp = join(OUT, ".bundle");
mkdirSync(tmp, { recursive: true });
await build({ stdin: { contents: 'export * from "@parcours/atelier-model/studio-mesures";\n', resolveDir: WEB, loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: join(tmp, "mesures.mjs"), logLevel: "error" });
const M = await import(pathToFileURL(join(tmp, "mesures.mjs")).href);
const page3d = await build({
  stdin: { contents: 'export { comparerOptimisation, sceneComparaison } from "./src/modules/studio/vue3d/comparaison-optimisation";\nexport { studioJugerOptimisation } from "@parcours/atelier-model/studio-mesures";\nexport * as THREE from "three";\n', resolveDir: WEB, loader: "ts" },
  bundle: true, format: "iife", globalName: "__g4", write: false, logLevel: "error",
});
const SCRIPT_3D = page3d.outputFiles[0].text;

/** Profil de vingt outils usuels (le même que `studio-mesures-chargement.mjs`). */
const VINGT = [
  "studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne",
  "studio.dessin.cote", "studio.dessin.cote-angulaire", "studio.dessin.texte", "studio.dessin.deplacer", "studio.dessin.copier", "studio.dessin.rotation",
  "studio.dessin.symetrie", "studio.dessin.echelle", "studio.dessin.modifier", "studio.dessin.decaler", "studio.architecture.mur", "studio.architecture.ouverture",
  "studio.dessin.supprimer", "studio.objet.calque",
];
const MODES = VINGT.slice(0, 18);

// Ramasse-miettes appelable et mémoire précise (mesure du tas et de la mémoire résiduelle).
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--js-flags=--expose-gc", "--enable-precise-memory-info"] });
const rapport = { recette: "studio-g4", date: new Date().toISOString(), base: BASE, commit, resultats: {} };

/** Appareil de la mesure : moteur WebGL non masqué, navigateur, écran (EX-097). */
async function relever() {
  const c = await browser.newContext({ viewport: VIEWPORT });
  const p = await c.newPage();
  const r = await p.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl");
    const e = g?.getExtension("WEBGL_debug_renderer_info");
    return {
      fournisseur: g ? (e ? g.getParameter(e.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR)) : null,
      moteur: g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : null,
      userAgent: navigator.userAgent, coeurs: navigator.hardwareConcurrency, memoireGo: navigator.deviceMemory ?? null,
      ecran: { largeur: innerWidth, hauteur: innerHeight, densite: devicePixelRatio },
    };
  });
  await c.close();
  return r;
}
const appareil = await relever();
/** Étiquette de l'appareil (moteur WebGL relevé) : portée par toutes les mesures. */
const APPAREIL = M.studioQualifierEnvironnement({ gpu: { fournisseur: appareil.fournisseur, moteur: appareil.moteur }, navigateur: { nom: "Chromium (Playwright)", version: browser.version() } });

async function preparer() {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-g4-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-g4-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await ctx.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.G4", name: "Studio — mesures et qualité (G4)" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Mesures G4" });
  await api("put", `/projects/${projet.id}/studio/preferences/outils`, { profil: "personnel", favoris: [], personnel: VINGT });
  const carte = await api("get", "/chargement.json");
  const etat = await ctx.storageState();
  await ctx.close();
  return { etat, api, projet, etude, carte, url: `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}` };
}

/** Observateurs Core Web Vitals posés avant tout script de la page (entrées tamponnées). */
const SONDES_CWV = () => {
  const s = (globalThis.__g4cwv = { lcp: [], cls: [], evenements: [] });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) s.lcp.push(e.renderTime || e.loadTime || e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* non pris en charge */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) s.cls.push({ startTime: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput }); }).observe({ type: "layout-shift", buffered: true }); } catch { /* non pris en charge */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) s.evenements.push({ interactionId: e.interactionId ?? 0, duration: e.duration, startTime: e.startTime, name: e.name }); }).observe({ type: "event", buffered: true, durationThreshold: 16 }); } catch { /* non pris en charge */ }
};

async function activerOutils(page, ids) {
  for (const id of ids) {
    const palette = page.locator("[data-studio-palette]");
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Control+k");
    await palette.waitFor({ timeout: 10000 });
    await palette.locator("[data-studio-recherche-palette]").fill(id);
    const liste = await palette.locator("[data-studio-palette-entree]").evaluateAll((l) => l.map((e) => [e.getAttribute("data-studio-palette-entree"), e.getAttribute("data-studio-disponible")]));
    const rang = liste.findIndex(([x]) => x === id);
    if (rang < 0 || liste[rang][1] !== "oui") throw new Error(`${id} : ${rang < 0 ? "absent de la palette" : "indisponible"}`);
    for (let k = 0; k < rang; k++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await palette.waitFor({ state: "detached", timeout: 10000 });
  }
}

/** Une ouverture de la planche avec les vingt outils : grandeurs AC-002 et entrées CWV. */
async function ouvrir(ctx, url, carte, trace = null) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.addInitScript(SONDES_CWV);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.startPreciseCoverage", { callCount: false, detailed: false });
  const requetes = new Map();
  cdp.on("Network.requestWillBeSent", (e) => requetes.set(e.requestId, { url: e.request.url, octets: 0, sw: false, disque: false }));
  cdp.on("Network.responseReceived", (e) => { const r = requetes.get(e.requestId); if (r) { r.sw = !!e.response.fromServiceWorker; r.disque = !!e.response.fromDiskCache; } });
  cdp.on("Network.loadingFinished", (e) => { const r = requetes.get(e.requestId); if (r) r.octets = e.encodedDataLength; });
  if (trace) await browser.startTracing(page, { path: trace, screenshots: false });
  await page.goto(url);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await page.waitForFunction(() => globalThis.__fadiPerf?.mesures("PERF-01").length > 0);
  await activerOutils(page, MODES);
  await page.waitForTimeout(500);
  if (trace) await browser.stopTracing();
  const { result } = await cdp.send("Profiler.takePreciseCoverage");
  await cdp.send("Profiler.stopPreciseCoverage");
  const chemin = (u) => { try { const x = new URL(u); return x.origin === new URL(BASE).origin ? x.pathname : null; } catch { return null; } };
  const executes = [...new Set(result.filter((s) => chemin(s.url)?.endsWith(".js") && s.functions.some((f) => f.ranges.some((r) => r.count > 0))).map((s) => chemin(s.url)))].sort();
  const familles = [...new Set(executes.flatMap((p) => carte.morceaux[p]?.familles ?? []))].sort();
  await cdp.send("HeapProfiler.collectGarbage").catch(() => undefined);
  const { metrics } = await cdp.send("Performance.getMetrics");
  const tas = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? null;
  const r = [...requetes.values()];
  const cwv = await page.evaluate(() => globalThis.__g4cwv);
  const moteurs = await page.evaluate(() => globalThis.__fadiRessources.etats().filter((e) => e.initialise).map((e) => e.id));
  const build = await page.evaluate(() => document.querySelector('meta[name="fadi-build"]')?.content ?? null);
  const swActif = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  return {
    page,
    mesure: {
      requetes: r.length,
      octetsTransferes: r.reduce((n, x) => n + (x.octets ?? 0), 0),
      octetsServeur: r.filter((x) => !x.sw && !x.disque).reduce((n, x) => n + (x.octets ?? 0), 0),
      chunksExecutes: executes.length,
      tasOctets: tas,
      famillesExecutees: familles,
      moteursInitialises: moteurs,
      fichiersDemandes: [...new Set(r.map((x) => chemin(x.url)).filter(Boolean))].sort(),
    },
    executes,
    reponsesServiceWorker: r.filter((x) => x.sw).length,
    swActif,
    build,
    cwv: { lcp: cwv.lcp.length ? cwv.lcp[cwv.lcp.length - 1] : null, cls: M.studioCls(cwv.cls), inp: M.studioInp(cwv.evenements), interactions: new Set(cwv.evenements.filter((e) => e.interactionId).map((e) => e.interactionId)).size },
  };
}

const ecrire = process.env.ECRIRE_REFERENCE === "1";
let prep = null;
try {
  prep = await preparer();
  // ——— 1. Chargement : REPETITIONS ouvertures à froid puis à chaud (plus une ouverture tracée, non comptée) ———
  if (PARTIES.has("1")) {
    const traceFroid = join(OUT, "trace-froid.json");
    {
      const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: { cookies: prep.etat.cookies, origins: [] } });
      const o = await ouvrir(ctx, prep.url, prep.carte, traceFroid);
      await o.page.close();
      await ctx.close();
    }
    const series = { froid: [], chaud: [] };
    let build = null;
    for (let i = 0; i < REPETITIONS; i++) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: { cookies: prep.etat.cookies, origins: [] } });
      const froid = await ouvrir(ctx, prep.url, prep.carte);
      await froid.page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60000 });
      await froid.page.close();
      const chaud = await ouvrir(ctx, prep.url, prep.carte);
      await chaud.page.close();
      await ctx.close();
      build = froid.build;
      series.froid.push(froid);
      series.chaud.push(chaud);
      console.log(`· répétition ${i + 1}/${REPETITIONS} : froid ${froid.mesure.requetes} requêtes, ${(froid.mesure.octetsTransferes / 2 ** 20).toFixed(2)} Mo, ${froid.mesure.chunksExecutes} morceaux exécutés ; chaud ${chaud.mesure.octetsServeur} o du serveur, ${chaud.reponsesServiceWorker} réponses du service worker`);
    }
    const GRANDEURS = M.STUDIO_GRANDEURS_CHARGEMENT;
    const distributions = Object.fromEntries(["froid", "chaud"].map((c) => [c, Object.fromEntries(GRANDEURS.map((g) => [g, M.studioDistribution(series[c].map((s) => s.mesure[g]))]))]));
    const medianes = Object.fromEntries(["froid", "chaud"].map((c) => [c, {
      ...Object.fromEntries(GRANDEURS.map((g) => [g, distributions[c][g].p50])),
      famillesExecutees: [...new Set(series[c].flatMap((s) => s.mesure.famillesExecutees))].sort(),
      moteursInitialises: [...new Set(series[c].flatMap((s) => s.mesure.moteursInitialises))].sort(),
      fichiersDemandes: [...new Set(series[c].flatMap((s) => s.mesure.fichiersDemandes))].sort(),
    }]));
    const environnement = {
      materiel: { plateforme: `${platform()} ${release()}`, processeur: cpus()[0]?.model ?? "non relevé", coeurs: cpus().length },
      navigateur: { nom: "Chromium (Playwright)", version: browser.version(), userAgent: appareil.userAgent },
      memoire: { machineOctets: totalmem(), navigateurGo: appareil.memoireGo },
      gpu: { fournisseur: appareil.fournisseur, moteur: appareil.moteur },
      ecran: appareil.ecran,
      caches: ["froid", "chaud"],
      reseau: { mode: `boucle locale (${new URL(BASE).host} : API et application servies par la même machine)`, limitation: "aucune (pas de limitation de débit ni de latence)" },
      build, commit, repetitions: REPETITIONS, operations: ["ouverture de la planche", "PERF-01", `activation de ${MODES.length} outils au clavier (palette)`, "ramasse-miettes", "relevé"],
      aberrants: "Tukey 1,5 × EIQ : signalés dans le rapport, conservés dans le calcul", methode: M.STUDIO_METHODE_STATISTIQUE,
      traces: [relative(OUT, traceFroid), "apps/web/e2e/studio-g4.mjs", "mesures-chargement.json"],
    };
    const qualif = M.studioQualifierEnvironnement(environnement);
    rapport.environnement = environnement;
    rapport.qualification = qualif;
    check("TR-EX-097 : protocole de mesure complet — matériel, navigateur et version, mémoire, GPU / pilote (moteur WebGL non masqué), écran, caches froid et chaud, réseau, build, commit, répétitions, opérations, aberrants, méthode statistique, trace conservée",
      qualif.complet && existsSync(traceFroid), qualif.complet ? qualif.etiquette : `manquants : ${qualif.manquants.join(", ")}`);
    const conclusionGpu = M.studioJugerConclusion(environnement, { sujet: "gpu", source: "renderer.render", enonce: "coût de rendu de la vue 3D (PERF-05)" });
    const conclusionSwift = M.studioJugerConclusion(environnement, { sujet: "gpu", source: "minuteur-gpu", enonce: "profil GPU" });
    check("TR-EX-097 (cas négatif) : conclusion GPU tirée de renderer.render() refusée ; sous rendu logiciel, tout profil GPU refusé (« non évalué »)",
      !conclusionGpu.admise && conclusionGpu.refus.some((r) => r.motif === "render-cpu-presente-comme-gpu") && (qualif.renduLogiciel ? !conclusionSwift.admise && conclusionSwift.refus.some((r) => r.motif === "gpu-sous-rendu-logiciel") : true),
      JSON.stringify({ renderRender: conclusionGpu.refus.map((r) => r.motif), swiftShader: conclusionSwift.refus.map((r) => r.motif), etiquette: qualif.etiquette }));
    check("TR-AC-002 : cache chaud réellement chaud — service worker actif et morceaux servis par lui à chaque répétition",
      series.chaud.every((s) => s.swActif && s.reponsesServiceWorker > 0), JSON.stringify(series.chaud.map((s) => s.reponsesServiceWorker)));

    // Référence versionnée : comparaison et verdict (ou rétablissement explicite).
    const appareilRef = { classe: qualif.classe, navigateur: `Chromium ${browser.version()}`, moteurWebgl: appareil.moteur, fenetre: { largeur: VIEWPORT.width, hauteur: VIEWPORT.height } };
    let reference = existsSync(REFERENCE) ? JSON.parse(readFileSync(REFERENCE, "utf8")) : null;
    if (ecrire) {
      if (!process.env.MOTIF) throw new Error("ECRIRE_REFERENCE=1 exige MOTIF (raison du rétablissement)");
      const gabarit = reference ?? JSON.parse(readFileSync(join(ICI, "references/studio-g4-reference.gabarit.json"), "utf8"));
      reference = M.studioEtablirReference(gabarit, medianes, { etablieLe: new Date().toISOString(), commit: commit ?? "non relevé", build: build ?? "non lu", motif: process.env.MOTIF, appareil: appareilRef, repetitions: REPETITIONS });
      reference.profil = VINGT;
      reference.$commentaire = "Référence de mesure de studio-g4.mjs (AC-002, TEST-016) : médianes d'une mesure réelle sur l'appareil indiqué, jamais saisies à la main. Rétablir : ECRIRE_REFERENCE=1 MOTIF=… node apps/web/e2e/studio-g4.mjs (révision suivante, tolérances et invariants conservés).";
      writeFileSync(REFERENCE, `${JSON.stringify(reference, null, 2)}\n`);
      console.log(`Référence rétablie : révision ${reference.revision} (${process.env.MOTIF}).`);
    }
    const erreursRef = M.studioValiderReference(reference);
    check("TR-AC-002 : référence versionnée valide (schéma studio-reference-mesures/1, révision, appareil, profil de vingt outils, valeurs mesurées froid et chaud, tolérances, invariants)", erreursRef.length === 0, erreursRef.join(" ; ") || `révision ${reference?.revision}, établie le ${reference?.etablieLe} (${reference?.motif})`);
    const verdict = erreursRef.length ? null : M.studioComparerAReference(reference, { froid: medianes.froid, chaud: medianes.chaud }, { classe: qualif.classe, fenetre: appareilRef.fenetre });
    rapport.resultats.chargement = { profil: VINGT, medianes, distributions, verdict, referenceRevision: reference?.revision ?? null, executesFroid: series.froid[0]?.executes, executesChaud: series.chaud[0]?.executes };
    check("TR-AC-002 / TEST-016 : vingt outils ouverts — requêtes, octets transférés, octets du serveur, morceaux exécutés et tas comparés à la référence, cache froid et chaud : verdict « conforme » (aucun taux de réduction présumé)",
      verdict?.verdict === "conforme", verdict ? `${verdict.verdict}${verdict.motifs.length ? ` : ${verdict.motifs.join(" ; ")}` : ""}${verdict.referenceARetablir ? " (amélioration constatée : référence à rétablir)" : ""}` : "aucune comparaison");
    check("TR-AC-002 : modules spécialisés non initialisés — aucune famille three / studio-3d / atelier / maplibre / manifold exécutée, seuls les moteurs de la planche initialisés, aucun binaire du noyau exact demandé (froid et chaud)",
      verdict !== null && verdict.invariants.length === 0 && reference.invariants.famillesInterdites.length >= 5,
      JSON.stringify({ familles: [medianes.froid.famillesExecutees, medianes.chaud.famillesExecutees], moteurs: [medianes.froid.moteursInitialises, medianes.chaud.moteursInitialises], invariants: verdict?.invariants }));

    // Core Web Vitals (J5, DEC-13) : un point par chargement, p75 confronté aux budgets, par cache.
    const cwv = Object.fromEntries(["froid", "chaud"].map((c) => [c, M.studioConfronterCwv({ lcp: series[c].map((s) => s.cwv.lcp), inp: series[c].map((s) => s.cwv.inp), cls: series[c].map((s) => s.cwv.cls) })]));
    rapport.resultats.coreWebVitals = { budgets: M.STUDIO_BUDGETS_CWV, ...cwv, interactionsParChargement: series.froid.map((s) => s.cwv.interactions), etiquette: qualif.etiquette, nature: "valeurs de laboratoire : chargements et interactions synthétiques (clavier Playwright) sur l'appareil de la mesure, pas une mesure de terrain (utilisateurs réels non évalués)" };
    const cwvTxt = (c) => `${c} : LCP p75 ${cwv[c].lcp.p75?.toFixed(0)} ms, INP p75 ${cwv[c].inp.p75} ms, CLS p75 ${cwv[c].cls.p75?.toFixed(3)}`;
    check("J5 / DEC-13 : LCP, INP et CLS de chaque chargement confrontés au p75 aux budgets (LCP ≤ 2 500 ms, INP ≤ 200 ms, CLS ≤ 0,1), cache froid et chaud : dans le budget",
      cwv.froid.verdict === "dans-le-budget" && cwv.chaud.verdict === "dans-le-budget", `${cwvTxt("froid")} ; ${cwvTxt("chaud")} (${qualif.etiquette})`);
    writeFileSync(join(OUT, "mesures-chargement.json"), `${JSON.stringify({ environnement, qualification: qualif, series: Object.fromEntries(["froid", "chaud"].map((c) => [c, series[c].map((s) => ({ mesure: s.mesure, cwv: s.cwv, reponsesServiceWorker: s.reponsesServiceWorker }))])), medianes, distributions, verdict, cwv }, null, 2)}\n`);
  }

  // ——— 2. AC-005 / MES-03 : avant / après optimisation de la vue 3D, dans le navigateur ———
  if (PARTIES.has("2")) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const p = await ctx.newPage();
    await p.setContent('<!doctype html><html lang="fr"><body style="margin:0"><canvas id="c" width="800" height="600"></canvas></body></html>');
    await p.addScriptTag({ content: SCRIPT_3D });
    const resultat = await p.evaluate(({ rep, etiquette, renduLogiciel }) => {
      const G = globalThis.__g4;
      const canvas = document.getElementById("c");
      let renderer = null;
      const fabrique = () => ({
        maintenant: () => performance.now(),
        activer: () => { renderer ??= new G.THREE.WebGLRenderer({ canvas, antialias: false }); renderer.setSize(800, 600, false); },
        rendre: (scene, camera) => { renderer.render(scene, camera); },
        memoire: () => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? null; },
      });
      const rapports = [];
      for (let i = 0; i < rep; i++) {
        renderer?.dispose(); renderer = null;
        const { initial, scenario } = G.sceneComparaison(3);
        rapports.push(G.comparerOptimisation(initial, scenario, fabrique, { etiquette, renduLogiciel }));
      }
      return { rapports, verdicts: rapports.map((r) => G.studioJugerOptimisation(r)) };
    }, { rep: REPETITIONS, etiquette: APPAREIL.etiquette, renduLogiciel: APPAREIL.renduLogiciel });
    await ctx.close();
    const ops = M.STUDIO_OPERATIONS_FIDELITE;
    const poste = (chemin, op, f) => M.studioDistribution(resultat.rapports.map((r) => f(r.operations.find((o) => o.operation === op)[chemin])));
    const synthese = ops.map((op) => ({
      operation: op,
      ...Object.fromEntries(["reference", "optimise"].map((ch) => [ch, {
        transfertMs: poste(ch, op, (m) => m.transfertMs), transfertOctets: poste(ch, op, (m) => m.transfertOctets), activationMs: poste(ch, op, (m) => m.activationMs),
        calculMs: poste(ch, op, (m) => m.calculMs), renduCpuMs: poste(ch, op, (m) => m.renduCpuMs), invalidationObjets: poste(ch, op, (m) => m.invalidation.objets),
        reconstruits: poste(ch, op, (m) => m.invalidation.reconstruits), invalidationMs: poste(ch, op, (m) => m.invalidation.ms), memoireResiduelleOctets: poste(ch, op, (m) => m.memoireResiduelleOctets),
        renduGpu: "non évalué",
      }])),
      fidelite: resultat.rapports.map((r) => r.operations.find((o) => o.operation === op).fidelite),
    }));
    rapport.resultats.optimisation3d = { etiquette: APPAREIL.etiquette, repetitions: REPETITIONS, synthese, verdicts: resultat.verdicts };
    writeFileSync(join(OUT, "rapport-optimisation-3d.json"), `${JSON.stringify({ environnement: rapport.environnement ?? null, appareil: APPAREIL, rapports: resultat.rapports, verdicts: resultat.verdicts, synthese }, null, 2)}\n`);
    const fideles = resultat.verdicts.every((v) => v.verdict === "fidele" && v.gpu === "non évalué");
    check("TR-AC-005 : sélection, orbite, zoom, pousser / tirer et changement de matériau comparés avant / après optimisation dans Chromium (vrai renderer.render) — mêmes objets désignés, distances, aspects et triangles à chaque répétition : verdict « fidèle »",
      fideles && resultat.rapports.every((r) => r.operations.length === 5 && r.operations.every((o) => o.fidelite.rayons === 1200 && o.fidelite.trianglesReference > 0)),
      JSON.stringify(resultat.verdicts.map((v) => [v.verdict, v.infideles.length, v.postesManquants.length])));
    const med = (s, ch, k) => s[ch][k].p50;
    const orbite = synthese.find((s) => s.operation === "orbite"), pt = synthese.find((s) => s.operation === "pousser-tirer");
    check("MES-03 : transfert, activation, calcul, rendu CPU, invalidation et mémoire résiduelle relevés séparément sur les deux chemins ; rendu GPU « non évalué » (rendu logiciel), jamais rempli",
      synthese.every((s) => ["reference", "optimise"].every((ch) => ["transfertMs", "transfertOctets", "activationMs", "calculMs", "renduCpuMs", "invalidationMs", "memoireResiduelleOctets"].every((k) => s[ch][k].n === REPETITIONS)))
        && resultat.rapports.every((r) => r.operations.every((o) => o.optimise.renduGpuMs === null && o.reference.renduGpuMs === null)),
      `orbite : calcul ${med(orbite, "reference", "calculMs")?.toFixed(2)} → ${med(orbite, "optimise", "calculMs")?.toFixed(2)} ms, reconstruits ${med(orbite, "reference", "reconstruits")} → ${med(orbite, "optimise", "reconstruits")} ; pousser / tirer : transfert ${med(pt, "reference", "transfertOctets")} → ${med(pt, "optimise", "transfertOctets")} o, rendu CPU ${med(pt, "reference", "renduCpuMs")?.toFixed(2)} → ${med(pt, "optimise", "renduCpuMs")?.toFixed(2)} ms`);
    const md = ["# Avant / après optimisation de la vue 3D (TR-AC-005, MES-03)", "", `${APPAREIL.etiquette}. Commit ${commit} · ${REPETITIONS} répétitions · médianes (p50).`, "",
      "| Opération | Chemin | Transfert (ms / octets) | Activation (ms) | Calcul (ms) | Rendu CPU (ms) | Rendu GPU | Invalidation (objets / reconstruits / ms) | Mémoire résiduelle (octets) | Fidélité |", "|---|---|---:|---:|---:|---:|---|---:|---:|---|",
      ...synthese.flatMap((s) => ["reference", "optimise"].map((ch) => `| ${s.operation} | ${ch === "reference" ? "avant" : "après"} | ${med(s, ch, "transfertMs")?.toFixed(2)} / ${med(s, ch, "transfertOctets")} | ${med(s, ch, "activationMs")?.toFixed(2)} | ${med(s, ch, "calculMs")?.toFixed(2)} | ${med(s, ch, "renduCpuMs")?.toFixed(2)} | non évalué | ${med(s, ch, "invalidationObjets")} / ${med(s, ch, "reconstruits")} / ${med(s, ch, "invalidationMs")?.toFixed(3)} | ${med(s, ch, "memoireResiduelleOctets")} | ${s.fidelite.every((f) => f.divergences === 0 && f.aspectsDivergents === 0 && f.trianglesReference === f.trianglesOptimise) ? "identique" : "**divergente**"} |`)), "",
      "Rendu CPU = durée JavaScript de `renderer.render()` (soumission), jamais un coût GPU (EX-097). Aucun seuil de vitesse : la géométrie exige l'exactitude (DEC-13).", ""];
    writeFileSync(join(OUT, "rapport-optimisation-3d.md"), md.join("\n"));
  }

  // ——— 3. TR-EX-059 : réactivité pendant un booléen exact lourd (noyau OCCT dans son Worker) ———
  if (PARTIES.has("3")) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: prep.etat });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await page.addInitScript(SONDES_CWV);
    const chemin = `/projects/${prep.projet.id}/studio/studies/${prep.etude.study.id}/variants/${prep.etude.variant.id}`;
    const tete = await (await ctx.request.get(`${BASE}${chemin}`)).json();
    // Deux prismes en étoile de SOMMETS sommets, décalés et tournés : beaucoup de faces latérales à intersecter.
    const etoile = (n, r1, r2) => Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n, r = k % 2 ? r2 : r1; return { x: Math.round(r * Math.cos(a) * 1e6) / 1e6, y: Math.round(r * Math.sin(a) * 1e6) / 1e6 }; });
    const prisme = (id, x, rotation) => ({ toolId: "studio.solide.prisme", params: { id, type: "prism", placement: { origin: { x, y: 0.2, z: 0 }, rotation }, profile: etoile(SOMMETS, 5, 4.4), height: 3 } });
    const pose = await ctx.request.post(`${BASE}${chemin}/commands`, { data: { contractVersion: "studio-commands/1", requestId: `g4-${randomUUID()}`, baseRevisionId: tete.revision.id, commands: [prisme("P1", 0, 0), prisme("P2", 0.9, 0.0123)] } });
    check(`TR-EX-059 (préparation) : deux prismes en étoile de ${SOMMETS} sommets posés par commandes`, pose.ok(), String(pose.status()));
    await page.goto(`${BASE}/studio/projets/${prep.projet.id}/etudes/${prep.etude.study.id}/variantes/${prep.etude.variant.id}`);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Control+Shift+Y");
    const panneau = page.locator("[data-studio-booleen]");
    await page.locator('[data-studio-booleen][data-studio-exact-noyau="pret"]').waitFor({ timeout: 120000 });
    await panneau.locator("[data-studio-booleen-operation]").selectOption("union");
    await panneau.locator('[data-studio-booleen-operande="A"]').selectOption("P1");
    await panneau.locator('[data-studio-booleen-operande="B"]').selectOption("P2");
    const sonder = () => page.evaluate(() => {
      const s = (globalThis.__sonde = { trames: [], actif: true, derniere: performance.now(), debut: performance.now() });
      const boucle = (t) => { if (!s.actif) return; s.trames.push([t, t - s.derniere]); s.derniere = t; requestAnimationFrame(boucle); };
      requestAnimationFrame(boucle);
    });
    const relire = (debut, fin) => page.evaluate(({ debut, fin }) => {
      const s = globalThis.__sonde; s.actif = false;
      const pendant = s.trames.filter(([t, g]) => t >= debut && t - g <= fin);
      const ev = globalThis.__g4cwv.evenements.filter((e) => e.interactionId && e.startTime >= debut && e.startTime <= fin);
      const parId = new Map(); for (const e of ev) parId.set(e.interactionId, Math.max(parId.get(e.interactionId) ?? 0, e.duration));
      return { trames: pendant.length, trameMaxMs: pendant.reduce((m, [, g]) => Math.max(m, g), 0), interactionsMs: [...parId.values()] };
    }, { debut, fin });
    // Interactions pendant le calcul : clics sur le statut du noyau (texte, sans effet) toutes les 150 ms.
    const statut = panneau.locator("[data-studio-exact-statut-noyau]");
    const boite = await statut.boundingBox();
    const cible = { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2 };
    await sonder();
    const debut = await page.evaluate(() => performance.now());
    await panneau.locator("[data-studio-booleen-calculer]").click();
    let clics = 0;
    for (;;) {
      const etatCalcul = await panneau.getAttribute("data-studio-exact-etat");
      if (etatCalcul === "pret") break;
      if (etatCalcul !== "calcul") throw new Error(`booléen exact : état « ${etatCalcul} » au lieu du résultat`);
      await page.mouse.click(cible.x, cible.y);
      clics++;
      await page.waitForTimeout(150);
      if (clics > 2000) throw new Error("booléen exact : aucun résultat");
    }
    const fin = await page.evaluate(() => performance.now());
    const sonde = await relire(debut, fin);
    const metriques = await page.evaluate(() => globalThis.__fadiExact?.metriques() ?? null);
    const mesureWorker = { calcul: `booléen exact OCCT (union de deux prismes de ${SOMMETS} sommets)`, calculMs: fin - debut, surWorker: metriques?.workersVivants === 1, trames: sonde.trames, trameMaxMs: sonde.trameMaxMs, interactionsMs: sonde.interactionsMs };
    const verdictWorker = M.studioJugerReactivite(mesureWorker);
    // Contre-épreuve : même sondage pendant une occupation du fil principal de même durée (calcul qui ne serait pas isolé).
    await sonder();
    const debut2 = await page.evaluate(() => performance.now());
    const occupation = page.evaluate((ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* fil principal occupé */ } }, Math.min(mesureWorker.calculMs, 4000));
    await page.waitForTimeout(100);
    await page.mouse.click(cible.x, cible.y);
    await occupation;
    await page.waitForTimeout(300);
    const fin2 = await page.evaluate(() => performance.now());
    const sonde2 = await relire(debut2, fin2);
    const verdictBloque = M.studioJugerReactivite({ calcul: "occupation du fil principal (contre-épreuve)", calculMs: Math.min(mesureWorker.calculMs, 4000), surWorker: false, ...sonde2 });
    rapport.resultats.reactivite = { etiquette: APPAREIL.etiquette, worker: { mesure: mesureWorker, verdict: verdictWorker, clics }, contreEpreuve: { mesure: sonde2, verdict: verdictBloque } };
    check("TR-EX-059 : booléen exact lourd dans le Worker OCCT — calcul d'au moins 1 s, le fil principal continue de rendre et chaque interaction faite pendant le calcul reste sous le budget INP (verdict « disponible »)",
      verdictWorker.verdict === "disponible" && mesureWorker.calculMs >= 1000 && mesureWorker.interactionsMs.length >= 3,
      `${mesureWorker.calculMs.toFixed(0)} ms de calcul, ${mesureWorker.trames} trames, trame max ${mesureWorker.trameMaxMs.toFixed(1)} ms, ${mesureWorker.interactionsMs.length} interactions (max ${Math.max(0, ...mesureWorker.interactionsMs)} ms) ; ${verdictWorker.motifs.join(" ; ")} (${APPAREIL.etiquette})`);
    check("TR-EX-059 (contre-épreuve) : la même mesure pendant une occupation du fil principal de même durée rend « bloque »", verdictBloque.verdict === "bloque", `${verdictBloque.verdict} : ${verdictBloque.motifs.join(" ; ")}`);
    await ctx.close();
  }
} catch (e) {
  console.error(e);
  echecs++;
} finally {
  await browser.close();
}

writeFileSync(join(OUT, "rapport.json"), `${JSON.stringify(rapport, null, 2)}\n`);
const c = rapport.resultats.chargement;
const md = ["# Mesures et qualité de Studio (lot G4)", "", `${rapport.qualification?.etiquette ?? ""}. Commit ${commit} · ${REPETITIONS} répétitions · ${rapport.date}.`, "",
  "## Protocole (EX-097)", "", ...Object.entries(rapport.environnement ?? {}).map(([k, v]) => `- ${k} : ${typeof v === "object" ? JSON.stringify(v) : v}`), "",
  "## Référence et verdict (AC-002, TEST-016)", "", c?.verdict ? `Verdict : **${c.verdict.verdict}** contre la référence révision ${c.referenceRevision}${c.verdict.referenceARetablir ? " (amélioration constatée : référence à rétablir)" : ""}.` : "Non comparé.", "",
  "| Cache | Grandeur | Mesure (p50) | Référence | Borne haute | Écart | Verdict |", "|---|---|---:|---:|---:|---:|---|",
  ...(c?.verdict?.comparaisons ?? []).map((x) => `| ${x.cache} | ${x.grandeur} | ${x.mesure} | ${x.reference} | ${x.borneHaute?.toFixed(0)} | ${x.ecartRelatif === null ? "—" : `${(x.ecartRelatif * 100).toFixed(1)} %`} | ${x.verdict} |`), "",
  "## Core Web Vitals (J5, DEC-13)", "", ...["froid", "chaud"].map((k) => { const v = rapport.resultats.coreWebVitals?.[k]; return v ? `- ${k} : LCP p75 ${v.lcp.p75?.toFixed(0)} ms (${v.lcp.verdict}), INP p75 ${v.inp.p75} ms (${v.inp.verdict}), CLS p75 ${v.cls.p75?.toFixed(3)} (${v.cls.verdict}) → **${v.verdict}**` : `- ${k} : non mesuré`; }), "",
  "## Réactivité pendant un booléen exact lourd (EX-059)", "", rapport.resultats.reactivite ? `- Worker : ${JSON.stringify(rapport.resultats.reactivite.worker.mesure)} → **${rapport.resultats.reactivite.worker.verdict.verdict}**\n- Contre-épreuve (fil principal occupé) : → **${rapport.resultats.reactivite.contreEpreuve.verdict.verdict}**` : "Non mesurée.", "",
  "Le GPU réel et les appareils physiques restent « non évalués » (DEC-13) : recette sur appareil, `docs/workstreams/studio/recettes/RECETTE-APPAREILS.md`.", ""];
writeFileSync(join(OUT, "rapport.md"), md.join("\n"));
console.log(echecs ? `${echecs} contrôle(s) en échec` : "Recette G4 : tous les contrôles passent");
process.exit(echecs ? 1 : 0);
