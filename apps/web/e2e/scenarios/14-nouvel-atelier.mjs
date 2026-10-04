/**
 * Scénario de bout en bout · 14-nouvel-atelier — Nouvel Atelier (lot 3a) : ouverture sur P.118 importé dans le modèle
 * typé, cinq repères, zone de plan, accessibilité (axe-core, WCAG 2.2 AA) sur ordinateur et téléphone 390 px.
 *
 * Propriétaire : chef de projet (L3a.4, matrice de propriété du lot 3a). L'ordre d'exécution et l'état partagé entre
 * segments sont décrits dans `../run.mjs`. Les gestes d'acceptation du lot (mur, porte, pièce, type, annuler /
 * rétablir, second navigateur) s'ajoutent quand les objets d'architecture (L3a.3) sont intégrés.
 */

/** Ouverture du nouvel Atelier par `?module=atelier&version=nouveau` sur l'exemple P.118. */
export async function ouverture(sc) {
  const { page, check, measure, axeCheck } = sc;
  const { exampleUrl } = sc;
  const url = `${exampleUrl}?module=atelier&version=nouveau`;
  await page.setViewportSize({ width: 1280, height: 900 });
  await measure("ouverture du nouvel Atelier (modèle typé P.118, interface, zone de plan)", async () => {
    await page.goto(url);
    await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="plan2d-svg"]', { state: "attached", timeout: 30000 });
  });
  await page.waitForTimeout(600);
  check("nouvel atelier : interface montée, pas d'erreur d'ouverture", (await page.locator('[data-testid="nouvel-atelier-erreur"]').count()) === 0);
  const niveaux = await page.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').count();
  check("nouvel atelier : les 6 niveaux de P.118 dans le navigateur", niveaux === 6, `${niveaux} niveaux`);
  check("nouvel atelier : zone de plan affichée", await page.locator('[data-testid="plan2d-zone"]').isVisible());
  check("nouvel atelier : l'ancien Atelier n'est pas monté", (await page.locator("#atelier-toolbar").count()) === 0);
  for (const [width, height, device] of [
    [1280, 900, "ordinateur"],
    [390, 844, "téléphone"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await axeCheck(page, `nouvel atelier (${device})`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
