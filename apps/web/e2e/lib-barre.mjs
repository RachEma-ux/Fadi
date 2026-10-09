/**
 * Aides communes des recettes pour la barre de l'Atelier (D-195) : Fichier · Plan · 3D · Documents · Planche · ⚙ · état.
 * Exporter / Importer sont des sous-menus de Fichier ; affichage, accrochages et Canevas sont sous ⚙ ; un clic sur
 * Plan active le mode ET ouvre la liste des niveaux (Échap la referme sans rien changer).
 */
export const fermerMenus = (page) =>
  page.evaluate(() => {
    for (const d of document.querySelectorAll(".atelier-n-barre details[open]")) d.removeAttribute("open");
  });
export const ouvrirFichier = async (page) => {
  if (!(await page.locator("[data-menu-principal][open]").count())) await page.locator("[data-menu-principal] > summary").first().click();
};
export const ouvrirExports = async (page) => {
  await ouvrirFichier(page);
  if (!(await page.locator(".barre-exports[open]").count())) await page.locator(".barre-exports > summary").click();
};
export const ouvrirImports = async (page) => {
  await ouvrirFichier(page);
  if (!(await page.locator(".barre-imports[open]").count())) await page.locator(".barre-imports > summary").click();
};
export const ouvrirReglages = async (page) => {
  if (!(await page.locator("[data-reglages][open]").count())) await page.locator("[data-reglages] > summary").click();
};
export const basculerCanevas = async (page) => {
  await ouvrirReglages(page);
  await page.locator("[data-disposition-canevas]").click();
  await fermerMenus(page);
};
/** Plan : un clic active le mode et ouvre la liste des niveaux ; Échap la referme sans rien changer. */
export const allerEnPlan = async (page) => {
  await page.locator('.barre-mode button:text-is("Plan")').click();
  await page.keyboard.press("Escape");
};
/** Choisir un niveau depuis le bouton Plan (ouvre la liste, clique le niveau ; la liste se referme). */
export const choisirNiveau = async (page, niveauId) => {
  await page.locator('.barre-mode button:text-is("Plan")').click();
  await page.locator(`[data-plan-niveau="${niveauId}"]`).click();
};
/** Niveau d'affichage des outils (Essentiel / Contextuel / Complet) : sous la roue ⚙ depuis D-195. */
export const choisirAffichage = async (page, niveau) => {
  await ouvrirReglages(page);
  await page.locator('select[aria-label="Niveau d\'affichage des outils"]').selectOption(niveau);
  await fermerMenus(page);
};
