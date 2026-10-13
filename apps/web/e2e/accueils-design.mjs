#!/usr/bin/env node
/**
 * Recette des trois décisions d'accueil (Design/Design Historique.md).
 * API et application construites, même origine, base CI dédiée : aucun dossier
 * utilisateur existant n'est utilisé. Les réponses dégradées sont interceptées
 * dans ce navigateur ; elles ne changent ni le serveur ni les autres recettes.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/accueils-design \
 *   node apps/web/e2e/accueils-design.mjs
 *
 * Playwright / axe-core sont déjà des dépendances du workspace web. Cette
 * recette doit être exécutée dans la CI normale avec Chromium installé.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "atelier-captures/accueils-design";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
const results = [], runtimeErrors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
await page.clock.install();
page.on("pageerror", (error) => runtimeErrors.push(error.message));

function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(name);
}
async function api(method, path, data) {
  const response = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
  if (!response.ok()) throw new Error(`Préparation de la recette : ${method} ${path} → ${response.status()}`);
  return response.json();
}
const dossierPath = (id) => `/projets/${id}`;
const overview = (id) => page.locator(`.dossier-overview[data-project-id="${id}"]`);
const bell = () => page.locator(".notification-bell > button");
async function openHome(id) {
  await page.goto(`${BASE}${id ? dossierPath(id) : "/accueil"}`);
  await page.locator(`[data-home="${id ? "project" : "application"}"]`).waitFor();
  if (id) await overview(id).waitFor();
}
async function axe(label) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    iframes: false, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  })).violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) })));
  writeFileSync(join(OUT, `axe-${label}.json`), JSON.stringify(violations, null, 2));
  const serious = violations.filter((v) => ["critical", "serious"].includes(v.impact));
  check(`accessibilité · ${label} : aucune violation critique ou sérieuse`, serious.length === 0, serious.map((v) => v.id).join(", "));
}
async function checkComposition(id, label) {
  const geometry = await overview(id).evaluate((card) => {
    const preview = card.querySelector(".dossier-preview"), rail = document.querySelector(".app-sidebar");
    if (!preview || !rail) return null;
    const rect = rail.getBoundingClientRect();
    return { extraBlocks: !!card.querySelector(".dossier-primary-action, .dossier-card-footer"),
      previewVisible: preview.getBoundingClientRect().width > 0,
      railVisible: rect.width > 0 && rect.height > 0,
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  check(label + " : aucun bloc « Prochaine action » ni pied « Informations du dossier »", !!geometry && !geometry.extraBlocks && geometry.previewVisible);
  check(label + " : barre verticale conservée sans débordement horizontal", !!geometry?.railVisible && !!geometry.noOverflow);
  await page.screenshot({ path: join(OUT, label + ".png"), fullPage: true });
}
async function register(target, email) {
  await target.goto(`${BASE}/inscription`);
  await target.fill('input[name="email"]', email);
  await target.fill('input[name="password"]', "accueils-design-ci-123");
  await target.click('button[type="submit"]');
  await target.waitForURL(/\/(accueil|projets)$/);
}

try {
  const run = Date.now();
  await register(page, `accueils-${run}@example.com`);
  await openHome();
  await page.getByText("Aucun dossier consulté", { exact: false }).waitFor();
  check("première visite : aucun dossier choisi implicitement", await page.locator(".dossier-overview").count() === 0);
  check("les deux accueils commencent avec une barre repliée", await page.locator(".fadi-shell").getAttribute("data-sidebar") === "collapsed");

  const a = await api("post", "/projects", { code: "P.ACC.A", name: "Accueil — Dossier A" });
  const b = await api("post", "/projects", { code: "P.ACC.B", name: "Accueil — Dossier B" });
  const c = await api("post", "/projects", { code: "P.ACC.C", name: "Accueil — Lecture à reprendre" });
  // Le prochain travail connu est 09, même si 01 reste à faire : jamais compteur + 1.
  await api("patch", `/projects/${b.id}/steps/2`, { status: "termine" });
  await api("patch", `/projects/${b.id}/steps/9`, { status: "en-cours" });
  // Relire la liste après la préparation API, sans ouvrir ni choisir un dossier.
  await page.goto(`${BASE}/projets`);
  await page.locator(`.project-list a[href="${dossierPath(c.id)}"]`).waitFor();
  await openHome();
  await page.getByRole("button", { name: "Choisir un projet", exact: true }).first().waitFor();
  check("des projets existent, mais aucune consultation n’est déduite de leur création ou modification", await page.locator(".dossier-overview").count() === 0);

  const selector = page.getByRole("button", { name: "Projets", exact: true });
  await selector.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Projets", exact: true });
  await menu.waitFor();
  // Le menu se monte immédiatement mais la liste provient d'une requête React Query.
  // Attendre ses trois liens natifs exacts (pas seulement le conteneur) avant
  // d'évaluer leur nombre : aucun projet n'est simulé et l'assertion reste stricte.
  const expectedProjectLinks = [a, b, c].map((project) => dossierPath(project.id));
  await page.waitForFunction((hrefs) => {
    const items = [...document.querySelectorAll('#projects-menu a[role="menuitem"]')];
    return hrefs.every((href) => items.some((item) => item.getAttribute("href") === href));
  }, expectedProjectLinks, { timeout: 20000 }).catch(() => undefined);
  const actualProjectLinks = await menu.locator('a[role="menuitem"]').evaluateAll((items) => items.map((el) => el.getAttribute("href")));
  check("Projets : les trois dossiers sont des liens natifs dans le sous-menu",
    (await menu.getByRole("menuitem").filter({ hasText: "P.ACC." }).count()) === 3 &&
    expectedProjectLinks.every((href) => actualProjectLinks.includes(href)),
    JSON.stringify({ expectedProjectLinks, actualProjectLinks }));
  check("Collaboration reste hors du sous-menu Projets", await menu.getByRole("menuitem", { name: "Collaboration", exact: true }).count() === 0);
  await page.keyboard.press("Escape");
  check("Échap ferme le sous-menu et rend le focus à Projets", !(await menu.isVisible()) && await selector.evaluate((el) => el === document.activeElement));
  await selector.click();
  const aLink = menu.getByRole("menuitem").filter({ hasText: a.code });
  check("sélection : destination native vers l’accueil du dossier", await aLink.getAttribute("href") === dossierPath(a.id));
  await aLink.click();
  await page.waitForURL(`${BASE}${dossierPath(a.id)}`);
  await overview(a.id).waitFor();
  check("dossier vierge : action retirée de la carte", await overview(a.id).locator(".dossier-primary-action").count() === 0);
  check("dossier vierge : parcelle non renseignée, sans surface zéro présentée comme un relevé", (await overview(a.id).locator(".dossier-facts > div").first().textContent()).includes("Parcelle non renseignée"));
  check("aperçu absent : aucune date de génération d’image annoncée", !(await overview(a.id).locator(".dossier-preview figcaption").textContent()).includes("Généré le"));
  check("accueil du projet : identité explicite, sans salut de l’application", (await page.locator(".fadi-topbar-title h1").textContent()).includes(a.code) && !(await page.locator('[data-home="project"]').textContent()).includes("Bienvenue dans Fadi"));
  check("Accueil n’est pas marqué actif sur le dossier", await page.locator('.app-nav a[href="/accueil"]').getAttribute("aria-current") !== "page");

  await selector.click();
  await menu.getByRole("menuitem").filter({ hasText: b.code }).click();
  const continueLink = page.locator(".dossier-journey .dossier-all-steps");
  await continueLink.waitFor();
  check("l’accès aux 21 étapes reste disponible", await continueLink.count() === 1);
  const stepsBefore = await api("get", `/projects/${b.id}/steps`);
  await checkComposition(b.id, "projet-desktop");
  check("la cloche expose le nombre d’alertes du dossier", (await bell().getAttribute("data-alert-count")) !== null);
  await bell().click();
  check("les alertes et notifications restent deux catégories distinctes", await page.locator(".notification-alerts").count() === 1 && await page.locator(".notification-incoming").count() === 1);
  await page.keyboard.press("Escape");
  await axe("projet-desktop");

  // Cockpit natif : le même dossier, sans iframe, et les étapes réelles.
  const cockpitEntry = page.locator(".cockpit-preview-open");
  await cockpitEntry.waitFor();
  check("planning : accès au pilotage du dossier courant", (await cockpitEntry.getAttribute("href")) === `${dossierPath(b.id)}/pilotage`);
  await cockpitEntry.click();
  await page.waitForURL(`${BASE}${dossierPath(b.id)}/pilotage`);
  await page.locator(".cockpit-step").nth(20).waitFor();
  check("cockpit : contexte du projet conservé dans l'en-tête", (await page.locator(".fadi-topbar-title h1").textContent()).includes(b.code));
  check("cockpit : six phases et 21 étapes provenant du Parcours", await page.locator(".cockpit-phase").count() === 6 && await page.locator(".cockpit-step").count() === 21);
  check("cockpit : statuts réels respectés", (await page.locator(".cockpit-step").nth(1).getAttribute("aria-label")).includes("Terminé"));
  // R3 : chaque carte offre un raccourci métier réel, distinct de son
  // bouton de sélection ; aucune vue à prérequis manquants n'est activée.
  const quicks = page.locator(".cockpit-step-shortcut");
  check("R3 : 21 raccourcis métier distincts et natifs dans le bon dossier", await quicks.count() === 21 &&
    (await quicks.nth(0).getAttribute("href")) === `${dossierPath(b.id)}?module=projets-sources` &&
    (await quicks.nth(4).getAttribute("href")) === `${dossierPath(b.id)}?module=programmation` &&
    (await quicks.nth(9).getAttribute("href")) === `${dossierPath(b.id)}?module=atelier` &&
    (await quicks.nth(13).getAttribute("href")) === `${dossierPath(b.id)}?module=analyses` &&
    (await quicks.nth(17).getAttribute("href")) === `${dossierPath(b.id)}?module=documents`);
  await page.locator(".cockpit-step").nth(9).click();
  await page.locator(".cockpit-step-tools").waitFor();
  const appliedProgramme = await api("get", `/projects/${b.id}/programme`);
  if (!appliedProgramme.programmeCase) {
    await page.locator(".cockpit-step-tool-blocked").filter({ hasText: "Comparer le programme au modèle dessiné" }).waitFor();
    check("R3 : comparaison sans cas appliqué bloquée, avec recours vers Programmation",
      (await page.locator(".cockpit-step-tool-blocked").filter({ hasText: "Comparer le programme au modèle dessiné" }).locator("a").count()) === 1 &&
      (await page.locator(".cockpit-step-tool-blocked").filter({ hasText: "Comparer le programme au modèle dessiné" }).locator("a").getAttribute("href")) === `${dossierPath(b.id)}?module=programmation`);
  }
  check("R3 : Atelier de l’étape 10 reste accessible dans le panneau",
    (await page.locator(".cockpit-step-tools a").filter({ hasText: "Ouvrir l’Atelier architectural" }).getAttribute("href")) === `${dossierPath(b.id)}?module=atelier`);
  await axe("cockpit-desktop");
  await quicks.nth(4).click();
  await page.waitForURL(`${BASE}${dossierPath(b.id)}?module=programmation`);
  await page.locator('.module-nav button[aria-current="page"]').filter({ hasText: "Programmation" }).waitFor();
  check("R3 : raccourci réellement connecté au module Programmation", (await page.locator('.module-nav button[aria-current="page"]').textContent()) === "Programmation");
  await page.goto(`${BASE}${dossierPath(b.id)}/pilotage`);
  await page.locator(".cockpit-step").nth(20).waitFor();
  // R2 : écriture effective, puis relecture serveur et retour aux deux accueils.
  await page.locator(".cockpit-step").first().click();
  const editor = page.locator(".cockpit-planning-editor");
  await editor.locator('input[type="date"]').first().fill("2026-11-02");
  await editor.locator('input[type="date"]').nth(1).fill("2026-11-06");
  await editor.locator('input[type="text"]').fill("Architecte principal");
  await editor.locator("textarea").fill("Confirmer le relevé du site.");
  await editor.getByRole("button", { name: "Enregistrer le suivi" }).click();
  await editor.getByText("Planning enregistré sur le serveur.").waitFor();
  const serverPlanning = await api("get", `/projects/${b.id}/planning`);
  check("R2 : échéances, responsable et action enregistrés par l'API", serverPlanning.steps["1"].startDate === "2026-11-02" && serverPlanning.steps["1"].endDate === "2026-11-06" && serverPlanning.steps["1"].responsible === "Architecte principal");
  await page.reload();
  await page.locator(".cockpit-baseline-summary").waitFor();
  await page.locator(".cockpit-step").first().click();
  check("R2 : saisie persistante après rechargement", await page.locator(".cockpit-planning-editor textarea").inputValue() === "Confirmer le relevé du site.");
  await page.getByRole("button", { name: "Vue tableau" }).click();
  check("cockpit : tableau simple des 21 étapes", await page.locator(".cockpit-table tbody tr").count() === 21);
  await page.getByRole("button", { name: "Masquer le panneau de pilotage" }).click();
  check("cockpit : panneau masqué à la demande", await page.locator(".cockpit-side-panel").count() === 0);
  await page.getByRole("button", { name: "Afficher le panneau de pilotage" }).click();
  check("cockpit : panneau réaffiché", await page.locator(".cockpit-side-panel").count() === 1);
  await page.getByRole("link", { name: "Retour à l’accueil du projet" }).click();
  await overview(b.id).waitFor();
  await page.goto(`${BASE}${dossierPath(b.id)}?module=parcours&etape=9`);
  await page.waitForURL((url) => url.pathname === dossierPath(b.id) && url.searchParams.get("module") === "parcours" && url.searchParams.get("etape") === "9");
  await page.locator(".top-stage").filter({ hasText: "ÉTAPE 09" }).waitFor();
  check("reprise : le vrai Parcours est ouvert, pas un dialogue d’étape", await page.locator("dialog[open]").count() === 0);
  await page.locator(".workflow-back").click();
  await page.waitForSelector(".overview-step");
  check("le Parcours conserve ses 21 cartes et leurs libellés d’origine", await page.locator(".overview-step").count() === 21 && (await page.locator(".overview-step").allTextContents()).every((text, i) => text.includes(stepsBefore[i].title)));
  const stepsAfter = await api("get", `/projects/${b.id}/steps`);
  check("ouvrir le Parcours ne termine aucune étape", JSON.stringify(stepsAfter.map((s) => [s.number, s.status])) === JSON.stringify(stepsBefore.map((s) => [s.number, s.status])));

  await openHome();
  await overview(b.id).waitFor();
  check("Accueil : seul le dernier dossier explicitement consulté est présenté", await page.locator(".dossier-overview").count() === 1 && await overview(a.id).count() === 0);
  check("Accueil ne duplique ni le parcours complet ni les modules et documents du dossier", await page.locator(".overview-step,.module-nav,.dossier-journey,.dossier-modules,.dossier-resources").count() === 0);
  await page.reload();
  await overview(b.id).waitFor();
  check("rechargement d’Accueil : même dossier sans commande dupliquée", await overview(b.id).count() === 1 && await overview(b.id).locator(".dossier-primary-action").count() === 0);
  await checkComposition(b.id, "application-desktop");
  await axe("application-desktop");

  await page.getByRole("button", { name: "Rechercher un projet", exact: true }).click();
  await page.getByRole("dialog", { name: "Rechercher un projet", exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Rechercher un projet", exact: true }).fill(a.code);
  check("chercher un autre projet ne change pas le dernier dossier en arrière-plan", await overview(b.id).count() === 1 && await page.getByRole("dialog").getByRole("link").filter({ hasText: a.code }).count() === 1);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Rechercher un projet", exact: true }).waitFor({ state: "hidden" });
  check("Échap ferme aussi la recherche après saisie et rend le focus à la loupe", await page.getByRole("button", { name: "Rechercher un projet", exact: true }).evaluate((el) => el === document.activeElement));
  await page.getByRole("button", { name: "Historique de la plateforme", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  check("le journal de plateforme ne sélectionne pas un autre dossier", new URL(page.url()).pathname === "/accueil" && await overview(b.id).count() === 1);
  await page.keyboard.press("Escape");

  // Vieillir une lecture, puis échouer sa reprise : l'ancienne valeur et sa
  // date restent affichées, sans donner une nouvelle date à l'aperçu.
  const readings = overview(b.id).locator("details.dossier-readings");
  await readings.locator("summary").click();
  const programmeReading = readings.locator('[data-resource="Programme"] .resource-note > span');
  const previewReading = readings.locator('[data-resource="Aperçu"] .resource-note > span');
  await programmeReading.filter({ hasText: "Dernière lecture réussie" }).waitFor();
  await previewReading.filter({ hasText: "Dernière lecture réussie" }).waitFor();
  const programmeDate = (await programmeReading.textContent()).split(" · ").slice(1).join(" · ");
  const previewDate = await previewReading.textContent();
  const programmeFact = await overview(b.id).locator(".dossier-facts > div").nth(1).textContent();
  const programmeUrl = `${BASE}/projects/${b.id}/programme`;
  await page.route(programmeUrl, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "ci_refresh_failure" }) }));
  await page.clock.fastForward(61000);
  await readings.getByRole("button", { name: "Actualiser programme", exact: true }).click();
  await programmeReading.filter({ hasText: "Actualisation impossible" }).waitFor();
  check("actualisation échouée : valeur du programme et date de sa dernière lecture conservées", !!programmeDate && (await programmeReading.textContent()).endsWith(programmeDate) && await overview(b.id).locator(".dossier-facts > div").nth(1).textContent() === programmeFact);
  check("échec d’une ressource : l’aperçu garde sa propre date", await previewReading.textContent() === previewDate);
  await page.unroute(programmeUrl);
  await readings.getByRole("button", { name: "Actualiser programme", exact: true }).click();
  await programmeReading.filter({ hasText: "Dernière lecture réussie" }).waitFor();
  await readings.locator("summary").click();

  // The useful action resumes an explicitly opened workspace, never a module
  // inferred from a stale review or a preview warning.
  for (const [work, query] of [
    ["programme", "module=programmation", "Ouvrir le programme"],
    ["atelier", "module=atelier", "Ouvrir l’Atelier"],
    ["review", "module=parcours&etape=11&bilan=1", "Consulter la revue"],
  ]) {
    await page.goto(`${BASE}${dossierPath(b.id)}?${query}`);
    await page.waitForFunction(({ projectId, work }) => Object.keys(localStorage).some((key) => {
      if (!key.startsWith("fadi.lastDossier.v1:")) return false;
      try { const value = JSON.parse(localStorage.getItem(key)); return value?.projectId === projectId && value?.currentWork === work; } catch { return false; }
    }), { projectId: b.id, work });
    await openHome();
    const workLink = overview(b.id);
    await workLink.waitFor();
    check(`travail explicitement consulté · ${work} : la commande de la carte est bien supprimée`, await workLink.locator(".dossier-primary-action").count() === 0);
  }
  await page.goto(`${BASE}${dossierPath(b.id)}?module=parcours&etape=9`);
  await page.locator(".top-stage").filter({ hasText: "ÉTAPE 09" }).waitFor();
  await openHome();
  await overview(b.id).waitFor();

  // Première lecture retenue, puis échec explicite : jamais 0/21 à partir d’une absence de réponse.
  let releaseSteps;
  const stepGate = new Promise((resolve) => { releaseSteps = resolve; });
  let stepsAvailable = false;
  const stepsUrl = `${BASE}/projects/${c.id}/steps`;
  const initialProgrammeUrl = `${BASE}/projects/${c.id}/programme`;
  await page.route(initialProgrammeUrl, async (route) => { await stepGate; await route.continue(); });
  await page.route(stepsUrl, async (route) => {
    await stepGate;
    if (stepsAvailable) await route.continue();
    // Une réponse API 500 teste une lecture en échec, sans simuler en plus la
    // perte du relais (502/503/504 ont leur propre reprise de connexion).
    else await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "ci_read_failure" }) });
  });
  await openHome(c.id);
  await overview(c.id).waitFor();
  check("chargement : aucun faux compteur 0/21", !/0\s*\/\s*21/.test(await overview(c.id).textContent()));
  check("programme en chargement : pas de fausse donnée indisponible", !(await overview(c.id).locator(".dossier-facts").textContent()).includes("Information indisponible"));
  releaseSteps();
  const retrySteps = page.locator(".notification-bell .notification-alerts button").filter({ hasText: "Actualiser l’avancement" });
  await bell().click();
  await retrySteps.waitFor();
  check("lecture échouée : reprise explicite, pas de dossier vide inventé", !/0\s*\/\s*21/.test(await overview(c.id).textContent()));
  stepsAvailable = true;
  await retrySteps.click();
  await page.locator('[data-alert-id="steps-read"]').waitFor({ state: "hidden" });
  check("reprise réussie : avertissement d’avancement retiré", await page.locator('[data-alert-id="steps-read"]').count() === 0);
  await page.unroute(stepsUrl);
  await page.unroute(initialProgrammeUrl);

  // Un serveur qui n'a pas encore donné le rôle ne rend personne propriétaire par défaut.
  const unknown = await api("post", "/projects", { code: "P.ACC.ROLE", name: "Accueil — Rôle à vérifier" });
  const projectUrl = `${BASE}/projects/${unknown.id}`;
  await page.route(projectUrl, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.role;
    await route.fulfill({ response, json: data });
  });
  await openHome(unknown.id);
  await overview(unknown.id).waitFor();
  check("rôle inconnu : pas de commande de progression dans la carte", await overview(unknown.id).locator(".dossier-primary-action").count() === 0);
  await page.unroute(projectUrl);

  // L'identité du dossier elle-même peut manquer : l'action doit reprendre
  // cette lecture, respecter le refus d'accès ou renouveler la session.
  const recovery = await api("post", "/projects", { code: "P.ACC.REPRISE", name: "Accueil — Reprise du dossier" });
  const recoveryUrl = `${BASE}/projects/${recovery.id}`;
  let dossierResponse = 500;
  await page.route(recoveryUrl, async (route) => {
    if (!dossierResponse) await route.continue();
    else await route.fulfill({ status: dossierResponse, contentType: "application/json", body: JSON.stringify({ error: "ci_dossier_unavailable" }) });
  });
  await page.goto(`${BASE}${dossierPath(recovery.id)}`);
  const unavailable = page.locator(".dossier-unavailable");
  const retryDossier = unavailable.getByRole("button", { name: "Réessayer la lecture du dossier", exact: true });
  await retryDossier.waitFor();
  check("dossier non lu : la reprise prioritaire relit le dossier, sans inventer une vue d’ensemble", await retryDossier.getAttribute("class") === "button-primary" && await page.locator(".dossier-overview").count() === 0);
  dossierResponse = 0;
  await retryDossier.click();
  await overview(recovery.id).waitFor();
  check("reprise de la lecture : le dossier demandé est effectivement ouvert", new URL(page.url()).pathname === dossierPath(recovery.id));

  dossierResponse = 404;
  await page.reload();
  const returnToProjects = unavailable.getByRole("link", { name: "Retour aux projets", exact: true });
  await returnToProjects.waitFor();
  check("dossier devenu inaccessible : retour natif aux projets, aucune donnée du cache exposée", await returnToProjects.getAttribute("href") === "/projets" && await returnToProjects.getAttribute("class") === "button-primary" && await page.locator(".dossier-overview").count() === 0);

  dossierResponse = 401;
  await page.reload();
  const reconnect = unavailable.getByRole("link", { name: "Se reconnecter", exact: true });
  await reconnect.waitFor();
  const loginDestination = new URL(await reconnect.getAttribute("href"), BASE);
  check("session expirée : reconnexion prioritaire avec le dossier demandé comme destination", loginDestination.pathname === "/connexion" && loginDestination.searchParams.get("renouveler") === "1" && loginDestination.searchParams.get("returnTo") === dossierPath(recovery.id));
  await reconnect.click();
  await page.waitForURL((url) => url.pathname === "/connexion");
  dossierResponse = 0;
  await page.unroute(recoveryUrl);
  await page.fill('input[name="email"]', `accueils-${run}@example.com`);
  await page.fill('input[name="password"]', "accueils-design-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}${dossierPath(recovery.id)}`);
  await overview(recovery.id).waitFor();
  check("session renouvelée : retour réel au même dossier et reprise du Parcours disponible", await overview(recovery.id).count() === 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(b.id);
  await overview(b.id).waitFor();
  await checkComposition(b.id, "projet-mobile", true);
  await axe("projet-mobile");
  // R3 mobile : les raccourcis restent tactiles sans empiéter sur les cartes,
  // le panneau reste sous la feuille de route et aucune barre n'élargit la page.
  await page.goto(`${BASE}${dossierPath(b.id)}/pilotage`);
  await page.locator(".cockpit-step-shortcut").nth(20).waitFor();
  const mobileCockpit = await page.evaluate(() => ({
    phases: document.querySelectorAll(".cockpit-phase").length,
    shortcuts: document.querySelectorAll(".cockpit-step-shortcut").length,
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    shortcutWidth: document.querySelector(".cockpit-step-shortcut")?.getBoundingClientRect().width ?? 0,
  }));
  check("R3 mobile : six phases, 21 accès tactiles, aucun débordement global", mobileCockpit.phases === 6 && mobileCockpit.shortcuts === 21 && mobileCockpit.noOverflow && mobileCockpit.shortcutWidth >= 40, JSON.stringify(mobileCockpit));
  await page.locator(".cockpit-step").nth(9).click();
  await page.locator(".cockpit-step-tools").waitFor();
  await axe("cockpit-mobile");
  await page.screenshot({ path: join(OUT, "cockpit-mobile-r3.png"), fullPage: true });
  await openHome(b.id);
  await selector.click();
  await menu.waitFor();
  const menuBounds = await menu.boundingBox(), railBounds = await page.locator(".app-sidebar").boundingBox();
  check("téléphone : le sous-menu s’ouvre à droite de la barre et tient dans l’écran", menuBounds && railBounds && menuBounds.x >= railBounds.x + railBounds.width - 2 && menuBounds.x + menuBounds.width <= 391);
  await page.keyboard.press("Escape");
  await openHome();
  await overview(b.id).waitFor();
  await checkComposition(b.id, "application-mobile", true);
  await axe("application-mobile");

  // Copie des préférences du navigateur, mais aucune session : un autre compte
  // ne doit pas hériter de la consultation de son prédécesseur.
  const storage = await context.storageState();
  const nextContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: storage.origins } });
  const nextPage = await nextContext.newPage();
  await register(nextPage, `accueils-autre-${run}@example.com`);
  await nextPage.goto(`${BASE}/accueil`);
  await nextPage.getByText("Aucun dossier consulté", { exact: false }).waitFor();
  check("préférence de dossier isolée par utilisateur, même avec les anciennes préférences locales", await nextPage.locator(".dossier-overview").count() === 0 && !(await nextPage.locator("main").textContent()).includes(b.name));
  await nextContext.close();
  check("aucune erreur JavaScript pendant les transitions d’accueil", runtimeErrors.length === 0, runtimeErrors.join(" | "));
} catch (error) {
  console.error(`✗ Recette des accueils interrompue : ${error.stack ?? error}`);
  results.push({ name: "Recette interrompue", ok: false, detail: String(error) });
  await page.screenshot({ path: join(OUT, "echec-accueils.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(OUT, "resultats.json"), JSON.stringify({ results, runtimeErrors }, null, 2));
  await browser.close();
}
const failures = results.filter((result) => !result.ok).length;
console.log(`\nAccueil : ${results.length - failures} contrôles réussis, ${failures} échec(s).`);
process.exitCode = failures ? 1 : 0;
