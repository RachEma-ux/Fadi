#!/usr/bin/env node
/**
 * Recette de navigation de Studio sur l'API de Studio V1 (ADR-STUDIO-NAV-01 : NAV-001 à NAV-004, NAV-006, NAV-008,
 * NAV-009 ; R-B adresse inconnue) : entrée de la barre verticale, routes propres sous /studio, aucun passage par le
 * Parcours ni l'Atelier, refus sans divulgation, adresse inconnue explicite, étude et variante créées par
 * l'interface, enregistrement par commandes, historique des révisions ouvert en lecture seule, droits relus par le
 * serveur. API et application construites, même origine, base migrée (schéma Studio dans init.sql, D-A).
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio node apps/web/e2e/studio-navigation.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
const erreurs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const LECTURES_INTERDITES = /\/steps|\/programme|\/atelier\/|\/planche/;

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

async function nouvelUtilisateur(nom, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-${nom}-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-navigation-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()}`);
    return r.json();
  };
  return { context, page, api };
}

/** Titre de l'en-tête de Fadi (il nomme le projet sur les routes Studio d'un projet, NAV-006). */
const titre = (page) => page.locator(".app-topbar h1").first().textContent();

/**
 * Barre compacte (une rangée) : un bouton rangé dans le menu « ▾ » de sa famille ou dans « Plus » existe toujours dans
 * le document (menu fermé = masqué) ; pour l'utiliser, on ouvre d'abord ce menu, comme le ferait l'utilisateur.
 */
async function atteindre(barre, selecteur) {
  const el = barre.locator(selecteur).first();
  await el.waitFor({ state: "attached" });
  if (!(await el.isVisible())) {
    const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
    if (menu) await barre.locator(`[aria-controls="${menu}"]`).click();
    await el.waitFor({ state: "visible" });
  }
  return el;
}
/**
 * Vue 3D et ses panneaux : dans l'espace de travail, les panneaux de la vue (saisie des solides, solides libres, murs et
 * ouvertures, coupe, scènes) sont rendus dans la colonne des panneaux du domaine (portail), plus sous la vue.
 */
const PANNEAUX_3D = "[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]";
/** Bouton (ou lien) de la barre par son nom exact, qu'il soit dans la rangée ou dans un menu. */
const element = (barre, nom) => barre.locator(`:is(button,a)[aria-label="${nom}"]`);
const cliquerBouton = async (barre, nom) => (await atteindre(barre, `:is(button,a)[aria-label="${nom}"]`)).click();

try {
  const a = await nouvelUtilisateur("a");
  const pA = await a.api("post", "/projects", { code: "P.STU.A", name: "Studio — Projet A" });
  const pA2 = await a.api("post", "/projects", { code: "P.STU.B", name: "Studio — Projet B" });
  const b = await nouvelUtilisateur("b");
  const pB = await b.api("post", "/projects", { code: "P.STU.SECRET", name: "Studio — Projet confidentiel" });
  const { page } = a;
  const panneaux3d = page.locator(PANNEAUX_3D);

  // NAV-001 : entrée « Studio » dans la navigation principale, après Projets, icône propre, nom accessible et état actif ;
  // menu dépliable (comme « Projets › ») : accueil, choix d'une étude et les quatre domaines de REF-01 §02.
  await page.goto(`${BASE}/accueil`);
  const entree = page.locator("#workspace-navigation a[data-nav-studio]");
  await entree.waitFor({ state: "visible" }).catch(() => {});
  check("NAV-001 : entrée Studio dans la navigation principale", await entree.isVisible());
  check("NAV-001 : nom accessible et infobulle « Studio »", (await entree.getAttribute("aria-label")) === "Studio" && (await entree.getAttribute("title")) === "Studio");
  const position = await page.evaluate(() => {
    const e = document.querySelector("#workspace-navigation a[data-nav-studio]"), p = document.querySelector("#workspace-navigation .sidebar-projects"), c = document.querySelector('#workspace-navigation a[aria-label="Collaboration"]');
    return { apresProjets: !!(p.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING), avantCollaboration: !!(e.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  check("NAV-001 : Studio placé après Projets (et avant Collaboration)", position.apresProjets && position.avantCollaboration, JSON.stringify(position));
  const bascule = page.locator("[data-studio-menu-lateral-bascule]");
  const sousMenu = page.locator("#studio-menu-domaines");
  check("menu Studio : replié hors de Studio (aria-expanded, chevron)", (await bascule.getAttribute("aria-expanded")) === "false" && !(await sousMenu.isVisible()));
  await bascule.focus();
  await page.keyboard.press("ArrowRight");
  check("menu Studio : flèche droite le déplie (clavier)", (await bascule.getAttribute("aria-expanded")) === "true" && await sousMenu.isVisible());
  const entreesDomaines = await page.locator("[data-studio-menu-domaine]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-studio-menu-domaine"), e.getAttribute("aria-label"), e.getAttribute("title")]));
  check("menu Studio : exactement quatre domaines, dans l'ordre officiel, libellés exacts « 0n · … » (nom accessible et infobulle)", JSON.stringify(entreesDomaines) === JSON.stringify([
    ["dessin", "01 · Dessin et modélisation", "01 · Dessin et modélisation"], ["bim", "02 · BIM et coordination", "02 · BIM et coordination"],
    ["visualisation", "03 · Visualisation, rendu et immersion", "03 · Visualisation, rendu et immersion"], ["documentation", "04 · Documentation, métrés et collaboration", "04 · Documentation, métrés et collaboration"],
  ]), JSON.stringify(entreesDomaines));
  check("menu Studio : accès permanents à l'accueil et au choix des études ; aucune planche en entrée", (await page.locator("[data-studio-menu-accueil]").getAttribute("href")) === "/studio"
    && (await page.locator("[data-studio-menu-etudes]").count()) === 1 && !(((await sousMenu.textContent()) ?? "").match(/Planche|Double vue/)));
  check("menu Studio : hors d'une variante, chaque domaine passe par l'accueil (aucune variante ouverte d'office)", (await page.locator('[data-studio-menu-domaine="bim"]').getAttribute("href")) === "/studio?domaine=bim");
  await page.keyboard.press("ArrowLeft");
  check("menu Studio : flèche gauche le replie", (await bascule.getAttribute("aria-expanded")) === "false" && !(await sousMenu.isVisible()));
  await bascule.click();
  check("menu Studio : un clic le déplie", (await bascule.getAttribute("aria-expanded")) === "true");
  await entree.click();
  await page.waitForURL(`${BASE}/studio`);
  await page.locator('[data-studio="accueil"]').waitFor();
  check("NAV-001 : Studio actif sur ses routes", (await entree.getAttribute("class"))?.includes("active") === true);
  check("NAV-006 : l'entrée Projets n'est pas faussement active", !((await page.locator(".sidebar-projects").getAttribute("class")) ?? "").includes("active"));
  check("NAV-006 : titre de page « Studio »", (await page.locator(".app-topbar h1").textContent())?.trim() === "Studio");
  check("accueil : aucune suggestion de reprise pour un compte neuf, aucune redirection", (await page.locator("[data-studio-reprendre]").count()) === 0 && page.url() === `${BASE}/studio`);

  // NAV-003 : choix explicite du projet, rien n'est créé à l'ouverture.
  const liste = page.locator("[data-studio-projets] button");
  await liste.first().waitFor();
  const textes = await liste.allTextContents();
  check("NAV-003 : les projets autorisés sont proposés, sans projet d'autrui", textes.some((t) => t.includes("P.STU.A")) && textes.some((t) => t.includes("P.STU.B")) && !textes.some((t) => t.includes("P.STU.SECRET")));
  check("NAV-003 : aucun projet créé par l'ouverture de Studio", (await a.api("get", "/projects")).length === 2);
  check("NAV-003 : « Nouvelle étude » proposée, sans choix de planche (la planche se choisit dans le domaine 01)", (await page.locator("[data-studio-creer-etude]").count()) === 1 && (await page.locator("[data-studio-creer-etude] [data-studio-planche-depart]").count()) === 0);

  // NAV-002 : ouverture d'un projet sans passer par le Parcours ni l'Atelier.
  const requetes = [];
  page.on("request", (r) => requetes.push(new URL(r.url()).pathname));
  await liste.filter({ hasText: "P.STU.A" }).click();
  await page.locator(`[data-studio-lanceur-etudes="${pA.id}"] [data-studio-aucune-etude]`).waitFor();
  check("NAV-003 : le projet choisi montre ses études (aucune), choix explicite", (await liste.filter({ hasText: "P.STU.A" }).getAttribute("aria-pressed")) === "true");
  await page.locator(`[data-studio-lanceur-etudes="${pA.id}"] [data-studio-gerer-etudes]`).click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}`);
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  await page.locator("[data-studio-aucune-etude]").waitFor();
  const parcours = requetes.filter((p) => LECTURES_INTERDITES.test(p));
  check("NAV-002 : aucune lecture du Parcours, du programme ni de l'Atelier", parcours.length === 0, parcours.join(", "));
  check("NAV-006 : l'en-tête de Fadi nomme le bon projet ; le fil d'Ariane ne le répète pas", (await titre(page)).includes("P.STU.A") && (await page.locator(".studio-fil").textContent()).includes("Études")
    && !(await page.locator(".studio-fil").textContent()).includes("P.STU.A"));
  check("NAV-008 : barre latérale visible, aucun mode immersif", (await page.locator(".app-sidebar").isVisible()) && !(await page.evaluate(() => document.body.classList.contains("atelier-immersive"))));
  check("NAV-006 : Studio reste actif, Projets non", (await entree.getAttribute("class"))?.includes("active") === true && !((await page.locator(".sidebar-projects").getAttribute("class")) ?? "").includes("active"));
  check("menu Studio : « Choisir une étude » désigne la page du projet affiché", (await page.locator("[data-studio-menu-etudes]").getAttribute("aria-current")) === "page");

  // NAV-004 : actualisation, précédent / suivant, ouverture directe.
  await page.reload();
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  check("NAV-004 : l'actualisation restitue le même projet", page.url() === `${BASE}/studio/projets/${pA.id}`);
  await page.goBack();
  await page.locator('[data-studio="accueil"]').waitFor();
  await page.goForward();
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  check("NAV-004 : précédent / suivant conservent le contexte", page.url() === `${BASE}/studio/projets/${pA.id}`);
  await page.goto(`${BASE}/studio/projets/${pA2.id}`);
  await page.locator(`[data-studio-projet="${pA2.id}"]`).waitFor();
  check("NAV-004 : ouverture directe par l'adresse", (await titre(page)).includes("P.STU.B"));

  // NAV-004 : un lien interdit ne divulgue rien.
  await page.goto(`${BASE}/studio/projets/${pB.id}`);
  await page.locator('[data-studio-refus="projet"]').waitFor();
  const contenu = await page.locator("#workspace-content").textContent();
  check("NAV-004 : projet d'autrui refusé sans divulguer son code ni son nom", !contenu.includes("P.STU.SECRET") && !contenu.includes("confidentiel"));
  check("NAV-004 : refus sans redirection silencieuse", page.url() === `${BASE}/studio/projets/${pB.id}`);

  // R-B : adresse inconnue, écran explicite, pas le repli vers /accueil.
  await page.goto(`${BASE}/studio/inconnu`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("adresse Studio inconnue : écran explicite, adresse conservée", page.url() === `${BASE}/studio/inconnu`);
  await page.screenshot({ path: join(OUT, "studio-inconnue.png") });
  await page.goto(`${BASE}/studio/projets/${pA.id}?vue=x`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("paramètre inconnu sur un projet : adresse non reconnue, conservée", page.url().endsWith("?vue=x"));

  // Étude : « Nouvelle étude » en tête de la page du projet ; elle ouvre l'espace de sa variante initiale.
  await page.goto(`${BASE}/studio/projets/${pA.id}`);
  await page.locator("[data-studio-aucune-etude]").waitFor();
  const boutonNouvelle = page.locator(".studio-page-entete [data-studio-nouvelle-etude]");
  check("page du projet : « Nouvelle étude » est l'action principale de l'en-tête de page", await boutonNouvelle.isVisible());
  await boutonNouvelle.click();
  await page.getByLabel("Nom de l’étude", { exact: true }).fill("Implantation nord");
  requetes.length = 0;
  await page.locator('[data-studio-creer-etude] [data-studio-ouvrir-etude]').click();
  await page.waitForURL(new RegExp(`/studio/projets/${pA.id}/etudes/[^/]+/variantes/[^/?]+$`));
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const [, , , , , studyId, , initialVariantId] = new URL(page.url()).pathname.split("/");
  check("étude : la création ouvre l'espace de la variante initiale, nommée dans le titre et le fil", (await page.getByRole("heading", { level: 1 }).last().textContent()) === "Implantation nord" && (await page.locator(".studio-fil").textContent()).includes("Implantation nord"));
  check("étude : aucune lecture du Parcours ni de l'Atelier", requetes.filter((p) => LECTURES_INTERDITES.test(p)).length === 0, requetes.join(" "));
  const etudes = await a.api("get", `/projects/${pA.id}/studio/studies`);
  check("étude : listée par l'API avec sa variante initiale", etudes.studies.length === 1 && etudes.studies[0].id === studyId && etudes.studies[0].initialVariantId === initialVariantId);

  // Page de l'étude par le fil d'Ariane ; création d'une variante par l'interface.
  await page.locator(".studio-fil a", { hasText: "Implantation nord" }).click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await page.locator(`[data-studio-etude="${studyId}"]`).waitFor();
  check("étude : sa page liste la variante initiale", (await page.locator("[data-studio-variantes] li").count()) === 1);
  await page.reload();
  await page.locator(`[data-studio-etude="${studyId}"]`).waitFor();
  check("étude : l'actualisation restitue l'étude", page.url() === `${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await page.getByLabel("Nom de la variante", { exact: true }).fill("Variante nord");
  requetes.length = 0;
  await page.locator('[data-studio-creer-variante] button').click();
  await page.waitForURL(new RegExp(`/etudes/${studyId}/variantes/(?!${initialVariantId}$)[^/?]+$`));
  const variantId = new URL(page.url()).pathname.split("/").pop();
  await page.locator(`[data-studio-variante="${variantId}"]`).getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  check("variante : la création ouvre son espace, nommée dans le fil avec sa révision", (await page.locator(".studio-fil").textContent()).includes("Variante nord") && (await page.locator("[data-studio-fil-revision]").count()) === 1);
  check("variante : document vide à la création", (await page.locator('svg [role="button"]').count()) === 0);
  check("variante : aucune lecture ni écriture du Parcours, de l'Atelier ou de la Planche", requetes.filter((p) => LECTURES_INTERDITES.test(p)).length === 0, requetes.join(" "));
  const detail = await a.api("get", `/projects/${pA.id}/studio/studies/${studyId}`);
  check("variante : l'étude en compte deux côté serveur", detail.variants.length === 2 && detail.variants.some((v) => v.id === variantId && v.name === "Variante nord"));

  // Enregistrement par commandes : un rectangle saisi, une révision de plus dans l'historique.
  // Palette de Dessin et modélisation et barre de l'espace (Annuler, Rétablir, Enregistrer, Outils, palette Ctrl+K).
  const outils = page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  await cliquerBouton(outils, "Rectangle");
  for (const [nom, v] of [["X", 2], ["Y", 2], ["Largeur", 4], ["Hauteur", 3]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await cliquerBouton(outils, "Enregistrer");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const historique = page.locator("[data-studio-revisions] li[data-studio-revision]");
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-revisions] li[data-studio-revision]").length === 2);
  const revisions = await a.api("get", `/projects/${pA.id}/studio/studies/${studyId}/variants/${variantId}/revisions`);
  const ids = await historique.evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-revision")));
  check("historique : deux révisions, de la plus récente à la plus ancienne, comme l'API", revisions.revisions.length === 2 && ids.join() === revisions.revisions.map((r) => r.id).join());
  check("historique : la plus récente est la version courante", (await historique.first().getAttribute("data-studio-revision-tete")) === "true");

  // Révision passée : lecture seule par ?revision=, aucun enregistrement possible, retour à la version courante.
  // L'historique des révisions est un panneau de « Documentation, métrés et collaboration ».
  const ancienne = revisions.revisions[1].id;
  await page.locator('[data-studio-domaine-lien="documentation"]').click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}?domaine=documentation`);
  await historique.nth(1).locator("a:not([data-studio-comparer-tete])").click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}?revision=${encodeURIComponent(ancienne)}&domaine=documentation`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  check("révision passée : document d'origine (vide), lecture seule, enregistrement désactivé", (await page.locator('svg [role="button"]').count()) === 0 && (await element(outils, "Enregistrer").isDisabled()));
  await page.reload();
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  check("révision passée : l'actualisation restitue la même révision", page.url().endsWith(`?revision=${encodeURIComponent(ancienne)}&domaine=documentation`));
  await page.screenshot({ path: join(OUT, "studio-revision.png") });
  await page.locator("[data-studio-lecture-seule-revision] a").click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}?domaine=documentation`);
  await page.locator('svg [role="button"][aria-label^="Rectangle "]').waitFor({ state: "attached" });
  check("version courante : le rectangle enregistré est relu", (await page.locator('svg [role="button"]').count()) === 1);
  const base = `${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}`;
  await page.goto(`${base}?revision=revision-inexistante`);
  await page.locator('[data-studio-refus="revision"]').waitFor();
  check("révision inconnue : refus explicite, adresse conservée", page.url().endsWith("?revision=revision-inexistante"));
  await page.goto(`${base}?revision=${encodeURIComponent(ancienne)}&revision=${encodeURIComponent(ancienne)}`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("révision répétée : adresse non reconnue", true);
  // Domaine et planche (I.4-03, contrat proposé) : valeur inconnue ou planche hors de « dessin » → adresse non
  // reconnue, aucun choix factice ; les valeurs admises sont éprouvées par studio-domaines.mjs.
  for (const q of ["?domaine=inconnu", "?planche=3d", "?domaine=bim&planche=3d"]) {
    await page.goto(`${base}${q}`);
    await page.locator("[data-studio-inconnue]").waitFor();
    check(`paramètre de domaine non admis (${q}) : adresse non reconnue, conservée`, page.url().endsWith(q));
  }

  // Refus croisés et lecteur.
  await page.goto(`${BASE}/studio/projets/${pA2.id}/etudes/${studyId}`);
  await page.locator('[data-studio-refus="etude"]').waitFor();
  check("étude ouverte sous un autre projet : refusée sans divulgation", !(await page.locator("#workspace-content").textContent()).includes("Implantation nord"));
  await page.goto(`${BASE}/studio/projets/${pA2.id}/etudes/${studyId}/variantes/${variantId}`);
  await page.locator('[data-studio-refus="variante"]').waitFor();
  check("variante ouverte sous un autre projet : refusée sans divulgation", !(await page.locator("#workspace-content").textContent()).includes("Variante nord"));
  await b.page.goto(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await b.page.locator("[data-studio-refus]").waitFor();
  check("étude d'autrui : non divulguée", !(await b.page.locator("#workspace-content").textContent()).includes("Implantation nord"));
  const emailB = await b.page.evaluate(async () => (await (await fetch("/auth/me", { credentials: "include" })).json()).email);
  check("B invité lecteur, invitation acceptée (phase 3)", (await inviterEtAccepter(appelPlaywright(a.page.request, BASE), appelPlaywright(b.page.request, BASE), pA.id, emailB, "lecteur")).ok);
  await b.page.goto(`${BASE}/studio/projets/${pA.id}`);
  await b.page.locator("[data-studio-etudes]").waitFor();
  check("lecteur : voit les études sans formulaire de création", (await b.page.locator("[data-studio-lecture-seule]").isVisible()) && (await b.page.locator("[data-studio-creer-etude]").count()) === 0);
  await b.page.goto(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await b.page.locator("[data-studio-variantes]").waitFor();
  check("lecteur : voit les variantes sans formulaire de création", (await b.page.locator("[data-studio-creer-variante]").count()) === 0);
  await b.page.goto(base);
  await b.page.locator("[data-studio-lecture-seule]").waitFor();
  check("lecteur : la variante s'ouvre en lecture seule", await element(b.page.getByRole("toolbar", { name: "Actions de l’espace" }), "Enregistrer").isDisabled());

  // Étapes du Parcours liées : choix multiple sur la page de l'étude (libellés du serveur, ceux des étapes du projet),
  // enregistrées par la route Studio ; le lecteur voit sans modifier.
  await page.goto(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  const choixEtapes = page.locator("[data-studio-etapes-liees] [data-studio-etape]");
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-etapes-liees] [data-studio-etape]").length === 21);
  const etapesProjet = await a.api("get", `/projects/${pA.id}/steps`);
  const libelles = await choixEtapes.evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  check("étapes liées : les 21 étapes du projet proposées avec leurs libellés du Parcours (numéro, titre, phase)", libelles.length === 21 && etapesProjet.every((s, i) => libelles[i] === `${String(s.number).padStart(2, "0")} ${s.title} ${s.phase}`), `${libelles[0]} | ${etapesProjet[0]?.title}`);
  check("étapes liées : aucune cochée au départ, enregistrement inactif", (await page.locator("[data-studio-etapes-liees] input:checked").count()) === 0 && (await page.locator("[data-studio-enregistrer-etapes]").isDisabled()));
  await page.locator('[data-studio-etape="2"] input').check();
  await page.locator('[data-studio-etape="5"] input').check();
  await page.locator("[data-studio-enregistrer-etapes]").click();
  await page.locator("[data-studio-etapes-liees] [role=status]").filter({ hasText: "Étapes liées enregistrées." }).waitFor();
  const liees = await a.api("get", `/projects/${pA.id}/studio/studies/${studyId}/steps`);
  check("étapes liées : 02 et 05 enregistrées côté serveur", JSON.stringify(liees.steps.map((x) => x.number)) === "[2,5]");
  await page.reload();
  await page.locator('[data-studio-etape="5"] input:checked').waitFor();
  check("étapes liées : l'actualisation relit 02 et 05 cochées", (await page.locator("[data-studio-etapes-liees] input:checked").count()) === 2);
  await b.page.goto(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await b.page.locator("[data-studio-etapes-lecture-seule]").waitFor();
  // Les liens arrivent par une requête : attendre qu'ils soient affichés avant de les compter.
  await b.page.locator("[data-studio-etapes-liees] input:checked").nth(1).waitFor({ timeout: 15000 }).catch(() => {});
  check("étapes liées : le lecteur voit les étapes cochées sans pouvoir modifier", (await b.page.locator("[data-studio-etapes-liees] input:checked").count()) === 2 && (await b.page.locator("[data-studio-etapes-liees] input").first().isDisabled()) && (await b.page.locator("[data-studio-enregistrer-etapes]").count()) === 0);

  // Étape du Parcours : bloc « Études Studio liées » seulement sur une étape liée ; le lien ouvre l'étude dans Studio.
  const etudesDeLEtape = (n) => page.waitForResponse((r) => new URL(r.url()).pathname === `/projects/${pA.id}/studio/steps/${n}/studies`);
  let reponseEtape = etudesDeLEtape(3);
  await page.goto(`${BASE}/projets/${pA.id}?module=parcours&etape=3`);
  await reponseEtape;
  await page.locator(".step-comments").waitFor();
  check("étape 03 non liée : aucun bloc « Études Studio liées »", (await page.locator("[data-studio-etudes-liees]").count()) === 0);
  reponseEtape = etudesDeLEtape(2);
  await page.goto(`${BASE}/projets/${pA.id}?module=parcours&etape=2`);
  await reponseEtape;
  const bloc = page.locator('[data-studio-etudes-liees="2"]');
  await bloc.waitFor();
  check("étape 02 liée : bloc « Études Studio liées » avec l'étude nommée", (await bloc.locator("h3").textContent()) === "Études Studio liées" && (await bloc.locator(`a[data-studio-etude-liee="${studyId}"]`).textContent()) === "Implantation nord");
  await page.screenshot({ path: join(OUT, "parcours-etudes-studio-liees.png") });
  await bloc.locator("a").click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await page.locator(`[data-studio-etude="${studyId}"]`).waitFor();
  check("étape 02 → étude Studio : la page de l'étude s'ouvre", true);

  // Notification : un commentaire du lecteur sur la variante est signalé au propriétaire ; le lien ouvre la variante,
  // panneau des commentaires ouvert (?commentaires=ouverts).
  await b.api("post", `/projects/${pA.id}/studio/studies/${studyId}/variants/${variantId}/comments`, { body: "Remarque du lecteur sur la variante" });
  await page.goto(`${BASE}/accueil`);
  await page.locator(".notification-bell > button").click();
  const note = page.locator('.notification-incoming .notification-list li[data-kind="commentaire-studio"]').first();
  await note.waitFor();
  check("notification : commentaire Studio du lecteur signalé au propriétaire", (await note.textContent()).includes(`${emailB} a commenté la variante « Variante nord » de l’étude Studio « Implantation nord » (P.STU.A) : « Remarque du lecteur sur la variante »`), await note.textContent());
  await note.locator("a").click();
  // Le panneau des commentaires appartient à Documentation : le lien de notification y ouvre la variante.
  await page.waitForURL(`${base}?commentaires=ouverts&domaine=documentation`);
  await page.locator("#studio-commentaires").waitFor();
  // Les commentaires se chargent après l'ouverture du panneau : on attend leur affichage plutôt que de lire tout de suite.
  await page.locator("#studio-commentaires").filter({ hasText: "Remarque du lecteur sur la variante" }).waitFor().catch(() => {});
  check("notification → variante, panneau des commentaires ouvert", (await page.locator("[data-studio-basculer-commentaires]").getAttribute("aria-pressed")) === "true" && (await page.locator("#studio-commentaires").textContent()).includes("Remarque du lecteur sur la variante"));

  // Planche 2D : ligne, cote associative accrochée, déplacement (la cote suit), suppression (cote « à résoudre »),
  // calque créé puis masqué, annuler / rétablir, enregistrement (un seul lot, même requestId au nouvel essai),
  // actualisation identique, conflit de révision sans écrasement.
  await page.goto(base);
  await page.locator('svg [role="button"][aria-label^="Rectangle "]').waitFor({ state: "attached" });
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  const cliquer = async (x, y) => {
    // Le point visé est ramené dans la fenêtre avant le clic (la planche peut dépasser la hauteur de l'écran).
    const p = await planche.evaluate((svg, w) => {
      const ecran = () => new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM());
      const s = ecran();
      if (s.y < 40 || s.y > window.innerHeight - 40) window.scrollBy(0, s.y - window.innerHeight / 2);
      const t = ecran();
      return { x: t.x, y: t.y };
    }, { x, y });
    await page.mouse.click(p.x, p.y);
  };
  const lignes = page.locator('svg [role="button"][aria-label^="Ligne "]');
  const cote = page.locator("svg [data-studio-cote]");
  await cliquerBouton(outils, "Ligne");
  await cliquer(2, 8);
  await cliquer(6, 8);
  // Le pointeur est arrondi au pixel puis au centimètre : on compare à la géométrie tracée, pas aux points visés.
  const geometrie = () => lignes.locator("line").evaluate((l) => ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))));
  const tracee = await geometrie();
  check("planche : deux clics tracent une ligne", (await lignes.count()) === 1 && Math.abs(tracee[0] - 2) < 0.05 && Math.abs(tracee[2] - 6) < 0.05, tracee.join(" "));
  const longueur = Math.hypot(tracee[2] - tracee[0], tracee[3] - tracee[1]);
  await page.keyboard.press("Shift+C");
  check("planche : Maj+C choisit l'outil Cote", (await element(outils, "Cote").getAttribute("aria-pressed")) === "true");
  await cliquer(2.08, 8.06);
  await cliquer(5.93, 7.95);
  await cote.waitFor({ state: "attached" });
  const texte = (await cote.locator("text").textContent()) ?? "";
  check("cote : accrochée aux extrémités, valeur mesurée affichée en mètres", (await cote.getAttribute("data-studio-cote-valeur")) === longueur.toFixed(3) && texte === `${longueur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m` && /^\d+,\d{2,3} m$/.test(texte) && (await cote.getAttribute("data-studio-cote-etat")) === "resolue", texte);
  await cliquerBouton(outils, "Sélection");
  await lignes.press("Enter");
  await cliquerBouton(outils, "Déplacer");
  for (const [nom, v] of [["Déplacement X", 1], ["Déplacement Y", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Déplacer la sélection", exact: true }).click();
  const attache = cote.locator(".studio-cote-attache").first();
  const deplacee = await geometrie();
  const suivi = [await attache.getAttribute("x1"), await attache.getAttribute("y1")].map(Number);
  check("cote associative : elle suit la ligne déplacée",
    Math.abs(deplacee[0] - tracee[0] - 1) < 1e-9 && Math.abs(deplacee[1] - tracee[1] - 1) < 1e-9 && suivi[0] === deplacee[0] && suivi[1] === deplacee[1] && (await cote.getAttribute("data-studio-cote-valeur")) === longueur.toFixed(3),
    `${deplacee.join(" ")} / ${suivi.join(" ")}`);
  await page.keyboard.press("Delete");
  await page.locator("[data-studio-cotes-a-resoudre]").waitFor();
  check("suppression (Suppr) : la ligne disparaît, la cote passe « à résoudre »", (await lignes.count()) === 0 && (await cote.getAttribute("data-studio-cote-etat")) === "a-resoudre" && (await cote.locator("text").textContent()) === "à résoudre");
  await cliquerBouton(outils, "Nouveau calque");
  const rangees = page.locator("[data-studio-calque-ligne]");
  check("calques : « Nouveau calque » ajoute un calque, devenu actif", (await rangees.count()) === 2 && (await rangees.nth(1).getAttribute("aria-current")) === "true");
  const calqueId = await rangees.nth(1).getAttribute("data-studio-calque-ligne");
  await cliquerBouton(outils, "Rectangle");
  for (const [nom, v] of [["X", 10], ["Y", 10], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  const surCalque = page.locator(`svg [data-studio-calque="${calqueId}"]`);
  check("calques : le rectangle est posé sur le calque actif", (await surCalque.count()) === 1);
  await rangees.nth(1).getByLabel("Visible", { exact: true }).uncheck();
  check("calques : un calque masqué n'est pas dessiné", (await surCalque.count()) === 0);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  check("annuler (Ctrl+Z) : le calque redevient visible", (await surCalque.count()) === 1);
  await page.keyboard.press("Control+y");
  check("rétablir (Ctrl+Y) : le calque est de nouveau masqué", (await surCalque.count()) === 0);
  const envois = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/studio\/studies\/[^/]+\/variants\/[^/]+\/commands$/.test(new URL(r.url()).pathname)) envois.push(r.postDataJSON()); });
  // A.5-11 : ordre observé des échanges — lectures dérivées (historique, étude) relues seulement après l'accusé du
  // serveur d'un lot confirmé ; un envoi sans réponse (coupure) n'en déclenche aucune.
  const ordreEngagement = [];
  const lectureDerivee = (r) => r.method() === "GET" && /\/studio\/studies\/[^/]+(\/variants\/[^/]+\/revisions)?$/.test(new URL(r.url()).pathname);
  const estLot = (r) => r.method() === "POST" && /\/studio\/studies\/[^/]+\/variants\/[^/]+\/commands$/.test(new URL(r.url()).pathname);
  const surDemande = (r) => { if (lectureDerivee(r)) ordreEngagement.push("relecture"); else if (estLot(r)) ordreEngagement.push("envoi"); };
  const surReponse = (r) => { if (estLot(r.request())) ordreEngagement.push(`accuse-${r.status()}`); };
  const surEchec = (r) => { if (estLot(r)) ordreEngagement.push("coupure"); };
  page.on("request", surDemande); page.on("response", surReponse); page.on("requestfailed", surEchec);
  let coupe = false;
  await page.route("**/commands", (route) => { if (!coupe) { coupe = true; return route.abort("failed"); } return route.continue(); });
  await page.keyboard.press("Control+s");
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "Confirmation serveur indisponible" }).waitFor();
  const apresCoupure = [...ordreEngagement];
  await cliquerBouton(outils, "Réessayer la sauvegarde");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  await page.waitForTimeout(500);
  page.off("request", surDemande); page.off("response", surReponse); page.off("requestfailed", surEchec);
  const iAccuse = ordreEngagement.indexOf("accuse-200");
  check("A.5-11 : invalidations après engagement — aucune relecture dérivée après la coupure ; relectures seulement après l'accusé 200 du lot",
    JSON.stringify(apresCoupure) === JSON.stringify(["envoi", "coupure"]) && iAccuse > 0 && !ordreEngagement.slice(0, iAccuse).includes("relecture") && ordreEngagement.slice(iAccuse + 1).includes("relecture"),
    ordreEngagement.join(" "));
  await page.unroute("**/commands");
  const enveloppe = envois[0];
  check("enregistrement (Ctrl+S) : un lot de commandes studio-commands/1 sur la tête", envois.length === 2 && enveloppe.contractVersion === "studio-commands/1" && enveloppe.commands.map((c) => c.toolId).join() === "studio.dessin.ligne,studio.dessin.cote,studio.dessin.deplacer,studio.dessin.supprimer,studio.calque.creer,studio.dessin.rectangle,studio.calque.modifier", enveloppe.commands.map((c) => c.toolId).join());
  check("nouvel essai : même requestId, même contenu", envois[1].requestId === enveloppe.requestId && JSON.stringify(envois[1]) === JSON.stringify(enveloppe));
  check("après enregistrement : annuler ne porte que sur les modifications non enregistrées", await element(outils, "Annuler").isDisabled());
  const variantePath = `/projects/${pA.id}/studio/studies/${studyId}/variants/${variantId}`;
  const enregistre = await a.api("get", variantePath);
  const empreinte = () => page.locator("svg [role=button]").evaluateAll((els) => els.map((e) => [e.getAttribute("aria-label"), e.getAttribute("data-studio-calque"), e.getAttribute("data-studio-cote-etat"), e.innerHTML]).join("|"));
  const avant = await empreinte();
  await page.reload();
  await page.locator("[data-studio-cotes-a-resoudre]").waitFor();
  const relu = await a.api("get", variantePath);
  check("actualisation : document et planche identiques", JSON.stringify(relu.revision) === JSON.stringify(enregistre.revision) && (await empreinte()) === avant && (await surCalque.count()) === 0 && !(await page.locator(`[data-studio-calque-ligne="${calqueId}"]`).getByLabel("Visible", { exact: true }).isChecked()));
  const doc = relu.revision.document;
  check("document enregistré : cote à résoudre, calque masqué, rectangle sur ce calque", doc.dimensions?.length === 1 && doc.dimensions[0].toResolve === true && doc.layers?.some((l) => l.id === calqueId && l.visible === false) && doc.objects.some((o) => o.layerId === calqueId));
  // Conflit : la tête avance ailleurs ; l'enregistrement de l'interface est refusé sans rien écraser.
  await cliquerBouton(outils, "Ligne");
  await cliquer(1, 12);
  await cliquer(4, 12);
  const autre = await a.api("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `autre-${Date.now()}`, baseRevisionId: relu.revision.id, commands: [{ toolId: "studio.dessin.ligne", params: { id: `autre-${Date.now()}`, type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] });
  await page.keyboard.press("Control+s");
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "Conflit de révision" }).waitFor();
  const apres = await a.api("get", variantePath);
  check("conflit : message, brouillon conservé, rechargement proposé, tête non écrasée", apres.revision.id === autre.revision.id && (await lignes.count()) === 1 && (await page.getByRole("button", { name: "Recharger la version serveur", exact: true }).isVisible()));
  await page.screenshot({ path: join(OUT, "studio-planche-2d.png") });

  // Vue : zoom (touche « = », bouton, molette sur le pointeur) et panoramique (bouton du milieu) sans toucher au
  // document ; sélection par rectangle (fenêtre / capture), Ctrl+A, Échap ; glisser de la sélection (aperçu, une
  // commande par objet, enregistrée, relue identique) ; palette Ctrl+K ; gestionnaire « Outils » ; liens d'export.
  await page.goto(base);
  await page.locator('svg [role="button"][aria-label^="Rectangle "]').first().waitFor({ state: "attached" });
  const teteAvantVue = (await a.api("get", variantePath)).revision;
  // Commandes en attente (barre d'état) : « (n commande(s) » reconstitué depuis le nombre exact affiché.
  const portee = async () => `(${await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre")} commande(s) en attente)`;
  const vueBox = async () => (await planche.getAttribute("viewBox")).split(" ").map(Number);
  const ecranDe = (x, y) => planche.evaluate((svg, w) => { const t = new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM()); return { x: t.x, y: t.y }; }, { x, y });
  const sousEcran = (p) => planche.evaluate((svg, q) => { const t = new DOMPoint(q.x, q.y).matrixTransform(svg.getScreenCTM().inverse()); return { x: t.x, y: t.y }; }, p);
  const vueChangee = (avant) => page.waitForFunction((v) => document.querySelector('[aria-label="Planche de dessin 2D"]')?.getAttribute("viewBox") !== v, avant.join(" "));
  await page.evaluate(() => document.activeElement?.blur());
  const vb0 = await vueBox();
  await page.keyboard.press("=");
  await vueChangee(vb0);
  const vb1 = await vueBox();
  check("vue : « = » rapproche la vue (zoom avant)", vb1[2] < vb0[2] && Math.abs(vb1[2] / vb1[3] - vb0[2] / vb0[3]) < 1e-9, `${vb0.join(" ")} → ${vb1.join(" ")}`);
  await cliquerBouton(outils, "Zoom arrière");
  const vb2 = await vueBox();
  check("vue : « Zoom arrière » éloigne la vue", Math.abs(vb2[2] - vb0[2]) < 1e-9, vb2.join(" "));
  await planche.scrollIntoViewIfNeeded();
  const boite = await planche.boundingBox();
  const pointeur = { x: boite.x + boite.width * 0.3, y: boite.y + boite.height * 0.4 };
  const sousAvant = await sousEcran(pointeur);
  await page.mouse.move(pointeur.x, pointeur.y);
  await page.mouse.wheel(0, -300);
  await vueChangee(vb2);
  const vb3 = await vueBox(), sousApres = await sousEcran(pointeur);
  check("vue : la molette zoome en gardant le point sous le pointeur", vb3[2] < vb2[2] && Math.hypot(sousApres.x - sousAvant.x, sousApres.y - sousAvant.y) < 0.02, `${JSON.stringify(sousAvant)} / ${JSON.stringify(sousApres)}`);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(pointeur.x + 80, pointeur.y + 40, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  const vb4 = await vueBox();
  check("vue : le bouton du milieu déplace la vue sans zoomer", Math.abs(vb4[2] - vb3[2]) < 1e-9 && vb4[0] < vb3[0] && vb4[1] < vb3[1], `${vb3.join(" ")} → ${vb4.join(" ")}`);
  check("vue : zoom et panoramique ne changent pas le document", (await portee()).includes("(0 commande(s)") && (await a.api("get", variantePath)).revision.id === teteAvantVue.id);

  await cliquerBouton(outils, "Cadrer");
  await planche.scrollIntoViewIfNeeded();
  const choisis = page.locator("svg .selected");
  const glisser = async ([x0, y0], [x1, y1], avantRelache) => {
    const p = await ecranDe(x0, y0), q = await ecranDe(x1, y1);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
    await page.mouse.move(q.x, q.y, { steps: 4 });
    if (avantRelache) await avantRelache();
    await page.mouse.up();
  };
  const visibles = teteAvantVue.document.objects.filter((o) => !o.layerId);
  const rect0 = visibles.find((o) => o.type === "rectangle"), ligne0 = visibles.find((o) => o.type === "line");
  check("préparation : un rectangle et une ligne sur le calque visible", !!rect0 && !!ligne0 && rect0.origin.x === 2 && ligne0.start.x === 0);
  await glisser([5.5, 1], [7, 2.5]);
  check("rectangle de gauche à droite (fenêtre) : un objet coupé n'est pas pris", (await choisis.count()) === 0);
  await glisser([7, 1], [5.5, 2.5]);
  check("rectangle de droite à gauche (capture) : l'objet touché est pris", (await choisis.count()) === 1 && (await page.locator(`[data-studio-objet="${rect0.id}"]`).getAttribute("aria-pressed")) === "true");
  await glisser([-0.5, -0.5], [6.5, 5.5]);
  check("rectangle de sélection (fenêtre) : deux objets sélectionnés", (await choisis.count()) === 2 && (await page.locator("[data-studio-selection-compte]").getAttribute("data-studio-selection-compte")) === "2");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+a");
  const selectionnables = await page.locator("svg [data-studio-selectionnable]").count();
  check("Ctrl+A : tout ce qui est affiché et déverrouillé est sélectionné", (await choisis.count()) === selectionnables && selectionnables >= 3);
  await page.keyboard.press("Escape");
  check("Échap : la sélection est vidée", (await choisis.count()) === 0);
  await glisser([-0.5, -0.5], [6.5, 5.5]);
  await page.keyboard.press("F9");
  check("F9 : l'accrochage à la grille est activé", (await element(outils, "Accrocher à la grille").getAttribute("aria-pressed")) === "true");
  const rectangleAffiche = page.locator(`[data-studio-objet="${rect0.id}"] rect`);
  let apercuX = null;
  await glisser([4.1, 3.3], [5.1, 4.3], async () => { apercuX = await rectangleAffiche.getAttribute("x"); });
  check("glisser : aperçu pendant le geste", apercuX === "3", String(apercuX));
  check("glisser : une commande en attente par objet déplacé", (await portee()).includes("(2 commande(s)"));
  const avantGlisser = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiGlisser = envois[envois.length - 1];
  check("glisser : enregistré en deux commandes studio.dessin.deplacer", envois.length === avantGlisser + 1 && envoiGlisser.commands.map((c) => `${c.toolId}:${c.params.id}:${c.params.dx},${c.params.dy}`).sort().join() === [`studio.dessin.deplacer:${ligne0.id}:1,1`, `studio.dessin.deplacer:${rect0.id}:1,1`].sort().join(), JSON.stringify(envoiGlisser?.commands));
  const deplace = await a.api("get", variantePath);
  const rect1 = deplace.revision.document.objects.find((o) => o.id === rect0.id), ligne1 = deplace.revision.document.objects.find((o) => o.id === ligne0.id);
  check("glisser : le serveur a déplacé les deux objets de (1, 1)", rect1.origin.x === 3 && rect1.origin.y === 3 && ligne1.start.x === 1 && ligne1.start.y === 1 && ligne1.end.x === 2);
  const empreinteGlisser = await empreinte();
  await page.reload();
  await rectangleAffiche.waitFor({ state: "attached" });
  check("glisser : l'actualisation restitue le même dessin", (await empreinte()) === empreinteGlisser && (await rectangleAffiche.getAttribute("x")) === "3" && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(deplace.revision));

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+k");
  const palette = page.locator("[data-studio-palette]");
  await palette.waitFor();
  await page.keyboard.type("Ligne");
  check("palette Ctrl+K : « Ligne » est la première proposition", (await palette.locator('[role="option"]').first().getAttribute("data-studio-palette-entree")) === "studio.dessin.ligne");
  await page.keyboard.press("Enter");
  await palette.waitFor({ state: "detached" });
  check("palette Ctrl+K : Entrée lance l'outil Ligne", (await element(outils, "Ligne").getAttribute("aria-pressed")) === "true");
  await cliquerBouton(outils, "Sélection");
  await cliquerBouton(outils, "Outils");
  const gestionnaire = page.locator("[data-studio-gestionnaire-outils]");
  await gestionnaire.waitFor();
  check("Outils : le catalogue liste tout le registre", (await gestionnaire.locator("[data-studio-catalogue-entree]").count()) >= 25 && (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.ligne"] [data-studio-exposition="none"]').count()) === 1);
  await gestionnaire.getByLabel("Rechercher un outil", { exact: true }).fill("Cote");
  check("Outils : la recherche « Cote » trouve les outils Cote et Cote angulaire, et eux seuls", (await gestionnaire.locator("[data-studio-catalogue-entree]").count()) === 2 && (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.cote"]').isVisible())
    && (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.cote-angulaire"]').isVisible()));
  await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  await gestionnaire.waitFor({ state: "detached" });

  const lienExport = (format) => outils.locator(`a[data-studio-commande="exporter-${format}"]`).getAttribute("href");
  check("exports : liens SVG et DXF vers l'adresse d'export de la variante", (await lienExport("svg")) === `${variantePath}/export?format=svg` && (await lienExport("dxf")) === `${variantePath}/export?format=dxf`);
  const reponse = await page.request.get(`${BASE}${variantePath}/export?format=svg`);
  if (reponse.status() === 404) console.log("· export : point d'entrée absent de ce serveur, seuls les liens sont contrôlés");
  else check("exports : le serveur renvoie une pièce jointe", reponse.ok() && /attachment/i.test(reponse.headers()["content-disposition"] ?? ""), String(reponse.status()));

  // Volume et Vue 3D : une ligne tracée, extrudée (hauteur 2,5 m, épaisseur 0,2 m) avec les seules valeurs saisies,
  // Vue 3D (Maj+D) du brouillon : un canevas rendu, objets non extrudés comptés ; enregistrement, extrusion relue.
  const idsLignes = () => page.locator('svg [role="button"][aria-label^="Ligne "]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-objet")));
  const lignesAvant = await idsLignes();
  await cliquerBouton(outils, "Ligne");
  await proprietes.getByLabel("X", { exact: true }).fill("10");
  await proprietes.getByLabel("Y", { exact: true }).fill("10");
  await proprietes.getByLabel("X final", { exact: true }).fill("14");
  await proprietes.getByLabel("Y final", { exact: true }).fill("10");
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  const murId = (await idsLignes()).find((id) => !lignesAvant.includes(id));
  check("volume : une ligne tracée pour l'extrusion", !!murId);
  await cliquerBouton(outils, "Sélection");
  await page.locator(`[data-studio-objet="${murId}"]`).focus();
  await page.keyboard.press("Enter");
  const formExtrusion = page.locator("[data-studio-extrusion]");
  await formExtrusion.waitFor();
  check("volume : aucune valeur d'extrusion proposée (non évaluée)", (await formExtrusion.getByLabel("Hauteur (m)").inputValue()) === "" && (await formExtrusion.getByLabel("Épaisseur (m, lignes, facultative)").inputValue()) === "" && (await formExtrusion.getAttribute("data-studio-extrusion")) !== null && (await page.locator("[data-studio-extrusion-etat]").getAttribute("data-studio-extrusion-etat")) === "plat");
  check("volume : Extruder (Maj+E) et Aplatir (Maj+F) dans la barre Volume", (await outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.objet.extruder"][aria-keyshortcuts="Shift+E"]').count()) === 1 && (await outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.objet.aplatir"][aria-keyshortcuts="Shift+F"]').count()) === 1);
  await formExtrusion.getByLabel("Base (m)").fill("0");
  await formExtrusion.getByLabel("Hauteur (m)").fill("2.5");
  await formExtrusion.getByLabel("Épaisseur (m, lignes, facultative)").fill("0.2");
  check("volume (TEST-005) : direction d'extrusion demandée, aucune proposée", (await formExtrusion.locator("[data-studio-extrusion-direction]").inputValue()) === "");
  await formExtrusion.locator("[data-studio-extrusion-direction]").selectOption("+z");
  await formExtrusion.getByRole("button", { name: "Extruder la sélection", exact: true }).click();
  await page.locator('[data-studio-extrusion-etat="extrude"]').waitFor();
  check("volume : une commande d'extrusion en attente", (await portee()).includes("(2 commande(s)"), await portee());
  const formesVisibles = await page.locator('svg [role="button"][aria-label^="Ligne "], svg [role="button"][aria-label^="Rectangle "]').count();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const vue3d = page.locator("[data-studio-vue3d]");
  await vue3d.waitFor();
  const canevas = panneaux3d.locator("canvas[data-studio-vue3d-canvas]");
  await canevas.waitFor({ timeout: 20000 });
  check("Vue 3D (Maj+D) : bascule enfoncée, planche 2D remplacée", (await outils.locator('[data-studio-commande="vue-3d"]').getAttribute("aria-pressed")) === "true" && (await planche.count()) === 0);
  // Maillage calculé en tâche de fond : attendre celui de la révision affichée.
  await page.locator('[data-studio-vue3d][data-studio-maillage="done"]').waitFor();
  await page.waitForTimeout(300);
  const couleurs = await canevas.evaluate((c) => {
    const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
    const g = t.getContext("2d"); g.drawImage(c, 0, 0);
    const px = g.getImageData(0, 0, t.width, t.height).data, vus = new Set();
    for (let i = 0; i < px.length; i += 4 * 97) vus.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
    return { largeur: c.width, hauteur: c.height, couleurs: vus.size };
  });
  check("Vue 3D : un canevas WebGL rendu (non vide)", couleurs.largeur > 0 && couleurs.hauteur > 0 && couleurs.couleurs > 3 && (await panneaux3d.locator("[data-studio-vue3d-indisponible]").count()) === 0, JSON.stringify(couleurs));
  check("Vue 3D : un volume, les autres objets visibles comptés « non extrudés »", (await vue3d.getAttribute("data-studio-volumes")) === "1" && (await vue3d.getAttribute("data-studio-non-extrudes")) === String(formesVisibles - 1) && (await panneaux3d.locator("[data-studio-vue3d-decompte]").textContent()).includes(`${formesVisibles - 1} objet(s) non extrudé(s)`), `${await vue3d.getAttribute("data-studio-non-extrudes")} / ${formesVisibles - 1}`);
  const avantVolume = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiVolume = envois[envois.length - 1];
  check("volume : enregistré par studio.dessin.ligne puis studio.objet.extruder", envois.length === avantVolume + 1 && envoiVolume.commands.map((c) => c.toolId).join() === "studio.dessin.ligne,studio.objet.extruder" && JSON.stringify(envoiVolume.commands[1].params) === JSON.stringify({ ids: [murId], base: 0, height: 2.5, thickness: 0.2, direction: "+z" }), JSON.stringify(envoiVolume?.commands));
  await page.reload();
  await page.locator(`[data-studio-objet="${murId}"]`).waitFor({ state: "attached" });
  const murRelu = (await a.api("get", variantePath)).revision.document.objects.find((o) => o.id === murId);
  check("volume : extrusion persistée côté serveur (direction +Z choisie comprise)", JSON.stringify(murRelu?.extrusion) === JSON.stringify({ base: 0, height: 2.5, thickness: 0.2, direction: "+z" }), JSON.stringify(murRelu));
  await page.locator(`[data-studio-objet="${murId}"]`).focus();
  await page.keyboard.press("Enter");
  await formExtrusion.waitFor();
  check("volume : après actualisation, les valeurs saisies sont relues", (await formExtrusion.getByLabel("Hauteur (m)").inputValue()) === "2.5" && (await formExtrusion.getByLabel("Épaisseur (m, lignes, facultative)").inputValue()) === "0.2" && (await page.locator("[data-studio-extrusion-etat]").getAttribute("data-studio-extrusion-etat")) === "extrude");
  await (await atteindre(outils, '[data-studio-commande="vue-3d"]')).click();
  await panneaux3d.locator("canvas[data-studio-vue3d-canvas]").waitFor();
  await page.locator('[data-studio-vue3d][data-studio-maillage="done"]').waitFor();
  check("Vue 3D : relue après actualisation, le volume est rendu", (await vue3d.getAttribute("data-studio-volumes")) === "1");
  await (await atteindre(outils, '[data-studio-commande="vue-3d"]')).click();
  await planche.waitFor();

  // Feuille (Maj+P, barre Présentation du domaine Documentation) : A3 paysage à 1:100, cartouche prérempli (nom de
  // l'étude), feuille SVG téléchargée à sa taille réelle, impression de la seule feuille. Le raccourci ouvre la boîte
  // par-dessus le domaine affiché (Dessin et modélisation), sans en changer.
  await page.locator('[data-studio-domaine-lien="documentation"]').click();
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  const boutonFeuille = outils.locator('[data-studio-famille="presentation"] [data-studio-commande="feuille"][aria-keyshortcuts="Shift+P"]');
  check("Feuille : commande dans la barre Présentation de Documentation, raccourci Maj+P", (await boutonFeuille.count()) === 1);
  await page.locator('[data-studio-domaine-lien="dessin"]').click();
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+P");
  const feuille = page.locator("[data-studio-feuille]");
  await feuille.waitFor();
  await feuille.locator("[data-studio-feuille-format]").selectOption("A3");
  await feuille.locator("[data-studio-feuille-orientation]").selectOption("paysage");
  await feuille.locator("[data-studio-feuille-echelle]").selectOption("100");
  const apercuFeuille = feuille.locator('[data-studio-feuille-apercu] svg[data-format="A3"][data-orientation="paysage"][data-scale="100"]');
  await apercuFeuille.waitFor();
  check("Feuille : aperçu A3 paysage 1:100, cartouche avec le nom de l'étude", (await apercuFeuille.getAttribute("width")) === "420mm" && (await apercuFeuille.locator('[data-sheet-part="title-block"] [data-id="cartouche.study"]').textContent()) === "Implantation nord" && (await apercuFeuille.locator('[data-id="cartouche.scale"]').textContent()) === "1:100");
  check("Feuille : champs préremplis par les données réelles, titre laissé vide, nord non orienté", (await feuille.locator('[data-studio-feuille-champ="projectCode"]').inputValue()) === "P.STU.A" && (await feuille.locator('[data-studio-feuille-champ="study"]').inputValue()) === "Implantation nord" && (await feuille.locator('[data-studio-feuille-champ="title"]').inputValue()) === "" && (await apercuFeuille.locator('[data-id="cartouche.north"]').textContent()) === "Nord : non orienté" && (await apercuFeuille.locator('[data-sheet-part="north"]').count()) === 0);
  const lienFeuille = feuille.locator("a[data-studio-feuille-svg]");
  await page.waitForFunction(() => document.querySelector("a[data-studio-feuille-svg]")?.getAttribute("href")?.startsWith("blob:"));
  const [telechargement] = await Promise.all([page.waitForEvent("download"), lienFeuille.click()]);
  const svgFeuille = readFileSync(await telechargement.path(), "utf8");
  check("Feuille : le SVG téléchargé est la feuille A3 paysage (420 mm) avec son cartouche", /<svg [^>]*width="420mm" height="297mm"/.test(svgFeuille) && svgFeuille.includes(">Implantation nord</text>") && telechargement.suggestedFilename().endsWith("-A3-paysage.svg"), telechargement.suggestedFilename());
  await page.emulateMedia({ media: "print" });
  const impression = await page.evaluate(() => {
    const copie = document.querySelector("body > .studio-feuille-impression svg");
    const r = copie?.getBoundingClientRect();
    return { largeur: r?.width ?? 0, dialogue: getComputedStyle(document.querySelector("#root") ?? document.body.firstElementChild).display };
  });
  await page.emulateMedia({ media: "screen" });
  check("Feuille : à l'impression, seule la feuille paraît, à sa taille réelle (420 mm)", Math.abs(impression.largeur - (420 / 25.4) * 96) < 2 && impression.dialogue === "none", JSON.stringify(impression));
  await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  await feuille.waitFor({ state: "detached" });
  check("Feuille : la boîte s'est ouverte et refermée par-dessus Dessin et modélisation (domaine inchangé)", (await page.locator("[data-studio-domaine-affiche]").getAttribute("data-studio-domaine-affiche")) === "dessin");

  await page.goto(`${base}?revision=${encodeURIComponent(ancienne)}&domaine=documentation`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  check("Feuille : disponible en révision historique (lecture seule)", await outils.locator('[data-studio-commande="feuille"]').isEnabled());
  check("exports : en révision historique, le lien porte la révision affichée", (await lienExport("svg")) === `${variantePath}/export?format=svg&revision=${encodeURIComponent(ancienne)}` && (await lienExport("dxf")) === `${variantePath}/export?format=dxf&revision=${encodeURIComponent(ancienne)}`);

  // Import DXF (Maj+U, barre Importer) : indisponible en révision historique ; un DXF en millimètres (2 LINE, 1
  // LWPOLYLINE fermée, 1 CIRCLE, 1 ARC) → rapport (tout est pris : le cercle et l'arc deviennent des courbes), 5 objets
  // convertis en mètres, annulable, enregistré, relu identique ; un import de 600 lignes part en deux enveloppes de
  // 500 commandes au plus.
  const boutonImport = outils.locator('[data-studio-famille="echanges"] [data-studio-commande="importer-dxf"][aria-keyshortcuts="Shift+U"]');
  check("Import DXF : commande de la barre Importer (Maj+U), indisponible en lecture seule", (await boutonImport.count()) === 1 && (await boutonImport.isDisabled()));
  await page.goto(base);
  await page.locator('svg [role="button"]').first().waitFor({ state: "attached" });
  const teteAvantImport = (await a.api("get", variantePath)).revision;
  const dxfDe = (insunits, entites) => [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", String(insunits), "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES", ...entites, "0", "ENDSEC", "0", "EOF", "",
  ].join("\r\n");
  const dxfMm = dxfDe(4, [
    "0", "LINE", "8", "0", "10", "20000", "20", "20000", "11", "24000", "21", "20000",
    "0", "LINE", "8", "0", "10", "20000", "20", "20000", "11", "20000", "21", "23000",
    "0", "LWPOLYLINE", "8", "0", "90", "4", "70", "1", "10", "21000", "20", "21000", "10", "23000", "20", "21000", "10", "23000", "20", "22500", "10", "21000", "20", "22500",
    "0", "CIRCLE", "8", "0", "10", "20500", "20", "20500", "30", "0", "40", "250",
    "0", "ARC", "8", "0", "10", "22000", "20", "22000", "30", "0", "40", "500", "50", "0", "51", "90",
  ]);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+U");
  const boiteImport = page.locator("[data-studio-import-dxf]");
  await boiteImport.waitFor();
  check("Import DXF : « Ajouter au brouillon » indisponible avant le choix d'un fichier", await boiteImport.locator("[data-studio-import-ajouter]").isDisabled());
  await boiteImport.locator("[data-studio-import-fichier]").setInputFiles({ name: "plan-mm.dxf", mimeType: "application/dxf", buffer: Buffer.from(dxfMm) });
  const rapportImport = boiteImport.locator("[data-studio-import-rapport]");
  await rapportImport.waitFor();
  const nonPrisImport = await rapportImport.locator("[data-studio-import-non-pris-type]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-studio-import-non-pris-type")}:${e.getAttribute("data-studio-import-non-pris-nombre")}`));
  check("Import DXF : rapport — unité mm lue dans le fichier, 5 objets dont un cercle et un arc, rien de non pris",
    (await rapportImport.getAttribute("data-studio-import-statut")) === "pret" && (await rapportImport.getAttribute("data-studio-import-unite")) === "mm" && (await rapportImport.getAttribute("data-studio-import-objets")) === "5"
    && (await rapportImport.getAttribute("data-studio-import-non-pris")) === "0" && nonPrisImport.length === 0 && (await rapportImport.locator("[data-studio-import-choix-unite]").count()) === 0
    && (await rapportImport.locator("[data-studio-import-courbes]").textContent()).includes("1 cercle(s), 1 arc(s), 0 polyligne(s)")
    && (await rapportImport.locator("[data-studio-import-unite-fichier]").textContent()).includes("1 unité = 0,001 m"), nonPrisImport.join());
  await boiteImport.locator("[data-studio-import-ajouter]").click();
  await boiteImport.waitFor({ state: "detached" });
  // EX-014 : l'import déclare sa source dans le même lot (5 objets + 1 source).
  check("Import DXF : un lot de 6 commandes (5 objets et la source déclarée) en attente dans le brouillon", (await portee()).includes("(6 commande(s)"), await portee());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  check("Import DXF : annulable (Ctrl+Z retire tout le lot)", (await portee()).includes("(0 commande(s)"), await portee());
  await page.keyboard.press("Control+y");
  check("Import DXF : rétabli (Ctrl+Y)", (await portee()).includes("(6 commande(s)"), await portee());
  const avantImport = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiTotal = envois[envois.length - 1];
  const sourceImport = envoiTotal.commands.find((c) => c.toolId === "studio.source.declarer");
  check("Import DXF : la source est déclarée avec le lot (fichier, empreinte SHA-256, unité mm lue, aucune transformation)",
    sourceImport?.params.nomFichier === "plan-mm.dxf" && /^[0-9a-f]{64}$/.test(sourceImport.params.empreinteSha256) && sourceImport.params.uniteLue === "mm" && sourceImport.params.transformation === "identite" && sourceImport.params.objets === 5, JSON.stringify(sourceImport?.params));
  const envoiImport = { ...envoiTotal, commands: envoiTotal.commands.filter((c) => c.toolId !== "studio.source.declarer") };
  const attendus = [
    { toolId: "studio.dessin.ligne", params: { type: "line", start: { x: 20, y: 20 }, end: { x: 24, y: 20 } } },
    { toolId: "studio.dessin.ligne", params: { type: "line", start: { x: 20, y: 20 }, end: { x: 20, y: 23 } } },
    { toolId: "studio.dessin.rectangle", params: { type: "rectangle", origin: { x: 21, y: 21 }, width: 2, height: 1.5 } },
    { toolId: "studio.dessin.cercle", params: { type: "circle", center: { x: 20.5, y: 20.5 }, radius: 0.25 } },
    { toolId: "studio.dessin.arc", params: { type: "arc", center: { x: 22, y: 22 }, radius: 0.5, startAngle: 0, endAngle: Math.PI / 2 } },
  ];
  const sansIdImport = (c) => { const { id, ...p } = c.params; return { toolId: c.toolId, params: p }; };
  check("Import DXF : enregistré en une enveloppe, millimètres convertis en mètres, identifiants « dxf-… »",
    envois.length === avantImport + 1 && envoiImport.baseRevisionId === teteAvantImport.id && JSON.stringify(envoiImport.commands.map(sansIdImport)) === JSON.stringify(attendus) && envoiImport.commands.every((c) => /^dxf-\d+$/.test(c.params.id)), JSON.stringify(envoiImport?.commands));
  const importe = await a.api("get", variantePath);
  const idsImport = envoiImport.commands.map((c) => c.params.id);
  check("Import DXF : le serveur a ajouté les 5 objets (cercle et arc compris), rien d'autre ne change", importe.revision.document.objects.length === teteAvantImport.document.objects.length + 5
    && JSON.stringify(importe.revision.document.objects.filter((o) => idsImport.includes(o.id)).map((o) => sansIdImport({ toolId: "", params: o }).params)) === JSON.stringify(attendus.map((x) => x.params))
    && JSON.stringify(importe.revision.document.objects.filter((o) => !idsImport.includes(o.id))) === JSON.stringify(teteAvantImport.document.objects));
  const empreinteImport = await empreinte();
  await page.reload();
  await page.locator(`[data-studio-objet="${idsImport[2]}"]`).waitFor({ state: "attached" });
  check("Import DXF : l'actualisation restitue le même dessin", (await empreinte()) === empreinteImport && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(importe.revision));

  // Courbes : Cercle (C), Arc (A, trois points puis centre-début-fin), Polyligne (P) fermée par Maj+Entrée, Décaler (O)
  // de la polyligne ; enregistrement, actualisation identique ; export DXF (CIRCLE, ARC, POLYLINE R12) et SVG.
  await page.evaluate(() => document.activeElement?.blur());
  // Accrochage aux sommets coupé le temps du tracé : les points visés ne sont pas attirés par les objets existants.
  await page.keyboard.press("Shift+S");
  check("courbes : Cercle (C), Arc (A), Polyligne (P) dans la barre Dessin, Décaler (O) dans Modification, icônes propres",
    (await outils.locator('[data-studio-famille="dessin"] [data-studio-outil="studio.dessin.cercle"][aria-keyshortcuts="C"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="courbes"] [data-studio-outil="studio.dessin.arc"][aria-keyshortcuts="A"]').count()) === 1
    && (await outils.locator('[data-studio-famille="courbes"] [data-studio-outil="studio.dessin.polyligne"][aria-keyshortcuts="P"]').count()) === 1
    && (await outils.locator('[data-studio-famille="modification"] [data-studio-outil="studio.dessin.decaler"][aria-keyshortcuts="O"]').count()) === 1
    && (await outils.locator('[data-studio-famille="courbes"] [data-studio-commande="fermer-polyligne"][aria-keyshortcuts="Shift+Enter"]').count()) === 1);
  const idsDe = (type) => page.locator(`svg [data-studio-type="${type}"]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-objet")));
  const avantCourbes = { circle: await idsDe("circle"), arc: await idsDe("arc"), polyline: await idsDe("polyline") };
  const nouveaux = async (type) => (await idsDe(type)).filter((id) => !avantCourbes[type].includes(id));
  await page.keyboard.press("c");
  check("courbes : C choisit l'outil Cercle", (await element(outils, "Cercle").getAttribute("aria-pressed")) === "true");
  await cliquer(15, 12);
  await cliquer(16, 12);
  check("courbes : deux clics (centre, point du cercle) tracent un cercle", (await nouveaux("circle")).length === 1);
  await page.keyboard.press("a");
  await cliquer(17, 10);
  await cliquer(18, 11);
  await cliquer(19, 10);
  check("courbes : trois clics (début, passage, fin) tracent un arc", (await nouveaux("arc")).length === 1);
  await page.locator("[data-studio-mode-arc]").selectOption("centre");
  await page.evaluate(() => document.activeElement?.blur());
  await cliquer(15, 3);
  await cliquer(16, 3);
  await cliquer(15, 4);
  check("courbes : arc par centre, début et fin", (await nouveaux("arc")).length === 2);
  await page.keyboard.press("p");
  await cliquer(10, 12);
  await cliquer(13, 12);
  await cliquer(13, 14);
  check("courbes : polyligne en cours, sommets posés affichés", (await page.locator("[data-studio-sommet-pose]").count()) === 2);
  await page.keyboard.press("Shift+Enter");
  const [polyId] = await nouveaux("polyline");
  check("courbes : Maj+Entrée ferme la polyligne", !!polyId && (await page.locator(`[data-studio-objet="${polyId}"] path`).getAttribute("d")).endsWith("Z"));
  await cliquerBouton(outils, "Sélection");
  await page.locator(`[data-studio-objet="${polyId}"]`).focus();
  await page.keyboard.press("Enter");
  await page.locator(`[data-studio-selection="${polyId}"]`).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("o");
  check("courbes : O choisit l'outil Décaler", (await element(outils, "Décaler").getAttribute("aria-pressed")) === "true");
  await proprietes.getByLabel("Distance", { exact: true }).fill("0.5");
  await proprietes.getByRole("button", { name: "Décaler la sélection", exact: true }).click();
  const decalees = await nouveaux("polyline");
  check("courbes : la polyligne décalée est un nouvel objet, sélectionné", decalees.length === 2 && (await page.locator("[data-studio-selection]").getAttribute("data-studio-selection")) === decalees.find((id) => id !== polyId));
  await page.keyboard.press("Shift+S");
  const avantCourbesEnvoi = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiCourbes = envois[envois.length - 1];
  check("courbes : enregistrées en une enveloppe (cercle, deux arcs, polyligne, décalage)", envois.length === avantCourbesEnvoi + 1
    && JSON.stringify(envoiCourbes.commands.map((c) => c.toolId)) === JSON.stringify(["studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.arc", "studio.dessin.polyligne", "studio.dessin.decaler"]), JSON.stringify(envoiCourbes?.commands.map((c) => c.toolId)));
  const courbes = await a.api("get", variantePath);
  const objet = (id) => courbes.revision.document.objects.find((o) => o.id === id);
  const proche = (u, v) => Math.abs(u - v) < 0.06;
  const cercle = objet((await nouveaux("circle"))[0]);
  const [arc3, arcC] = (await nouveaux("arc")).map(objet);
  const poly = objet(polyId), decale = objet(decalees.find((id) => id !== polyId));
  check("courbes : géométrie relue du serveur (cercle r = 1, arc 3 points r = 1 de 0 à π, arc centré 0 → π/2, polyligne fermée et son décalé extérieur)",
    proche(cercle.center.x, 15) && proche(cercle.center.y, 12) && proche(cercle.radius, 1)
    && proche(arc3.center.x, 18) && proche(arc3.center.y, 10) && proche(arc3.radius, 1) && (arc3.startAngle < 0.1 || arc3.startAngle > 6.2) && proche(arc3.endAngle, Math.PI)
    && proche(arcC.radius, 1) && (arcC.startAngle < 0.06 || arcC.startAngle > 2 * Math.PI - 0.06) && proche(arcC.endAngle, Math.PI / 2)
    && poly.closed === true && poly.points.length === 3 && decale.type === "polyline" && decale.closed === true && decale.points.length === 3
    && Math.min(...decale.points.map((q) => q.x)) < Math.min(...poly.points.map((q) => q.x)) && Math.max(...decale.points.map((q) => q.y)) > Math.max(...poly.points.map((q) => q.y)),
    JSON.stringify({ cercle, arc3, arcC, poly, decale }));
  const empreinteCourbes = await empreinte();
  await page.reload();
  await page.locator(`[data-studio-objet="${polyId}"]`).waitFor({ state: "attached" });
  check("courbes : l'actualisation restitue le même dessin", (await empreinte()) === empreinteCourbes && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(courbes.revision));
  const dxfCourbes = await page.request.get(`${BASE}${variantePath}/export?format=dxf`);
  if (dxfCourbes.status() === 404) console.log("· export DXF : point d'entrée absent de ce serveur");
  else {
    const t = await dxfCourbes.text();
    check("courbes : l'export DXF contient CIRCLE, ARC et la polyligne (POLYLINE R12 fermée, 70 = 1)", /\r\nCIRCLE\r\n/.test(t) && /\r\nARC\r\n/.test(t) && (t.match(/\r\nPOLYLINE\r\n/g) ?? []).length >= 3 && /\r\n50\r\n/.test(t) && /\r\n51\r\n90\r\n/.test(t));
    const svg = await (await page.request.get(`${BASE}${variantePath}/export?format=svg`)).text();
    check("courbes : l'export SVG contient <circle> et des <path> d'arc et de polyligne", svg.includes(`<circle data-id="${cercle.id}"`) && svg.includes(`data-id="${arc3.id}" data-type="arc"`) && svg.includes(`data-id="${polyId}" data-type="polyline"`));
  }

  // Volume libre (A.3-02, A.3-05, A.3-07, A.3-09) : barre « Volume libre », Boîte (B) posée par un clic sur la grille
  // puis saisie 2 × 1 × 3 en (1, 1, 0), Prisme sur profil (Maj+B) de la polyligne fermée, navigation en plan (Maj+G),
  // coupe horizontale dérivée à z = 1,5 (Maj+K), déplacer / supprimer annulés, enregistrement, actualisation identique,
  // export IFC : deux IfcBuildingElementProxy .NOTDEFINED. de plus.
  const proxies = (t) => (t.match(/IFCBUILDINGELEMENTPROXY\(/g) ?? []).length;
  const ifcAvantSolides = await page.request.get(`${BASE}${variantePath}/export?format=ifc`);
  const proxiesAvant = ifcAvantSolides.ok() ? proxies(await ifcAvantSolides.text()) : null;
  await page.evaluate(() => document.activeElement?.blur());
  check("volume libre : Boîte (B), Prisme sur profil (Maj+B), Déplacer le solide (Maj+W), Supprimer le solide (Maj+Suppr) dans la barre Volume libre, icônes propres",
    (await outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.solide.boite"][aria-keyshortcuts="B"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.solide.prisme"][aria-keyshortcuts="Shift+B"]').count()) === 1
    && (await outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.solide.deplacer"][aria-keyshortcuts="Shift+W"]').count()) === 1
    && (await outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.solide.supprimer"][aria-keyshortcuts="Shift+Delete"]').count()) === 1
    && (await outils.locator('[data-studio-famille="vue"] [data-studio-commande="navigation-3d"][aria-keyshortcuts="Shift+G"]').count()) === 1
    && (await outils.locator('[data-studio-famille="vue"] [data-studio-commande="coupe-3d"][aria-keyshortcuts="Shift+K"]').count()) === 1);
  await page.keyboard.press("b");
  const vueLibre = page.locator("[data-studio-vue3d]");
  const canevasLibre = panneaux3d.locator("canvas[data-studio-vue3d-canvas]");
  await canevasLibre.waitFor({ timeout: 20000 });
  const formBoite = panneaux3d.locator("[data-studio-boite]");
  await formBoite.waitFor();
  check("volume libre : B ouvre la vue 3D, outil Boîte enfoncé, aucune dimension proposée",
    (await outils.locator('[data-studio-outil="studio.solide.boite"]').getAttribute("aria-pressed")) === "true" && (await planche.count()) === 0
    && (await formBoite.getByLabel("Largeur selon x (m)").inputValue()) === "" && (await formBoite.getByLabel("Hauteur selon z (m)").inputValue()) === "" && (await formBoite.getByLabel("Origine x (m)").inputValue()) === "");
  await canevasLibre.scrollIntoViewIfNeeded();
  const cadreLibre = await canevasLibre.boundingBox();
  await page.mouse.click(cadreLibre.x + cadreLibre.width / 2, cadreLibre.y + cadreLibre.height * 0.6);
  check("volume libre : un clic sur la grille relève l'origine (z = 0)", (await formBoite.getByLabel("Origine x (m)").inputValue()) !== "" && (await formBoite.getByLabel("Origine z (m)").inputValue()) === "0",
    `${await formBoite.getByLabel("Origine x (m)").inputValue()} ; ${await formBoite.getByLabel("Origine y (m)").inputValue()}`);
  for (const [libelle, valeur] of [["Origine x (m)", "1"], ["Origine y (m)", "1"], ["Origine z (m)", "0"], ["Largeur selon x (m)", "2"], ["Profondeur selon y (m)", "1"], ["Hauteur selon z (m)", "3"]]) await formBoite.getByLabel(libelle, { exact: true }).fill(valeur);
  await formBoite.getByRole("button", { name: "Poser la boîte", exact: true }).click();
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
  check("volume libre : la boîte est posée dans le brouillon (un solide libre, une commande en attente)", (await vueLibre.getAttribute("data-studio-solides-libres")) === "1" && (await portee()).includes("(1 commande(s)"), await portee());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+B");
  const formPrisme = panneaux3d.locator("[data-studio-prisme]");
  await formPrisme.waitFor();
  await formPrisme.locator("[data-studio-prisme-profil]").selectOption(polyId);
  await formPrisme.getByLabel("Cote de base z (m)", { exact: true }).fill("0");
  await formPrisme.getByLabel("Hauteur (m)", { exact: true }).fill("2");
  // Lot F1 (TEST-006, TEST-005) : relation et direction demandées ; copie indépendante vers le haut, comme avant le lot.
  await formPrisme.locator("[data-studio-prisme-relation]").selectOption("copie-independante");
  await formPrisme.locator("[data-studio-prisme-direction]").selectOption("+z");
  await formPrisme.getByRole("button", { name: "Poser le prisme", exact: true }).click();
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="2"]').waitFor();
  check("volume libre : prisme sur le profil de la polyligne fermée (deux solides libres)", (await vueLibre.getAttribute("data-studio-solides-libres")) === "2" && (await portee()).includes("(2 commande(s)"), await portee());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+G");
  await page.locator('[data-studio-vue3d][data-studio-navigation="plan"]').waitFor();
  check("navigation 3D : Maj+G passe en vue en plan (bascule enfoncée), sans modifier le brouillon", (await outils.locator('[data-studio-commande="navigation-3d"]').getAttribute("aria-pressed")) === "true" && (await portee()).includes("(2 commande(s)"));
  await page.keyboard.press("Shift+G");
  await page.locator('[data-studio-vue3d][data-studio-navigation="orbite"]').waitFor();
  // A.3-05 — navigation 3D du parcours autonome : orbite (glisser), zoom (molette) et panoramique (glisser droit)
  // déplacent la caméra rendue, sans aucune commande ni écriture (brouillon, solides et envois inchangés).
  {
    const canevas = panneaux3d.locator("canvas[data-studio-vue3d-canvas]");
    await canevas.scrollIntoViewIfNeeded();
    const cadre = await canevas.boundingBox();
    const camera = async () => JSON.parse((await canevas.getAttribute("data-studio-camera")) ?? "null");
    const distance = (c) => Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
    const envoisNav = [];
    const surEnvoi = (r) => { if (r.method() !== "GET" && /\/studio\//.test(new URL(r.url()).pathname)) envoisNav.push(r.url()); };
    page.on("request", surEnvoi);
    const cx = cadre.x + cadre.width / 2, cy = cadre.y + cadre.height / 2;
    const glisser = async (dx, dy, button = "left") => {
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button });
      for (let i = 1; i <= 8; i++) await page.mouse.move(cx + (dx * i) / 8, cy + (dy * i) / 8);
      await page.mouse.up({ button });
    };
    // La caméra publiée (data-studio-camera) est arrondie au dixième de millimètre par coordonnée (versLocal3d) :
    // l'écart de distance dû à l'arrondi est au plus √3 × 1e-4 m.
    const TOL_ARRONDI = Math.sqrt(3) * 1e-4;
    const c0 = await camera();
    await glisser(120, 40);
    const c1 = await camera();
    check("A.3-05 : orbite (glisser) — la caméra tourne autour de la même cible, à la même distance",
      c0?.projection === "perspective" && JSON.stringify(c1.target) === JSON.stringify(c0.target) && JSON.stringify(c1.position) !== JSON.stringify(c0.position) && Math.abs(distance(c1) - distance(c0)) <= Math.max(1e-6 * Math.max(1, distance(c0)), TOL_ARRONDI),
      JSON.stringify([c0, c1]));
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await page.waitForFunction((d) => { const c = JSON.parse(document.querySelector("canvas[data-studio-vue3d-canvas]")?.getAttribute("data-studio-camera") ?? "null"); return c && Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z) < d - 1e-6; }, distance(c1), { timeout: 5000 }).catch(() => {});
    const c2 = await camera();
    check("A.3-05 : zoom (molette) — la caméra se rapproche de sa cible, cible inchangée", distance(c2) < distance(c1) && JSON.stringify(c2.target) === JSON.stringify(c1.target), JSON.stringify([c1, c2]));
    await glisser(80, -60, "right");
    const c3 = await camera();
    check("A.3-05 : panoramique (glisser droit) — cible et caméra translatées ensemble, distance gardée",
      JSON.stringify(c3.target) !== JSON.stringify(c2.target) && Math.abs(distance(c3) - distance(c2)) <= Math.max(1e-6 * Math.max(1, distance(c2)), TOL_ARRONDI), JSON.stringify([c2, c3]));
    page.off("request", surEnvoi);
    check("A.3-05 : orbite, zoom et panoramique ne modifient pas le document — brouillon, solides et envois inchangés",
      (await portee()).includes("(2 commande(s)") && (await vueLibre.getAttribute("data-studio-solides-libres")) === "2" && envoisNav.length === 0, `${await portee()} ${envoisNav.join()}`);
  }
  await page.keyboard.press("Shift+K");
  const panneauCoupe = panneaux3d.locator("[data-studio-coupe]");
  await panneauCoupe.waitFor();
  check("coupe : aucune cote proposée", (await panneauCoupe.getByLabel("Cote de coupe z (m)").inputValue()) === "" && (await panneauCoupe.getAttribute("data-studio-coupe-segments")) === "0");
  await panneauCoupe.getByLabel("Cote de coupe z (m)", { exact: true }).fill("1.5");
  await page.locator('[data-studio-coupe][data-studio-coupe-z="1.5"]').waitFor();
  const sourcesCoupe = ((await panneauCoupe.getAttribute("data-studio-coupe-sources")) ?? "").split(" ").filter(Boolean);
  check("coupe à z = 1,5 : contours dérivés de la boîte (4 côtés) et du prisme (3 côtés), provenance par solide, non modifiable",
    (await panneauCoupe.getAttribute("data-studio-coupe-segments")) === "7" && sourcesCoupe.length === 2 && (await panneauCoupe.locator("[data-studio-coupe-source]").count()) === 2
    && (await panneauCoupe.getByRole("status").textContent()).includes("non modifiable") && (await portee()).includes("(2 commande(s)"), `${await panneauCoupe.getAttribute("data-studio-coupe-segments")} · ${sourcesCoupe.join()}`);
  const [idBoite] = await panneaux3d.locator('[data-studio-solide-type="box"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-solide")));
  await panneaux3d.locator(`[data-studio-solide="${idBoite}"]`).click();
  const choisi = panneaux3d.locator(`[data-studio-solide-choisi="${idBoite}"]`);
  await choisi.waitFor();
  check("sélection 3D : la boîte, volume 6 m³", (await choisi.textContent()).includes("volume 6 m³"));
  await choisi.getByLabel("dx (m)", { exact: true }).fill("1");
  await choisi.getByLabel("dy (m)", { exact: true }).fill("0");
  await choisi.getByLabel("dz (m)", { exact: true }).fill("0.5");
  await choisi.getByRole("button", { name: "Déplacer le solide", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "3");
  check("sélection 3D : déplacer (dx, dy, dz) — origine (2 ; 1 ; 0,5)", (await choisi.textContent()).includes("origine (2 ; 1 ; 0,5) m"), await choisi.textContent());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  // C.2-02 / C.2-03 (projections versionnées) : un clic à l'endroit de la boîte la désigne ; supprimée, le même clic ne
  // désigne jamais son identifiant (rien, ou l'objet derrière), ni tout de suite (maillage encore en calcul), ni après.
  const maillageAJour3d = () => page.waitForFunction(() => {
    const v = document.querySelector("[data-studio-vue3d]");
    return v?.getAttribute("data-studio-maillage") === "done" && v.getAttribute("data-studio-maillage-revision") === v.getAttribute("data-studio-revision-courante");
  });
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "2");
  await maillageAJour3d();
  await panneaux3d.locator(`[data-studio-solide="${idBoite}"][aria-pressed="true"]`).click();
  await page.locator(`[data-studio-solide-choisi="${idBoite}"]`).waitFor({ state: "detached" });
  await canevasLibre.evaluate((c) => c.scrollIntoView({ block: "center" }));
  const ecranBoite = await page.evaluate((id) => globalThis.__fadiVue3d?.ecran(id) ?? null, idBoite);
  await page.mouse.click(ecranBoite.x, ecranBoite.y);
  const designeAvant = await panneaux3d.locator(`[data-studio-solide-choisi="${idBoite}"]`).waitFor({ timeout: 5000 }).then(() => 1, () => 0);
  check("désignation 3D : un clic à l'endroit de la boîte la sélectionne (table de désignation)", !!ecranBoite && designeAvant === 1, JSON.stringify(ecranBoite));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+Delete");
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
  check("Maj+Suppr supprime le solide sélectionné", (await portee()).includes("(3 commande(s)"), await portee());
  const choisiApres = async () => panneaux3d.locator("[data-studio-solide-choisi]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-solide-choisi")));
  await page.mouse.click(ecranBoite.x, ecranBoite.y);
  await page.waitForTimeout(300);
  const aussitot = await choisiApres();
  await maillageAJour3d();
  await page.mouse.click(ecranBoite.x, ecranBoite.y);
  await page.waitForTimeout(300);
  const ensuite = await choisiApres();
  check("désignation 3D : boîte supprimée, un clic à son endroit ne désigne jamais son identifiant (tout de suite et après remaillage)",
    !aussitot.includes(idBoite) && !ensuite.includes(idBoite) && ensuite.length <= 1 && (await panneaux3d.locator(`[data-studio-solide="${idBoite}"]`).count()) === 0,
    JSON.stringify({ aussitot, ensuite }));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="2"]').waitFor();
  check("annuler : déplacement et suppression retirés, la boîte et le prisme restent", (await portee()).includes("(2 commande(s)"), await portee());
  const avantSolides = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiSolides = envois[envois.length - 1];
  const polyRelu = courbes.revision.document.objects.find((o) => o.id === polyId);
  const p0 = polyRelu.points[0];
  const attenduBoite = { id: idBoite, type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 };
  check("volume libre : enregistré en une enveloppe (studio.solide.boite, studio.solide.prisme), valeurs saisies exactes",
    envois.length === avantSolides + 1 && JSON.stringify(envoiSolides.commands.map((c) => c.toolId)) === JSON.stringify(["studio.solide.boite", "studio.solide.prisme"])
    && JSON.stringify(envoiSolides.commands[0].params) === JSON.stringify(attenduBoite), JSON.stringify(envoiSolides?.commands));
  const solidesRelus = await a.api("get", variantePath);
  const docSolides = solidesRelus.revision.document;
  const prismeRelu = docSolides.solides?.find((s) => s.type === "prism");
  check("volume libre : le serveur range les solides dans `solides` (repère local-3d), `objects` inchangé",
    docSolides.solides?.length === 2 && JSON.stringify(docSolides.solides[0]) === JSON.stringify(attenduBoite)
    && JSON.stringify(prismeRelu?.placement) === JSON.stringify({ origin: { x: p0.x, y: p0.y, z: 0 }, rotation: 0 }) && prismeRelu?.height === 2
    && JSON.stringify(prismeRelu?.profile) === JSON.stringify(polyRelu.points.map((q) => ({ x: q.x - p0.x, y: q.y - p0.y })))
    && JSON.stringify(docSolides.objects) === JSON.stringify(courbes.revision.document.objects), JSON.stringify(docSolides.solides));
  await page.reload();
  await page.locator(`[data-studio-objet="${polyId}"]`).waitFor({ state: "attached" });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="2"]').waitFor();
  check("volume libre : l'actualisation restitue les mêmes solides", JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(solidesRelus.revision)
    && (await panneaux3d.locator("[data-studio-solide]").count()) === 2);

  // D.2-03 (tâches de fond) : rafale de déplacements de la boîte sans laisser la main à la boucle d'événements entre
  // deux (aucune réponse du Worker ne peut s'intercaler) : chaque maillage remplacé est annulé, son résultat éventuel
  // périmé ; le maillage affiché est celui de la dernière révision, jamais un plus ancien par-dessus. D.3-02 : les
  // compteurs GPU du rendu reviennent à leur ligne de base (reconstructions, fermeture / réouverture de la vue 3D).
  const maillagePret = () => page.waitForFunction(() => {
    const v = document.querySelector("[data-studio-vue3d]");
    return v?.getAttribute("data-studio-maillage") === "done" && v.getAttribute("data-studio-maillage-revision") === v.getAttribute("data-studio-revision-courante");
  });
  await maillagePret();
  const gpuBase = await canevasLibre.getAttribute("data-studio-gpu-geometries");
  const porteeAvantRafale = await portee();
  await panneaux3d.locator(`[data-studio-solide="${idBoite}"]`).click();
  await panneaux3d.locator(`[data-studio-solide-choisi="${idBoite}"]`).waitFor();
  const RAFALE = 6;
  const debutJournal = await page.evaluate(() => globalThis.__fadiTaches?.journal.length ?? 0);
  await page.evaluate(async (n) => {
    const form = document.querySelector("[data-studio-solide-choisi]");
    const valeur = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const micro = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
    for (let k = 0; k < n; k++) {
      for (const [nom, v] of [["solide-dx", "0.1"], ["solide-dy", "0"], ["solide-dz", "0"]]) {
        const el = form.querySelector(`[name="${nom}"]`);
        valeur.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await micro();
      form.querySelector("[data-studio-deplacer-solide]").click();
      await micro();
    }
  }, RAFALE);
  await maillagePret();
  const journalMaillage = (await page.evaluate((d) => globalThis.__fadiTaches.journal.slice(d), debutJournal)).filter((e) => e.cle === "studio.maillage-3d");
  const remis = journalMaillage.filter((e) => e.etat === "done").map((e) => Number(e.revision));
  const remplaces = journalMaillage.filter((e) => e.etat === "cancelled" || e.etat === "superseded" || e.etat === "stale");
  const revisionCourante = Number(await vueLibre.getAttribute("data-studio-revision-courante"));
  const perimesRemis = journalMaillage.filter((e) => e.etat === "stale").filter((s) => journalMaillage.some((e) => e.id === s.id && e.etat === "done"));
  check("tâches : maillages remplacés pendant la rafale annulés, aucun résultat périmé remis ; le dernier maillage affiché est celui de la dernière révision",
    remplaces.length > 0 && perimesRemis.length === 0 && remis.length > 0 && remis.every((r, i) => i === 0 || r > remis[i - 1]) && remis.at(-1) === revisionCourante
    && Number(await vueLibre.getAttribute("data-studio-maillage-revision")) === revisionCourante && (await portee()).includes(`(${RAFALE} commande(s)`)
    && (await panneaux3d.locator(`[data-studio-solide-choisi="${idBoite}"]`).textContent()).includes("origine (1,6 ; 1 ; 0) m"),
    JSON.stringify({ remis, remplaces: remplaces.map((e) => `${e.revision}:${e.etat}`), revisionCourante, portee: await portee() }));
  check("tâches : compteurs GPU revenus à leur ligne de base après les reconstructions", (await canevasLibre.getAttribute("data-studio-gpu-geometries")) === gpuBase && Number(gpuBase) > 0, `${gpuBase} → ${await canevasLibre.getAttribute("data-studio-gpu-geometries")}`);
  await page.evaluate(() => document.activeElement?.blur());
  for (let k = 0; k < RAFALE; k++) await page.keyboard.press("Control+z");
  await page.waitForFunction((t) => `(${document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre")} commande(s) en attente)` === t, porteeAvantRafale);
  await maillagePret();
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.press("Shift+D");
    await page.locator("[data-studio-vue3d]").waitFor({ state: "detached" });
    await page.keyboard.press("Shift+D");
    await canevasLibre.waitFor();
    await maillagePret();
    await page.waitForFunction((b) => document.querySelector("canvas[data-studio-vue3d-canvas]")?.getAttribute("data-studio-gpu-geometries") === b, gpuBase, { timeout: 5000 }).catch(() => {});
  }
  check("tâches : après trois fermetures / réouvertures de la vue 3D, mêmes compteurs GPU et brouillon inchangé",
    (await canevasLibre.getAttribute("data-studio-gpu-geometries")) === gpuBase && (await portee()) === porteeAvantRafale, `${gpuBase} → ${await canevasLibre.getAttribute("data-studio-gpu-geometries")}`);
  await page.keyboard.press("Shift+K");
  await panneaux3d.locator("[data-studio-coupe]").getByLabel("Cote de coupe z (m)", { exact: true }).fill("1.5");
  await page.locator('[data-studio-coupe][data-studio-coupe-segments="7"]').waitFor();
  await page.screenshot({ path: join(OUT, "studio-volume-libre.png") });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const ifcSolides = await page.request.get(`${BASE}${variantePath}/export?format=ifc`);
  if (proxiesAvant === null || ifcSolides.status() === 404) console.log("· export IFC : point d'entrée absent de ce serveur");
  else {
    const t = await ifcSolides.text();
    const proxiesSolides = (t.match(/IFCBUILDINGELEMENTPROXY\([^;]*'Volume libre[^;]*\.NOTDEFINED\.\);/g) ?? []).length;
    check("volume libre : l'export IFC compte deux IfcBuildingElementProxy .NOTDEFINED. de plus, sans catégorie devinée", proxies(t) === proxiesAvant + 2 && proxiesSolides === 2 && t.includes("IFCPROPERTYSINGLEVALUE('FreeSolids',$,IFCINTEGER(2),$)"), `${proxiesAvant} → ${proxies(t)} (${proxiesSolides})`);
  }

  // Annotations : Cote angulaire (Maj+A) liée à deux lignes par deux clics sur leurs segments, Texte (Maj+T) posé d'un
  // clic ; la ligne modifiée → l'angle suit ; la ligne supprimée → « à résoudre » ; enregistrement, actualisation
  // identique ; export DXF (TEXT, ARC) et SVG.
  check("annotations : Cote angulaire (Maj+A) et Texte (Maj+T) dans la barre Dessin, icônes propres",
    (await outils.locator('[data-studio-famille="annotation"] [data-studio-outil="studio.dessin.cote-angulaire"][aria-keyshortcuts="Shift+A"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="annotation"] [data-studio-outil="studio.dessin.texte"][aria-keyshortcuts="Shift+T"] svg path').count()) === 1);
  const lignesAvantAnnotations = await idsDe("line");
  for (const [x, y, xf, yf] of [[40, 40, 44, 40], [40, 40, 40, 43]]) {
    await cliquerBouton(outils, "Ligne");
    for (const [nom, v] of [["X", x], ["Y", y], ["X final", xf], ["Y final", yf]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
    await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  }
  const [ligneA, ligneB] = (await idsDe("line")).filter((id) => !lignesAvantAnnotations.includes(id));
  check("annotations : deux lignes saisies", !!ligneA && !!ligneB);
  await page.evaluate(() => document.activeElement?.blur());
  // Accrochage aux sommets coupé : les clics visent les segments, pas leurs extrémités ; la vue cadre tout le dessin.
  await page.keyboard.press("Shift+S");
  await page.keyboard.press("Shift+Z");
  await page.keyboard.press("Shift+A");
  check("annotations : Maj+A choisit l'outil Cote angulaire", (await element(outils, "Cote angulaire").getAttribute("aria-pressed")) === "true");
  await cliquer(42.5, 40);
  await cliquer(40, 41.5);
  const angulaire = page.locator("svg [data-studio-cote-angulaire]");
  await angulaire.waitFor({ state: "attached" });
  check("annotations : deux clics sur deux segments lient la cote angulaire (90,00°)", (await angulaire.getAttribute("data-studio-angle")) === "90.000"
    && (await angulaire.locator("text").textContent()) === "90,00°" && (await angulaire.getAttribute("data-studio-cote-etat")) === "resolue");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+T");
  check("annotations : Maj+T choisit l'outil Texte", (await element(outils, "Texte").getAttribute("aria-pressed")) === "true");
  await proprietes.getByLabel("Texte", { exact: true }).fill("Séjour — nord");
  await proprietes.getByLabel("Hauteur du texte", { exact: true }).fill("0.5");
  await proprietes.locator('[data-studio-champ="justification"]').selectOption("center");
  await page.evaluate(() => document.activeElement?.blur());
  await cliquer(41, 44.5);
  const texteAnnotation = page.locator("svg [data-studio-texte]");
  await texteAnnotation.waitFor({ state: "attached" });
  check("annotations : un clic pose le texte saisi, tel quel (non traduit)", (await texteAnnotation.locator("text").textContent()) === "Séjour — nord"
    && (await texteAnnotation.locator("text").getAttribute("translate")) === "no" && (await texteAnnotation.locator("text").getAttribute("text-anchor")) === "middle");
  // La ligne B tourne (son extrémité est modifiée) : la cote angulaire liée suit, l'angle passe à 45°.
  await cliquerBouton(outils, "Sélection");
  await page.locator(`[data-studio-objet="${ligneB}"]`).focus();
  await page.keyboard.press("Enter");
  await page.locator(`[data-studio-selection="${ligneB}"]`).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("e");
  await proprietes.getByLabel("X final", { exact: true }).fill("43");
  await proprietes.getByLabel("Y final", { exact: true }).fill("43");
  await proprietes.getByRole("button", { name: "Modifier la sélection", exact: true }).click();
  await page.locator('svg [data-studio-cote-angulaire][data-studio-angle="45.000"]').waitFor({ state: "attached" });
  check("annotations : la ligne liée modifiée, l'angle suit (45,00°)", (await angulaire.locator("text").textContent()) === "45,00°");
  await page.keyboard.press("Shift+S");
  const avantAnnotations = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiAnnotations = envois[envois.length - 1];
  check("annotations : enregistrées en une enveloppe (deux lignes, cote angulaire, texte, modification)", envois.length === avantAnnotations + 1
    && JSON.stringify(envoiAnnotations.commands.map((c) => c.toolId)) === JSON.stringify(["studio.dessin.ligne", "studio.dessin.ligne", "studio.dessin.cote-angulaire", "studio.dessin.texte", "studio.dessin.modifier"]), JSON.stringify(envoiAnnotations?.commands.map((c) => c.toolId)));
  const annotes = await a.api("get", variantePath);
  const angServeur = annotes.revision.document.annotations.find((x) => x.type === "angular-dimension");
  const texteServeur = annotes.revision.document.annotations.find((x) => x.type === "text");
  check("annotations : relues du serveur (liens, sommet, aucune valeur d'angle stockée ; texte tel quel)",
    angServeur.links.first.objectId === ligneA && angServeur.links.second.objectId === ligneB && angServeur.vertex.x === 40 && angServeur.vertex.y === 40 && !("value" in angServeur)
    && texteServeur.content === "Séjour — nord" && texteServeur.height === 0.5 && texteServeur.justification === "center", JSON.stringify(annotes.revision.document.annotations));
  const empreinteAnnotations = await empreinte();
  await page.reload();
  await page.locator("svg [data-studio-cote-angulaire]").waitFor({ state: "attached" });
  check("annotations : l'actualisation restitue le même dessin", (await empreinte()) === empreinteAnnotations && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(annotes.revision));
  // Suppression de la ligne B : la cote angulaire passe « à résoudre », elle n'est ni supprimée ni rattachée ailleurs.
  await page.locator(`[data-studio-objet="${ligneB}"]`).focus();
  await page.keyboard.press("Enter");
  await page.locator(`[data-studio-selection="${ligneB}"]`).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Delete");
  await page.locator("[data-studio-cotes-angulaires-a-resoudre]").waitFor();
  check("annotations : la ligne liée supprimée, la cote angulaire passe « à résoudre »", (await angulaire.getAttribute("data-studio-cote-etat")) === "a-resoudre"
    && (await angulaire.getAttribute("data-studio-angle")) === null && (await page.locator("[data-studio-cotes-angulaires-a-resoudre]").getAttribute("data-studio-cotes-angulaires-a-resoudre")) === "1");
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const resolu = await a.api("get", variantePath);
  const empreinteResoudre = await empreinte();
  await page.reload();
  await page.locator("[data-studio-cotes-angulaires-a-resoudre]").waitFor();
  check("annotations : « à résoudre » enregistré, actualisation identique", resolu.revision.document.annotations.find((x) => x.type === "angular-dimension").toResolve === true
    && (await empreinte()) === empreinteResoudre && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(resolu.revision));
  const dxfAnnotations = await page.request.get(`${BASE}${variantePath}/export?format=dxf`);
  if (dxfAnnotations.status() === 404) console.log("· export DXF : point d'entrée absent de ce serveur");
  else {
    const t = await dxfAnnotations.text();
    check("annotations : l'export DXF contient le TEXT du texte (justifié, 72 = 1) et l'ARC de la cote « à résoudre »",
      t.includes("\r\nTEXT\r\n") && t.includes("\r\n1\r\nS\\U+00E9jour \\U+2014 nord\r\n") && t.includes("\r\n72\r\n1\r\n") && t.includes("\\U+00E0 r\\U+00E9soudre") && /\r\nARC\r\n/.test(t));
    const svg = await (await page.request.get(`${BASE}${variantePath}/export?format=svg`)).text();
    check("annotations : l'export SVG contient le texte et la cote angulaire", svg.includes(`<text data-text="${texteServeur.id}"`) && svg.includes(">Séjour — nord</text>") && svg.includes(`<g data-angular-dimension="${angServeur.id}" data-status="to-resolve">`));
  }

  // Grand import (600 lignes, mètres) sur la variante initiale : deux enveloppes chaînées (500 puis 100 commandes).
  const baseInitiale = `${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${initialVariantId}`;
  const cheminInitial = `/projects/${pA.id}/studio/studies/${studyId}/variants/${initialVariantId}`;
  await page.goto(baseInitiale);
  await outils.first().waitFor();
  const teteInitiale = (await a.api("get", cheminInitial)).revision;
  const grand = dxfDe(6, Array.from({ length: 600 }, (_, i) => ["0", "LINE", "8", "0", "10", "0", "20", String(i), "11", "5", "21", String(i)]).flat());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+U");
  await boiteImport.waitFor();
  await boiteImport.locator("[data-studio-import-fichier]").setInputFiles({ name: "grand.dxf", mimeType: "application/dxf", buffer: Buffer.from(grand) });
  await rapportImport.waitFor();
  check("Import DXF : 600 lignes annoncées, unité m du fichier, tout est pris", (await rapportImport.getAttribute("data-studio-import-objets")) === "600" && (await rapportImport.getAttribute("data-studio-import-unite")) === "m" && (await rapportImport.locator("[data-studio-import-tout-pris]").count()) === 1);
  await boiteImport.locator("[data-studio-import-ajouter]").click();
  await boiteImport.waitFor({ state: "detached" });
  const avantGrand = envois.length;
  // Le second lot est refusé une fois (400) : le brouillon repart de la révision du premier lot, avec les 100
  // commandes non envoyées seules en attente ; un nouvel « Enregistrer » envoie ce reste.
  let lotsVus = 0;
  await page.route("**/commands", (route) => (++lotsVus === 2 ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_commands" }) }) : route.continue()));
  await page.keyboard.press("Control+s");
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "Enregistrement partiel : 1 lot(s) sur 2" }).waitFor();
  await page.unroute("**/commands");
  const apresPremier = await a.api("get", cheminInitial);
  // EX-014 : la source déclarée accompagne le lot (600 lignes + 1 source = 601 commandes : 500 puis 101).
  check("Import DXF : refus du second lot — 500 commandes enregistrées, les 101 autres (100 lignes et la source) seules en attente, sur la révision du premier lot",
    apresPremier.revision.document.objects.length === teteInitiale.document.objects.length + 500 && (await portee()).includes("(101 commande(s)")
    && (await page.locator("[data-studio-revision-affichee]").getAttribute("title")) === apresPremier.revision.id
    && (await page.locator("[data-studio-erreur-planche]").textContent()).includes("101 commande(s) non envoyée(s)"), await portee());
  await cliquerBouton(outils, "Enregistrer");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const lotsGrand = envois.slice(avantGrand);
  const grandRelu = await a.api("get", cheminInitial);
  check("Import DXF : enregistrement en deux enveloppes (500 + 101, la source comprise), la seconde sur la révision de la première",
    lotsGrand.length === 3 && lotsGrand[0].commands.length === 500 && lotsGrand[1].commands.length === 101 && lotsGrand[1].commands.at(-1).toolId === "studio.source.declarer" && lotsGrand[0].baseRevisionId === teteInitiale.id
    && lotsGrand[1].baseRevisionId === apresPremier.revision.id && JSON.stringify(lotsGrand[2].commands) === JSON.stringify(lotsGrand[1].commands) && lotsGrand[2].baseRevisionId === apresPremier.revision.id
    && grandRelu.revision.parentRevisionId === apresPremier.revision.id && grandRelu.revision.document.objects.length === teteInitiale.document.objects.length + 600
    && (grandRelu.revision.document.sources ?? []).some((s) => s.nomFichier === "grand.dxf" && s.objets === 600),
    lotsGrand.map((e) => `${e.commands.length}@${e.baseRevisionId}`).join(" "));

  // Accrochage et saisie de précision (moteur `planche2d/accrochage/`) : sur une variante neuve portant deux lignes
  // sécantes, une ligne part exactement de leur intersection ; une ligne menée d'un point tombe au pied de la
  // perpendiculaire ; repérage polaire 45° et longueur tapée 3 : coordonnées exactes ; enregistrement, relecture identique.
  {
    const accVariante = await a.api("post", `/projects/${pA.id}/studio/studies/${studyId}/variants`, { name: "Accrochages" });
    const accChemin = `/projects/${pA.id}/studio/studies/${studyId}/variants/${accVariante.variant.id}`;
    await a.api("post", `${accChemin}/commands`, { contractVersion: "studio-commands/1", requestId: `acc-${Date.now()}`, baseRevisionId: accVariante.revision.id, commands: [
      { toolId: "studio.dessin.ligne", params: { id: "acc-l1", type: "line", start: { x: 2, y: 2 }, end: { x: 9, y: 9 } } },
      // Milieux (5,5 ; 5,5) et (6 ; 4) : seule l'intersection (5 ; 5) est au croisement.
      { toolId: "studio.dessin.ligne", params: { id: "acc-l2", type: "line", start: { x: 2, y: 8 }, end: { x: 10, y: 0 } } },
    ] });
    await page.goto(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${accVariante.variant.id}`);
    await page.locator('svg [data-studio-objet="acc-l2"]').waitFor({ state: "attached" });
    const net = (v) => Math.round(v * 1e9) / 1e9;
    const ecran = (x, y) => planche.evaluate((svg, w) => {
      const versEcran = () => new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM());
      const s = versEcran();
      if (s.y < 40 || s.y > window.innerHeight - 40) window.scrollBy(0, s.y - window.innerHeight / 2);
      const t = versEcran();
      return { x: t.x, y: t.y };
    }, { x, y });
    const survoler = async (x, y) => { const p = await ecran(x, y); await page.mouse.move(p.x, p.y); };
    const repere = page.locator("svg [data-studio-accroche-mode]");
    const lignesAcc = async () => (await a.api("get", accChemin)).revision.document.objects.filter((o) => o.type === "line" && !o.id.startsWith("acc-"));
    const nouvelles = () => page.locator('svg [data-studio-type="line"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-objet")).filter((id) => !id.startsWith("acc-")));
    const geometrieDe = (id) => page.locator(`[data-studio-objet="${id}"] line`).evaluate((l) => ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))));

    check("accrochage : barres Accrochage et Repérage, une bascule par mode avec son icône et son raccourci",
      (await outils.locator('[data-studio-famille="vue"] [data-studio-commande="accrochage-intersection"][aria-keyshortcuts="X"][aria-pressed="true"] svg path').count()) === 1
      && (await outils.locator('[data-studio-famille="vue"] [data-studio-commande="accrochage-perpendiculaire"][aria-keyshortcuts="N"][aria-pressed="false"]').count()) === 1
      && (await outils.locator('[data-studio-famille="vue"] [data-studio-commande="reperage-polaire"][aria-keyshortcuts="F10"][aria-pressed="false"]').count()) === 1
      && (await outils.locator('[data-studio-famille="vue"] [data-studio-commande="reperage-orthogonal"][aria-keyshortcuts="F8"]').count()) === 1);

    // 1. Intersection : le repère « Intersection » s'affiche près du croisement ; le premier point en est exactement.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("l");
    await survoler(5.06, 4.95);
    await repere.waitFor();
    check("accrochage : repère « Intersection » au croisement des deux lignes", (await repere.getAttribute("data-studio-accroche-mode")) === "intersection"
      && (await repere.getAttribute("data-studio-accroche-point")) === "5 5" && (await repere.locator("text").textContent()) === "Intersection");
    await cliquer(5.06, 4.95);
    await page.locator("[data-studio-mesures]").waitFor();
    await cliquer(11, 3.5);
    const [idInter] = await nouvelles();
    const inter = await geometrieDe(idInter);
    check("accrochage : la ligne part exactement de l'intersection (5 ; 5)", inter[0] === 5 && inter[1] === 5, inter.join(" "));

    // 2. Perpendiculaire depuis un point posé : pied exact sur la ligne y = x.
    await page.keyboard.press("n");
    check("accrochage : N active l'accrochage en perpendiculaire", (await element(outils, "Accrocher en perpendiculaire").getAttribute("aria-pressed")) === "true");
    await cliquer(12, 2);
    const depart = await page.locator("svg .studio-point-pose").first().evaluate((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);
    const pied = net((depart[0] + depart[1]) / 2);
    await survoler(pied + 0.08, pied - 0.05);
    await page.locator('svg [data-studio-accroche-mode="perpendiculaire"]').waitFor();
    await cliquer(pied + 0.08, pied - 0.05);
    const idPerp = (await nouvelles()).find((id) => id !== idInter);
    const perp = await geometrieDe(idPerp);
    const produit = (perp[2] - perp[0]) * 6 + (perp[3] - perp[1]) * 6;
    check("accrochage : la ligne menée du point tombe au pied de la perpendiculaire", perp[2] === pied && perp[3] === pied && Math.abs(produit) < 1e-9, perp.join(" "));
    await page.keyboard.press("n");

    // 3. Repérage polaire 45° (F10) et longueur tapée « 3 » : extrémité exacte.
    await page.keyboard.press("F10");
    check("repérage : F10 active le repérage polaire", (await element(outils, "Repérage polaire").getAttribute("aria-pressed")) === "true");
    await cliquer(3, 11);
    const debutPolaire = await page.locator("svg .studio-point-pose").first().evaluate((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);
    await survoler(debutPolaire[0] + 2, debutPolaire[1] + 2.03);
    await page.locator('svg [data-studio-accroche-mode="polaire"]').waitFor();
    check("repérage : repère « Polaire 45° », angle affiché dans le champ Mesures", (await page.locator('svg [data-studio-accroche-mode="polaire"] text').textContent()) === "Polaire 45°"
      && (await page.locator("[data-studio-mesures-angle]").getAttribute("data-studio-mesures-angle")) === "45");
    await page.keyboard.press("3");
    check("saisie : taper un chiffre ouvre le champ Mesures", (await page.locator("[data-studio-mesures-saisie]").inputValue()) === "3" && (await page.evaluate(() => document.activeElement?.hasAttribute("data-studio-mesures-saisie"))));
    await page.keyboard.press("Enter");
    await page.locator("[data-studio-mesures]").waitFor({ state: "detached" });
    const idPolaire = (await nouvelles()).find((id) => id !== idInter && id !== idPerp);
    const polaire = await geometrieDe(idPolaire);
    const attendu = [net(debutPolaire[0] + 3 * Math.cos(Math.PI / 4)), net(debutPolaire[1] + 3 * Math.sin(Math.PI / 4))];
    check("saisie : polaire 45° et longueur 3 → extrémité exacte", polaire[2] === attendu[0] && polaire[3] === attendu[1] && Math.abs(Math.hypot(polaire[2] - polaire[0], polaire[3] - polaire[1]) - 3) < 1e-8, `${polaire.join(" ")} / ${attendu.join(" ")}`);
    await page.keyboard.press("F10");

    // Enregistrement puis relecture identique.
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
    const enregistrees = await lignesAcc();
    const parId = Object.fromEntries(enregistrees.map((o) => [o.id, [o.start.x, o.start.y, o.end.x, o.end.y]]));
    check("accrochage : trois lignes enregistrées avec les coordonnées exactes", enregistrees.length === 3
      && JSON.stringify(parId[idInter]) === JSON.stringify(inter) && JSON.stringify(parId[idPerp]) === JSON.stringify(perp) && JSON.stringify(parId[idPolaire]) === JSON.stringify(polaire), JSON.stringify(parId));
    const avantRelecture = await empreinte();
    await page.reload();
    await page.locator(`svg [data-studio-objet="${idPolaire}"]`).waitFor({ state: "attached" });
    check("accrochage : l'actualisation restitue le même dessin", (await empreinte()) === avantRelecture && JSON.stringify(await lignesAcc()) === JSON.stringify(enregistrees));

    // EX-037 : la palette (Ctrl+K) ouverte puis refermée PENDANT un geste — premier point posé, repérage polaire 45°,
    // longueur « 2 » tapée — ne perd ni le point posé, ni la contrainte, ni la saisie : Entrée trace exactement la ligne.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("l");
    if ((await element(outils, "Repérage polaire").getAttribute("aria-pressed")) !== "true") await page.keyboard.press("F10");
    await cliquer(3, 14);
    const debutGeste = await page.locator("svg .studio-point-pose").first().evaluate((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);
    await survoler(debutGeste[0] + 2, debutGeste[1] + 2.03);
    await page.locator('svg [data-studio-accroche-mode="polaire"]').waitFor();
    await page.keyboard.press("2");
    await page.locator("[data-studio-mesures-saisie]").waitFor();
    await page.keyboard.press("Control+k");
    const paletteGeste = page.locator("[data-studio-palette]");
    const paletteOuverte = await paletteGeste.waitFor({ timeout: 5000 }).then(() => true, () => false);
    await page.keyboard.press("Escape");
    await paletteGeste.waitFor({ state: "detached" });
    check("geste : palette ouverte puis fermée pendant la saisie — point posé, champ Mesures et saisie « 2 » conservés, polaire toujours actif",
      paletteOuverte && (await page.locator("svg .studio-point-pose").count()) >= 1 && (await page.locator("[data-studio-mesures-saisie]").inputValue()) === "2"
        && (await element(outils, "Repérage polaire").getAttribute("aria-pressed")) === "true" && (await nouvelles()).length === 3);
    await page.locator("[data-studio-mesures-saisie]").focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-studio-mesures]").waitFor({ state: "detached" });
    const idGeste = (await nouvelles()).find((id) => ![idInter, idPerp, idPolaire].includes(id));
    const geste = idGeste ? await geometrieDe(idGeste) : [];
    const attenduGeste = [net(debutGeste[0] + 2 * Math.cos(Math.PI / 4)), net(debutGeste[1] + 2 * Math.sin(Math.PI / 4))];
    check("geste : après la palette, Entrée trace la ligne polaire 45° de longueur 2 depuis le point posé (aucun paramètre remplacé)",
      geste[0] === debutGeste[0] && geste[1] === debutGeste[1] && geste[2] === attenduGeste[0] && geste[3] === attenduGeste[1], `${geste.join(" ")} / ${attenduGeste.join(" ")}`);
    await page.keyboard.press("F10");
    await page.keyboard.press("Escape");
  }
  // Transformations (barre Modification) sur une sélection mixte (rectangle, cercle, ligne, arc) : Copier ×3 (D),
  // aperçu au pointeur, Rotation 90° (Maj+R), Symétrie en gardant l'original (I), Échelle 2 (S) ; enregistrement en
  // une enveloppe, géométrie relue du serveur, actualisation identique.
  await page.goto(base);
  await outils.first().waitFor();
  await page.locator("svg [data-studio-objet]").first().waitFor({ state: "attached" });
  check("transformations : Copier (D), Rotation (Maj+R), Symétrie (I), Échelle (S) dans la barre Modification, icônes propres",
    (await outils.locator('[data-studio-famille="modification"] [data-studio-outil="studio.dessin.copier"][aria-keyshortcuts="D"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="modification"] [data-studio-outil="studio.dessin.rotation"][aria-keyshortcuts="Shift+R"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="modification"] [data-studio-outil="studio.dessin.symetrie"][aria-keyshortcuts="I"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="modification"] [data-studio-outil="studio.dessin.echelle"][aria-keyshortcuts="S"] svg path').count()) === 1);
  const tousIds = () => page.locator("svg [data-studio-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-objet")));
  const idsAvantT = await tousIds();
  const saisir = async (outil, champs, bouton) => {
    await cliquerBouton(outils, outil);
    for (const [nom, v] of champs) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
    await proprietes.getByRole("button", { name: bouton, exact: true }).click();
  };
  await saisir("Rectangle", [["X", 40], ["Y", 0], ["Largeur", 2], ["Hauteur", 1]], "Ajouter au dessin");
  await saisir("Cercle", [["Centre X", 45], ["Centre Y", 0.5], ["Rayon", 0.5]], "Ajouter au dessin");
  await saisir("Ligne", [["X", 40], ["Y", -2], ["X final", 44], ["Y final", -2]], "Ajouter au dessin");
  await saisir("Arc", [["Centre X", 48], ["Centre Y", 0], ["Rayon", 1], ["Angle de début (°)", 0], ["Angle de fin (°)", 90]], "Ajouter au dessin");
  const formesT = (await tousIds()).filter((id) => !idsAvantT.includes(id));
  check("transformations : rectangle, cercle, ligne et arc posés", formesT.length === 4, formesT.join(" "));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+Z");
  await cliquerBouton(outils, "Sélection");
  for (const [i, id] of formesT.entries()) {
    await page.locator(`[data-studio-objet="${id}"]`).focus();
    await page.keyboard.press(i === 0 ? "Enter" : "Shift+Enter");
  }
  check("transformations : sélection mixte de quatre objets", (await page.locator("[data-studio-selection-compte]").getAttribute("data-studio-selection-compte")) === "4");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("d");
  check("transformations : D choisit l'outil Copier", (await element(outils, "Copier").getAttribute("aria-pressed")) === "true");
  // Aperçu au pointeur : point de base, survol de la destination → les copies apparaissent sans rien appliquer.
  const nObjets = (await tousIds()).length;
  await cliquer(40, 0);
  const survolEcran = await planche.evaluate((svg) => { const p = new DOMPoint(40, 6).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y }; });
  await page.mouse.move(survolEcran.x, survolEcran.y);
  await page.waitForFunction((n) => document.querySelectorAll("svg [data-studio-objet]").length === n, nObjets + 4);
  await page.keyboard.press("Escape");
  await page.waitForFunction((n) => document.querySelectorAll("svg [data-studio-objet]").length === n, nObjets);
  check("transformations : aperçu de la copie au survol, Échap l'annule sans rien appliquer", (await tousIds()).length === nObjets);
  for (const [nom, v] of [["Déplacement X", 0], ["Déplacement Y", 3], ["Copies", 3]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Copier la sélection", exact: true }).click();
  check("transformations : Copier ×3 ajoute douze objets", (await tousIds()).length === nObjets + 12);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+R");
  check("transformations : Maj+R choisit Rotation", (await element(outils, "Rotation").getAttribute("aria-pressed")) === "true");
  for (const [nom, v] of [["Centre X", 40], ["Centre Y", 0], ["Angle (°)", 90]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Tourner la sélection", exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("i");
  check("transformations : I choisit Symétrie, « Conserver l’original » coché", (await element(outils, "Symétrie").getAttribute("aria-pressed")) === "true" && (await proprietes.getByLabel("Conserver l’original", { exact: true }).isChecked()));
  for (const [nom, v] of [["Axe : X du premier point", 40], ["Axe : Y du premier point", -5], ["Axe : X du second point", 41], ["Axe : Y du second point", -5]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Symétrie de la sélection", exact: true }).click();
  check("transformations : la symétrie garde l'original et ajoute quatre objets", (await tousIds()).length === nObjets + 16);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("s");
  check("transformations : S choisit Échelle", (await element(outils, "Échelle").getAttribute("aria-pressed")) === "true");
  for (const [nom, v] of [["Centre X", 40], ["Centre Y", 0], ["Facteur", 2]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Mettre la sélection à l’échelle", exact: true }).click();
  const avantEnvoiT = envois.length;
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiT = envois[envois.length - 1];
  check("transformations : une enveloppe (4 créations, copier, rotation, symétrie, échelle)", envois.length === avantEnvoiT + 1
    && JSON.stringify(envoiT.commands.map((c) => c.toolId).slice(4)) === JSON.stringify(["studio.dessin.copier", "studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle"])
    && envoiT.commands[5].params.angle === Math.PI / 2, JSON.stringify(envoiT?.commands.map((c) => c.toolId)));
  const transfo = await a.api("get", variantePath);
  const objT = (id) => transfo.revision.document.objects.find((o) => o.id === id);
  const [rectT, cercleT, ligneT, arcT] = formesT.map(objT);
  const prefixeCopie = envoiT.commands[4].params.prefix, prefixeMiroir = envoiT.commands[6].params.prefix;
  const copie3 = objT(`${prefixeCopie}-3-0`), miroir = objT(`${prefixeMiroir}-1-0`), miroirArc = objT(`${prefixeMiroir}-1-3`);
  check("transformations : géométrie relue (rotation 90° puis échelle 2 autour de (40, 0) ; copies et symétrique intacts)",
    JSON.stringify([rectT.type, rectT.origin, rectT.width, rectT.height]) === JSON.stringify(["rectangle", { x: 38, y: 0 }, 2, 4])
    && JSON.stringify([cercleT.center, cercleT.radius]) === JSON.stringify([{ x: 39, y: 10 }, 1])
    && JSON.stringify([ligneT.start, ligneT.end]) === JSON.stringify([{ x: 44, y: 0 }, { x: 44, y: 8 }])
    && arcT.type === "arc" && arcT.radius === 2 && Math.abs(arcT.startAngle - Math.PI / 2) < 1e-12 && Math.abs(arcT.endAngle - Math.PI) < 1e-12
    && JSON.stringify([copie3.origin, copie3.width, copie3.height]) === JSON.stringify([{ x: 40, y: 9 }, 2, 1])
    && JSON.stringify([miroir.type, miroir.origin, miroir.width, miroir.height]) === JSON.stringify(["rectangle", { x: 39, y: -12 }, 1, 2])
    && miroirArc.type === "arc" && miroirArc.radius === 1,
    JSON.stringify({ rectT, cercleT, ligneT, arcT, copie3, miroir, miroirArc }));
  const empreinteT = await empreinte();
  await page.reload();
  await page.locator(`[data-studio-objet="${formesT[0]}"]`).waitFor({ state: "attached" });
  check("transformations : l'actualisation restitue le même dessin", (await empreinte()) === empreinteT && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(transfo.revision));

  // Murs et ouvertures (A.4, REC-A-03) : famille « Architecture » (Mur W, Ouverture H, Modifier J, Supprimer
  // avec cascade Ctrl+Suppr), aucune dimension proposée ; mur 6 × 3 × 0,2 m saisi au clavier, ouverture 1 × 2,1 m posée
  // d'un clic sur le mur ; même identifiant sur la planche et dans la vue 3D ; élargissement à 1,20 m depuis la vue 3D
  // (volume net 3,180 → 3,096 m³) ; mur abaissé sous l'ouverture refusé avec son motif, sans commande ajoutée ;
  // enregistrement en une enveloppe, actualisation identique, export SVG avec le vide de l'ouverture.
  await page.evaluate(() => document.activeElement?.blur());
  check("architecture : Mur (W), Ouverture (H), Modifier (J), Supprimer le mur et ses ouvertures (Ctrl+Suppr) dans la famille Architecture, icônes propres",
    (await outils.locator('[data-studio-famille="architecture"] [data-studio-outil="studio.architecture.mur"][aria-keyshortcuts="W"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="architecture"] [data-studio-outil="studio.architecture.ouverture"][aria-keyshortcuts="H"] svg path').count()) === 1
    && (await outils.locator('[data-studio-famille="architecture"] [data-studio-outil="studio.architecture.modifier"][aria-keyshortcuts="J"]').count()) === 1
    && (await outils.locator('[data-studio-famille="architecture"] [data-studio-outil="studio.architecture.supprimer"][aria-keyshortcuts="Control+Delete"]').count()) === 1);
  await page.keyboard.press("w");
  const formMur = proprietes.locator("[data-studio-architecture-mur-formulaire]");
  await formMur.waitFor();
  check("architecture : W choisit Mur, aucune dimension proposée", (await element(outils, "Mur").getAttribute("aria-pressed")) === "true"
    && (await formMur.getByLabel("Épaisseur (m)").inputValue()) === "" && (await formMur.getByLabel("Hauteur (m)").inputValue()) === "" && (await formMur.locator('[data-studio-champ-architecture="justification"]').inputValue()) === "");
  await formMur.getByLabel("Axe (x y ; …)").fill("0 -30; 6 -30");
  await formMur.getByRole("button", { name: "Créer le mur", exact: true }).click();
  check("architecture : création impossible tant que les dimensions ne sont pas saisies (champs exigés, aucun mur créé)",
    (await page.locator("svg [data-studio-architecture]").count()) === 0 && (await formMur.getByLabel("Épaisseur (m)").evaluate((e) => e.validity.valueMissing)) && (await portee()).includes("(0 commande(s)"), await portee());
  for (const [libelle, v] of [["Épaisseur (m)", "0.2"], ["Hauteur (m)", "3"], ["Cote de base z (m)", "0"]]) await formMur.getByLabel(libelle, { exact: true }).fill(v);
  await formMur.locator('[data-studio-champ-architecture="justification"]').selectOption("center");
  await formMur.getByRole("button", { name: "Créer le mur", exact: true }).click();
  const murPlanche = page.locator('svg [data-studio-architecture][data-studio-type="wall"]');
  await murPlanche.waitFor({ state: "attached" });
  const idMur = await murPlanche.getAttribute("data-studio-architecture");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+Z");
  await page.keyboard.press("h");
  const formOuv = proprietes.locator("[data-studio-architecture-ouverture-formulaire]");
  await formOuv.waitFor();
  for (const [libelle, v] of [["Largeur (m)", "1"], ["Hauteur (m)", "2.1"], ["Allège (m)", "0"]]) await formOuv.getByLabel(libelle, { exact: true }).fill(v);
  // Clic sur l'axe du mur en (3 ; −30) : point du repère du document converti en point de l'écran par la planche.
  await planche.scrollIntoViewIfNeeded();
  const ecran = await page.evaluate(() => {
    const svg = document.querySelector('[aria-label="Planche de dessin 2D"]');
    const q = svg.createSVGPoint(); q.x = 3; q.y = -30;
    const r = q.matrixTransform(svg.getScreenCTM());
    return { x: r.x, y: r.y };
  });
  await page.mouse.click(ecran.x, ecran.y);
  const ouvPlanche = page.locator('svg [data-studio-architecture][data-studio-type="opening"]');
  const ouvPosee = await ouvPlanche.waitFor({ state: "attached", timeout: 5000 }).then(() => true, () => false);
  check("architecture : H choisit Ouverture ; un clic sur le mur la pose", ouvPosee, `${JSON.stringify(ecran)} · ${await page.locator(".studio-alert, .studio-info").allTextContents()} · ${await page.locator(".studio-hint").first().textContent()}`);
  const idOuv = await ouvPlanche.getAttribute("data-studio-architecture");
  check("architecture : un clic sur le mur pose l'ouverture ; le mur est dessiné en deux parties pleines autour du vide",
    (await murPlanche.locator("polygon").count()) === 2 && (await portee()).includes("(2 commande(s)"), await portee());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Escape");
  // Le mur créé au clavier est déjà sélectionné ; le bouton de la liste bascule la sélection.
  const choisirMur = proprietes.locator(`[data-studio-architecture-choisir="${idMur}"]`);
  if ((await choisirMur.getAttribute("aria-pressed")) !== "true") await choisirMur.click();
  const choisiMur = proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`);
  await choisiMur.waitFor();
  const netAvant = Number(await choisiMur.locator("[data-studio-architecture-metre]").getAttribute("data-studio-volume-net"));
  check("REC-A-03 : volume brut 3,600 m³, déduction 0,420 m³, net 3,180 m³", Math.abs(netAvant - 3.18) < 1e-9
    && Math.abs(Number(await choisiMur.locator("[data-studio-architecture-metre]").getAttribute("data-studio-volume-brut")) - 3.6) < 1e-9, String(netAvant));
  // Mur abaissé sous son ouverture : refus du modèle, motif affiché, aucune commande ajoutée.
  await choisiMur.getByLabel("Hauteur (m)", { exact: true }).fill("2");
  await choisiMur.getByRole("button", { name: "Appliquer", exact: true }).click();
  const alerte = await page.locator(".studio-alert").first().textContent();
  check("architecture : mur abaissé sous l'ouverture refusé, motif clair, brouillon inchangé", /incompatible avec son mur : plus haute que le mur hôte/.test(alerte ?? "") && (await portee()).includes("(2 commande(s)"), alerte ?? "");
  // Vue 3D : mêmes identifiants ; l'ouverture choisie dans la vue 3D s'élargit à 1,20 m.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const vueArchi = page.locator("[data-studio-vue3d]");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
  const ids3d = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")));
  check("architecture : la vue 3D porte les mêmes identifiants que la planche (mur, ouverture)", JSON.stringify(ids3d) === JSON.stringify([idMur, idOuv]), JSON.stringify(ids3d));
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idOuv}"]`).click();
  const choisiOuv = proprietes.locator(`[data-studio-architecture-choisi="${idOuv}"]`);
  await choisiOuv.waitFor();
  await choisiOuv.getByLabel("Largeur (m)", { exact: true }).fill("1.2");
  await choisiOuv.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "3");
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
  await choisiMur.waitFor();
  const netApres = Number(await choisiMur.locator("[data-studio-architecture-metre]").getAttribute("data-studio-volume-net"));
  check("REC-A-03 : élargie à 1,20 m depuis la vue 3D — déduction 0,504 m³, net 3,096 m³", Math.abs(netApres - 3.096) < 1e-9
    && Math.abs(Number(await choisiMur.locator("[data-studio-architecture-metre]").getAttribute("data-studio-volume-deduit")) - 0.504) < 1e-9, String(netApres));
  await page.screenshot({ path: join(OUT, "studio-architecture-3d.png") });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const avantArchi = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiArchi = envois[envois.length - 1];
  check("architecture : une enveloppe (mur, ouverture, modifier), même identité de l'ouverture", envois.length === avantArchi + 1
    && JSON.stringify(envoiArchi.commands.map((c) => c.toolId)) === JSON.stringify(["studio.architecture.mur", "studio.architecture.ouverture", "studio.architecture.modifier"])
    && envoiArchi.commands[2].params.id === idOuv && envoiArchi.commands[2].params.width === 1.2, JSON.stringify(envoiArchi?.commands));
  const reluArchi = await a.api("get", variantePath);
  const archiRelue = reluArchi.revision.document.architecture ?? [];
  check("architecture : le serveur range mur et ouverture dans `architecture`, valeurs saisies exactes",
    JSON.stringify(archiRelue.map((x) => x.id)) === JSON.stringify([idMur, idOuv]) && JSON.stringify(archiRelue[0].axis) === JSON.stringify([{ x: 0, y: -30 }, { x: 6, y: -30 }])
    && archiRelue[0].thickness === 0.2 && archiRelue[0].height === 3 && archiRelue[1].width === 1.2 && archiRelue[1].height === 2.1 && archiRelue[1].kind === undefined, JSON.stringify(archiRelue));
  await page.reload();
  await page.locator(`svg [data-studio-architecture="${idOuv}"]`).waitFor({ state: "attached" });
  check("architecture : l'actualisation restitue le même mur et la même ouverture", JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(reluArchi.revision)
    && (await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).count()) === 2);
  await page.screenshot({ path: join(OUT, "studio-architecture-plan.png") });
  const svgArchi = await page.request.get(`${BASE}${variantePath}/export?format=svg`);
  if (svgArchi.status() === 404) console.log("· export SVG : point d'entrée absent de ce serveur");
  else {
    const t = await svgArchi.text();
    check("architecture : l'export SVG dessine le mur interrompu par l'ouverture", t.includes(`<g data-architecture="wall" data-id="${idMur}">`) && t.includes(`<g data-architecture="opening" data-id="${idOuv}" data-host="${idMur}">`));
  }
  // Le mur se sélectionne sur la planche comme un objet et se copie (Copier, D) : son ouverture est copiée avec lui ;
  // la copie est enregistrée et relue identique.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+Z");
  await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().click();
  await page.waitForFunction((id) => document.querySelector(`svg [data-studio-architecture="${id}"]`)?.getAttribute("aria-pressed") === "true", idMur);
  check("architecture : un clic sur le mur le sélectionne sur la planche (et l'ouvre dans le panneau)", (await proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`).count()) === 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("d");
  for (const [nom, v] of [["Déplacement X", 0], ["Déplacement Y", 3], ["Copies", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Copier la sélection", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('svg [data-studio-architecture][data-studio-type="wall"]').length === 2);
  const avantCopie = envois.length;
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiCopie = envois[envois.length - 1];
  const copieRelue = (await a.api("get", variantePath)).revision.document.architecture ?? [];
  const murCopie = copieRelue.find((x) => x.type === "wall" && x.id !== idMur);
  const ouvCopie = copieRelue.find((x) => x.type === "opening" && x.id !== idOuv);
  check("architecture : copie du mur enregistrée (studio.dessin.copier), ouverture copiée avec lui, valeurs exactes",
    envois.length === avantCopie + 1 && JSON.stringify(envoiCopie.commands.map((c) => [c.toolId, c.params.ids])) === JSON.stringify([["studio.dessin.copier", [idMur]]])
    && copieRelue.length === 4 && JSON.stringify(murCopie?.axis) === JSON.stringify([{ x: 0, y: -27 }, { x: 6, y: -27 }]) && ouvCopie?.hostId === murCopie?.id && ouvCopie?.width === 1.2,
    JSON.stringify(copieRelue));
  await page.reload();
  await page.locator(`svg [data-studio-architecture="${murCopie?.id}"]`).waitFor({ state: "attached" });
  check("architecture : l'actualisation restitue le mur copié et son ouverture", (await page.locator('svg [data-studio-architecture][data-studio-type="opening"]').count()) === 2);

  // A.4-03 / A.4-09 — le même mur modifié avec succès depuis la planche 2D (hauteur 3 → 3,2 m), puis depuis la vue 3D
  // (épaisseur 0,2 → 0,25 m) : même objectId de bout en bout, ouverture toujours portée par ce mur.
  {
    const enAttente = (n) => page.waitForFunction((x) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === x, String(n));
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+Z");
    await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().click();
    await page.waitForFunction((id) => document.querySelector(`svg [data-studio-architecture="${id}"]`)?.getAttribute("aria-pressed") === "true", idMur);
    const murEdite = proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`);
    await murEdite.getByLabel("Hauteur (m)", { exact: true }).fill("3.2");
    await murEdite.getByRole("button", { name: "Appliquer", exact: true }).click();
    await enAttente(1);
    const plan2d = await page.locator(`svg [data-studio-architecture="${idMur}"]`).count();
    check("A.4-09 : mur modifié depuis la planche 2D (hauteur 3,2 m) — accepté, une commande en attente, même mur dessiné", plan2d === 1 && (await portee()).includes("(1 commande(s)"), await portee());
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+D");
    await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
    await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
    await proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`).waitFor();
    await proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`).getByLabel("Épaisseur (m)", { exact: true }).fill("0.25");
    await proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`).getByRole("button", { name: "Appliquer", exact: true }).click();
    await enAttente(2);
    const ids3dApres = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")));
    check("A.4-09 : le même mur modifié ensuite depuis la vue 3D (épaisseur 0,25 m) — accepté, la vue 3D garde ses identifiants", ids3dApres.includes(idMur) && ids3dApres.includes(idOuv) && (await portee()).includes("(2 commande(s)"), JSON.stringify(ids3dApres));
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+D");
    const avantDeux = envois.length;
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
    const envoiDeux = envois[envois.length - 1];
    const archiDeux = (await a.api("get", variantePath)).revision.document.architecture ?? [];
    const murDeux = archiDeux.find((x) => x.id === idMur), ouvDeux = archiDeux.find((x) => x.id === idOuv);
    check("A.4-03 / A.4-09 : une enveloppe — deux « modifier » du même objectId (2D puis 3D) ; le serveur relit ce mur, hauteur 3,2 m et épaisseur 0,25 m, ouverture toujours hébergée",
      envois.length === avantDeux + 1 && JSON.stringify(envoiDeux.commands.map((c) => [c.toolId, c.params.id])) === JSON.stringify([["studio.architecture.modifier", idMur], ["studio.architecture.modifier", idMur]])
        && murDeux?.height === 3.2 && murDeux?.thickness === 0.25 && JSON.stringify(murDeux?.axis) === JSON.stringify([{ x: 0, y: -30 }, { x: 6, y: -30 }]) && ouvDeux?.hostId === idMur && ouvDeux?.width === 1.2
        && archiDeux.filter((x) => x.type === "wall").length === 2,
      JSON.stringify([envoiDeux?.commands, murDeux, ouvDeux]));
  }

  // Accessibilité de l'accueil Studio.
  await page.goto(`${BASE}/studio`);
  await page.locator("[data-studio-projets]").waitFor();
  await page.screenshot({ path: join(OUT, "studio-accueil.png") });
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => v.id));
  check("accessibilité de l'accueil Studio : aucune violation critique ou sérieuse", graves.length === 0, graves.join(", "));

  // Menu « Studio » de la barre latérale et barre des domaines : MÊME état, lu dans l'adresse ; historique ; adresse
  // directe ; refus ; suggestion de reprise sans redirection ; brouillon conservé au changement de domaine.
  const dialoguesMenu = [];
  page.on("dialog", (d) => dialoguesMenu.push(d.message()));
  const actifs = () => page.evaluate(() => ({
    menu: document.querySelector("[data-studio-menu-domaine][aria-current=page]")?.getAttribute("data-studio-menu-domaine") ?? null,
    barre: document.querySelector("[data-studio-domaines] a[aria-current=page]")?.getAttribute("data-studio-domaine-lien") ?? null,
    affiche: document.querySelector("[data-studio-domaine-affiche]")?.getAttribute("data-studio-domaine-affiche") ?? null,
  }));
  await page.goto(`${base}?domaine=visualisation`);
  await page.waitForSelector('[data-studio-domaine-affiche="visualisation"]');
  check("adresse directe d'un domaine : Visualisation affiché ; menu latéral et barre du haut synchronisés", JSON.stringify(await actifs()) === JSON.stringify({ menu: "visualisation", barre: "visualisation", affiche: "visualisation" }), JSON.stringify(await actifs()));
  check("menu latéral : déplié dans Studio, les domaines visent la variante affichée (sans garde)", (await page.locator("[data-studio-menu-lateral-bascule]").getAttribute("aria-expanded")) === "true"
    && (await page.locator('[data-studio-menu-domaine="bim"]').getAttribute("href")) === `${new URL(base).pathname}?domaine=bim` && (await page.locator('[data-studio-menu-domaine="bim"]').getAttribute("data-studio-sans-garde")) === "");
  // Brouillon non enregistré : une suppression en attente, puis changement de domaine par le menu latéral.
  await page.waitForSelector('[data-studio-domaine-affiche="visualisation"]');
  await page.locator('[data-studio-domaine-lien="dessin"]').click();
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  await page.locator('svg [role="button"]').first().waitFor({ state: "attached" });
  // Une modification non enregistrée : un nouveau calque (commande locale, en attente).
  await cliquerBouton(outils, "Nouveau calque");
  await page.waitForFunction(() => Number(document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre")) > 0);
  const attenteAvant = await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre");
  await page.locator('[data-studio-menu-domaine="bim"]').click();
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  check("menu latéral → BIM : barre du haut et menu synchronisés, même variante", JSON.stringify(await actifs()) === JSON.stringify({ menu: "bim", barre: "bim", affiche: "bim" }) && page.url() === `${base}?domaine=bim`, page.url());
  check("brouillon non enregistré conservé au changement de domaine, sans confirmation (NAV-007)", dialoguesMenu.length === 0
    && (await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre")) === attenteAvant && (await page.locator("[data-studio-etat]").textContent()) === "Brouillon non enregistré", dialoguesMenu.join(" | "));
  await page.locator('[data-studio-domaine-lien="documentation"]').click();
  await page.waitForSelector('[data-studio-domaine-affiche="documentation"]');
  await page.goBack();
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  check("retour du navigateur : domaine précédent (BIM), menu et barre synchronisés, brouillon intact, aucune confirmation", JSON.stringify(await actifs()) === JSON.stringify({ menu: "bim", barre: "bim", affiche: "bim" })
    && dialoguesMenu.length === 0 && (await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre")) === attenteAvant, JSON.stringify(await actifs()));
  await page.goBack();
  await page.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  check("retour du navigateur : encore un domaine plus tôt (Dessin et modélisation), la variante n'est pas déchargée", (await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre")) === attenteAvant);
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "0");
  // Révision historique : lecture seule dans tous les domaines (aucun domaine ne rouvre l'écriture).
  for (const d of ["dessin", "bim", "visualisation", "documentation"]) {
    await page.goto(`${base}?revision=${encodeURIComponent(ancienne)}&domaine=${d}`);
    await page.locator("[data-studio-lecture-seule-revision]").waitFor();
    await page.waitForSelector(`[data-studio-domaine-affiche="${d}"]`);
    check(`révision historique, domaine ${d} : lecture seule (Enregistrer et Annuler indisponibles)`, (await element(page.getByRole("toolbar", { name: "Actions de l’espace" }), "Enregistrer").isDisabled())
      && (await element(page.getByRole("toolbar", { name: "Actions de l’espace" }), "Annuler").isDisabled()));
  }
  // Refus : une variante d'un projet d'autrui, même avec un domaine, ne divulgue rien.
  await page.goto(`${BASE}/studio/projets/${pB.id}/etudes/etude-x/variantes/variante-x?domaine=bim`);
  await page.locator("[data-studio-refus]").waitFor();
  check("refus d'accès avec domaine : écran neutre, rien divulgué, adresse conservée", !(await page.locator("#workspace-content").textContent()).includes("P.STU.SECRET") && page.url().endsWith("?domaine=bim"));
  // Dernier contexte : SUGGESTION à l'accueil, jamais de redirection ; une adresse directe est respectée.
  await page.goto(`${base}?domaine=bim`);
  await page.waitForSelector('[data-studio-domaine-affiche="bim"]');
  await page.goto(`${BASE}/studio`);
  const reprendre = page.locator("[data-studio-reprendre]");
  await reprendre.waitFor();
  check("accueil : « Reprendre : projet › étude › variante » proposé, vérifié par le serveur, sans redirection", page.url() === `${BASE}/studio`
    && ((await reprendre.textContent()) ?? "").includes("P.STU.A › Implantation nord › Variante nord") && (await page.locator('[data-studio-reprise-verifiee="oui"]').count()) === 1
    && (await reprendre.getAttribute("href")) === `${new URL(base).pathname}?domaine=bim`, `${page.url()} ${await reprendre.textContent()}`);
  await page.goto(`${BASE}/studio/projets/${pA2.id}`);
  await page.locator(`[data-studio-projet="${pA2.id}"]`).waitFor();
  check("adresse directe : respectée malgré la suggestion de reprise", page.url() === `${BASE}/studio/projets/${pA2.id}`);
  await page.goto(`${BASE}/studio?domaine=documentation`);
  await reprendre.waitFor();
  check("menu latéral hors variante (`/studio?domaine=…`) : la reprise proposée s'ouvrira dans ce domaine, rien n'est ouvert d'office", page.url() === `${BASE}/studio?domaine=documentation`
    && (await reprendre.getAttribute("href")) === `${new URL(base).pathname}?domaine=documentation`);

  // NAV-001 mobile : la même entrée et le même menu dans la barre adaptative ; espace de travail au téléphone.
  // Écran tactile (hasTouch) du même compte : mêmes cookies de session.
  const contexteMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, storageState: await a.context.storageState() });
  const mobile = await contexteMobile.newPage();
  mobile.setDefaultTimeout(20000);
  mobile.on("pageerror", (e) => erreurs.push(`mobile : ${e.message}`));
  await mobile.goto(`${BASE}/accueil`);
  const entreeMobile = mobile.locator("#workspace-navigation a[data-nav-studio]");
  await entreeMobile.waitFor({ state: "visible" }).catch(() => {});
  check("NAV-001 mobile : entrée Studio présente et visible", await entreeMobile.isVisible());
  const basculeMobile = mobile.locator("[data-studio-menu-lateral-bascule]");
  await basculeMobile.tap();
  check("menu Studio (tactile) : le chevron déplie les quatre domaines", (await basculeMobile.getAttribute("aria-expanded")) === "true" && (await mobile.locator("[data-studio-menu-domaine]:visible").count()) === 4);
  await entreeMobile.tap();
  await mobile.waitForURL(`${BASE}/studio`);
  await mobile.goto(`${base}?domaine=documentation`);
  await mobile.locator("[data-studio-revisions] li").first().waitFor();
  check("mobile : la variante et son historique ne débordent pas", await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mobile.screenshot({ path: join(OUT, "studio-mobile.png") });
  // Barre compacte des domaines au téléphone : menu au clavier, choix, fermeture après choix, focus et défilement.
  const menuMobile = mobile.locator("[data-studio-domaines-menu]");
  await menuMobile.focus();
  await mobile.keyboard.press("Enter");
  check("téléphone : le menu des domaines s'ouvre au clavier", (await menuMobile.getAttribute("aria-expanded")) === "true");
  await mobile.keyboard.press("Tab");
  await mobile.keyboard.press("Tab");
  check("téléphone : Tab parcourt les domaines dans l'ordre", await mobile.evaluate(() => document.activeElement?.getAttribute("data-studio-domaine-lien")) === "bim");
  await mobile.keyboard.press("Enter");
  await mobile.waitForSelector('[data-studio-domaine-affiche="bim"]');
  const apresChoix = await mobile.evaluate(() => ({ ferme: document.querySelector("[data-studio-domaines-menu]")?.getAttribute("aria-expanded"), haut: Math.round(document.querySelector("[data-studio-barre-espace]").getBoundingClientRect().top), canevas: Math.round(document.querySelector(".studio-canevas").getBoundingClientRect().top) }));
  check("téléphone : le menu se referme après le choix ; barre en haut, canevas dans l'écran", apresChoix.ferme === "false" && apresChoix.canevas < 844 && apresChoix.haut < apresChoix.canevas, JSON.stringify(apresChoix));
  await menuMobile.tap();
  await mobile.locator('[data-studio-domaines] a[data-studio-domaine-lien="dessin"]').tap();
  await mobile.waitForSelector('[data-studio-domaine-affiche="dessin"]');
  check("téléphone (tactile) : choix d'un domaine, menu refermé", (await menuMobile.getAttribute("aria-expanded")) === "false");

  // Espace de travail outillé : palette verticale à gauche du canevas au bureau ; au téléphone, barre inférieure d'une
  // rangée sous le canevas ; le canevas commence dans la moitié haute de l'écran ; aucun débordement horizontal.
  for (const [largeur, hauteur] of [[1440, 1000], [1280, 720], [390, 844]]) {
    await mobile.setViewportSize({ width: largeur, height: hauteur });
    await mobile.goto(base);
    await mobile.getByRole("group", { name: "Planche de dessin 2D", exact: true }).waitFor();
    await mobile.waitForTimeout(300);
    const m = await mobile.evaluate(() => {
      const barre = document.querySelector('[role="toolbar"][aria-label="Outils de dessin"]');
      const visibles = [...barre.querySelectorAll("[data-studio-ligne]")].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
      const planche = document.querySelector('[aria-label="Planche de dessin 2D"]').getBoundingClientRect();
      return {
        orientation: barre.getAttribute("aria-orientation"), colonnes: new Set(visibles.map((r) => Math.round(r.left))).size, rangees: new Set(visibles.map((r) => Math.round(r.top))).size,
        aGauche: Math.round(barre.getBoundingClientRect().right) <= Math.round(planche.left) + 1, sous: Math.round(barre.getBoundingClientRect().top) >= Math.round(planche.bottom) - 1,
        planche: Math.round(planche.top + window.scrollY), hauteurPlanche: Math.round(planche.height),
        debordeBarre: barre.scrollHeight > barre.clientHeight + 1, debordePage: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    const ok = largeur > 540 ? m.orientation === "vertical" && m.colonnes === 1 && m.aGauche && !m.debordeBarre : m.orientation !== "vertical" && m.rangees === 1 && m.sous;
    check(`espace ${largeur}×${hauteur} : palette ${largeur > 540 ? "verticale à gauche" : "en barre inférieure"}, canevas dans la moitié haute (${m.planche} px < ${hauteur / 2} px), aucun débordement`,
      ok && m.planche < hauteur / 2 && m.hauteurPlanche >= (largeur > 540 ? 360 : 280) && !m.debordePage, JSON.stringify(m));
    await mobile.screenshot({ path: join(OUT, `studio-barre-compacte-${largeur}x${hauteur}.png`) });
  }
  // Menus de famille au clavier : flèche bas ouvre sur le premier élément, les flèches parcourent, Échap referme et
  // rend le focus au bouton ; au téléphone, les familles qui ne tiennent pas sont dans « Plus » (boutons nommés).
  const barreMobile = mobile.getByRole("toolbar", { name: "Outils de dessin" });
  const plus = barreMobile.locator('[data-studio-menu="plus"]');
  check("téléphone : menu « Plus » (aria-haspopup, fermé)", (await plus.getAttribute("aria-haspopup")) === "true" && (await plus.getAttribute("aria-expanded")) === "false");
  await plus.focus();
  await mobile.keyboard.press("ArrowDown");
  const listePlus = mobile.locator(`#${await plus.getAttribute("aria-controls")}`.replace(/:/g, "\\:"));
  await listePlus.waitFor();
  // Le premier élément reçoit le focus à l'image suivante (requestAnimationFrame) : l'attendre, ne pas le supposer.
  await mobile.waitForFunction((id) => document.getElementById(id)?.contains(document.activeElement), await plus.getAttribute("aria-controls"), { timeout: 5000 }).catch(() => {});
  const focus1 = await mobile.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await mobile.keyboard.press("ArrowDown");
  const focus2 = await mobile.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  const nomsVisibles = await listePlus.locator("[data-studio-nav] > span").evaluateAll((s) => s.filter((x) => x.offsetParent).length);
  check("menu « Plus » au clavier : ouvert, focus sur le premier élément puis le suivant, noms visibles",
    (await plus.getAttribute("aria-expanded")) === "true" && !!focus1 && !!focus2 && focus1 !== focus2 && nomsVisibles > 0, `${focus1} → ${focus2}`);
  await mobile.keyboard.press("Escape");
  check("menu « Plus » : Échap referme et rend le focus au bouton",
    (await plus.getAttribute("aria-expanded")) === "false" && (await mobile.evaluate(() => document.activeElement?.getAttribute("data-studio-menu"))) === "plus" && !(await listePlus.isVisible()));

  // E.6-03 : rapport de fidélité de l'export. Le raccourci Maj+X lance le téléchargement DXF puis ouvre une petite boîte
  // non modale (exact / approché / non couvert par type et raison) ; ses totaux sont ceux du rapport servi par l'API.
  await page.goto(base);
  await outils.first().waitFor();
  await page.locator("svg [data-studio-objet]").first().waitFor({ state: "attached" });
  await page.evaluate(() => document.activeElement?.blur());
  const telechargementDxf = page.waitForEvent("download");
  await page.keyboard.press("Shift+X");
  const fichierDxf = await telechargementDxf;
  const boiteRapport = page.locator('[data-studio-rapport-export="dxf"]');
  await boiteRapport.locator("[data-studio-rapport-totaux]").waitFor();
  const rapportApi = await a.api("get", `${variantePath}/export/rapport?format=dxf`);
  const totauxUi = Object.fromEntries(await boiteRapport.locator("[data-total]").evaluateAll((d) => d.map((x) => [x.getAttribute("data-total"), Number(x.textContent)])));
  const lignesUi = await boiteRapport.locator("tbody tr").count();
  check("rapport de fidélité : téléchargement DXF lancé, boîte non modale ouverte sans prendre le focus",
    fichierDxf.suggestedFilename().endsWith(".dxf") && (await boiteRapport.getAttribute("aria-modal")) === "false" && !(await boiteRapport.evaluate((b) => b.contains(document.activeElement))));
  check("rapport de fidélité : totaux et lignes identiques au rapport de l'API (cotes éclatées en DXF comprises)",
    rapportApi.schema === "studio-rapport-fidelite/1" && totauxUi.elements === rapportApi.totaux.elements && totauxUi.exact === rapportApi.totaux.exact && totauxUi.approche === rapportApi.totaux.approche
    && totauxUi["non-couvert"] === rapportApi.totaux.nonCouvert && lignesUi === rapportApi.lignes.length && rapportApi.totaux.elements > 0
    && rapportApi.totaux.exact + rapportApi.totaux.approche + rapportApi.totaux.nonCouvert === rapportApi.totaux.elements, JSON.stringify({ totauxUi, totaux: rapportApi.totaux }));
  await page.screenshot({ path: join(OUT, "studio-rapport-fidelite-dxf.png") });
  await boiteRapport.locator("[data-studio-rapport-fermer]").click();
  await boiteRapport.waitFor({ state: "detached" });
  check("rapport de fidélité : « Fermer » referme la boîte", (await boiteRapport.count()) === 0);

  // Registre de recette, sur des études neuves du projet B (l'étude « Implantation nord » et ses contrôles ci-dessus
  // restent intacts). Mêmes outils, mêmes sélecteurs, même enregistrement (Ctrl+S) que plus haut.
  const enregistrer = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  };
  const enAttente = (n) => page.waitForFunction((v) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === v, String(n));

  // TEST-002 : nouvelle étude, Planche 3D seule — volume construit, face poussée (lot F1), enregistré, vue plane dérivée
  // (coupe horizontale à une cote que seule la face poussée atteint). Parcours détaillé : studio-faces.mjs.
  const etude3d = await a.api("post", `/projects/${pA2.id}/studio/studies`, { name: "Étude 3D seule" });
  const chemin3d = `/projects/${pA2.id}/studio/studies/${etude3d.study.id}/variants/${etude3d.variant.id}`;
  await page.goto(`${BASE}/studio/projets/${pA2.id}/etudes/${etude3d.study.id}/variantes/${etude3d.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const docNeuf = (await a.api("get", chemin3d)).revision.document;
  check("TEST-002 : étude neuve ouverte, document vide (aucun objet 2D, aucun solide)",
    docNeuf.objects.length === 0 && (docNeuf.solides ?? []).length === 0 && (await page.locator('svg [role="button"]').count()) === 0, JSON.stringify(docNeuf));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 20000 });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("b");
  const formBoite3d = panneaux3d.locator("[data-studio-boite]");
  await formBoite3d.waitFor();
  check("TEST-002 : Maj+D ouvre la vue 3D sans rien dessiner en 2D (aucune planche 2D), outil Boîte prêt",
    (await planche.count()) === 0 && (await outils.locator('[data-studio-outil="studio.solide.boite"]').getAttribute("aria-pressed")) === "true");
  for (const [libelle, valeur] of [["Origine x (m)", "1"], ["Origine y (m)", "1"], ["Origine z (m)", "0"], ["Largeur selon x (m)", "2"], ["Profondeur selon y (m)", "1"], ["Hauteur selon z (m)", "3"]]) await formBoite3d.getByLabel(libelle, { exact: true }).fill(valeur);
  await formBoite3d.getByRole("button", { name: "Poser la boîte", exact: true }).click();
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
  check("TEST-002 : volume construit dans la vue 3D (un solide libre, une commande en attente)", (await portee()).includes("(1 commande(s)"), await portee());
  const [idBoite3d] = await panneaux3d.locator('[data-studio-solide-type="box"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-solide")));
  if (!(await panneaux3d.locator(`[data-studio-face-decaler="${idBoite3d}"]`).count())) await panneaux3d.locator(`[data-studio-solide="${idBoite3d}"]`).click();
  const formFace3d = panneaux3d.locator(`[data-studio-face-decaler="${idBoite3d}"]`);
  await formFace3d.locator("[data-studio-face-choix]").selectOption("sommet");
  await formFace3d.getByLabel("Distance (m, positive vers l’extérieur)").fill("1");
  await formFace3d.getByRole("button", { name: "Pousser / tirer la face", exact: true }).click();
  await enAttente(2);
  check("TEST-002 : édition de face — sommet poussé de 1 m, même solide, 8 m³", (await panneaux3d.locator(`[data-studio-solide="${idBoite3d}"]`).textContent()).includes("Boîte 2 × 1 × 4 m · 8 m³"));
  await enregistrer();
  const doc3d = (await a.api("get", chemin3d)).revision.document;
  check("TEST-002 : après Ctrl+S, le document relu compte 1 solide libre et 0 objet 2D (ni architecture)",
    (doc3d.solides ?? []).length === 1 && doc3d.solides[0].id === idBoite3d && doc3d.solides[0].type === "box" && doc3d.solides[0].width === 2 && doc3d.solides[0].depth === 1 && doc3d.solides[0].height === 4
    && doc3d.objects.length === 0 && (doc3d.architecture ?? []).length === 0, JSON.stringify({ solides: doc3d.solides, objets: doc3d.objects.length }));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+K");
  const coupe3d = panneaux3d.locator("[data-studio-coupe]");
  await coupe3d.waitFor();
  await coupe3d.getByLabel("Cote de coupe z (m)", { exact: true }).fill("3.5");
  await page.locator('[data-studio-coupe][data-studio-coupe-z="3.5"]').waitFor();
  check("TEST-002 : vue plane dérivée (coupe horizontale à z = 3,5, atteinte par la seule face poussée) — 4 contours de la boîte enregistrée, provenance par solide, non modifiable, brouillon inchangé",
    (await coupe3d.getAttribute("data-studio-coupe-segments")) === "4" && (await coupe3d.getAttribute("data-studio-coupe-sources")) === doc3d.solides[0].id
    && (await coupe3d.getByRole("status").textContent()).includes("non modifiable") && (await portee()).includes("(0 commande(s)"),
    `${await coupe3d.getAttribute("data-studio-coupe-segments")} · ${await coupe3d.getAttribute("data-studio-coupe-sources")}`);

  // TEST-010, TEST-003, TEST-024 : une seconde étude neuve, avec une boîte sans rapport (posée par l'API) pour vérifier
  // que le déplacement d'une porte ne remaille pas les objets étrangers. Mur 6 × 3 × 0,2 m, ouverture 1 × 2,1 m.
  const etudeArchi = await a.api("post", `/projects/${pA2.id}/studio/studies`, { name: "Étude mur associé" });
  const cheminArchi = `/projects/${pA2.id}/studio/studies/${etudeArchi.study.id}/variants/${etudeArchi.variant.id}`;
  const baseArchi = `${BASE}/studio/projets/${pA2.id}/etudes/${etudeArchi.study.id}/variantes/${etudeArchi.variant.id}`;
  const idBoiteEtrangere = `boite-etrangere-${Date.now()}`;
  await a.api("post", `${cheminArchi}/commands`, { contractVersion: "studio-commands/1", requestId: `boite-${Date.now()}`, baseRevisionId: etudeArchi.revision.id,
    commands: [{ toolId: "studio.solide.boite", params: { id: idBoiteEtrangere, type: "box", placement: { origin: { x: 10, y: -32, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } }] });
  await page.goto(baseArchi);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("w");
  const formMurT = proprietes.locator("[data-studio-architecture-mur-formulaire]");
  await formMurT.waitFor();
  await formMurT.getByLabel("Axe (x y ; …)").fill("0 -30; 6 -30");
  for (const [libelle, v] of [["Épaisseur (m)", "0.2"], ["Hauteur (m)", "3"], ["Cote de base z (m)", "0"]]) await formMurT.getByLabel(libelle, { exact: true }).fill(v);
  await formMurT.locator('[data-studio-champ-architecture="justification"]').selectOption("center");
  await formMurT.getByRole("button", { name: "Créer le mur", exact: true }).click();
  const murT = page.locator('svg [data-studio-architecture][data-studio-type="wall"]');
  await murT.waitFor({ state: "attached" });
  const idMurT = await murT.getAttribute("data-studio-architecture");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+Z");
  await page.keyboard.press("h");
  const formOuvT = proprietes.locator("[data-studio-architecture-ouverture-formulaire]");
  await formOuvT.waitFor();
  for (const [libelle, v] of [["Largeur (m)", "1"], ["Hauteur (m)", "2.1"], ["Allège (m)", "0"]]) await formOuvT.getByLabel(libelle, { exact: true }).fill(v);
  await planche.scrollIntoViewIfNeeded();
  const surMurT = await ecranDe(3, -30);
  await page.mouse.click(surMurT.x, surMurT.y);
  const ouvT = page.locator('svg [data-studio-architecture][data-studio-type="opening"]');
  await ouvT.waitFor({ state: "attached" });
  const idOuvT = await ouvT.getAttribute("data-studio-architecture");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Escape");
  await enregistrer();
  const r1 = (await a.api("get", cheminArchi)).revision;
  const ouvR1 = r1.document.architecture?.find((x) => x.id === idOuvT);
  check("TEST-010 : révision R1 enregistrée — mur et ouverture 1 m posée sur lui (boîte étrangère conservée)",
    !!ouvR1 && ouvR1.width === 1 && ouvR1.hostId === idMurT && (r1.document.solides ?? []).some((s) => s.id === idBoiteEtrangere), JSON.stringify(r1.document.architecture));
  const choisirT = (id) => proprietes.locator(`[data-studio-architecture-choisir="${id}"]`);
  const choisiT = (id) => proprietes.locator(`[data-studio-architecture-choisi="${id}"]`);
  const metreT = (id) => choisiT(id).locator("[data-studio-architecture-metre]");
  const netT = async (id) => Number(await metreT(id).getAttribute("data-studio-volume-net"));
  const ids3dT = () => panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")));
  const ids2dT = () => page.locator("svg [data-studio-architecture]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture")));

  // TEST-010 : l'ouverture agrandie à 1,20 m depuis l'autre planche (vue 3D) ; R2 : net 3,096 m³ ; R1 inchangée.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idOuvT}"]`).click();
  await choisiT(idOuvT).waitFor();
  await choisiT(idOuvT).getByLabel("Largeur (m)", { exact: true }).fill("1.2");
  await choisiT(idOuvT).getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMurT}"]`).click();
  await choisiT(idMurT).waitFor();
  const netR2 = await netT(idMurT);
  check("TEST-010 : ouverture élargie à 1,20 m depuis la vue 3D — nouveau volume net 3,096 m³ (déduction 0,504 m³)",
    Math.abs(netR2 - 3.096) < 1e-9 && Math.abs(Number(await metreT(idMurT).getAttribute("data-studio-volume-deduit")) - 0.504) < 1e-9, String(netR2));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await enregistrer();
  const r2 = (await a.api("get", cheminArchi)).revision;
  const r1Relue = (await a.api("get", `${cheminArchi}/revisions/${encodeURIComponent(r1.id)}`)).revision;
  const histoArchi = (await a.api("get", `${cheminArchi}/revisions`)).revisions.map((r) => r.id);
  check("TEST-010 : R2 en tête avec l'ouverture à 1,20 m ; R1 relue par l'API inchangée (ouverture 1 m, document identique)",
    r2.id !== r1.id && r2.parentRevisionId === r1.id && r2.document.architecture.find((x) => x.id === idOuvT)?.width === 1.2
    && JSON.stringify(r1Relue) === JSON.stringify(r1) && r1Relue.document.architecture.find((x) => x.id === idOuvT)?.width === 1 && histoArchi[0] === r2.id && histoArchi.includes(r1.id),
    JSON.stringify({ r1: r1.id, r2: r2.id, parent: r2.parentRevisionId, histoArchi }));
  await page.goto(`${baseArchi}?revision=${encodeURIComponent(r1.id)}`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  await page.locator(`svg [data-studio-architecture="${idOuvT}"]`).waitFor({ state: "attached" });
  if ((await choisirT(idMurT).getAttribute("aria-pressed")) !== "true") await choisirT(idMurT).click();
  await choisiT(idMurT).waitFor();
  const netR1 = await netT(idMurT);
  check("TEST-010 : révision historique R1 ouverte en lecture seule — volume net toujours 3,180 m³ (déduction 0,420 m³)",
    Math.abs(netR1 - 3.18) < 1e-9 && Math.abs(Number(await metreT(idMurT).getAttribute("data-studio-volume-deduit")) - 0.42) < 1e-9, String(netR1));
  await page.goto(baseArchi);
  await page.locator(`svg [data-studio-architecture="${idOuvT}"]`).waitFor({ state: "attached" });
  if ((await choisirT(idMurT).getAttribute("aria-pressed")) !== "true") await choisirT(idMurT).click();
  await choisiT(idMurT).waitFor();
  check("TEST-010 : la tête (R2) relue montre le volume net 3,096 m³", Math.abs((await netT(idMurT)) - 3.096) < 1e-9, String(await netT(idMurT)));

  // TEST-003 : le même mur modifié depuis la planche 2D (hauteur 3,2 m) puis depuis la vue 3D (épaisseur 0,25 m).
  await choisiT(idMurT).getByLabel("Hauteur (m)", { exact: true }).fill("3.2");
  await choisiT(idMurT).getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  check("TEST-003 : hauteur du mur portée à 3,2 m depuis la planche 2D, modification acceptée (une commande en attente, aucune alerte)",
    (await page.locator(".studio-alert").count()) === 0 && (await portee()).includes("(1 commande(s)"), await portee());
  const ids2dAvant = await ids2dT();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
  const ids3dMur = await ids3dT();
  const bouton3dMur = panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMurT}"]`);
  if ((await bouton3dMur.getAttribute("aria-pressed")) !== "true") await bouton3dMur.click();
  await choisiT(idMurT).waitFor();
  check("TEST-003 : dans la vue 3D, le même mur (même identifiant) porte déjà la hauteur 3,2 m saisie en 2D",
    JSON.stringify(ids3dMur) === JSON.stringify(ids2dAvant) && ids3dMur.includes(idMurT) && (await choisiT(idMurT).getByLabel("Hauteur (m)", { exact: true }).inputValue()) === "3.2",
    `${JSON.stringify(ids3dMur)} / ${JSON.stringify(ids2dAvant)}`);
  await choisiT(idMurT).getByLabel("Épaisseur (m)", { exact: true }).fill("0.25");
  await choisiT(idMurT).getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(2);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const avantT003 = envois.length;
  await enregistrer();
  const envoiT003 = envois[envois.length - 1];
  const r3 = (await a.api("get", cheminArchi)).revision;
  const murR3 = r3.document.architecture.find((x) => x.type === "wall"), ouvR3 = r3.document.architecture.find((x) => x.type === "opening");
  check("TEST-003 : enregistré en deux studio.architecture.modifier sur le même objectId",
    envois.length === avantT003 + 1 && JSON.stringify(envoiT003.commands.map((c) => [c.toolId, c.params.id])) === JSON.stringify([["studio.architecture.modifier", idMurT], ["studio.architecture.modifier", idMurT]]),
    JSON.stringify(envoiT003?.commands));
  check("TEST-003 : relu après Ctrl+S — même identifiant du mur, hauteur 3,2 m, épaisseur 0,25 m ; l'ouverture reste hébergée (hostId) par ce mur",
    r3.document.architecture.length === 2 && murR3.id === idMurT && murR3.height === 3.2 && murR3.thickness === 0.25 && ouvR3.id === idOuvT && ouvR3.hostId === idMurT && ouvR3.width === 1.2,
    JSON.stringify(r3.document.architecture));
  await page.reload();
  await page.locator(`svg [data-studio-architecture="${idOuvT}"]`).waitFor({ state: "attached" });
  const ids2dR3 = await ids2dT();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
  const ids3dR3 = await ids3dT();
  check("TEST-003 : après actualisation, la désignation 3D porte les mêmes identifiants que la planche 2D (mur, ouverture)",
    JSON.stringify(ids3dR3) === JSON.stringify([idMurT, idOuvT]) && JSON.stringify([...ids2dR3].sort()) === JSON.stringify([idMurT, idOuvT].sort()), `${JSON.stringify(ids3dR3)} / ${JSON.stringify(ids2dR3)}`);

  // TEST-024 : la porte déplacée depuis la vue 3D (position 2,5 → 1,5 m) ; la planche 2D suit ; seul ce qui dépend de la
  // porte (elle et son mur hôte) est remaillé, la boîte étrangère non ; au plus un maillage remis par révision.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator(`svg [data-studio-architecture="${idOuvT}"]`).waitFor({ state: "attached" });
  const montants = () => page.locator(`svg [data-studio-architecture="${idOuvT}"] line`).evaluateAll((ls) => ls.map((l) => [Number(l.getAttribute("x1")), Number(l.getAttribute("x2"))]));
  const montantsAvant = await montants();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
  await maillagePret();
  const bouton3dOuv = panneaux3d.locator(`[data-studio-architecture-3d-objet="${idOuvT}"]`);
  if ((await bouton3dOuv.getAttribute("aria-pressed")) !== "true") await bouton3dOuv.click();
  await choisiT(idOuvT).waitFor();
  check("TEST-024 : porte choisie dans la vue 3D, position 2,5 m le long de l'axe", (await choisiT(idOuvT).getByLabel("Position le long de l’axe (m)", { exact: true }).inputValue()) === "2.5",
    await choisiT(idOuvT).getByLabel("Position le long de l’axe (m)", { exact: true }).inputValue());
  const debutT024 = await page.evaluate(() => globalThis.__fadiTaches?.journal.length ?? 0);
  await choisiT(idOuvT).getByLabel("Position le long de l’axe (m)", { exact: true }).fill("1.5");
  await choisiT(idOuvT).getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  await maillagePret();
  const vueT024 = page.locator("[data-studio-vue3d]");
  const remaillesT024 = await vueT024.getAttribute("data-studio-remailles"), invalidationT024 = await vueT024.getAttribute("data-studio-invalidation");
  const journalT024 = (await page.evaluate((d) => globalThis.__fadiTaches.journal.slice(d), debutT024)).filter((e) => e.cle === "studio.maillage-3d");
  const remisT024 = journalT024.filter((e) => e.etat === "done").map((e) => e.revision);
  check("TEST-024 : déplacement appliqué depuis la vue 3D — invalidation partielle : seuls la porte et son mur hôte remaillés (2 objets), la boîte étrangère non ; au plus un maillage remis par révision",
    invalidationT024 === "partiel" && remaillesT024 === "2" && remisT024.length >= 1 && new Set(remisT024).size === remisT024.length,
    JSON.stringify({ invalidationT024, remaillesT024, journal: journalT024.map((e) => `${e.revision}:${e.etat}`) }));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  await page.locator(`svg [data-studio-architecture="${idOuvT}"]`).waitFor({ state: "attached" });
  const montantsApres = await montants();
  check("TEST-024 : de retour sur la planche 2D, les montants de la porte ont reculé de 1 m le long du mur",
    montantsAvant.length === 2 && montantsApres.length === 2 && montantsApres.every(([x1, x2], i) => Math.abs(x1 - (montantsAvant[i][0] - 1)) < 1e-9 && Math.abs(x2 - (montantsAvant[i][1] - 1)) < 1e-9),
    `${JSON.stringify(montantsAvant)} → ${JSON.stringify(montantsApres)}`);
  await enregistrer();
  const r4 = (await a.api("get", cheminArchi)).revision;
  const ouvR4 = r4.document.architecture.find((x) => x.id === idOuvT);
  check("TEST-024 : enregistré — porte à 1,5 m, même identifiant, toujours hébergée par le mur ; boîte étrangère inchangée",
    ouvR4?.position === 1.5 && ouvR4.hostId === idMurT && ouvR4.width === 1.2
    && JSON.stringify(r4.document.solides) === JSON.stringify(r3.document.solides), JSON.stringify(r4.document.architecture));

  // NAV-009 : les parcours existants restent atteignables.
  await page.goto(`${BASE}/projets/${pA.id}?module=atelier`);
  await page.locator(".module-content").waitFor();
  check("NAV-009 : le module Atelier du projet reste accessible", page.url().includes("module=atelier"));

  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette de navigation Studio : réussie.");
} finally {
  await browser.close();
}
