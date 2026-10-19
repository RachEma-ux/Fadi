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
 * 4. variante jamais lue sur l'appareil : hors ligne, rien n'est affiché ni modifiable.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-hors-ligne node apps/web/e2e/studio-hors-ligne.mjs
 */
import { chromium } from "playwright";
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
  const cle = `${projet.id}|${studyId}|${variantId}`;
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
    await outils.getByRole("button", { name: /^Rectangle/ }).click();
    for (const [nom, v] of [["X", x], ["Y", y], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
    await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  }
  const enregistrer = () => outils.getByRole("button", { name: /^(Enregistrer|Réessayer la sauvegarde)$/ }).click();
  const attendreEtat = (code) => page.locator(`[data-studio-hors-ligne="${code}"]`).waitFor();

  // Ouverture en ligne : la variante est lue (mémorisée sur l'appareil) et le service worker prend la page en charge.
  await page.goto(url);
  await outils.waitFor();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, { timeout: 30000 });
  await page.reload();
  await outils.waitFor();
  await attendreEtat("en-ligne");
  check("en ligne : état « En ligne », aucun brouillon conservé", (await page.locator("[data-studio-connexion]").textContent()) === "En ligne" && (await brouillonLocal(page, cle)) === null);
  const depart = (await revisions()).length;

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

  // 3. Conflit non reportable : le même rectangle supprimé hors ligne et dans la seconde session.
  const cible = tete3.revision.document.objects.find((o) => o.type === "rectangle");
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await outils.getByRole("button", { name: "Sélection", exact: true }).click();
  await page.locator(`svg [data-studio-objet="${cible.id}"]`).click();
  await outils.getByRole("button", { name: "Supprimer", exact: true }).click();
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
