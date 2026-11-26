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
import { inscrireDansLaPage } from "./lib-inscription.mjs";

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
// Tâche 3 (lot Design L4) : l’action utile de la Vue d’ensemble, rendue de nouveau (décision du 26 novembre 2026).
const primary = (id) => overview(id).locator(".dossier-primary-action");
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
async function checkComposition(id, label, mobile = false) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const geometry = await overview(id).evaluate((card) => {
    const action = card.querySelector(".dossier-primary-action"), preview = card.querySelector(".dossier-preview");
    const control = action?.querySelector("a,button"), rail = document.querySelector(".app-sidebar"), barre = document.querySelector("[data-fd-barre-bas]");
    if (!action || !preview || !control || !rail) return null;
    const a = action.getBoundingClientRect(), p = preview.getBoundingClientRect(), c = control.getBoundingClientRect(), r = rail.getBoundingClientRect();
    const b = barre?.getBoundingClientRect(), barreVisible = !!b && b.width > 0 && b.height > 0;
    const style = getComputedStyle(action);
    return {
      sourceOrder: !!(action.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforePreview: a.bottom <= p.top + 2, controlHeight: c.height, controlInView: c.top >= 0 && c.bottom <= (barreVisible ? b.top : innerHeight), footer: !!card.querySelector(".dossier-card-footer"),
      railVisible: r.width > 0 && r.height > 0, barreVisible,
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      buttonWidth: c.width, availableWidth: action.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    };
  });
  check(label + " : action utile dans la carte, avant l’aperçu (ordre source et visuel), sans pied « Informations du dossier »", !!geometry?.sourceOrder && geometry.beforePreview && !geometry.footer);
  // Lot Design L6 : rail au bureau, barre du bas au téléphone (≤ 700 px), jamais les deux.
  if (mobile) check(label + " : barre du bas affichée, rail masqué, sans débordement horizontal", !!geometry?.barreVisible && !geometry.railVisible && !!geometry.noOverflow);
  else check(label + " : barre verticale conservée, barre du bas masquée, sans débordement horizontal", !!geometry?.railVisible && !geometry.barreVisible && !!geometry.noOverflow);
  if (mobile) check(label + " : action pleine largeur et cible tactile d’au moins 44 px", geometry.controlHeight >= 44 && geometry.buttonWidth >= geometry.availableWidth - 2, `hauteur ${geometry?.controlHeight}`);
  // Critère du lot L4 : sur l'accueil du projet, l'action est visible sans défiler au téléphone. L'accueil de l'application
  // ajoute au-dessus les entrées Importer / Nouveau projet et le titre du dossier de reprise (en-tête : lot L9) ; il est relevé, pas exigé.
  if (mobile && label.startsWith("projet-")) check(label + " : action visible sans défiler", geometry.controlInView);
  else if (mobile) console.log(`  ${label} : action ${geometry.controlInView ? "visible" : "sous la ligne de flottaison"} sans défiler (relevé, lot L9)`);
  await page.screenshot({ path: join(OUT, label + ".png"), fullPage: true });
}
async function register(target, email) {
  await inscrireDansLaPage(target, email, "accueils-design-ci-123", BASE);
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
  await primary(a.id).getByRole("link", { name: "Commencer le Parcours", exact: true }).waitFor();
  check("dossier vierge confirmé : Commencer le Parcours mène à 01", (await primary(a.id).getByRole("link").getAttribute("href")) === `${dossierPath(a.id)}?module=parcours&etape=1`);
  check("dossier vierge : parcelle non renseignée, sans surface zéro présentée comme un relevé", (await overview(a.id).locator(".dossier-facts > div").first().textContent()).includes("Parcelle non renseignée"));
  check("aperçu absent : aucune date de génération d’image annoncée", !(await overview(a.id).locator(".dossier-preview figcaption").textContent()).includes("Généré le"));
  check("accueil du projet : identité explicite, sans salut de l’application", (await page.locator(".fadi-topbar-title h1").textContent()).includes(a.code) && !(await page.locator('[data-home="project"]').textContent()).includes("Bienvenue dans Fadi"));
  check("Accueil n’est pas marqué actif sur le dossier", await page.locator('.app-nav a[href="/accueil"]').getAttribute("aria-current") !== "page");

  await selector.click();
  await menu.getByRole("menuitem").filter({ hasText: b.code }).click();
  // Attendre l'accueil de B lui-même : le lien « Voir les 21 étapes » de A, encore affiché pendant la navigation, satisfaisait
  // sinon l'attente, et le comptage tombait sur l'état intermédiaire (0 ou 2 liens) — échec intermittent constaté en local.
  await page.waitForURL(`${BASE}${dossierPath(b.id)}`);
  await overview(b.id).waitFor();
  const continueLink = page.locator(".dossier-journey .dossier-all-steps");
  await page.locator(`.dossier-journey .dossier-all-steps[href="${dossierPath(b.id)}?module=parcours"]`).waitFor();
  check("l’accès aux 21 étapes reste disponible", await continueLink.count() === 1 && (await continueLink.getAttribute("href")) === `${dossierPath(b.id)}?module=parcours`);
  const resumeLink = primary(b.id).getByRole("link", { name: "Poursuivre le Parcours", exact: true });
  await resumeLink.waitFor();
  check("travail non séquentiel : la reprise vise l’étape 09 réellement en cours", await resumeLink.getAttribute("href") === `${dossierPath(b.id)}?module=parcours&etape=9`);
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
  await page.locator(".cockpit-kpi-overview").waitFor();
  check("R4 : synthèse de pilotage calculée depuis les étapes réelles",
    (await page.locator(".cockpit-kpi-totals > div").count()) === 4 &&
    (await page.locator(".cockpit-kpi-totals > div strong").first().textContent()) === "1 / 21" &&
    (await page.locator(".cockpit-kpi-phase").count()) === 6);
  check("R4 : états d’étape distincts de la certification technique",
    (await page.locator(".cockpit-kpi-overview").textContent()).includes("pas une certification de résultat"));
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
  check("R4 : KPI de l’étape sélectionnée", await page.locator(".cockpit-kpi-step").count() === 1 && (await page.locator(".cockpit-kpi-step").getAttribute("aria-label"))?.includes("10"));
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
  // Onglet demandé : toujours entre Accueil du projet et Projets et sources.
  const projectTabs = page.getByRole("navigation", { name: "Modules du projet" });
  const orderedTabs = await projectTabs.locator(":scope > button, :scope > a").allTextContents();
  const roadmapTab = projectTabs.getByRole("link", { name: "Feuille de route", exact: true });
  check("R4 navigation : Feuille de route occupe exactement la deuxième position",
    orderedTabs.slice(0, 3).every((item, i) => item.trim() === ["Accueil du projet", "Feuille de route", "Projets et sources"][i]) &&
    await roadmapTab.getAttribute("href") === `${dossierPath(b.id)}/pilotage`);
  await roadmapTab.click();
  await page.waitForURL(`${BASE}${dossierPath(b.id)}/pilotage`);
  await page.locator(".cockpit-step").nth(20).waitFor();
  check("R4 navigation : onglet actif sur la feuille de route et contexte projet conservé",
    await page.getByRole("navigation", { name: "Modules du projet" })
      .getByRole("link", { name: "Feuille de route", exact: true }).getAttribute("aria-current") === "page" &&
    (await page.locator(".cockpit-code").textContent()) === b.code);
  await page.getByRole("navigation", { name: "Modules du projet" }).getByRole("button", { name: "Parcours", exact: true }).click();
  await page.waitForURL(`${BASE}${dossierPath(b.id)}?module=parcours`);
  check("R4 navigation : retour depuis le cockpit à Parcours sur le même dossier",
    await page.locator('.module-nav button[aria-current="page"]').textContent() === "Parcours");
  await page.getByRole("navigation", { name: "Modules du projet" }).getByRole("link", { name: "Feuille de route" }).click();
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
  await page.waitForFunction(() => document.querySelectorAll(".cockpit-kpi-totals strong")[1]?.textContent?.trim() === "1 / 21", null, { timeout: 20000 });
  check("R4 : indicateurs du planning actualisés après sauvegarde R2",
    (await page.locator(".cockpit-kpi-totals > div strong").nth(1).textContent()) === "1 / 21" &&
    (await page.locator(".cockpit-kpi-totals > div strong").nth(2).textContent()) === "1 / 21");
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
  check("rechargement d’Accueil : même dossier, une seule action, explicitement rattachée", await overview(b.id).count() === 1 && await primary(b.id).count() === 1 && (await primary(b.id).getByRole("link").getAttribute("href")).startsWith(`${dossierPath(b.id)}?module=parcours`));
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
  for (const [work, query, actionLabel] of [
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
    const workLink = primary(b.id).getByRole("link", { name: actionLabel, exact: true });
    await workLink.waitFor();
    check(`travail explicitement consulté · ${work} : reprise du même module et du même dossier`, await workLink.getAttribute("href") === `${dossierPath(b.id)}?${query}`);
  }
  await page.goto(`${BASE}${dossierPath(b.id)}?module=parcours&etape=9`);
  await page.locator(".top-stage").filter({ hasText: "ÉTAPE 09" }).waitFor();
  await openHome();
  await primary(b.id).getByRole("link", { name: "Poursuivre le Parcours", exact: true }).waitFor();

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
  await primary(c.id).getByRole("button", { name: /Chargement du Parcours/ }).waitFor();
  check("chargement : action en attente et aucun faux compteur 0/21", await primary(c.id).getByRole("button").isDisabled() && !/0\s*\/\s*21/.test(await overview(c.id).textContent()));
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
  await page.keyboard.press("Escape");
  await primary(c.id).getByRole("link", { name: "Commencer le Parcours", exact: true }).waitFor();
  check("reprise réussie : le vrai dossier vide peut alors proposer l’étape 01", (await primary(c.id).getByRole("link").getAttribute("href")).endsWith("&etape=1"));
  await page.unroute(stepsUrl);
  await page.unroute(initialProgrammeUrl);

  // Un serveur qui n'a pas encore donné le rôle ne rend personne propriétaire par défaut.
  const unknown = await api("post", "/projects", { code: "P.ACC.ROLE", name: "Accueil — Rôle à vérifier" });
  const projectUrl = `${BASE}/projects/${unknown.id}`;
  let roleHandlersInFlight = 0;
  await page.route(projectUrl, async (route) => {
    roleHandlersInFlight += 1;
    try {
      const response = await route.fetch();
      const data = await response.json();
      delete data.role;
      await route.fulfill({ response, json: data });
    } finally {
      roleHandlersInFlight -= 1;
    }
  });
  await openHome(unknown.id);
  await primary(unknown.id).getByRole("button", { name: "Vérifier l’accès au dossier", exact: true }).waitFor();
  check("rôle inconnu : pas d’action d’écriture ou de progression supposée autorisée", await primary(unknown.id).getByRole("link").count() === 0);
  // Seule interception de page encore active ici (les précédentes sont retirées, la suivante n'est pas posée) :
  // `unrouteAll({ behavior: "wait" })` la retire puis attend la fin de tout gestionnaire en cours (route.fetch /
  // route.fulfill), sans quoi sa réponse pouvait arriver sur une requête déjà rendue au réseau (« Route is already
  // handled! », vu en CI sur la PR #255). `page.unroute(url, handler)` n'accepte pas d'options d'attente.
  await page.unrouteAll({ behavior: "wait" });
  check("rôle inconnu : aucun gestionnaire d'interception encore en cours après le retrait", roleHandlersInFlight === 0, roleHandlersInFlight === 0 ? "" : `${roleHandlersInFlight} en cours`);
  const roleAfterCleanup = await page.evaluate(async (url) => (await (await fetch(url, { credentials: "include" })).json()).role ?? null, projectUrl);
  check("rôle inconnu : interception retirée, le serveur redonne le rôle", roleAfterCleanup === "proprietaire", roleAfterCleanup === "proprietaire" ? "" : `rôle reçu : ${roleAfterCleanup}`);

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
  await page.goto(`${BASE}${dossierPath(b.id)}?module=parcours`);
  const mobileNav = page.getByRole("navigation", { name: "Modules du projet" });
  await mobileNav.getByRole("link", { name: "Feuille de route" }).waitFor();
  const tabsMobile = await mobileNav.locator(":scope > button, :scope > a").allTextContents();
  const mobileTabsMeasure = await mobileNav.evaluate((nav) => {
    const tab = nav.querySelector(".module-nav-pilotage");
    const box = tab?.getBoundingClientRect(), container = nav.getBoundingClientRect();
    return { visible: !!box && box.left >= container.left && box.right <= container.right,
      width: box?.width ?? 0, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  check("R4 mobile : Feuille de route visible en deuxième position, sans débordement de page",
    tabsMobile[0]?.trim() === "Accueil du projet" && tabsMobile[1]?.trim() === "Feuille de route" &&
    tabsMobile[2]?.trim() === "Projets et sources" && mobileTabsMeasure.visible &&
    mobileTabsMeasure.width >= 44 && !mobileTabsMeasure.pageOverflow, JSON.stringify(mobileTabsMeasure));
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
  // Lot Design L6 : au téléphone, « Projets » est un lien de la barre du bas vers /projets (le volant reste au bureau).
  const barre = page.locator("[data-fd-barre-bas]");
  const entreesBarre = (await barre.locator("[data-fd-entree]").allTextContents()).map((t) => t.trim()).join("|");
  check("téléphone : barre du bas Accueil, Projets, Studio, GeoData, Plus ; Projets mène à /projets", entreesBarre === "Accueil|Projets|Studio|GeoData|Plus" && await barre.locator('[data-fd-entree="projets"]').getAttribute("href") === "/projets" && await selector.count() === 0, entreesBarre);
  const plus = barre.locator('[data-fd-entree="plus"]');
  const urlAvantPlus = page.url();
  await plus.click();
  const feuille = page.locator("dialog[open][data-fd-feuille-plus]");
  await feuille.waitFor();
  const entreesFeuille = (await feuille.locator("a[data-fd-entree]").allTextContents()).map((t) => t.trim()).join("|");
  check("feuille « Plus » : focus au titre, entrées dans l’ordre du groupe secondaire, « Plus » développé", await page.evaluate(() => document.activeElement?.id) === "fd-feuille-plus-titre" && entreesFeuille.startsWith("Collaboration|Bibliothèque|Harmonie|Revues externes|Organisations|Extensions|Paramètres") && await plus.getAttribute("aria-expanded") === "true", entreesFeuille);
  const hauteurs = await feuille.locator(".fd-feuille-entree").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  check("feuille « Plus » : chaque entrée mesure au moins 48 px de haut", hauteurs.length > 0 && hauteurs.every((h) => h >= 48), hauteurs.join(","));
  await page.waitForTimeout(400); // fin de l’animation d’entrée (0,18 s) avant le calcul des contrastes
  await axe("feuille-plus-mobile");
  await page.keyboard.press("Escape");
  await feuille.waitFor({ state: "detached" });
  await page.waitForTimeout(200);
  check("feuille « Plus » : Échap ferme, focus rendu à « Plus », adresse inchangée", await page.evaluate(() => document.activeElement?.getAttribute("data-fd-entree")) === "plus" && page.url() === urlAvantPlus && await plus.getAttribute("aria-expanded") === "false");
  await plus.click();
  await feuille.waitFor();
  await page.goBack();
  await feuille.waitFor({ state: "detached" });
  await page.waitForTimeout(200);
  check("feuille « Plus » : Retour la ferme sans quitter la page", page.url() === urlAvantPlus);
  await plus.click();
  await feuille.locator('[data-fd-entree="parametres"]').click();
  await page.waitForURL(`${BASE}/parametres`);
  await feuille.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector('[data-fd-barre-bas] [data-fd-entree="plus"]')?.hasAttribute("aria-describedby"), null, { timeout: 5000 }).catch(() => {});
  const decrit = await plus.getAttribute("aria-describedby");
  check("feuille « Plus » : un choix ouvre la page, la feuille se ferme, « Plus » signale la page courante", decrit === "fd-plus-page" && (await page.locator("#fd-plus-page").textContent()) === "Page actuelle : Paramètres", String(decrit));
  await page.goBack();
  await page.waitForURL(urlAvantPlus);
  check("feuille « Plus » : Retour après un choix revient à la page d’origine (aucune entrée d’historique en trop)", page.url() === urlAvantPlus);
  for (const [largeur, barreAttendue] of [[700, true], [701, false]]) {
    await page.setViewportSize({ width: largeur, height: 844 });
    await page.waitForTimeout(150);
    const etat = await page.evaluate(() => ({ barre: getComputedStyle(document.querySelector("[data-fd-barre-bas]")).display !== "none", rail: getComputedStyle(document.querySelector(".app-sidebar")).display !== "none" }));
    check(`${largeur} px : ${barreAttendue ? "barre du bas seule" : "rail seul"}`, etat.barre === barreAttendue && etat.rail === !barreAttendue, JSON.stringify(etat));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome();
  await overview(b.id).waitFor();
  await checkComposition(b.id, "application-mobile", true);
  await axe("application-mobile");

  // Lot Design L9 (M21) : au téléphone, en-tête d'une rangée de 64 px au plus (titre, Rechercher, Autres actions, Cloche),
  // sans icône Accueil (la barre du bas l'a) ; Historique, État et Langue sous « Autres actions » ; au bureau, inchangé.
  const entete = async () => page.evaluate(() => {
    const t = document.querySelector(".fadi-topbar"), vis = (s) => { const e = t?.querySelector(s); return !!e && e.getBoundingClientRect().width > 0; };
    // Une rangée : les boîtes visibles du titre et des actions se recouvrent toutes verticalement.
    const boites = [...(t?.querySelectorAll(".fadi-topbar-title h1, .fadi-topbar-actions > *") ?? [])].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const uneRangee = boites.length > 0 && Math.max(...boites.map((r) => r.top)) < Math.min(...boites.map((r) => r.bottom));
    return { hauteur: t ? t.getBoundingClientRect().height : 0, rangees: uneRangee ? 1 : 2, accueil: vis(".topbar-home"), autres: vis(".topbar-autres"), historique: vis(".history-trigger"), etat: vis(".topbar-state"), langue: vis("[data-choix-langue]"), cloche: vis(".notification-bell"), debord: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  for (const largeur of [412, 320]) {
    await page.setViewportSize({ width: largeur, height: 844 });
    await page.waitForTimeout(150);
    const e = await entete();
    check(`L9 · ${largeur} px : en-tête d’une rangée ≤ 64 px, sans icône Accueil ; Rechercher, Autres actions et Cloche visibles`, e.hauteur <= 64 && e.rangees === 1 && !e.accueil && e.autres && e.cloche && !e.historique && !e.etat && !e.langue && !e.debord, JSON.stringify(e));
  }
  const autres = page.getByRole("button", { name: "Autres actions", exact: true });
  await autres.click();
  await page.locator("#fadi-topbar-autres[data-ouvert]").waitFor();
  const ouvert = await entete();
  check("L9 · « Autres actions » développe Historique, État et Langue (cibles ≥ 48 px)", (await autres.getAttribute("aria-expanded")) === "true" && ouvert.historique && ouvert.etat && ouvert.langue
    && (await page.locator("#fadi-topbar-autres > button").evaluateAll((bs) => bs.every((b) => b.getBoundingClientRect().height >= 48))), JSON.stringify(ouvert));
  await axe("entete-autres-mobile");
  await page.screenshot({ path: join(OUT, "l9-entete-autres-320.png") });
  await page.keyboard.press("Escape");
  check("L9 · Échap replie « Autres actions » et rend le focus au bouton", (await autres.getAttribute("aria-expanded")) === "false" && await autres.evaluate((el) => el === document.activeElement));
  await autres.click();
  await page.getByRole("button", { name: "Historique de la plateforme", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  check("L9 · Historique s’ouvre depuis « Autres actions », qui se replie", (await autres.getAttribute("aria-expanded")) === "false");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check("L9 · fermer l’Historique rend le focus à « Autres actions » (bouton visible)", await autres.evaluate((el) => el === document.activeElement));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  const bureau = await entete();
  check("L9 · bureau : en-tête inchangé (Accueil, Historique, État, Langue en ligne ; pas de bouton « Autres actions »)", bureau.accueil && bureau.historique && bureau.etat && bureau.langue && !bureau.autres, JSON.stringify(bureau));
  await page.setViewportSize({ width: 390, height: 844 });

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
