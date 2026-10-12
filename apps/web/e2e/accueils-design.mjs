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
  const geometry = await overview(id).evaluate((card) => {
    const action = card.querySelector(".dossier-primary-action"), preview = card.querySelector(".dossier-preview");
    const control = action?.querySelector("a,button"), rail = document.querySelector(".app-sidebar");
    if (!action || !preview || !control || !rail) return null;
    const a = action.getBoundingClientRect(), p = preview.getBoundingClientRect(), c = control.getBoundingClientRect(), r = rail.getBoundingClientRect();
    const style = getComputedStyle(action);
    return {
      sourceOrder: !!(action.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforePreview: a.bottom <= p.top + 2, controlHeight: c.height,
      railVisible: getComputedStyle(rail).display !== "none" && r.width > 0 && r.height > 0,
      noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      buttonWidth: c.width, availableWidth: action.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    };
  });
  check(`${label} : action dans la carte avant l’aperçu, ordre source et visuel conservé`, geometry?.sourceOrder && geometry.beforePreview);
  check(`${label} : barre verticale visible et page sans débordement horizontal`, geometry.railVisible && geometry.noPageOverflow);
  if (mobile) check(`${label} : action pleine largeur et cible tactile d’au moins 44 px`, geometry.controlHeight >= 44 && geometry.buttonWidth >= geometry.availableWidth - 2);
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
  // Compact visual evidence remains readable through the normal CI job log;
  // full-resolution, full-page captures stay in the downloadable artefact.
  const diagnostic = await page.screenshot({ type: "jpeg", quality: 40, fullPage: false });
  console.log(`FADI_CAPTURE:${label}:${diagnostic.toString("base64")}:END_FADI_CAPTURE`);
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
  check("Projets : les trois dossiers sont des liens natifs dans le sous-menu", (await menu.getByRole("menuitem").filter({ hasText: "P.ACC." }).count()) === 3 && await menu.getByRole("menuitem").filter({ hasText: a.code }).evaluate((el) => el.tagName === "A"));
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
  const continueLink = primary(b.id).getByRole("link", { name: "Poursuivre le Parcours", exact: true });
  await continueLink.waitFor();
  check("travail non séquentiel : la reprise vise l’étape 09 réellement en cours", await continueLink.getAttribute("href") === `${dossierPath(b.id)}?module=parcours&etape=9`);
  const stepsBefore = await api("get", `/projects/${b.id}/steps`);
  await checkComposition(b.id, "projet-desktop");
  await axe("projet-desktop");
  await continueLink.click();
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
  check("rechargement d’Accueil : même dossier et action toujours explicitement rattachée", (await primary(b.id).getByRole("link").getAttribute("href")).startsWith(`${dossierPath(b.id)}?module=parcours`));
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
  check("échec d'une ressource : l’aperçu conserve sa propre date et le Parcours reste accessible", await previewReading.textContent() === previewDate && await primary(b.id).getByRole("link", { name: "Poursuivre le Parcours", exact: true }).count() === 1);
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
  await primary(c.id).getByRole("button", { name: /Chargement du Parcours/ }).waitFor();
  check("chargement : action en attente et aucun faux compteur 0/21", await primary(c.id).getByRole("button").isDisabled() && !/0\s*\/\s*21/.test(await overview(c.id).textContent()));
  check("programme en chargement : le pied de carte ne le déclare pas indisponible", (await overview(c.id).locator(".dossier-card-footer").textContent()).includes("Chargement du programme…") && !(await overview(c.id).locator(".dossier-facts").textContent()).includes("Information indisponible"));
  releaseSteps();
  const retrySteps = primary(c.id).getByRole("button", { name: "Réessayer l’avancement", exact: true });
  await retrySteps.waitFor();
  check("lecture échouée : reprise explicite, pas de dossier vide inventé", !/0\s*\/\s*21/.test(await overview(c.id).textContent()));
  stepsAvailable = true;
  await retrySteps.click();
  await primary(c.id).getByRole("link", { name: "Commencer le Parcours", exact: true }).waitFor();
  check("reprise réussie : le vrai dossier vide peut alors proposer l’étape 01", (await primary(c.id).getByRole("link").getAttribute("href")).endsWith("&etape=1"));
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
  await primary(unknown.id).getByRole("button", { name: "Vérifier l’accès au dossier", exact: true }).waitFor();
  check("rôle inconnu : pas d’action d’écriture ou de progression supposée autorisée", await primary(unknown.id).getByRole("link").count() === 0);
  await page.unroute(projectUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(b.id);
  await primary(b.id).getByRole("link").waitFor();
  await checkComposition(b.id, "projet-mobile", true);
  await axe("projet-mobile");
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
