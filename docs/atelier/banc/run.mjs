// Banc de mesures L0.4 — point d'entrée unique.
//   node --expose-gc run.mjs [--sans-navigateur] [--sans-node] [--repetitions=3] [--sortie=resultats/mesures-banc.json]
// 1) écrit la scène dérivée de P.118 (scene/p118-scene.json) ;
// 2) mesures Node (tailles et init WASM, manifold-3d, Yjs, écriture IFC 4.3) ;
// 3) mesures navigateur via Playwright/Chromium : rendu three.js WebGL2 (ouverture, trame en orbite, sélection),
//    initialisation des WASM dans la page, quotas de stockage (contexte éphémère et profil persistant) ;
// 4) écrit un JSON unique avec le banc déclaré (machine, navigateur, GPU/renderer WebGL, modèle, triangles, cache).
// Variables : BANC_CHROMIUM_ARGS (remplace les drapeaux Chromium par défaut, séparés par des espaces),
//             BANC_HEADLESS=0 (fenêtre visible, pour un poste avec GPU réel).
import { createServer } from "node:http";
import { createReadStream, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";
import { ecrireScene } from "./scene.mjs";
import { mesuresNode } from "./mesures-node.mjs";
import { decrireMachine } from "./lib/machine.mjs";
import { versionPaquet } from "./lib/paquets.mjs";
import { CANDIDATS } from "./lib/wasm.mjs";

const ici = dirname(fileURLToPath(import.meta.url));
const arg = (nom, defaut) => { const a = process.argv.find((x) => x === `--${nom}` || x.startsWith(`--${nom}=`)); return a == null ? defaut : a.includes("=") ? a.split("=").slice(1).join("=") : true; };
const REPETITIONS = Number(arg("repetitions", 3));
const SORTIE = join(ici, arg("sortie", "resultats/mesures-banc.json"));
const VIEWPORT = { width: 1536, height: 864 };
const DRAPEAUX_DEFAUT = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".map": "application/json" };

function demarrerServeur() {
  const serveur = createServer((req, res) => {
    try {
      const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const local = normalize(join(ici, chemin === "/" ? "/page/index.html" : chemin));
      if (!local.startsWith(ici + sep) || req.method !== "GET") { res.writeHead(403).end(); return; }
      const st = statSync(local, { throwIfNoEntry: false });
      if (!st?.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[extname(local)] ?? "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache" });
      createReadStream(local).pipe(res);
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((ok) => serveur.listen(0, "127.0.0.1", () => ok({ serveur, base: `http://127.0.0.1:${serveur.address().port}` })));
}

const mediane = (v) => { const t = v.filter((x) => typeof x === "number").sort((a, b) => a - b); return t.length ? t[Math.floor((t.length - 1) / 2)] : null; };

async function ouvrirPage(contexte, base, journal) {
  const page = await contexte.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") journal.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
  page.on("pageerror", (e) => journal.push(`[pageerror] ${e.message}`.slice(0, 400)));
  await page.goto(`${base}/page/index.html`);
  await page.waitForFunction(() => window.__banc?.pret === true, null, { timeout: 60_000 });
  return page;
}

async function mesuresNavigateur(base) {
  const { chromium } = await import("playwright");
  const drapeaux = process.env.BANC_CHROMIUM_ARGS ? process.env.BANC_CHROMIUM_ARGS.split(/\s+/).filter(Boolean) : DRAPEAUX_DEFAUT;
  const headless = process.env.BANC_HEADLESS !== "0";
  const journal = [];
  const navigateur = await chromium.launch({ headless, args: drapeaux });
  const res = { lancement: { headless, drapeaux, playwright: versionPaquet("playwright"), version: navigateur.version() }, journalConsole: journal };
  try {
    const nouveauContexte = () => navigateur.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });

    // Informations navigateur / GPU
    {
      const ctx = await nouveauContexte();
      const page = await ouvrirPage(ctx, base, journal);
      res.infos = await page.evaluate(() => window.__banc.infosNavigateur());
      await ctx.close();
    }
    const r = (res.infos?.gpu?.unmaskedRenderer ?? res.infos?.gpu?.renderer ?? "") + "";
    res.rendu3d = { renderer: r, logiciel: /swiftshader|llvmpipe|softpipe|software/i.test(r) };

    // Rendu three.js : chaque répétition dans un contexte neuf (cache HTTP vide, aucun programme GPU compilé),
    // puis une 2e ouverture dans la même page (programmes déjà compilés, modules JS en mémoire).
    res.rendu = { protocole: { viewport: VIEWPORT, deviceScaleFactor: 1, tramesOrbite: 300, rayons: 200, repetitions: REPETITIONS }, essais: [] };
    for (const variante of ["objets", "fusionne"]) {
      for (let i = 0; i < REPETITIONS; i++) {
        const ctx = await nouveauContexte();
        const page = await ouvrirPage(ctx, base, journal);
        page.setDefaultTimeout(300_000);
        const froid = await page.evaluate((v) => window.__banc.mesurerRendu({ variante: v }), variante);
        const chaud = await page.evaluate((v) => window.__banc.mesurerRendu({ variante: v }), variante);
        res.rendu.essais.push({ ...froid, repetition: i + 1, cache: "froid (contexte neuf)" });
        res.rendu.essais.push({ ...chaud, repetition: i + 1, cache: "chaud (même page, programmes GPU compilés)" });
        await ctx.close();
        console.error(`  ✓ rendu ${variante} #${i + 1}`);
      }
    }
    res.rendu.synthese = {};
    for (const variante of ["objets", "fusionne"]) for (const cache of ["froid", "chaud"]) {
      const e = res.rendu.essais.filter((x) => x.variante === variante && x.cache.startsWith(cache));
      res.rendu.synthese[`${variante}-${cache}`] = {
        essais: e.length,
        ouvertureTotaleMsMediane: mediane(e.map((x) => x.ouvertureMs.total)),
        constructionMsMediane: mediane(e.map((x) => x.ouvertureMs.construction)),
        premiereTrameMsMediane: mediane(e.map((x) => x.ouvertureMs.premiereTrameSynchronisee)),
        trameSynchroniseeP95MsMediane: mediane(e.map((x) => x.tramesOrbite.coutSynchroniseMs.p95)),
        trameSynchroniseeP50MsMediane: mediane(e.map((x) => x.tramesOrbite.coutSynchroniseMs.p50)),
        intervalleRafP95MsMediane: mediane(e.map((x) => x.tramesOrbite.intervallesRafMs.p95)),
        selectionP95MsMediane: mediane(e.map((x) => x.selection.msParRayon.p95)),
        selectionP50MsMediane: mediane(e.map((x) => x.selection.msParRayon.p50)),
        triangles: e[0]?.info.triangles ?? null,
        appelsDessin: e[0]?.info.appelsDessin ?? null,
      };
    }

    // WASM dans la page : contexte neuf par essai (cache HTTP vide, pas de cache de code V8).
    res.wasmNavigateur = [];
    for (const c of CANDIDATS) {
      const essais = [];
      let erreur = null;
      for (let i = 0; i < REPETITIONS; i++) {
        const ctx = await nouveauContexte();
        try {
          const page = await ouvrirPage(ctx, base, journal);
          page.setDefaultTimeout(300_000);
          essais.push(await page.evaluate((id) => window.__banc.initWasmNavigateur(id), c.id));
        } catch (e) {
          erreur = String(e?.message ?? e).slice(0, 600);
        } finally {
          await ctx.close();
        }
        if (erreur) break;
      }
      res.wasmNavigateur.push({ id: c.id, version: versionPaquet(c.paquet), essais, initMsMediane: mediane(essais.map((x) => x.initMs)), erreur });
      console.error(`  ${erreur ? "✗" : "✓"} WASM navigateur ${c.id}`);
    }

    // Quotas : contexte éphémère (type navigation privée)…
    res.quotas = {};
    {
      const ctx = await nouveauContexte();
      const page = await ouvrirPage(ctx, base, journal);
      res.quotas.contexteEphemere = await page.evaluate(() => window.__banc.mesurerQuotas({ blocsMo: 50 }));
      await ctx.close();
    }
  } finally {
    await navigateur.close();
  }
  // … et profil persistant (comme un profil utilisateur ordinaire).
  const profil = mkdtempSync(join(tmpdir(), "banc-l04-profil-"));
  try {
    const ctx = await chromium.launchPersistentContext(profil, { headless, args: drapeaux, viewport: VIEWPORT });
    const page = await ouvrirPage(ctx, base, journal);
    res.quotas.profilPersistant = await page.evaluate(() => window.__banc.mesurerQuotas({ blocsMo: 50 }));
    await ctx.close();
  } catch (e) {
    res.quotas.profilPersistant = { erreur: String(e?.message ?? e).slice(0, 600) };
  } finally {
    rmSync(profil, { recursive: true, force: true });
  }
  console.error("  ✓ quotas");
  return res;
}

const debut = new Date().toISOString();
const scene = ecrireScene();
console.error(`Scène P.118 : ${scene.octets} octets, ${JSON.stringify(scene.comptes)}`);
const resultat = {
  banc: "Fadi — Atelier DrawAll V4.1 — lot 0, tâche L0.4 (issue #5)",
  debut,
  machine: decrireMachine(),
  modele: { source: scene.source, sceneOctets: scene.octets, comptes: scene.comptes },
  versions: Object.fromEntries(["three", "web-ifc", "manifold-3d", "yjs", "occt-wasm", "opencascade.js", "playwright"].map((p) => [p, versionPaquet(p)])),
};
if (!arg("sans-node", false)) resultat.node = await mesuresNode({ repetitions: REPETITIONS });
else resultat.node = "non exécuté (--sans-node)";
if (!arg("sans-navigateur", false)) {
  console.error("Mesures navigateur :");
  const { serveur, base } = await demarrerServeur();
  try {
    resultat.navigateur = await mesuresNavigateur(base);
  } catch (e) {
    resultat.navigateur = { erreur: String(e?.stack ?? e).slice(0, 2000) };
    process.exitCode = 1;
  } finally {
    serveur.close();
  }
} else resultat.navigateur = "non exécuté (--sans-navigateur)";

const nav = typeof resultat.navigateur === "object" ? resultat.navigateur : null;
resultat.bancDeclare = {
  lieu: resultat.machine.lieu,
  machine: `${resultat.machine.os}, ${resultat.machine.arch}, ${resultat.machine.cpu.coeurs} cœurs (${resultat.machine.cpu.modele}), ${resultat.machine.memoireTotaleMo} Mo`,
  navigateur: nav?.lancement ? `Chromium ${nav.lancement.version} (Playwright ${nav.lancement.playwright}), ${nav.lancement.headless ? "headless" : "fenêtré"}, drapeaux : ${nav.lancement.drapeaux.join(" ")}` : "non exécuté",
  gpu: nav?.rendu3d ? `${nav.rendu3d.renderer}${nav.rendu3d.logiciel ? " — RENDU LOGICIEL (pas un GPU réel)" : ""}` : "non exécuté",
  modele: `P.118 (${resultat.modele.source.chemin}, sha256 ${resultat.modele.source.sha256.slice(0, 12)}…) : ${scene.comptes.murs} murs, ${scene.comptes.ouvertures} ouvertures, ${scene.comptes.poteaux} poteaux, ${scene.comptes.traces} tracés dont ${scene.comptes.tracesAvecHauteur} extrudés, ${scene.comptes.escaliers} escaliers, ${scene.comptes.niveaux} niveaux ; scène ${scene.octets} octets`,
  triangles: nav?.rendu?.synthese?.["objets-froid"]?.triangles ?? "non mesuré",
  cache: "rendu : froid = contexte navigateur neuf (cache HTTP vide, shaders non compilés) ; chaud = 2e ouverture dans la même page ; WASM navigateur : contexte neuf par essai ; WASM Node : processus neuf par essai",
};
resultat.fin = new Date().toISOString();
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify(resultat, null, 2));
console.error(`Écrit ${SORTIE}`);
