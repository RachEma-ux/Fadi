/**
 * Scénario de bout en bout · 02-parcours-etapes — Parcours : les 21 étapes (projet vierge, saisies, décisions, présentation téléphone).
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 1. Nouveau projet → vue d'ensemble (21 cartes, 0 / 21). */
export async function nouveauProjet(sc) {
  const { BASE, OUT, page, check } = sc;
  // 1. Nouveau projet
  await page.goto(`${BASE}/projets`);
  await page.fill("#project-code", "P.TEST");
  await page.fill("#project-name", "Étude test migration");
  await page.locator('button[type="submit"]:has-text("Créer")').first().click();
  await page.locator('.project-list a:has-text("Étude test migration")').first().click();
  await page.waitForURL(/\/projets\/proj_/);
  const projectUrl = page.url().split("?")[0];
  await page.waitForSelector(".overview-step");
  check("vue d'ensemble : 21 cartes", (await page.locator(".overview-step").count()) === 21);
  check("progression initiale 0 / 21", (await page.locator(".parcours-steps-summary").textContent()).includes("0 / 21"));
  await page.screenshot({ path: `${OUT}/new-00-overview-desktop.png`, fullPage: true });
  Object.assign(sc, { projectUrl });
}

/** 4. Étape 14 — chiffrage, KPI, valeurs conservées après rechargement. */
export async function etape14Finance(sc) {
  const { OUT, page, check } = sc;
  const { projectUrl } = sc;
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
}

/** 5. Étapes 17 et 19, « Marquer terminée », rétrogradation du GO. */
export async function etapes17et19(sc) {
  const { OUT, page, check } = sc;
  const { projectUrl } = sc;
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
}

/** 7. Téléphone (390 px) : présentation mobile, remontée en haut de page, étape 10. */
export async function telephone(sc) {
  const { BASE, OUT, page, check } = sc;
  const { projectUrl, exampleUrl } = sc;
  // 7. Téléphone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${projectUrl}?module=parcours`);
  await page.waitForSelector(".overview-step");
  await page.screenshot({ path: `${OUT}/new-00-overview-mobile.png`, fullPage: true });
  // Présentation mobile du prototype : bandeau « Parcours du projet », grille des 21 étapes sur 3 colonnes qui défile horizontalement (`overview-grid`, 145 px minimum par colonne), en-tête de projet et recherche effacés.
  check("téléphone : bandeau « Parcours du projet » en tête, barre de navigation, en-tête de projet et recherche de Fadi effacés (rangée des modules conservée), grille 3 colonnes à défilement horizontal (cartes du prototype)", (await page.locator(".atelier-stage-header .atelier-stage-title").textContent()) === "Parcours du projet" && !(await page.locator(".project-header").isVisible()) && !(await page.locator(".app-topbar").isVisible()) && !(await page.locator(".app-sidebar").isVisible()) && (await page.locator(".module-nav").isVisible()) && (await page.locator(".overview-grid").evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length === 3 && g.scrollWidth > g.clientWidth)) && (await page.locator(".overview-step").count()) === 21);
  // Remontée en haut de page à chaque changement de vue, comme `goto()` / `study()` / `overview()` du prototype : une étape ouverte depuis
  // le bas de la grille, « Suivante → » et « ← » repartent du bandeau (sans cela, la page restait au défilement de la grille).
  const atTop = () => page.evaluate(() => window.scrollY === 0 && document.querySelector(".atelier-stage-header").getBoundingClientRect().top >= 0);
  const card17 = page.locator(".overview-step").nth(16);
  await card17.scrollIntoViewIfNeeded();
  const scrolledBeforeTap = await page.evaluate(() => window.scrollY > 300);
  await card17.click();
  await page.waitForFunction(() => document.querySelector(".top-stage")?.textContent?.includes("ÉTAPE 17"));
  await page.waitForTimeout(200);
  const topAfterCard = await atTop();
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.locator('button:has-text("Suivante →")').first().click();
  await page.waitForFunction(() => document.querySelector(".top-stage")?.textContent?.includes("ÉTAPE 18"));
  await page.waitForTimeout(200);
  const topAfterNext = await atTop();
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.locator(".workflow-back").click();
  await page.waitForSelector(".overview-step");
  await page.waitForTimeout(200);
  check("téléphone : étape ouverte depuis le bas de la grille, « Suivante → », « ← » → page remontée en haut, bandeau visible (goto() / study() / overview() du prototype)", scrolledBeforeTap && topAfterCard && topAfterNext && (await atTop()), `grille défilée : ${scrolledBeforeTap}, étape : ${topAfterCard}, suivante : ${topAfterNext}`);
  await page.goto(`${projectUrl}?module=parcours&etape=6`);
  await page.waitForSelector(".programme-case-editor");
  await page.screenshot({ path: `${OUT}/new-06-mobile.png`, fullPage: true });
  check("téléphone : étape 06 avec programme appliqué sans défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.goto(`${BASE}/bibliotheque/batiments/hotel?projet=${encodeURIComponent(projectUrl.split("/").pop())}`);
  await page.waitForSelector(".bl-scenario");
  await page.screenshot({ path: `${OUT}/bibliotheque-batiments-hotel-mobile.png`, fullPage: true });
  check("téléphone : bibliothèque sans défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.goto(`${exampleUrl}?module=parcours&etape=2`);
  await page.waitForSelector(".reference-answers");
  await page.screenshot({ path: `${OUT}/02-mobile.png`, fullPage: true });
  await page.goto(`${exampleUrl}?module=parcours&etape=1`);
  await page.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-mobile.png`, fullPage: true });
  const noHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("téléphone : pas de défilement horizontal", noHorizontalScroll);
  // Étape 10 sur téléphone : la page est l'Atelier Architectural (bandeau, outils, zone de plan), enveloppe effacée.
  await page.goto(`${exampleUrl}?module=parcours&etape=10`);
  await page.waitForSelector('.nouvel-atelier [data-testid="plan2d-toile"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/10-mobile.png`, fullPage: false });
  check("téléphone étape 10 : disposition téléphone de l'Atelier, indicateur permanent de l'outil actif (« Sélection ») et onglets des repères", (await page.locator(".nouvel-atelier .atl.atl-tel").count()) === 1 && /Sélection/.test((await page.locator('[data-testid="atl-puce-outil"]').textContent().catch(() => "")) || "") && (await page.locator(".atl-tel-outils").count()) === 1, await page.locator('[data-testid="atl-puce-outil"]').textContent().catch(() => "absent"));
  check("téléphone étape 10 : bandeau « Atelier Architectural · ÉTAPE 10 / 21 · Concevoir / Tester », enveloppe effacée, dessin sur toute la largeur", (await page.locator(".atelier-stage-title").textContent()) === "Atelier Architectural" && (await page.locator(".top-stage").textContent()) === "ÉTAPE 10 / 21 · Concevoir / Tester" && (await page.evaluate(() => document.body.classList.contains("atelier-immersive"))) && !(await page.locator(".module-nav").isVisible()) && (await page.locator(".nouvel-atelier").evaluate((e) => Math.round(e.getBoundingClientRect().width))) >= 380);
}
