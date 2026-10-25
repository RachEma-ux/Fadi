#!/usr/bin/env node
/**
 * Recette du cycle de chargement des outils et des ressources d'exécution de Studio (B.3-01 à B.3-11, D.3-01 à
 * D.3-04, X.1-09) sur l'application construite servie par l'API (WEB_DIST, service worker actif) :
 *
 *  1. démarrage léger : l'accueil de Studio n'exécute ni la planche, ni three.js, ni un noyau exact, ni un Worker ;
 *  2. ouverture d'une planche : l'éditeur est chargé, three.js toujours pas ; moteurs « planche » initialisés et actifs ;
 *  3. Tool Manager : quatre états distincts par moteur — le rendu 3D est « téléchargé » et « disponible hors connexion »
 *     (précaché) mais ni initialisé ni actif ; relevé PERF-01 à PERF-10 (PERF-07, booléen exact du lot F2, non mesuré tant
 *     que l'outil n'a pas servi) ; noyau exact ni chargé ni disponible hors connexion (son .wasm n'est jamais préchargé) ;
 *  4. premier usage de la vue 3D : three.js chargé une fois, moteur initialisé une fois, actif tant que la vue est
 *     ouverte, inactif sans réinitialisation à la réouverture ; le groupe de Workers est partagé puis libérable ;
 *  5. hors connexion véridique : un fichier du rendu 3D retiré du cache → outils 3D annoncés indisponibles, outils 2D
 *     disponibles ; « Préparer le profil hors ligne » le range à nouveau ;
 *  6. file locale incompatible (format futur) : ni envoyée ni effacée, exportée (ligne relue au clic) puis abandonnée
 *     sur confirmation ; une ligne réécrite après l'export n'est pas abandonnée (nouvel export exigé) ;
 *  7. cache du build de la page purgé après avoir été vu : « non » hors connexion et avertissement ;
 *  8. NAV-008 : moteur de la planche impossible à charger → alerte récupérable, rien d'écrit, navigation de Fadi
 *     utilisable, « Réessayer » recharge le moteur une fois le réseau rétabli.
 *
 * Les fichiers lourds (three.js, vue 3D, noyau exact, planche) sont désignés par la carte du build (`/chargement.json`),
 * jamais par un nom de fichier supposé. PERF-01 : page ouverte sur la variante → depuis la navigation ; navigation
 * interne vers la variante → depuis l'entrée sur sa route.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-chargement.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

/** Fichiers JavaScript demandés par la page (hors service worker), par nom de morceau. */
const scriptsDemandes = (page) => page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => p.endsWith(".js")));
const contient = (liste, fichiers) => liste.some((p) => fichiers.has(p));
/**
 * Fichiers lourds du build, lus dans la carte des morceaux (`/chargement.json`, familles relevées par Rollup) : aucun
 * nom de fichier supposé (three.js peut être découpé en plusieurs morceaux, renommés d'une version à l'autre).
 */
const famille = (carte, f) => new Set(Object.entries(carte.morceaux).filter(([, m]) => m.familles.includes(f)).map(([p]) => p));
let LOURDS = null;
let PLANCHE = null;
const etats = (page) => page.evaluate(() => Object.fromEntries(globalThis.__fadiRessources.etats().map((e) => [e.id, { ...e }])));

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-chargement-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-chargement-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.CHG", name: "Studio — chargement" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude chargement" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const moi = await api("get", "/auth/me");
  const cle = `${moi.id}|${projet.id}|${studyId}|${variantId}`;

  // 1. Démarrage léger : accueil de Studio (service worker installé puis page rechargée sous son contrôle).
  await page.goto(`${BASE}/studio`);
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
  await page.reload();
  await page.locator('[data-studio="accueil"]').waitFor();
  await page.waitForFunction(() => !!globalThis.__fadiRessources);
  const auDemarrage = await scriptsDemandes(page);
  const carte = await page.evaluate(async () => (await fetch("/chargement.json")).json());
  check("carte des morceaux du build : découpage conforme, build de la page", carte.verification.ok && carte.build === (await page.evaluate(() => document.querySelector('meta[name="fadi-build"]')?.content)), JSON.stringify(carte.verification));
  LOURDS = { three: famille(carte, "three"), vue3d: famille(carte, "studio-3d"), occt: famille(carte, "occt"), manifold: famille(carte, "manifold"), atelier: famille(carte, "atelier") };
  PLANCHE = famille(carte, "studio-planche");
  check("carte : three.js, la vue 3D et la planche repérés dans le build", LOURDS.three.size > 0 && LOURDS.vue3d.size > 0 && PLANCHE.size > 0, JSON.stringify({ three: [...LOURDS.three], vue3d: [...LOURDS.vue3d], planche: [...PLANCHE] }));
  check("démarrage : ni planche, ni three.js, ni noyau exact, ni Atelier exécutés (B.3-02, EX-038)",
    !contient(auDemarrage, PLANCHE) && !Object.values(LOURDS).some((m) => contient(auDemarrage, m)), auDemarrage.join(" "));
  const e0 = await etats(page);
  check("démarrage : seule la coquille est initialisée", e0["coquille-studio"].initialise && !e0["planche-2d"].initialise && !e0["rendu-3d"].initialise && !e0.calcul.initialise, JSON.stringify(Object.values(e0).map((e) => [e.id, e.phase])));

  // 2. Ouverture d'une planche.
  await page.goto(url);
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  await outils.waitFor();
  await page.waitForFunction(() => globalThis.__fadiPerf?.mesures("PERF-01").length > 0);
  const aLaPlanche = await scriptsDemandes(page);
  check("planche : l'éditeur est chargé, three.js / vue 3D / noyau exact toujours pas (B.3-03, EX-039)",
    contient(aLaPlanche, PLANCHE) && !Object.values(LOURDS).some((m) => contient(aLaPlanche, m)), aLaPlanche.filter((p) => !/index-/.test(p)).join(" "));
  const e1 = await etats(page);
  check("planche : moteurs planche initialisés et actifs (outil Sélection), rendu 3D non initialisé (B.3-01)",
    e1["planche-2d"].initialise && e1["planche-2d"].actif && e1["coquille-studio"].actif && !e1["rendu-3d"].initialise && e1["planche-2d"].initialisations === 1);
  const perf01 = await page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-01")[0]);
  // Page ouverte directement sur la variante : la mesure part du début de la navigation.
  check("PERF-01 : page ouverte sur la variante — mesurée depuis la navigation jusqu'à la planche prête, sans verdict", perf01.valeur > 0 && perf01.unite === "ms" && perf01.etiquettes.depuis === "navigation", JSON.stringify(perf01));
  // Navigation interne : accueil de Studio, puis retour sur la variante — la mesure part de l'entrée sur sa route.
  const naviguer = (chemin) => page.evaluate((c) => { history.pushState({}, "", c); dispatchEvent(new PopStateEvent("popstate")); }, chemin);
  await naviguer("/studio");
  await page.locator('[data-studio="accueil"]').waitFor();
  await naviguer(new URL(url).pathname);
  await outils.waitFor();
  await page.waitForFunction(() => globalThis.__fadiPerf.mesures("PERF-01").length > 1);
  const perf01b = await page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-01")[1]);
  check("PERF-01 : navigation interne vers la variante — mesurée depuis l'entrée sur sa route (pas depuis la coquille)", perf01b.etiquettes.depuis === "route" && perf01b.valeur > 0,JSON.stringify(perf01b));

  // 3. Tool Manager : états techniques distincts.
  const ouvrirGestionnaire = async () => {
    await page.getByRole("toolbar", { name: "Actions de l’espace" }).getByRole("button", { name: "Outils", exact: true }).click();
    const g = page.locator("[data-studio-ressources]");
    await g.waitFor();
    await page.locator('[data-studio-ressources][data-studio-verification="evalue"] [data-studio-hors-ligne-etat="aucun"]').waitFor({ timeout: 20000 });
    return g;
  };
  const fermerGestionnaire = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
    await page.locator("[data-studio-ressources]").waitFor({ state: "detached" });
    await page.evaluate(() => document.activeElement?.blur());
  };
  let g = await ouvrirGestionnaire();
  const ligneMoteur = (id) => g.locator(`[data-studio-moteur="${id}"]`);
  const attr = async (id) => {
    const l = ligneMoteur(id);
    return { t: await l.getAttribute("data-telecharge"), i: await l.getAttribute("data-initialise"), a: await l.getAttribute("data-actif"), h: await l.getAttribute("data-hors-connexion") };
  };
  const r3d = await attr("rendu-3d");
  check("Tool Manager : rendu 3D précaché — téléchargé et disponible hors connexion, mais ni initialisé ni actif (B.3-08)", r3d.t === "oui" && r3d.h === "oui" && r3d.i === "non" && r3d.a === "non", JSON.stringify(r3d));
  const p2d = await attr("planche-2d");
  check("Tool Manager : planche téléchargée, initialisée, active, disponible hors connexion", p2d.t === "oui" && p2d.i === "oui" && p2d.a === "oui" && p2d.h === "oui", JSON.stringify(p2d));
  check("Tool Manager : relevé PERF-01 à PERF-10 affiché, PERF-07 (booléen exact) non mesuré tant que l'outil n'a pas servi (X.1-09)",
    (await g.locator("[data-studio-perf]").count()) === 10 && Number(await g.locator('[data-studio-perf="PERF-01"]').getAttribute("data-n")) >= 1
    && /non mesuré/.test(await g.locator('[data-studio-perf="PERF-07"]').textContent()));
  const exact = await attr("noyau-exact");
  check("Tool Manager : noyau exact (lot F2) ni initialisé ni actif à l'ouverture, indisponible hors connexion (.wasm jamais préchargé)", exact.i === "non" && exact.a === "non" && exact.h === "non", JSON.stringify(exact));
  check("Tool Manager : file locale et persistance du stockage annoncées (B.3-10)", /^\d+$/.test(await g.locator("[data-studio-file-locale]").getAttribute("data-studio-file-locale")) && !!(await g.locator("[data-studio-persistance]").getAttribute("data-studio-persistance")));
  const releve = page.waitForEvent("download");
  await g.locator("[data-studio-telecharger-releve]").click();
  const fichierReleve = JSON.parse(readFileSync(await (await releve).path(), "utf8"));
  check("relevé PERF téléchargeable (définitions, synthèse, journal)", fichierReleve.definitions.length === 10 && Array.isArray(fichierReleve.journal) && fichierReleve.synthese.length === 10);
  await fermerGestionnaire();

  // PERF-02 : outil 2D (simple), puis vue 3D au premier usage.
  await page.keyboard.press("l");
  await page.waitForFunction(() => globalThis.__fadiPerf.mesures("PERF-02").some((m) => m.etiquettes.outil === "studio.dessin.ligne"));
  check("PERF-02 : activation de Ligne relevée (simple : moteurs déjà prêts)", await page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-02").find((m) => m.etiquettes.outil === "studio.dessin.ligne")?.etiquettes.nature === "simple"));

  // 4. Premier usage de la vue 3D.
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 30000 });
  const e2 = await etats(page);
  const avec3d = await scriptsDemandes(page);
  const threeDemandes = (l) => l.filter((p) => LOURDS.three.has(p));
  const three1 = threeDemandes(avec3d);
  check("vue 3D : three.js chargé au premier usage, chaque morceau une seule fois (B.3-04)", three1.length >= 1 && new Set(three1).size === three1.length && contient(avec3d, LOURDS.vue3d) && !contient(avec3d, LOURDS.occt) && !contient(avec3d, LOURDS.manifold), three1.join(" "));
  check("vue 3D : moteur initialisé une fois et actif", e2["rendu-3d"].initialise && e2["rendu-3d"].actif && e2["rendu-3d"].initialisations === 1);
  await page.waitForFunction(() => globalThis.__fadiRessources.etats().find((e) => e.id === "calcul").initialise, null, { timeout: 30000 });
  check("maillage 3D : groupe de Workers partagé initialisé (moteur calcul), jamais un noyau par outil (D.3-04)", (await etats(page)).calcul.initialisations === 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d]").waitFor({ state: "detached" });
  const e3 = await etats(page);
  check("vue 3D fermée : moteur inactif, toujours initialisé (aucune réinitialisation à prévoir)", !e3["rendu-3d"].actif && e3["rendu-3d"].initialise);
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 30000 });
  const e4 = await etats(page);
  check("vue 3D rouverte : même moteur, aucune seconde initialisation, three.js non redemandé (B.3-05)", e4["rendu-3d"].initialisations === 1 && threeDemandes(await scriptsDemandes(page)).length === three1.length);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d]").waitFor({ state: "detached" });
  check("PERF-05 / PERF-09 : rendu 3D (CPU) relevé ; mémoire relevée si le navigateur l'expose", await page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-05").some((m) => m.etiquettes.vue === "3d")));

  // Libération du groupe de Workers inactif (D.3-02) : arrêté, recréé à la demande suivante.
  await page.waitForFunction(() => !globalThis.__fadiRessources.etats().find((e) => e.id === "calcul").actif, null, { timeout: 30000 });
  g = await ouvrirGestionnaire();
  await g.locator('[data-studio-liberer="calcul"]').click();
  await g.locator('[data-studio-moteur="calcul"][data-phase="libere"]').waitFor();
  check("moteur calcul inactif libéré depuis le Tool Manager (Workers arrêtés)", (await etats(page)).calcul.liberations === 1);
  await fermerGestionnaire();
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 30000 });
  await page.waitForFunction(() => globalThis.__fadiRessources.etats().find((e) => e.id === "calcul").phase === "initialise", null, { timeout: 30000 });
  check("après libération : Workers recréés à la demande suivante (seconde initialisation comptée)", (await etats(page)).calcul.initialisations === 2);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d]").waitFor({ state: "detached" });

  // 5. Hors connexion véridique : three.js retiré du cache de ce build.
  // Fichier three.js propre au rendu 3D, désigné par la carte du build (le plus gros s'il y en a plusieurs).
  const cibleThree = carte.moteurs["rendu-3d"].propres.filter((p) => LOURDS.three.has(p)).sort((a, b) => carte.morceaux[b].taille - carte.morceaux[a].taille)[0] ?? null;
  const retire = await page.evaluate(async (cible) => {
    if (!cible) return null;
    const build = document.querySelector('meta[name="fadi-build"]').content;
    const cache = await caches.open(`fadi-shell-${build}`);
    return (await cache.delete(cible)) ? cible : null;
  }, cibleThree);
  check("préparation : three.js retiré du cache du build (simulation d'un fichier absent)", !!retire, String(retire));
  g = await ouvrirGestionnaire();
  await g.locator("[data-studio-verifier-cache]").click();
  await g.locator('[data-studio-moteur="rendu-3d"][data-hors-connexion="non"]').waitFor();
  check("hors connexion : rendu 3D indisponible, outils 3D listés, outils 2D disponibles (B.3-09, EX-043)",
    (await g.locator('[data-studio-indisponible-hors-ligne="studio.solide.boite"]').count()) === 1
    && (await g.locator('[data-studio-indisponible-hors-ligne="studio.dessin.ligne"]').count()) === 0
    && (await g.locator('[data-studio-moteur="planche-2d"]').getAttribute("data-hors-connexion")) === "oui");
  check("hors connexion : rendu 3D toujours « téléchargé » dans la page (code en mémoire) mais pas hors connexion : états distincts", (await attr("rendu-3d")).i === "oui" && (await attr("rendu-3d")).h === "non");
  await g.locator("[data-studio-preparer-hors-ligne]").click();
  await g.locator('[data-studio-moteur="rendu-3d"][data-hors-connexion="oui"]').waitFor({ timeout: 30000 });
  check("« Préparer le profil hors ligne » : fichier rangé à nouveau, tous les outils disponibles hors connexion",
    Number(await g.locator("[data-studio-preparation-ranges]").getAttribute("data-studio-preparation-ranges")) >= 1 && (await g.locator("[data-studio-indisponibles-hors-ligne]").count()) === 0);
  check("PERF-10 : vérification du cache relevée", await page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-10").length >= 2));
  await fermerGestionnaire();

  // 6. File locale incompatible (écrite par un format futur) : ni envoyée, ni effacée ; exportée puis abandonnée.
  const futur = { cle, userId: moi.id, projectId: projet.id, stamp: "futur", majA: new Date().toISOString(), donnees: JSON.stringify({ version: 99, userId: moi.id, pas: [[{ toolId: "studio.dessin.ligne", params: {} }]] }) };
  const ecrireLigne = (l) => page.evaluate((ligne) => new Promise((resolve, reject) => {
    const req = indexedDB.open("fadi-local");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const db = req.result; const tx = db.transaction("studioBrouillons", "readwrite"); tx.objectStore("studioBrouillons").put(ligne); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), l);
  await ecrireLigne(futur);
  const commandes = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/commands$/.test(new URL(r.url()).pathname)) commandes.push(r.url()); });
  await page.reload();
  await page.locator('[data-studio-file-locale-incompatible="version-future"]').waitFor();
  const presente = () => page.evaluate((k) => new Promise((resolve) => {
    const req = indexedDB.open("fadi-local");
    req.onsuccess = () => { const db = req.result; const get = db.transaction("studioBrouillons").objectStore("studioBrouillons").get(k); get.onsuccess = () => { db.close(); resolve(get.result ?? null); }; };
  }), cle);
  check("file incompatible : signalée, ni envoyée ni effacée (B.3-11)", (await presente())?.stamp === "futur" && commandes.length === 0);
  check("file incompatible : abandon impossible avant export", await page.locator("[data-studio-abandonner-file-locale]").isDisabled());
  const telechargement = page.waitForEvent("download");
  await page.locator("[data-studio-exporter-file-locale]").click();
  const exporte = JSON.parse(readFileSync(await (await telechargement).path(), "utf8"));
  check("export de la file locale : ligne brute intacte", exporte.raison === "version-future" && exporte.ligne.stamp === "futur" && exporte.ligne.donnees === futur.donnees);
  // Un autre onglet réécrit la ligne après l'export : l'abandon est refusé, rien n'est retiré, un nouvel export est demandé.
  const reecrite = { ...futur, stamp: "futur-2", donnees: JSON.stringify({ version: 99, userId: moi.id, autre: true }) };
  await ecrireLigne(reecrite);
  await page.locator("[data-studio-abandonner-file-locale]").click();
  await page.locator("[data-studio-file-locale-message]", { hasText: "a changé" }).waitFor();
  check("abandon après réécriture par un autre onglet : refusé, ligne conservée, nouvel export exigé",
    (await presente())?.stamp === "futur-2" && (await page.locator("[data-studio-abandonner-file-locale]").isDisabled()));
  const telechargement2 = page.waitForEvent("download");
  await page.locator("[data-studio-exporter-file-locale]").click();
  const exporte2 = JSON.parse(readFileSync(await (await telechargement2).path(), "utf8"));
  check("nouvel export : la ligne relue au clic (réécrite), pas la copie signalée", exporte2.ligne.stamp === "futur-2" && exporte2.ligne.donnees === reecrite.donnees);
  await page.locator("[data-studio-abandonner-file-locale]").click();
  await page.waitForLoadState("load");
  await outils.waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-studio-file-locale-incompatible]"));
  check("abandon confirmé : file retirée, version serveur rouverte", (await presente()) === null && commandes.length === 0);

  // 7. Cache du build de la page purgé après avoir été vu : « non » partout et avertissement (jamais « disponible »).
  g = await ouvrirGestionnaire();
  await page.evaluate(async () => { await caches.delete(`fadi-shell-${document.querySelector('meta[name="fadi-build"]').content}`); });
  await g.locator("[data-studio-verifier-cache]").click();
  await page.locator('[data-studio-ressources][data-studio-verification="cache-purge"]').waitFor();
  check("cache purgé : avertissement affiché, planche et rendu 3D « non » hors connexion (B.3-09)",
    (await g.locator("[data-studio-cache-purge]").count()) === 1 && (await attr("planche-2d")).h === "non" && (await attr("rendu-3d")).h === "non"
    && (await g.locator('[data-studio-indisponible-hors-ligne="studio.dessin.ligne"]').count()) === 1);
  await fermerGestionnaire();

  // 8. NAV-008 : le moteur de la planche ne se charge pas (fichiers refusés par le réseau, sans service worker ni cache)
  // → erreur annoncée et récupérable, rien n'est écrit, la navigation de Fadi reste utilisable ; « Réessayer » recharge.
  const panne = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", storageState: await context.storageState() });
  const p8 = await panne.newPage();
  p8.setDefaultTimeout(20000);
  const erreurs8 = [];
  p8.on("pageerror", (e) => erreurs8.push(e.message));
  let bloque = true;
  const ecritures8 = [];
  p8.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/studio/")) ecritures8.push(r.url()); });
  await p8.route((u) => PLANCHE.has(u.pathname), (route) => (bloque ? route.abort("failed") : route.continue()));
  await p8.goto(url);
  const alerte = p8.locator("[data-studio-planche-indisponible]");
  await alerte.waitFor();
  check("NAV-008 : moteur de la planche impossible à charger — erreur annoncée (role=alert) avec « Réessayer », aucune planche",
    (await alerte.getAttribute("role")) === "alert" && (await p8.locator("[data-studio-reessayer-planche]").count()) === 1
    && (await p8.getByRole("toolbar", { name: "Outils de dessin" }).count()) === 0);
  check("NAV-008 : la barre de Fadi reste visible, sans mode immersif", (await p8.locator(".app-sidebar").isVisible())
    && !(await p8.evaluate(() => document.body.classList.contains("atelier-immersive"))));
  await p8.locator('#workspace-navigation a[aria-label="Accueil"]').click();
  await p8.waitForURL(/\/accueil$/);
  check("NAV-008 : la navigation de Fadi n'est pas bloquée (Accueil atteint depuis la barre)", new URL(p8.url()).pathname === "/accueil");
  await p8.goBack();
  await alerte.waitFor();
  bloque = false;
  await p8.locator("[data-studio-reessayer-planche]").click();
  await p8.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  check("NAV-008 : « Réessayer » recharge le moteur une fois le réseau rétabli — planche affichée, alerte retirée",
    (await alerte.count()) === 0 && (await p8.locator("[data-studio-planche-indisponible]").count()) === 0);
  check("NAV-008 : rien n'a été écrit pendant la panne (aucune requête d'écriture Studio)", ecritures8.length === 0, ecritures8.join(" "));
  check("NAV-008 : aucune erreur JavaScript non interceptée pendant la panne et la reprise", erreurs8.length === 0, erreurs8.join(" | "));
  await panne.close();

  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
  await context.close();
} catch (e) {
  echecs += 1;
  console.error(e);
} finally {
  await browser.close();
}
if (echecs) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette du chargement des outils et des ressources : tous les contrôles sont passés.");
