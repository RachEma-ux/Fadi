#!/usr/bin/env node
/**
 * Script de mesure (B.3-12, D.3-03, AC-002, PERF-01 / PERF-02 / PERF-09) : transferts et mémoire d'un profil de vingt
 * outils usuels, à cache froid puis chaud, et mémoire résiduelle d'une session longue. Il **mesure et rapporte**
 * seulement : aucun seuil, aucun verdict, aucun gain annoncé (les budgets relèvent de DEC-13). Le rapport fixe
 * l'environnement de la mesure (navigateur, build, fenêtre, date, nombre de cycles) comme le demande EX-097 ;
 * Chromium sans GPU physique (SwiftShader) ne vaut pas mesure GPU.
 *
 * - Cache froid : contexte neuf (aucun service worker, aucun cache HTTP) ouvrant directement la planche.
 * - Cache chaud : même contexte, service worker installé, nouvelle page sur la même planche.
 * - Pour chacun : requêtes, octets transférés (CDP `encodedDataLength`), réponses du service worker et du cache disque,
 *   fichiers JavaScript demandés, moteurs initialisés, tas JavaScript après ramasse-miettes, PERF-01, PERF-02.
 * - Session longue : CYCLES cycles (ouvrir / fermer la vue 3D, changer d'outils, ouvrir / fermer le Tool Manager),
 *   tas après ramasse-miettes à chaque cycle, initialisations des moteurs (réutilisation).
 * - Mesure seulement : tout échec d'interaction (outil, vue 3D, Tool Manager, lecture) est consigné dans `rapport.md`
 *   et `mesures.json` (`incidents`) et la mesure continue ; le script sort toujours en 0. La recette bloquante du
 *   chargement est `studio-chargement.mjs`.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-mesures CYCLES=10 node apps/web/e2e/studio-mesures-chargement.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-mesures-chargement";
const CYCLES = Number(process.env.CYCLES ?? "10");
const VIEWPORT = { width: 1280, height: 900 };
mkdirSync(OUT, { recursive: true });

/** Profil de vingt outils usuels (outils au pointeur de la planche 2D, plus Supprimer et Calque). */
const VINGT = [
  "studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne",
  "studio.dessin.cote", "studio.dessin.cote-angulaire", "studio.dessin.texte", "studio.dessin.deplacer", "studio.dessin.copier", "studio.dessin.rotation",
  "studio.dessin.symetrie", "studio.dessin.echelle", "studio.dessin.modifier", "studio.dessin.decaler", "studio.architecture.mur", "studio.architecture.ouverture",
  "studio.dessin.supprimer", "studio.objet.calque",
];
const MODES = VINGT.slice(0, 18);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const rapport = { date: new Date().toISOString(), base: BASE, navigateur: browser.version(), fenetre: VIEWPORT, cycles: CYCLES, profil: VINGT, avertissement: "Mesures sans seuil ni verdict (DEC-13). Aucun gain n'est annoncé. Chromium de recette : coût GPU non mesuré.", mesures: {}, incidents: [] };

/**
 * Mesure seulement : un échec d'interaction (outil introuvable, délai, sélecteur absent) est consigné dans le rapport
 * (`incidents`) et la mesure continue avec ce qui reste ; il ne fait jamais échouer le script (sortie 0).
 */
const message = (e) => (e instanceof Error ? e.message.split("\n")[0] : String(e));
function consigner(etape, e, detail = {}) {
  rapport.incidents.push({ etape, ...detail, message: message(e) });
  console.error(`incident (${etape}) : ${message(e)}`);
}
async function etape(nom, f, detail = {}) {
  try {
    return await f();
  } catch (e) {
    consigner(nom, e, detail);
    return null;
  }
}

async function preparer() {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-mesures-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-mesures-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await ctx.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.MES", name: "Studio — mesures de chargement" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Mesures" });
  await api("put", `/projects/${projet.id}/studio/preferences/outils`, { profil: "personnel", favoris: [], personnel: VINGT });
  const etat = await ctx.storageState();
  await ctx.close();
  return { etat, url: `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}` };
}

/** Suivi réseau d'une page par CDP (octets réellement transférés, origine des réponses). */
async function suivre(page, ctx) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  const requetes = new Map();
  cdp.on("Network.requestWillBeSent", (e) => requetes.set(e.requestId, { url: e.request.url, type: e.type, octets: 0, sw: false, disque: false }));
  cdp.on("Network.responseReceived", (e) => { const r = requetes.get(e.requestId); if (r) { r.sw = !!e.response.fromServiceWorker; r.disque = !!e.response.fromDiskCache; } });
  cdp.on("Network.loadingFinished", (e) => { const r = requetes.get(e.requestId); if (r) r.octets = e.encodedDataLength; });
  return { cdp, requetes };
}

async function tas(cdp) {
  await cdp.send("HeapProfiler.collectGarbage").catch(() => undefined);
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { tasUtilise: m.JSHeapUsedSize ?? null, tasTotal: m.JSHeapTotalSize ?? null, noeudsDom: m.Nodes ?? null, ecouteurs: m.JSEventListeners ?? null };
}

async function activerOutils(page, ids, contexte) {
  for (const id of ids) {
    const palette = page.locator("[data-studio-palette]");
    await etape("activation d'outil", async () => {
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Control+k");
      await palette.waitFor({ timeout: 10000 });
      // Recherche par identifiant, puis l'entrée exacte choisie au clavier (Entrée lance la commande, comme son raccourci).
      await palette.locator("[data-studio-recherche-palette]").fill(id);
      const ids = await palette.locator("[data-studio-palette-entree]").evaluateAll((l) => l.map((e) => [e.getAttribute("data-studio-palette-entree"), e.getAttribute("data-studio-disponible")]));
      const rang = ids.findIndex(([x]) => x === id);
      if (rang < 0 || ids[rang][1] !== "oui") throw new Error(rang < 0 ? "outil absent de la palette" : "outil indisponible dans la palette");
      for (let k = 0; k < rang; k++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await palette.waitFor({ state: "detached", timeout: 10000 });
    }, { outil: id, contexte });
    // Palette restée ouverte après un incident : refermée pour l'outil suivant.
    if (await palette.count().catch(() => 0)) await page.keyboard.press("Escape").catch(() => undefined);
  }
}

async function mesurerOuverture(ctx, url, nom) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const { cdp, requetes } = await suivre(page, ctx);
  await page.goto(url);
  await etape(`ouverture (${nom})`, async () => {
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    await page.waitForFunction(() => globalThis.__fadiPerf?.mesures("PERF-01").length > 0);
  });
  const apresOuverture = [...requetes.values()];
  await activerOutils(page, MODES, nom);
  await page.waitForTimeout(500);
  const r = [...requetes.values()];
  const js = (l) => l.filter((x) => new URL(x.url).pathname.endsWith(".js")).map((x) => new URL(x.url).pathname);
  const lire = (quoi, f) => etape(`lecture : ${quoi} (${nom})`, () => page.evaluate(f));
  const resultat = {
    requetes: r.length,
    octetsTransferes: r.reduce((n, x) => n + (x.octets ?? 0), 0),
    reponsesServiceWorker: r.filter((x) => x.sw).length,
    reponsesCacheDisque: r.filter((x) => x.disque).length,
    scriptsAOuverture: js(apresOuverture),
    scriptsApresVingtOutils: js(r),
    moteurs: await lire("moteurs", () => globalThis.__fadiRessources.etats().map((e) => ({ id: e.id, initialise: e.initialise, initialisations: e.initialisations }))),
    perf01: (await lire("PERF-01", () => globalThis.__fadiPerf.mesures("PERF-01").map((m) => ({ ms: m.valeur, depuis: m.etiquettes.depuis })))) ?? [],
    perf02: (await lire("PERF-02", () => globalThis.__fadiPerf.mesures("PERF-02").map((m) => ({ outil: m.etiquettes.outil, nature: m.etiquettes.nature, ms: m.valeur })))) ?? [],
    memoire: (await etape(`mémoire (${nom})`, () => tas(cdp))) ?? { tasUtilise: null, tasTotal: null, noeudsDom: null, ecouteurs: null },
    build: await lire("build", () => document.querySelector('meta[name="fadi-build"]')?.content ?? null),
  };
  rapport.mesures[nom] = resultat;
  return { page, cdp };
}

let echec = null;
try {
  const { etat, url } = await preparer();
  // Cache froid : contexte neuf (cookies de session seulement).
  const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: { cookies: etat.cookies, origins: [] } });
  const froid = await mesurerOuverture(ctx, url, "cacheFroid");
  await froid.page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60000 }).catch(() => undefined);
  await froid.page.close();
  // Cache chaud : même contexte (service worker installé, cache HTTP rempli).
  const chaud = await mesurerOuverture(ctx, url, "cacheChaud");
  rapport.mesures.cacheChaud.serviceWorkerActif = await etape("lecture : service worker (chaud)", () => chaud.page.evaluate(() => !!navigator.serviceWorker?.controller));

  // Session longue (D.3-03, PERF-09) : tas après ramasse-miettes à chaque cycle.
  const page = chaud.page;
  const serie = [{ cycle: 0, ...(await tas(chaud.cdp)) }];
  for (let i = 1; i <= CYCLES; i++) {
    const gpu = await etape("cycle : vue 3D", async () => {
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Shift+D");
      await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor();
      const g = await page.locator("canvas[data-studio-vue3d-canvas]").evaluate((c) => ({ geometries: Number(c.dataset.studioGpuGeometries), textures: Number(c.dataset.studioGpuTextures) }));
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Shift+D");
      await page.locator("[data-studio-vue3d]").waitFor({ state: "detached" });
      return g;
    }, { cycle: i });
    await activerOutils(page, MODES.slice(1, 6), `cycle ${i}`);
    await etape("cycle : Tool Manager", async () => {
      await page.getByRole("toolbar", { name: "Outils de dessin" }).getByRole("button", { name: "Outils", exact: true }).click();
      await page.locator("[data-studio-ressources]").waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
      await page.locator("[data-studio-ressources]").waitFor({ state: "detached" });
    }, { cycle: i });
    serie.push({ cycle: i, gpu, ...((await etape("cycle : mémoire", () => tas(chaud.cdp), { cycle: i })) ?? { tasUtilise: null }) });
  }
  const valeurs = serie.map((s) => s.tasUtilise).filter((v) => typeof v === "number");
  rapport.mesures.sessionLongue = {
    serie,
    tasInitial: valeurs[0] ?? null, tasFinal: valeurs[valeurs.length - 1] ?? null, tasPic: valeurs.length ? Math.max(...valeurs) : null,
    ecartFinalInitial: valeurs.length ? valeurs[valeurs.length - 1] - valeurs[0] : null,
    moteurs: (await etape("lecture : moteurs (session longue)", () => page.evaluate(() => globalThis.__fadiRessources.etats().map((e) => ({ id: e.id, initialisations: e.initialisations, liberations: e.liberations }))))) ?? [],
    perf09: await etape("lecture : PERF-09", () => page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-09").length)),
  };
  await ctx.close();
} catch (e) {
  echec = e;
  rapport.erreur = message(e);
  consigner("mesure interrompue", e);
} finally {
  await browser.close();
}

const mo = (o) => (typeof o === "number" ? `${(o / 1_048_576).toFixed(2)} Mo` : "non évalué");
const ligne = (nom, m) => (m ? `| ${nom} | ${m.requetes} | ${mo(m.octetsTransferes)} | ${m.reponsesServiceWorker} | ${m.reponsesCacheDisque} | ${m.scriptsApresVingtOutils.length} | ${mo(m.memoire.tasUtilise)} | ${m.perf01[0]?.ms?.toFixed(0) ?? "—"} ms (${m.perf01[0]?.depuis ?? "—"}) |` : `| ${nom} | non mesuré |`);
const s = rapport.mesures.sessionLongue;
const md = [
  "# Mesures de chargement de Studio (B.3-12, D.3-03)",
  "",
  `Date : ${rapport.date} · navigateur : Chromium ${rapport.navigateur} · build : ${rapport.mesures.cacheFroid?.build ?? "non lu"} · fenêtre : ${VIEWPORT.width}×${VIEWPORT.height} · cycles : ${CYCLES}.`,
  "",
  `> ${rapport.avertissement}`,
  "",
  "## Profil de vingt outils — cache froid et chaud",
  "",
  "| Cache | Requêtes | Octets transférés | Réponses du service worker | Réponses du cache disque | Fichiers JS | Tas JS (après GC) | PERF-01 |",
  "|---|---|---|---|---|---|---|---|",
  ligne("froid", rapport.mesures.cacheFroid),
  ligne("chaud", rapport.mesures.cacheChaud),
  "",
  "## Session longue — mémoire résiduelle",
  "",
  s ? `Tas initial ${mo(s.tasInitial)}, final ${mo(s.tasFinal)}, pic ${mo(s.tasPic)}, écart final − initial ${mo(s.ecartFinalInitial)} (valeur brute, sans interprétation).` : "Non mesurée.",
  s ? `Initialisations des moteurs : ${s.moteurs.map((m) => `${m.id} ${m.initialisations}`).join(", ")}.` : "",
  "",
  "## Incidents d'interaction",
  "",
  rapport.incidents.length
    ? `${rapport.incidents.length} incident(s) consigné(s) — la mesure a continué avec ce qui restait (mesure seulement, aucun verdict) :`
    : "Aucun incident d'interaction.",
  ...rapport.incidents.map((i) => `- ${i.etape}${i.outil ? ` — ${i.outil}` : ""}${i.contexte ? ` (${i.contexte})` : ""}${i.cycle ? ` (cycle ${i.cycle})` : ""} : ${i.message}`),
  "",
  echec ? `Mesure interrompue : ${rapport.erreur}` : "Données complètes : mesures.json.",
  "",
].join("\n");
writeFileSync(join(OUT, "mesures.json"), JSON.stringify(rapport, null, 2));
writeFileSync(join(OUT, "rapport.md"), md);
console.log(md);
// Mesure seulement (B.3-12) : un échec est consigné dans rapport.md et mesures.json, jamais un verdict ; sortie 0.
if (echec) console.error(echec);
process.exit(0);
