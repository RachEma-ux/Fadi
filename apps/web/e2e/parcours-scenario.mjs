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
 *   6f. archive : « Sauvegarder projet JSON » puis « Importer projet JSON »
 *      → nouveau dossier « · import » ; page Projets ;
 *   6b'. bilan du bâtiment conçu (étape 10) : pli, bilan en ligne (5 onglets,
 *      plan SVG, locaux, audit des transmissions), revue actualisée, rapport
 *      HTML, références directionnelles enregistrées → étape à réexaminer ;
 *   6g. référence protégée de l'exemple (étape 07) : fiches d'espaces, CSV,
 *      « Essayer une autre répartition en copie » ; dans la copie :
 *      « Comparer au modèle dessiné » (délier / relier par identifiant),
 *      « Hypothèses et validation » (confirmation refusée sans preuve),
 *      transfert surfacique à total constant (comparaison, application,
 *      révision, décision à réexaminer) ; référence intacte ;
 *   6h. Analyses métier : contrôles traçables (26, source et version),
 *      quantités dérivées du modèle, structure et circulations déclarées,
 *      variantes de programme ;
 *   6i. Documents : catalogue (33 documents), actualité des productions
 *      antérieures (à jour / périmé), production du tableau des surfaces ;
 *   6j. Collaboration : commentaire depuis une étape, accès et
 *      synchronisation annoncés, journal des révisions filtrable,
 *      suppression par l'auteur ;
 *   6k. hors-ligne : file locale IndexedDB de l'Atelier (dessin hors-ligne,
 *      synchronisation au retour du réseau, rejeu après rechargement),
 *      ouverture depuis le cache local ;
 *   6l. file hors-ligne des saisies : mutation en pause persistée et
 *      restaurée après rechargement, rejouée au retour du réseau — refusée
 *      (409, bandeau de conflit) si le serveur a avancé, enregistrée sinon ;
 *      résolution assistée : versions côte à côte, « Reprendre ma saisie »,
 *      arbitrage réappliqué sur la version courante ; conflit du modèle
 *      (6k) : copie de secours, « Reprendre ma version » ;
 *   6m. partage du projet : invitation d'un compte par son adresse, projet
 *      partagé listé, lecteur (lecture, commentaires, formulaires et
 *      Atelier inactifs, 403 motivé), réservation d'édition (verrou
 *      optionnel : éditeur en lecture et commentaires, 423 motivé, puis
 *      main rendue), passage éditeur (saisie enregistrée), départ du projet ;
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
// `report(c, s)` : le dossier complet du cas (cinq rubriques, plis ouverts, boutons masqués) en un HTML téléchargeable.
const [caseReport] = await Promise.all([page.waitForEvent("download"), page.locator('.bl-hero button:has-text("Rapport HTML")').click()]);
const caseReportHtml = await (await import("node:fs/promises")).readFile(await caseReport.path(), "utf8");
check("cas : « Rapport HTML » → Programme_hotel_<variante>_V6_1.html (rapport de programmation : cinq rubriques, 21 étapes, plis ouverts, feuille de style)", /^Programme_hotel_[a-z0-9_-]+_V6_1\.html$/.test(caseReport.suggestedFilename()) && caseReportHtml.includes("PARCOURS V6.1 · RAPPORT DE PROGRAMMATION") && ["Espaces principaux", "Adjacences", "Dimensions minimales / recommandées", "Harmonie par étape, adaptée au type", "Références réglementaires", "21 · ", "Fin du dossier"].every((t) => caseReportHtml.includes(t)) && !caseReportHtml.includes("<details>") && caseReportHtml.includes("<details open") && caseReportHtml.includes(".bl-card{"), caseReport.suggestedFilename());
await page.locator('.bl-hero button:has-text("Utiliser ce scénario")').click();
await page.waitForSelector("dialog.bl-dialog[open]");
check("« Utiliser ce scénario » : destination « Projet actuel » proposée", (await page.locator('dialog select[name="destination"]').inputValue()) === "current");
await page.locator('dialog button:has-text("Appliquer le scénario")').click();
await page.waitForURL(/etape=7/);
await page.waitForSelector(".programme-case-editor");
check("programme appliqué : « RÉPARTITION · DOSSIER MAÎTRE · RÉVISION 1 », Hôtellerie & hébergement → Hôtel urbain", /RÉVISION 1/.test(await page.locator(".programme-case-editor .bl-kicker").first().textContent()) && (await page.locator(".programme-case-editor h2").first().textContent()) === "Hôtellerie & hébergement → Hôtel urbain");
await page.waitForFunction(() => (document.querySelector("#biz-f2")?.value || "").startsWith("[EXEMPLE / HYPOTHÈSE"), null, { timeout: 10000 }).catch(() => {});
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
await page.waitForSelector("#ah84-open");
await page.locator("#ah84-open").click();
await page.locator("#ah84-programme > summary").click();
await page.waitForSelector(".programme-transmission");
await page.waitForFunction(() => /révision 2/.test(document.querySelector(".programme-transmission")?.textContent || ""), null, { timeout: 10000 }).catch(() => {}); // cache restauré périmé puis relu
check("étape 10 : sous-page « Harmonie du bâtiment » → « Programme lié · Hôtel urbain … · révision 2 »", /Programme lié · Hôtel urbain.*révision 2/.test((await page.locator(".programme-transmission").first().textContent()).replace(/\s+/g, " ")));
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
// Deux enregistrements concurrents (f1 puis f9) : l'état final arrive avec le rechargement qui suit la dernière réponse.
await page.waitForFunction(() => { const t = document.querySelector(".biz-kpis")?.textContent?.replace(/\u202f|\u00a0/g, " ") || ""; return t.includes("Financement24 000 000") && t.includes("Investissement24 000 000"); }, null, { timeout: 15000 }).catch(() => {});
const kpiText = (await page.locator(".biz-kpis").textContent()).replace(/ | /g, " ");
check("étape 14 : KPI investissement 24 000 000 / financement 24 000 000 / solde 0", /Investissement24 000 000/.test(kpiText) && /Financement24 000 000/.test(kpiText) && /Solde0/.test(kpiText), kpiText);
await page.screenshot({ path: `${OUT}/new-14-desktop-complete.png`, fullPage: true });
await page.reload();
await page.waitForSelector("#biz-f2");
// Le cache persistant réhydrate d'abord la lecture précédente, puis le serveur répond.
await page.waitForFunction(() => document.querySelector("#biz-f2")?.value === "13500000" && document.querySelectorAll(".biz-kpis").length === 1, null, { timeout: 10000 }).catch(() => {});
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
await page.waitForFunction(() => /1 \/ 21/.test(document.querySelector(".parcours-steps-summary")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
check("vue d'ensemble : 1 / 21 étapes terminées", (await page.locator(".parcours-steps-summary").textContent()).includes("1 / 21"));
// Une intention retenue en amont rétrograde le GO (règle du prototype)
await page.goto(`${projectUrl}?module=parcours&etape=12`);
await page.waitForSelector(".h7-proposal");
await page.locator(".h7-proposal").nth(0).locator('button:has-text("Retenir")').first().click();
await page.waitForFunction(() => document.querySelector(".h7-panel > summary")?.textContent?.includes("1 choix retenu(s)"));
await page.goto(`${projectUrl}?module=parcours&etape=19`);
await page.waitForSelector(".decision-grid");
await page.waitForFunction(() => document.querySelector('.decision-grid button[aria-pressed="true"]')?.textContent === "À reprendre", null, { timeout: 10000 }).catch(() => {}); // cache restauré périmé puis relu
check("étape 12 retenue → étape 19 repasse « À reprendre » et n'est plus terminée", (await page.locator('.decision-grid button[aria-pressed="true"]').textContent()) === "À reprendre" && (await page.locator('button:has-text("Marquer terminée")').count()) === 1);

// 6. Exemple P.118 importé
await page.goto(`${BASE}/projets`);
await page.waitForSelector('.example-card button:has-text("Importer")');
await page.locator('.example-card button:has-text("Importer")').first().click();
await page.waitForURL(/\/projets\/proj_/);
const exampleUrl = page.url().split("?")[0];
await page.waitForSelector(".parcours-steps-summary");
check("exemple : 21 / 21 étapes terminées", (await page.locator(".parcours-steps-summary").textContent()).includes("21 / 21"));
await page.waitForSelector(".seed888", { timeout: 10000 });
const [kmzDl] = await Promise.all([page.waitForEvent("download"), page.locator('.seed888 a:has-text("118_officiel.kmz")').click()]);
const kmzBytes = await (await import("node:fs/promises")).readFile(await kmzDl.path());
check("exemple : « Documents de base intégrés » (118_officiel.kmz, ZONE-I-5.pdf, scénario étudié) → KMZ téléchargé intact (881 142 octets, archive zip)", (await page.locator(".seed888 a").allTextContents()).join(",") === "118_officiel.kmz,ZONE-I-5.pdf" && /Scénario étudié : P\.118/.test(await page.locator(".seed888 p").textContent()) && kmzBytes.length === 881142 && kmzBytes.subarray(0, 2).toString("latin1") === "PK");
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
// Sous-page « Harmonie du bâtiment » (V8.4) : depuis le bouton « Harmonie » du groupe Analyser de la barre d'outils native
await page.locator('#atelier-toolbar [data-atab="analyse"]').click();
await page.locator("#atelier-harmonie-button").click();
await page.waitForFunction(() => !document.getElementById("atelier-harmonie-page")?.hidden);
check("étape 10 : « Analyser → Harmonie » ouvre la sous-page « Harmonie du bâtiment » (en-tête, 3 rubriques, Atelier masqué)", (await page.locator("#ah84-title").textContent()) === "Harmonie du bâtiment" && (await page.locator(".ah84-links button").count()) === 3 && !(await page.locator(".native-atelier").isVisible()));
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

// 6b'. Bilan Harmonie du bâtiment conçu (flow-v62) : pli, bilan en ligne, plans, transmission, revue, rapport, références directionnelles
await page.locator(".ah84-links button:has-text('Bilan & espaces')").click();
check("sous-page : « Bilan & espaces » ouvre le pli « Bilan du bâtiment, plans et ambiances » avec « Capacités & ambiances des espaces »", (await page.locator("#ah84-bilan").evaluate((d) => d.open)) === true && (await page.locator('button:has-text("Capacités & ambiances des espaces")').count()) === 1);
await page.locator(".design-review-fold > summary").click();
check("étape 10 : pli « Bilan Harmonie du bâtiment conçu · modèle … », 6 niveaux et 74 zones", /^Bilan Harmonie du bâtiment conçu · modèle [0-9a-f]{8}$/.test((await page.locator(".design-review-fold > summary").textContent()).trim()) && /6 niveaux et 74 zones analysables/.test(await page.locator(".design-review-fold .h7-fold-body").textContent()));
await page.locator('.design-review-fold button:has-text("Lire le bilan du bâtiment")').click();
await page.waitForSelector("#v62-report");
check("bilan : « Bilan Harmony du bâtiment conçu », 5 onglets, intentions transmises, actions prioritaires (7 réserves)", (await page.locator("#v62-report h1").textContent()) === "Bilan Harmony du bâtiment conçu" && (await page.locator(".v62-tabs button").count()) === 5 && (await page.locator("#v62-report h2").first().textContent()) === "Intentions transmises et propositions de conception" && (await page.locator("#v62-report .v62-issue").count()) === 7);
await page.locator('.v62-tabs button:has-text("Plans & niveaux")').click();
check("bilan : plan de lecture SVG du RDC (parcelle, emprise, zones, entrée H-ENTREE, nord H-GEO) et tableau des niveaux", (await page.locator(".v62-plan svg").count()) === 1 && /Entrée H-ENTREE/.test(await page.locator(".v62-plan").innerHTML()) && /Nord géographique calculé \(H-GEO\)/.test(await page.locator(".v62-plan").innerHTML()) && (await page.locator(".v62-tab-content .v62-table tbody tr").count()) === 6);
await page.locator("#v62-report-host").screenshot({ path: `${OUT}/10-desktop-bilan.png` });
const [planDl] = await Promise.all([page.waitForEvent("download"), page.locator('a:has-text("Plan de lecture SVG ↓")').click()]);
check("bilan : « Plan de lecture SVG ↓ » → Plan_lecture_rdc_V7.svg", planDl.suggestedFilename() === "Plan_lecture_rdc_V7.svg");
await page.locator('.v62-tabs button:has-text("Locaux & Répartition")').click();
check("bilan : tableau des 74 locaux (mesure, cible / écart, lecture)", (await page.locator(".v62-tab-content .v62-table tbody tr").count()) === 74);
await page.locator('.v62-tabs button:has-text("Transmission")').click();
check("bilan : audit des transmissions, 14 contrôles, « Revue de conception » à actualiser", (await page.locator(".v62-tab-content .v62-table tbody tr").count()) === 14 && /revue à actualiser/.test(await page.locator(".v62-tab-content .v62-table").textContent()));
await page.locator('button:has-text("Actualiser la revue de conception")').click();
await page.waitForFunction(() => /Lecture documentaire courante/.test(document.querySelector("#v62-report header p")?.textContent || ""), null, { timeout: 10000 });
check("bilan : « Actualiser la revue de conception » → revue rattachée aux entrées courantes, toast", /Revue rattachée aux entrées actuelles/.test(await page.locator(".v62-tab-content .v62-table").textContent()) && (await page.locator(".h7-toast").textContent().catch(() => "")) === "Bilan de conception actualisé sans lever les réserves.");
// Observation déclarée du contexte extérieur (site-note) : refus en dessous de 20 caractères, puis réserve « Contexte extérieur non observé » levée.
await page.locator('.v62-tabs button:has-text("Hypothèses & MapTiler")').click();
await page.waitForSelector("#v62-site-note");
await page.fill("#v62-site-note", "trop court");
await page.locator('button:has-text("Enregistrer comme observation déclarée")').click();
await page.waitForSelector(".site-observation .h7-error", { timeout: 10000 });
check("bilan · Hypothèses & MapTiler : observation trop courte refusée par le serveur (« 20 caractères minimum »)", /20 caractères minimum/.test(await page.locator(".site-observation .h7-error").textContent()));
await page.fill("#v62-site-note", "Voie en T au nord-est, masse voisine R+3 à l'ouest ; relevé sur place le 12/09/2026.");
await page.locator('button:has-text("Enregistrer comme observation déclarée")').click();
await page.waitForSelector(".site-observation-status", { timeout: 10000 });
check("bilan : « Enregistrer comme observation déclarée » → statut « Déclaration utilisateur, non contrôle indépendant », daté", /^Déclaration utilisateur, non contrôle indépendant · \d{2}\/\d{2}\/\d{4}/.test(await page.locator(".site-observation-status").textContent()));
await page.locator('.v62-tabs button:has-text("Bilan du bâtiment")').click();
await page.waitForFunction(() => document.querySelectorAll("#v62-report .v62-issue").length === 6, null, { timeout: 10000 }).catch(() => {});
check("bilan : la réserve « Contexte extérieur non observé » est levée (6 réserves au lieu de 7), la revue archivée devient à actualiser", (await page.locator("#v62-report .v62-issue").count()) === 6 && !/Contexte extérieur non observé/.test(await page.locator("#v62-report").textContent()));
await page.locator('.v62-tabs button:has-text("Transmission")').click();
check("bilan · Transmission : « Preuves de contexte extérieur » OK (observation consignée par utilisateur)", /Preuves de contexte extérieur.{0,80}OK/.test((await page.locator(".v62-tab-content").textContent()).replace(/\s+/g, " ")));
await page.locator('button:has-text("Actualiser la revue de conception")').click();
await page.waitForFunction(() => /Lecture documentaire courante/.test(document.querySelector("#v62-report header p")?.textContent || ""), null, { timeout: 10000 });
const [bilanDl] = await Promise.all([page.waitForEvent("download"), page.locator('#v62-report a:has-text("Rapport HTML ↓")').click()]);
const bilanHtml = await (await import("node:fs/promises")).readFile(await bilanDl.path(), "utf8");
check("bilan : « Rapport HTML ↓ » → Bilan_Harmonie_Batiment_V7.html (synthèse, plan, 74 zones, transmission)", bilanDl.suggestedFilename() === "Bilan_Harmonie_Batiment_V7.html" && bilanHtml.includes("<title>P.118 — Bilan Harmonie du bâtiment conçu · V7</title>") && bilanHtml.includes("Lecture des 74 zones") && bilanHtml.includes("<svg"));
await page.locator('.design-review-fold button:has-text("Outils directionnels documentés")').click();
await page.waitForSelector(".design-compass");
check("références directionnelles : azimut 123,87° hérité de H-GEO + H-ENTREE, statut non prêt (références manquantes)", /^123\.866/.test(await page.locator('.design-compass input[type="number"]').first().inputValue()) && /"ready": false/.test(await page.locator(".design-compass .h7-json").textContent()));
await page.locator('.design-compass input[type="date"]').fill("2026-10-02");
await page.locator('.design-compass input[type="number"]').nth(1).fill("2");
await page.locator('.design-compass input[type="number"]').nth(2).fill("1.5");
await page.locator('.design-compass input[type="text"]').nth(2).fill("Modèle IGRF 2026 — hypothèse");
await page.locator('.design-compass input[type="checkbox"]').check();
await page.locator('button:has-text("Enregistrer les références")').click();
await page.waitForFunction(() => /"ready": true/.test(document.querySelector(".design-compass .h7-json")?.textContent || ""), null, { timeout: 10000 });
check("références directionnelles : « Enregistrer les références » → prêtes (Gua calculé sous hypothèse), étape 10 à réexaminer", /"name": "Qian"/.test(await page.locator(".design-compass .h7-json").textContent()));
await page.waitForFunction(() => /à réexaminer/.test(document.querySelector(".h7-panel > summary")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
check("références directionnelles : l'empreinte de l'étape 10 change → « … · à réexaminer »", /à réexaminer/.test(await page.locator(".h7-panel > summary").textContent()));
await page.keyboard.press("Escape");
await page.waitForFunction(() => document.getElementById("atelier-harmonie-page")?.hidden === true);
check("sous-page : Échap → « Retour à l’Atelier », le dessin réapparaît", await page.locator(".native-atelier").isVisible());

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
await page.waitForFunction(() => /à réexaminer/.test(document.querySelector(".h7-panel > summary")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
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

// 6f. Archive de projet : « Sauvegarder projet JSON » puis « Importer projet JSON » → nouveau dossier « · import »
const [archiveDl] = await Promise.all([page.waitForEvent("download"), page.locator('#parcours-project-tools a:has-text("Sauvegarder projet JSON")').click()]);
const archivePath = await archiveDl.path();
const archiveJson = JSON.parse(await (await import("node:fs/promises")).readFile(archivePath, "utf8"));
check("outils du projet : « Sauvegarder projet JSON » → Parcours_V7_Escalier_B_et_mezzanine.json (21 étapes, modèle natif, cas de programme)", archiveDl.suggestedFilename() === "Parcours_V7_Escalier_B_et_mezzanine.json" && archiveJson.kind === "fadi-project-archive" && archiveJson.steps.length === 21 && !!archiveJson.native && archiveJson.programmeCases.length === 1);
await page.locator('#parcours-project-tools input[type="file"]').setInputFiles({ name: "Parcours_V7_Escalier_B_et_mezzanine.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(archiveJson)) });
await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().includes(examplePid), { timeout: 20000 });
await page.waitForSelector(".step-card-open");
check("outils du projet : « Importer projet JSON » → nouveau dossier ouvert, toast du prototype", !page.url().includes(examplePid) && /Import créé dans un nouveau dossier/.test(await page.locator(".h7-toast").textContent().catch(() => "")));
check("import : « Escalier B et mezzanine · import », 21 cartes", /Escalier B et mezzanine · import/.test(await page.locator("h1").first().textContent()) && (await page.locator(".step-card-open").count()) === 21);
await page.goto(`${BASE}/projets`);
await page.waitForSelector(".project-list");
check("page Projets : « Importer projet JSON » et « Bibliothèque des bâtiments » dans l'en-tête", (await page.locator('.projects-heading button:has-text("Importer projet JSON")').count()) === 1 && (await page.locator('.projects-heading a:has-text("Bibliothèque des bâtiments")').count()) === 1);

// 6g. Référence protégée de l'exemple (étape 07) : fiches d'espaces, CSV, « Essayer une autre répartition en copie » ;
//     dans la copie : « Comparer au modèle dessiné » (liaisons par identifiant), « Hypothèses et validation » (règle du
//     prototype), transfert surfacique à total constant depuis le panneau Harmonie de l'étape 07.
await page.goto(`${exampleUrl}?module=parcours&etape=7`);
await page.waitForSelector(".programme-case");
check("exemple étape 07 : présentation protégée « Répartition renseignée et liée au modèle », pli « 74 fiches d’espaces — capacités, dimensions et ambiances choisies »", (await page.locator(".programme-rooms-fold > summary").textContent()) === "74 fiches d’espaces — capacités, dimensions et ambiances choisies");
await page.locator(".programme-case").screenshot({ path: `${OUT}/07-desktop.png` });
await page.locator(".programme-rooms-fold > summary").click();
await page.waitForSelector(".programme-rooms-fold .v62-table tbody tr", { timeout: 20000 });
const roomsBox = await page.locator(".programme-rooms-fold").evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }; });
await page.screenshot({ path: `${OUT}/07-desktop-fiches.png`, fullPage: true, clip: { x: roomsBox.x, y: roomsBox.y, width: roomsBox.width, height: Math.min(900, roomsBox.height) } });
const roomsRow = (await page.locator(".programme-rooms-fold .v62-table tbody tr").first().textContent()).replace(/[  ]/g, " ");
check("exemple étape 07 : 74 fiches (niveau / zone, gabarit calculé, capacité cible, réponse et ambiance retenues)", (await page.locator(".programme-rooms-fold .v62-table tbody tr").count()) === 74 && /Sous-sol technique · S01 · Archives sèches.*230,61 m².*9,26 × 27,35 m : enveloppe, non dimension libre.*2 personnes.*Ambiance choisie/s.test(roomsRow), roomsRow.slice(0, 160));
const [csvDl] = await Promise.all([page.waitForEvent("download"), page.locator('a:has-text("Exporter les fiches CSV")').click()]);
const csvText = await (await import("node:fs/promises")).readFile(await csvDl.path(), "utf8");
check("exemple étape 07 : « Exporter les fiches CSV » → P118_Programme_Resolu_V8_19.csv (BOM, « ; », 74 lignes)", csvDl.suggestedFilename() === "P118_Programme_Resolu_V8_19.csv" && csvText.startsWith('﻿"ID";"Niveau";"Espace";"Surface m2";"Capacité cible";"Source capacité";"Statut"') && csvText.split("\r\n").length === 75);
await page.evaluate(() => { document.querySelector(".h7-panel").open = true; });
check("exemple étape 07 : la référence n'a pas de pli de transfert (panneau du prototype)", (await page.locator(".h7-transfer-fold").count()) === 0);
// La copie reflète l'état courant de la référence (étapes remises « en cours » par les arbitrages précédents du scénario).
const referenceDone = await page.evaluate(async (pid) => (await (await fetch(`/projects/${pid}/steps`, { credentials: "include" })).json()).filter((s) => s.status === "termine").length, examplePid);
await page.locator('button:has-text("Essayer une autre répartition en copie")').click();
await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().includes(examplePid), { timeout: 30000 });
await page.waitForSelector(".step-card-open");
const copyUrl = page.url().split("?")[0];
const copyToast = await page.locator(".h7-toast").textContent().catch(() => "");
const copyTitle = await page.locator("h1").first().textContent();
const copySummary = await page.locator(".parcours-steps-summary").textContent();
check("« Essayer une autre répartition en copie » → nouveau dossier « P.118 — ma variante de l’exemple résolu », mêmes étapes terminées que la référence, toast", copyTitle === "P.118 — ma variante de l’exemple résolu" && copySummary.includes(`${referenceDone} / 21`) && /Copie modifiable créée/.test(copyToast), `${copyTitle} | ${copySummary} (référence ${referenceDone}) | ${copyToast}`);
await page.goto(`${copyUrl}?module=parcours&etape=7`);
await page.waitForSelector(".programme-case-editor");
check("copie étape 07 : répartition du dossier maître modifiable (« RÉVISION 6 »), 4 actions du prototype", /RÉVISION 6/.test(await page.locator(".programme-case-editor .bl-kicker").textContent()) && (await page.locator('.programme-case-editor a:has-text("Comparer au modèle dessiné")').count()) === 1 && (await page.locator('.programme-case-editor a:has-text("Hypothèses et validation")').count()) === 1);
await page.locator('.programme-case-editor a:has-text("Comparer au modèle dessiné")').click();
await page.waitForSelector("#bl-model-links");
check("« Comparer au modèle dessiné » → module Programmation, vue « Programme ↔ modèle dessiné », 74 lignes liées à 74 zones", /module=programmation&vue=modele/.test(page.url()) && (await page.locator('.module-nav button[aria-current="page"]').textContent()) === "Programmation" && (await page.locator("#bl-model-links tbody tr").count()) === 74 && /74 zones du modèle/.test(await page.locator("#bl-model-links .bl-small").textContent()));
const linkRow = page.locator("#bl-model-links tbody tr").first();
const linkSpace = await linkRow.getAttribute("data-space");
check("liaison : S01 · 230,614 m² programmés ↔ Sous-sol technique · S01 (230,614 m² calculés, écart 0 m²)", /S01 · Archives sèches230,614 m² programmésSous-sol technique · S01 · Archives sèches ×230,614 m² calculés0 m²/.test((await linkRow.textContent()).replace(/[  ]/g, " ")));
await page.screenshot({ path: `${OUT}/07-desktop-modele.png`, fullPage: false });
await linkRow.locator("button.bl-unlink").first().click();
await page.waitForFunction((id) => document.querySelector(`#bl-model-links tr[data-space="${id}"] button.bl-unlink`) === null, linkSpace, { timeout: 10000 });
const unlinkedRow = page.locator(`#bl-model-links tr[data-space="${linkSpace}"]`);
check("délier → « Non lié », « Non calculable », la zone redevient disponible dans « Choisir une zone… »", /Non lié—Non calculable/.test(await unlinkedRow.textContent()) && (await unlinkedRow.locator("select option").count()) === 2);
const freeRoom = await unlinkedRow.locator("select option").nth(1).getAttribute("value");
await unlinkedRow.locator("select").selectOption(freeRoom);
await page.waitForFunction((id) => document.querySelector(`#bl-model-links tr[data-space="${id}"] button.bl-unlink`) !== null, linkSpace, { timeout: 10000 });
check("relier par identifiant → zone liée, surface calculée, écart recalculé", /230,614 m² calculés0 m²/.test((await unlinkedRow.textContent()).replace(/[  ]/g, " ")));
await page.locator('#bl-model-links a:has-text("← Répartition")').click();
await page.waitForSelector(".programme-case-editor");
await page.waitForFunction(() => /RÉVISION 8/.test(document.querySelector(".programme-case-editor .bl-kicker")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
check("« ← Répartition » → étape 07, révision 8 (délier + relier)", /etape=7/.test(page.url()) && /RÉVISION 8/.test(await page.locator(".programme-case-editor .bl-kicker").textContent()), await page.locator(".programme-case-editor .bl-kicker").textContent());
await page.locator('.programme-case-editor a:has-text("Hypothèses et validation")').click();
await page.waitForSelector("#bl-hypotheses");
const hypStatus = page.locator('#bl-hypotheses select[aria-label="Statut H-USAGE"]');
check("« Hypothèses et validation » → « Registre des hypothèses », 2 hypothèses du cas, statut d'origine « hypothesis » et 6 statuts", /vue=hypotheses/.test(page.url()) && (await page.locator("#bl-hypotheses tbody tr").count()) === 2 && (await hypStatus.inputValue()) === "hypothesis" && (await hypStatus.locator("option").count()) === 7);
const hypProof = page.locator('#bl-hypotheses textarea[aria-label="Preuve ou motif H-USAGE"]');
await hypProof.fill("");
await hypProof.blur();
await page.waitForTimeout(500);
await hypStatus.selectOption("Confirmée par preuve");
await page.waitForSelector("#bl-hypotheses .bl-note.danger", { timeout: 10000 });
check("hypothèse sans preuve → confirmation refusée (message du prototype), statut rétabli", (await page.locator("#bl-hypotheses .bl-note.danger").textContent()) === "Renseignez d’abord responsable et preuve / motif." && (await hypStatus.inputValue()) === "hypothesis");
await hypProof.fill("Note de renseignements du 12/03");
await hypProof.blur();
await page.waitForTimeout(500);
await hypStatus.selectOption("Confirmée par preuve");
await page.waitForFunction(() => !document.querySelector("#bl-hypotheses .bl-note.danger") && document.querySelector('#bl-hypotheses select[aria-label="Statut H-USAGE"]')?.value === "Confirmée par preuve" && !document.querySelector('#bl-hypotheses select[aria-label="Statut H-USAGE"]')?.disabled, null, { timeout: 10000 });
await page.screenshot({ path: `${OUT}/07-desktop-hypotheses.png`, fullPage: false });
await page.reload();
await page.waitForSelector("#bl-hypotheses");
await page.waitForFunction(() => document.querySelector('#bl-hypotheses select[aria-label="Statut H-USAGE"]')?.value === "Confirmée par preuve", null, { timeout: 10000 }).catch(() => {});
check("preuve renseignée → « Confirmée par preuve », conservée après rechargement", (await page.locator('#bl-hypotheses select[aria-label="Statut H-USAGE"]').inputValue()) === "Confirmée par preuve" && (await page.locator('#bl-hypotheses textarea[aria-label="Preuve ou motif H-USAGE"]').inputValue()) === "Note de renseignements du 12/03");
await page.locator('#bl-hypotheses a:has-text("Harmony")').click();
await page.waitForSelector(".h7-transfer-fold");
check("« Harmony » → étape 07, panneau Harmonie ouvert, pli « Proposer un transfert surfacique à total constant »", /etape=7&harmonie=1/.test(page.url()) && (await page.locator(".h7-panel").evaluate((d) => d.open)) === true);
await page.locator(".h7-transfer-fold > summary").click();
check("transfert : 74 fiches donneuses « nom · m² », bénéficiaire « Choisir »", (await page.locator("#h7-from option").count()) === 74 && (await page.locator("#h7-from option").first().textContent()).replace(/[  ]/g, " ") === "S01 · Archives sèches · 230,61 m²" && (await page.locator("#h7-to option").first().textContent()) === "Choisir");
await page.locator("#h7-to").selectOption(await page.locator("#h7-to option").nth(2).getAttribute("value"));
await page.fill("#h7-transfer-area", "5");
await page.fill("#h7-transfer-reason", "court");
await page.locator('.h7-transfer-fold button:has-text("Comparer avant / après")').click();
await page.waitForSelector(".h7-transfer-fold .h7-error");
check("transfert : justification trop courte → refus du prototype", (await page.locator(".h7-transfer-fold .h7-error").textContent()) === "Justifiez le transfert et ses conséquences.");
await page.fill("#h7-transfer-reason", "Besoin de place pour la formation ; capacité inchangée.");
await page.locator('.h7-transfer-fold button:has-text("Comparer avant / après")').click();
await page.waitForSelector("#h7-transfer-preview table");
const previewText = (await page.locator("#h7-transfer-preview").textContent()).replace(/[  ]/g, " ");
check("transfert : « Comparer avant / après » → Donneur 230,61 → 225,61 m², Bénéficiaire +5 m², total programme 2 932,26 m² inchangé", /Donneur230,61 m²225,61 m²/.test(previewText) && /Total programme2 932,26 m²2 932,26 m²/.test(previewText) && /L’application modifie deux cibles programmatiques, pas le dessin\./.test(previewText));
await page.locator(".h7-transfer-fold").screenshot({ path: `${OUT}/07-desktop-transfert.png` });
await page.locator('button:has-text("Appliquer ce transfert au programme")').click();
await page.waitForFunction(() => /Transfert appliqué/.test(document.querySelector(".h7-toast")?.textContent || ""), null, { timeout: 10000 });
await page.waitForFunction(() => /RÉVISION 10/.test(document.querySelector(".programme-case-editor .bl-kicker")?.textContent || ""), null, { timeout: 10000 });
check("transfert : « Appliquer » → toast du prototype, révision 10 (deux cibles modifiées), décision à réexaminer, comparaison effacée", (await page.locator(".h7-toast").textContent()) === "Transfert appliqué au programme à total constant. Géométrie conservée." && (await page.locator('.programme-case-editor h2:has-text("Décision à réexaminer")').count()) === 1 && (await page.locator("#h7-transfer-preview table").count()) === 0);
await page.goto(`${exampleUrl}?module=parcours&etape=7`);
await page.waitForSelector(".programme-case");
check("la référence est intacte après la copie (révision 6, présentation protégée)", /révision 6/.test(await page.locator(".programme-case .step-card-meta").textContent()) && (await page.locator(".programme-case-editor").count()) === 0);

// 6h. Analyses métier : contrôles traçables (domaine, source, version, résultat), quantités dérivées, dossier déclaré, variantes de programme
await page.goto(`${exampleUrl}?module=analyses`);
await page.waitForSelector(".analyses-checks tbody tr", { timeout: 30000 });
const analysesSub = await page.locator(".analyses-module .biz-sub").first().textContent();
check("analyses : en-tête tagué de la révision du modèle, des empreintes et du profil", /^Révision du modèle \d+ · empreinte [0-9a-f]{8} · entrées [0-9a-f]{8} · calculé le .* · profil Mixte \/ multi-usages$/.test(analysesSub), analysesSub);
check("analyses : 26 contrôles traçables (10 règles de conception, 14 transmissions, chiffrage, structure), chacun avec sa source et sa version", (await page.locator(".analyses-checks tbody tr").count()) === 26 && (await page.locator(".analyses-checks tbody tr td:nth-child(5)").allTextContents()).every((t) => /· v\d/.test(t)));
const checkStatus = async (id) => page.locator(`.analyses-checks tr[data-check="${id}"]`).getAttribute("data-status");
check("analyses : HEIGHT « à vérifier » (réserve du dossier), IMPLANTATION « conforme », structure « non évalué » (non calculée), chiffrage « conforme »", (await checkStatus("design:HEIGHT")) === "a-verifier" && (await checkStatus("design:IMPLANTATION")) === "conforme" && (await checkStatus("structure:dimensionnement")) === "non-evalue" && (await checkStatus("finance:complet")) === "conforme");
check("analyses : quantités dérivées — 6 niveaux, 74 zones, parcelle 1 345,55 m² (1 346 m² déclarés), 673 m² d'emprise dans le contour", (await page.locator(".analyses-levels tbody tr").count()) === 6 && /1 345,55 m²1 346 m² déclarés/.test((await page.locator(".biz-kpis").first().textContent()).replace(/[\u202f\u00a0]/g, " ")) && /673 m²dans le contour/.test((await page.locator(".biz-kpis").first().textContent()).replace(/[\u202f\u00a0]/g, " ")) && /74 zone\(s\)/.test(await page.locator(".biz-kpis").first().textContent()));
check("analyses : structure déclarée (3 exigences, 1 hypothèse, 2 représentations, 1 état), 12 circulations mesurées, variante courante révision 6", (await page.locator('.analyses-structure tr[data-kind="exigence"]').count()) === 3 && (await page.locator('.analyses-structure tr[data-kind="hypothese"]').count()) === 1 && (await page.locator(".analyses-circulation tbody tr").count()) === 12 && /^6EXEMPLE COMPLET/.test(await page.locator(".analyses-scenarios tbody tr").first().textContent()));
await page.locator(".analyses-module .biz-card").first().screenshot({ path: `${OUT}/analyses-desktop.png` });

// 6i. Documents : catalogue des documents productibles, productions enregistrées et actualité (à jour / périmé)
await page.goto(`${exampleUrl}?module=documents`);
await page.waitForSelector(".documents-table tbody tr", { timeout: 30000 });
const docFreshness = async (kind) => page.locator(`tr[data-document="${kind}"]`).getAttribute("data-freshness");
check("documents : 33 documents productibles (synthèse, 21 rapports d'étape, bilan, 6 plans, tableau des surfaces, programme, fiches, archive)", (await page.locator(".documents-table tbody tr").count()) === 33 && /33 documents productibles/.test(await page.locator(".documents-module .biz-sub").first().textContent()));
check("documents : productions antérieures reconnues — rapport de l'étape 02, synthèse et archive à jour ; bilan périmé (références directionnelles enregistrées après sa production)", (await docFreshness("harmonie-etape-02")) === "a-jour" && (await docFreshness("harmonie-synthese")) === "a-jour" && (await docFreshness("archive-projet")) === "a-jour" && (await docFreshness("bilan-batiment")) === "perime" && (await docFreshness("tableau-surfaces")) === "aucune");
const [surfacesDl] = await Promise.all([page.waitForEvent("download"), page.locator('tr[data-document="tableau-surfaces"] a:has-text("Produire")').click()]);
const surfacesCsv = await (await import("node:fs/promises")).readFile(await surfacesDl.path(), "utf8");
await page.waitForFunction(() => document.querySelector('tr[data-document="tableau-surfaces"]')?.getAttribute("data-freshness") === "a-jour", null, { timeout: 10000 });
check("documents : « Produire » le tableau des surfaces → Tableau_surfaces_V7.csv (74 zones + 6 totaux de niveau), production enregistrée « À jour · révision N »", surfacesDl.suggestedFilename() === "Tableau_surfaces_V7.csv" && surfacesCsv.split("\r\n").length === 82 && /^À jour · révision \d+$/.test(await page.locator('tr[data-document="tableau-surfaces"] .h7-chip').textContent()));
await page.locator(".documents-module .biz-card").nth(2).screenshot({ path: `${OUT}/documents-desktop.png` });

// 6j. Collaboration : commentaire depuis une étape, accès et synchronisation annoncés tels quels, journal des révisions, suppression par l'auteur
await page.goto(`${exampleUrl}?module=parcours&etape=8`);
await page.waitForSelector(".step-comments");
await page.locator(".step-comments > summary").click();
check("étape 08 : pli « Commentaires (0) » vide", /Commentaires \(0\)/.test(await page.locator(".step-comments > summary").textContent()) && /Aucun commentaire sur cette étape/.test(await page.locator(".step-comments").textContent()));
await page.locator(".step-comments textarea").fill("Vérifier la hauteur sous plafond avec le BET.");
await page.locator('.step-comments button:has-text("Publier le commentaire")').click();
await page.waitForFunction(() => /Commentaires \(1\)/.test(document.querySelector(".step-comments > summary")?.textContent || ""), null, { timeout: 10000 });
check("étape 08 : « Publier le commentaire » → « Commentaires (1) », auteur et date", (await page.locator(".step-comments .comment-meta").textContent()).includes(email) && (await page.locator(".step-comments .comment p").textContent()) === "Vérifier la hauteur sous plafond avec le BET.");
await page.goto(`${exampleUrl}?module=collaboration`);
await page.waitForSelector(".journal-table tbody tr", { timeout: 30000 });
const collabKpis = (await page.locator(".collaboration-module .biz-kpis").textContent()).replace(/\s+/g, " ");
check("collaboration : propriétaire = vous, « Votre rôle · propriétaire », partage « 0 membre(s) », hors-ligne « Atelier, saisies, lecture », révision du modèle et dernière écriture", collabKpis.includes(email) && collabKpis.includes("c'est vous") && /Votre rôlepropriétaire/.test(collabKpis) && /Partage0 membre\(s\)/.test(collabKpis) && /Hors-ligneAtelier, saisies, lecture/.test(collabKpis) && /Révision \d+dernière écriture/.test(collabKpis), collabKpis);
check("collaboration : le commentaire de l'étape 08 apparaît avec son lien « étape 08 »", (await page.locator(".comment").count()) === 1 && (await page.locator('.comment a:has-text("étape 08")').count()) === 1);
const journalKinds = new Set(await page.locator(".journal-table tbody tr").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-kind"))));
check("collaboration : journal des révisions relu des données (projet, Harmonie, programme, modèle, parcelle, revue, documents, commentaire), du plus récent au plus ancien", ["projet", "harmonie", "programme", "modele", "parcelle", "revue", "document", "commentaire"].every((k) => journalKinds.has(k)) && (await page.locator(".journal-table tbody tr").first().getAttribute("data-kind")) === "commentaire");
await page.locator('.collaboration-module .h7-tabs button:has-text("Document")').click();
check("collaboration : filtre « Document » → les productions enregistrées (rapport 02, synthèse, archive, bilan, tableau des surfaces)", (await page.locator(".journal-table tbody tr").count()) >= 5 && (await page.locator(".journal-table tbody tr").evaluateAll((rows) => rows.every((r) => r.getAttribute("data-kind") === "document"))));
await page.locator(".collaboration-module .biz-card").first().screenshot({ path: `${OUT}/collaboration-desktop.png` });
await page.locator(".comment-delete").first().click();
await page.waitForFunction(() => document.querySelectorAll(".comment").length === 0, null, { timeout: 10000 });
check("collaboration : « Supprimer » (auteur) → plus de commentaire", (await page.locator(".comment").count()) === 0);

// 6k. Hors-ligne : file locale (IndexedDB) de l'Atelier, quatre états visibles, rejeu au retour du réseau et après rechargement, ouverture depuis le cache local
await page.goto(`${exampleUrl}?module=atelier`);
await page.waitForFunction(() => document.querySelector("#atelier-toolbar")?.getAttribute("data-ready") === "1", null, { timeout: 30000 });
await page.waitForFunction(() => /Synchronisé avec le serveur/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
const drawWall = async (fx) => {
  await page.locator("#model-floors button", { hasText: "RDC" }).first().click();
  await page.locator('#atelier-toolbar [data-atab="design"]').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Mur")').first().click();
  const b = await page.locator("#viewer-surface").boundingBox();
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * 0.5);
  await page.waitForTimeout(200);
  await page.mouse.click(b.x + b.width * (fx + 0.08), b.y + b.height * 0.5);
  await page.keyboard.press("Enter");
};
const wallsBeforeOffline = await rdcWalls();
await ctx.setOffline(true);
await page.waitForFunction(() => /Hors-ligne/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
check("hors-ligne : l'en-tête du projet passe « Hors-ligne »", /^Hors-ligne/.test(await page.locator(".sync-indicator").textContent()));
await drawWall(0.45);
await page.waitForFunction(() => /Hors-ligne · enregistré localement/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 10000 });
const outbox = await page.evaluate(() => new Promise((resolve) => { const req = indexedDB.open("fadi-local"); req.onsuccess = () => { const tx = req.result.transaction("outbox"); const all = tx.objectStore("outbox").getAll(); all.onsuccess = () => resolve(all.result.map((e) => e.key.split(".").pop())); }; }));
check("hors-ligne : un mur dessiné → « Hors-ligne · enregistré localement », écriture conservée dans la file IndexedDB (floorDesign)", /enregistré localement \(\d+\)/.test(await page.locator(".native-atelier-status").textContent()) && outbox.includes("floorDesign") && /modification\(s\) enregistrée\(s\) localement/.test(await page.locator(".sync-indicator").textContent()), JSON.stringify(outbox));
await ctx.setOffline(false);
await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 20000 });
const wallsAfterOnline = await rdcWalls();
check("retour du réseau : synchronisation automatique → « Enregistré sur le serveur », +1 mur et +1 révision sur le serveur, file vide", wallsAfterOnline.walls === wallsBeforeOffline.walls + 1 && wallsAfterOnline.revision === wallsBeforeOffline.revision + 1 && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()), JSON.stringify({ wallsBeforeOffline, wallsAfterOnline }));
// Conflit du modèle : un autre appareil écrit la même clé pendant la coupure ; au retour, le rejeu est refusé (409), la version du
// serveur reprend la clé, la vôtre est conservée en copie de secours, et le bandeau propose de la reprendre ou de garder le serveur.
const storeBefore = await (await page.request.get(`${BASE}/projects/${examplePid}/atelier/store`)).json();
const floorKey = Object.keys(storeBefore.entries).find((k) => k.endsWith(".floorDesign"));
await ctx.setOffline(true);
await drawWall(0.52);
await page.waitForFunction(() => /Hors-ligne · enregistré localement/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 10000 });
const otherModel = await page.request.put(`${BASE}/projects/${examplePid}/atelier/store/${encodeURIComponent(floorKey)}`, { data: { value: storeBefore.entries[floorKey], expectedRevision: storeBefore.revisions[floorKey] } });
check("autre appareil : écriture du même floorDesign pendant la coupure (200)", otherModel.status() === 200, String(otherModel.status()));
await ctx.setOffline(false);
await page.waitForSelector('.conflict-banner li[data-kind="modele"]', { timeout: 20000 });
const modelConflictText = (await page.locator('.conflict-banner li[data-kind="modele"]').textContent()).replace(/\s+/g, " ");
check("retour du réseau : rejeu refusé (409) → « Conflit détecté », conflit du modèle listé (« Atelier · floorDesign », copie de secours), compté dans l'en-tête", /Atelier · floorDesign/.test(modelConflictText) && /conservée sous « .*backup\.conflit-/.test(modelConflictText) && /Conflit détecté/.test(await page.locator(".native-atelier-status").textContent()) && /1 conflit\(s\) à examiner/.test(await page.locator(".sync-indicator").textContent()), modelConflictText.slice(0, 160));
const wallsDuringConflict = await rdcWalls();
await page.locator('.conflict-banner li[data-kind="modele"] button:has-text("Reprendre ma version")').click();
await page.waitForFunction(() => !document.querySelector(".conflict-banner") && /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || "") && /Synchronisé avec le serveur/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 20000 });
// La copie de secours est retirée du serveur par une seconde écriture (regroupée) : on attend qu'elle ait disparu.
await page.waitForFunction(async (pid) => !Object.keys((await (await fetch(`/projects/${pid}/atelier/store`, { credentials: "include" })).json()).entries).some((k) => k.includes(".backup.conflit-")), examplePid, { timeout: 15000 }).catch(() => {});
const wallsResolved = await rdcWalls();
const storeResolved = await (await page.request.get(`${BASE}/projects/${examplePid}/atelier/store`)).json();
const backupsLeft = Object.keys(storeResolved.entries).filter((k) => k.includes(".backup.conflit-"));
check("« Reprendre ma version » : le dessin local est réécrit sur la clé à partir de la révision du serveur (+1 mur), la copie de secours est retirée, en-tête synchronisé", wallsDuringConflict.walls === wallsAfterOnline.walls && wallsResolved.walls === wallsAfterOnline.walls + 1 && backupsLeft.length === 0 && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()), JSON.stringify({ wallsAfterOnline, wallsDuringConflict, wallsResolved, backupsLeft, indicator: await page.locator(".sync-indicator").textContent() }));
// Serveur injoignable (route bloquée) puis rechargement de la page : la file locale est rejouée à l'ouverture.
await page.route(/\/atelier\/store\//, (route) => route.abort());
await drawWall(0.6);
await page.waitForFunction(() => /Serveur injoignable/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 15000 });
check("serveur injoignable : « Serveur injoignable : les modifications sont enregistrées localement… »", true);
await page.unroute(/\/atelier\/store\//);
await page.reload();
await page.waitForFunction(() => document.querySelector("#atelier-toolbar")?.getAttribute("data-ready") === "1", null, { timeout: 30000 });
await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 20000 });
const wallsAfterReload = await rdcWalls();
check("rechargement : la file locale est rejouée à l'ouverture → +1 mur et +1 révision sur le serveur", wallsAfterReload.walls === wallsResolved.walls + 1 && wallsAfterReload.revision === wallsResolved.revision + 1, JSON.stringify({ wallsResolved, wallsAfterReload }));
// Rechargement complet hors-ligne : l'enveloppe (service worker) sert l'application, le cache persistant (IndexedDB) relit
// les étapes déjà lues, l'Atelier s'ouvre depuis le cache local du modèle.
await page.goto(`${exampleUrl}?module=parcours&etape=2`);
await page.waitForSelector("#biz-f1");
await page.waitForTimeout(2500); // le cache des requêtes s'écrit avec un délai de regroupement
check("hors-ligne : service worker actif et contrôlant la page", await page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await navigator.serviceWorker.getRegistration())?.active));
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector("#biz-f1", { timeout: 20000 });
check("rechargement hors-ligne : l'étape 02 se relit depuis le cache persistant, bandeau « Lecture hors-ligne : données lues le … »", (await page.locator(".step-detail-title").textContent()) === "Réglementation & constructibilité" && /^Lecture hors-ligne : données lues le/.test(await page.locator(".offline-banner").textContent()) && /^Hors-ligne/.test(await page.locator(".sync-indicator").textContent()));
await page.locator('.module-nav button:has-text("Atelier architectural")').click();
await page.waitForFunction(() => /cache local|enregistré localement/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 20000 });
await page.waitForFunction(() => document.querySelectorAll("#model-floors button").length === 6, null, { timeout: 20000 }).catch(() => {});
check("rechargement hors-ligne : l'Atelier s'ouvre depuis le cache local du modèle, 6 niveaux", (await page.locator("#model-floors button").count()) === 6, await page.locator(".native-atelier-status").textContent());
await ctx.setOffline(false);
await page.goto(`${exampleUrl}?module=parcours`);
await page.waitForSelector(".step-card-open");

// 6l. File hors-ligne des saisies : mutation en pause, persistée et rejouée après rechargement ; refus 409 quand le serveur a avancé (jamais écrasé)
const testPid = projectUrl.split("/").pop();
const patchLog = [];
const logPatch = (r) => { if (r.request().method() === "PATCH") patchLog.push(`${r.status()} ${r.request().postData()?.slice(0, 80)}`); };
page.on("response", logPatch);
await page.goto(`${projectUrl}?module=parcours&etape=3`);
await page.waitForSelector("#biz-f1");
await page.waitForTimeout(2500); // cache des requêtes persisté
await ctx.setOffline(true);
await page.locator("#biz-f1").fill("Demande locale (saisie hors-ligne)");
await page.locator("#biz-f1").blur();
await page.waitForSelector(".offline-banner-inline", { timeout: 10000 });
check("hors-ligne : une saisie d'étape est mise en attente (« 1 envoi(s) de cette étape en attente du réseau »), comptée dans l'en-tête", /^1 envoi\(s\) de cette étape en attente du réseau/.test(await page.locator(".offline-banner-inline").textContent()) && /Hors-ligne · 1 modification/.test(await page.locator(".sync-indicator").textContent()));
await page.waitForTimeout(2500); // la mutation en pause est persistée avec le cache
await page.reload();
await page.waitForSelector("#biz-f1", { timeout: 20000 });
await page.waitForSelector(".offline-banner-inline", { timeout: 10000 }).catch(() => {});
check("rechargement hors-ligne : la saisie en attente est restaurée (toujours en pause)", (await page.locator(".offline-banner-inline").count()) === 1);
// Un autre appareil écrit le même champ pendant la coupure.
const otherDevice = await page.request.patch(`${BASE}/projects/${testPid}/steps/3`, { data: { fields: { f1: "Demande locale (autre appareil)" } } });
check("autre appareil : écriture du même champ pendant la coupure (200)", otherDevice.status() === 200);
await ctx.setOffline(false);
await page.waitForSelector(".conflict-banner", { timeout: 20000 });
await page.waitForFunction(() => document.querySelector("#biz-f1")?.value === "Demande locale (autre appareil)", null, { timeout: 10000 }).catch(() => {});
const conflictText = (await page.locator(".conflict-banner").textContent()).replace(/\s+/g, " ");
check("retour du réseau : la saisie rejouée est refusée (409) — bandeau « écriture(s) refusée(s) », valeur courante du serveur affichée, rien d'écrasé", /1 écriture\(s\) refusée\(s\)/.test(conflictText) && /Étape 03 · saisie/.test(conflictText) && /modifié depuis votre lecture/.test(conflictText) && (await page.inputValue("#biz-f1")) === "Demande locale (autre appareil)" && /1 conflit\(s\) à examiner/.test(await page.locator(".sync-indicator").textContent()), conflictText.slice(0, 200));
const conflictRow = (await page.locator(".conflict-table tbody tr").first().allTextContents()).join(" ").replace(/\s+/g, " ");
check("résolution assistée : les deux versions côte à côte (champ, valeur du serveur, votre saisie)", /Demande locale \(autre appareil\)/.test(conflictRow) && /Demande locale \(saisie hors-ligne\)/.test(conflictRow) && (await page.locator(".conflict-table tbody tr td").first().textContent()) !== "f1", conflictRow);
await page.locator(".conflict-banner").screenshot({ path: `${OUT}/conflit-saisie-desktop.png` });
await page.locator('.conflict-banner button:has-text("Reprendre ma saisie")').first().click();
await page.waitForFunction(() => document.querySelectorAll(".conflict-banner").length === 0, null, { timeout: 10000 });
await page.waitForFunction(() => document.querySelector("#biz-f1")?.value === "Demande locale (saisie hors-ligne)", null, { timeout: 10000 }).catch(() => {});
check("« Reprendre ma saisie » : renvoyée fondée sur la valeur courante → acceptée, bandeau retiré, en-tête synchronisé", (await page.inputValue("#biz-f1")) === "Demande locale (saisie hors-ligne)" && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()));
// Arbitrage fondé sur une version périmée : un autre appareil arbitre pendant que l'écran garde l'ancienne version.
await page.goto(`${projectUrl}?module=parcours&etape=3&harmonie=1`);
await page.waitForSelector(".h7-proposal");
// L'autre appareil arbitre la proposition B (version 1) ; l'écran, resté sur la version 0, retient B à son tour → refus.
const otherDecision = await page.request.post(`${BASE}/projects/${testPid}/steps/3/harmonie/H02-B`, { data: { status: "adapted", notes: "Adaptation prise sur un autre appareil", owner: "Autre appareil" } });
check("autre appareil : arbitrage de la proposition B de l'étape 03 (200)", otherDecision.status() === 200, String(otherDecision.status()));
await page.locator(".h7-proposal").nth(1).locator('button:has-text("Retenir")').first().click();
await page.waitForSelector('.conflict-banner li[data-kind="arbitrage"]', { timeout: 15000 });
const decisionConflict = (await page.locator('.conflict-banner li[data-kind="arbitrage"]').textContent()).replace(/\s+/g, " ");
check("arbitrage refusé (409) : votre arbitrage (retenue, version 0) face à la version courante du serveur (1), « Réappliquer sur la version courante » proposé", /Étape 03 · arbitrage H02-B/.test(decisionConflict) && /Votre arbitrage : retenue/.test(decisionConflict) && /fondé sur la version 0, le serveur est à la version 1/.test(decisionConflict), decisionConflict.slice(0, 220));
await page.locator('.conflict-banner button:has-text("Réappliquer sur la version courante")').click();
await page.waitForFunction(() => document.querySelectorAll(".conflict-banner").length === 0, null, { timeout: 10000 });
await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.harmonie.proposals["H02-B"]?.decisionVersion === 2, testPid, { timeout: 10000 }).catch(() => {});
const bDecision = (await (await page.request.get(`${BASE}/projects/${testPid}/steps/3`)).json()).content.harmonie.proposals["H02-B"];
check("« Réappliquer » : B retenue sur la version courante (version 2, historique conservé), en-tête synchronisé", bDecision.status === "retained" && bDecision.decisionVersion === 2 && bDecision.history.some((h) => h.status === "adapted") && /Synchronisé avec le serveur/.test(await page.locator(".sync-indicator").textContent()), JSON.stringify({ status: bDecision.status, version: bDecision.decisionVersion, history: bDecision.history.length }));
await page.goto(`${projectUrl}?module=parcours&etape=3`);
await page.waitForSelector("#biz-f1");
// Sans concurrence, la saisie rejouée passe : même scénario, personne n'a écrit entre-temps.
await ctx.setOffline(true);
await page.locator("#biz-f2").fill("Offre concurrente (hors-ligne)");
await page.locator("#biz-f2").blur();
await page.waitForSelector(".offline-banner-inline", { timeout: 10000 });
await ctx.setOffline(false);
await page.waitForFunction(() => !document.querySelector(".offline-banner-inline") && /Synchronisé avec le serveur/.test(document.querySelector(".sync-indicator")?.textContent || ""), null, { timeout: 20000 }).catch(async (err) => {
  console.log(`diagnostic f2 : indicateur « ${await page.locator(".sync-indicator").textContent()} » · bandeau inline « ${(await page.locator(".offline-banner-inline").allTextContents()).join(" | ")} » · conflits « ${(await page.locator(".conflict-banner").allTextContents()).join(" | ").replace(/\s+/g, " ").slice(0, 400)} » · PATCH : ${patchLog.join(" ; ")} · erreurs : ${consoleErrors.join(" | ")}`);
  throw err;
});
const readF2 = () => page.evaluate(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.fields.f2, testPid);
await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/3`, { credentials: "include" })).json()).content.fields.f2 === "Offre concurrente (hors-ligne)", testPid, { timeout: 10000 }).catch(() => {});
const replayed = await readF2();
page.off("response", logPatch);
check("retour du réseau sans concurrence : la saisie en attente est enregistrée sur le serveur", replayed === "Offre concurrente (hors-ligne)", `${String(replayed).slice(0, 60)} | PATCH : ${patchLog.join(" ; ")}`);

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

// 6m. Partage du projet : invitation par adresse, rôle vérifié côté serveur (lecteur : lecture et commentaires ; éditeur : modifications), départ
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page2 = await ctx2.newPage();
page2.on("pageerror", (e) => consoleErrors.push(e.message));
const readerEmail = `lecteur-${Date.now()}@example.com`;
await page2.goto(`${BASE}/inscription`);
await page2.fill('input[name="email"]', readerEmail);
await page2.fill('input[name="password"]', "scenario-pass-123");
await page2.click('button[type="submit"]');
await page2.waitForURL(/\/(projets|accueil)/);
await page2.goto(`${BASE}/projets`);
await page2.waitForSelector("#project-list-heading");
check("partage : avant l'invitation, le second compte ne voit aucun projet partagé", (await page2.locator(".shared-projects").count()) === 0);
check("partage : le second compte n'a pas accès au projet (404)", (await page2.request.get(`${BASE}/projects/${testPid}`)).status() === 404);
// Le propriétaire invite depuis le module Collaboration.
await page.goto(`${projectUrl}?module=collaboration`);
await page.waitForSelector(".members-panel");
check("collaboration : « Votre rôle · propriétaire », aucun membre invité", (await page.locator(".collab-role").textContent()) === "propriétaire" && /Aucun membre invité/.test(await page.locator(".members-table").textContent()));
await page.fill('.members-invite input[type="email"]', "personne@example.com");
await page.locator('.members-invite button:has-text("Inviter")').click();
await page.waitForSelector(".members-panel .h7-error", { timeout: 10000 });
check("collaboration : inviter une adresse sans compte → refus expliqué (« Aucun compte Fadi n'a cette adresse »)", /Aucun compte Fadi n’a cette adresse/.test(await page.locator(".members-panel .h7-error").textContent()));
await page.fill('.members-invite input[type="email"]', readerEmail);
await page.selectOption(".members-invite select", "lecteur");
await page.locator('.members-invite button:has-text("Inviter")').click();
await page.waitForSelector(`.members-table tr[data-member="${readerEmail}"]`, { timeout: 10000 });
check("collaboration : membre invité listé comme lecteur, invité par le propriétaire", (await page.locator(`.members-table tr[data-member="${readerEmail}"] select`).inputValue()) === "lecteur" && new RegExp(`invité par ${email}`).test(await page.locator(`.members-table tr[data-member="${readerEmail}"]`).textContent()));
await page.waitForFunction(() => /1 membre\(s\)/.test(document.querySelector(".biz-kpis")?.textContent || ""), null, { timeout: 10000 });
await page.screenshot({ path: `${OUT}/collaboration-partage-desktop.png`, fullPage: true });
// Le lecteur : projet partagé listé, bandeau de lecture seule, formulaires et arbitrages inactifs, commentaire possible, Atelier en lecture seule.
await page2.goto(`${BASE}/projets`);
await page2.waitForSelector(".shared-projects", { timeout: 10000 });
check("partage : « Projets partagés avec vous » — P.TEST, lecteur, partagé par le propriétaire", new RegExp(`P\\.TEST.*lecteur · partagé par ${email}`).test((await page2.locator(".shared-projects").textContent()).replace(/\s+/g, " ")));
await page2.locator('.shared-projects a:has-text("Étude test migration")').click();
await page2.waitForSelector(".access-banner", { timeout: 15000 });
check("lecteur : en-tête « lecteur · partagé par … » et bandeau « Projet partagé en lecture »", new RegExp(`lecteur · partagé par ${email}`).test(await page2.locator(".project-role").textContent()) && /Projet partagé en lecture/.test(await page2.locator(".access-banner").textContent()));
await page2.goto(`${projectUrl}?module=parcours&etape=2`);
await page2.waitForSelector("#biz-f1");
check("lecteur : saisies désactivées (fieldset), « Retenir » inactif, « Marquer terminée » inactif, pas d'import de sources", (await page2.locator("fieldset.biz-grid[disabled]").count()) === 1 && (await page2.locator("#biz-f1").isDisabled()) && (await page2.locator('.h7-proposal button:has-text("Retenir")').first().isDisabled()) && (await page2.locator('button:has-text("Marquer terminée")').isDisabled()) && (await page2.locator('.step-sources button:has-text("Importer des fichiers")').count()) === 0);
check("lecteur : la valeur saisie par le propriétaire reste lisible", (await page2.inputValue("#biz-f1")).length > 0);
await page2.evaluate(() => { document.querySelector(".step-comments").open = true; });
await page2.fill(".step-comments textarea", "Lecture faite : à confirmer avec le BET.");
await page2.locator('.step-comments button:has-text("Publier le commentaire")').click();
await page2.waitForFunction(() => /Lecture faite : à confirmer avec le BET\./.test(document.querySelector(".step-comments")?.textContent || ""), null, { timeout: 10000 });
check("lecteur : commentaire publié sur l'étape", true);
const readerPatch = await page2.request.patch(`${BASE}/projects/${testPid}/steps/2`, { data: { fields: { f1: "tentative lecteur" } } });
check("lecteur : une écriture forcée est refusée par le serveur (403 avec motif)", readerPatch.status() === 403 && /partagé en lecture/.test(((await readerPatch.json()).message) || ""));
await page2.screenshot({ path: `${OUT}/partage-lecteur-02-desktop.png`, fullPage: true });
await page2.goto(`${projectUrl}?module=atelier`);
await page2.waitForSelector(".native-atelier-status-readonly", { timeout: 30000 });
check("lecteur : Atelier en lecture seule (rien n'est enregistré)", /^Lecture seule/.test(await page2.locator(".native-atelier-status").textContent()));
// Le propriétaire passe le lecteur éditeur : la saisie devient possible et visible par le propriétaire.
await page.selectOption(`.members-table tr[data-member="${readerEmail}"] select`, "editeur");
await page.waitForFunction((e) => /est maintenant éditeur/.test(document.querySelector(".members-notice")?.textContent || ""), null, { timeout: 10000 });
// Réservation d'édition (verrou optionnel) : le propriétaire réserve, l'éditeur lit et commente seulement (423 côté serveur) ; rendue, l'éditeur écrit.
await page.goto(`${projectUrl}?module=parcours&etape=2`);
await page.waitForSelector(".editing-lock-free");
await page.locator('.editing-lock button:has-text("Réserver l’édition")').click();
await page.waitForSelector(".editing-lock-mine", { timeout: 10000 });
check("propriétaire : « Réserver l’édition » → « Édition réservée par vous jusqu’à HH:MM », Prolonger / Rendre la main", /Édition réservée par vous jusqu’à \d{2}:\d{2}/.test(await page.locator(".editing-lock-mine").textContent()) && (await page.locator('.editing-lock button:has-text("Rendre la main")').count()) === 1);
await page2.goto(`${projectUrl}?module=parcours&etape=2`);
await page2.waitForSelector(".editing-lock-other", { timeout: 15000 });
await page2.waitForFunction(() => document.querySelector("#biz-f1")?.disabled, null, { timeout: 10000 }).catch(() => {});
check("éditeur pendant la réservation : « Édition réservée par … », bandeau, saisies et arbitrages inactifs", new RegExp(`Édition réservée par ${email} jusqu’à`).test(await page2.locator(".editing-lock-other").textContent()) && /Édition réservée par .* lecture et commentaires seulement/.test(await page2.locator(".access-banner").textContent()) && (await page2.locator("#biz-f1").isDisabled()) && (await page2.locator('.h7-proposal button:has-text("Retenir")').first().isDisabled()));
const lockedPatch = await page2.request.patch(`${BASE}/projects/${testPid}/steps/2`, { data: { fields: { f1: "tentative pendant la réservation" } } });
check("éditeur pendant la réservation : une écriture forcée est refusée (423, motif et échéance)", lockedPatch.status() === 423 && /^Édition réservée par .* jusqu'à \d{2}:\d{2}/.test(((await lockedPatch.json()).message) || ""), String(lockedPatch.status()));
await page2.evaluate(() => { document.querySelector(".step-comments").open = true; });
await page2.fill(".step-comments textarea", "Je relis pendant la réservation.");
await page2.locator('.step-comments button:has-text("Publier le commentaire")').click();
await page2.waitForFunction(() => /Je relis pendant la réservation\./.test(document.querySelector(".step-comments")?.textContent || ""), null, { timeout: 10000 });
check("éditeur pendant la réservation : commentaire toujours possible", true);
await page2.evaluate(() => window.scrollTo(0, 0));
await page2.waitForTimeout(300);
await page2.screenshot({ path: `${OUT}/partage-edition-reservee-desktop.png`, fullPage: false });
await page.locator('.editing-lock button:has-text("Rendre la main")').click();
await page.waitForSelector(".editing-lock-free", { timeout: 10000 });
check("propriétaire : « Rendre la main » → édition libre", true);
await page2.goto(`${projectUrl}?module=parcours&etape=2`);
await page2.waitForFunction(() => document.querySelector(".project-role")?.textContent?.startsWith("éditeur") && !document.querySelector("#biz-f1")?.disabled, null, { timeout: 15000 });
await page2.fill("#biz-f1", "Zone UA (saisie de l'éditeur)");
await page2.locator("#biz-f1").blur();
await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}/steps/2`, { credentials: "include" })).json()).content.fields.f1 === "Zone UA (saisie de l'éditeur)", testPid, { timeout: 10000 }).catch(() => {});
check("éditeur : la saisie est enregistrée sur le projet partagé et lue par le propriétaire", (await (await page.request.get(`${BASE}/projects/${testPid}/steps/2`)).json()).content.fields.f1 === "Zone UA (saisie de l'éditeur)");
await page.goto(`${projectUrl}?module=collaboration`);
await page.waitForFunction((e) => new RegExp(`Commentaire · ${e}`).test(document.querySelector(".journal-table")?.textContent || ""), readerEmail, { timeout: 15000 }).catch(() => {});
check("journal : le commentaire du lecteur est daté et attribué", new RegExp(`Commentaire · ${readerEmail}`).test(await page.locator(".journal-table").textContent()));
// L'éditeur quitte le projet : il disparaît de sa liste, le propriétaire ne voit plus de membre.
await page2.goto(`${projectUrl}?module=collaboration`);
await page2.waitForSelector(".members-panel");
check("éditeur : « Votre rôle · éditeur », pas de formulaire d'invitation", (await page2.locator(".collab-role").textContent()) === "éditeur" && (await page2.locator(".members-invite").count()) === 0);
// Transfert de propriété puis retour : l'éditeur devient propriétaire (il voit le formulaire d'invitation), l'ancien reste éditeur, et inversement.
await page.goto(`${projectUrl}?module=collaboration`);
await page.waitForSelector(`.members-table tr[data-member="${readerEmail}"]`);
page.once("dialog", (d) => d.accept());
await page.locator(`.members-table tr[data-member="${readerEmail}"] button:has-text("Transférer la propriété")`).click();
await page.waitForFunction(() => /est maintenant propriétaire/.test(document.querySelector(".members-notice")?.textContent || ""), null, { timeout: 10000 });
await page.waitForFunction(() => document.querySelector(".collab-role")?.textContent === "éditeur", null, { timeout: 10000 }).catch(() => {});
check("transfert de propriété : l'ancien propriétaire devient éditeur (plus de formulaire d'invitation), le membre devient propriétaire", (await page.locator(".collab-role").textContent()) === "éditeur" && (await page.locator(".members-invite").count()) === 0 && new RegExp(readerEmail).test(await page.locator('.members-table tr[data-member="owner"]').textContent()));
await page2.goto(`${projectUrl}?module=collaboration`);
await page2.waitForSelector(".members-invite", { timeout: 15000 });
check("nouveau propriétaire : « Votre rôle · propriétaire », formulaire d'invitation, ancien propriétaire listé éditeur", (await page2.locator(".collab-role").textContent()) === "propriétaire" && (await page2.locator(`.members-table tr[data-member="${email}"] select`).inputValue()) === "editeur");
page2.once("dialog", (d) => d.accept());
await page2.locator(`.members-table tr[data-member="${email}"] button:has-text("Transférer la propriété")`).click();
await page2.waitForFunction(() => /est maintenant propriétaire/.test(document.querySelector(".members-notice")?.textContent || ""), null, { timeout: 10000 });
await page2.waitForFunction(() => document.querySelector(".collab-role")?.textContent === "éditeur", null, { timeout: 10000 }).catch(() => {});
check("transfert retour : la propriété revient au premier compte, le second redevient éditeur", (await page2.locator(".collab-role").textContent()) === "éditeur");
await page2.goto(`${projectUrl}?module=collaboration`);
await page2.waitForSelector('.members-table button:has-text("Quitter le projet")', { timeout: 15000 });
await page2.locator('.members-table button:has-text("Quitter le projet")').click();
await page2.waitForURL(/\/projets$/, { timeout: 10000 });
await page2.waitForSelector("#project-list-heading");
await page2.waitForFunction(() => !document.querySelector(".shared-projects"), null, { timeout: 10000 }).catch(() => {}); // liste restaurée du cache puis relue
check("quitter le projet : retour à « Mes projets » sans projet partagé, accès retiré (404)", (await page2.locator(".shared-projects").count()) === 0 && (await page2.request.get(`${BASE}/projects/${testPid}`)).status() === 404);
await page.reload();
await page.waitForFunction(() => /Aucun membre invité/.test(document.querySelector(".members-table")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
check("propriétaire : plus aucun membre invité", /Aucun membre invité/.test(await page.locator(".members-table").textContent()));
await ctx2.close();

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
