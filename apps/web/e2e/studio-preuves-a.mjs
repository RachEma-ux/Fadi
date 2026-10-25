#!/usr/bin/env node
/**
 * Recette Studio — preuves du groupe A (point 2) : TEST-036, mise à jour du service worker pendant que des commandes
 * locales sont en attente, puis leur envoi sans perte. Application construite servie par l'API (WEB_DIST, service
 * worker actif), mode hors ligne de Playwright (`context.setOffline`) ; compte, projet et étude synthétiques.
 *
 *   1. hors ligne : un rectangle dessiné puis enregistré — l'enveloppe (requestId, baseRevisionId) attend dans IndexedDB ;
 *   2. réseau rétabli mais envoi des commandes bloqué : l'enveloppe reste en attente, rien n'atteint le serveur ;
 *   3. mise à jour du service worker pendant l'attente : un nouveau script est enregistré, installé et activé (changement
 *      de contrôleur de la page) ; la file locale est intacte (même requestId, même lot) ;
 *   4. envoi rétabli, page rouverte sous le nouveau service worker : l'enveloppe part avec le MÊME requestId, une seule
 *      révision est créée, le rectangle est dans la tête, plus rien n'est conservé sur l'appareil.
 *
 * Limite déclarée : la mise à jour enregistre un nouveau script (`/sw.js?maj=…`) du même build — même contrat de file
 * (`studioBrouillons`) ; une mise à jour vers un autre build (autre contrat) n'est pas jouée ici.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-preuves-a.mjs
 */
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  if (!ok) echecs += 1;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

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

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-preuves-a-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-preuves-a-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: `P.STU.SW.${Date.now().toString(36).slice(-5)}`, name: "Studio — mise à jour du service worker" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude TEST-036" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const moi = await api("get", "/auth/me");
  const cle = `${moi.id}|${projet.id}|${studyId}|${variantId}`;
  const revisions = async () => (await api("get", `${variantePath}/revisions`)).revisions;
  const envois = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${variantePath}/commands`) envois.push(r.postDataJSON()); });
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  const rectangles = page.locator('svg [role="button"][aria-label^="Rectangle "]');
  const attendreEtat = (code) => page.locator(`[data-studio-hors-ligne="${code}"]`).waitFor({ timeout: 40000 });

  await page.goto(url);
  await outils.waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
  await page.reload();
  await outils.waitFor();
  await attendreEtat("en-ligne");
  const scriptAvant = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
  const depart = (await revisions()).length;

  // 1. Hors ligne : dessin et enregistrement — l'enveloppe attend sur l'appareil.
  await context.setOffline(true);
  await attendreEtat("hors-ligne");
  await (await atteindre(outils, ':is(button,a)[aria-label="Rectangle"]')).click();
  for (const [nom, v] of [["X", 2], ["Y", 2], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await (await atteindre(page.getByRole("toolbar", { name: "Actions de l’espace" }), ':is(button)[aria-label="Enregistrer"]')).click();
  await page.locator('[data-studio-hors-ligne="en-attente"][data-studio-en-attente="1"]').waitFor();
  const conserve = await brouillonLocal(page, cle);
  const requestId = conserve?.plan?.requestIds?.[0];
  check("TEST-036 : hors ligne, commande locale en attente (enveloppe conservée avec requestId et baseRevisionId)", !!requestId && conserve.plan.base === etude.revision.id && conserve.plan.envoyes === 0, JSON.stringify(conserve?.plan));

  // 2. Réseau rétabli, envoi des commandes bloqué : l'enveloppe reste en attente.
  let bloque = true;
  await context.route("**/commands", (route) => (bloque ? route.abort("internetdisconnected") : route.continue()));
  await context.setOffline(false);
  await page.waitForTimeout(1500);
  check("TEST-036 : envoi bloqué — rien n'a atteint le serveur, l'enveloppe attend toujours", (await revisions()).length === depart && (await brouillonLocal(page, cle))?.plan?.requestIds?.[0] === requestId);

  // 3. Mise à jour du service worker pendant l'attente : nouveau script installé et activé, contrôleur changé.
  const maj = await page.evaluate(async () => {
    const change = new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(true), { once: true }));
    const reg = await navigator.serviceWorker.register(`/sw.js?maj=test-036-${Date.now()}`);
    const vu = await Promise.race([change, new Promise((resolve) => setTimeout(() => resolve(false), 30000))]);
    return { changement: vu, script: navigator.serviceWorker.controller?.scriptURL ?? null, actif: reg.active?.scriptURL ?? null };
  });
  const apresMaj = await brouillonLocal(page, cle);
  check("TEST-036 : service worker mis à jour pendant l'attente — nouveau script actif, contrôleur de la page changé",
    maj.changement === true && !!maj.script && maj.script !== scriptAvant && maj.script.includes("maj=test-036"), JSON.stringify({ scriptAvant, ...maj }));
  check("TEST-036 : file locale intacte après la mise à jour — même requestId, même lot, rien envoyé",
    apresMaj?.plan?.requestIds?.[0] === requestId && JSON.stringify(apresMaj.plan.lots) === JSON.stringify(conserve.plan.lots) && apresMaj.plan.envoyes === 0 && (await revisions()).length === depart,
    JSON.stringify(apresMaj?.plan));

  // 4. Envoi rétabli, page rouverte sous le nouveau service worker : l'enveloppe part, une seule fois.
  bloque = false;
  envois.length = 0;
  await page.reload();
  await outils.waitFor();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor({ timeout: 40000 });
  await attendreEtat("en-ligne");
  const apres = await revisions();
  const tete = await api("get", variantePath);
  check("TEST-036 : après la mise à jour, la commande en attente est envoyée avec le même requestId — une seule révision, rectangle dans la tête",
    apres.length === depart + 1 && envois.length >= 1 && envois.every((e) => e.requestId === requestId) && tete.revision.document.objects.length === 1 && tete.revision.document.objects[0].type === "rectangle",
    `${apres.length - depart} révision(s), envois ${envois.map((e) => e.requestId).join()}`);
  check("TEST-036 : aucune file perdue ni rejouée en double — plus rien de conservé sur l'appareil, un rectangle affiché", (await brouillonLocal(page, cle)) === null && (await rectangles.count()) === 1);
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.log(`✗ recette interrompue — ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} échec(s).` : "\nRecette des preuves Studio (groupe A) : tout est conforme.");
process.exit(echecs ? 1 : 0);
