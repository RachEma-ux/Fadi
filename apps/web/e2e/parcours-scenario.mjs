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
 *   3b. bibliothèque des bâtiments : pli des étapes, recherche et filtre,
 *      fiche d'un cas (variantes, rubriques), « Utiliser ce scénario » sur le
 *      projet → répartition du dossier maître, textes générés, adaptation
 *      d'une ligne, décision à réexaminer, programme lié à l'étape 10 ;
 *   6d. sources de l'étape : import d'un fichier, liste, téléchargement en
 *      pièce jointe, suppression avec confirmation ;
 *   6e. péremption : données du site modifiées → étape 02 « à réexaminer »
 *      (encart, chip « choix conservé », vérification refusée), « Actualiser
 *      les propositions », « Confirmer ce choix », « Rapport de cette
 *      étape », « Voir l’origine », synthèse des choix Harmonie ;
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

// 3b. Bibliothèque des bâtiments — depuis le pli de l'étape 06 du projet vierge
await page.goto(`${projectUrl}?module=parcours&etape=6`);
await page.waitForSelector(".library-fold");
check("étape 06 : pli « Bibliothèque d’exemples par type de bâtiment »", (await page.locator(".library-fold > summary").textContent()) === "Bibliothèque d’exemples par type de bâtiment");
await page.evaluate(() => { document.querySelector(".library-fold").open = true; });
await page.locator('.library-fold a:has-text("Ouvrir la bibliothèque")').click();
await page.waitForURL(/bibliotheque\/batiments\?projet=/);
await page.waitForSelector(".bl-case-card");
check("bibliothèque : 10 types, 21 cas", (await page.locator(".bl-type").count()) === 10 && (await page.locator(".bl-case-card").count()) === 21);
await page.fill("#bl-search", "hôtel");
await page.waitForTimeout(300);
check("bibliothèque : recherche « hôtel » → 2 cas", (await page.locator(".bl-case-card").count()) === 2);
await page.locator('.bl-type-links button:has-text("Santé")').first().click();
await page.waitForTimeout(200);
check("bibliothèque : type Santé + « hôtel » → « Aucun cas correspondant »", (await page.locator(".bl-empty").count()) === 1);
await page.fill("#bl-search", "");
await page.locator('.bl-type-links button:has-text("Tous")').click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/bibliotheque-batiments-desktop.png`, fullPage: true });
await page.locator('.bl-case-card:has-text("Hôtel urbain") a:has-text("Ouvrir le cas")').first().click();
await page.waitForURL(/bibliotheque\/batiments\/hotel/);
await page.waitForSelector(".bl-scenario");
check("cas Hôtel urbain : 3 variantes, 5 rubriques, totaux calculés", (await page.locator(".bl-scenario").count()) === 3 && (await page.locator(".bl-tabs button").count()) === 5 && /Programme hors parois/.test(await page.locator(".bl-stats").first().textContent()));
await page.locator(".bl-scenario button").nth(1).click();
await page.waitForTimeout(200);
check("cas : variante B affichée", (await page.locator(".bl-scenario.selected b").textContent()).startsWith("B ·"));
await page.locator('.bl-tabs button:has-text("Adjacences & flux")').click();
await page.waitForTimeout(200);
check("cas : schéma d'adjacences SVG", (await page.locator("section[role=tabpanel] svg").count()) === 1);
await page.locator('.bl-tabs button:has-text("Exigences & dessin")').click();
await page.waitForTimeout(200);
check("cas : gabarit d'essai dimensionnel SVG", /GABARIT D’ESSAI/.test(await page.locator("section[role=tabpanel]").innerHTML()));
await page.locator('.bl-tabs button:has-text("Programme & surfaces")').click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/bibliotheque-batiments-hotel-desktop.png`, fullPage: true });
await page.locator('.bl-hero button:has-text("Utiliser ce scénario")').click();
await page.waitForSelector("dialog.bl-dialog[open]");
check("« Utiliser ce scénario » : destination « Projet actuel » proposée", (await page.locator('dialog select[name="destination"]').inputValue()) === "current");
await page.locator('dialog button:has-text("Appliquer le scénario")').click();
await page.waitForURL(/etape=7/);
await page.waitForSelector(".programme-case-editor");
check("programme appliqué : « RÉPARTITION · DOSSIER MAÎTRE · RÉVISION 1 », Hôtellerie & hébergement → Hôtel urbain", /RÉVISION 1/.test(await page.locator(".programme-case-editor .bl-kicker").first().textContent()) && (await page.locator(".programme-case-editor h2").first().textContent()) === "Hôtellerie & hébergement → Hôtel urbain");
check("programme appliqué : textes générés dans l'étape 07 avec l'en-tête du prototype", (await page.inputValue("#biz-f2")).startsWith("[EXEMPLE / HYPOTHÈSE · Hôtel urbain de 32 chambres"));
check("programme appliqué : bloc « Programme lié » dans l'étape", (await page.locator(".programme-transmission").count()) === 1);
await page.screenshot({ path: `${OUT}/new-07-desktop-programme-applique.png`, fullPage: true });
const qtyInput = page.locator('.programme-case-editor input[aria-label^="Quantité"]').first();
const qtyBefore = await qtyInput.inputValue();
await qtyInput.fill(String(Number(qtyBefore) + 1));
await qtyInput.blur();
await page.waitForFunction(() => /RÉVISION 2/.test(document.querySelector(".programme-case-editor .bl-kicker")?.textContent || ""), null, { timeout: 10000 });
check("adaptation d'une ligne → révision 2, « Décision à réexaminer »", (await page.locator('.programme-case-editor h2:has-text("Décision à réexaminer")').count()) === 1);
await page.goto(`${projectUrl}?module=parcours&etape=10`);
await page.waitForSelector(".programme-transmission");
check("étape 10 : « Programme lié · Hôtel urbain … · révision 2 »", /Programme lié · Hôtel urbain.*révision 2/.test((await page.locator(".programme-transmission").first().textContent()).replace(/\s+/g, " ")));
await page.goto(`${projectUrl}?module=parcours&etape=2`);
await page.waitForSelector(".library-fold");
check("étape 02 : pli « Exemples · qualités du site par type de bâtiment »", (await page.locator(".library-fold > summary").textContent()) === "Exemples · qualités du site par type de bâtiment");

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
// Propositions localisées sur les locaux du modèle (flow-v62 / h7-app)
await page.evaluate(() => { document.querySelector(".h7-panel").open = true; });
await page.waitForSelector(".h7-locals");
const localsSummary = await page.locator(".h7-locals > summary").textContent();
check("étape 10 : pli « N propositions localisées sur les usages du modèle »", /^\d+ propositions localisées sur les usages du modèle$/.test(localsSummary), localsSummary);
await page.evaluate(() => { document.querySelector(".h7-locals").open = true; });
const localCard = page.locator(".h7-locals .h7-proposal").first();
check("étape 10 : carte locale « H10 · LOCAL », pourquoi calculé sur le polygone, source « Modèle … · objet … »", (await localCard.locator(".h7-kicker").textContent()) === "H10 · LOCAL" && /m² calculés sur le polygone/.test(await localCard.locator("dd").first().textContent()) && /^Modèle [0-9a-f]{8} · objet /.test(await localCard.locator(".h7-source").textContent()));
check("étape 10 : données mobilisées « Modèle courant : 6 niveaux · … zones · empreinte … »", /Modèle courant : 6 niveaux · \d+ zones · empreinte [0-9a-f]{8}\./.test(await page.locator(".h7-panel .h7-fold-body").first().textContent()));
await localCard.locator('button:has-text("Retenir")').first().click();
await page.waitForFunction(() => /Retenue/.test(document.querySelector(".h7-locals .h7-proposal .h7-chip")?.textContent || ""), null, { timeout: 10000 });
// L'exemple retient le parti C ; le local retenu s'y ajoute sans le remplacer.
check("étape 10 : local retenu, indépendant du parti retenu → « 2 choix retenu(s) »", (await page.locator(".h7-panel > summary").textContent()).includes("2 choix retenu(s)"));
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

// 6e. Péremption (« À réexaminer ») et rapports : les données du site viennent de changer → l'étape 02 de l'exemple, générée à l'import, est à réexaminer
await page.goto(`${exampleUrl}?module=parcours&etape=2`);
await page.waitForSelector(".h7-panel");
await page.evaluate(() => { document.querySelector(".h7-panel").open = true; });
check("étape 02 : « … · 1 choix retenu(s) · à réexaminer » après modification des données du site", (await page.locator(".h7-panel > summary").textContent()).includes("1 choix retenu(s) · à réexaminer"));
check("étape 02 : encart « Données pertinentes modifiées. »", /Données pertinentes modifiées\. Les choix sont conservés, mais doivent être réexaminés\./.test(await page.locator(".h7-stale").textContent()));
const staleCard = page.locator(".h7-proposal.stale").first();
check("étape 02 : chip « À réexaminer · choix conservé » sur le choix de l'exemple", (await staleCard.locator(".h7-chip").first().textContent()) === "À réexaminer · choix conservé");
await staleCard.locator('button:has-text("Adapter / motiver")').click();
await staleCard.locator('input').nth(0).fill("Chef de projet");
await staleCard.locator("textarea").nth(1).fill("Compte rendu de revue n° 4");
await staleCard.locator('button:has-text("Consigner une vérification")').click();
await staleCard.locator(".h7-error").waitFor({ timeout: 10000 });
check("étape 02 : vérification refusée tant que les propositions ne sont pas actualisées (message du prototype)", (await staleCard.locator(".h7-error").textContent()) === "Actualisez d’abord les propositions sur les données courantes.");
await page.screenshot({ path: `${OUT}/02-desktop-reexaminer.png`, fullPage: true });
await page.locator('.h7-head button:has-text("Actualiser les propositions")').click();
await page.waitForFunction(() => !document.querySelector(".h7-stale"), null, { timeout: 10000 });
check("étape 02 : « Actualiser les propositions » → encart retiré, toast du prototype, choix toujours à réexaminer", (await page.locator(".h7-toast").textContent().catch(() => "")) === "Propositions actualisées ; les choix antérieurs sont conservés pour réexamen." && (await page.locator(".h7-proposal.stale").count()) === 1);
await page.locator(".h7-proposal.stale").first().locator('button:has-text("Confirmer ce choix")').click();
await page.waitForFunction(() => document.querySelectorAll(".h7-proposal.stale").length === 0, null, { timeout: 10000 });
check("étape 02 : « Confirmer ce choix » → « Retenue », plus rien à réexaminer", (await page.locator(".h7-panel > summary").textContent()).includes("1 choix retenu(s)") && !(await page.locator(".h7-panel > summary").textContent()).includes("à réexaminer"));
const [stageReport] = await Promise.all([page.waitForEvent("download"), page.locator('.h7-head a:has-text("Rapport de cette étape")').click()]);
const stageReportHtml = await (await import("node:fs/promises")).readFile(await stageReport.path(), "utf8");
check("étape 02 : « Rapport de cette étape » → Harmonie_Etape_02_V7.html, cartes et choix à transmettre", stageReport.suggestedFilename() === "Harmonie_Etape_02_V7.html" && stageReportHtml.includes("PARCOURS V7 · DIMENSION HARMONIE PAR ÉTAPE") && stageReportHtml.includes("<h3>Choix à transmettre</h3>") && /<title>Harmonie · Escalier B et mezzanine · 02 · /.test(stageReportHtml));
await page.locator('.h7-tabs button:has-text("Choix & transmission")').click();
check("étape 02 : onglet « Choix & transmission » — intentions reçues de l'étape 01, destinations", (await page.locator(".h7-transfer .h7-received").count()) === 1 && (await page.locator(".h7-transfer button.h7-goto").count()) >= 1);
await page.locator(".h7-transfer .h7-received button:has-text('Voir l’origine')").first().click();
await page.waitForURL(/etape=1/);
check("étape 02 : « Voir l’origine » ouvre l'étape 01", /etape=1/.test(page.url()));
await page.goto(`${exampleUrl}?module=parcours`);
await page.waitForSelector("#parcours-project-tools");
await page.locator("#parcours-project-tools > summary").click();
const [synthesis] = await Promise.all([page.waitForEvent("download"), page.locator('#parcours-project-tools a:has-text("Exporter la synthèse des choix Harmonie")').click()]);
check("outils du projet : « Exporter la synthèse des choix Harmonie » → Harmonie_Choix_Parcours_V7.html", synthesis.suggestedFilename() === "Harmonie_Choix_Parcours_V7.html");

// 6d. Sources de l'étape (étape 03 de l'exemple) : import, liste, téléchargement, suppression
await page.goto(`${exampleUrl}?module=parcours&etape=3`);
await page.waitForSelector(".step-sources");
await page.evaluate(() => { document.querySelector(".step-sources").open = true; });
await page.waitForFunction(() => /Aucune source importée/.test(document.querySelector(".sources-list")?.textContent || ""));
check("sources : « Aucune source importée pour cette étape. » au départ", true);
await page.locator('.step-sources input[type="file"]').setInputFiles({ name: "ZONE-I-5 règlement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% pièce de démonstration\n") });
await page.waitForFunction(() => /ZONE-I-5 règlement\.pdf/.test(document.querySelector(".sources-list")?.textContent || ""), null, { timeout: 10000 });
const sourceRow = (await page.locator(".source-row").first().textContent()).replace(/\s+/g, " ");
check("sources : fichier listé avec taille · type · date", /ZONE-I-5 règlement\.pdf.*36 o · application\/pdf · ajouté le/.test(sourceRow), sourceRow);
const dlHref = await page.locator(".source-row a").first().getAttribute("href");
const dlResponse = await page.request.get(`${BASE}${dlHref}`);
check("sources : téléchargement servi en pièce jointe (attachment, nosniff)", dlResponse.status() === 200 && /^attachment/.test(dlResponse.headers()["content-disposition"] || "") && dlResponse.headers()["x-content-type-options"] === "nosniff");
await page.screenshot({ path: `${OUT}/03-desktop-sources.png`, fullPage: true });
await page.goto(`${exampleUrl}?module=projets-sources`);
await page.waitForFunction(() => /ZONE-I-5 règlement\.pdf/.test(document.querySelector(".project-sources")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
check("module Projets et sources : la pièce apparaît sous « Étape 03 »", /Étape 03 · .*ZONE-I-5 règlement\.pdf/s.test((await page.locator(".project-sources").textContent()).replace(/\s+/g, " ")));
await page.goto(`${exampleUrl}?module=parcours&etape=3`);
await page.waitForSelector(".step-sources");
await page.evaluate(() => { document.querySelector(".step-sources").open = true; });
await page.waitForFunction(() => /ZONE-I-5 règlement\.pdf/.test(document.querySelector(".sources-list")?.textContent || ""), null, { timeout: 10000 });
page.once("dialog", (d) => d.accept());
await page.locator('.source-row button:has-text("Supprimer")').first().click();
await page.waitForFunction(() => /Aucune source importée/.test(document.querySelector(".sources-list")?.textContent || ""), null, { timeout: 10000 });
check("sources : suppression confirmée → liste vide", true);

// 7. Téléphone
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${projectUrl}?module=parcours`);
await page.waitForSelector(".step-card-open");
await page.screenshot({ path: `${OUT}/new-00-overview-mobile.png`, fullPage: true });
await page.goto(`${projectUrl}?module=parcours&etape=6`);
await page.waitForSelector(".programme-case-editor");
await page.screenshot({ path: `${OUT}/new-06-mobile.png`, fullPage: true });
check("téléphone : étape 06 avec programme appliqué sans défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.goto(`${BASE}/bibliotheque/batiments/hotel?projet=${encodeURIComponent(projectUrl.split("/").pop())}`);
await page.waitForSelector(".bl-scenario");
await page.screenshot({ path: `${OUT}/bibliotheque-batiments-hotel-mobile.png`, fullPage: true });
check("téléphone : bibliothèque sans défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
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
