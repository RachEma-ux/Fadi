#!/usr/bin/env node
/**
 * Recette des domaines fonctionnels du Studio (I.4-01, I.4-02, I.4-03 ; NAV-005, NAV-004, NAV-007), par l'interface et
 * l'API réelles (même origine, base migrée). Noms des domaines : Définition officielle du Studio V2.1 (REF-01 §02).
 *   1. adresse antérieure (sans paramètre) : quatre domaines nommés par la référence, Dessin et modélisation actif,
 *      Planche 2D active, adresse inchangée — même après la bascule Maj+D (rétrocompatibilité) ;
 *   2. les deux planches et leur choix n'existent que dans « Dessin et modélisation » ; exigences, scènes, métré,
 *      révisions, feuilles, dossiers et publications sont rangés sous leur domaine ;
 *   3. clavier : un domaine choisi par Entrée devient actif, reçoit le focus et s'inscrit dans l'adresse
 *      (`?domaine=`), par remplacement (aucune entrée d'historique) ; l'actualisation le restitue ;
 *   4. Planche 3D choisie : `?domaine=dessin&planche=3d`, restituée par l'actualisation ; la bascule Maj+D est suivie ;
 *   5. combinaison avec `?revision=` (lecture seule) ; valeur inconnue ou planche hors de « dessin » : adresse non reconnue ;
 *   6. NAV-007 : changer de domaine avec un brouillon non enregistré ne demande rien et ne perd rien ;
 *   7. téléphone : navigation des domaines sur une rangée défilante, planche dans la moitié haute, aucun débordement.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-domaines.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  if (!ok) echecs += 1;
}
/** REF-01 §02, dans l'ordre (repris de `apps/web/src/modules/studio/domaines/domaines.ts`, contrôlé contre la référence par son test). */
const DOMAINES = [
  ["dessin", "Dessin et modélisation"],
  ["bim", "BIM et coordination"],
  ["visualisation", "Visualisation, rendu et immersion"],
  ["documentation", "Documentation, métrés et collaboration"],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  const dialogues = [];
  page.on("dialog", (d) => { dialogues.push(d.message()); void d.dismiss(); });
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-domaines-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-domaines-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const projet = (await api("post", "/projects", { code: `P.DOM.${randomUUID().slice(0, 6)}`, name: "Studio — domaines (recette)" })).body;
  const racine = `/projects/${projet.id}/studio/studies`;
  const etude = (await api("post", racine, { name: "Étude domaines" })).body;
  const studyId = etude.study.id, variantId = etude.variant.id;
  const pose = await api("post", `${racine}/${studyId}/variants/${variantId}/commands`, {
    contractVersion: "studio-commands/1", requestId: `recette-${randomUUID()}`, baseRevisionId: etude.revision.id,
    commands: [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } }],
  });
  check("préparation : une ligne posée par commande", pose.status === 200, String(pose.status));
  const premiere = etude.revision.id;
  const base = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;

  const pret = async () => {
    await page.locator("[data-studio-domaines]").waitFor();
    await page.locator('svg [role="button"]').first().waitFor({ state: "attached" }).catch(() => {});
  };
  const actif = () => page.locator("[data-studio-domaines] a[aria-current=true]").getAttribute("data-studio-domaine-lien");
  const focusDomaine = () => page.evaluate(() => document.activeElement?.closest("[data-studio-domaine]")?.getAttribute("data-studio-domaine") ?? null);
  const enDomaine = (sel, id) => page.evaluate(([s, d]) => { const els = [...document.querySelectorAll(s)]; return els.length > 0 && els.every((e) => e.closest("[data-studio-domaine]")?.getAttribute("data-studio-domaine") === d); }, [sel, id]);

  // 1. Adresse antérieure : rien à ajouter pour ouvrir la variante comme avant.
  await page.goto(base);
  await pret();
  const nav = page.getByRole("navigation", { name: "Domaines du Studio" });
  const liens = await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/^0\d/, "")));
  check("I.4-01 : quatre domaines, dans l'ordre et sous le nom de la référence (REF-01 §02)", JSON.stringify(liens) === JSON.stringify(DOMAINES.map(([, n]) => n)), liens.join(" · "));
  for (const [id, nom] of DOMAINES) {
    check(`I.4-01 : « ${nom} » accessible par son nom exact`, (await nav.getByRole("link", { name: nom, exact: true }).count()) === 1);
    check(`I.4-01 : section « ${nom} » nommée`, (await page.getByRole("region", { name: nom, exact: true }).getAttribute("data-studio-domaine")) === id);
  }
  check("adresse antérieure : Dessin et modélisation actif, Planche 2D active", (await actif()) === "dessin"
    && (await page.locator('[data-studio-planche="2d"]').getAttribute("aria-pressed")) === "true" && (await page.locator("[data-studio-planche-active]").textContent()) === "Planche 2D");
  check("adresse antérieure : aucune réécriture à l'ouverture", page.url() === base, page.url());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d]").waitFor();
  check("adresse antérieure : la bascule Maj+D n'ajoute aucun paramètre (comportement inchangé)", page.url() === base, page.url());
  await page.keyboard.press("Shift+D");
  await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).waitFor();

  // 2. Planches seulement dans Dessin et modélisation ; chaque fonction sous son domaine.
  check("I.4-02 : Planche 2D dans « Dessin et modélisation »", await enDomaine('[aria-label="Planche de dessin 2D"]', "dessin"));
  check("I.4-02 : choix des planches (2D, 3D) seulement dans « Dessin et modélisation »", await enDomaine("[data-studio-planches]", "dessin")
    && (await page.locator("[data-studio-planche]").count()) === 2 && (await page.locator('[data-studio-domaine]:not([data-studio-domaine="dessin"]) :is([data-studio-planches],[aria-label="Planche de dessin 2D"],[data-studio-vue3d])').count()) === 0);
  check("I.4-02 : barre d'outils de la planche dans « Dessin et modélisation »", await enDomaine('[role="toolbar"][aria-label="Outils de dessin"]', "dessin"));
  check("exigences et écarts sous « BIM et coordination »", await enDomaine("[data-studio-exigences]", "bim"));
  check("scènes et rendus sous « Visualisation, rendu et immersion »", await enDomaine("[data-studio-visualisation-apercu]", "visualisation")
    && (await page.locator("[data-studio-visualisation-apercu]").getAttribute("data-studio-scenes-nombre")) === "0");
  for (const [sel, nom] of [["[data-studio-quantites]", "métré"], ["[data-studio-revisions]", "révisions"], ['[data-studio-domaine-commande="feuille"]', "feuilles"], ['[data-studio-domaine-commande="dossier"]', "dossiers"], ["[data-studio-publications-etude]", "publications"]]) {
    check(`${nom} sous « Documentation, métrés et collaboration »`, await enDomaine(sel, "documentation"));
  }
  check("documentation : « Feuille » et « Feuilles et dossier » gardent le raccourci de leur commande", (await page.locator('[data-studio-domaine-commande="feuille"][aria-keyshortcuts="Shift+P"] svg').count()) === 1
    && (await page.locator('[data-studio-domaine-commande="dossier"][aria-keyshortcuts="Control+Shift+D"] svg').count()) === 1);

  // 3. Clavier : Entrée sur un domaine, focus porté, adresse remplacée (aucune entrée d'historique).
  const longueur = await page.evaluate(() => history.length);
  await nav.getByRole("link", { name: "BIM et coordination", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${base}?domaine=bim`);
  check("I.4-03 : domaine choisi au clavier, actif et inscrit dans l'adresse", (await actif()) === "bim");
  check("clavier : le focus est porté sur le titre du domaine choisi", (await focusDomaine()) === "bim" && await page.evaluate(() => document.activeElement?.id === "studio-domaine-bim-titre"));
  await nav.getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${base}?domaine=documentation`);
  check("I.4-03 : changement de domaine par remplacement (historique inchangé)", (await page.evaluate(() => history.length)) === longueur);
  await page.reload();
  await pret();
  check("I.4-03 : l'actualisation restitue le domaine actif et y porte le focus", (await actif()) === "documentation" && (await focusDomaine()) === "documentation", String(await focusDomaine()));
  check("documentation : la commande « Feuille » s'ouvre depuis son domaine", await (async () => {
    await page.locator('[data-studio-domaine-commande="feuille"]').click();
    const ok = (await page.locator('[role="dialog"] [data-studio-feuille]').count()) === 1;
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"] [data-studio-feuille]').waitFor({ state: "detached" });
    return ok;
  })());

  // 4. Planche 3D choisie, restituée, puis suivie par la bascule Maj+D.
  await page.locator('[data-studio-planche="3d"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${base}?domaine=dessin&planche=3d`);
  await page.locator("[data-studio-vue3d]").waitFor();
  check("I.4-02/03 : Planche 3D choisie dans Dessin et modélisation, inscrite dans l'adresse", (await actif()) === "dessin" && await enDomaine("[data-studio-vue3d]", "dessin")
    && (await page.locator('[data-studio-planche="3d"]').getAttribute("aria-pressed")) === "true" && (await page.locator("[data-studio-planche-active]").textContent()) === "Planche 3D");
  await page.reload();
  await page.locator("[data-studio-vue3d]").waitFor();
  check("I.4-03 : l'actualisation restitue la Planche 3D", (await page.locator('[data-studio-planche="3d"]').getAttribute("aria-pressed")) === "true");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.waitForURL(`${base}?domaine=dessin&planche=2d`);
  check("I.4-03 : la bascule Maj+D est suivie par l'adresse une fois le domaine inscrit", (await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).count()) === 1);

  // 5. Combinaison avec une révision historique ; valeurs refusées.
  await page.goto(`${base}?revision=${encodeURIComponent(premiere)}&domaine=visualisation`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  await pret();
  check("révision historique + domaine : lecture seule, domaine actif conservé", (await actif()) === "visualisation" && (await focusDomaine()) === "visualisation");
  await nav.getByRole("link", { name: "BIM et coordination", exact: true }).click();
  await page.waitForURL(`${base}?revision=${encodeURIComponent(premiere)}&domaine=bim`);
  check("révision historique : changer de domaine conserve la révision dans l'adresse", page.url().includes(`revision=${encodeURIComponent(premiere)}`));
  for (const q of ["?domaine=x", "?domaine=dessin&planche=4d", "?domaine=documentation&planche=3d", "?planche=2d", "?domaine=bim&domaine=bim"]) {
    await page.goto(`${base}${q}`);
    await page.locator("[data-studio-inconnue]").waitFor();
    check(`adresse non reconnue et conservée : ${q}`, page.url().endsWith(q));
  }

  // 6. NAV-007 : brouillon non enregistré, changement de domaine sans confirmation ni perte.
  await page.goto(base);
  await pret();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.textContent?.includes("(1 commande(s)"));
  await nav.getByRole("link", { name: "Visualisation, rendu et immersion", exact: true }).click();
  await page.waitForURL(`${base}?domaine=visualisation`);
  check("NAV-007 : changer de domaine ne demande rien et garde le brouillon", dialogues.length === 0
    && ((await page.locator("[data-studio-annuler-portee]").textContent()) ?? "").includes("(1 commande(s)") && (await page.locator("[data-studio-etat]").textContent()) === "Brouillon non enregistré", dialogues.join(" | "));
  await page.keyboard.press("Control+z");

  // 7. Téléphone.
  const mobile = await context.newPage();
  mobile.on("pageerror", (e) => erreurs.push(`téléphone : ${e.message}`));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base);
  await mobile.getByRole("group", { name: "Planche de dessin 2D", exact: true }).waitFor();
  const m = await mobile.evaluate(() => {
    const n = document.querySelector("[data-studio-domaines]");
    const tops = new Set([...n.querySelectorAll("a")].map((a) => Math.round(a.getBoundingClientRect().top)));
    const planche = document.querySelector('[aria-label="Planche de dessin 2D"]').getBoundingClientRect();
    return { rangees: tops.size, planche: Math.round(planche.top + window.scrollY), navSousPlanche: n.getBoundingClientRect().top >= planche.bottom, debordePage: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  check("téléphone : domaines sur une rangée sous la planche, planche dans la moitié haute, aucun débordement", m.rangees === 1 && m.navSousPlanche && m.planche < 844 / 2 && !m.debordePage, JSON.stringify(m));
  await mobile.getByRole("navigation", { name: "Domaines du Studio" }).getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).click();
  await mobile.waitForURL(`${base}?domaine=documentation`);
  check("téléphone : un domaine choisi reçoit le focus", await mobile.evaluate(() => document.activeElement?.id === "studio-domaine-documentation-titre"));
  await mobile.locator('[data-studio-domaines] a[data-studio-domaine-lien="dessin"]').click();
  await mobile.waitForURL(`${base}?domaine=dessin&planche=2d`);
  check("téléphone : Dessin et modélisation (section sans boîte propre) reçoit le focus", await mobile.evaluate(() => document.activeElement?.id === "studio-domaine-dessin-titre"));
  await mobile.close();

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.error(e);
} finally {
  await browser.close();
}
if (echecs) { console.error(`${echecs} échec(s)`); process.exit(1); }
console.log("Recette des domaines Studio : tout est vert.");
