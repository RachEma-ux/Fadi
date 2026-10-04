/**
 * Scénario de bout en bout · 06-harmonie — Harmonie : panneaux par étape, sous-page du bâtiment, bilan, péremption, page transversale.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 1b. Étape 01 d'un projet vierge : panneau Harmonie dans l'outil Parcelle. */
export async function etape01Vierge(sc) {
  const { OUT, page, check } = sc;
  const { projectUrl } = sc;
  // 1b. Étape 01 d'un projet vierge : outil Parcelle vide, trois propositions de site sans schéma.
  // Le panneau Harmonie vit dans la colonne gauche de l'outil (prototype : `ParcoursSectionsV82.place`) : on l'atteint dans le cadre.
  const parcelleHarmonie = async (p = page) => {
    await p.waitForFunction(() => document.querySelector(".parcelle-tool iframe")?.contentWindow?.ParcoursParcel?.ready, null, { timeout: 30000 });
    await p.waitForFunction(() => !!document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector("#fadi-harmonie-slot .h7-panel"), null, { timeout: 20000 });
    return p.frameLocator(".parcelle-tool iframe").locator("#fadi-harmonie-slot");
  };
  await page.goto(`${projectUrl}?module=parcours&etape=1`);
  let h01 = await parcelleHarmonie();
  check("étape 01 vierge : panneau Harmonie dans la colonne gauche de l'outil Parcelle (après « Construction »), « Harmonie · Site et paysage · 0 choix retenu(s) », 3 propositions de site", (await page.evaluate(() => { const d = document.querySelector(".parcelle-tool iframe").contentDocument; return d.getElementById("fold-construction")?.nextElementSibling?.id; })) === "fadi-harmonie-slot" && (await h01.locator(".h7-panel > summary").textContent()).includes("Site et paysage · 0 choix retenu(s)") && (await h01.locator(".h7-proposal").count()) === 3);
  check("étape 01 vierge : aucun schéma sans contour (« Aucune parcelle rectangulaire de remplacement »)", (await h01.locator(".h7-site-hero .h7-callout").textContent()).includes("Aucune parcelle rectangulaire de remplacement"));
  check("étape 01 vierge : proposition de départ A (approche non documentée)", (await h01.locator(".h7-group").textContent()).startsWith("A · Proposition de départ"));
  await page.screenshot({ path: `${OUT}/new-01-desktop.png`, fullPage: true });
  await page.locator(".workflow-back").click();
  await page.waitForSelector(".overview-step");
  Object.assign(sc, { parcelleHarmonie, h01 });
}

/** 2. Étape 02 — arbitrages Harmonie (retenir, écarter, adapter avec motif). */
export async function etape02(sc) {
  const { OUT, page, check } = sc;
  // 2. Étape 02 — Harmonie
  await page.locator(".overview-step").nth(1).click();
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
}

/** Étape 10 : sous-page « Harmonie du bâtiment », propositions localisées. */
export async function etape10Harmonie(sc) {
  const { OUT, page, check } = sc;
  const { exampleUrl, variantUrl, examplePid } = sc;
  // Référence, étape 10 : la page est l'Atelier Architectural (bandeau du prototype, enveloppe effacée) ; le bouton « Harmonie » du bandeau de l'Atelier ouvre la sous-page avec le panneau de l'exemple
  // (récit, « Lire le bilan du bâtiment conçu » / « Voir les capacités et ambiances » / « Exporter le bilan »).
  await page.goto(`${exampleUrl}?module=parcours&etape=10`);
  await page.waitForSelector('.nouvel-atelier [data-testid="plan2d-toile"]', { timeout: 30000 });
  check("étape 10 (référence) : page « Atelier Architectural · ÉTAPE 10 / 21 · Concevoir / Tester », enveloppe de Fadi effacée, titre de l'étape replié sous le dessin", (await page.locator(".atelier-stage-title").textContent()) === "Atelier Architectural" && (await page.locator(".top-stage").textContent()) === "ÉTAPE 10 / 21 · Concevoir / Tester" && (await page.evaluate(() => document.body.classList.contains("atelier-immersive"))) && !(await page.locator(".app-sidebar").isVisible()) && (await page.locator(".stage10-fold > summary").textContent()) === "Étude de capacité architecturale");
  await page.locator("#atelier-harmonie-button").click();
  await page.waitForFunction(() => !document.getElementById("atelier-harmonie-page")?.hidden);
  await page.evaluate(() => { document.querySelector(".h7-panel-reference").open = true; });
  await page.locator('.h7-panel-reference button:has-text("Lire le bilan du bâtiment conçu")').click();
  await page.waitForSelector(".design-review-fold[open] .v62-tabs, .v62-tabs", { timeout: 15000 });
  check("étape 10 (référence) : panneau de l'exemple dans la sous-page, « Lire le bilan du bâtiment conçu » ouvre le bilan en ligne ; « Voir les capacités et ambiances des N zones », « Exporter le bilan »", (await page.locator(".h7-panel-reference .ex81-story").count()) === 1 && (await page.locator(".v62-tabs").count()) >= 1 && /Voir les capacités et ambiances des \d+ zones/.test(await page.locator(".h7-panel-reference .ex81-actions").last().textContent()) && (await page.locator('.h7-panel-reference a:has-text("Exporter le bilan")').getAttribute("href")) === `/projects/${examplePid}/design-review/rapport`);
  await page.keyboard.press("Escape");
  await page.locator(".workflow-back").click();
  await page.waitForSelector(".overview-step");
  check("étape 10 : « ← » du bandeau → vue d'ensemble, enveloppe de Fadi de retour", !(await page.evaluate(() => document.body.classList.contains("atelier-immersive"))) && (await page.locator(".module-nav").isVisible()));
  // Variante (copie modifiable), étape 10 : propositions localisées sur les locaux du modèle (flow-v62 / h7-app), panneau Harmonie généré.
  await page.goto(`${variantUrl}?module=parcours&etape=10`);
  await page.waitForSelector('.nouvel-atelier [data-testid="plan2d-toile"]', { timeout: 30000 });
  check("étape 10 : l'Atelier est monté dans l'étape, bandeau « Atelier Architectural · ÉTAPE 10 / 21 »", (await page.locator('.nouvel-atelier [data-testid="atl-bandeau"]').textContent()) === "Atelier Architectural · ÉTAPE 10 / 21");
  // Sous-page « Harmonie du bâtiment » (V8.4) : depuis le bouton « Harmonie » du bandeau de l'Atelier
  await page.locator("#atelier-harmonie-button").click();
  await page.waitForFunction(() => !document.getElementById("atelier-harmonie-page")?.hidden);
  check("étape 10 : « Harmonie » ouvre la sous-page « Harmonie du bâtiment » (en-tête, 3 rubriques, Atelier masqué)", (await page.locator("#ah84-title").textContent()) === "Harmonie du bâtiment" && (await page.locator(".ah84-links button").count()) === 3 && !(await page.locator(".nouvel-atelier").isVisible()));
  // Propositions localisées sur les locaux du modèle (flow-v62 / h7-app)
  await page.evaluate(() => { document.querySelector(".h7-panel").open = true; });
  await page.waitForSelector(".h7-locals");
  const localsSummary = await page.locator(".h7-locals > summary").textContent();
  check("étape 10 : pli « N propositions localisées sur les usages du modèle »", /^\d+ propositions localisées sur les usages du modèle$/.test(localsSummary), localsSummary);
  await page.evaluate(() => { document.querySelector(".h7-locals").open = true; });
  const localCard = page.locator(".h7-locals .h7-proposal").first();
  check("étape 10 : carte locale « H10 · LOCAL », pourquoi calculé sur le polygone, source « Modèle … · objet … »", (await localCard.locator(".h7-kicker").textContent()) === "H10 · LOCAL" && /m² calculés sur le polygone/.test(await localCard.locator("dd").first().textContent()) && /^Modèle [0-9a-f]{8} · objet /.test(await localCard.locator(".h7-source").textContent()));
  check("étape 10 : données mobilisées « Modèle courant : 6 niveaux · … zones · empreinte … »", /Modèle courant : 6 niveaux · \d+ zones · empreinte [0-9a-f]{8}\./.test(await page.locator(".h7-panel .h7-fold-body").first().textContent()));
  // L'exemple (`makeProject` du prototype) a adapté chaque local avec sa réponse retenue et le parti C : compteur = parti + locaux.
  const localCount = await page.locator(".h7-locals .h7-proposal").count();
  const localChip = await localCard.locator(".h7-chip").first().textContent();
  check("étape 10 : chaque local porte la réponse adaptée par l'exemple (« Adaptée et retenue »), compteur « 1 + N choix retenu(s) »", /Adaptée et retenue/.test(localChip) && (await page.locator(".h7-panel > summary").textContent()).includes(`${1 + localCount} choix retenu(s)`), `${localChip} · ${localCount} locaux`);
  await localCard.locator('button:has-text("Confirmer ce choix")').first().click();
  await page.waitForFunction(() => /^Retenue/.test(document.querySelector(".h7-locals .h7-proposal .h7-chip")?.textContent || ""), null, { timeout: 10000 });
  check("étape 10 : local confirmé (« Retenue »), indépendant du parti retenu → compteur inchangé", (await page.locator(".h7-panel > summary").textContent()).includes(`${1 + localCount} choix retenu(s)`));
  await page.screenshot({ path: `${OUT}/10-desktop.png`, fullPage: true });
}

/** 6b'. Bilan Harmonie du bâtiment conçu (MapTiler simulé, observation déclarée, références directionnelles). */
export async function bilanBatiment(sc) {
  const { OUT, page, check } = sc;
  // 6b'. Bilan Harmonie du bâtiment conçu (flow-v62) : pli, bilan en ligne, plans, transmission, revue, rapport, références directionnelles
  // Service MapTiler simulé pour tout le scénario (descripteur de tuiles, tuiles 1 × 1, altimétrie = 40 m + rang) ; clé de session posée pour le bilan.
  const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const maptilerLog = [];
  await page.route(/^https:\/\/api\.maptiler\.com\//, (route) => {
    const url = new URL(route.request().url());
    maptilerLog.push(url.pathname);
    if (url.pathname === "/maps/satellite/256/tiles.json") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tiles: ["https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg"], maxzoom: 19, attribution: "© MapTiler © OpenStreetMap contributors" }) });
    if (url.pathname.startsWith("/tiles/")) return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
    const m = url.pathname.match(/^\/elevation\/(.+)\.json$/);
    if (m) {
      const points = m[1].split(";").map((p) => p.split(",").map(Number));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(points.map(([lon, lat], i) => [lon, lat, 40 + i])) });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.evaluate(() => sessionStorage.setItem("fadi.maptiler.session-key", "cle-de-test-scenario"));
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
  check("bilan : audit des transmissions, 14 contrôles, « Revue de conception » à actualiser", (await page.locator(".v62-tab-content .v62-table:not(.v62-events) tbody tr").count()) === 14 && /revue à actualiser/.test(await page.locator(".v62-tab-content .v62-table:not(.v62-events)").textContent()));
  const eventsBefore = (await page.locator(".v62-events tbody tr").allTextContents()).map((t) => t.replace(/\s+/g, " "));
  check("bilan · Transmission : « Derniers événements » (10 au plus) relus du journal daté : modèle importé, programme", eventsBefore.length > 0 && eventsBefore.length <= 10 && eventsBefore.some((t) => /modèle/.test(t)) && eventsBefore.some((t) => /programme/.test(t)), eventsBefore.slice(0, 3).join(" | "));
  await page.locator('button:has-text("Actualiser la revue de conception")').click();
  await page.waitForFunction(() => /Lecture documentaire courante/.test(document.querySelector("#v62-report header p")?.textContent || ""), null, { timeout: 10000 });
  await page.waitForFunction(() => /Revue rattachée aux entrées actuelles/.test(document.querySelector(".v62-tab-content .v62-table:not(.v62-events)")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
  check("bilan : « Actualiser la revue de conception » → revue rattachée aux entrées courantes (le toast « Bilan de conception actualisé sans lever les réserves. » s'efface de lui-même)", /Revue rattachée aux entrées actuelles/.test(await page.locator(".v62-tab-content .v62-table:not(.v62-events)").textContent()), `toast : ${await page.locator(".h7-toast").textContent().catch(() => "(déjà effacé)")}`);
  // Observation déclarée du contexte extérieur (site-note) : refus en dessous de 20 caractères, puis réserve « Contexte extérieur non observé » levée.
  await page.locator('.v62-tabs button:has-text("Hypothèses & MapTiler")').click();
  await page.waitForSelector("#v62-site-note");
  await page.locator('.v62-actions button:has-text("Afficher le satellite")').click();
  await page.waitForFunction(() => /9 \/ 9 tuiles reçues/.test(document.querySelector("#v62-map-status")?.textContent || ""), null, { timeout: 10000 });
  check("bilan · Hypothèses & MapTiler : « Afficher le satellite » → 9 tuiles autour du centre (zoom 18), marqueur « Centre H-GEO », crédit « repérage calculé, non bornage », « 9 / 9 tuiles reçues ; 0 erreur(s) »", (await page.locator("#v62-map-preview .v62-tiles img").count()) === 9 && (await page.locator("#v62-map-preview .v62-marker").textContent()) === "Centre H-GEO" && /© MapTiler.*repérage calculé, non bornage/.test(await page.locator("#v62-map-preview .v62-map-credit").textContent()) && maptilerLog.some((p) => /^\/tiles\/satellite-v2\/18\//.test(p)) && /9 \/ 9 tuiles reçues ; 0 erreur\(s\)\. Une observation datée doit être consignée séparément\./.test(await page.locator("#v62-map-status").textContent()), await page.locator("#v62-map-status").textContent());
  await page.locator("#v62-map-preview").screenshot({ path: `${OUT}/10-desktop-bilan-satellite.png` });
  await page.locator('button:has-text("Collecter l’altitude indicative du centre")').click();
  await page.waitForFunction(() => /Altitude de service : 40 m/.test(document.querySelector("#v62-map-status")?.textContent || ""), null, { timeout: 10000 });
  check("bilan · Hypothèses & MapTiler : « Collecter l’altitude indicative du centre » → « Altitude de service : 40 m · … · précision topographique non garantie »", /précision topographique non garantie/.test(await page.locator("#v62-map-status").textContent()));
  await page.fill("#v62-site-note", "trop court");
  await page.locator('button:has-text("Enregistrer comme observation déclarée")').click();
  await page.waitForSelector(".site-observation .h7-error", { timeout: 10000 });
  check("bilan · Hypothèses & MapTiler : observation trop courte refusée par le serveur (« 20 caractères minimum »)", /20 caractères minimum/.test(await page.locator(".site-observation .h7-error").textContent()));
  await page.fill("#v62-site-note", "Voie en T au nord-est, masse voisine R+3 à l'ouest ; relevé sur place le 12/09/2026.");
  await page.locator('button:has-text("Enregistrer comme observation déclarée")').click();
  await page.waitForFunction(() => /Déclaration utilisateur/.test(document.querySelector(".site-observation-status")?.textContent || ""), null, { timeout: 10000 });
  check("bilan : « Enregistrer comme observation déclarée » → statut « Déclaration utilisateur, non contrôle indépendant », daté", /^Déclaration utilisateur, non contrôle indépendant · \d{2}\/\d{2}\/\d{4}/.test(await page.locator(".site-observation-status").textContent()));
  await page.locator('.v62-tabs button:has-text("Bilan du bâtiment")').click();
  await page.waitForFunction(() => document.querySelectorAll("#v62-report .v62-issue").length === 6, null, { timeout: 10000 }).catch(() => {});
  check("bilan : la réserve « Contexte extérieur non observé » est levée (6 réserves au lieu de 7), la revue archivée devient à actualiser", (await page.locator("#v62-report .v62-issue").count()) === 6 && !/Contexte extérieur non observé/.test(await page.locator("#v62-report").textContent()));
  await page.locator('.v62-tabs button:has-text("Transmission")').click();
  check("bilan · Transmission : « Preuves de contexte extérieur » OK (observation consignée par utilisateur)", /Preuves de contexte extérieur.{0,80}OK/.test((await page.locator(".v62-tab-content").textContent()).replace(/\s+/g, " ")));
  const eventsAfter = (await page.locator(".v62-events tbody tr").allTextContents()).map((t) => t.replace(/\s+/g, " "));
  check("bilan · Transmission : les événements datés du bilan y figurent (revue rattachée, altitude MapTiler du centre, observation déclarée)", eventsAfter.some((t) => /Revue de conception rattachée/.test(t)) && eventsAfter.some((t) => /MapTiler.*Altitude indicative du centre/.test(t)) && eventsAfter.some((t) => /Observation déclarée du contexte extérieur/.test(t)), eventsAfter.slice(0, 4).join(" | "));
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
  check("sous-page : Échap → « Retour à l’Atelier », le dessin réapparaît", await page.locator(".nouvel-atelier").isVisible());
  Object.assign(sc, { maptilerLog });
}

/** 6e. Péremption « à réexaminer », actualisation, rapport d'étape, « Voir l'origine ». */
export async function peremption(sc) {
  const { OUT, page, check } = sc;
  const { variantUrl } = sc;
  // 6e. Péremption (« À réexaminer ») et rapports : les données du site de la variante viennent de changer → son étape 02, arbitrée à l'import, est à réexaminer
  await page.goto(`${variantUrl}?module=parcours&etape=2`);
  await page.waitForSelector(".h7-panel");
  await page.waitForFunction(() => /à réexaminer/.test(document.querySelector(".h7-panel > summary")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => { document.querySelector(".h7-panel").open = true; });
  check("variante étape 02 : « … · 1 choix retenu(s) · à réexaminer » après modification des données du site", (await page.locator(".h7-panel > summary").textContent()).includes("1 choix retenu(s) · à réexaminer"));
  check("variante étape 02 : encart « Données pertinentes modifiées. »", /Données pertinentes modifiées\. Les choix sont conservés, mais doivent être réexaminés\./.test(await page.locator(".h7-stale").textContent()));
  const staleCard = page.locator(".h7-proposal.stale").first();
  check("variante étape 02 : chip « À réexaminer · choix conservé » sur le choix de l'exemple", (await staleCard.locator(".h7-chip").first().textContent()) === "À réexaminer · choix conservé");
  await staleCard.locator('button:has-text("Adapter / motiver")').click();
  await staleCard.locator('input').nth(0).fill("Chef de projet");
  await staleCard.locator("textarea").nth(1).fill("Compte rendu de revue n° 4");
  await staleCard.locator('button:has-text("Consigner une vérification")').click();
  await staleCard.locator(".h7-error").waitFor({ timeout: 10000 });
  check("variante étape 02 : vérification refusée tant que les propositions ne sont pas actualisées (message du prototype)", (await staleCard.locator(".h7-error").textContent()) === "Actualisez d’abord les propositions sur les données courantes.");
  await page.screenshot({ path: `${OUT}/02-desktop-reexaminer.png`, fullPage: true });
  await page.locator('.h7-head button:has-text("Actualiser les propositions")').click();
  await page.waitForFunction(() => !document.querySelector(".h7-stale"), null, { timeout: 10000 });
  check("variante étape 02 : « Actualiser les propositions » → encart retiré, toast du prototype, choix toujours à réexaminer", (await page.locator(".h7-toast").textContent().catch(() => "")) === "Propositions actualisées ; les choix antérieurs sont conservés pour réexamen." && (await page.locator(".h7-proposal.stale").count()) === 1);
  await page.locator(".h7-proposal.stale").first().locator('button:has-text("Confirmer ce choix")').click();
  await page.waitForFunction(() => document.querySelectorAll(".h7-proposal.stale").length === 0, null, { timeout: 10000 });
  check("variante étape 02 : « Confirmer ce choix » → « Retenue », plus rien à réexaminer", (await page.locator(".h7-panel > summary").textContent()).includes("1 choix retenu(s)") && !(await page.locator(".h7-panel > summary").textContent()).includes("à réexaminer"));
  const [stageReport] = await Promise.all([page.waitForEvent("download"), page.locator('.h7-head a:has-text("Rapport de cette étape")').click()]);
  const stageReportHtml = await (await import("node:fs/promises")).readFile(await stageReport.path(), "utf8");
  check("variante étape 02 : « Rapport de cette étape » → Harmonie_Etape_02_V7.html, cartes et choix à transmettre", stageReport.suggestedFilename() === "Harmonie_Etape_02_V7.html" && stageReportHtml.includes("PARCOURS V7 · DIMENSION HARMONIE PAR ÉTAPE") && stageReportHtml.includes("<h3>Choix à transmettre</h3>") && /<title>Harmonie · ma variante de l’exemple résolu · 02 · /.test(stageReportHtml));
  await page.locator('.h7-tabs button:has-text("Choix & transmission")').click();
  check("étape 02 : onglet « Choix & transmission » — intentions reçues de l'étape 01, destinations", (await page.locator(".h7-transfer .h7-received").count()) === 1 && (await page.locator(".h7-transfer button.h7-goto").count()) >= 1);
  await page.locator(".h7-transfer .h7-received button:has-text('Voir l’origine')").first().click();
  await page.waitForURL(/etape=1/);
  check("étape 02 : « Voir l’origine » ouvre l'étape 01", /etape=1/.test(page.url()));
}

/** 6o. Harmonie, page transversale. */
export async function pageTransversale(sc) {
  const { BASE, OUT, page, check } = sc;
  const { examplePid, testPid } = sc;
  // 6o. Harmonie, page transversale : l'état des choix du projet choisi, lu des étapes déjà servies, et le renvoi vers l'étape.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/harmonie?projet=${examplePid}`);
  await page.waitForSelector(".harmonie-table tbody tr", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll(".harmonie-table tbody tr").length === 21, null, { timeout: 15000 });
  const harmonieKpis = (await page.locator(".harmonie-project .biz-kpis").textContent()).replace(/\s+/g, " ");
  check("Harmonie : projet choisi dans la liste, 21 lignes, choix retenus de l'exemple comptés, « Étapes avec un choix N / 21 »", (await page.locator(".harmonie-project-pick select").inputValue()) === examplePid && /Choix retenus\s*\d+/.test(harmonieKpis) && Number(harmonieKpis.match(/Choix retenus\s*(\d+)/)?.[1]) > 0 && /Étapes avec un choix\s*\d+ \/ 21/.test(harmonieKpis), harmonieKpis);
  check("Harmonie : étape 02 de l'exemple « Choix retenu » (ou conservé à réexaminer) avec la proposition retenue et son état", /Choix retenu|choix conservé/.test(await page.locator('.harmonie-table tr[data-step="2"] .h7-chip').textContent()) && (await page.locator('.harmonie-table tr[data-step="2"] .harmonie-chosen li').count()) >= 1);
  check("Harmonie : « Exporter la synthèse des choix Harmonie » pointe vers le rapport du projet", (await page.locator('.harmonie-project a:has-text("Exporter la synthèse")').getAttribute("href")) === `/projects/${examplePid}/steps/harmonie/rapport`);
  await page.locator('.harmonie-table tr[data-step="2"] a:has-text("Ouvrir l’étape")').click();
  await page.waitForURL(/etape=2/);
  await page.waitForSelector(".h7-panel");
  check("Harmonie : « Ouvrir l’étape » → étape 02 du projet, panneau Harmonie en place", true);
  await page.goto(`${BASE}/harmonie`);
  await page.waitForSelector(".harmonie-table tbody tr", { timeout: 30000 });
  await page.selectOption(".harmonie-project-pick select", testPid);
  await page.waitForFunction((pid) => new URLSearchParams(location.search).get("projet") === pid, testPid, { timeout: 10000 });
  await page.waitForFunction(() => /Étapes à réexaminer/.test(document.querySelector(".harmonie-project .biz-kpis")?.textContent || ""), null, { timeout: 15000 });
  check("Harmonie : changement de projet par la liste → adresse ?projet=… et état du projet test", (await page.locator(".harmonie-project h2").textContent()).includes("P.TEST"));
  await page.screenshot({ path: `${OUT}/harmonie-desktop.png`, fullPage: true });
}
