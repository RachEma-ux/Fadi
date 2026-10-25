#!/usr/bin/env node
/**
 * Recette des preuves du groupe B (rendu 2D, catalogue, chargement) sur l'application construite servie par l'API
 * (WEB_DIST, service worker actif) :
 *
 *  1. B.3-02 — au démarrage d'une planche, le catalogue léger (manifeste versionné, registre) est dans les scripts déjà
 *     exécutés et le profil d'outils du compte est lu une fois, avant toute action : la barre montre d'emblée le profil
 *     métier enregistré (Cote visible, Ligne masquée), sans que le gestionnaire ait été ouvert ;
 *  2. TR-EX-026 / TR-EX-029 — à cache froid (contexte neuf, aucun service worker), puis hors connexion : le gestionnaire
 *     trouve un outil par son `toolId` et affiche ses dépendances lues dans le manifeste (chargeur, prérequis) ; la
 *     recherche ne charge ni n'initialise aucun moteur lourd (three.js, vue 3D, noyau exact) ;
 *  3. TR-EX-020 — un dessin 2D est exporté (SVG téléchargé depuis la barre) sans que three.js ni la vue 3D ne soient
 *     chargés ni le moteur de rendu 3D initialisé ; une extrusion saisie puis abandonnée (Échap) ne crée ni commande, ni
 *     objet 3D, ni dépendance, et rien n'est envoyé ;
 *  4. B.3-10 — commandes locales non synchronisées (enveloppe en attente, envoi bloqué) pendant une mise à jour du service
 *     worker (nouveau build installé et activé, page prévenue) : la file locale reste intacte (même requestId, mêmes
 *     pas), survit au rechargement sous le nouveau service worker, puis s'enregistre une seule fois.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-preuves-b node apps/web/e2e/studio-preuves-b.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-preuves-b";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const scriptsDemandes = (page) => page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => p.endsWith(".js")));
const famille = (carte, f) => new Set(Object.entries(carte.morceaux).filter(([, m]) => m.familles.includes(f)).map(([p]) => p));
const contient = (liste, fichiers) => liste.some((p) => fichiers.has(p));
const etats = (page) => page.evaluate(() => Object.fromEntries(globalThis.__fadiRessources.etats().map((e) => [e.id, { ...e }])));

/** Bouton ou lien d'une barre compacte, menu « ▾ » ouvert au besoin (comme l'utilisateur). */
async function atteindre(barre, selecteur) {
  const el = barre.locator(selecteur).first();
  await el.waitFor({ state: "attached" });
  for (let essai = 0; essai < 3 && !(await el.isVisible()); essai++) {
    const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
    if (menu) {
      const bouton = barre.locator(`[aria-controls="${menu}"]`);
      if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
    }
    await el.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  }
  await el.waitFor({ state: "visible" });
  return el;
}

/** Brouillon IndexedDB de la variante (null si absent). */
const brouillonLocal = (page, cle) => page.evaluate((k) => new Promise((resolve, reject) => {
  const req = indexedDB.open("fadi-local");
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("studioBrouillons")) { db.close(); resolve(null); return; }
    const get = db.transaction("studioBrouillons").objectStore("studioBrouillons").get(k);
    get.onsuccess = () => { db.close(); resolve(get.result ? JSON.parse(get.result.donnees) : null); };
    get.onerror = () => { db.close(); reject(get.error); };
  };
}), cle);

async function inscrire(context, prefixe) {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(`${prefixe} : ${e.message}`));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `${prefixe}-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', `${prefixe}-ci-123`);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  return { page, api };
}

try {
  // ——— 1. Démarrage : catalogue léger et profil du compte (B.3-02) ———
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const { page, api } = await inscrire(context, "studio-preuves-b");
  const projet = await api("post", "/projects", { code: "P.STU.PB", name: "Studio — preuves B" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude preuves B" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const moi = await api("get", "/auth/me");
  const cle = `${moi.id}|${projet.id}|${studyId}|${variantId}`;
  const revisions = async () => (await api("get", `${variantePath}/revisions`)).revisions;
  await api("post", `${variantePath}/commands`, {
    contractVersion: "studio-commands/1", requestId: `preuves-b-${Date.now()}`, baseRevisionId: etude.revision.id,
    commands: [{ toolId: "studio.dessin.rectangle", params: { id: "r-export", type: "rectangle", origin: { x: 1, y: 1 }, width: 3, height: 2 } }],
  });
  await api("put", `/projects/${projet.id}/studio/preferences/outils`, { profil: "metier:cotation", favoris: [], personnel: [] });

  const lecturesProfil = [];
  page.on("request", (r) => { if (r.method() === "GET" && new URL(r.url()).pathname === `/projects/${projet.id}/studio/preferences/outils`) lecturesProfil.push(Date.now()); });
  await page.goto(url);
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  await outils.waitFor();
  await outils.locator('[data-studio-outil="studio.dessin.cote"]').first().waitFor({ state: "attached" });
  const carte = await page.evaluate(async () => (await fetch("/chargement.json")).json());
  const LOURDS = { three: famille(carte, "three"), vue3d: famille(carte, "studio-3d"), occt: famille(carte, "occt"), manifold: famille(carte, "manifold") };
  const auDemarrage = await scriptsDemandes(page);
  const textes = await page.evaluate(async (chemins) => (await Promise.all(chemins.map((c) => fetch(c).then((r) => r.text())))).join("\n"), auDemarrage);
  check("B.3-02 : catalogue léger dans les scripts exécutés au démarrage (manifeste studio-tool-manifest/1, registre), sans requête propre",
    textes.includes("studio-tool-manifest/1") && textes.includes("studio.dessin.ligne") && textes.includes("studio.solide.boite") && !auDemarrage.some((p) => /manifest|catalogue/i.test(p)), `${auDemarrage.length} script(s)`);
  check("B.3-02 : profil d'outils du compte lu au démarrage, sans ouvrir le gestionnaire", lecturesProfil.length >= 1 &&(await page.locator("[data-studio-gestionnaire-outils]").count()) === 0, `${lecturesProfil.length} lecture(s)`);
  check("B.3-02 : la barre applique d'emblée le profil enregistré (Cotation : Cote montrée, Ligne masquée)",
    (await outils.locator('[data-studio-outil="studio.dessin.cote"]').count()) >= 1 && (await outils.locator('[data-studio-outil="studio.dessin.ligne"]').count()) === 0);
  check("B.3-02 : aucun moteur lourd au démarrage de la planche (three.js, vue 3D, noyau exact)", !Object.values(LOURDS).some((m) => contient(auDemarrage, m)));

  // ——— 3. Export 2D sans modèle 3D ; extrusion abandonnée (TR-EX-020) ———
  const telechargement = page.waitForEvent("download");
  await (await atteindre(outils, 'a[data-studio-commande="exporter-svg"]')).click();
  const svg = readFileSync(await (await telechargement).path(), "utf8");
  await page.locator("[data-studio-rapport-export]").waitFor().catch(() => {});
  const apresExport = await scriptsDemandes(page);
  const e0 = await etats(page);
  check("TR-EX-020 : dessin 2D exporté en SVG (rectangle relu) sans charger three.js ni la vue 3D, rendu 3D non initialisé",
    /<svg[\s>]/.test(svg) && /r-export/.test(svg) && !Object.values(LOURDS).some((m) => contient(apresExport, m)) && !e0["rendu-3d"].initialise, `${svg.length} octets`);
  if (await page.locator("[data-studio-rapport-fermer]").count()) await page.locator("[data-studio-rapport-fermer]").click();
  const envois = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${variantePath}/commands`) envois.push(r.postDataJSON()); });
  const revisionsAvant = (await revisions()).length;
  const enAttente = () => page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre").catch(() => null);
  const attenteAvant = await enAttente();
  await page.locator('svg [role="button"][aria-label^="Rectangle "]').first().click();
  const form = page.locator("[data-studio-extrusion]");
  await form.waitFor();
  await form.getByLabel("Base (m)", { exact: true }).fill("0");
  await form.getByLabel("Hauteur (m)", { exact: true }).fill("3");
  await form.locator("[data-studio-extrusion-direction]").selectOption("+z");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Escape");
  await form.waitFor({ state: "detached" });
  const docServeur = (await api("get", variantePath)).revision.document;
  const apresAbandon = await scriptsDemandes(page);
  check("TR-EX-020 : extrusion saisie puis abandonnée — aucune commande en attente, rien envoyé, aucune révision, aucun objet extrudé, aucun moteur 3D",
    (await enAttente()) === attenteAvant && envois.length === 0 && (await revisions()).length === revisionsAvant
    && docServeur.objects.every((o) => !o.extrusion) && !(docServeur.solides?.length) && !contient(apresAbandon, LOURDS.three) && !(await etats(page))["rendu-3d"].initialise,
    JSON.stringify({ attente: await enAttente(), envois: envois.length }));

  // ——— 2. Recherche par toolId à cache froid, puis hors connexion (TR-EX-026, TR-EX-029) ———
  // Cache froid : contexte neuf (cache HTTP vide), service workers bloqués — aucun cache de build, rien de précaché.
  const froid = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await context.storageState(), serviceWorkers: "block" });
  let pf = await froid.newPage();
  pf.setDefaultTimeout(20000);
  pf.on("pageerror", (e) => erreurs.push(`froid : ${e.message}`));
  await pf.goto(url);
  let outilsF = pf.getByRole("toolbar", { name: "Outils de dessin" });
  await outilsF.waitFor();
  const cacheFroid = await pf.evaluate(async () => ({ controle: !!navigator.serviceWorker?.controller, caches: (await caches.keys()).filter((n) => n.startsWith("fadi-shell-")).length }));
  const chercher = async (p, texte) => {
    await (await atteindre(p.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Outils"]')).click();
    const g = p.locator("[data-studio-gestionnaire-outils]");
    await g.waitFor();
    await g.getByLabel("Rechercher un outil", { exact: true }).fill(texte);
    await g.locator(`[data-studio-catalogue-entree="${texte}"]`).waitFor();
    const entree = g.locator(`[data-studio-catalogue-entree="${texte}"]`);
    const r = {
      n: await g.locator("[data-studio-catalogue-entree]").count(), chargeur: await entree.locator("[data-studio-chargeur]").getAttribute("data-studio-chargeur"),
      prerequis: await entree.locator("[data-studio-prerequis]").getAttribute("data-studio-prerequis"), contextes: await entree.locator("[data-studio-contextes]").getAttribute("data-studio-contextes"),
      manifeste: await g.getAttribute("data-studio-manifeste"),
    };
    await p.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
    await g.waitFor({ state: "detached" });
    return r;
  };
  const attendu = (r) => r.n === 1 && r.chargeur === "vue-3d" && r.prerequis === "studio.solide.boite studio.solide.prisme" && r.contextes === "vue-3d" && r.manifeste === "studio-tool-manifest/1";
  const rFroid = await chercher(pf, "studio.solide.deplacer");
  const sFroid = await scriptsDemandes(pf);
  check("TR-EX-026 : cache froid (aucun service worker ni cache) — « studio.solide.deplacer » trouvé par son toolId, chargeur vue-3d et prérequis boîte / prisme lus dans le manifeste",
    !cacheFroid.controle && cacheFroid.caches === 0 && attendu(rFroid), JSON.stringify({ cacheFroid, rFroid }));
  check("TR-EX-026 / TR-EX-029 : la recherche ne charge ni n'initialise aucun moteur (three.js, vue 3D, noyau exact non demandés ; rendu 3D non initialisé)",
    !Object.values(LOURDS).some((m) => contient(sFroid, m)) && !(await etats(pf))["rendu-3d"].initialise);
  await froid.close();
  // Hors connexion : un autre contexte neuf, service worker installé à la première visite, puis réseau coupé.
  const horsLigne = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await context.storageState() });
  pf = await horsLigne.newPage();
  pf.setDefaultTimeout(20000);
  pf.on("pageerror", (e) => erreurs.push(`hors ligne : ${e.message}`));
  await pf.goto(url);
  outilsF = pf.getByRole("toolbar", { name: "Outils de dessin" });
  await outilsF.waitFor();
  await pf.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
  await pf.reload();
  await outilsF.waitFor();
  await horsLigne.setOffline(true);
  await pf.reload();
  await outilsF.waitFor();
  const rHors = await chercher(pf, "studio.solide.deplacer");
  const rHors2 = await chercher(pf, "studio.dessin.cote");
  check("TR-EX-026 : hors connexion — même résultat depuis le manifeste léger (toolId, chargeur, prérequis), sans réseau",
    attendu(rHors) && rHors2.chargeur === "planche-2d" && rHors2.prerequis === "" && (await pf.evaluate(() => navigator.onLine)) === false, JSON.stringify({ rHors, rHors2 }));
  const sHors = await scriptsDemandes(pf);
  check("TR-EX-026 : hors connexion, la recherche ne lance toujours aucun moteur lourd", !Object.values(LOURDS).some((m) => contient(sHors, m)) && !(await etats(pf))["rendu-3d"].initialise);
  await horsLigne.close();

  // ——— 4. Mise à jour du service worker avec des commandes locales non synchronisées (B.3-10, TEST-036) ———
  // Profil standard : l'outil Rectangle est dans la barre.
  await api("put", `/projects/${projet.id}/studio/preferences/outils`, { profil: "standard", favoris: [], personnel: [] });
  await page.goto(url);
  await outils.waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
  await page.reload();
  await outils.waitFor();
  const buildPage = await page.evaluate(() => document.querySelector('meta[name="fadi-build"]')?.content ?? null);
  // Envoi bloqué (serveur injoignable pour les commandes) : la page pourra revenir en ligne et recevoir le nouveau
  // service worker sans que l'enveloppe parte.
  await page.route(`**${variantePath}/commands`, (r) => r.abort("internetdisconnected"));
  await context.setOffline(true);
  await page.locator('[data-studio-hors-ligne="hors-ligne"]').waitFor({ timeout: 40000 });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  await (await atteindre(outils, ':is(button,a)[aria-label="Rectangle"]')).click();
  for (const [nom, v] of [["X", 8], ["Y", 8], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Enregistrer"], :is(button)[aria-label="Réessayer la sauvegarde"]')).click();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor({ timeout: 40000 });
  const fileAvant = await brouillonLocal(page, cle);
  const requestId = fileAvant?.plan?.requestIds?.[0];
  check("B.3-10 : préparation — enveloppe en attente sur l'appareil (requestId, un pas)", !!requestId && fileAvant.pas.length >= 1, JSON.stringify(fileAvant?.plan));
  envois.length = 0;
  await context.setOffline(false);
  // Le retour du réseau tente l'envoi : il échoue (route bloquée), la file reste.
  await page.waitForTimeout(3000);
  // Nouveau build du service worker : même script, autre identifiant de build (cache neuf), servi à une nouvelle adresse.
  const nouveauBuild = `${buildPage}-maj`;
  // Le script principal d'un service worker est chargé par le navigateur, hors des routes de Playwright : il est servi
  // par l'interception du protocole Chromium (domaine Fetch, au niveau du navigateur).
  const corpsMaj = (await (await context.request.get(`${BASE}/sw.js`)).text()).replace(`const BUILD = "${buildPage}";`, `const BUILD = "${nouveauBuild}";`);
  check("B.3-10 : préparation — script du nouveau build dérivé du service worker servi (seul l'identifiant de build change)", corpsMaj.includes(`const BUILD = "${nouveauBuild}";`));
  const cdp = await browser.newBrowserCDPSession();
  cdp.on("Fetch.requestPaused", async (e) => {
    if (/\/sw\.js\?maj=1$/.test(e.request.url)) {
      await cdp.send("Fetch.fulfillRequest", { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript" }, { name: "Service-Worker-Allowed", value: "/" }], body: Buffer.from(corpsMaj).toString("base64") }).catch(() => {});
    } else await cdp.send("Fetch.continueRequest", { requestId: e.requestId }).catch(() => {});
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*sw.js?maj=1*" }] });
  const miseAJour = await page.evaluate(async (nb) => {
    const messages = [];
    navigator.serviceWorker.addEventListener("message", (e) => messages.push(e.data));
    const changement = new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(true), { once: true }));
    await navigator.serviceWorker.register("/sw.js?maj=1");
    const ok = await Promise.race([changement, new Promise((r) => setTimeout(() => r(false), 30000))]);
    await new Promise((r) => setTimeout(r, 1000));
    return { controllerchange: ok, messages, caches: (await caches.keys()).filter((n) => n.startsWith("fadi-shell-")), script: navigator.serviceWorker.controller?.scriptURL ?? null, nb };
  }, nouveauBuild);
  // La page est prévenue : le Tool Manager annonce la nouvelle version installée (commandes locales gardées).
  await (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Outils"]')).click();
  const annonce = await page.locator("[data-studio-mise-a-jour-sw]").waitFor({ timeout: 10000 }).then(() => true, () => false);
  await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  check("B.3-10 : nouveau service worker (autre build) installé et activé pendant la session — contrôleur changé, cache du nouveau build créé, ancien gardé pour la page ouverte, mise à jour annoncée",
    miseAJour.controllerchange && /sw\.js\?maj=1$/.test(miseAJour.script ?? "") && miseAJour.caches.includes(`fadi-shell-${nouveauBuild}`) && miseAJour.caches.includes(`fadi-shell-${buildPage}`) && annonce,
    JSON.stringify(miseAJour));
  const fileApres = await brouillonLocal(page, cle);
  check("B.3-10 : après la mise à jour, la file locale est intacte (même requestId, mêmes pas), rien n'a atteint le serveur",
    JSON.stringify(fileApres?.pas) === JSON.stringify(fileAvant.pas) && fileApres?.plan?.requestIds?.[0] === requestId && (await revisions()).length === revisionsAvant,
    JSON.stringify({ avant: fileAvant.plan, apres: fileApres?.plan }));
  // Rechargements sous le service worker remplacé : l'événement « load » peut tarder (vérification de mise à jour du
  // script intercepté) ; on attend le document, puis les éléments que la preuve contrôle réellement.
  const recharger = () => page.reload({ waitUntil: "domcontentloaded", timeout: 40000 });
  await recharger();
  await outils.waitFor();
  await page.locator('[data-studio-hors-ligne="en-attente"]').waitFor({ timeout: 40000 }).catch(() => {});
  const apresRechargement = await brouillonLocal(page, cle);
  check("B.3-10 : rechargement après la mise à jour (page servie par le service worker) — enveloppe toujours en attente, même requestId, mêmes pas",
    apresRechargement?.plan?.requestIds?.[0] === requestId && JSON.stringify(apresRechargement?.pas) === JSON.stringify(fileAvant.pas)
    && (await page.evaluate(() => !!navigator.serviceWorker.controller)), JSON.stringify(apresRechargement?.plan));
  envois.length = 0;
  await page.unroute(`**${variantePath}/commands`);
  await recharger();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor({ timeout: 40000 });
  const tete = await api("get", variantePath);
  check("B.3-10 : envoi rétabli — enregistré une seule fois avec le même requestId, rectangle dans la tête, plus rien sur l'appareil",
    (await revisions()).length === revisionsAvant + 1 && envois.length >= 1 && envois.every((e) => e.requestId === requestId)
    && tete.revision.document.objects.some((o) => o.type === "rectangle" && o.origin?.x === 8 && o.origin?.y === 8) && (await brouillonLocal(page, cle)) === null,
    `${envois.length} envoi(s)`);
  await page.screenshot({ path: join(OUT, "studio-preuves-b.png") });

  // ——— 5. Un mur modifié depuis la planche 2D puis depuis la vue 3D : un seul objet, une seule identité (TR-EX-021) ———
  const etude5 = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude mur 2D / 3D" });
  const v5 = `/projects/${projet.id}/studio/studies/${etude5.study.id}/variants/${etude5.variant.id}`;
  const pose5 = await api("post", `${v5}/commands`, {
    contractVersion: "studio-commands/1", requestId: `preuves-b-mur-${Date.now()}`, baseRevisionId: etude5.revision.id,
    commands: [
      { toolId: "studio.architecture.mur", params: { id: "mur-b", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
      { toolId: "studio.architecture.ouverture", params: { id: "ouv-b", type: "opening", hostId: "mur-b", position: 2, width: 1, height: 2.1, sill: 0 } },
    ],
  });
  void pose5;
  const tete5 = (await api("get", v5)).revision.id;
  const envois5 = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${v5}/commands`) envois5.push(r.postDataJSON()); });
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude5.study.id}/variantes/${etude5.variant.id}`);
  await outils.waitFor();
  const ids2d = await page.locator("svg [data-studio-architecture]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture")).sort());
  const proprietes5 = page.getByRole("complementary", { name: "Propriétés du dessin" });
  const choisirMur = proprietes5.locator('[data-studio-architecture-choisir="mur-b"]');
  await choisirMur.waitFor();
  if ((await choisirMur.getAttribute("aria-pressed")) !== "true") await choisirMur.click();
  const choisi = proprietes5.locator('[data-studio-architecture-choisi="mur-b"]');
  await choisi.waitFor();
  await choisi.getByLabel("Hauteur (m)", { exact: true }).fill("3.2");
  await choisi.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "1");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor({ timeout: 30000 });
  const ids3d = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")).sort());
  await panneaux3d.locator('[data-studio-architecture-3d-objet="mur-b"]').click();
  await choisi.waitFor();
  check("TR-EX-021 : depuis la vue 3D, le mur choisi est le même objet que sur la planche (même identifiant, hauteur modifiée en 2D déjà lue)",
    JSON.stringify(ids3d) === JSON.stringify(ids2d) && JSON.stringify(ids2d) === JSON.stringify(["mur-b", "ouv-b"]) && (await choisi.getByLabel("Hauteur (m)", { exact: true }).inputValue()) === "3.2",
    JSON.stringify({ ids2d, ids3d }));
  await choisi.getByLabel("Épaisseur (m)", { exact: true }).fill("0.25");
  await choisi.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "2");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor({ timeout: 40000 });
  const envoi5 = envois5[envois5.length - 1];
  const relu5 = await api("get", v5);
  const archi5 = relu5.revision.document.architecture ?? [];
  const murs5 = archi5.filter((a) => a.type === "wall");
  const ouv5 = archi5.find((a) => a.id === "ouv-b");
  const revs5 = (await api("get", `${v5}/revisions`)).revisions;
  check("TR-EX-021 : une seule enveloppe, deux « modifier » sur le même objectId (2D puis 3D), aucune autre identité créée",
    envois5.length === 1 && JSON.stringify(envoi5.commands.map((c) => [c.toolId, c.params.id])) === JSON.stringify([["studio.architecture.modifier", "mur-b"], ["studio.architecture.modifier", "mur-b"]]),
    JSON.stringify(envoi5?.commands));
  check("TR-EX-021 : relu — un seul mur « mur-b » portant les deux modifications, l'ouverture toujours hébergée par lui (relation conservée)",
    murs5.length === 1 && murs5[0].id === "mur-b" && murs5[0].height === 3.2 && murs5[0].thickness === 0.25 && ouv5?.hostId === "mur-b" && archi5.length === 2,
    JSON.stringify(archi5));
  // Révisions : initiale, pose du mur (API), puis UNE révision pour les deux modifications (2D et 3D).
  check("TR-EX-021 : une seule révision pour les deux modifications, fille de la tête précédente (aucune version autoritaire propre à une planche)",
    revs5.length === 3 && relu5.revision.parentRevisionId === tete5 && relu5.revision.id !== tete5, JSON.stringify(revs5.map((r) => r.id)));
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor({ timeout: 30000 });
  const ids3dApres = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")).sort());
  await page.keyboard.press("Shift+D");
  const ids2dApres = await page.locator("svg [data-studio-architecture]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture")).sort());
  check("TR-EX-021 : après enregistrement, planche et vue 3D portent toujours les mêmes identifiants", JSON.stringify(ids3dApres) === JSON.stringify(ids2dApres) && JSON.stringify(ids2dApres) === JSON.stringify(["mur-b", "ouv-b"]), JSON.stringify({ ids2dApres, ids3dApres }));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  await context.close();
} catch (e) {
  console.error(e);
  echecs += 1;
} finally {
  await browser.close();
}
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ studio-preuves-b : toutes les vérifications passent");
