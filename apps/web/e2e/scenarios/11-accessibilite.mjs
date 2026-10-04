/**
 * Scénario de bout en bout · 11-accessibilite — Accessibilité : axe-core (WCAG 2.2 AA) sur chaque écran, clavier, rapport de l'outil Parcelle.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 6n. Accessibilité (axe-core, WCAG 2.2 AA), clavier de la barre d'outils, rapport de l'outil Parcelle. */
export async function ecrans(sc) {
  const { BASE, AXE_SCRIPT, browser, page, check, axeCheck } = sc;
  const { exampleUrl, variantUrl, atelierUrl } = sc;
  // 6n. Accessibilité : chaque écran de l'application, ordinateur puis téléphone (axe-core, WCAG 2.2 AA).
  const a11yScreens = [
    ["projets", `${BASE}/projets`, "#project-list-heading"],
    ["accueil", `${BASE}/accueil`, ".home-page"],
    ["harmonie", `${BASE}/harmonie`, "main"],
    ["paramètres", `${BASE}/parametres`, "main"],
    ["vue d'ensemble", `${exampleUrl}?module=parcours`, ".overview-step"],
    ["étape 01", `${exampleUrl}?module=parcours&etape=1`, ".h7-site-hero"],
    ["étape 02", `${exampleUrl}?module=parcours&etape=2`, ".reference-answers"],
    ["étape 02 (variante, formulaire)", `${variantUrl}?module=parcours&etape=2`, "#biz-f1"],
    ["étape 06", `${exampleUrl}?module=parcours&etape=6`, ".programme-case"],
    ["étape 10", `${exampleUrl}?module=parcours&etape=10`, '.nouvel-atelier [data-testid="plan2d-toile"]'],
    ["étape 14", `${exampleUrl}?module=parcours&etape=14`, ".reference-answers .ex81-budget"],
    ["étape 14 (variante, formulaire)", `${variantUrl}?module=parcours&etape=14`, ".biz-kpis"],
    ["étape 17 (variante)", `${variantUrl}?module=parcours&etape=17`, ".biz-kpi"],
    ["étape 19", `${exampleUrl}?module=parcours&etape=19`, ".reference-answers"],
    ["étape 19 (variante, décision)", `${variantUrl}?module=parcours&etape=19`, ".decision-grid"],
    ["programmation", `${exampleUrl}?module=programmation`, ".programme-case"],
    ["atelier", `${exampleUrl}?module=atelier`, '.nouvel-atelier [data-testid="plan2d-toile"]'],
    ["analyses", `${exampleUrl}?module=analyses`, ".analyses-checks"],
    ["documents", `${exampleUrl}?module=documents`, ".documents-table"],
    ["collaboration", `${exampleUrl}?module=collaboration`, ".members-panel"],
    ["bibliothèque", `${BASE}/bibliotheque/batiments`, ".bl-case-card"],
    ["cas Hôtel urbain", `${BASE}/bibliotheque/batiments/hotel`, ".bl-scenario"],
  ];
  const viewports = [
    [1280, 900, "ordinateur"],
    [390, 844, "téléphone"],
  ];
  for (const [width, height, device] of viewports) {
    await page.setViewportSize({ width, height });
    for (const [name, url, ready] of a11yScreens) {
      await page.goto(url);
      await page.waitForSelector(ready, { state: "attached", timeout: 30000 });
      await page.waitForTimeout(400);
      await axeCheck(page, `${name} (${device})`);
    }
  }
  // Pages publiques (hors session) : connexion et inscription.
  const ctxAnon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageAnon = await ctxAnon.newPage();
  for (const [width, height, device] of viewports) {
    await pageAnon.setViewportSize({ width, height });
    for (const [name, url] of [
      ["connexion", `${BASE}/connexion`],
      ["inscription", `${BASE}/inscription`],
    ]) {
      await pageAnon.goto(url);
      await pageAnon.waitForSelector('.auth-page button[type="submit"]', { timeout: 30000 });
      await axeCheck(pageAnon, `${name} (${device})`);
    }
  }
  await ctxAnon.close();
  // Au-delà des règles automatisables : clavier dans l'Atelier (raccourci d'outil depuis la zone de plan, Échap rend la
  // sélection), et audit axe du document de l'outil Parcelle (prototype conservé tel quel) — à titre de rapport, non
  // bloquant : ses écarts sont ceux du prototype, listés ici pour la revue manuelle (clavier, toucher, zoom) que
  // l'automatisation ne remplace pas.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${atelierUrl}?module=atelier`);
  await page.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
  await page.locator('[data-testid="plan2d-toile"]').focus();
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Mur"), null, { timeout: 5000 }).catch(() => null);
  const outilClavier = await page.locator('[data-testid="atl-puce-outil"]').textContent();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Sélection"), null, { timeout: 5000 }).catch(() => null);
  const outilApres = await page.locator('[data-testid="atl-puce-outil"]').textContent();
  check("clavier · Atelier : M depuis la zone de plan → outil Mur actif, Échap → retour à la sélection (focus conservé dans la zone)", /Mur/.test(outilClavier ?? "") && /Sélection/.test(outilApres ?? "") && (await page.evaluate(() => !!document.activeElement?.closest('[data-testid="plan2d-zone"]'))), `${outilClavier} → ${outilApres}`);
  await page.goto(`${exampleUrl}?module=parcours&etape=1`);
  await page.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready, null, { timeout: 30000 });
  const parcelleFrame = page.frames().find((f) => /\/parcelle\//.test(f.url()));
  if (parcelleFrame) {
    await parcelleFrame.addScriptTag({ path: AXE_SCRIPT });
    const parcelleAxe = await parcelleFrame.evaluate(async () => {
      const r = await window.axe.run(document, { iframes: false, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return r.violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length}`);
    });
    console.log(`ℹ accessibilité · document de l'outil Parcelle (prototype conservé tel quel, rapport non bloquant) : ${parcelleAxe.length ? parcelleAxe.join(" ; ") : "aucune violation"}`);
  }
}
