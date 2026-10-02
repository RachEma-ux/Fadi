#!/usr/bin/env node
/**
 * Scénario de caractérisation du Parcours — le même que celui rejoué sur le
 * prototype (docs/migration/reference.md, « Écran d'étape réel ») :
 *
 *   1. nouveau projet → vue d'ensemble (0 / 21 terminées) ;
 *   2. étape 02 : retenir la proposition A, remplacer par B, adapter C avec
 *      motif → compteur « choix retenu(s) » ;
 *   3. étape 06 : répartition programmatique (type, fourchette, ratio) ;
 *   4. étape 14 : f1=1000 et f9=400 → « Chiffrage incomplet » ; tous les
 *      postes → Investissement / Financement / Solde ; rechargement →
 *      valeurs conservées ;
 *   5. étape 17 : notes → moyenne ; étape 19 : décision ; « Marquer
 *      terminée » → progression 1 / 21 ;
 *   6. exemple P.118 importé : réponses renseignées et choix retenus ;
 *      Atelier natif (dessin, annulation, rechargement) ; étape 01 : outil
 *      Parcelle (fichier P.118, modification d'une borne → conflit avec le
 *      bâtiment dessiné, retour → parcelle liée) et propositions de site
 *      Harmonie (schéma, légende, données du site, proposition de départ) ;
 *   7. captures ordinateur (1280) et téléphone (390) dans
 *      docs/migration/captures/webapp/.
 *
 * Prérequis : API sur :3001 (base dédiée) et `vite preview` sur :4173.
 *   node apps/web/e2e/parcours-scenario.mjs
 * Variables : BASE_URL (défaut http://localhost:4173), CHROMIUM_PATH.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/migration/captures/webapp");
mkdirSync(OUT, { recursive: true });
const launch = { executablePath: process.env.CHROMIUM_PATH ?? undefined };

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch(launch);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));

const email = `scenario-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "scenario-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);

// 1. Nouveau projet
await page.goto(`${BASE}/projets`);
await page.fill("#project-code", "P.TEST");
await page.fill("#project-name", "Étude test migration");
await page.locator('button[type="submit"]:has-text("Créer")').first().click();
await page.locator('.project-list a:has-text("Étude test migration")').first().click();
await page.waitForURL(/\/projets\/proj_/);
const projectUrl = page.url().split("?")[0];
await page.waitForSelector(".step-card-open");
check("vue d'ensemble : 21 cartes", (await page.locator(".step-card-open").count()) === 21);
check("progression initiale 0 / 21", (await page.locator(".parcours-steps-summary").textContent()).includes("0 / 21"));
await page.screenshot({ path: `${OUT}/new-00-overview-desktop.png`, fullPage: true });

// 1b. Étape 01 d'un projet vierge : outil Parcelle vide, trois propositions de site sans schéma
await page.goto(`${projectUrl}?module=parcours&etape=1`);
await page.waitForSelector(".h7-panel");
await page.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready, null, { timeout: 30000 });
check("étape 01 vierge : « Harmonie · Site et paysage · 0 choix retenu(s) », 3 propositions de site", (await page.locator(".h7-panel > summary").textContent()).includes("Site et paysage · 0 choix retenu(s)") && (await page.locator(".h7-proposal").count()) === 3);
check("étape 01 vierge : aucun schéma sans contour (« Aucune parcelle rectangulaire de remplacement »)", (await page.locator(".h7-site-hero .h7-callout").textContent()).includes("Aucune parcelle rectangulaire de remplacement"));
check("étape 01 vierge : proposition de départ A (approche non documentée)", (await page.locator(".h7-group").textContent()).startsWith("A · Proposition de départ"));
await page.screenshot({ path: `${OUT}/new-01-desktop.png`, fullPage: true });
await page.locator('button:has-text("Vue d\'ensemble")').click();
await page.waitForSelector(".step-card-open");

// 2. Étape 02 — Harmonie
await page.locator(".step-card-open").nth(1).click();
await page.waitForSelector(".h7-panel");
check("étape 02 : panneau Harmonie « 0 choix retenu(s) »", (await page.locator(".h7-panel > summary").textContent()).includes("0 choix retenu(s)"));
check("étape 02 : 3 propositions", (await page.locator(".h7-proposal").count()) === 3);
check("étape 02 : 12 rubriques du formulaire", (await page.locator(".biz-field").count()) === 12);
await page.locator(".h7-proposal").nth(0).locator('button:has-text("Retenir")').first().click();
await page.waitForFunction(() => document.querySelector(".h7-panel > summary")?.textContent?.includes("1 choix retenu(s)"));
check("retenir A → 1 choix retenu", true);
await page.locator(".h7-proposal").nth(1).locator('button:has-text("Retenir")').first().click();
await page.waitForFunction(() => document.querySelectorAll(".h7-proposal")[0]?.querySelector(".h7-chip")?.textContent === "Écartée avec motif");
check("retenir B → A écartée (« Écartée avec motif »), toujours 1 choix retenu", (await page.locator(".h7-panel > summary").textContent()).includes("1 choix retenu(s)"));
// Adapter C sans motif suffisant → refus serveur affiché
const cardC = page.locator(".h7-proposal").nth(2);
await cardC.locator('button:has-text("Adapter / motiver")').click();
await cardC.locator("textarea").first().fill("court");
await cardC.locator('button:has-text("Retenir l’adaptation")').click();
await cardC.locator(".h7-error").waitFor();
check("adapter C avec 5 caractères → message du prototype", (await cardC.locator(".h7-error").textContent()).includes("8 caractères minimum"));
await cardC.locator("textarea").first().fill("Réduire le programme plutôt que forcer l’implantation");
await cardC.locator('button:has-text("Retenir l’adaptation")').click();
await page.waitForFunction(() => document.querySelectorAll(".h7-proposal")[2]?.querySelector(".h7-chip")?.textContent === "Adaptée et retenue");
check("adapter C avec motif → « Adaptée et retenue », B écartée", (await page.locator(".h7-proposal").nth(1).locator(".h7-chip").textContent()) === "Écartée avec motif");
await page.screenshot({ path: `${OUT}/new-02-desktop-harmonie.png`, fullPage: true });
// Formulaire : une réponse texte
await page.locator("#biz-f1").fill("Zone I — secteur I5");
await page.locator("#biz-f1").blur();
await page.waitForTimeout(400);

// 3. Étape 06 — répartition
await page.goto(`${projectUrl}?module=parcours&etape=6`);
await page.waitForSelector("#programme-type");
check("étape 06 : KPI support 28,0 % par défaut", (await page.locator(".programme-kpi").nth(1).textContent()).includes("28,0 %"));
await page.selectOption("#programme-mode", "max");
await page.waitForFunction(() => document.querySelectorAll(".programme-kpi")[1]?.textContent?.includes("35,0 %"));
check("position haute → 35,0 % (18+7+2+8)", true);
await page.selectOption("#programme-type", "residentiel");
await page.waitForFunction(() => document.querySelectorAll(".programme-kpi")[1]?.textContent?.includes("27,0 %"));
check("type résidentiel haute → 27,0 % (15+7+0+5)", true);
await page.waitForFunction(() => document.querySelector(".h7-fold-body")?.textContent?.includes("Habitation"), null, { timeout: 10000 }).catch(() => {});
check("étape 06 : profil Harmonie suit le type (Habitation)", (await page.locator(".h7-fold-body").first().textContent()).includes("Habitation"));
await page.screenshot({ path: `${OUT}/new-06-desktop.png`, fullPage: true });

// 4. Étape 14 — finance
await page.goto(`${projectUrl}?module=parcours&etape=14`);
await page.waitForSelector("#biz-f1");
for (const [k, v] of [["f1", "1000"], ["f9", "400"]]) {
  await page.locator(`#biz-${k}`).fill(v);
  await page.locator(`#biz-${k}`).blur();
  await page.waitForTimeout(300);
}
check("étape 14 : f1 + f9 seuls → « Chiffrage incomplet »", (await page.locator(".v62-alert").count()) === 1);
await page.screenshot({ path: `${OUT}/new-14-desktop-after-input.png`, fullPage: true });
for (const [k, v] of [["f2", "13500000"], ["f3", "1600000"], ["f4", "1200000"], ["f5", "2000000"], ["f6", "2500000"], ["f10", "14000000"]]) {
  await page.locator(`#biz-${k}`).fill(v);
  await page.locator(`#biz-${k}`).blur();
  await page.waitForTimeout(250);
}
await page.locator("#biz-f1").fill("3200000");
await page.locator("#biz-f1").blur();
await page.locator("#biz-f9").fill("10000000");
await page.locator("#biz-f9").blur();
await page.waitForFunction(() => document.querySelector(".biz-kpis")?.textContent?.replace(/\u202f|\u00a0/g, " ").includes("Financement24 000 000"), null, { timeout: 10000 }).catch(() => {});
const kpiText = (await page.locator(".biz-kpis").textContent()).replace(/ | /g, " ");
check("étape 14 : KPI investissement 24 000 000 / financement 24 000 000 / solde 0", /Investissement24 000 000/.test(kpiText) && /Financement24 000 000/.test(kpiText) && /Solde0/.test(kpiText), kpiText);
await page.screenshot({ path: `${OUT}/new-14-desktop-complete.png`, fullPage: true });
await page.reload();
await page.waitForSelector("#biz-f2");
check("étape 14 : valeurs conservées après rechargement", (await page.inputValue("#biz-f2")) === "13500000" && (await page.locator(".biz-kpis").count()) === 1);

// 5. Étape 17 et 19, marquer terminée
await page.goto(`${projectUrl}?module=parcours&etape=17`);
await page.waitForSelector("#biz-f1");
for (const [k, v] of [["f1", "4"], ["f2", "2"], ["f3", "4"], ["f4", "2"], ["f5", "3"], ["f6", "4"], ["f7", "2"], ["f8", "2"]]) {
  await page.locator(`#biz-${k}`).fill(v);
  await page.locator(`#biz-${k}`).blur();
  await page.waitForTimeout(200);
}
await page.waitForFunction(() => document.querySelector(".biz-kpi b")?.textContent?.startsWith("2.88"));
check("étape 17 : note provisoire 2.88 / 5 · 8/8 critères", (await page.locator(".biz-kpi").first().textContent()).includes("8/8"));
await page.goto(`${projectUrl}?module=parcours&etape=19`);
await page.locator('.decision-grid button:has-text("GO sous conditions")').click();
await page.waitForFunction(() => document.querySelector('.decision-grid button[aria-pressed="true"]')?.textContent === "GO sous conditions");
check("étape 19 : décision « GO sous conditions » sélectionnée", true);
await page.locator('button:has-text("Marquer terminée")').click();
await page.waitForSelector('button:has-text("Terminée ✓")');
await page.screenshot({ path: `${OUT}/new-19-desktop.png`, fullPage: true });
await page.goto(`${projectUrl}?module=parcours`);
await page.waitForSelector(".parcours-steps-summary");
check("vue d'ensemble : 1 / 21 étapes terminées", (await page.locator(".parcours-steps-summary").textContent()).includes("1 / 21"));
// Une intention retenue en amont rétrograde le GO (règle du prototype)
await page.goto(`${projectUrl}?module=parcours&etape=12`);
await page.waitForSelector(".h7-proposal");
await page.locator(".h7-proposal").nth(0).locator('button:has-text("Retenir")').first().click();
await page.waitForFunction(() => document.querySelector(".h7-panel > summary")?.textContent?.includes("1 choix retenu(s)"));
await page.goto(`${projectUrl}?module=parcours&etape=19`);
await page.waitForSelector(".decision-grid");
check("étape 12 retenue → étape 19 repasse « À reprendre » et n'est plus terminée", (await page.locator('.decision-grid button[aria-pressed="true"]').textContent()) === "À reprendre" && (await page.locator('button:has-text("Marquer terminée")').count()) === 1);

// 6. Exemple P.118 importé
await page.goto(`${BASE}/projets`);
await page.waitForSelector('button:has-text("Importer")');
await page.locator('button:has-text("Importer")').first().click();
await page.waitForURL(/\/projets\/proj_/);
const exampleUrl = page.url().split("?")[0];
await page.waitForSelector(".parcours-steps-summary");
check("exemple : 21 / 21 étapes terminées", (await page.locator(".parcours-steps-summary").textContent()).includes("21 / 21"));
await page.goto(`${exampleUrl}?module=parcours&etape=2`);
await page.waitForSelector("#biz-f1");
check("exemple étape 02 : « Harmonie · Site constructible · 1 choix retenu(s) »", (await page.locator(".h7-panel > summary").textContent()).includes("Site constructible · 1 choix retenu(s)"));
check("exemple étape 02 : réponse f1 nommant sa nature", (await page.inputValue("#biz-f1")).startsWith("[DONNÉE / CALCUL DU FICHIER SOURCE]"));
check("exemple étape 02 : profil « Formation & bureaux »", (await page.locator(".h7-fold-body").first().textContent()).includes("Formation & bureaux"));
await page.screenshot({ path: `${OUT}/02-desktop.png`, fullPage: true });
await page.goto(`${exampleUrl}?module=parcours&etape=6`);
await page.waitForSelector(".programme-case");
check("exemple étape 06 : répartition liée au modèle (1 366,02 m²)", (await page.locator(".programme-case").textContent()).replace(/ | /g, " ").includes("1 366,02 m²"));
await page.screenshot({ path: `${OUT}/06-desktop.png`, fullPage: true });
await page.goto(`${exampleUrl}?module=parcours&etape=14`);
await page.waitForSelector(".biz-kpis");
check("exemple étape 14 : KPI calculés depuis les montants importés", (await page.locator(".biz-kpis").textContent()).replace(/ | /g, " ").includes("24 000 000"));

// 6b. Atelier natif sur l'exemple : moteur, niveaux, dessin d'un mur persisté (projection + révision), annulation persistée
await page.goto(`${exampleUrl}?module=atelier`);
await page.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
await page.waitForTimeout(600);
const examplePid = exampleUrl.split("/").pop();
const rdcWalls = async () =>
  page.evaluate(async (pid) => {
    const levels = await (await fetch(`/projects/${pid}/levels`, { credentials: "include" })).json();
    const rdc = levels.find((l) => l.id.endsWith("_rdc"));
    const objs = await (await fetch(`/projects/${pid}/levels/${rdc.id}/objects`, { credentials: "include" })).json();
    const project = await (await fetch(`/projects/${pid}`, { credentials: "include" })).json();
    return { walls: objs.filter((o) => o.kind === "wall").length, revision: project.modelRevision };
  }, examplePid);
check("atelier : géométrie P.118 chargée (EPSG:26191 · 1345.55 m²)", (await page.locator("#viewer-info").textContent()).includes("1345.55"));
check("atelier : 6 niveaux", (await page.locator("#model-floors button").count()) === 6);
check("atelier : barre d'outils V8 prête", (await page.locator("#atelier-toolbar").getAttribute("data-ready")) === "1");
const before = await rdcWalls();
check("atelier : 39 murs au RDC avant dessin, révision 1", before.walls === 39 && before.revision === 1, JSON.stringify(before));
await page.locator("#model-floors button", { hasText: "RDC" }).first().click();
await page.locator('#atelier-toolbar [data-atab="design"]').click();
await page.waitForTimeout(600);
await page.locator('button:has-text("Mur")').first().click();
const box = await page.locator("#viewer-surface").boundingBox();
await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);
await page.waitForTimeout(200);
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
await page.keyboard.press("Enter");
await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
const afterDraw = await rdcWalls();
check("atelier : un mur dessiné → 40 murs, révision 2 (projection régénérée)", afterDraw.walls === 40 && afterDraw.revision === 2, JSON.stringify(afterDraw));
await page.screenshot({ path: `${OUT}/atelier-concevoir-wall-desktop.png`, fullPage: true });
await page.locator('#atelier-toolbar [data-quick="undo"]').click();
await page.waitForTimeout(800);
await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
const afterUndo = await rdcWalls();
check("atelier : annuler → 39 murs, révision 3 (l'annulation modifie l'état persistant)", afterUndo.walls === 39 && afterUndo.revision === 3, JSON.stringify(afterUndo));
await page.reload();
await page.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
check("atelier : rechargement → modèle toujours là", (await page.locator("#model-floors button").count()) === 6);
await page.goto(`${exampleUrl}?module=parcours&etape=10`);
await page.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
check("étape 10 : l'Atelier est monté dans l'étape (même moteur)", (await page.locator(".native-atelier #viewer-info").count()) === 1);
await page.screenshot({ path: `${OUT}/10-desktop.png`, fullPage: true });

// 6c. Étape 01 de l'exemple : outil Parcelle (fichier P.118 servi par Fadi), transmission au modèle, propositions de site
await page.goto(`${exampleUrl}?module=parcours&etape=1`);
await page.waitForSelector(".h7-panel");
await page.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready, null, { timeout: 30000 });
await page.waitForTimeout(800);
const parcelFrame = page.frameLocator(".parcelle-tool iframe");
check("étape 01 : l'outil Parcelle ouvre le fichier P.118 du projet (« Fichier enregistré », 4 bornes)", (await parcelFrame.locator("#file-status").textContent()) === "Fichier enregistré" && (await parcelFrame.locator("#points-body tr").count()) === 4);
check("étape 01 : « Mes parcelles » liste 118_officiel.kmz · P.118 · El Mansouria · 1 345,55 m²", (await parcelFrame.locator("#parcel-list-body").textContent()).replace(/[\u202f\u00a0]/g, " ").includes("1 345,55 m²"));
check("étape 01 : parcelle liée au modèle", (await page.locator(".parcelle-status").textContent()).includes("Parcelle liée au modèle"));
await page.evaluate(() => { document.querySelector(".h7-panel").open = true; });
check("étape 01 : « Harmonie · Site et paysage · 1 choix retenu(s) », schéma A, légende 15 / 50 / 25 / 10 %", (await page.locator(".h7-panel > summary").textContent()).includes("Site et paysage · 1 choix retenu(s)") && (await page.locator(".h7-site-svg svg").count()) === 1 && /15 %.*50 %.*25 %.*10 %/s.test((await page.locator(".h7-zones").textContent()).replace(/[\u202f\u00a0]/g, " ")));
check("étape 01 : « Pourquoi ici » calculé sur la parcelle (approche B.265 → B.266, contexte arrière végétation)", (await page.locator(".h7-proposal").nth(0).locator("dd").nth(0).textContent()).includes("Approche étudiée depuis B.265 → B.266, hypothétique."));
await page.screenshot({ path: `${OUT}/01-desktop.png`, fullPage: true });
// Modifier une borne dans l'outil : l'outil enregistre, Fadi transmet → conflit (bâtiment déjà dessiné), modèle non déplacé
await page.evaluate(() => document.querySelector(".parcelle-tool iframe").contentWindow.ParcelPanels.reveal("fold-vertices"));
const borneX = parcelFrame.locator("#points-body tr").nth(0).locator('input[data-field="x"]');
const borneBefore = await borneX.inputValue();
await borneX.fill(String(Number(borneBefore) + 2));
await borneX.dispatchEvent("change");
await page.waitForFunction(() => /Conflit avec le bâtiment dessiné/.test(document.querySelector(".parcelle-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
check("étape 01 : borne déplacée → « Conflit avec le bâtiment dessiné » (motif du prototype)", (await page.locator(".v62-alert").textContent().catch(() => "")).includes("Les bornes diffèrent et un bâtiment est déjà dessiné"));
const npAfterConflict = await page.evaluate(async (pid) => {
  const parcels = await (await fetch(`/projects/${pid}/parcels`, { credentials: "include" })).json();
  const store = await (await fetch(`/projects/${pid}/atelier/store`, { credentials: "include" })).json();
  return store.entries[`design.v13.project.${parcels.transmission.nativeId}.nativeParcel`]?.vertices?.[0]?.[0];
}, examplePid);
check("étape 01 : le modèle n'est pas déplacé par le conflit (B.266 inchangée)", Math.abs(npAfterConflict - 321946.82) < 1e-6, String(npAfterConflict));
await borneX.fill(borneBefore);
await borneX.dispatchEvent("change");
await page.waitForFunction(() => /Parcelle liée au modèle/.test(document.querySelector(".parcelle-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
check("étape 01 : borne rétablie → parcelle de nouveau liée", (await page.locator(".parcelle-status").textContent()).includes("Parcelle liée au modèle") && (await page.locator(".v62-alert").count()) === 0);
// Données du site : priorité « Séparation des mouvements » → proposition de départ C ; approche documentée sans source → refus
await page.locator(".h7-panel details.h7-fold").first().locator("> summary").click();
await page.locator(".h7-panel .h7-form select").nth(2).selectOption("service");
await page.locator('.h7-panel button:has-text("Enregistrer ces données")').click();
await page.waitForFunction(() => /^C · Proposition de départ/.test(document.querySelector(".h7-group")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
check("étape 01 : priorité « Séparation des mouvements » → proposition de départ C", (await page.locator(".h7-group").textContent()).startsWith("C · Proposition de départ — Votre priorité déclarée est la séparation des mouvements."));
await page.locator(".h7-panel .h7-form select").nth(1).selectOption("documented");
await page.locator(".h7-panel .h7-form input").nth(0).fill("");
await page.locator('.h7-panel button:has-text("Enregistrer ces données")').click();
await page.locator(".h7-panel .h7-error").first().waitFor({ timeout: 10000 }).catch(() => {});
check("étape 01 : approche documentée sans source → refus du prototype affiché", (await page.locator(".h7-panel .h7-error").first().textContent().catch(() => "")) === "Pour une approche documentée, choisissez son côté et indiquez sa source.");
await page.locator('.h7-proposal:nth-child(3) button:has-text("Voir le schéma")').click();
await page.waitForTimeout(300);
check("étape 01 : « Voir le schéma » affiche la variante C", (await page.locator(".h7-site-hero h3").textContent()) === "Arrivées et desserte dissociées");

// 7. Téléphone
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${projectUrl}?module=parcours`);
await page.waitForSelector(".step-card-open");
await page.screenshot({ path: `${OUT}/new-00-overview-mobile.png`, fullPage: true });
await page.goto(`${projectUrl}?module=parcours&etape=6`);
await page.waitForSelector("#programme-type");
await page.screenshot({ path: `${OUT}/new-06-mobile.png`, fullPage: true });
await page.goto(`${exampleUrl}?module=parcours&etape=2`);
await page.waitForSelector("#biz-f1");
await page.screenshot({ path: `${OUT}/02-mobile.png`, fullPage: true });
await page.goto(`${exampleUrl}?module=parcours&etape=1`);
await page.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/01-mobile.png`, fullPage: true });
const noHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check("téléphone : pas de défilement horizontal", noHorizontalScroll);

check("aucune erreur JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
await browser.close();
console.log(failures ? `${failures} vérification(s) en échec` : "Scénario conforme.");
process.exit(failures ? 1 : 0);
