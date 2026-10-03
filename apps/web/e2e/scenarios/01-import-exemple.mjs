/**
 * Scénario de bout en bout · 01-import-exemple — Import de l'exemple P.118 et lecture de la référence protégée.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 6. Import de l'exemple P.118 (21 / 21). */
export async function importExemple(sc) {
  const { BASE, page, check, measure } = sc;
  // 6. Exemple P.118 importé
  await page.goto(`${BASE}/projets`);
  await page.waitForSelector('.example-card button:has-text("Importer")');
  let importProgressSeen = false;
  await measure("import de l'exemple P.118 → vue d'ensemble affichée", async () => {
    await page.locator('.example-card button:has-text("Importer")').first().click();
    importProgressSeen = await page.waitForSelector(".example-card-progress", { timeout: 3000 }).then(() => true).catch(() => false);
    await page.waitForURL(/\/projets\/proj_/);
    await page.waitForSelector(".parcours-steps-summary");
  });
  const exampleUrl = page.url().split("?")[0];
  const importToastSeen = await page.waitForFunction(() => /Exemple importé : votre copie/.test(document.querySelector(".h7-toast")?.textContent || ""), null, { timeout: 5000 }).then(() => true).catch(() => false);
  check("import de l'exemple : état « Import en cours… » visible sur la carte pendant la copie, puis message « Exemple importé : votre copie … est prête »", importProgressSeen, importToastSeen ? "toast vu" : "toast non observé (effacé avant la lecture)");
  check("exemple : 21 / 21 étapes terminées", (await page.locator(".parcours-steps-summary").textContent()).includes("21 / 21"));
  Object.assign(sc, { exampleUrl });
}

/** Exemple importé : documents de base, étapes 02 / 06 / 14 de la référence, variante en copie. */
export async function exempleEtapes(sc) {
  const { OUT, page, check, measure } = sc;
  const { exampleUrl } = sc;
  await page.goto(exampleUrl);
  await page.waitForSelector(".parcours-steps-summary");
  await page.waitForSelector(".seed888", { timeout: 10000 });
  const [kmzDl] = await Promise.all([page.waitForEvent("download"), page.locator('.seed888 a:has-text("118_officiel.kmz")').click()]);
  const kmzBytes = await (await import("node:fs/promises")).readFile(await kmzDl.path());
  check("exemple : « Documents de base intégrés » (118_officiel.kmz, ZONE-I-5.pdf, scénario étudié) → KMZ téléchargé intact (881 142 octets, archive zip)", (await page.locator(".seed888 a").allTextContents()).join(",") === "118_officiel.kmz,ZONE-I-5.pdf" && /Scénario étudié : P\.118/.test(await page.locator(".seed888 p").textContent()) && kmzBytes.length === 881142 && kmzBytes.subarray(0, 2).toString("latin1") === "PK");
  await measure("ouverture de l'étape 02 de l'exemple (réponses renseignées, panneau Harmonie de l'exemple)", async () => {
    await page.goto(`${exampleUrl}?module=parcours&etape=2`);
    await page.waitForSelector(".reference-answers");
    await page.waitForSelector(".h7-panel-reference");
  });
  check("exemple étape 02 : bandeau « Parcours du projet · ÉTAPE 02 / 21 · Comprendre le site » avec « ◈ Harmonie de l’étape », « ← », « ⌂ » ; « Harmonie · Site constructible · 1 choix retenu(s) »", (await page.locator(".atelier-stage-header .top-stage").textContent()) === "ÉTAPE 02 / 21 · Comprendre le site" && (await page.locator("#h7-shortcut").count()) === 1 && (await page.locator(".h7-panel > summary").textContent()).includes("Site constructible · 1 choix retenu(s)"));
  check("exemple étape 02 (référence) : « Réponses renseignées · 02 », 12 rubriques en lecture, f1 nommant sa nature (`bookBlock` du prototype)", (await page.locator(".reference-answers h2").textContent()) === "Réponses renseignées · 02" && (await page.locator(".reference-answers .ex81-answers > div").count()) === 12 && (await page.locator(".reference-answers dd").first().textContent()).startsWith("[DONNÉE / CALCUL DU FICHIER SOURCE]") && (await page.locator("#biz-f1").count()) === 0);
  await page.locator("#h7-shortcut").click();
  await page.waitForFunction(() => document.querySelector(".h7-panel-reference")?.open, null, { timeout: 5000 });
  check("« ◈ Harmonie de l’étape » → panneau de l'exemple ouvert : onglets « Choix illustré / Alternatives expliquées / Intentions reçues / transmises »", (await page.locator(".h7-panel-reference .h7-tabs button").allTextContents()).join("|") === "Choix illustré|Alternatives expliquées|Intentions reçues / transmises");
  // Récit de l'exemple (`storyHTML` du prototype, en-tête du panneau) : étiquette, titre, décision, trois actions, cadre de démonstration, choix déjà arbitré ; référence : « Étape illustrée ✓ ».
  const storyActions = await page.locator(".ex81-story .ex81-actions > *").allTextContents();
  check("exemple étape 02 : récit « EXEMPLE RÉSOLU · 02 / 21 », actions « Voir le choix Harmonie et sa transmission » / « Essayer une variante en copie » / « Dossier complet de l’exemple », pli « Cadre de démonstration et hypothèses », « CHOIX A · DÉJÀ ARBITRÉ »", (await page.locator(".ex81-story > .ex81-tag").textContent()) === "EXEMPLE RÉSOLU · 02 / 21" && storyActions.join("|") === "Voir le choix Harmonie et sa transmission|Essayer une variante en copie|Dossier complet de l’exemple" && (await page.locator(".ex81-frame > summary").textContent()) === "Cadre de démonstration et hypothèses" && (await page.locator(".ex81-selected .ex81-tag").textContent()) === "CHOIX A · DÉJÀ ARBITRÉ", storyActions.join("|"));
  check("exemple (référence) : « Étape illustrée ✓ », inactif", (await page.locator(".step-detail-nav .step-done").textContent()) === "Étape illustrée ✓" && (await page.locator(".step-detail-nav .step-done").isDisabled()));
  await page.screenshot({ path: `${OUT}/02-desktop.png`, fullPage: true });
  // « Alternatives expliquées » : le parti illustré « Retenue dans l’exemple », les autres « Écartée pour cet exemple » avec les alternatives pour motif (arbitrages rejoués à l'import).
  await page.locator('.h7-panel-reference .h7-tabs button[data-tab="compare"]').click();
  const compareRows = await page.locator(".h7-panel-reference .h7-tab-content .ex81-table tbody tr").allTextContents();
  check("exemple étape 02 : « Alternatives expliquées » — A « Retenue dans l’exemple », B et C « Écartée pour cet exemple · Alternative non retenue dans ce scénario »", compareRows.length === 3 && /^A.*Retenue dans l’exemple/.test(compareRows[0]) && /Écartée pour cet exemple.*Alternative non retenue dans ce scénario/.test(compareRows[1]) && /Écartée pour cet exemple/.test(compareRows[2]), compareRows.map((r) => r.slice(0, 60)).join(" | "));
  await page.locator('.ex81-actions button:has-text("Voir le choix Harmonie et sa transmission")').click();
  await page.waitForFunction(() => document.querySelector(".h7-panel")?.open && document.querySelector('.h7-tabs button[data-tab="transfer"]')?.getAttribute("aria-pressed") === "true" && document.activeElement?.getAttribute("data-tab") === "transfer", null, { timeout: 5000 }).catch(() => {});
  check("« Voir le choix Harmonie et sa transmission » → onglet « Intentions reçues / transmises » focalisé : intention de l'étape 01 (texte = décision du récit de 01, bouton d'origine), choix H01-A transmis avec ses destinations", (await page.evaluate(() => document.activeElement?.getAttribute("data-tab"))) === "transfer" && (await page.locator(".h7-panel-reference .h7-tab-content").textContent()).includes("H01-A") && (await page.locator('.h7-panel-reference .h7-tab-content .ex81-goto:has-text("01 · Parcelle / Site existant")').count()) >= 1);
  const [dossierDl] = await Promise.all([page.waitForEvent("download"), page.locator('.ex81-actions a:has-text("Dossier complet de l’exemple")').click()]);
  const dossierHtml = await (await import("node:fs/promises")).readFile(await dossierDl.path(), "utf8");
  check("« Dossier complet de l’exemple » → P118_Exemple_Resolu_V8_19.html : 21 étapes avec réponses et traces, budget, bilan du bâtiment dessiné, registre des hypothèses", dossierDl.suggestedFilename() === "P118_Exemple_Resolu_V8_19.html" && (dossierHtml.match(/<section class="ex81-report-step">/g) || []).length === 21 && /EXEMPLE ENTIÈREMENT RENSEIGNÉ/.test(dossierHtml) && /Scénario défavorable/.test(dossierHtml) && /BILAN HARMONIE · BÂTIMENT DESSINÉ/.test(dossierHtml) && /Registre des hypothèses/.test(dossierHtml), `${dossierDl.suggestedFilename()} · ${dossierHtml.length} caractères`);
  await page.goto(`${exampleUrl}?module=parcours&etape=6`);
  await page.waitForSelector(".programme-case");
  check("exemple étape 06 : répartition liée au modèle (1 366,02 m²)", (await page.locator(".programme-case").textContent()).replace(/ | /g, " ").includes("1 366,02 m²"));
  await page.screenshot({ path: `${OUT}/06-desktop.png`, fullPage: true });
  await page.goto(`${exampleUrl}?module=parcours&etape=14`);
  await page.waitForSelector(".reference-answers .ex81-budget");
  // Référence : « Réponses renseignées · 14 » en lecture (pas de formulaire ni de KPI de saisie), avec le budget du scénario (`bookBlock` + `budgetHTML`) :
  // référence et scénario défavorable calculés sur les réponses des étapes 14 / 15 — les montants que l'exemple énonce lui-même.
  check("exemple étape 14 (référence) : réponses en lecture, montants importés (Foncier / acquisition : 3 200 000), pas de formulaire", (await page.locator(".reference-answers h2").textContent()) === "Réponses renseignées · 14" && (await page.locator(".reference-answers dd").first().textContent()).replace(/[\u202f\u00a0]/g, " ") === "3 200 000" && (await page.locator(".biz-kpis").count()) === 0);
  const budgetText = (await page.locator(".reference-answers .ex81-budget").textContent()).replace(/[\u202f\u00a0]/g, " ");
  check("exemple étape 14 : budget du scénario — Investissement 24 000 000 → 26 400 000 MAD (scénario défavorable), « Décision du cas : … 2 400 000 MAD de besoin additionnel »", /Investissement24 000 000 MAD26 400 000 MAD/.test(budgetText) && /Décision du cas : le stress de CAPEX crée 2 400 000 MAD de besoin additionnel/.test(budgetText), budgetText.slice(0, 160));
  await page.screenshot({ path: `${OUT}/14-desktop-exemple.png`, fullPage: true });
  // « Essayer une variante en copie » (`copy()` du prototype, action du récit dans le panneau de l'exemple) : nouveau projet modifiable « P.118 — ma variante de l’exemple résolu », vue d'ensemble, l'original intact.
  await page.locator("#h7-shortcut").click();
  await page.waitForFunction(() => document.querySelector(".h7-panel-reference")?.open, null, { timeout: 5000 });
  await page.locator('.ex81-actions button:has-text("Essayer une variante en copie")').click();
  await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().startsWith(exampleUrl), { timeout: 30000 });
  await page.waitForSelector(".parcours-steps-summary");
  const variantUrl = page.url().split("?")[0];
  const variantToast = await page.locator(".h7-toast").textContent().catch(() => "");
  check("« Essayer une variante en copie » → « P.118 — ma variante de l’exemple résolu » ouverte (21 / 21 étapes terminées), message de copie", (await page.locator(".project-header h1").textContent()) === "P.118 — ma variante de l’exemple résolu" && (await page.locator(".parcours-steps-summary").textContent()).includes("21 / 21 étapes terminées"), variantToast);
  await page.goto(`${variantUrl}?module=parcours&etape=14`);
  await page.waitForSelector(".biz-kpis");
  check("variante étape 14 : formulaire modifiable, KPI calculés depuis les montants importés (24 000 000)", (await page.locator(".biz-kpis").textContent()).replace(/[\u202f\u00a0]/g, " ").includes("24 000 000") && (await page.locator("#biz-f1").count()) === 1);
  await page.goto(`${variantUrl}?module=parcours&etape=2`);
  await page.waitForSelector("#biz-f1");
  check("variante : « Terminée ✓ » actif (copie modifiable), formulaire et panneau Harmonie générés — pas de récit (présentation du prototype pour une copie) ; l'original reste la référence", (await page.locator(".step-detail-nav .step-done").textContent()) === "Terminée ✓" && !(await page.locator(".step-detail-nav .step-done").isDisabled()) && (await page.locator(".ex81-story").count()) === 0 && (await page.locator(".h7-panel:not(.h7-panel-reference)").count()) === 1 && (await page.evaluate(async (pid) => (await (await fetch(`/projects/${pid}`, { credentials: "include" })).json()).exampleMode, exampleUrl.split("/").pop())) === "reference");
  Object.assign(sc, { variantUrl });
}
