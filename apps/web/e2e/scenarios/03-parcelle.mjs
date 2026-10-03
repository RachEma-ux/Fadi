/**
 * Scénario de bout en bout · 03-parcelle — Parcelle : outil Parcelle de l'étape 01, transmission au modèle, MapTiler.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 6c. Étape 01 de l'exemple et de la variante : outil Parcelle, conflit de borne, MapTiler. */
export async function etape01Exemple(sc) {
  const { BASE, OUT, page, check } = sc;
  const { parcelleHarmonie, exampleUrl, variantUrl, maptilerLog } = sc;
  let { h01 } = sc;
  // 6c. Étape 01 de l'exemple : outil Parcelle (fichier P.118 servi par Fadi), panneau de l'exemple dans sa colonne gauche (lecture) ;
  //     puis, sur la variante (copie modifiable), transmission au modèle et propositions de site modifiables.
  await page.goto(`${exampleUrl}?module=parcours&etape=1`);
  let h01ref = await parcelleHarmonie();
  await page.waitForTimeout(800);
  const parcelFrame = page.frameLocator(".parcelle-tool iframe");
  check("étape 01 : l'outil Parcelle ouvre le fichier P.118 du projet (« Fichier enregistré », 4 bornes)", (await parcelFrame.locator("#file-status").textContent()) === "Fichier enregistré" && (await parcelFrame.locator("#points-body tr").count()) === 4);
  check("étape 01 : « Mes parcelles » liste 118_officiel.kmz · P.118 · El Mansouria · 1 345,55 m²", (await parcelFrame.locator("#parcel-list-body").textContent()).replace(/[\u202f\u00a0]/g, " ").includes("1 345,55 m²"));
  check("étape 01 : parcelle liée au modèle", (await page.locator(".parcelle-status").textContent()).includes("Parcelle liée au modèle"));
  await h01ref.locator(".h7-panel > summary").click();
  await page.waitForTimeout(500);
  check("étape 01 (référence) : panneau de l'exemple dans la colonne de l'outil — « Harmonie · Site et paysage · 1 choix retenu(s) », schéma A, légende 15 / 50 / 25 / 10 %, tableau des zones, « Données de site déjà renseignées » (H-CONTEXTE…), carte MapTiler facultative", (await h01ref.locator(".h7-panel > summary").textContent()).includes("Site et paysage · 1 choix retenu(s)") && (await h01ref.locator(".h7-site-svg svg").count()) === 1 && /15 %.*50 %.*25 %.*10 %/s.test((await h01ref.locator(".h7-zones").textContent()).replace(/[\u202f\u00a0]/g, " ")) && (await h01ref.locator(".ex81-table").first().locator("tbody tr").count()) === 4 && /H-CONTEXTE/.test(await h01ref.locator(".ex81-fold").first().textContent()) && (await h01ref.locator('.h7-maptiler button:has-text("Afficher le fond MapTiler")').count()) === 1);
  await page.screenshot({ path: `${OUT}/01-desktop.png`, fullPage: true });
  // La variante (copie modifiable) : mêmes outils, panneau Harmonie généré (données du site, « Voir le schéma », MapTiler, arbitrages).
  const variantPid = variantUrl.split("/").pop();
  await page.goto(`${variantUrl}?module=parcours&etape=1`);
  h01 = await parcelleHarmonie();
  await page.waitForTimeout(800);
  await h01.locator(".h7-panel").evaluate((d) => { d.open = true; });
  check("variante étape 01 : « Harmonie · Site et paysage · 1 choix retenu(s) », schéma A, « Pourquoi ici » calculé sur la parcelle (approche B.265 → B.266, contexte arrière végétation)", (await h01.locator(".h7-panel > summary").textContent()).includes("Site et paysage · 1 choix retenu(s)") && (await h01.locator(".h7-site-svg svg").count()) === 1 && (await h01.locator(".h7-proposal").nth(0).locator("dd").nth(0).textContent()).includes("Approche étudiée depuis B.265 → B.266, hypothétique."));
  // Modifier une borne dans l'outil : l'outil enregistre, Fadi transmet → conflit (bâtiment déjà dessiné), modèle non déplacé
  await page.evaluate(() => document.querySelector(".parcelle-tool iframe").contentWindow.ParcelPanels.reveal("fold-vertices"));
  const borneX = parcelFrame.locator("#points-body tr").nth(0).locator('input[data-field="x"]');
  const borneBefore = await borneX.inputValue();
  await borneX.fill(String(Number(borneBefore) + 2));
  await borneX.dispatchEvent("change");
  await page.waitForFunction(() => /Conflit avec le bâtiment dessiné/.test(document.querySelector(".parcelle-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  check("variante étape 01 : borne déplacée → « Conflit avec le bâtiment dessiné » (motif du prototype)", (await page.locator(".v62-alert").textContent().catch(() => "")).includes("Les bornes diffèrent et un bâtiment est déjà dessiné"));
  const npAfterConflict = await page.evaluate(async (pid) => {
    const parcels = await (await fetch(`/projects/${pid}/parcels`, { credentials: "include" })).json();
    const store = await (await fetch(`/projects/${pid}/atelier/store`, { credentials: "include" })).json();
    return store.entries[`design.v13.project.${parcels.transmission.nativeId}.nativeParcel`]?.vertices?.[0]?.[0];
  }, variantPid);
  check("variante étape 01 : le modèle n'est pas déplacé par le conflit (B.266 inchangée)", Math.abs(npAfterConflict - 321946.82) < 1e-6, String(npAfterConflict));
  await borneX.fill(borneBefore);
  await borneX.dispatchEvent("change");
  await page.waitForFunction(() => /Parcelle liée au modèle/.test(document.querySelector(".parcelle-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  check("variante étape 01 : borne rétablie → parcelle de nouveau liée", (await page.locator(".parcelle-status").textContent()).includes("Parcelle liée au modèle") && (await page.locator(".v62-alert").count()) === 0);
  // Données du site : priorité « Séparation des mouvements » → proposition de départ C ; approche documentée sans source → refus
  await h01.locator(".h7-panel details.h7-fold").first().locator("> summary").click();
  await h01.locator(".h7-panel .h7-form select").nth(2).selectOption("service");
  await h01.locator('.h7-panel button:has-text("Enregistrer ces données")').click();
  await page.waitForFunction(() => /^C · Proposition de départ/.test(document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector(".h7-group")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
  check("variante étape 01 : priorité « Séparation des mouvements » → proposition de départ C", (await h01.locator(".h7-group").textContent()).startsWith("C · Proposition de départ — Votre priorité déclarée est la séparation des mouvements."));
  await h01.locator(".h7-panel .h7-form select").nth(1).selectOption("documented");
  await h01.locator(".h7-panel .h7-form input").nth(0).fill("");
  await h01.locator('.h7-panel button:has-text("Enregistrer ces données")').click();
  await h01.locator(".h7-panel .h7-error").first().waitFor({ timeout: 10000 }).catch(() => {});
  check("variante étape 01 : approche documentée sans source → refus du prototype affiché", (await h01.locator(".h7-panel .h7-error").first().textContent().catch(() => "")) === "Pour une approche documentée, choisissez son côté et indiquez sa source.");
  await h01.locator('.h7-proposal:nth-child(3) button:has-text("Voir le schéma")').click();
  await page.waitForTimeout(300);
  check("variante étape 01 : « Voir le schéma » affiche la variante C", (await h01.locator(".h7-site-hero h3").textContent()) === "Arrivées et desserte dissociées");
  // MapTiler à l'étape 01 : sans clé, puis clé de session saisie, fond satellite avec le contour source, altimétrie du centre et des sommets conservée comme donnée déclarée.
  await page.evaluate(() => sessionStorage.removeItem("fadi.maptiler.session-key"));
  const mapStatus = () => page.evaluate(() => document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector("#h7-map-status")?.textContent || "");
  await h01.locator('.h7-maptiler button:has-text("Afficher le fond MapTiler")').click();
  await page.waitForFunction(() => /Clé MapTiler absente/.test(document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector("#h7-map-status")?.textContent || ""), null, { timeout: 5000 });
  check("variante étape 01 : sans clé, « Afficher le fond MapTiler » → « Clé MapTiler absente … aucune image de contexte n’est inventée »", true);
  await h01.locator('.h7-maptiler button:has-text("Connexion MapTiler")').click();
  await h01.locator("#h7-map-key").fill("cle-de-test-scenario");
  await h01.locator('.h7-dialog-inline button:has-text("Utiliser cette clé")').click();
  await page.waitForFunction(() => /Clé disponible/.test(document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector("#h7-map-status")?.textContent || ""), null, { timeout: 5000 });
  await h01.locator('.h7-maptiler button:has-text("Afficher le fond MapTiler")').click();
  await h01.locator("#h7-map-host .h7-map-tiles img").first().waitFor({ timeout: 10000 });
  check("variante étape 01 : « Afficher le fond MapTiler » → mosaïque de tuiles demandée au service (clé de l'utilisateur), contour source B.265… et variante de site C (4 zones, hypothèse) en superposition, crédit MapTiler", (await h01.locator("#h7-map-host .h7-map-tiles img").count()) > 0 && (await h01.locator("#h7-map-host polygon").count()) >= 5 && /B\.26/.test(await h01.locator("#h7-map-host svg").textContent()) && /Hypothèse C · /.test(await h01.locator("#h7-map-host svg").textContent()) && /© MapTiler.*Superposition : variante C hypothétique/.test(await h01.locator(".h7-map-credit").textContent()) && maptilerLog.includes("/maps/satellite/256/tiles.json"), (await h01.locator(".h7-map-credit").textContent()).slice(0, 160));
  await h01.locator(".h7-maptiler").screenshot({ path: `${OUT}/01-desktop-maptiler.png` });
  await h01.locator('.h7-maptiler button:has-text("Collecter centre + sommets")').click();
  await page.waitForFunction(() => /points reçus · amplitude/.test(document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector("#h7-map-status")?.textContent || ""), null, { timeout: 10000 });
  const siteAfterCollect = (await (await page.request.get(`${BASE}/projects/${variantPid}/steps/1`)).json()).site;
  check("variante étape 01 : « Collecter centre + sommets » → 5 positions (centre + 4 bornes) conservées comme altimétrie de service (amplitude 4 m, non relevé topographique), « Pourquoi ici » cite l'amplitude", /^5 points reçus · amplitude 4 m/.test(await mapStatus()) && siteAfterCollect.observations.elevation.points.length === 5 && siteAfterCollect.observations.elevation.status === "Modèle de terrain · non relevé topographique" && /Altimétrie de service : amplitude 4 m/.test(await h01.locator(".h7-proposal").nth(0).locator("dd").nth(0).textContent()), await mapStatus());
}
