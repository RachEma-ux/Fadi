#!/usr/bin/env node
/**
 * Recette des domaines fonctionnels du Studio (I.4-01, I.4-02, I.4-03 ; NAV-005, NAV-004, NAV-007), par l'interface et
 * l'API réelles (même origine, base migrée). Noms des domaines : Définition officielle du Studio V2.1 (REF-01 §02).
 *   1. adresse antérieure (sans paramètre) : quatre domaines nommés par la référence dans la barre de l'espace, Dessin et
 *      modélisation affiché, Planche 2D active, adresse inchangée — même après la bascule Maj+D (rétrocompatibilité) ;
 *   2. un domaine affiché à la fois : seule sa région de panneaux est visible ; palette d'outils propre au domaine ;
 *      planches (2D / 3D / Double vue) seulement dans « Dessin et modélisation » ; exigences sous BIM, scènes et rendus
 *      (vue 3D, même moteur) sous Visualisation, métré, révisions, feuilles, dossiers et publications sous
 *      Documentation ; boutons de planche d'au moins 24 px ;
 *   3. clavier : un domaine choisi par Entrée devient affiché et s'inscrit dans l'adresse (`?domaine=`), par
 *      remplacement (aucune entrée d'historique), le focus reste sur l'onglet ; l'actualisation le restitue ; chaque lien
 *      de domaine a l'adresse de la variante avec ce domaine ;
 *   4. Planche 3D et Double vue choisies : `?domaine=dessin&planche=3d|double`, restituées par l'actualisation, nommées
 *      par la barre d'état ; la bascule Maj+D est suivie ; ouvrir les commentaires conduit à Documentation et l'adresse
 *      suit l'état réel du panneau ;
 *   5. combinaison avec `?revision=` (lecture seule) : l'historique et « Revenir à la version courante » gardent le
 *      domaine ; valeur inconnue, Double vue ou planche hors de « dessin » : adresse non reconnue ;
 *   6. NAV-007 : changer de domaine avec un brouillon non enregistré, ou pendant une sauvegarde en attente, ne demande
 *      rien et ne perd rien ; un Ctrl + clic sur un domaine ouvre son adresse ailleurs, sans garde ;
 *   7. téléphone : barre des domaines compacte EN HAUT de l'espace (menu), avant le canevas dans le document et à
 *      l'écran (aucun `order`), canevas dans la moitié haute… et maximal, boutons de 44 px, aucun débordement.
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
/** REF-01 §02, dans l'ordre (repris de `apps/web/src/modules/studio/domaines/definitions.ts`, contrôlé contre la référence par son test). */
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

  const pret = async (p = page) => {
    await p.locator("[data-studio-domaines]").waitFor();
    await p.locator("[data-studio-barre-etat]").waitFor();
  };
  const actif = () => page.locator("[data-studio-domaines] a[aria-current=page]").getAttribute("data-studio-domaine-lien");
  const regionsVisibles = () => page.evaluate(() => [...document.querySelectorAll("[data-studio-domaine]")].filter((s) => s.getClientRects().length > 0).map((s) => s.getAttribute("data-studio-domaine")));
  const enDomaine = (sel, id) => page.evaluate(([s, d]) => { const els = [...document.querySelectorAll(s)]; return els.length > 0 && els.every((e) => e.closest("[data-studio-domaine]")?.getAttribute("data-studio-domaine") === d); }, [sel, id]);
  const enAttente = () => page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre");
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

  // 1. Adresse antérieure : rien à ajouter pour ouvrir la variante comme avant.
  await page.goto(base);
  await pret();
  const nav = page.getByRole("navigation", { name: "Domaines du Studio" });
  const liens = await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/^0\d/, "")));
  check("I.4-01 : quatre domaines, dans l'ordre et sous le nom de la référence (REF-01 §02)", JSON.stringify(liens) === JSON.stringify(DOMAINES.map(([, n]) => n)), liens.join(" · "));
  for (const [id, nom] of DOMAINES) {
    check(`I.4-01 : « ${nom} » accessible par son nom exact`, (await nav.getByRole("link", { name: nom, exact: true }).count()) === 1);
    check(`I.4-01 : région « ${nom} » nommée`, (await page.locator(`[data-studio-domaine="${id}"]`).getAttribute("aria-labelledby")) === `studio-domaine-${id}-titre`
      && (await page.locator(`#studio-domaine-${id}-titre`).textContent()) === nom);
  }
  const barre = await page.evaluate(() => {
    const b = document.querySelector("[data-studio-barre-espace]").getBoundingClientRect(), c = document.querySelector(".studio-canevas").getBoundingClientRect();
    return { barreAuDessus: b.bottom <= c.top + 1, navDansBarre: !!document.querySelector("[data-studio-barre-espace] [data-studio-domaines]") };
  });
  check("P0 : barre des domaines persistante en haut de l'espace, au-dessus du canevas", barre.barreAuDessus && barre.navDansBarre, JSON.stringify(barre));
  check("adresse antérieure : Dessin et modélisation affiché, Planche 2D active", (await actif()) === "dessin"
    && (await page.locator('[data-studio-planche="2d"]').getAttribute("aria-pressed")) === "true" && (await page.locator("[data-studio-planche-active]").textContent()) === "Planche 2D");
  check("adresse antérieure : aucune réécriture à l'ouverture", page.url() === base, page.url());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator("[data-studio-vue3d]").waitFor();
  check("adresse antérieure : la bascule Maj+D n'ajoute aucun paramètre (comportement inchangé)", page.url() === base, page.url());
  await page.keyboard.press("Shift+D");
  await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).waitFor();

  // 2. Un domaine affiché à la fois ; chaque fonction sous son domaine ; palette propre au domaine.
  check("P0 : un seul domaine affiché (Dessin et modélisation)", JSON.stringify(await regionsVisibles()) === JSON.stringify(["dessin"]), JSON.stringify(await regionsVisibles()));
  check("I.4-02 : choix des planches (2D, 3D, Double vue) seulement dans « Dessin et modélisation »", (await page.locator("[data-studio-planche]").count()) === 3
    && JSON.stringify(await page.locator("[data-studio-planche]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) === JSON.stringify(["Planche 2D", "Planche 3D", "Double vue (extension proposée)"]));
  check("I.4-02 : palette « Outils de dessin » du domaine, verticale, outils de dessin présents", (await page.locator('[role="toolbar"][aria-label="Outils de dessin"][aria-orientation="vertical"]').count()) === 1
    && (await page.locator('[role="toolbar"][aria-label="Outils de dessin"] [data-studio-outil="studio.dessin.ligne"]').count()) === 1
    && (await page.locator('[role="toolbar"][aria-label="Outils de dessin"] [data-studio-outil="studio.propriete.definir"]').count()) === 0);
  const taillesPlanches = await page.locator("[data-studio-planche]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check("I-5 : boutons de planche d'au moins 24 px", taillesPlanches.length === 3 && taillesPlanches.every((h) => h >= 24), taillesPlanches.join(","));
  check("M-3 : raccourci Maj+D annoncé seulement sur la planche qu'il activerait", (await page.locator("[data-studio-planche][aria-keyshortcuts]").count()) === 1
    && (await page.locator('[data-studio-planche="3d"]').getAttribute("aria-keyshortcuts")) === "Shift+D");
  await nav.getByRole("link", { name: "BIM et coordination", exact: true }).click();
  await page.waitForURL(`${base}?domaine=bim`);
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  check("P0 : BIM et coordination seul affiché ; exigences et écarts dans ses panneaux", JSON.stringify(await regionsVisibles()) === JSON.stringify(["bim"]) && await enDomaine("[data-studio-exigences]", "bim") && await visible("[data-studio-exigences]"), JSON.stringify(await regionsVisibles()) + " " + await enDomaine("[data-studio-exigences]", "bim") + " " + await visible("[data-studio-exigences]"));
  check("BIM : pas de choix de planche ; palette du domaine (propriétés, exigences) sans les outils de dessin", (await page.locator("[data-studio-planches]").count()) === 0
    && (await page.locator('[role="toolbar"][aria-label="Outils — BIM et coordination"] [data-studio-outil="studio.propriete.definir"]').count()) === 1
    && (await page.locator('[role="toolbar"][aria-label="Outils — BIM et coordination"] [data-studio-commande="exigences"][aria-keyshortcuts]').count()) === 1
    && (await page.locator('[role="toolbar"] [data-studio-outil="studio.dessin.ligne"]').count()) === 0);
  check("BIM : le canevas montre le plan du modèle (sélection possible), sans planche de Dessin", (await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).count()) === 1 && (await page.locator("[data-studio-vue3d]").count()) === 0);
  await nav.getByRole("link", { name: "Visualisation, rendu et immersion", exact: true }).click();
  await page.waitForURL(`${base}?domaine=visualisation`);
  await page.waitForSelector('[data-studio-domaine-affiche="visualisation"]');
  await page.locator("[data-studio-vue3d]").waitFor();
  await page.locator("[data-studio-visualisation-panneaux] [data-studio-scenes]").waitFor();
  check("P1 : Visualisation — vue 3D (même moteur) et panneau « Scènes, apparence et rendus » dans ses panneaux", JSON.stringify(await regionsVisibles()) === JSON.stringify(["visualisation"])
    && await enDomaine("[data-studio-scenes]", "visualisation") && (await page.locator("[data-studio-vue3d]").count()) === 1
    && (await page.locator('[role="toolbar"][aria-label="Outils — Visualisation, rendu et immersion"] [data-studio-outil="studio.scene.creer"]').count()) === 1);
  await nav.getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).click();
  await page.waitForURL(`${base}?domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  for (const [sel, nom] of [["[data-studio-quantites]", "métré"], ["[data-studio-revisions]", "révisions"], ['[role="toolbar"] [data-studio-commande="feuille"]', "feuilles"], ['[role="toolbar"] [data-studio-commande="dossier"]', "dossiers"], ["[data-studio-publications-etude]", "publications"]]) {
    check(`${nom} sous « Documentation, métrés et collaboration »`, (await enDomaine(sel, "documentation") || sel.startsWith('[role="toolbar"]')) && await visible(sel));
  }
  check("documentation : « Feuille » et « Feuilles et dossier » gardent le raccourci de leur commande (palette du domaine)", (await page.locator('[role="toolbar"] [data-studio-commande="feuille"][aria-keyshortcuts="Shift+P"] svg').count()) === 1
    && (await page.locator('[role="toolbar"] [data-studio-commande="dossier"][aria-keyshortcuts="Control+Shift+D"] svg').count()) === 1);

  // 3. Clavier : Entrée sur un domaine, adresse remplacée (aucune entrée d'historique).
  await page.goto(base);
  await pret();
  const hrefs = await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const chemin = new URL(base).pathname;
  check("I-6 : chaque lien de domaine a l'adresse de la variante avec ce domaine (planche de Dessin comprise)",
    JSON.stringify(hrefs) === JSON.stringify([`${chemin}?domaine=dessin&planche=2d`, `${chemin}?domaine=bim`, `${chemin}?domaine=visualisation`, `${chemin}?domaine=documentation`]), hrefs.join(" "));
  const longueur = await page.evaluate(() => history.length);
  await nav.getByRole("link", { name: "BIM et coordination", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${base}?domaine=bim`);
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  check("I.4-03 : domaine choisi au clavier, affiché et inscrit dans l'adresse", (await actif()) === "bim");
  check("clavier : le focus reste sur l'onglet choisi (barre persistante)", await page.evaluate(() => document.activeElement?.getAttribute("data-studio-domaine-lien")) === "bim");
  await nav.getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${base}?domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  check("I.4-03 : changer de domaine ajoute une entrée d'historique (une par domaine choisi)", (await page.evaluate(() => history.length)) === longueur + 2);
  await page.goBack();
  await page.waitForURL(`${base}?domaine=bim`);
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  check("historique : le retour arrière revient au domaine précédent, sans quitter la variante ni demander de confirmation", (await actif()) === "bim" && dialogues.length === 0 && JSON.stringify(await regionsVisibles()) === JSON.stringify(["bim"]));
  await page.goForward();
  await page.waitForURL(`${base}?domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  await page.reload();
  await pret();
  check("I.4-03 : l'actualisation restitue le domaine affiché", (await actif()) === "documentation" && JSON.stringify(await regionsVisibles()) === JSON.stringify(["documentation"]));
  check("documentation : la commande « Feuille » s'ouvre depuis la palette du domaine", await (async () => {
    await page.locator('[role="toolbar"] [data-studio-commande="feuille"]').first().click();
    const ok = (await page.locator('[role="dialog"] [data-studio-feuille]').count()) === 1;
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"] [data-studio-feuille]').waitFor({ state: "detached" });
    return ok;
  })());

  // 4. Planche 3D, Double vue, restituées, puis suivies par la bascule Maj+D.
  await nav.getByRole("link", { name: "Dessin et modélisation", exact: true }).click();
  await page.waitForURL(`${base}?domaine=dessin&planche=2d`);
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  await page.locator('[data-studio-planche="3d"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${base}?domaine=dessin&planche=3d`);
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  await page.locator("[data-studio-vue3d]").waitFor();
  check("I.4-02/03 : Planche 3D choisie dans Dessin et modélisation, inscrite dans l'adresse", (await actif()) === "dessin"
    && (await page.locator('[data-studio-planche="3d"]').getAttribute("aria-pressed")) === "true" && (await page.locator("[data-studio-planche-active]").textContent()) === "Planche 3D");
  check("M-4 : le sous-titre de la planche suit la planche active (« Vue 3D »)", (await page.locator("[data-studio-sous-titre]").textContent()) === "Vue 3D · Repère local · Mètres");
  await page.reload();
  await page.locator("[data-studio-vue3d]").waitFor();
  check("I.4-03 : l'actualisation restitue la Planche 3D", (await page.locator('[data-studio-planche="3d"]').getAttribute("aria-pressed")) === "true");
  await page.locator('[data-studio-planche="double"]').click();
  await page.waitForURL(`${base}?domaine=dessin&planche=double`);
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  await page.locator("[data-studio-vue3d]").waitFor();
  const double = await page.evaluate(() => {
    const p = document.querySelector('[aria-label="Planche de dessin 2D"]')?.getBoundingClientRect(), v = document.querySelector("[data-studio-vue3d]")?.getBoundingClientRect();
    return p && v ? { coteACote: p.right <= v.left + 1 && Math.abs(p.top - v.top) < 40, largeurs: [Math.round(p.width), Math.round(v.width)] } : null;
  });
  check("P0 : Double vue — Planche 2D et Planche 3D côte à côte sur grand écran, adresse `planche=double`", !!double?.coteACote && double.largeurs.every((w) => w > 250)
    && (await page.locator("[data-studio-planche-active]").textContent()) === "Double vue", JSON.stringify(double));
  await page.reload();
  await page.locator("[data-studio-vue3d]").waitFor();
  check("I.4-03 : l'actualisation restitue la Double vue", (await page.locator('[data-studio-planche="double"]').getAttribute("aria-pressed")) === "true" && (await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).count()) === 1);
  await page.locator('[data-studio-planche="3d"]').click();
  await page.waitForURL(`${base}?domaine=dessin&planche=3d`);
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  // Revue Codex #204 : une navigation interne qui retire `planche` (même variante, sans remontage) revient à la
  // Planche 2D, valeur par défaut de la route ; le retour arrière restitue la Planche 3D.
  await page.evaluate((u) => { history.pushState(history.state, "", u); dispatchEvent(new PopStateEvent("popstate", { state: history.state })); }, `${base}?domaine=dessin`);
  await page.waitForFunction(() => document.querySelector('[data-studio-planche="2d"]')?.getAttribute("aria-pressed") === "true");
  check("I.4-03 : paramètre `planche` retiré par l'adresse → Planche 2D (défaut de la route)", (await page.locator("[data-studio-vue3d]").count()) === 0);
  await page.goBack();
  await page.waitForURL(`${base}?domaine=dessin&planche=3d`);
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  await page.locator("[data-studio-vue3d]").waitFor();
  check("I.4-03 : retour arrière → Planche 3D restituée", (await page.locator('[data-studio-planche="3d"]').getAttribute("aria-pressed")) === "true");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.waitForURL(`${base}?domaine=dessin&planche=2d`);
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  // L'adresse change avant le rendu de la planche : on attend l'état affiché (borné), puis on le contrôle.
  await page.waitForFunction(() => document.querySelector("[data-studio-sous-titre]")?.textContent === "Dessin 2D · Repère local · Mètres", null, { timeout: 10_000 }).catch(() => {});
  check("I.4-03 : la bascule Maj+D est suivie par l'adresse une fois le domaine inscrit", (await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).count()) === 1
    && (await page.locator("[data-studio-sous-titre]").textContent()) === "Dessin 2D · Repère local · Mètres");
  await page.locator("[data-studio-basculer-commentaires]").click();
  await page.waitForURL(`${base}?commentaires=ouverts&domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  check("M-2 : ouvrir les commentaires conduit à leur domaine (Documentation) ; l'adresse suit l'état réel du panneau", (await page.locator("#studio-commentaires").count()) === 1 && (await actif()) === "documentation" && await visible("#studio-commentaires"));
  await page.locator("[data-studio-basculer-commentaires]").click();
  await page.waitForURL(`${base}?domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  await page.waitForSelector("#studio-commentaires", { state: "detached", timeout: 10_000 }).catch(() => {});
  check("M-2 : panneau refermé, l'adresse ne le dit plus ouvert", (await page.locator("#studio-commentaires").count()) === 0);
  await page.goto(`${base}?commentaires=ouverts`);
  await pret();
  check("lien de notification (`?commentaires=ouverts`, adresse antérieure) : Documentation affiché, commentaires ouverts, adresse inchangée", (await actif()) === "documentation" && await visible("#studio-commentaires") && page.url() === `${base}?commentaires=ouverts`);

  // 5. Combinaison avec une révision historique ; valeurs refusées.
  await page.goto(`${base}?revision=${encodeURIComponent(premiere)}&domaine=visualisation`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  await pret();
  check("révision historique + domaine : lecture seule, domaine affiché conservé", (await actif()) === "visualisation" && JSON.stringify(await regionsVisibles()) === JSON.stringify(["visualisation"]));
  await nav.getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).click();
  await page.waitForURL(`${base}?revision=${encodeURIComponent(premiere)}&domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  check("révision historique : changer de domaine conserve la révision dans l'adresse", page.url().includes(`revision=${encodeURIComponent(premiere)}`));
  const lienRevision = await page.locator(`[data-studio-revision="${premiere}"] a`).first().getAttribute("href");
  const lienCourante = await page.locator("[data-studio-version-courante]").getAttribute("href");
  check("M-1 : l'historique et « Revenir à la version courante » gardent le domaine", lienRevision === `${chemin}?revision=${encodeURIComponent(premiere)}&domaine=documentation` && lienCourante === `${chemin}?domaine=documentation`, `${lienRevision} ${lienCourante}`);
  await page.locator("[data-studio-version-courante]").click();
  await page.waitForURL(`${base}?domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  await pret();
  check("M-1 : revenue à la version courante, le domaine reste affiché", (await actif()) === "documentation" && (await page.locator("[data-studio-lecture-seule-revision]").count()) === 0);
  for (const q of ["?domaine=x", "?domaine=dessin&planche=4d", "?domaine=documentation&planche=3d", "?domaine=bim&planche=double", "?planche=2d", "?planche=double", "?domaine=bim&domaine=bim"]) {
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
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "1");
  await nav.getByRole("link", { name: "Visualisation, rendu et immersion", exact: true }).click();
  await page.waitForURL(`${base}?domaine=visualisation`);
  await page.waitForSelector('[data-studio-domaine-affiche="visualisation"]');
  check("NAV-007 : changer de domaine ne demande rien et garde le brouillon", dialogues.length === 0
    && (await enAttente()) === "1" && (await page.locator("[data-studio-etat]").textContent()) === "Brouillon non enregistré", dialogues.join(" | "));
  // Ctrl + clic : l'adresse du domaine s'ouvre ailleurs ; la variante n'est ni quittée ni gardée.
  const ailleurs = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  await nav.getByRole("link", { name: "BIM et coordination", exact: true }).click({ modifiers: ["Control"] });
  const onglet = await ailleurs;
  check("I-6 : Ctrl + clic sur un domaine ouvre son adresse ailleurs, sans garde ni changement ici", !!onglet && dialogues.length === 0 && page.url() === `${base}?domaine=visualisation`
    && (await enAttente()) === "1", `${onglet?.url() ?? "aucun onglet"} ${page.url()}`);
  if (onglet) { await onglet.waitForURL(/domaine=bim/).catch(() => {}); check("I-6 : l'onglet ouvert porte l'adresse du domaine", onglet.url() === `${base}?domaine=bim`, onglet.url()); await onglet.close(); }
  // Sauvegarde en attente (M-9) : l'envoi est retenu le temps de changer de domaine.
  let liberer;
  const retenue = new Promise((r) => { liberer = r; });
  await page.route("**/variants/*/commands", async (route) => { await retenue; await route.continue(); });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.querySelector("[data-studio-etat]")?.textContent === "Sauvegarde en cours…");
  await nav.getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).click();
  await page.waitForURL(`${base}?domaine=documentation`);
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  check("NAV-007 : changer de domaine pendant une sauvegarde en attente ne demande rien et ne l'interrompt pas", dialogues.length === 0
    && (await page.locator("[data-studio-etat]").textContent()) === "Sauvegarde en cours…" && (await actif()) === "documentation", dialogues.join(" | "));
  liberer();
  await page.waitForFunction(() => document.querySelector("[data-studio-etat]")?.textContent === "Enregistré sur le serveur");
  await page.unroute("**/variants/*/commands");
  const apres = await api("get", `${racine}/${studyId}/variants/${variantId}`);
  check("NAV-007 : la sauvegarde retenue aboutit (brouillon enregistré, rien de perdu)", apres.status === 200 && apres.body?.revision?.document?.objects?.length === 0
    && (await enAttente()) === "0", JSON.stringify(apres.body?.revision?.document?.objects ?? apres.status));

  // 7. Téléphone : barre des domaines compacte en haut, canevas maximal.
  const mobile = await context.newPage();
  mobile.on("pageerror", (e) => erreurs.push(`téléphone : ${e.message}`));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base);
  await mobile.getByRole("group", { name: "Planche de dessin 2D", exact: true }).waitFor();
  const m = await mobile.evaluate(() => {
    const n = document.querySelector("[data-studio-domaines]"), menu = n.querySelector("[data-studio-domaines-menu]");
    const planche = document.querySelector('[aria-label="Planche de dessin 2D"]').getBoundingClientRect();
    const canevas = document.querySelector(".studio-canevas");
    const ordres = [...document.querySelectorAll(".studio-workspace, .studio-workspace *")].filter((e) => getComputedStyle(e).order !== "0").length;
    return {
      menu: !!menu, menuHaut: Math.round(menu.getBoundingClientRect().bottom), plancheHaut: Math.round(planche.top), plancheHauteur: Math.round(planche.height),
      navAvantCanevas: !!(n.compareDocumentPosition(canevas) & Node.DOCUMENT_POSITION_FOLLOWING), liensMasques: n.querySelector("ol").hidden,
      debordePage: document.documentElement.scrollWidth > window.innerWidth + 1, ordres,
      planches: [...document.querySelectorAll("[data-studio-planche]")].map((b) => Math.round(b.getBoundingClientRect().height)),
      echelle: [...document.querySelectorAll("[data-studio-barre-etat] span")].some((e) => e.textContent === "1 unité = 1 m"),
    };
  });
  check("P0 téléphone : barre des domaines compacte (menu) en haut, avant le canevas dans le document et à l'écran", m.menu && m.liensMasques && m.navAvantCanevas && m.menuHaut <= m.plancheHaut && m.ordres === 0, JSON.stringify(m));
  check("téléphone : canevas dans la moitié haute et d'au moins 280 px, aucun débordement", m.plancheHaut < 844 / 2 && m.plancheHauteur >= 280 && !m.debordePage, JSON.stringify(m));
  check("I-5 : téléphone, boutons de planche de 44 px ; échelle dans la barre d'état", m.planches.length === 3 && m.planches.every((h) => h >= 44) && m.echelle, m.planches.join(","));
  const menu = mobile.locator("[data-studio-domaines-menu]");
  check("téléphone : le menu nomme le domaine affiché", ((await menu.textContent()) ?? "").includes("Dessin et modélisation") && (await menu.getAttribute("aria-expanded")) === "false");
  await menu.focus();
  await mobile.keyboard.press("Enter");
  check("téléphone : le menu déplie les quatre domaines (clavier)", (await menu.getAttribute("aria-expanded")) === "true" && (await mobile.locator("[data-studio-domaines] a:visible").count()) === 4);
  await mobile.keyboard.press("Tab");
  check("téléphone : ordre de Tab = ordre visuel (menu, puis le premier domaine)", await mobile.evaluate(() => document.activeElement?.getAttribute("data-studio-domaine-lien")) === "dessin");
  await mobile.getByRole("navigation", { name: "Domaines du Studio" }).getByRole("link", { name: "Documentation, métrés et collaboration", exact: true }).click();
  await mobile.waitForURL(`${base}?domaine=documentation`);
  await mobile.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  check("téléphone : un domaine choisi est affiché, le menu se referme sur son nom", (await menu.getAttribute("aria-expanded")) === "false" && ((await menu.textContent()) ?? "").includes("Documentation, métrés et collaboration")
    && await mobile.locator("[data-studio-quantites]").isVisible());
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
