#!/usr/bin/env node
/**
 * Recette du lot W3-D (achèvement Studio, X.1-06) — fusion de variantes, API et application construites (même origine),
 * Chromium réel, comptes et projet synthétiques (aucune donnée de projet réelle) :
 *
 *  - règle d'or : « Fusionner une variante » (Ctrl+F10) et « Annuler la dernière fusion » (Ctrl+F11) dans la barre
 *    Édition, icône propre, raccourci annoncé ;
 *  - parcours au clavier : la variante B dérivée de A change une ligne et en ajoute une ; A change la même ligne
 *    autrement. Sur A, Ctrl+F10 ouvre la boîte ; la source B choisie, l'aperçu montre le changement repris et les
 *    conflits, sans aucun choix par défaut (le bouton « Fusionner » reste indisponible et dit pourquoi) ; chaque conflit
 *    tranché (« Garder la source »), la fusion s'applique en UNE révision `variant-merge` de A, conforme à l'aperçu ;
 *  - « Ouvrir la nouvelle révision » recharge la tête fusionnée ; Ctrl+F11 annule la fusion par une nouvelle révision
 *    `variant-merge-undo` au document d'avant ;
 *  - cas négatifs : un lecteur invité ne peut pas lancer la commande (indisponible) et le serveur lui refuse la fusion
 *    (403, rien n'est écrit) ; un aperçu périmé (A changée entre-temps) est refusé (409 stale_revision).
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-w3d node apps/web/e2e/studio-w3d.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-w3d";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
let echecs = 0;

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

async function compte(prefixe) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => erreurs.push(`${prefixe} : ${e.message}`));
  page.on("dialog", (d) => void d.accept());
  const email = `${prefixe}-${randomUUID().slice(0, 8)}@example.com`;
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', randomBytes(12).toString("hex"));
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const appel = async (method, path, body) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE }, ...(body === undefined ? {} : { data: body }) });
    let json = null;
    try { json = await r.json(); } catch { json = null; }
    return { status: r.status(), body: json };
  };
  const api = async (method, path, body) => {
    const r = await appel(method, path, body);
    if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { context, page, email, appel, api };
}
const flou = (page) => page.evaluate(() => document.activeElement?.blur());

try {
  const proprietaire = await compte("w3d-proprietaire");
  const lecteur = await compte("w3d-lecteur");
  const { page, api } = proprietaire;
  const projet = await api("POST", "/projects", { code: `P.W3D.${randomUUID().slice(0, 6)}`, name: "Studio — lot W3-D (recette synthétique)" });
  const etude = await api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude W3-D" });
  const racine = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants`;
  const A = etude.variant.id;
  const tete = async (v) => (await api("GET", `${racine}/${v}`)).revision;
  const commandes = async (v, cs) => api("POST", `${racine}/${v}/commands`, { contractVersion: "studio-commands/1", requestId: `w3d-${randomUUID()}`, baseRevisionId: (await tete(v)).id, commands: cs });
  const ligne = (id, y, x = 4) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x, y } } });
  const deplacer = (id, dy) => ({ toolId: "studio.dessin.deplacer", params: { id, dx: 0, dy } });
  await commandes(A, [ligne("l1", 0), ligne("l2", 1)]);
  const base = await tete(A);
  const B = (await api("POST", racine.replace(/\/variants$/, "/variants"), { name: "Variante B", fromVariantId: A, fromRevisionId: base.id })).variant.id;
  await commandes(B, [deplacer("l1", 2), ligne("b1", 5)]);
  await commandes(A, [deplacer("l1", 3), ligne("a1", 6)]);
  const avantFusion = await tete(A);

  const ouvrir = async (p, v = A) => {
    await p.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${v}`);
    await p.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  };
  await ouvrir(page);
  const barre = page.getByRole("toolbar", { name: "Outils de dessin" });
  for (const [id, raccourci, nom] of [["fusionner-variantes", "Control+F10", "Fusionner une variante"], ["annuler-fusion", "Control+F11", "Annuler la dernière fusion"]]) {
    const b = barre.locator(`[data-studio-commande="${id}"]`);
    check(`règle d'or : « ${nom} » dans la barre (famille Édition), icône propre, raccourci ${raccourci}`,
      (await b.count()) === 1 && (await b.getAttribute("aria-keyshortcuts")) === raccourci && (await b.locator("svg path").count()) >= 1
      && (await b.evaluate((x) => x.closest("[data-studio-famille]")?.getAttribute("data-studio-famille"))) === "edition",
      `${await b.getAttribute("aria-keyshortcuts")} / ${await b.evaluate((x) => x.closest("[data-studio-famille]")?.getAttribute("data-studio-famille")).catch(() => "?")}`);
  }

  // ——— Fusion au clavier ———
  await flou(page);
  await page.keyboard.press("Control+F10");
  const boite = page.locator('[data-studio-fusion="fusion"]');
  await boite.waitFor();
  check("Ctrl+F10 ouvre la boîte « Fusionner une variante »", await page.getByRole("dialog", { name: "Fusionner une variante" }).isVisible());
  await boite.locator("[data-studio-fusion-source]").selectOption(B);
  await boite.locator("[data-studio-fusion-apercu]").waitFor();
  const conflits = boite.locator("[data-studio-fusion-conflit]");
  await conflits.first().waitFor();
  const ids = await conflits.evaluateAll((l) => l.map((x) => x.getAttribute("data-studio-fusion-conflit")));
  check("aperçu : l'ajout de b1 repris de la source, conflits par propriété sur l1 (modifiée des deux côtés)",
    (await boite.locator('[data-studio-fusion-appliques] [data-cle="objects:b1"]').count()) === 1 && JSON.stringify(ids) === JSON.stringify(["modification:objects:l1/end", "modification:objects:l1/start"]), JSON.stringify(ids));
  const appliquer = boite.locator("[data-studio-fusion-appliquer]");
  check("aucun choix par défaut : aucune option cochée, « Fusionner dans cette variante » indisponible et la raison est dite",
    (await boite.locator('input[type="radio"]:checked').count()) === 0 && (await appliquer.isDisabled()) && /2 conflit\(s\) sans choix/.test(await boite.locator("[data-studio-fusion-blocage]").textContent()));
  for (const id of ids) {
    const sel = `[data-studio-fusion-conflit="${id}"] [data-studio-fusion-choix="source"]`;
    // Pendant l'aperçu relancé par le choix précédent, les options sont indisponibles : on attend qu'elles reviennent.
    await page.waitForFunction((s) => { const r = document.querySelector(s); return !!r && !r.disabled; }, sel);
    const radio = boite.locator(sel);
    await radio.focus();
    await page.keyboard.press("Space");
    await page.waitForFunction((sel) => document.querySelector(sel)?.checked === true, `[data-studio-fusion-conflit="${id}"] [data-studio-fusion-choix="source"]`);
  }
  await page.waitForFunction(() => !document.querySelector("[data-studio-fusion-appliquer]")?.disabled);
  check("chaque conflit tranché au clavier (« Garder la source ») : la fusion devient possible", await appliquer.isEnabled());

  // Cas négatif : le lecteur ne peut ni lancer la commande ni obtenir la fusion du serveur.
  check("lecteur invité, invitation acceptée", (await inviterEtAccepter(proprietaire.appel, lecteur.appel, projet.id, lecteur.email, "lecteur")).ok);
  const apercuLecteur = await lecteur.appel("POST", `${racine}/${A}/fusion/apercu`, { sourceVariantId: B, resolutions: Object.fromEntries(ids.map((id) => [id, "source"])) });
  const refusLecteur = await lecteur.appel("POST", `${racine}/${A}/fusion`, { requestId: "w3d-lecteur", sourceVariantId: B, sourceRevisionId: apercuLecteur.body.source.revisionId, baseRevisionId: apercuLecteur.body.cible.revisionId, empreinte: apercuLecteur.body.apercu.empreinte, resolutions: Object.fromEntries(ids.map((id) => [id, "source"])) });
  check("lecteur : l'aperçu se lit (canWrite faux), la fusion est refusée par le serveur (403) et rien n'est écrit",
    apercuLecteur.status === 200 && apercuLecteur.body.canWrite === false && refusLecteur.status === 403 && (await tete(A)).id === avantFusion.id, `${apercuLecteur.status} / ${refusLecteur.status}`);
  await ouvrir(lecteur.page);
  const boutonLecteur = lecteur.page.getByRole("toolbar", { name: "Outils de dessin" }).locator('[data-studio-commande="fusionner-variantes"]');
  check("lecteur : « Fusionner une variante » indisponible dans sa barre", (await boutonLecteur.isDisabled()) || (await boutonLecteur.getAttribute("aria-disabled")) === "true");

  await appliquer.click();
  const ok = boite.locator('[data-studio-fusion-message="ok"]');
  await ok.waitFor();
  const fusionnee = await tete(A);
  const revs = (await api("GET", `${racine}/${A}/revisions`)).revisions;
  const r = revs.find((x) => x.id === fusionnee.id);
  const l1 = fusionnee.document.objects.find((o) => o.id === "l1");
  check("fusion appliquée en une révision `variant-merge` de A, parent = tête d'avant ; l1 de la source, a1 et b1 présents",
    r?.source === "variant-merge" && r.parentRevisionId === avantFusion.id && l1?.start?.y === 2 && fusionnee.document.objects.map((o) => o.id).join(",") === "l1,l2,a1,b1",
    `${r?.source} ${fusionnee.document.objects.map((o) => o.id).join(",")}`);
  check("la source B n'est pas écrite", (await api("GET", `${racine}/${B}/revisions`)).revisions.every((x) => x.source !== "variant-merge"));
  await page.screenshot({ path: `${OUT}/fusion.png` });
  await Promise.all([page.waitForNavigation(), boite.locator("[data-studio-fusion-ouvrir]").click()]);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();

  // ——— Annulation au clavier (Ctrl+F11) ———
  await flou(page);
  await page.keyboard.press("Control+F11");
  const annul = page.locator('[data-studio-fusion="annulation"]');
  await annul.waitFor();
  await annul.locator("[data-studio-fusion-annuler]:not([disabled])").waitFor();
  await annul.locator("[data-studio-fusion-annuler]").click();
  await annul.locator('[data-studio-fusion-message="ok"]').waitFor();
  const apres = await tete(A);
  const ra = (await api("GET", `${racine}/${A}/revisions`)).revisions.find((x) => x.id === apres.id);
  check("Ctrl+F11 : annulation en une nouvelle révision `variant-merge-undo` au document d'avant la fusion",
    ra?.source === "variant-merge-undo" && ra.parentRevisionId === fusionnee.id && JSON.stringify(apres.document) === JSON.stringify(avantFusion.document));

  // Aperçu périmé : A change entre l'aperçu et l'application.
  const choix = Object.fromEntries(ids.map((id) => [id, "source"]));
  const ap = await api("POST", `${racine}/${A}/fusion/apercu`, { sourceVariantId: B, resolutions: choix });
  await commandes(A, [ligne("a2", 7)]);
  const perime = await proprietaire.appel("POST", `${racine}/${A}/fusion`, { requestId: "w3d-perime", sourceVariantId: B, sourceRevisionId: ap.source.revisionId, baseRevisionId: ap.cible.revisionId, empreinte: ap.apercu.empreinte, resolutions: choix });
  check("aperçu périmé (A changée entre-temps) : 409 stale_revision, rien n'est fusionné", perime.status === 409 && perime.body?.error === "stale_revision");

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.log(`✗ recette interrompue — ${e?.stack ?? e}`);
} finally {
  await browser.close();
}
if (echecs) { console.log(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette du lot W3-D : tous les contrôles passent.");
