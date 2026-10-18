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

const titre = (page) => page.locator("[data-studio] h1").first().textContent();

try {
  const a = await nouvelUtilisateur("a");
  const pA = await a.api("post", "/projects", { code: "P.STU.A", name: "Studio — Projet A" });
  const pA2 = await a.api("post", "/projects", { code: "P.STU.B", name: "Studio — Projet B" });
  const b = await nouvelUtilisateur("b");
  const pB = await b.api("post", "/projects", { code: "P.STU.SECRET", name: "Studio — Projet confidentiel" });
  const { page } = a;

  // NAV-001 : entrée « Studio » dans la navigation principale, après Projets, icône propre, nom accessible et état actif.
  await page.goto(`${BASE}/accueil`);
  const entree = page.locator("#workspace-navigation a[data-nav-studio]");
  await entree.waitFor({ state: "visible" }).catch(() => {});
  check("NAV-001 : entrée Studio dans la navigation principale", await entree.isVisible());
  check("NAV-001 : nom accessible et infobulle « Studio »", (await entree.getAttribute("aria-label")) === "Studio" && (await entree.getAttribute("title")) === "Studio");
  const ordre = await page.locator("#workspace-navigation > *").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check("NAV-001 : Studio placé après Projets", ordre.indexOf("Studio") === ordre.indexOf("Projets") + 1, ordre.join(" · "));
  await entree.click();
  await page.waitForURL(`${BASE}/studio`);
  await page.locator('[data-studio="accueil"]').waitFor();
  check("NAV-001 : Studio actif sur ses routes", (await entree.getAttribute("class"))?.includes("active") === true);
  check("NAV-006 : l'entrée Projets n'est pas faussement active", !((await page.locator(".sidebar-projects").getAttribute("class")) ?? "").includes("active"));
  check("NAV-006 : titre de page « Studio »", (await page.locator(".app-topbar h1").textContent())?.trim() === "Studio");

  // NAV-003 : choix explicite du projet, rien n'est créé à l'ouverture.
  const liste = page.locator("[data-studio-projets] li");
  await liste.first().waitFor();
  const textes = await liste.allTextContents();
  check("NAV-003 : les projets autorisés sont proposés, sans projet d'autrui", textes.some((t) => t.includes("P.STU.A")) && textes.some((t) => t.includes("P.STU.B")) && !textes.some((t) => t.includes("P.STU.SECRET")));
  check("NAV-003 : aucun projet créé par l'ouverture de Studio", (await a.api("get", "/projects")).length === 2);

  // NAV-002 : ouverture d'un projet sans passer par le Parcours ni l'Atelier.
  const requetes = [];
  page.on("request", (r) => requetes.push(new URL(r.url()).pathname));
  await page.locator("[data-studio-projets] a", { hasText: "P.STU.A" }).click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}`);
  await page.locator(`[data-studio-projet="${pA.id}"]`).waitFor();
  await page.locator("[data-studio-aucune-etude]").waitFor();
  const parcours = requetes.filter((p) => LECTURES_INTERDITES.test(p));
  check("NAV-002 : aucune lecture du Parcours, du programme ni de l'Atelier", parcours.length === 0, parcours.join(", "));
  check("NAV-006 : le titre et le fil nomment le bon projet", (await titre(page)).includes("P.STU.A") && (await page.locator(".studio-fil").textContent()).includes("P.STU.A"));
  check("NAV-008 : barre latérale visible, aucun mode immersif", (await page.locator(".app-sidebar").isVisible()) && !(await page.evaluate(() => document.body.classList.contains("atelier-immersive"))));
  check("NAV-006 : Studio reste actif, Projets non", (await entree.getAttribute("class"))?.includes("active") === true && !((await page.locator(".sidebar-projects").getAttribute("class")) ?? "").includes("active"));

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

  // Étude : création par l'interface ; elle ouvre la planche de sa variante initiale.
  await page.goto(`${BASE}/studio/projets/${pA.id}`);
  await page.locator("[data-studio-aucune-etude]").waitFor();
  await page.getByLabel("Nom de l’étude", { exact: true }).fill("Implantation nord");
  requetes.length = 0;
  await page.locator('[data-studio-creer-etude] button').click();
  await page.waitForURL(new RegExp(`/studio/projets/${pA.id}/etudes/[^/]+/variantes/[^/?]+$`));
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const [, , , , , studyId, , initialVariantId] = new URL(page.url()).pathname.split("/");
  check("étude : la création ouvre la planche de la variante initiale, nommée dans le titre et le fil", (await page.getByRole("heading", { level: 1 }).last().textContent()) === "Implantation nord" && (await page.locator(".studio-fil").textContent()).includes("Implantation nord"));
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
  check("variante : la création ouvre sa planche, nommée dans le fil", (await page.locator(".studio-fil").textContent()).includes("Variante nord") && (await page.locator(".studio-context").textContent()).includes("Variante nord"));
  check("variante : document vide à la création", (await page.locator('svg [role="button"]').count()) === 0);
  check("variante : aucune lecture ni écriture du Parcours, de l'Atelier ou de la Planche", requetes.filter((p) => LECTURES_INTERDITES.test(p)).length === 0, requetes.join(" "));
  const detail = await a.api("get", `/projects/${pA.id}/studio/studies/${studyId}`);
  check("variante : l'étude en compte deux côté serveur", detail.variants.length === 2 && detail.variants.some((v) => v.id === variantId && v.name === "Variante nord"));

  // Enregistrement par commandes : un rectangle saisi, une révision de plus dans l'historique.
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  await outils.getByRole("button", { name: /^Rectangle/ }).click();
  for (const [nom, v] of [["X", 2], ["Y", 2], ["Largeur", 4], ["Hauteur", 3]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await outils.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const historique = page.locator("[data-studio-revisions] li[data-studio-revision]");
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-revisions] li[data-studio-revision]").length === 2);
  const revisions = await a.api("get", `/projects/${pA.id}/studio/studies/${studyId}/variants/${variantId}/revisions`);
  const ids = await historique.evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-revision")));
  check("historique : deux révisions, de la plus récente à la plus ancienne, comme l'API", revisions.revisions.length === 2 && ids.join() === revisions.revisions.map((r) => r.id).join());
  check("historique : la plus récente est la version courante", (await historique.first().getAttribute("data-studio-revision-tete")) === "true");

  // Révision passée : lecture seule par ?revision=, aucun enregistrement possible, retour à la version courante.
  const ancienne = revisions.revisions[1].id;
  await historique.nth(1).locator("a:not([data-studio-comparer-tete])").click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}?revision=${encodeURIComponent(ancienne)}`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  check("révision passée : document d'origine (vide), lecture seule, enregistrement désactivé", (await page.locator('svg [role="button"]').count()) === 0 && (await outils.getByRole("button", { name: "Enregistrer", exact: true }).isDisabled()));
  await page.reload();
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  check("révision passée : l'actualisation restitue la même révision", page.url().endsWith(`?revision=${encodeURIComponent(ancienne)}`));
  await page.screenshot({ path: join(OUT, "studio-revision.png") });
  await page.locator("[data-studio-lecture-seule-revision] a").click();
  await page.waitForURL(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}`);
  await page.locator('svg [role="button"][aria-label^="Rectangle "]').waitFor({ state: "attached" });
  check("version courante : le rectangle enregistré est relu", (await page.locator('svg [role="button"]').count()) === 1);
  const base = `${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${variantId}`;
  await page.goto(`${base}?revision=revision-inexistante`);
  await page.locator('[data-studio-refus="revision"]').waitFor();
  check("révision inconnue : refus explicite, adresse conservée", page.url().endsWith("?revision=revision-inexistante"));
  await page.goto(`${base}?revision=${encodeURIComponent(ancienne)}&revision=${encodeURIComponent(ancienne)}`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("révision répétée : adresse non reconnue", true);
  await page.goto(`${base}?domaine=bim`);
  await page.locator("[data-studio-inconnue]").waitFor();
  check("paramètre non livré (domaine) : adresse non reconnue, aucun choix factice", true);

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
  await a.api("post", `/projects/${pA.id}/members`, { email: emailB, role: "lecteur" });
  await b.page.goto(`${BASE}/studio/projets/${pA.id}`);
  await b.page.locator("[data-studio-etudes]").waitFor();
  check("lecteur : voit les études sans formulaire de création", (await b.page.locator("[data-studio-lecture-seule]").isVisible()) && (await b.page.locator("[data-studio-creer-etude]").count()) === 0);
  await b.page.goto(`${BASE}/studio/projets/${pA.id}/etudes/${studyId}`);
  await b.page.locator("[data-studio-variantes]").waitFor();
  check("lecteur : voit les variantes sans formulaire de création", (await b.page.locator("[data-studio-creer-variante]").count()) === 0);
  await b.page.goto(base);
  await b.page.locator("[data-studio-lecture-seule]").waitFor();
  check("lecteur : la variante s'ouvre en lecture seule", await b.page.getByRole("toolbar", { name: "Outils de dessin" }).getByRole("button", { name: "Enregistrer", exact: true }).isDisabled());

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
  await page.waitForURL(`${base}?commentaires=ouverts`);
  await page.locator("#studio-commentaires").waitFor();
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
  await outils.getByRole("button", { name: "Ligne", exact: true }).click();
  await cliquer(2, 8);
  await cliquer(6, 8);
  // Le pointeur est arrondi au pixel puis au centimètre : on compare à la géométrie tracée, pas aux points visés.
  const geometrie = () => lignes.locator("line").evaluate((l) => ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))));
  const tracee = await geometrie();
  check("planche : deux clics tracent une ligne", (await lignes.count()) === 1 && Math.abs(tracee[0] - 2) < 0.05 && Math.abs(tracee[2] - 6) < 0.05, tracee.join(" "));
  const longueur = Math.hypot(tracee[2] - tracee[0], tracee[3] - tracee[1]);
  await page.keyboard.press("Shift+C");
  check("planche : Maj+C choisit l'outil Cote", (await outils.getByRole("button", { name: "Cote", exact: true }).getAttribute("aria-pressed")) === "true");
  await cliquer(2.08, 8.06);
  await cliquer(5.93, 7.95);
  await cote.waitFor({ state: "attached" });
  const texte = (await cote.locator("text").textContent()) ?? "";
  check("cote : accrochée aux extrémités, valeur mesurée affichée en mètres", (await cote.getAttribute("data-studio-cote-valeur")) === longueur.toFixed(3) && texte === `${longueur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m` && /^\d+,\d{2,3} m$/.test(texte) && (await cote.getAttribute("data-studio-cote-etat")) === "resolue", texte);
  await outils.getByRole("button", { name: "Sélection", exact: true }).click();
  await lignes.press("Enter");
  await outils.getByRole("button", { name: "Déplacer", exact: true }).click();
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
  await outils.getByRole("button", { name: "Nouveau calque", exact: true }).click();
  const rangees = page.locator("[data-studio-calque-ligne]");
  check("calques : « Nouveau calque » ajoute un calque, devenu actif", (await rangees.count()) === 2 && (await rangees.nth(1).getAttribute("aria-current")) === "true");
  const calqueId = await rangees.nth(1).getAttribute("data-studio-calque-ligne");
  await outils.getByRole("button", { name: "Rectangle", exact: true }).click();
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
  let coupe = false;
  await page.route("**/commands", (route) => { if (!coupe) { coupe = true; return route.abort("failed"); } return route.continue(); });
  await page.keyboard.press("Control+s");
  await page.locator("[data-studio-erreur-planche]").filter({ hasText: "Confirmation serveur indisponible" }).waitFor();
  await outils.getByRole("button", { name: "Réessayer la sauvegarde", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  await page.unroute("**/commands");
  const enveloppe = envois[0];
  check("enregistrement (Ctrl+S) : un lot de commandes studio-commands/1 sur la tête", envois.length === 2 && enveloppe.contractVersion === "studio-commands/1" && enveloppe.commands.map((c) => c.toolId).join() === "studio.dessin.ligne,studio.dessin.cote,studio.dessin.deplacer,studio.dessin.supprimer,studio.calque.creer,studio.dessin.rectangle,studio.calque.modifier", enveloppe.commands.map((c) => c.toolId).join());
  check("nouvel essai : même requestId, même contenu", envois[1].requestId === enveloppe.requestId && JSON.stringify(envois[1]) === JSON.stringify(enveloppe));
  check("après enregistrement : annuler ne porte que sur les modifications non enregistrées", await outils.getByRole("button", { name: "Annuler", exact: true }).isDisabled());
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
  await outils.getByRole("button", { name: "Ligne", exact: true }).click();
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
  const portee = async () => (await page.locator("[data-studio-annuler-portee]").textContent()) ?? "";
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
  await outils.getByRole("button", { name: "Zoom arrière", exact: true }).click();
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

  await outils.getByRole("button", { name: "Cadrer", exact: true }).click();
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
  check("F9 : l'accrochage à la grille est activé", (await outils.getByRole("button", { name: "Accrocher à la grille", exact: true }).getAttribute("aria-pressed")) === "true");
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
  check("palette Ctrl+K : Entrée lance l'outil Ligne", (await outils.getByRole("button", { name: "Ligne", exact: true }).getAttribute("aria-pressed")) === "true");
  await outils.getByRole("button", { name: "Sélection", exact: true }).click();
  await outils.getByRole("button", { name: "Outils", exact: true }).click();
  const gestionnaire = page.locator("[data-studio-gestionnaire-outils]");
  await gestionnaire.waitFor();
  check("Outils : le catalogue liste tout le registre", (await gestionnaire.locator("[data-studio-catalogue-entree]").count()) >= 25 && (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.ligne"] [data-studio-exposition="none"]').count()) === 1);
  await gestionnaire.getByLabel("Rechercher un outil", { exact: true }).fill("Cote");
  check("Outils : la recherche « Cote » trouve l'outil Cote, et lui seul", (await gestionnaire.locator("[data-studio-catalogue-entree]").count()) === 1 && (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.cote"]').isVisible()));
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
  await outils.getByRole("button", { name: "Ligne", exact: true }).click();
  await proprietes.getByLabel("X", { exact: true }).fill("10");
  await proprietes.getByLabel("Y", { exact: true }).fill("10");
  await proprietes.getByLabel("X final", { exact: true }).fill("14");
  await proprietes.getByLabel("Y final", { exact: true }).fill("10");
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  const murId = (await idsLignes()).find((id) => !lignesAvant.includes(id));
  check("volume : une ligne tracée pour l'extrusion", !!murId);
  await outils.getByRole("button", { name: "Sélection", exact: true }).click();
  await page.locator(`[data-studio-objet="${murId}"]`).focus();
  await page.keyboard.press("Enter");
  const formExtrusion = page.locator("[data-studio-extrusion]");
  await formExtrusion.waitFor();
  check("volume : aucune valeur d'extrusion proposée (non évaluée)", (await formExtrusion.getByLabel("Hauteur (m)").inputValue()) === "" && (await formExtrusion.getByLabel("Épaisseur (m, lignes, facultative)").inputValue()) === "" && (await formExtrusion.getAttribute("data-studio-extrusion")) !== null && (await page.locator("[data-studio-extrusion-etat]").getAttribute("data-studio-extrusion-etat")) === "plat");
  check("volume : Extruder (Maj+E) et Aplatir (Maj+F) dans la barre Volume", (await outils.locator('[data-studio-barre="volume"] [data-studio-outil="studio.objet.extruder"][aria-keyshortcuts="Shift+E"]').count()) === 1 && (await outils.locator('[data-studio-barre="volume"] [data-studio-outil="studio.objet.aplatir"][aria-keyshortcuts="Shift+F"]').count()) === 1);
  await formExtrusion.getByLabel("Base (m)").fill("0");
  await formExtrusion.getByLabel("Hauteur (m)").fill("2.5");
  await formExtrusion.getByLabel("Épaisseur (m, lignes, facultative)").fill("0.2");
  await formExtrusion.getByRole("button", { name: "Extruder la sélection", exact: true }).click();
  await page.locator('[data-studio-extrusion-etat="extrude"]').waitFor();
  check("volume : une commande d'extrusion en attente", (await portee()).includes("(2 commande(s)"), await portee());
  const formesVisibles = await page.locator('svg [role="button"][aria-label^="Ligne "], svg [role="button"][aria-label^="Rectangle "]').count();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const vue3d = page.locator("[data-studio-vue3d]");
  await vue3d.waitFor();
  const canevas = vue3d.locator("canvas[data-studio-vue3d-canvas]");
  await canevas.waitFor({ timeout: 20000 });
  check("Vue 3D (Maj+D) : bascule enfoncée, planche 2D remplacée", (await outils.locator('[data-studio-commande="vue-3d"]').getAttribute("aria-pressed")) === "true" && (await planche.count()) === 0);
  await page.waitForTimeout(300);
  const couleurs = await canevas.evaluate((c) => {
    const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
    const g = t.getContext("2d"); g.drawImage(c, 0, 0);
    const px = g.getImageData(0, 0, t.width, t.height).data, vus = new Set();
    for (let i = 0; i < px.length; i += 4 * 97) vus.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
    return { largeur: c.width, hauteur: c.height, couleurs: vus.size };
  });
  check("Vue 3D : un canevas WebGL rendu (non vide)", couleurs.largeur > 0 && couleurs.hauteur > 0 && couleurs.couleurs > 3 && (await vue3d.locator("[data-studio-vue3d-indisponible]").count()) === 0, JSON.stringify(couleurs));
  check("Vue 3D : un volume, les autres objets visibles comptés « non extrudés »", (await vue3d.getAttribute("data-studio-volumes")) === "1" && (await vue3d.getAttribute("data-studio-non-extrudes")) === String(formesVisibles - 1) && (await vue3d.locator("[data-studio-vue3d-decompte]").textContent()).includes(`${formesVisibles - 1} objet(s) non extrudé(s)`), `${await vue3d.getAttribute("data-studio-non-extrudes")} / ${formesVisibles - 1}`);
  const avantVolume = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiVolume = envois[envois.length - 1];
  check("volume : enregistré par studio.dessin.ligne puis studio.objet.extruder", envois.length === avantVolume + 1 && envoiVolume.commands.map((c) => c.toolId).join() === "studio.dessin.ligne,studio.objet.extruder" && JSON.stringify(envoiVolume.commands[1].params) === JSON.stringify({ ids: [murId], base: 0, height: 2.5, thickness: 0.2 }), JSON.stringify(envoiVolume?.commands));
  await page.reload();
  await page.locator(`[data-studio-objet="${murId}"]`).waitFor({ state: "attached" });
  const murRelu = (await a.api("get", variantePath)).revision.document.objects.find((o) => o.id === murId);
  check("volume : extrusion persistée côté serveur", JSON.stringify(murRelu?.extrusion) === JSON.stringify({ base: 0, height: 2.5, thickness: 0.2 }), JSON.stringify(murRelu));
  await page.locator(`[data-studio-objet="${murId}"]`).focus();
  await page.keyboard.press("Enter");
  await formExtrusion.waitFor();
  check("volume : après actualisation, les valeurs saisies sont relues", (await formExtrusion.getByLabel("Hauteur (m)").inputValue()) === "2.5" && (await formExtrusion.getByLabel("Épaisseur (m, lignes, facultative)").inputValue()) === "0.2" && (await page.locator("[data-studio-extrusion-etat]").getAttribute("data-studio-extrusion-etat")) === "extrude");
  await outils.locator('[data-studio-commande="vue-3d"]').click();
  await vue3d.locator("canvas[data-studio-vue3d-canvas]").waitFor();
  check("Vue 3D : relue après actualisation, le volume est rendu", (await vue3d.getAttribute("data-studio-volumes")) === "1");
  await outils.locator('[data-studio-commande="vue-3d"]').click();
  await planche.waitFor();

  // Feuille (Maj+P, barre Présentation) : A3 paysage à 1:100, cartouche prérempli (nom de l'étude), feuille SVG
  // téléchargée à sa taille réelle, impression de la seule feuille.
  const boutonFeuille = outils.locator('[data-studio-barre="presentation"] [data-studio-commande="feuille"][aria-keyshortcuts="Shift+P"]');
  check("Feuille : commande dans la barre Présentation, raccourci Maj+P", (await boutonFeuille.count()) === 1);
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

  await page.goto(`${base}?revision=${encodeURIComponent(ancienne)}`);
  await page.locator("[data-studio-lecture-seule-revision]").waitFor();
  check("Feuille : disponible en révision historique (lecture seule)", await outils.locator('[data-studio-commande="feuille"]').isEnabled());
  check("exports : en révision historique, le lien porte la révision affichée", (await lienExport("svg")) === `${variantePath}/export?format=svg&revision=${encodeURIComponent(ancienne)}` && (await lienExport("dxf")) === `${variantePath}/export?format=dxf&revision=${encodeURIComponent(ancienne)}`);

  // Import DXF (Maj+U, barre Importer) : indisponible en révision historique ; un DXF en millimètres (2 LINE, 1
  // LWPOLYLINE fermée, 1 CIRCLE) → rapport (1 non pris : CIRCLE), 3 objets convertis en mètres, annulable, enregistré,
  // relu identique ; un import de 600 lignes part en deux enveloppes de 500 commandes au plus.
  const boutonImport = outils.locator('[data-studio-barre="import"] [data-studio-commande="importer-dxf"][aria-keyshortcuts="Shift+U"]');
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
  check("Import DXF : rapport — unité mm lue dans le fichier, 3 objets, 1 non pris (CIRCLE)",
    (await rapportImport.getAttribute("data-studio-import-statut")) === "pret" && (await rapportImport.getAttribute("data-studio-import-unite")) === "mm" && (await rapportImport.getAttribute("data-studio-import-objets")) === "3"
    && (await rapportImport.getAttribute("data-studio-import-non-pris")) === "1" && nonPrisImport.join() === "CIRCLE:1" && (await rapportImport.locator("[data-studio-import-choix-unite]").count()) === 0
    && (await rapportImport.locator("[data-studio-import-unite-fichier]").textContent()).includes("1 unité = 0,001 m"), nonPrisImport.join());
  await boiteImport.locator("[data-studio-import-ajouter]").click();
  await boiteImport.waitFor({ state: "detached" });
  check("Import DXF : un lot de 3 commandes en attente dans le brouillon", (await portee()).includes("(3 commande(s)"), await portee());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  check("Import DXF : annulable (Ctrl+Z retire tout le lot)", (await portee()).includes("(0 commande(s)"), await portee());
  await page.keyboard.press("Control+y");
  check("Import DXF : rétabli (Ctrl+Y)", (await portee()).includes("(3 commande(s)"), await portee());
  const avantImport = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoiImport = envois[envois.length - 1];
  const attendus = [
    { toolId: "studio.dessin.ligne", params: { type: "line", start: { x: 20, y: 20 }, end: { x: 24, y: 20 } } },
    { toolId: "studio.dessin.ligne", params: { type: "line", start: { x: 20, y: 20 }, end: { x: 20, y: 23 } } },
    { toolId: "studio.dessin.rectangle", params: { type: "rectangle", origin: { x: 21, y: 21 }, width: 2, height: 1.5 } },
  ];
  const sansIdImport = (c) => { const { id, ...p } = c.params; return { toolId: c.toolId, params: p }; };
  check("Import DXF : enregistré en une enveloppe, millimètres convertis en mètres, identifiants « dxf-… »",
    envois.length === avantImport + 1 && envoiImport.baseRevisionId === teteAvantImport.id && JSON.stringify(envoiImport.commands.map(sansIdImport)) === JSON.stringify(attendus) && envoiImport.commands.every((c) => /^dxf-\d+$/.test(c.params.id)), JSON.stringify(envoiImport?.commands));
  const importe = await a.api("get", variantePath);
  const idsImport = envoiImport.commands.map((c) => c.params.id);
  check("Import DXF : le serveur a ajouté les 3 objets, rien d'autre ne change", importe.revision.document.objects.length === teteAvantImport.document.objects.length + 3
    && JSON.stringify(importe.revision.document.objects.filter((o) => idsImport.includes(o.id)).map((o) => sansIdImport({ toolId: "", params: o }).params)) === JSON.stringify(attendus.map((x) => x.params))
    && JSON.stringify(importe.revision.document.objects.filter((o) => !idsImport.includes(o.id))) === JSON.stringify(teteAvantImport.document.objects));
  const empreinteImport = await empreinte();
  await page.reload();
  await page.locator(`[data-studio-objet="${idsImport[2]}"]`).waitFor({ state: "attached" });
  check("Import DXF : l'actualisation restitue le même dessin", (await empreinte()) === empreinteImport && JSON.stringify((await a.api("get", variantePath)).revision) === JSON.stringify(importe.revision));

  // Grand import (600 lignes, mètres) sur la variante initiale : deux enveloppes chaînées (500 puis 100 commandes).
  const baseInitiale = `${BASE}/studio/projets/${pA.id}/etudes/${studyId}/variantes/${initialVariantId}`;
  const cheminInitial = `/projects/${pA.id}/studio/studies/${studyId}/variants/${initialVariantId}`;
  await page.goto(baseInitiale);
  await outils.waitFor();
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
  check("Import DXF : refus du second lot — 500 commandes enregistrées, les 100 autres seules en attente, sur la révision du premier lot",
    apresPremier.revision.document.objects.length === teteInitiale.document.objects.length + 500 && (await portee()).includes("(100 commande(s)")
    && (await page.locator(".studio-context [title]").first().getAttribute("title")) === apresPremier.revision.id
    && (await page.locator("[data-studio-erreur-planche]").textContent()).includes("100 commande(s) non envoyée(s)"), await portee());
  await outils.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const lotsGrand = envois.slice(avantGrand);
  const grandRelu = await a.api("get", cheminInitial);
  check("Import DXF : enregistrement en deux enveloppes (500 + 100), la seconde sur la révision de la première",
    lotsGrand.length === 3 && lotsGrand[0].commands.length === 500 && lotsGrand[1].commands.length === 100 && lotsGrand[0].baseRevisionId === teteInitiale.id
    && lotsGrand[1].baseRevisionId === apresPremier.revision.id && JSON.stringify(lotsGrand[2].commands) === JSON.stringify(lotsGrand[1].commands) && lotsGrand[2].baseRevisionId === apresPremier.revision.id
    && grandRelu.revision.parentRevisionId === apresPremier.revision.id && grandRelu.revision.document.objects.length === teteInitiale.document.objects.length + 600,
    lotsGrand.map((e) => `${e.commands.length}@${e.baseRevisionId}`).join(" "));

  // Accessibilité de l'accueil Studio.
  await page.goto(`${BASE}/studio`);
  await page.locator("[data-studio-projets]").waitFor();
  await page.screenshot({ path: join(OUT, "studio-accueil.png") });
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => v.id));
  check("accessibilité de l'accueil Studio : aucune violation critique ou sérieuse", graves.length === 0, graves.join(", "));

  // NAV-001 mobile : la même entrée dans la barre adaptative ; la planche tient dans l'écran.
  const mobile = await a.context.newPage();
  mobile.on("pageerror", (e) => erreurs.push(`mobile : ${e.message}`));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/accueil`);
  const entreeMobile = mobile.locator("#workspace-navigation a[data-nav-studio]");
  await entreeMobile.waitFor({ state: "visible" }).catch(() => {});
  check("NAV-001 mobile : entrée Studio présente et visible", await entreeMobile.isVisible());
  await entreeMobile.click();
  await mobile.waitForURL(`${BASE}/studio`);
  await mobile.goto(base);
  await mobile.locator("[data-studio-revisions] li").first().waitFor();
  check("mobile : la variante et son historique ne débordent pas", await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mobile.screenshot({ path: join(OUT, "studio-mobile.png") });

  // NAV-009 : les parcours existants restent atteignables.
  await page.goto(`${BASE}/projets/${pA.id}?module=atelier`);
  await page.locator(".module-content").waitFor();
  check("NAV-009 : le module Atelier du projet reste accessible", page.url().includes("module=atelier"));

  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette de navigation Studio : réussie.");
} finally {
  await browser.close();
}
