#!/usr/bin/env node
/**
 * Recette d'accessibilité de Studio (I.5-02) : liste « Éléments du dessin » au clavier (flèches, Début / Fin, Entrée,
 * Espace, Maj + plage, Ctrl+A, Suppr par la commande existante, focus sur l'élément suivant, région vivante), focus
 * conservé après Ctrl+S, repli sur le premier calque quand le calque actif disparaît, avis non bloquant d'une révision
 * plus récente avec « Recharger », piège du focus des boîtes de dialogue (Outils, palette, Feuille, import DXF : Tab
 * bouclé, Échap, retour du focus), axe-core sans violation sérieuse ni critique sur l'accueil Studio, une étude et une
 * variante, en bureau et en téléphone. API et application construites, même origine, base migrée.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-accessibilite node apps/web/e2e/studio-accessibilite.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-accessibilite";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
const erreurs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}

const ligne = (id, x, y, layerId) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", ...(layerId ? { layerId } : {}), start: { x, y }, end: { x: x + 3, y } } });
const rect = (id, x, y, layerId) => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", ...(layerId ? { layerId } : {}), origin: { x, y }, width: 2, height: 1 } });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-a11y-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-accessibilite-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.A11Y", name: "Studio — accessibilité" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude accessible" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const envoyer = async (commands) => {
    const tete = (await api("get", variantePath)).revision.id;
    return api("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `a11y-${Date.now()}-${Math.random()}`, baseRevisionId: tete, commands });
  };
  await envoyer([
    ligne("e-ligne-1", 0, 0), rect("e-rect-1", 0, 2), ligne("e-ligne-2", 0, 4),
    { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
    rect("e-rect-murs", 6, 0, "murs"),
    { toolId: "studio.objet.extruder", params: { ids: ["e-ligne-2"], base: 0, height: 2.5, thickness: 0.2 } },
  ]);
  const base = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;

  // ——— Accessibilité automatique : accueil, étude, variante (bureau) ———
  await page.goto(`${BASE}/studio`);
  await page.locator("[data-studio-projets]").waitFor();
  await axe(page, "accueil Studio (bureau)");
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  await page.locator(`[data-studio-etude="${studyId}"]`).waitFor();
  await axe(page, "page d'étude (bureau)");
  await page.goto(base);
  const liste = page.locator("[data-studio-elements-liste]");
  await liste.waitFor();
  await axe(page, "page de variante (bureau)");

  // ——— Éléments du dessin : structure ———
  const options = liste.getByRole("option");
  check("liste : groupée par calque (calque implicite et « Murs »)", (await liste.getByRole("group").count()) === 2 && (await liste.locator('[data-studio-elements-calque="murs"] [role="option"]').count()) === 1);
  check("liste : type, calque, identifiant court et extrusion affichés", (await options.count()) === 4
    && ((await liste.locator('[data-studio-element="e-ligne-2"]').textContent()) ?? "").includes("extrudé : hauteur 2,5 m")
    && ((await liste.locator('[data-studio-element="e-rect-murs"]').textContent()) ?? "").includes("Murs")
    && ((await liste.locator('[data-studio-element="e-rect-murs"]').textContent()) ?? "").includes("e-rect-m"));
  check("liste : une seule ligne dans l'ordre de tabulation", (await liste.locator('[role="option"][tabindex="0"]').count()) === 1);
  const focus = () => page.evaluate(() => document.activeElement?.getAttribute("data-studio-element") ?? document.activeElement?.tagName ?? null);
  const choisis = () => liste.locator('[role="option"][aria-selected="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-element")));
  const planche = () => page.locator("svg .selected").count();
  const annonce = page.locator("[data-studio-elements-annonce]");

  // ——— Clavier ———
  await liste.locator('[role="option"][tabindex="0"]').focus();
  check("clavier : la première ligne prend le focus", (await focus()) === "e-ligne-1");
  await page.keyboard.press("ArrowDown");
  check("clavier : flèche bas → ligne suivante", (await focus()) === "e-rect-1");
  await page.keyboard.press("End");
  check("clavier : Fin → dernière ligne", (await focus()) === "e-rect-murs");
  await page.keyboard.press("Home");
  check("clavier : Début → première ligne", (await focus()) === "e-ligne-1");
  await page.keyboard.press("ArrowUp");
  check("clavier : flèche haut bornée sur la première ligne", (await focus()) === "e-ligne-1");
  await page.keyboard.press("Enter");
  check("Entrée : sélectionne la ligne seule, la planche suit", JSON.stringify(await choisis()) === '["e-ligne-1"]' && (await planche()) === 1);
  await annonce.filter({ hasText: "1 élément(s) sélectionné(s)." }).waitFor();
  check("région vivante : la sélection est annoncée", true);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  check("Maj + flèche : plage de trois lignes", JSON.stringify(await choisis()) === '["e-ligne-1","e-rect-1","e-ligne-2"]' && (await planche()) === 3 && (await focus()) === "e-ligne-2");
  await page.keyboard.press("Space");
  check("Espace : retire la ligne courante de la sélection", JSON.stringify(await choisis()) === '["e-ligne-1","e-rect-1"]');
  await page.keyboard.press("Space");
  check("Espace : la rajoute", (await choisis()).length === 3);
  await page.keyboard.press("Control+a");
  check("Ctrl+A : tous les éléments sélectionnables", (await choisis()).length === 4 && (await planche()) === 4);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  check("préparation : seule « e-rect-1 » est sélectionnée", JSON.stringify(await choisis()) === '["e-rect-1"]');
  await page.keyboard.press("Delete");
  await liste.locator('[data-studio-element="e-rect-1"]').waitFor({ state: "detached" });
  check("Suppr : l'élément est supprimé par la commande existante (une commande en attente)", ((await page.locator("[data-studio-annuler-portee]").textContent()) ?? "").includes("(1 commande(s)"));
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-studio-element") === "e-ligne-2");
  check("Suppr : le focus passe à la ligne suivante", (await focus()) === "e-ligne-2");
  await annonce.filter({ hasText: "1 élément(s) retiré(s) du dessin" }).waitFor();
  check("région vivante : la suppression est annoncée", true);

  // ——— Focus conservé après l'enregistrement (Ctrl+S depuis la liste) ———
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  await page.waitForTimeout(150);
  check("après Ctrl+S : le focus reste sur la ligne de la liste", (await focus()) === "e-ligne-2");

  // ——— Repli du calque actif ———
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  await outils.getByRole("button", { name: "Nouveau calque", exact: true }).click();
  const rangees = page.locator("[data-studio-calque-ligne]");
  check("calques : un nouveau calque actif", (await rangees.count()) === 3 && (await rangees.nth(2).getAttribute("aria-current")) === "true");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-calque-ligne]").length === 2);
  check("calque actif disparu (annulation) : le premier calque devient actif", (await rangees.nth(0).getAttribute("aria-current")) === "true" && (await rangees.nth(0).locator('input[type="radio"]').isChecked()));
  await page.locator("[data-studio-calque-repli]").filter({ hasText: "Le calque actif a disparu" }).waitFor();
  check("calque actif disparu : le repli est annoncé", true);
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-calque-ligne]").length === 3);
  check("rétablir : le calque revient sans redevenir actif en silence", (await rangees.nth(0).getAttribute("aria-current")) === "true");
  await page.keyboard.press("Control+z");

  // ——— Révision plus récente : avis non bloquant, « Recharger » ———
  await envoyer([rect("e-rect-autre", 10, 10)]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const avis = page.locator("[data-studio-avis-revision]");
  await avis.waitFor();
  check("révision plus récente : avis non bloquant, la planche reste utilisable", (await avis.getByRole("button", { name: "Recharger", exact: true }).isVisible()) && (await outils.getByRole("button", { name: "Ligne", exact: true }).isEnabled()));
  await page.screenshot({ path: join(OUT, "studio-avis-revision.png") });
  await avis.getByRole("button", { name: "Recharger", exact: true }).click();
  await avis.waitFor({ state: "detached" });
  await liste.locator('[data-studio-element="e-rect-autre"]').waitFor();
  check("Recharger : la version serveur est relue, l'avis disparaît", (await page.getByRole("status").filter({ hasText: "Version serveur rechargée." }).count()) === 1);
  check("Recharger : le focus reste dans la page (zone de l'avis)", await page.evaluate(() => document.activeElement?.hasAttribute("data-studio-avis-revision-zone") === true));

  // ——— Boîtes de dialogue : piège du focus, Échap, retour du focus ———
  const dansDialogue = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  const essai = async (nom, ouvrir, origine) => {
    await ouvrir();
    const d = page.getByRole("dialog");
    await d.waitFor();
    await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'));
    let toujours = true;
    for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); toujours &&= await dansDialogue(); }
    for (let i = 0; i < 5; i++) { await page.keyboard.press("Shift+Tab"); toujours &&= await dansDialogue(); }
    check(`${nom} : Tab et Maj+Tab restent dans la boîte`, toujours);
    await page.evaluate(() => (document.activeElement)?.blur());
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "detached" });
    await page.waitForFunction((sel) => document.activeElement?.matches(sel) === true, origine).catch(() => {});
    check(`${nom} : Échap ferme (même focus perdu), le focus revient à l'origine`, await page.evaluate((sel) => document.activeElement?.matches(sel) === true, origine), await focus());
  };
  await essai("Outils", () => outils.getByRole("button", { name: "Outils", exact: true }).click(), '[data-studio-commande="outils"]');
  await essai("Feuille", () => outils.locator('[data-studio-commande="feuille"]').click(), '[data-studio-commande="feuille"]');
  await essai("Importer DXF", () => outils.locator('[data-studio-commande="importer-dxf"]').click(), '[data-studio-commande="importer-dxf"]');
  await essai("Palette (Ctrl+K depuis la liste)", async () => { await liste.locator('[role="option"][tabindex="0"]').focus(); await page.keyboard.press("Control+k"); }, '[role="option"][tabindex="0"]');

  // ——— Téléphone : mêmes pages, aucun débordement, boutons nommés visibles ———
  const mobile = await context.newPage();
  mobile.on("pageerror", (e) => erreurs.push(`mobile : ${e.message}`));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/studio`);
  await mobile.locator("[data-studio-projets]").waitFor();
  await axe(mobile, "accueil Studio (téléphone)");
  await mobile.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  await mobile.locator(`[data-studio-etude="${studyId}"]`).waitFor();
  await axe(mobile, "page d'étude (téléphone)");
  await mobile.goto(base);
  await mobile.locator("[data-studio-elements-liste]").waitFor();
  await axe(mobile, "page de variante (téléphone)");
  check("téléphone : la liste et la page ne débordent pas", await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const boutons = mobile.locator("[data-studio-elements] .studio-elements-actions button");
  check("téléphone : « Tout sélectionner » et « Supprimer la sélection » visibles et nommés", (await boutons.count()) === 2 && (await mobile.getByRole("button", { name: "Tout sélectionner", exact: true }).last().isVisible()) && (await mobile.getByRole("button", { name: "Supprimer la sélection", exact: true }).isVisible()));
  const haut = await mobile.locator("[data-studio-elements-liste] [role=option]").first().boundingBox();
  check("téléphone : lignes d'au moins 44 px de haut", (haut?.height ?? 0) >= 44, String(haut?.height));
  await mobile.locator("[data-studio-elements-liste] [role=option]").first().click();
  check("téléphone : un appui sélectionne la ligne", (await mobile.locator('[data-studio-elements-liste] [aria-selected="true"]').count()) === 1);
  await mobile.locator("[data-studio-elements]").screenshot({ path: join(OUT, "studio-elements-mobile.png") });

  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette d'accessibilité Studio : réussie.");
} finally {
  await browser.close();
}
