#!/usr/bin/env node
/**
 * Recette Studio hors ligne (A.5-09, B.3-09, B.3-10) sur l'application construite servie par l'API (WEB_DIST, service
 * worker actif) et le mode hors ligne de Playwright (`context.setOffline`) :
 * 1. dessin hors ligne, rechargement hors ligne (coquille et éditeur depuis le cache, brouillon conservé), enregistrement
 *    hors ligne (enveloppe conservée avec son requestId et sa baseRevisionId), retour en ligne → enregistré UNE fois
 *    (même requestId ; un second envoi de la même enveloppe est un rejeu, aucune révision en double) ;
 * 2. conflit : une seconde session déplace la tête pendant la coupure → refus `stale_revision`, interface de conflit,
 *    tête non écrasée, brouillon hors ligne conservé au rechargement ; report des commandes sur la nouvelle tête
 *    (le modèle les applique) puis enregistrement ;
 * 3. conflit non reportable (objet supprimé des deux côtés) → résolution manuelle, puis « Recharger la version
 *    serveur » après confirmation : brouillon abandonné, version serveur relue ;
 * 4. variante jamais lue sur l'appareil : hors ligne, rien n'est affiché ni modifiable ;
 * 5. hors ligne, on continue de dessiner derrière une enveloppe en attente (ses pas ne s'annulent plus) ; au retour
 *    du réseau l'enveloppe part (même requestId), les pas suivants restent au brouillon puis s'enregistrent ;
 * 6. deux onglets hors ligne sur la même variante : le second ne peut pas écraser le brouillon du premier (conflit
 *    « brouillon modifié dans un autre onglet ») ;
 * 7. changement d'utilisateur : brouillon et enveloppe hors ligne de A, déconnexion, B (membre éditeur) se connecte
 *    sur le même navigateur → aucun brouillon restauré, aucun rejeu, aucune version lue de A conservée.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-hors-ligne node apps/web/e2e/studio-hors-ligne.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-hors-ligne";
mkdirSync(OUT, { recursive: true });
const erreurs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

/** Toutes les lignes Studio d'IndexedDB (brouillons et versions lues), avec leur propriétaire. */
const lignesStudio = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open("fadi-local");
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const noms = ["studioBrouillons", "studioContextes"].filter((n) => db.objectStoreNames.contains(n));
    if (!noms.length) { db.close(); resolve([]); return; }
    const tx = db.transaction(noms);
    const out = [];
    let reste = noms.length;
    for (const n of noms) {
      const all = tx.objectStore(n).getAll();
      all.onsuccess = () => { for (const r of all.result) out.push({ table: n, cle: r.cle, userId: r.userId }); if (--reste === 0) { db.close(); resolve(out); } };
      all.onerror = () => { db.close(); reject(all.error); };
    }
  };
}));

/** Entrée IndexedDB du brouillon hors ligne de la variante (null si absente). */
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

let context;

/**
 * Barre compacte (une rangée) : un bouton rangé dans le menu « ▾ » de sa famille ou dans « Plus » existe toujours dans
 * le document (menu fermé = masqué) ; pour l'utiliser, on ouvre d'abord ce menu, comme le ferait l'utilisateur.
 */
async function atteindre(barre, selecteur) {
  const el = barre.locator(selecteur).first();
  await el.waitFor({ state: "attached" });
  // Le menu se place après son ouverture : on ne clique sur son bouton que s'il est fermé (un second clic le
  // refermerait), et on recommence au plus trois fois si un rendu l'a refermé entre-temps (runner lent).
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
/** Bouton (ou lien) de la barre par son nom exact, qu'il soit dans la rangée ou dans un menu. */
const element = (barre, nom) => barre.locator(`:is(button,a)[aria-label="${nom}"]`);
const cliquerBouton = async (barre, nom) => {
  const sel = `:is(button,a)[aria-label="${nom}"]`;
  // Un rendu peut refermer le menu entre l'ouverture et le clic : une seconde tentative le rouvre.
  try { await (await atteindre(barre, sel)).click({ timeout: 5000 }); } catch { await (await atteindre(barre, sel)).click(); }
};

try {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-hors-ligne-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-hors-ligne-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.HL", name: "Studio — hors ligne" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude hors ligne" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const moi = await api("get", "/auth/me");
  // Clé propre à l'utilisateur : un autre compte du même appareil n'a jamais la même ligne.
  const cle = `${moi.id}|${projet.id}|${studyId}|${variantId}`;
  const revisions = async () => (await api("get", `${variantePath}/revisions`)).revisions;

  // Seconde session du même utilisateur (autre appareil) : elle reste en ligne.
  const autre = await browser.newContext({ storageState: await context.storageState() });
  const autreApi = async (method, path, data) => {
    const r = await autre.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Seconde session : ${method} ${path} → ${r.status()}`);
    return r.json();
  };

  const envois = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${variantePath}/commands`) envois.push(r.postDataJSON()); });
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  const etat = page.locator("[data-studio-hors-ligne]");
  const rectangles = page.locator('svg [role="button"][aria-label^="Rectangle "]');
  async function rectangle(x, y) {
    await cliquerBouton(outils, "Rectangle");
    for (const [nom, v] of [["X", x], ["Y", y], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
    await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  }
  const enregistrer = async () => (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Enregistrer"], :is(button)[aria-label="Réessayer la sauvegarde"]')).click();
  // Un changement d'état peut suivre une relance différée (retour du réseau, renvoi d'enveloppe) : 40 s au plus.
  const attendreEtat = (code) => page.locator(`[data-studio-hors-ligne="${code}"]`).waitFor({ timeout: 40000 });

  // Ouverture en ligne : la variante est lue (mémorisée sur l'appareil) et le service worker prend la page en charge.
  await page.goto(url);
  await outils.waitFor();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, { timeout: 30000 });
  await page.reload();
  await outils.waitFor();
  await attendreEtat("en-ligne");
  check("en ligne : état « En ligne », aucun brouillon conservé", (await page.locator("[data-studio-connexion]").textContent()) === "En ligne" && (await brouillonLocal(page, cle)) === null);
  // Cache versionné par build : un seul cache `fadi-shell-<build>`, celui de la page servie ; sa coquille porte le même
  // identifiant ; aucune réponse de l'API n'y figure.
  const cacheSw = await page.evaluate(async () => {
    const build = document.querySelector('meta[name="fadi-build"]')?.getAttribute("content") ?? null;
    const noms = (await caches.keys()).filter((n) => n.startsWith("fadi-shell-"));
    const cache = build ? await caches.open(`fadi-shell-${build}`) : null;
    const coquille = cache ? await (await cache.match("/index.html"))?.text() : null;
    const chemins = cache ? (await cache.keys()).map((r) => new URL(r.url).pathname) : [];
    return { build, noms, coquilleDuBuild: !!coquille && coquille.includes(`<meta name="fadi-build" content="${build}">`), api: chemins.filter((p) => /^\/(auth|projects|examples|library|notifications|preferences|health)(\/|$)/.test(p)) };
  });
  check("service worker : un cache par build (celui de la page), coquille du même build, aucune réponse de l'API en cache", !!cacheSw.build && JSON.stringify(cacheSw.noms) === JSON.stringify([`fadi-shell-${cacheSw.build}`]) && cacheSw.coquilleDuBuild && cacheSw.api.length === 0, JSON.stringify(cacheSw));
  // Mise en cache anticipée manquée (fichier Parcelle non empreint retiré du cache) : réparée à la première lecture
  // réussie, dans le cache de ce build ; une réponse de l'API lue par la page n'y entre toujours pas.
  const reparation = await page.evaluate(async (build) => {
    const cache = await caches.open(`fadi-shell-${build}`);
    const avant = await cache.delete("/parcelle/parcelle-bridge.js");
    const lu = (await fetch("/parcelle/parcelle-bridge.js")).ok;
    await fetch("/auth/me").catch(() => undefined);
    const apres = !!(await cache.match("/parcelle/parcelle-bridge.js"));
    const api = (await cache.keys()).some((r) => new URL(r.url).pathname.startsWith("/auth"));
    return { avant, lu, apres, api };
  }, cacheSw.build);
  check("service worker : fichier non empreint manqué à l'installation réparé à sa lecture (cache du build), API jamais mise en cache", reparation.avant && reparation.lu && reparation.apres && !reparation.api, JSON.stringify(reparation));
  const depart = (await revisions()).length;
  // TEST-021 : une commande préparée hors ligne n'entraîne aucune publication (ni anticipée au retour du réseau, ni
  // au conflit) : liste des publications de l'étude relevée avant la coupure, POST vers une URL /publications comptés.
  const publicationsEtude = async () => (await api("get", `/projects/${projet.id}/studio/studies/${studyId}/publications`)).publications;
  const publicationsAvant = (await publicationsEtude()).length;
  const postsPublications = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/publications(\/|$)/.test(new URL(r.url()).pathname)) postsPublications.push(new URL(r.url()).pathname); });

  // 1. Dessin hors ligne, rechargement hors ligne, enveloppe conservée, retour en ligne.
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await rectangle(2, 2);
  await page.locator('[data-studio-conserve="oui"]').waitFor();
  check("hors ligne : le brouillon est conservé sur l'appareil", (await brouillonLocal(page, cle))?.pas.length === 1);
  await page.reload();
  await outils.waitFor();
  await rectangles.first().waitFor({ state: "attached" });
  check("rechargement hors ligne : coquille et éditeur servis depuis le cache, brouillon restauré", (await rectangles.count()) === 1 && (await etat.getAttribute("data-studio-hors-ligne")) === "hors-ligne");
  await enregistrer();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor();
  const conserve = await brouillonLocal(page, cle);
  const requestId = conserve?.plan?.requestIds?.[0];
  check("enregistrer hors ligne : enveloppe conservée (requestId, baseRevisionId)", !!requestId && conserve.plan.base === etude.revision.id && conserve.plan.envoyes === 0, JSON.stringify(conserve?.plan?.requestIds));
  await page.reload();
  await outils.waitFor();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor();
  check("rechargement hors ligne : l'enveloppe en attente garde son requestId", (await brouillonLocal(page, cle))?.plan?.requestIds?.[0] === requestId);
  check("hors ligne : rien n'a atteint le serveur", (await revisions()).length === depart);
  await page.screenshot({ path: join(OUT, "studio-hors-ligne-en-attente.png") });
  envois.length = 0;
  await context.setOffline(false);
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor({ timeout: 40000 });
  await attendreEtat("en-ligne");
  const apres = await revisions();
  check("retour en ligne : enregistré une seule fois, avec le même requestId", apres.length === depart + 1 && envois.length >= 1 && envois.every((e) => e.requestId === requestId), `${apres.length} révisions, envois ${envois.map((e) => e.requestId).join()}`);
  check("retour en ligne : plus rien de conservé sur l'appareil", (await brouillonLocal(page, cle)) === null);
  const rejeu = await api("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId, baseRevisionId: etude.revision.id, commands: conserve.plan.lots[0] });
  check("même enveloppe renvoyée : rejeu reconnu, aucune révision en double", rejeu.replayed === true && (await revisions()).length === depart + 1);
  const tete1 = await api("get", variantePath);
  check("serveur : le rectangle dessiné hors ligne est dans la tête", tete1.revision.document.objects.length === 1);
  const publicationsApres = await publicationsEtude();
  check("TEST-021 : aucune publication anticipée — aucun POST /publications, liste inchangée", postsPublications.length === 0 && publicationsApres.length === publicationsAvant, `${postsPublications.length} POST (${postsPublications.join(" ")}), ${publicationsAvant} → ${publicationsApres.length} publication(s)`);

  // 2. Conflit : la tête avance dans la seconde session pendant la coupure.
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await rectangle(6, 2);
  await enregistrer();
  await page.locator('[data-studio-hors-ligne="en-attente"]').waitFor();
  const ligneAutre = `autre-${Date.now()}`;
  const tete2 = await autreApi("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `autre-${Date.now()}`, baseRevisionId: tete1.revision.id, commands: [{ toolId: "studio.dessin.ligne", params: { id: ligneAutre, type: "line", start: { x: 0, y: 8 }, end: { x: 4, y: 8 } } }] });
  await context.setOffline(false);
  await attendreEtat("conflit");
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "Conflit de révision" }).waitFor();
  const enConflit = await api("get", variantePath);
  check("conflit : la tête de la seconde session n'est pas écrasée", enConflit.revision.id === tete2.revision.id && (await revisions()).length === depart + 2);
  check("conflit : le brouillon hors ligne est conservé et affiché", (await rectangles.count()) === 2 && (await brouillonLocal(page, cle))?.conflit?.headRevisionId === tete2.revision.id);
  check("conflit : choix proposés (recharger, reporter), un seul bouton de rechargement", (await page.locator("[data-studio-reporter]").isEnabled()) && (await page.getByRole("button", { name: "Recharger la version serveur", exact: true }).count()) === 1);
  await page.screenshot({ path: join(OUT, "studio-hors-ligne-conflit.png") });
  await page.reload();
  await attendreEtat("conflit");
  check("rechargement : le conflit et le brouillon hors ligne sont conservés", (await rectangles.count()) === 2 && (await api("get", variantePath)).revision.id === tete2.revision.id);
  await page.locator("[data-studio-reporter]").click();
  await page.locator(".studio-info").filter({ hasText: "reportée(s) sur la nouvelle version courante" }).waitFor();
  check("report : commandes appliquées sur la nouvelle tête (ligne de l'autre session comprise)", (await page.locator(`svg [data-studio-objet="${ligneAutre}"]`).count()) === 1 && (await rectangles.count()) === 2);
  envois.length = 0;
  await enregistrer();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const tete3 = await api("get", variantePath);
  check("report enregistré : nouvelle enveloppe sur la nouvelle tête, rien d'écrasé", tete3.revision.parentRevisionId === tete2.revision.id && envois.length === 1 && envois[0].baseRevisionId === tete2.revision.id && envois[0].requestId !== requestId
    && tete3.revision.document.objects.some((o) => o.id === ligneAutre) && tete3.revision.document.objects.filter((o) => o.type === "rectangle").length === 2);
  check("report enregistré : plus rien de conservé", (await brouillonLocal(page, cle)) === null);
  const publicationsConflit = await publicationsEtude();
  check("TEST-021 : conflit serveur puis report enregistré — toujours aucun POST /publications, liste inchangée", postsPublications.length === 0 && publicationsConflit.length === publicationsAvant, `${postsPublications.length} POST (${postsPublications.join(" ")}), ${publicationsAvant} → ${publicationsConflit.length} publication(s)`);

  // 3. Conflit non reportable : le même rectangle supprimé hors ligne et dans la seconde session.
  const cible = tete3.revision.document.objects.find((o) => o.type === "rectangle");
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await cliquerBouton(outils, "Sélection");
  await page.locator(`svg [data-studio-objet="${cible.id}"]`).click();
  await cliquerBouton(outils, "Supprimer");
  await page.locator('[data-studio-conserve="oui"]').waitFor();
  await autreApi("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `autre-sup-${Date.now()}`, baseRevisionId: tete3.revision.id, commands: [{ toolId: "studio.dessin.supprimer", params: { ids: [cible.id] } }] });
  await enregistrer();
  await page.locator('[data-studio-hors-ligne="en-attente"]').waitFor();
  await context.setOffline(false);
  await attendreEtat("conflit");
  await page.locator("[data-studio-reporter]").click();
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "résolution manuelle" }).waitFor();
  check("report impossible : brouillon conservé pour une résolution manuelle", (await brouillonLocal(page, cle))?.conflit !== null && (await etat.getAttribute("data-studio-hors-ligne")) === "conflit");
  await Promise.all([page.waitForEvent("load"), page.locator("[data-studio-recharger]").click()]);
  await outils.waitFor();
  await attendreEtat("en-ligne");
  const serveur = await api("get", variantePath);
  check("recharger la version serveur (confirmé) : brouillon abandonné, version serveur relue", (await brouillonLocal(page, cle)) === null && (await page.locator("svg [data-studio-objet]").count()) === serveur.revision.document.objects.length && serveur.revision.document.objects.every((o) => o.id !== cible.id));

  // 4. Variante jamais lue sur cet appareil : hors ligne, rien n'est affiché ni modifiable.
  const neuve = await api("post", `/projects/${projet.id}/studio/studies/${studyId}/variants`, { name: "Jamais ouverte" });
  await context.setOffline(true);
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${neuve.variant.id}`);
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "pas encore été lue sur cet appareil" }).waitFor();
  check("variante jamais lue : message hors ligne, aucun éditeur", (await outils.count()) === 0);
  await context.setOffline(false);

  // 5. Hors ligne, dessin derrière une enveloppe en attente.
  await page.goto(url);
  await outils.waitFor();
  await attendreEtat("en-ligne");
  const avant5 = (await revisions()).length, objets5 = (await api("get", variantePath)).revision.document.objects.length;
  const nbRect = (n) => page.waitForFunction((k) => document.querySelectorAll('svg [role="button"][aria-label^="Rectangle "]').length === k, n);
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  const nbAvant = await rectangles.count();
  await rectangle(10, 6);
  await nbRect(nbAvant + 1);
  await enregistrer();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor();
  const requete5 = (await brouillonLocal(page, cle))?.plan?.requestIds?.[0];
  await rectangle(14, 6);
  await nbRect(nbAvant + 2);
  check("hors ligne, enveloppe en attente : le dessin reste permis", !!requete5 && (await brouillonLocal(page, cle))?.pas.length === 2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await nbRect(nbAvant + 1);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check("annuler : seul le pas dessiné après l'enveloppe s'annule", (await rectangles.count()) === nbAvant + 1);
  await page.keyboard.press("Control+y");
  await nbRect(nbAvant + 2);
  // Le brouillon est écrit dans IndexedDB de façon asynchrone (écritures sérialisées) : attendre qu'il porte les deux
  // pas avant de recharger, puis que la planche rechargée les affiche — attendre l'état, ne pas le supposer.
  for (let i = 0; i < 50 && (await brouillonLocal(page, cle))?.pas?.length !== 2; i++) await page.waitForTimeout(100);
  await page.reload();
  await outils.waitFor();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor();
  await nbRect(nbAvant + 2).catch(() => {});
  check("rechargement hors ligne : enveloppe et pas suivant conservés", (await rectangles.count()) === nbAvant + 2 && (await brouillonLocal(page, cle))?.pasCouverts === 1);
  envois.length = 0;
  await context.setOffline(false);
  await page.locator('[data-studio-hors-ligne="en-ligne"][data-studio-en-attente="0"]').waitFor({ timeout: 40000 });
  const apres5 = await api("get", variantePath);
  check("retour en ligne : l'enveloppe part seule (même requestId), le pas suivant reste au brouillon", envois.length >= 1 && envois.every((e) => e.requestId === requete5) && (await revisions()).length === avant5 + 1 && apres5.revision.document.objects.length === objets5 + 1 && (await rectangles.count()) === nbAvant + 2);
  await enregistrer();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  check("le pas suivant s'enregistre ensuite, sur la révision de l'enveloppe", (await revisions()).length === avant5 + 2 && (await api("get", variantePath)).revision.document.objects.length === objets5 + 2 && (await brouillonLocal(page, cle)) === null);

  // 6. Deux onglets hors ligne sur la même variante.
  const page2 = await context.newPage();
  page2.setDefaultTimeout(20000);
  page2.on("pageerror", (e) => erreurs.push(`onglet 2 : ${e.message}`));
  page2.on("dialog", (d) => void d.accept());
  await page2.goto(url);
  const outils2 = page2.getByRole("toolbar", { name: "Outils de dessin" });
  await outils2.waitFor();
  await page2.locator('[data-studio-hors-ligne="en-ligne"]').waitFor();
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await rectangle(2, 10);
  await page.locator('[data-studio-conserve="oui"]').waitFor();
  const proprietes2 = page2.getByRole("complementary", { name: "Propriétés du dessin" });
  await (await atteindre(outils2, ':is(button,a)[aria-label="Rectangle"]')).click();
  for (const [nom, v] of [["X", 6], ["Y", 10], ["Largeur", 2], ["Hauteur", 1]]) await proprietes2.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes2.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await page2.locator("[data-studio-conflit-onglet]").waitFor();
  const garde = await brouillonLocal(page, cle);
  check("deux onglets : le second n'écrase pas le brouillon du premier, conflit affiché", garde?.pas.length === 1 && garde.pas[0][0].params.origin.x === 2 && (await page2.locator("[data-studio-erreur-planche]").textContent()).includes("Brouillon modifié dans un autre onglet"));
  await Promise.all([page2.waitForEvent("load"), page2.locator("[data-studio-reprendre-onglet]").click()]);
  await outils2.waitFor();
  await page2.locator('[data-studio-conserve="oui"]').waitFor();
  check("reprendre le brouillon de l'autre onglet : celui du premier onglet est rouvert", (await page2.locator('svg [role="button"][aria-label^="Rectangle "]').count()) === (await rectangles.count()));
  await page2.close();
  await context.setOffline(false);
  await attendreEtat("en-ligne");
  await enregistrer();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  check("premier onglet : son brouillon s'enregistre, rien de perdu", (await brouillonLocal(page, cle)) === null && (await api("get", variantePath)).revision.document.objects.some((o) => o.type === "rectangle" && o.origin?.x === 2 && o.origin?.y === 10));

  // 7. Changement d'utilisateur sur le même navigateur.
  const emailB = `studio-hors-ligne-b-${Date.now()}@example.com`;
  const inscriptionB = await browser.newContext();
  if (!(await inscriptionB.request.post(`${BASE}/auth/register`, { data: { email: emailB, password: "studio-hors-ligne-ci-123" } })).ok()) throw new Error("inscription de B");
  // Phase 3 : B accepte l'invitation (aucun ajout direct) avant de quitter sa session d'inscription.
  if (!(await inviterEtAccepter(appelPlaywright(context.request, BASE), appelPlaywright(inscriptionB.request, BASE), projet.id, emailB, "editeur")).ok) throw new Error("invitation de B");
  await inscriptionB.close();
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await rectangle(20, 2);
  await enregistrer();
  await page.locator('[data-studio-hors-ligne="en-attente"]').waitFor();
  check("A : brouillon et enveloppe hors ligne conservés", !!(await brouillonLocal(page, cle))?.plan);
  const teteA = (await revisions()).length;
  // A quitte la planche encore hors ligne (rien n'est rejoué), puis se déconnecte par le menu du compte.
  await page.goto(`${BASE}/accueil`);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Compte", exact: true }).click();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await page.waitForURL(/\/(connexion|accueil|$)/);
  await page.waitForFunction(() => localStorage.getItem("fadi.lastUser") === null);
  const lignesDeconnexion = await lignesStudio(page);
  check("déconnexion : brouillons et versions lues de Studio oubliés sur l'appareil", lignesDeconnexion.length === 0, JSON.stringify(lignesDeconnexion));
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="email"]', emailB);
  await page.fill('input[name="password"]', "studio-hors-ligne-ci-123");
  envois.length = 0;
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await page.goto(url);
  await outils.waitFor();
  await attendreEtat("en-ligne");
  await page.waitForTimeout(1500);
  const serveur7 = await api("get", variantePath);
  check("B : aucun brouillon de A restauré ni rejoué", envois.length === 0 && (await revisions()).length === teteA && (await page.locator("svg [data-studio-objet]").count()) === serveur7.revision.document.objects.length && (await page.locator('[data-studio-conserve="oui"]').count()) === 0);
  const lignesB = await lignesStudio(page);
  check("B : seules ses propres lignes sur l'appareil, aucune version lue de A", lignesB.every((l) => l.userId !== moi.id && !l.cle.startsWith(`${moi.id}|`)) && lignesB.some((l) => l.table === "studioContextes"), JSON.stringify(lignesB));

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  await autre.close();
  console.log("Recette Studio hors ligne : réussie.");
} catch (e) {
  console.error(e);
  if (context) { const p = context.pages()[0]; if (p) await p.screenshot({ path: join(OUT, "studio-hors-ligne-echec.png") }).catch(() => {}); }
  process.exitCode = 1;
} finally {
  await browser.close();
}
