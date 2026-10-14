#!/usr/bin/env node
/** Project layout regression: real production build/API, isolated CI account.
 * No existing user project is read or modified. Import the repository's P.118
 * example, navigate all nine pages, and measure real DOM boxes in Chromium.
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/project-layout node apps/web/e2e/project-layout.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "atelier-captures/project-layout";
mkdirSync(OUT, { recursive: true });
const checks = [], measurements = [], errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: "block" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const modules = [
  ["accueil", "Accueil du projet"], ["pilotage", "Feuille de route"],
  ["projets-sources", "Projets et sources"], ["parcours", "Parcours"],
  ["programmation", "Programmation"], ["atelier", "Atelier architectural"],
  ["analyses", "Analyses métier"], ["documents", "Documents"], ["collaboration", "Collaboration"],
];
// Wait for the actual populated cards, not merely the module title or loading
// message. Every measured element must reach both shared content gutters.
const contentSelectors = {
  accueil: ".dossier-status-strip", pilotage: ".cockpit-header",
  "projets-sources": ".parcelle-tool", parcours: ".overview-grid",
  programmation: ".programme-case", atelier: ".atelier-n",
  analyses: ".analyses-module > .biz-card", documents: ".documents-module > .biz-card",
  collaboration: ".collaboration-module > .biz-card",
};
function check(name, ok, details) {
  checks.push({ name, ok: !!ok, details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || details === undefined ? "" : " " + JSON.stringify(details)}`);
}
async function settled() {
  await page.waitForFunction(() => ![...document.querySelectorAll('main [role="status"]')]
    .some((element) => /^(Chargement|Lecture des (documents|membres)|Lecture du journal|Calcul des analyses)/.test(element.textContent?.trim() ?? "")));
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.scrollTo(0, 0); });
}
async function measure(label, module, width, expanded) {
  const nav = page.getByRole("navigation", { name: "Modules du projet", exact: true });
  check(label + ": une seule barre", await nav.count() === 1);
  const labels = await nav.locator(":scope > button, :scope > a").allTextContents();
  check(label + ": neuf modules dans le même ordre", JSON.stringify(labels) === JSON.stringify(modules.map((entry) => entry[1])), labels);
  const active = await nav.locator('[aria-current="page"]').allTextContents();
  check(label + ": module actif exact", JSON.stringify(active) === JSON.stringify([modules.find((entry) => entry[0] === module)?.[1]]), active);
  const data = await page.evaluate(({ module, selector }) => {
    const box = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const nav = document.querySelector(".module-nav"), workspace = document.querySelector("#workspace-content");
    const main = document.querySelector(module === "pilotage" ? ".cockpit-page" : ".project-shell");
    const content = [...document.querySelectorAll(selector)].map(box);
    const gutter = parseFloat(getComputedStyle(workspace).getPropertyValue("--project-page-gutter"));
    return { topbar: box(document.querySelector(".fadi-topbar")), nav: box(nav), workspace: box(workspace), main: box(main), content,
      gutter, sidebar: box(document.querySelector(".app-sidebar")),
      railState: document.querySelector(".fadi-shell")?.getAttribute("data-sidebar"),
      immersive: document.body.classList.contains("atelier-immersive"),
      documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1 ? [...document.querySelectorAll("main *")]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 15).map((element) => ({ tag: element.tagName, class: String(element.className), rect: box(element) })) : [] };
  }, { module, selector: contentSelectors[module] });
  measurements.push({ label, ...data });
  const near = (a, b) => Math.abs(a - b) <= 2;
  check(label + ": navigation immédiatement sous l'en-tête", data.topbar?.height > 0 && data.nav?.height > 0 && near(data.nav.top, data.topbar.bottom), data);
  check(label + ": gabarit pleine largeur", data.main && near(data.main.left, data.workspace.left) && near(data.main.right, data.workspace.right), data);
  check(label + ": cartes chargées et étendues entre les marges communes", data.content.length > 0 && data.content.every((card) => card.height > 0 && near(card.left, data.workspace.left + data.gutter) && near(card.right, data.workspace.right - data.gutter)), data);
  check(label + ": barre latérale conservée", data.sidebar?.width > 0 && data.sidebar?.height > 0 && data.railState === (expanded ? "expanded" : "collapsed"), data);
  check(label + ": aucun débordement horizontal de la page", data.documentWidth <= data.viewport + 1, data.overflow);
  check(label + ": aucun plein écran automatique", !data.immersive);
  if (module === "atelier") {
    check(label + ": surface de dessin présente", await page.locator(".atelier-n-travail").isVisible());
  }
  if ((width === 1920 && !expanded) || (width === 1440 && expanded) || width === 390) {
    await page.screenshot({ path: join(OUT, label + ".png"), fullPage: true });
  }
}

try {
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `project-layout-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "project-layout-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await page.goto(`${BASE}/projets`);
  await page.locator('.example-card button:has-text("Importer")').first().click();
  await page.waitForURL(/\/projets\/proj_/, { timeout: 60000 });
  const root = page.url().split("?")[0];
  const projectId = new URL(root).pathname.split("/").at(-1);
  const initialStepsResponse = await page.request.get(`${BASE}/projects/${projectId}/steps`);
  if (!initialStepsResponse.ok()) throw new Error("Lecture des étapes de la référence de test impossible");
  const initialSteps = await initialStepsResponse.json();
  const url = (module) => module === "pilotage" ? `${root}/pilotage` : module === "accueil" ? root : `${root}?module=${module}`;
  const cases = [[1920, 1080, false], [1920, 1080, true], [1440, 900, false], [1440, 900, true], [1024, 768, false], [768, 1024, false], [390, 844, false]];
  for (const [width, height, expanded] of cases) {
    await page.setViewportSize({ width, height });
    for (const [module] of modules) {
      const label = `${width}-${expanded ? "expanded" : "collapsed"}-${module}`;
      try {
        await page.goto(url(module));
        await page.locator(".module-nav").waitFor({ state: "visible" });
        await page.locator(contentSelectors[module]).first().waitFor({ state: "visible" });
        if (module === "accueil") await page.locator(".dossier-overview").waitFor();
        else if (module === "atelier") await page.locator(".atelier-n-travail").waitFor();
        else if (module === "collaboration") await page.locator(".members-invite").waitFor();
        else if (module === "projets-sources") await page.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready);
        if (expanded) await page.locator(".sidebar-toggle").click();
        await settled();
        await measure(label, module, width, expanded);
      } catch (error) {
        check(label + ": ouverture et mesure", false, String(error));
        await page.screenshot({ path: join(OUT, label + "-failure.png"), fullPage: true }).catch(() => undefined);
      }
    }
  }

  // The editor also lives inside the Parcours: neither entry may hide navigation.
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const step of [10, 11]) {
    await page.goto(`${root}?module=parcours&etape=${step}`);
    await page.locator(".atelier-stage-header").waitFor();
    await settled();
    const visible = await page.locator(".module-nav").isVisible();
    check(`étape ${step} : barre commune visible`, visible);
    check(`étape ${step} : pas de masquage de Fadi`, await page.evaluate(() => !document.body.classList.contains("atelier-immersive")));
    await page.screenshot({ path: join(OUT, `parcours-etape-${step}.png`), fullPage: true });
  }

  // Mobile navigation, browser history and direct reload preserve the module.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url("accueil"));
  const nav = page.locator(".module-nav");
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await page.waitForURL(url("documents"));
  await nav.getByRole("button", { name: "Collaboration", exact: true }).click();
  await page.waitForURL(url("collaboration"));
  await page.locator(".members-invite").waitFor();
  await settled();
  check("mobile : onglet actif révélé dans la barre", await nav.evaluate((element) => {
    const item = element.querySelector('[aria-current="page"]').getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return item.left >= bounds.left - 1 && item.right <= bounds.right + 1;
  }));
  await page.goBack();
  await page.waitForURL(url("documents"));
  await page.reload();
  check("historique et rechargement : Documents reste actif", await page.locator('.module-nav [aria-current="page"]').textContent() === "Documents");
  const entries = page.locator(".module-nav > button, .module-nav > a");
  await entries.first().focus();
  for (let index = 0; index < modules.length; index++) {
    check(`clavier : ${modules[index][1]} accessible`, await entries.nth(index).evaluate((element) => element === document.activeElement));
    if (index < modules.length - 1) await page.keyboard.press("Tab");
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/accueil`);
  await page.locator('.fadi-home[data-home="application"]').waitFor();
  check("accueil général : aucune barre de modules ajoutée", await page.locator(".module-nav").count() === 0);
  check("accueil général : largeur de lecture inchangée", await page.locator('.fadi-home[data-home="application"]').evaluate((element) => getComputedStyle(element).maxWidth === "1440px"));
  const finalStepsResponse = await page.request.get(`${BASE}/projects/${projectId}/steps`);
  if (!finalStepsResponse.ok()) throw new Error("Relecture des étapes de la référence de test impossible");
  const finalSteps = await finalStepsResponse.json();
  const signature = (steps) => steps.map((step) => [step.number, step.title, step.phase, step.status]);
  check("21 étapes et données métier inchangées par la navigation", finalSteps.length === 21 && JSON.stringify(signature(initialSteps)) === JSON.stringify(signature(finalSteps)));
  check("aucune erreur JavaScript non interceptée", errors.length === 0, errors);
} catch (error) {
  check("exécution de la recette", false, String(error));
  await page.screenshot({ path: join(OUT, "failure.png"), fullPage: true }).catch(() => undefined);
} finally {
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ checks, measurements, errors }, null, 2));
  await browser.close();
  const failed = checks.filter((item) => !item.ok);
  console.log(`${checks.length - failed.length}/${checks.length} contrôles réussis`);
  if (failed.length) process.exitCode = 1;
}
