/**
 * Scénario de bout en bout · 04-programmation — Programmation : répartition, bibliothèque des bâtiments, dossier maître, liaisons au modèle.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 3. Étape 06 — répartition programmatique. */
export async function etape06Repartition(sc) {
  const { OUT, page, check } = sc;
  const { projectUrl } = sc;
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
}

/** 3b. Bibliothèque des bâtiments, « Utiliser ce scénario », programme lié. */
export async function bibliotheque(sc) {
  const { BASE, OUT, page, check, axeCheck } = sc;
  const { projectUrl } = sc;
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
  // Un champ texte déjà saisi (étape 04, f1) : l'application du scénario ne l'écrase pas, l'écart est conservé (« Écarts entre import et textes conservés »).
  const testPidEarly = projectUrl.split("/").pop();
  await page.request.patch(`${BASE}/projects/${testPidEarly}/steps/4`, { data: { fields: { f1: "Positionnement saisi à la main (avant le scénario)" } } });
  await page.locator('.bl-hero button:has-text("Utiliser ce scénario")').click();
  await page.waitForSelector("dialog.bl-dialog[open]");
  check("« Utiliser ce scénario » : destination « Projet actuel » proposée", (await page.locator('dialog select[name="destination"]').inputValue()) === "current");
  await axeCheck(page, "boîte de dialogue « Utiliser ce scénario »");
  await page.locator('dialog button:has-text("Appliquer le scénario")').click();
  await page.waitForURL(/etape=7/);
  await page.waitForSelector(".programme-case-editor");
  check("programme appliqué : « RÉPARTITION · DOSSIER MAÎTRE · RÉVISION 1 », Hôtellerie & hébergement → Hôtel urbain", /RÉVISION 1/.test(await page.locator(".programme-case-editor .bl-kicker").first().textContent()) && (await page.locator(".programme-case-editor h2").first().textContent()) === "Hôtellerie & hébergement → Hôtel urbain");
  await page.waitForFunction(() => (document.querySelector("#biz-f2")?.value || "").startsWith("[EXEMPLE / HYPOTHÈSE"), null, { timeout: 10000 }).catch(() => {});
  check("programme appliqué : textes générés dans l'étape 07 avec l'en-tête du prototype", (await page.inputValue("#biz-f2")).startsWith("[EXEMPLE / HYPOTHÈSE · Hôtel urbain de 32 chambres"));
  check("programme appliqué : bloc « Programme lié » dans l'étape", (await page.locator(".programme-transmission").count()) === 1);
  await page.screenshot({ path: `${OUT}/new-07-desktop-programme-applique.png`, fullPage: true });
  // « Écarts entre import et textes conservés » : le champ saisi est conservé, la proposition visible ; « Adopter cette proposition » ne remplace que ce champ, l'ancien texte est archivé.
  const conflictsText = (await page.locator(".programme-case-editor").textContent()).match(/\d+ champ\(s\) déjà saisi\(s\) conservé\(s\)/)?.[0] ?? "(aucun compteur)";
  check("programme appliqué : « N champ(s) déjà saisi(s) conservé(s) » dont l'étape 04 · f1, proposition de programme en face", /^\d+ champ/.test(conflictsText) && (await page.locator('.text-conflicts tr[data-conflict="4:f1"]').count()) === 1 && /Positionnement saisi à la main/.test(await page.locator('.text-conflicts tr[data-conflict="4:f1"] td:nth-child(2)').textContent()) && /^\[EXEMPLE \/ HYPOTHÈSE/.test(await page.locator('.text-conflicts tr[data-conflict="4:f1"] td:nth-child(3)').textContent()), conflictsText);
  await page.locator('.programme-case-editor details.bl-fold > summary:has-text("Consulter les différences")').click();
  await page.locator('.text-conflicts tr[data-conflict="4:f1"] button:has-text("Adopter cette proposition")').click();
  await page.waitForFunction(() => !document.querySelector('.text-conflicts tr[data-conflict="4:f1"]'), null, { timeout: 10000 });
  const adoptedStep4 = (await (await page.request.get(`${BASE}/projects/${testPidEarly}/steps/4`)).json()).content.fields.f1;
  const adoptedArchive = (await (await page.request.get(`${BASE}/projects/${testPidEarly}/archive`)).json()).project.programmeState.fieldHistory;
  check("« Adopter cette proposition » → étape 04 · f1 prend le texte proposé, l'ancien texte archivé (fieldHistory), l'écart disparaît", /^\[EXEMPLE \/ HYPOTHÈSE/.test(adoptedStep4) && adoptedArchive.length === 1 && adoptedArchive[0].current === "Positionnement saisi à la main (avant le scénario)" && (await page.locator('.text-conflicts tr[data-conflict="4:f1"]').count()) === 0, JSON.stringify({ adoptedStep4: adoptedStep4.slice(0, 40), archived: adoptedArchive.length }));
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
}

/** 6g. Référence protégée (étape 07), copie, liaisons au modèle, hypothèses, transfert surfacique. */
export async function referenceEtape07(sc) {
  const { OUT, page, check } = sc;
  const { exampleUrl, examplePid } = sc;
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
  await page.waitForSelector(".overview-step");
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
}

/** 6q. Bibliothèque, cas P.118 : « Ouvrir le modèle P.118 » (avec et sans l'exemple). */
export async function bibliothequeP118(sc) {
  const { BASE, browser, page, check } = sc;
  const { exampleUrl } = sc;
  // 6q. Bibliothèque, cas P.118 : « Ouvrir le modèle P.118 » (`openP118()`) ouvre le dossier source à l'étape 10 — la référence du compte, ou l'exemple importé d'abord.
  await page.goto(`${BASE}/bibliotheque/batiments/parcours_lot118`);
  await page.waitForSelector('.bl-hero button:has-text("Ouvrir le modèle P.118")', { timeout: 30000 });
  await page.locator('.bl-hero button:has-text("Ouvrir le modèle P.118")').click();
  await page.waitForURL((u) => u.toString().startsWith(`${exampleUrl}?module=parcours&etape=10`), { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#atelier-toolbar")?.getAttribute("data-ready") === "1", null, { timeout: 30000 });
  check("bibliothèque · cas P.118 : « Ouvrir le modèle P.118 » → référence de l'exemple du compte, étape 10, Atelier monté", page.url().startsWith(`${exampleUrl}?module=parcours&etape=10`) && (await page.locator(".native-atelier #viewer-info").count()) === 1);
  await page.goto(`${BASE}/bibliotheque/batiments/parcours_lot118?rubrique=technique`);
  await page.waitForSelector('section[role=tabpanel] button:has-text("Ouvrir le modèle P.118")', { timeout: 30000 });
  check("bibliothèque · cas P.118, rubrique Technique : « P.118 conserve ses polygones réels » et « Ouvrir le modèle P.118 » à la place du gabarit", /P\.118 conserve ses polygones réels/.test(await page.locator("section[role=tabpanel]").textContent()) && (await page.locator("section[role=tabpanel] svg").count()) === 0);
  // Un compte sans l'exemple : l'exemple est importé puis ouvert (« Dossier source absent » n'arrive pas).
  const ctxFresh = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageFresh = await ctxFresh.newPage();
  await pageFresh.goto(`${BASE}/inscription`);
  await pageFresh.fill('input[name="email"]', `fresh-${Date.now()}@example.com`);
  await pageFresh.fill('input[name="password"]', "scenario-pass-123");
  await pageFresh.click('button[type="submit"]');
  await pageFresh.waitForURL(/\/(projets|accueil)/);
  // Accueil d'un compte sans projet : l'exemple P.118 s'importe d'un geste (bouton avec suivi), avant « Créer mon premier projet ».
  await pageFresh.goto(`${BASE}/accueil`);
  await pageFresh.waitForSelector(".home-empty-state", { timeout: 20000 });
  check("accueil sans projet : « Importer l’exemple P.118 et l’ouvrir » proposé en premier, puis « Créer mon premier projet »", (await pageFresh.locator('.home-empty-state button:has-text("Importer l’exemple P.118 et l’ouvrir")').count()) === 1 && (await pageFresh.locator('.home-empty-state a:has-text("Créer mon premier projet")').count()) === 1);
  await pageFresh.goto(`${BASE}/bibliotheque/batiments/parcours_lot118`);
  await pageFresh.waitForSelector('.bl-hero button:has-text("Ouvrir le modèle P.118")', { timeout: 30000 });
  await pageFresh.locator('.bl-hero button:has-text("Ouvrir le modèle P.118")').click();
  await pageFresh.waitForURL(/\/projets\/proj_[^?]+\?module=parcours&etape=10/, { timeout: 60000 });
  const freshToast = await pageFresh.waitForFunction(() => /Exemple P\.118 importé/.test(document.querySelector(".h7-toast")?.textContent || ""), null, { timeout: 8000 }).then(() => true).catch(() => false); // s'efface de lui-même après 3,6 s
  await pageFresh.waitForSelector(".project-header h1", { timeout: 30000, state: "attached" }); // étape 10 : page de l'Atelier, en-tête de Fadi effacé
  await pageFresh.waitForFunction(() => document.querySelector("#atelier-toolbar")?.getAttribute("data-ready") === "1", null, { timeout: 30000 });
  check("bibliothèque · cas P.118 sans l'exemple dans le compte : l'exemple est importé puis ouvert à l'étape 10, Atelier monté (toast « Exemple P.118 importé »)", (await pageFresh.locator(".project-header h1").textContent()) === "P.118 — Escalier B et mezzanine" && (await pageFresh.locator(".native-atelier #viewer-info").count()) === 1, freshToast ? "toast vu" : "toast non observé (effacé avant la lecture)");
  await ctxFresh.close();
}
