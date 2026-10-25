#!/usr/bin/env node
/**
 * Recette Studio — preuves du groupe D1 (lot I : intégration Fadi / Studio ; parcours E2E-01 à E2E-04 ; X.1-09), par
 * l'interface et l'API réelles (application construite servie par l'API, même origine, base migrée). Comptes, projets et
 * dessins synthétiques créés par les vraies routes ; aucune donnée de projet réelle, aucune valeur réglementaire.
 *
 *   0. I.2-01 : un visiteur non connecté qui ouvre une adresse Studio est renvoyé à la connexion (RequireAuth) ;
 *   1. I.5-02 : l'entrée « Studio » s'atteint par Tab (après « Projets »), le chevron se déplie / replie au clavier en
 *      gardant le focus, les entrées repliées sont sautées par Tab ;
 *   2. I.5-03 : barre latérale repliée — Studio et chaque domaine gardent leur nom accessible et leur infobulle, chaque
 *      domaine montre son numéro (libellé masqué) ; plein écran explicite avec sortie visible, puis sortie ;
 *   3. E2E-01 (parcours A) : accueil Studio → projet → nouvelle étude (interface) → tracé → modification → cotation →
 *      annotation → enregistrement → fermeture / réouverture (nouvelle session) → feuille → publication 2D sans modèle
 *      3D (préparée, soumise, approuvée, diffusée par l'interface) ; I.3-02 : le bandeau nomme projet, étude, variante
 *      et la révision affichée (tête, puis révision historique) ; X.1-09 : PERF-03, 04 et 08 émis ;
 *   4. I.5-04 : changer de domaine pendant un glisser non terminé ne perd ni ne corrompt le geste ;
 *   5. E2E-02 (parcours B) : boîte posée dans la vue 3D sans esquisse 2D → face poussée → enregistrement → réouverture →
 *      coupe plane ; aucun objet 2D ni BIM (architecture) créé implicitement ;
 *   6. E2E-03 (parcours C) et E2E-04 : mur et ouverture communs → modifications 2D et 3D → métrés, hôte, contrainte →
 *      annuler / rétablir → copie du mur modifiée (la source n'est pas réécrite) → conflit d'un éditeur reporté → observation
 *      sur le mur → publication approuvée et diffusée ; X.1-09 : PERF-06 émis.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-preuves-d1.mjs
 */
import { chromium } from "playwright";
import { accepterInvitation } from "./lib-invitations.mjs";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail && !ok ? ` — ${String(detail).slice(0, 500)}` : ""}`);
  if (!ok) echecs += 1;
}
const court = (x) => JSON.stringify(x).slice(0, 400);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

async function session(nom, { email, password, inscrire = true, viewport = { width: 1360, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  const dialogues = [];
  page.on("dialog", (d) => { dialogues.push(d.message()); void d.accept(); });
  const cred = { email: email ?? `studio-d1-${nom}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`, password: password ?? `studio-d1-${randomUUID()}` };
  await page.goto(`${BASE}/${inscrire ? "inscription" : "connexion"}`);
  await page.fill('input[name="email"]', cred.email);
  await page.fill('input[name="password"]', cred.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const brut = async (method, path, data) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE, "content-type": "application/json" }, ...(data === undefined ? {} : { data }) });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status(), body };
  };
  const api = async (method, path, data) => {
    const r = await brut(method, path, data);
    if (r.status >= 400) throw new Error(`${nom} : ${method} ${path} → ${r.status} ${court(r.body)}`);
    return r.body;
  };
  return { nom, context, page, dialogues, cred, brut, api };
}

/** Barre compacte : un bouton rangé dans un menu « ▾ » s'atteint en ouvrant ce menu, comme le ferait l'utilisateur. */
const barreDe = (page) => page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');
async function atteindre(page, selecteur) {
  const barre = barreDe(page);
  const el = barre.locator(selecteur).first();
  await el.waitFor({ state: "attached" });
  if (!(await el.isVisible())) {
    const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
    if (menu) await barre.locator(`[aria-controls="${menu}"]`).click();
    await el.waitFor({ state: "visible" });
  }
  return el;
}
const bouton = (page, nom) => atteindre(page, `:is(button,a)[aria-label="${nom}"]`);
const flou = (page) => page.evaluate(() => document.activeElement?.blur());
const enAttente = async (page) => Number(await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre"));
const attendreEnAttente = (page, n) => page.waitForFunction((v) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === v, String(n));
async function enregistrer(page) {
  await flou(page);
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
}
/** Point du repère de la planche → écran (la planche est ramenée dans la fenêtre au besoin). */
const versEcran = (page, x, y) => page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).evaluate((svg, w) => {
  const ecran = () => new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM());
  const s = ecran();
  if (s.y < 40 || s.y > window.innerHeight - 40) window.scrollBy(0, s.y - window.innerHeight / 2);
  const t = ecran();
  return { x: t.x, y: t.y };
}, { x, y });
async function cliquerPlanche(page, x, y) {
  const p = await versEcran(page, x, y);
  await page.mouse.click(p.x, p.y);
}
const perf = (page, code) => page.evaluate((c) => globalThis.__fadiPerf?.mesures(c) ?? [], code);
async function partie(nom, f) {
  try { await f(); } catch (e) { check(`${nom} : déroulé complet`, false, e?.stack ?? String(e)); }
}

try {
  // ——— 0. I.2-01 : visiteur non connecté ———
  await partie("I.2-01", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const lectures = [];
    page.on("request", (r) => { const p = new URL(r.url()).pathname; if (/\/studio\//.test(p) && p.startsWith("/projects")) lectures.push(p); });
    for (const adresse of ["/studio", "/studio/projets/inconnu/etudes/x/variantes/y?domaine=bim", "/studio/console"]) {
      await page.goto(`${BASE}${adresse}`);
      await page.waitForURL(`${BASE}/connexion`);
      check(`I.2-01 : un visiteur non connecté qui ouvre ${adresse} est renvoyé à la connexion, sans écran Studio`,
        page.url() === `${BASE}/connexion` && (await page.locator("[data-studio], .studio-shell").count()) === 0 && (await page.locator('input[name="password"]').count()) === 1, page.url());
    }
    check("I.2-01 : aucune lecture d'une route Studio d'un projet sans session", lectures.length === 0, lectures.join(" "));
    await context.close();
  });

  const A = await session("a");
  const projet = await A.api("POST", "/projects", { code: `P.D1.${Date.now() % 100000}`, name: "Studio D1 — parcours" });

  // ——— 1. I.5-02 : clavier et focus de l'entrée Studio ———
  await partie("I.5-02", async () => {
    const { page } = A;
    await page.goto(`${BASE}/accueil`);
    await page.locator("#workspace-navigation a[data-nav-studio]").waitFor();
    await page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
    const parcours = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const actif = await page.evaluate(() => { const e = document.activeElement; return e?.hasAttribute("data-nav-studio") ? "studio" : e?.classList.contains("sidebar-projects") ? "projets" : e?.getAttribute("aria-label") ?? e?.tagName; });
      parcours.push(actif);
      if (actif === "studio") break;
    }
    check("I.5-02 : l'entrée « Studio » s'atteint par Tab depuis le haut de la page, juste après « Projets »", parcours.at(-1) === "studio" && parcours.at(-2) === "projets", parcours.join(" → "));
    const nom = await page.evaluate(() => { const e = document.activeElement; return [e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("href")]; });
    check("I.5-02 : entrée focalisée — nom accessible « Studio », infobulle, lien /studio", JSON.stringify(nom) === JSON.stringify(["Studio", "Studio", "/studio"]), JSON.stringify(nom));
    await page.keyboard.press("Tab");
    const focusChevron = () => page.evaluate(() => document.activeElement?.hasAttribute("data-studio-menu-lateral-bascule") ? document.activeElement.getAttribute("aria-expanded") : null);
    check("I.5-02 : Tab suivant — le chevron du menu Studio (replié, aria-expanded=false)", (await focusChevron()) === "false");
    await page.keyboard.press("ArrowRight");
    check("I.5-02 : flèche droite déplie le menu, le focus reste sur le chevron", (await focusChevron()) === "true" && await page.locator("#studio-menu-domaines").isVisible());
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    check("I.5-02 : menu déplié — Tab atteint « Console » puis « Accueil Studio »", await page.evaluate(() => document.activeElement?.hasAttribute("data-studio-menu-accueil")));
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("ArrowLeft");
    check("I.5-02 : flèche gauche replie le menu, le focus reste sur le chevron", (await focusChevron()) === "false" && !(await page.locator("#studio-menu-domaines").isVisible()));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    check("I.5-02 : menu replié — Tab saute les entrées masquées (Console, puis Collaboration)", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Collaboration");
    await page.locator("[data-studio-menu-lateral-bascule]").click();
    check("I.5-02 : un clic sur le chevron le déplie et lui laisse le focus", (await focusChevron()) === "true");
    await page.locator("[data-studio-menu-lateral-bascule]").click();
    check("I.5-02 : un second clic le replie, focus gardé", (await focusChevron()) === "false");
    await page.locator("#workspace-navigation a[data-nav-studio]").focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(`${BASE}/studio`);
    await page.locator('[data-studio="accueil"]').waitFor();
    check("I.5-02 : Entrée sur l'entrée Studio ouvre l'accueil Studio ; l'entrée devient active (aria-current)", (await page.locator("#workspace-navigation a[data-nav-studio]").getAttribute("aria-current")) === "page");
  });

  // ——— 2. I.5-03 : barre repliée ———
  await partie("I.5-03 barre", async () => {
    const { page } = A;
    await page.goto(`${BASE}/studio`);
    await page.locator('[data-studio="accueil"]').waitFor();
    check("I.5-03 : la barre latérale est repliée par défaut", (await page.locator(".fadi-shell").getAttribute("data-sidebar")) === "collapsed");
    if ((await page.locator("[data-studio-menu-lateral-bascule]").getAttribute("aria-expanded")) !== "true") await page.locator("[data-studio-menu-lateral-bascule]").click();
    const replie = await page.evaluate(() => {
      const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
      const studio = document.querySelector("a[data-nav-studio]");
      return {
        studio: [studio.getAttribute("aria-label"), studio.getAttribute("title"), vis(studio.querySelector("svg")), vis(studio.querySelector(".sidebar-label"))],
        domaines: [...document.querySelectorAll("[data-studio-menu-domaine]")].map((a) => [a.getAttribute("aria-label"), a.getAttribute("title"), vis(a) ? a.querySelector(".sidebar-studio-numero")?.textContent : null, vis(a.querySelector(".sidebar-studio-numero")), vis(a.querySelector(".sidebar-label"))]),
      };
    });
    check("I.5-03 : barre repliée — « Studio » garde son icône, son nom accessible et son infobulle ; libellé masqué",
      JSON.stringify(replie.studio) === JSON.stringify(["Studio", "Studio", true, false]), court(replie.studio));
    const attendus = ["01 · Dessin et modélisation", "02 · BIM et coordination", "03 · Visualisation, rendu et immersion", "04 · Documentation, métrés et collaboration"];
    check("I.5-03 : barre repliée — chaque domaine montre son numéro visible, nom exact en nom accessible et en infobulle, libellé masqué",
      replie.domaines.length === 4 && replie.domaines.every((d, i) => d[0] === attendus[i] && d[1] === attendus[i] && d[2] === `0${i + 1}` && d[3] === true && d[4] === false), court(replie.domaines));
    await page.locator(".sidebar-toggle").click();
    const deplie = await page.evaluate(() => [...document.querySelectorAll("[data-studio-menu-domaine] .sidebar-label")].map((e) => getComputedStyle(e).display !== "none"));
    check("I.5-03 : barre dépliée — les libellés des domaines reparaissent", deplie.length === 4 && deplie.every(Boolean), court(deplie));
    await page.locator(".sidebar-toggle").click();
  });

  // ——— 3. E2E-01 : parcours A, depuis l'accueil Studio ———
  let parcoursA = null;
  await partie("E2E-01", async () => {
    let { page, context } = A;
    await page.goto(`${BASE}/studio`);
    const liste = page.locator("[data-studio-projets] button");
    await liste.filter({ hasText: projet.code }).click();
    const creer = page.locator("[data-studio-creer-etude]");
    await creer.locator("#studio-etude-nom").fill("Parcours A — détail 2D");
    await creer.locator("[data-studio-ouvrir-etude]").click();
    await page.waitForURL(new RegExp(`/studio/projets/${projet.id}/etudes/[^/]+/variantes/[^/?]+`));
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    const [, , , , , studyId, , variantId] = new URL(page.url()).pathname.split("/");
    const racine = `/projects/${projet.id}/studio/studies/${studyId}`;
    const chemin = `${racine}/variants/${variantId}`;
    const etude = await A.api("GET", racine);
    check("E2E-01 : étude créée depuis l'accueil Studio (projet choisi, nom saisi) — l'espace de sa variante initiale s'ouvre", etude.study.name === "Parcours A — détail 2D" && etude.study.initialVariantId === variantId);
    const variante = etude.variants.find((v) => v.id === variantId);
    // I.3-02 : bandeau — projet (en-tête de Fadi), étude, variante, révision de tête.
    const bandeau = async () => page.evaluate(() => ({
      projet: document.querySelector(".app-topbar h1")?.textContent ?? "",
      fil: document.querySelector(".studio-fil")?.textContent ?? "",
      revision: document.querySelector("[data-studio-fil-revision]")?.getAttribute("data-studio-fil-revision") ?? null,
      revisionTexte: document.querySelector("[data-studio-fil-revision]")?.textContent ?? "",
    }));
    const tete0 = (await A.api("GET", chemin)).revision.id;
    await page.waitForFunction((r) => document.querySelector("[data-studio-fil-revision]")?.getAttribute("data-studio-fil-revision") === r, tete0).catch(() => {});
    const b0 = await bandeau();
    check("I.3-02 : bandeau — le bon projet (en-tête), l'étude, la variante et la révision de tête affichée (identifiant et texte)",
      b0.projet.includes(projet.code) && b0.fil.includes("Parcours A — détail 2D") && b0.fil.includes(variante.name) && b0.revision === tete0 && b0.revisionTexte.includes(`Révision ${tete0.slice(-8)}`) && !b0.revisionTexte.includes("historique"), court(b0));

    // Tracé (Ligne, deux clics), avec PERF-03 (aperçu) et PERF-04 (accrochage).
    await (await bouton(page, "Ligne")).click();
    await cliquerPlanche(page, 2, 8);
    const q = await versEcran(page, 6, 8);
    await page.mouse.move(q.x - 30, q.y, { steps: 3 });
    await page.mouse.move(q.x, q.y, { steps: 3 });
    await page.mouse.click(q.x, q.y);
    const lignes = page.locator('svg [role="button"][aria-label^="Ligne "]');
    check("E2E-01 : tracé — deux clics posent une ligne", (await lignes.count()) === 1);
    await page.waitForFunction(() => (globalThis.__fadiPerf?.mesures("PERF-03").length ?? 0) > 0).catch(() => {});
    const p3 = await perf(page, "PERF-03"), p4 = await perf(page, "PERF-04");
    check("X.1-09 : PERF-03 (pointeur → aperçu) émis pendant le tracé, en ms", p3.length > 0 && p3.every((m) => m.unite === "ms" && m.valeur >= 0), court(p3.slice(0, 2)));
    check("X.1-09 : PERF-04 (accrochage) émis au point posé ou survolé, en ms", p4.length > 0 && p4.every((m) => m.unite === "ms" && m.valeur >= 0 && typeof m.etiquettes.objets === "number"), court(p4.slice(0, 2)));
    const p9 = await perf(page, "PERF-09");
    const memoireExposee = await page.evaluate(() => typeof performance.memory?.usedJSHeapSize === "number");
    check("X.1-09 : PERF-09 (mémoire) relevé en octets à l'ouverture de la planche et au changement d'outil (Chromium expose la mémoire)",
      memoireExposee && p9.length > 0 && p9.every((m) => m.unite === "octets" && m.valeur > 0) && p9.some((m) => m.etiquettes.occasion === "planche-prete") && p9.some((m) => String(m.etiquettes.occasion).startsWith("outil:")), court(p9.map((m) => m.etiquettes.occasion)));
    // Modification : la ligne choisie, son extrémité déplacée (outil Modifier, « e »).
    await (await bouton(page, "Sélection")).click();
    const idLigne = await lignes.first().getAttribute("data-studio-objet");
    await page.locator(`[data-studio-objet="${idLigne}"]`).focus();
    await page.keyboard.press("Enter");
    await page.locator(`[data-studio-selection="${idLigne}"]`).waitFor();
    await flou(page);
    await page.keyboard.press("e");
    const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
    await proprietes.getByLabel("X final", { exact: true }).fill("7");
    await proprietes.getByLabel("Y final", { exact: true }).fill("8");
    await proprietes.getByRole("button", { name: "Modifier la sélection", exact: true }).click();
    await attendreEnAttente(page, 2);
    check("E2E-01 : modification — l'extrémité de la ligne passe à (7 ; 8), une commande de plus", (await enAttente(page)) === 2);
    // Cotation (Maj+C) accrochée aux extrémités de la ligne modifiée.
    await flou(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+C");
    await cliquerPlanche(page, 2.02, 8.01);
    await cliquerPlanche(page, 6.98, 7.99);
    const cote = page.locator("svg [data-studio-cote]");
    await cote.waitFor({ state: "attached" });
    const valeurCote = Number(await cote.getAttribute("data-studio-cote-valeur"));
    check("E2E-01 : cotation — cote accrochée, résolue, mesurant la ligne modifiée (5 m)", (await cote.getAttribute("data-studio-cote-etat")) === "resolue" && Math.abs(valeurCote - 5) < 0.05, String(valeurCote));
    // Annotation (Maj+T) : texte saisi, posé d'un clic.
    await flou(page);
    await page.keyboard.press("Shift+T");
    await proprietes.getByLabel("Texte", { exact: true }).fill("Repère A");
    await proprietes.getByLabel("Hauteur du texte", { exact: true }).fill("0.4");
    await flou(page);
    await cliquerPlanche(page, 4, 10);
    await page.locator("svg [data-studio-texte]").waitFor({ state: "attached" });
    check("E2E-01 : annotation — le texte « Repère A » est posé", (await page.locator("svg [data-studio-texte] text").textContent()) === "Repère A");
    await enregistrer(page);
    const doc = (await A.api("GET", chemin)).revision;
    const ligne = doc.document.objects.find((o) => o.id === idLigne);
    check("E2E-01 : enregistré — une ligne modifiée (≈ 2 ; 8) → (7 ; 8), une cote, un texte ; aucun solide, aucune extrusion, aucun objet d'architecture",
      doc.document.objects.length === 1 && ligne?.type === "line" && ligne.end.x === 7 && ligne.end.y === 8 && Math.hypot(ligne.start.x - 2, ligne.start.y - 8) < 0.05 && (doc.document.dimensions ?? []).length === 1
      && (doc.document.annotations ?? []).filter((a) => a.type === "text" && a.content === "Repère A").length === 1 && !(doc.document.solides ?? []).length && !(doc.document.architecture ?? []).length && !ligne.extrusion, court(doc.document));
    await page.waitForFunction((r) => document.querySelector("[data-studio-fil-revision]")?.getAttribute("data-studio-fil-revision") === r, doc.id).catch(() => {});
    const b1 = await bandeau();
    check("I.3-02 : après l'enregistrement, le bandeau affiche la nouvelle révision de tête", b1.revision === doc.id && b1.revisionTexte.includes(doc.id.slice(-8)), court(b1));
    // Fermeture, réouverture dans une nouvelle session (nouvelle connexion).
    await context.close();
    const A2 = await session("a-rouvert", { email: A.cred.email, password: A.cred.password, inscrire: false });
    A.page = A2.page; A.context = A2.context; A.brut = A2.brut; A.api = A2.api; A.dialogues = A2.dialogues;
    ({ page, context } = A2);
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`);
    await page.locator("svg [data-studio-texte]").waitFor({ state: "attached" });
    check("E2E-01 : rouverte dans une nouvelle session — ligne modifiée, cote et texte reviennent du serveur, même tête",
      (await page.locator('svg [role="button"][aria-label^="Ligne "]').count()) === 1 && Math.abs(Number(await page.locator("svg [data-studio-cote]").getAttribute("data-studio-cote-valeur")) - valeurCote) < 1e-9
      && (await page.locator("svg [data-studio-texte] text").textContent()) === "Repère A" && (await A.api("GET", chemin)).revision.id === doc.id);
    // Feuille : Documentation → Feuilles et dossier (Ctrl+Maj+D) → F-01.
    await page.locator('[data-studio-domaine-lien="documentation"]').click();
    await flou(page);
    await page.keyboard.press("Control+Shift+D");
    const boite = page.locator("[data-studio-dossier]");
    await boite.waitFor();
    const nouvelle = boite.locator("[data-studio-feuille-nouvelle]");
    await nouvelle.locator("[data-studio-feuille-titre]").fill("Détail A");
    await nouvelle.locator("[data-studio-feuille-creer]").click();
    await boite.locator('[data-studio-feuille][data-numero="F-01"]').waitFor();
    const feuilles = (await A.api("GET", `${racine}/sheets`)).sheets;
    check("E2E-01 : feuille F-01 composée depuis la révision enregistrée (provenance : révision et variante)",
      feuilles.length === 1 && feuilles[0].definition.numero === "F-01" && feuilles[0].revisionId === doc.id && feuilles[0].variantId === variantId, court(feuilles));
    await page.keyboard.press("Escape");
    await boite.waitFor({ state: "detached" });
    // Boîte « Feuille » (Maj+P) : composition hors du fil principal (Worker), relevée en PERF-08.
    await flou(page);
    await page.keyboard.press("Shift+P");
    await page.waitForFunction(() => (globalThis.__fadiPerf?.mesures("PERF-08").length ?? 0) > 0, null, { timeout: 15000 }).catch(() => {});
    const p8 = await perf(page, "PERF-08");
    check("X.1-09 : PERF-08 (génération documentaire) émis à la composition de la feuille (boîte Feuille, Maj+P)", p8.length > 0 && p8.every((m) => m.unite === "ms" && m.valeur >= 0), court(p8));
    await page.keyboard.press("Escape");
    // Publication 2D sans modèle 3D, par l'interface : préparer, soumettre, approuver, diffuser.
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
    const preparer = page.locator("[data-studio-publication-preparer]");
    await preparer.waitFor();
    await preparer.locator("#studio-publication-titre").fill("Parcours A");
    await preparer.locator("[data-studio-publication-dessin2d]").check();
    await preparer.getByRole("button", { name: "Préparer la publication" }).click();
    const carte = page.locator('li[data-studio-publication][data-contenu="dessin-2d"]');
    await carte.waitFor();
    const pubId = await carte.getAttribute("data-studio-publication");
    for (const action of ["soumettre", "approuver", "diffuser"]) {
      const b = carte.locator(`[data-studio-publication-action="${action}"]`);
      await b.waitFor();
      await b.click();
      const auto = carte.locator(`#studio-publication-auto-case-${pubId}`);
      if (action === "approuver" && await auto.count()) await auto.check();
      await carte.getByRole("button", { name: "Confirmer", exact: true }).click();
      await carte.locator(`[data-studio-publication-action="${action}"]`).waitFor({ state: "detached" });
    }
    await carte.locator("[data-studio-publication-paquet]").waitFor();
    const pub = await A.api("GET", `${racine}/publications/${pubId}`);
    const formats = (pub.diffusion?.files ?? []).map((f) => f.format);
    check("E2E-01 : publication 2D préparée, soumise, approuvée et diffusée par l'interface — révision enregistrée, paquet SVG / DXF / feuille PDF, sans IFC",
      pub.contenu === "dessin-2d" && pub.revisionId === doc.id && pub.diffusionStatus === "diffuse" && JSON.stringify(formats) === JSON.stringify(["svg", "dxf", "pdf"])
      && JSON.stringify((await carte.locator("[data-studio-publication-fichier]").evaluateAll((l) => l.map((x) => x.getAttribute("data-studio-publication-fichier"))))) === JSON.stringify(formats), court(pub));
    parcoursA = { studyId, variantId, chemin, tete0, tete: doc.id, idLigne };
    // I.3-02 : révision historique — le bandeau la nomme comme telle.
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}?revision=${encodeURIComponent(tete0)}`);
    await page.locator("[data-studio-lecture-seule-revision]").waitFor();
    const b2 = await bandeau();
    check("I.3-02 : révision historique ouverte — le bandeau affiche « Révision historique » et son identifiant, pas la tête",
      b2.revision === tete0 && b2.revisionTexte.includes(`Révision historique ${tete0.slice(-8)}`) && b2.fil.includes(variante.name) && b2.projet.includes(projet.code), court(b2));
  });

  // ——— 2 bis. I.5-03 : plein écran explicite, sortie visible ———
  await partie("I.5-03 plein écran", async () => {
    if (!parcoursA) throw new Error("parcours A absent");
    const { page } = A;
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${parcoursA.studyId}/variantes/${parcoursA.variantId}`);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    check("I.5-03 : Studio s'ouvre hors plein écran, barre latérale de Fadi visible", await page.evaluate(() => document.fullscreenElement === null) && await page.locator(".app-sidebar").isVisible());
    const entree = await bouton(page, "Plein écran / Quitter");
    check("I.5-03 : le plein écran est une action explicite de la barre (icône, raccourci Ctrl+Maj+F annoncé)", (await entree.locator("svg").count()) >= 1 && /Control\+Shift\+F/.test((await entree.getAttribute("aria-keyshortcuts")) ?? ""), await entree.getAttribute("aria-keyshortcuts"));
    await entree.click();
    await page.waitForFunction(() => document.fullscreenElement !== null);
    const etat = await page.evaluate(() => {
      const fs = document.fullscreenElement;
      const sortie = [...(fs?.querySelectorAll("[data-studio-quitter-plein-ecran]") ?? [])].find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden"; });
      return { espace: fs?.hasAttribute("data-studio-variante") ?? false, sortieVisible: !!sortie, sortieRect: sortie ? (() => { const r = sortie.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })() : false };
    });
    check("I.5-03 : plein écran — l'espace de la variante passe en plein écran ; la commande de sortie reste visible à l'écran, dans l'élément plein écran", etat.espace && etat.sortieVisible && etat.sortieRect, court(etat));
    const sortie = page.locator("[data-studio-variante] [data-studio-quitter-plein-ecran]");
    check("I.5-03 : la sortie visible porte son nom accessible, son icône et ses raccourcis (Ctrl+Maj+F, Échap)", (await sortie.getAttribute("aria-label")) === "Quitter le plein écran" && (await sortie.locator("svg").count()) === 1 && (await sortie.getAttribute("aria-keyshortcuts")) === "Control+Shift+F Escape");
    await sortie.click();
    await page.waitForFunction(() => document.fullscreenElement === null);
    check("I.5-03 : la commande visible quitte le plein écran ; la navigation de Fadi revient, la sortie disparaît", await page.evaluate(() => document.fullscreenElement === null) && await page.locator(".app-sidebar").isVisible() && (await sortie.count()) === 0);
    await flou(page);
    await page.keyboard.press("Control+Shift+F");
    await page.waitForFunction(() => document.fullscreenElement !== null);
    await page.keyboard.press("Control+Shift+F");
    await page.waitForFunction(() => document.fullscreenElement === null);
    check("I.5-03 : Ctrl+Maj+F entre puis sort du plein écran", true);
  });

  // ——— 4. I.5-04 : changer de domaine pendant un glisser non terminé ———
  await partie("I.5-04", async () => {
    if (!parcoursA) throw new Error("parcours A absent");
    const { page, dialogues } = A;
    const url = `${BASE}/studio/projets/${projet.id}/etudes/${parcoursA.studyId}/variantes/${parcoursA.variantId}`;
    await page.goto(url);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    const id = parcoursA.idLigne;
    await page.locator(`svg [data-studio-objet="${id}"]`).waitFor({ state: "attached" });
    await (await bouton(page, "Sélection")).click();
    await page.locator(`[data-studio-objet="${id}"]`).focus();
    await page.keyboard.press("Enter");
    await page.locator(`[data-studio-selection="${id}"]`).waitFor();
    const avant = (await A.api("GET", parcoursA.chemin)).revision;
    const ligneAffichee = (i) => page.evaluate((x) => { const l = document.querySelector(`svg [data-studio-objet="${x}"] line`); return l ? ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))) : null; }, i);
    const depart = await ligneAffichee(id);
    // Repère posé sur la planche : la même planche (pas une nouvelle) doit porter le geste après le changement de domaine.
    await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).evaluate((svg) => { svg.__repereD1 = true; });
    const p = await versEcran(page, 4.5, 8), q = await versEcran(page, 5.5, 9);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
    const pendant = { enAttente: await enAttente(page), ligne: await ligneAffichee(id) };
    const nDialogues = dialogues.length;
    const envois = [];
    page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${parcoursA.chemin}/commands`) envois.push(r.postDataJSON()); });
    await page.locator('[data-studio-domaine-lien="bim"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/domaine=bim/);
    const memePlanche = await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).evaluate((svg) => svg.__repereD1 === true);
    await page.mouse.move(q.x, q.y, { steps: 4 });
    await page.mouse.up();
    await attendreEnAttente(page, 1).catch(() => {});
    const fin = await ligneAffichee(id);
    const d = fin ? [fin[0] - depart[0], fin[1] - depart[1], fin[2] - depart[2], fin[3] - depart[3]] : null;
    check("I.5-04 : pendant le glisser, aperçu seulement (aucune commande en attente, ligne déjà déplacée à l'écran)", pendant.enAttente === 0 && JSON.stringify(pendant.ligne) !== JSON.stringify(depart), court(pendant));
    check("I.5-04 : changer de domaine pendant le glisser ne demande rien, ne recharge pas la planche et ne la remplace pas (même élément)", dialogues.length === nDialogues && memePlanche && new URL(page.url()).searchParams.get("domaine") === "bim");
    check("I.5-04 : le geste n'est ni perdu ni corrompu — au relâchement, un seul déplacement rigide (mêmes dx, dy aux deux extrémités) en attente, rien n'est envoyé",
      (await enAttente(page)) === 1 && !!d && Math.abs(d[0] - d[2]) < 1e-9 && Math.abs(d[1] - d[3]) < 1e-9 && Math.hypot(d[0], d[1]) > 0.5 && envois.length === 0 && (await A.api("GET", parcoursA.chemin)).revision.id === avant.id, court({ depart, fin }));
    await flou(page);
    await page.keyboard.press("Control+z");
    await attendreEnAttente(page, 0);
    check("I.5-04 : Annuler retire ce déplacement en une fois (ligne revenue à sa position)", JSON.stringify(await ligneAffichee(id)) === JSON.stringify(depart), court(await ligneAffichee(id)));
    await page.keyboard.press("Control+y");
    await attendreEnAttente(page, 1);
    await enregistrer(page);
    const env = envois.at(-1);
    const relu = (await A.api("GET", parcoursA.chemin)).revision.document.objects.find((o) => o.id === id);
    const avantLigne = avant.document.objects.find((o) => o.id === id);
    check("I.5-04 : enregistré en une seule commande studio.dessin.deplacer, appliquée telle quelle par le serveur",
      envois.length === 1 && env.commands.length === 1 && env.commands[0].toolId === "studio.dessin.deplacer" && env.commands[0].params.id === id
      && Math.abs(relu.start.x - avantLigne.start.x - env.commands[0].params.dx) < 1e-9 && Math.abs(relu.end.y - avantLigne.end.y - env.commands[0].params.dy) < 1e-9, court(env?.commands));
  });

  // ——— 5. E2E-02 : parcours B, création spatiale directe ———
  await partie("E2E-02", async () => {
    const { page } = A;
    const etude = await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Parcours B — volume direct" });
    const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
    const url = `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`;
    const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
    const texteSolide = (id) => panneaux3d.locator(`[data-studio-solide="${id}"]`).textContent();
    const ouvrir3d = async () => {
      await flou(page);
      await page.keyboard.press("Shift+D");
      await panneaux3d.locator("canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 20000 });
    };
    await page.goto(url);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    const vide = (await A.api("GET", chemin)).revision.document;
    check("E2E-02 : étude neuve — aucun objet 2D, aucun solide, aucun objet d'architecture", vide.objects.length === 0 && !(vide.solides ?? []).length && !(vide.architecture ?? []).length);
    await ouvrir3d();
    await flou(page);
    await page.keyboard.press("b");
    const formBoite = panneaux3d.locator("[data-studio-boite]");
    await formBoite.waitFor();
    check("E2E-02 : création spatiale directe — vue 3D ouverte sans planche 2D, outil Boîte prêt", (await page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).count()) === 0);
    for (const [libelle, valeur] of [["Origine x (m)", "0"], ["Origine y (m)", "0"], ["Origine z (m)", "0"], ["Largeur selon x (m)", "3"], ["Profondeur selon y (m)", "2"], ["Hauteur selon z (m)", "2"]]) await formBoite.getByLabel(libelle, { exact: true }).fill(valeur);
    await formBoite.getByRole("button", { name: "Poser la boîte", exact: true }).click();
    await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
    const [idBoite] = await panneaux3d.locator('[data-studio-solide-type="box"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-solide")));
    check("E2E-02 : boîte 3 × 2 × 2 posée dans la vue 3D (12 m³)", (await texteSolide(idBoite)).includes("Boîte 3 × 2 × 2 m · 12 m³"), await texteSolide(idBoite));
    await flou(page);
    await page.keyboard.press("Control+Shift+U");
    const formFace = panneaux3d.locator(`[data-studio-face-decaler="${idBoite}"]`);
    await formFace.waitFor();
    await formFace.locator("[data-studio-face-choix]").selectOption("sommet");
    await formFace.getByLabel("Distance (m, positive vers l’extérieur)").fill("1.5");
    await formFace.getByRole("button", { name: "Pousser / tirer la face", exact: true }).click();
    await attendreEnAttente(page, 2);
    check("E2E-02 : édition de face — sommet poussé de 1,5 m, même solide, 3 × 2 × 3,5 m (21 m³)", (await texteSolide(idBoite)).includes("Boîte 3 × 2 × 3,5 m · 21 m³"), await texteSolide(idBoite));
    await enregistrer(page);
    const tete = (await A.api("GET", chemin)).revision;
    // Réouverture : la page est rechargée, la vue 3D rouverte depuis le serveur.
    await page.reload();
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    await ouvrir3d();
    await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
    check("E2E-02 : rouverte — le même solide (identifiant) revient du serveur, 3 × 2 × 3,5 m, aucune modification en attente",
      (await texteSolide(idBoite)).includes("Boîte 3 × 2 × 3,5 m · 21 m³") && (await enAttente(page)) === 0 && (await A.api("GET", chemin)).revision.id === tete.id);
    check("E2E-02 : document relu — un seul solide, aucun objet 2D ni esquisse préalable, aucun objet BIM (architecture) créé implicitement",
      tete.document.solides?.length === 1 && tete.document.solides[0].id === idBoite && tete.document.solides[0].height === 3.5 && tete.document.objects.length === 0
      && !(tete.document.architecture ?? []).length && !(tete.document.dimensions ?? []).length, court(tete.document));
    await flou(page);
    await page.keyboard.press("Shift+K");
    const coupe = panneaux3d.locator("[data-studio-coupe]");
    await coupe.waitFor();
    await coupe.getByLabel("Cote de coupe z (m)", { exact: true }).fill("3");
    await page.locator('[data-studio-coupe][data-studio-coupe-z="3"]').waitFor();
    check("E2E-02 : coupe plane à z = 3 m (atteinte grâce à la face poussée) — 4 contours issus du solide, non modifiable",
      (await coupe.getAttribute("data-studio-coupe-segments")) === "4" && (await coupe.getAttribute("data-studio-coupe-sources")) === idBoite && (await coupe.getByRole("status").textContent()).includes("non modifiable"));
  });

  // ——— 6. E2E-03 (parcours C) et E2E-04 (copie indépendante) ———
  await partie("E2E-03", async () => {
    const { page } = A;
    const B = await session("b");
    const etude = await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Parcours C — mur et ouverture" });
    const racine = `/projects/${projet.id}/studio/studies/${etude.study.id}`;
    const chemin = `${racine}/variants/${etude.variant.id}`;
    const url = `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`;
    // X.2-02 : invitation en attente (envoyée, pas encore acceptée) — aucun droit Studio, refus sans divulgation ni écriture.
    const invite = await A.brut("POST", `/projects/${projet.id}/members`, { email: B.cred.email, role: "editeur" });
    check("X.2-02 : B invité comme éditeur — invitation en attente (202)", invite.status === 202, court(invite));
    const teteInit = (await A.api("GET", chemin)).revision.id;
    const nEtudes = (await A.api("GET", `/projects/${projet.id}/studio/studies`)).studies.length;
    const enAttenteLectures = await Promise.all([`/projects/${projet.id}/studio/studies`, racine, chemin, `${chemin}/revisions`, `${chemin}/comments`].map((p) => B.brut("GET", p)));
    const enAttenteEcritures = await Promise.all([
      B.brut("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `d1-${randomUUID()}`, baseRevisionId: teteInit, commands: [{ toolId: "studio.dessin.ligne", params: { id: "intrus", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] }),
      B.brut("POST", `/projects/${projet.id}/studio/studies`, { name: "Intrus" }),
      B.brut("POST", `${chemin}/comments`, { body: "Intrus" }),
    ]);
    check("X.2-02 : invitation en attente — lectures Studio refusées 404 (aucune fuite), comme un non-membre", enAttenteLectures.every((r) => r.status === 404), enAttenteLectures.map((r) => r.status).join(","));
    check("X.2-02 : invitation en attente — écritures Studio (commandes, étude, commentaire) refusées 404, sans aucune écriture",
      enAttenteEcritures.every((r) => r.status === 404) && (await A.api("GET", chemin)).revision.id === teteInit && (await A.api("GET", `/projects/${projet.id}/studio/studies`)).studies.length === nEtudes
      && (await A.api("GET", `${chemin}/comments`)).comments.length === 0, enAttenteEcritures.map((r) => r.status).join(","));
    await B.page.goto(url);
    await B.page.locator("[data-studio-refus]").waitFor();
    check("X.2-02 : invitation en attente — l'interface refuse la variante sans divulguer l'étude", !((await B.page.locator("#workspace-content").textContent()) ?? "").includes("Parcours C"));
    const lien = invite.body?.mail?.link;
    const jeton = typeof lien === "string" ? lien.split("#jeton=")[1] : null;
    const accepte = jeton ? await B.brut("POST", "/auth/invitations/accept", { token: decodeURIComponent(jeton) }) : await accepterInvitation(B.brut, B.cred.email, invite.body.invitation.id);
    check("E2E-03 : invitation acceptée — B devient éditeur et lit la variante (200)", accepte.status === 200 && (await B.brut("GET", chemin)).status === 200, court(accepte));
    const envois = [];
    page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${chemin}/commands`) envois.push(r.postDataJSON()); });
    const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
    const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
    await page.goto(url);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    // Mur et ouverture communs (outils W et H de la planche 2D).
    await flou(page);
    await page.keyboard.press("w");
    const formMur = proprietes.locator("[data-studio-architecture-mur-formulaire]");
    await formMur.waitFor();
    await formMur.getByLabel("Axe (x y ; …)").fill("0 0; 6 0");
    for (const [libelle, v] of [["Épaisseur (m)", "0.2"], ["Hauteur (m)", "3"], ["Cote de base z (m)", "0"]]) await formMur.getByLabel(libelle, { exact: true }).fill(v);
    await formMur.locator('[data-studio-champ-architecture="justification"]').selectOption("center");
    await formMur.getByRole("button", { name: "Créer le mur", exact: true }).click();
    const murs = page.locator('svg [data-studio-architecture][data-studio-type="wall"]');
    await murs.first().waitFor({ state: "attached" });
    const idMur = await murs.first().getAttribute("data-studio-architecture");
    await flou(page);
    await page.keyboard.press("Shift+Z");
    await page.keyboard.press("h");
    const formOuv = proprietes.locator("[data-studio-architecture-ouverture-formulaire]");
    await formOuv.waitFor();
    for (const [libelle, v] of [["Largeur (m)", "1"], ["Hauteur (m)", "2.1"], ["Allège (m)", "0"]]) await formOuv.getByLabel(libelle, { exact: true }).fill(v);
    await cliquerPlanche(page, 3, 0);
    const ouvs = page.locator('svg [data-studio-architecture][data-studio-type="opening"]');
    await ouvs.first().waitFor({ state: "attached" });
    const idOuv = await ouvs.first().getAttribute("data-studio-architecture");
    check("E2E-03 : mur et ouverture communs posés sur la planche (deux commandes), mur interrompu autour du vide", (await enAttente(page)) === 2 && (await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).count()) === 2);
    await flou(page);
    await page.keyboard.press("Escape");
    const choisir = async (id) => {
      const b = proprietes.locator(`[data-studio-architecture-choisir="${id}"]`);
      if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
      const c = proprietes.locator(`[data-studio-architecture-choisi="${id}"]`);
      await c.waitFor();
      return c;
    };
    const metre = async () => {
      const m = (await choisir(idMur)).locator("[data-studio-architecture-metre]");
      return ["brut", "deduit", "net"].map((k) => Number(0)) && { brut: Number(await m.getAttribute("data-studio-volume-brut")), deduit: Number(await m.getAttribute("data-studio-volume-deduit")), net: Number(await m.getAttribute("data-studio-volume-net")) };
    };
    const proche = (a, b) => Math.abs(a - b) < 1e-9;
    let m0 = await metre();
    check("E2E-03 : métré du mur hôte — brut 3,600 m³, déduction de l'ouverture 0,420 m³, net 3,180 m³", proche(m0.brut, 3.6) && proche(m0.deduit, 0.42) && proche(m0.net, 3.18), court(m0));
    // Contrainte d'hôte : un mur abaissé sous son ouverture est refusé.
    let choisiMur = await choisir(idMur);
    await choisiMur.getByLabel("Hauteur (m)", { exact: true }).fill("2");
    await choisiMur.getByRole("button", { name: "Appliquer", exact: true }).click();
    const alerte = await page.locator(".studio-alert").first().textContent();
    check("E2E-03 : contrainte d'hôte — mur abaissé sous son ouverture refusé, motif affiché, aucune commande ajoutée", /plus haute que le mur hôte/.test(alerte ?? "") && (await enAttente(page)) === 2, alerte);
    // Modification 2D : hauteur du mur portée à 3,20 m depuis le panneau de la planche.
    choisiMur = await choisir(idMur);
    await choisiMur.getByLabel("Hauteur (m)", { exact: true }).fill("3.2");
    await choisiMur.getByRole("button", { name: "Appliquer", exact: true }).click();
    await attendreEnAttente(page, 3);
    m0 = await metre();
    check("E2E-03 : modification 2D — mur porté à 3,20 m : brut 3,840 m³, net 3,420 m³", proche(m0.brut, 3.84) && proche(m0.net, 3.42), court(m0));
    // Modification 3D : l'ouverture choisie dans la vue 3D, élargie à 1,20 m.
    await flou(page);
    await page.keyboard.press("Shift+D");
    await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
    const ids3d = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")));
    check("E2E-03 : la vue 3D porte le même mur et la même ouverture (mêmes identifiants)", JSON.stringify(ids3d) === JSON.stringify([idMur, idOuv]), court(ids3d));
    await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idOuv}"]`).click();
    const choisiOuv = proprietes.locator(`[data-studio-architecture-choisi="${idOuv}"]`);
    await choisiOuv.waitFor();
    await choisiOuv.getByLabel("Largeur (m)", { exact: true }).fill("1.2");
    await choisiOuv.getByRole("button", { name: "Appliquer", exact: true }).click();
    await attendreEnAttente(page, 4);
    await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
    m0 = await metre();
    check("E2E-03 : modification 3D — ouverture élargie à 1,20 m : déduction 0,504 m³, net 3,336 m³ (métré suivi par l'hôte)", proche(m0.deduit, 0.504) && proche(m0.net, 3.336), court(m0));
    // Annuler / rétablir la modification 3D.
    await flou(page);
    await page.keyboard.press("Control+z");
    await attendreEnAttente(page, 3);
    await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
    const mAnnule = await metre();
    await flou(page);
    await page.keyboard.press("Control+y");
    await attendreEnAttente(page, 4);
    await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
    const mRetabli = await metre();
    check("E2E-03 : annuler retire l'élargissement (net 3,420 m³), rétablir le rejoue (net 3,336 m³)", proche(mAnnule.net, 3.42) && proche(mRetabli.net, 3.336), court({ mAnnule, mRetabli }));
    const p6 = await perf(page, "PERF-06");
    check("X.1-09 : PERF-06 (commande d'architecture) émis à l'application du brouillon, outil nommé", p6.length > 0 && p6.every((m) => m.unite === "ms" && m.valeur >= 0 && /^studio\.architecture\./.test(m.etiquettes.outil)), court(p6.slice(0, 2)));
    await flou(page);
    await page.keyboard.press("Shift+D");
    await enregistrer(page);
    let doc = (await A.api("GET", chemin)).revision.document;
    let mur = doc.architecture.find((x) => x.id === idMur), ouv = doc.architecture.find((x) => x.id === idOuv);
    check("E2E-03 : enregistré — mur 3,20 m, ouverture 1,20 m hébergée par ce mur (hôte relu par le serveur)", mur?.height === 3.2 && ouv?.width === 1.2 && ouv?.hostId === idMur, court(doc.architecture));

    // E2E-04 : copie indépendante du mur, puis modification de la copie ; la source n'est pas réécrite.
    await flou(page);
    await page.keyboard.press("Shift+Z");
    await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().click();
    await page.waitForFunction((id) => document.querySelector(`svg [data-studio-architecture="${id}"]`)?.getAttribute("aria-pressed") === "true", idMur);
    await flou(page);
    await page.keyboard.press("d");
    for (const [nom, v] of [["Déplacement X", 0], ["Déplacement Y", 3], ["Copies", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
    await proprietes.getByRole("button", { name: "Copier la sélection", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('svg [data-studio-architecture][data-studio-type="wall"]').length === 2);
    await enregistrer(page);
    doc = (await A.api("GET", chemin)).revision.document;
    const source = JSON.stringify(doc.architecture.filter((x) => x.id === idMur || x.id === idOuv));
    const copie = doc.architecture.find((x) => x.type === "wall" && x.id !== idMur);
    const ouvCopie = doc.architecture.find((x) => x.type === "opening" && x.id !== idOuv);
    check("E2E-04 : copie du mur enregistrée (identité propre, ouverture copiée avec elle)", !!copie && ouvCopie?.hostId === copie.id && JSON.stringify(copie.axis) === JSON.stringify([{ x: 0, y: 3 }, { x: 6, y: 3 }]), court(doc.architecture));
    await page.reload();
    await page.locator(`svg [data-studio-architecture="${copie.id}"]`).waitFor({ state: "attached" });
    await flou(page);
    await page.keyboard.press("Escape");
    const choisiCopie = await choisir(copie.id);
    await choisiCopie.getByLabel("Hauteur (m)", { exact: true }).fill("3.5");
    await choisiCopie.getByLabel("Épaisseur (m)", { exact: true }).fill("0.3");
    await choisiCopie.getByRole("button", { name: "Appliquer", exact: true }).click();
    await attendreEnAttente(page, 1);
    const ouvCopieChoisie = await choisir(ouvCopie.id);
    await ouvCopieChoisie.getByLabel("Largeur (m)", { exact: true }).fill("0.8");
    await ouvCopieChoisie.getByRole("button", { name: "Appliquer", exact: true }).click();
    await attendreEnAttente(page, 2);
    await enregistrer(page);
    doc = (await A.api("GET", chemin)).revision.document;
    const copieRelue = doc.architecture.find((x) => x.id === copie.id), ouvCopieRelue = doc.architecture.find((x) => x.id === ouvCopie.id);
    check("E2E-04 : la copie modifiée dans le parcours (hauteur 3,50 m, épaisseur 0,30 m, son ouverture 0,80 m) est enregistrée",
      copieRelue?.height === 3.5 && copieRelue?.thickness === 0.3 && ouvCopieRelue?.width === 0.8, court([copieRelue, ouvCopieRelue]));
    check("E2E-04 : la source n'est pas réécrite — mur et ouverture d'origine identiques, au champ près, à leur état d'avant la modification de la copie",
      JSON.stringify(doc.architecture.filter((x) => x.id === idMur || x.id === idOuv)) === source, court(doc.architecture.filter((x) => x.id === idMur || x.id === idOuv)));
    await page.locator(`svg [data-studio-architecture="${idMur}"]`).waitFor({ state: "attached" });
    const mSource = await metre();
    check("E2E-04 : le métré de la source est inchangé (net 3,336 m³) après la modification de la copie", proche(mSource.net, 3.336), court(mSource));

    // Conflit : B (éditeur) modifie le mur source sur la tête qu'il a ouverte ; A enregistre entre-temps sur le même mur.
    const teteAvant = (await A.api("GET", chemin)).revision.id;
    await B.page.goto(url);
    await B.page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    await B.page.locator(`svg [data-studio-architecture="${idMur}"]`).waitFor({ state: "attached" });
    const proprietesB = B.page.getByRole("complementary", { name: "Propriétés du dessin" });
    const choisirB = async (id) => {
      const b = proprietesB.locator(`[data-studio-architecture-choisir="${id}"]`);
      if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
      const c = proprietesB.locator(`[data-studio-architecture-choisi="${id}"]`);
      await c.waitFor();
      return c;
    };
    choisiMur = await choisir(idMur);
    await choisiMur.getByLabel("Épaisseur (m)", { exact: true }).fill("0.25");
    await choisiMur.getByRole("button", { name: "Appliquer", exact: true }).click();
    await attendreEnAttente(page, 1);
    await enregistrer(page);
    const teteA = (await A.api("GET", chemin)).revision;
    const murB = await choisirB(idMur);
    await murB.getByLabel("Hauteur (m)", { exact: true }).fill("3.3");
    await murB.getByRole("button", { name: "Appliquer", exact: true }).click();
    await attendreEnAttente(B.page, 1);
    await (await bouton(B.page, "Enregistrer")).click();
    await B.page.locator('[data-studio-hors-ligne="conflit"]').waitFor();
    await B.page.locator("[data-studio-erreur-planche]").filter({ hasText: "Conflit de révision" }).waitFor();
    check("E2E-03 : conflit — B, resté sur l'ancienne tête, est refusé ; la tête de A reste intacte ; le brouillon de B est conservé",
      teteA.parentRevisionId === teteAvant && (await A.api("GET", chemin)).revision.id === teteA.id && (await enAttente(B.page)) === 1);
    const nDialogues = B.dialogues.length;
    await B.page.locator("[data-studio-reporter]").click();
    await B.page.locator(".studio-info").filter({ hasText: "reportée(s) sur la nouvelle version courante" }).waitFor();
    check("E2E-03 : report du conflit — confirmation explicite nommant le mur modifié des deux côtés", B.dialogues.length === nDialogues + 1 && B.dialogues.at(-1).includes(idMur), B.dialogues.at(-1));
    await enregistrer(B.page);
    const teteB = (await A.api("GET", chemin)).revision;
    const murFinal = teteB.document.architecture.find((x) => x.id === idMur);
    const murDeA = teteA.document.architecture.find((x) => x.id === idMur);
    check("E2E-03 : le report confirmé de B est enregistré par-dessus la tête de A (révision fille) ; l'état de A reste relu dans l'historique (épaisseur 0,25 m), rien n'est écrasé en silence",
      teteB.parentRevisionId === teteA.id && murFinal?.height === 3.3 && murDeA?.thickness === 0.25 && murDeA?.height === 3.2
      && (await A.api("GET", `${chemin}/revisions`)).revisions.some((r) => r.id === teteA.id), court({ murFinal, murDeA }));

    // Observation sur le mur (panneau Observations, domaine Documentation).
    await page.goto(url);
    await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().waitFor({ state: "attached" });
    await flou(page);
    await page.keyboard.press("Shift+Z");
    await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().click();
    await page.waitForFunction((id) => document.querySelector(`svg [data-studio-architecture="${id}"]`)?.getAttribute("aria-pressed") === "true", idMur);
    await page.locator("[data-studio-basculer-commentaires]").click();
    const panneau = page.locator("[data-studio-observations]");
    await panneau.waitFor();
    await panneau.locator("[data-studio-suivi-ouvrir]").click();
    const form = panneau.locator("[data-studio-suivi-ouverture]");
    await form.locator("textarea").fill("Hauteur du mur modifiée par report : à vérifier");
    await form.locator("[data-studio-suivi-responsable]").selectOption({ label: A.cred.email });
    await form.locator("[data-studio-suivi-domaine]").selectOption("objet");
    await form.locator("[data-studio-suivi-ref]").selectOption(idMur);
    await form.locator("[data-studio-suivi-envoyer]").click();
    const carteObs = panneau.locator(`[data-studio-suivi]:has([data-domaine="objet"][data-ref="${idMur}"])`);
    await carteObs.waitFor();
    const obsId = await carteObs.getAttribute("data-studio-suivi");
    const obs = await A.api("GET", `${chemin}/observations/${obsId}`);
    check("E2E-03 : observation ouverte sur le mur depuis l'interface — lien « objet » sur ce mur dans la révision courante, contexte de la variante, statut ouverte",
      obs?.liens?.length === 1 && obs.liens[0].domaine === "objet" && obs.liens[0].ref === idMur && obs.liens[0].revisionId === teteB.id && obs.contexte?.variantId === etude.variant.id && obs.statut === "ouverte", court(obs.liens));

    // Approbation et publication (manifeste complet, IFC compris), par l'interface.
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}`);
    const preparer = page.locator("[data-studio-publication-preparer]");
    await preparer.waitFor();
    await preparer.locator("#studio-publication-titre").fill("Parcours C");
    await preparer.getByRole("button", { name: "Préparer la publication" }).click();
    const carte = page.locator("li[data-studio-publication]").filter({ hasText: "Parcours C" });
    await carte.waitFor();
    const pubId = await carte.getAttribute("data-studio-publication");
    for (const action of ["soumettre", "approuver", "diffuser"]) {
      const b = carte.locator(`[data-studio-publication-action="${action}"]`);
      await b.waitFor();
      await b.click();
      const auto = carte.locator(`#studio-publication-auto-case-${pubId}`);
      if (action === "approuver" && await auto.count()) await auto.check();
      await carte.getByRole("button", { name: "Confirmer", exact: true }).click();
      await carte.locator(`[data-studio-publication-action="${action}"]`).waitFor({ state: "detached" });
    }
    await carte.locator("[data-studio-publication-paquet]").waitFor();
    const pub = await A.api("GET", `${racine}/publications/${pubId}`);
    const formats = (pub.diffusion?.files ?? []).map((f) => f.format).sort();
    check("E2E-03 : publication de la révision issue du conflit — approuvée (manifeste lié) puis diffusée par l'interface, paquet SVG / DXF / IFC / PDF",
      pub.revisionId === teteB.id && pub.workStatus === "approuve" && pub.approval?.manifestHash === pub.manifestHash && pub.diffusionStatus === "diffuse" && JSON.stringify(formats) === JSON.stringify(["dxf", "ifc", "pdf", "svg"]), court(pub));
    const ifc = await A.context.request.get(`${BASE}${racine}/publications/${pubId}/files/ifc`);
    const texteIfc = await ifc.text();
    check("E2E-03 : l'IFC diffusé porte le mur et son ouverture (même identité que la planche)", ifc.status() === 200 && /IFCWALL/i.test(texteIfc) && /IFCOPENINGELEMENT/i.test(texteIfc), String(ifc.status()));
    await B.context.close();
  });

  // ——— fin des parties ———
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  console.error(e);
  echecs += 1;
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} contrôle(s) en échec` : "\nRecette D1 : tous les contrôles passent");
process.exit(echecs ? 1 : 0);
