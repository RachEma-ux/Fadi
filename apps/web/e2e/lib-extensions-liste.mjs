// Liste « Outils » de la Planche : les extensions ajoutées se rangent dans le groupe « Extensions » (maquette du
// 27 novembre 2026). Avant d'atteindre la ligne d'une extension, ce groupe doit être déplié.
export async function deplierExtensions(page) {
  const groupe = page.locator('[data-planche-outils-liste] [data-outils-famille="extensions"]');
  await groupe.waitFor();
  if ((await groupe.getAttribute("aria-expanded")) !== "true") await groupe.click();
}

/** Tête (nom dépliable) de la ligne d'une extension ajoutée, groupe « Extensions » déplié. */
export async function teteExtension(page, id) {
  await deplierExtensions(page);
  const tete = page.locator(`[data-outils-extension-installee="${id}"] [data-outils-famille]`);
  await tete.waitFor();
  return tete;
}
