/**
 * Scénario de bout en bout · 07-documents — Documents : outils du projet (synthèse, archive), Analyses métier, catalogue, sources des étapes.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** Outils du projet : synthèse Harmonie ; 6f. archive JSON (sauvegarder, importer). */
export async function archive(sc) {
  const { BASE, page, check } = sc;
  const { exampleUrl, examplePid } = sc;
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
  await page.waitForSelector(".overview-step");
  check("outils du projet : « Importer projet JSON » → nouveau dossier ouvert, toast du prototype", !page.url().includes(examplePid) && /Import créé dans un nouveau dossier/.test(await page.locator(".h7-toast").textContent().catch(() => "")));
  check("import : « Escalier B et mezzanine · import », 21 cartes", /Escalier B et mezzanine · import/.test(await page.locator("h1").first().textContent()) && (await page.locator(".overview-step").count()) === 21);
  await page.goto(`${BASE}/projets`);
  await page.waitForSelector(".project-list");
  check("page Projets : « Importer projet JSON » et « Bibliothèque des bâtiments » dans l'en-tête", (await page.locator('.projects-heading button:has-text("Importer projet JSON")').count()) === 1 && (await page.locator('.projects-heading a:has-text("Bibliothèque des bâtiments")').count()) === 1);
}

/** 6h. Analyses métier (contrôles traçables, quantités, structure, variantes). */
export async function analyses(sc) {
  const { OUT, page, check } = sc;
  const { exampleUrl } = sc;
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
}

/** 6i. Documents : catalogue, actualité des productions, tableau des surfaces. */
export async function catalogue(sc) {
  const { OUT, page, check } = sc;
  const { exampleUrl, variantUrl } = sc;
  // 6i. Documents : catalogue des documents productibles, productions enregistrées et actualité (à jour / périmé)
  await page.goto(`${exampleUrl}?module=documents`);
  await page.waitForSelector(".documents-table tbody tr", { timeout: 30000 });
  const docFreshness = async (kind) => page.locator(`tr[data-document="${kind}"]`).getAttribute("data-freshness");
  check("documents (référence) : 34 documents productibles (synthèse, 21 rapports d'étape, bilan, 6 plans, tableau des surfaces, programme, fiches, dossier complet de l'exemple, archive) ; synthèse, archive et dossier complet produits par le scénario, à jour", (await page.locator(".documents-table tbody tr").count()) === 34 && /34 documents productibles/.test(await page.locator(".documents-module .biz-sub").first().textContent()) && (await page.locator('tr[data-document="dossier-exemple"]').count()) === 1 && (await page.locator('tr[data-document="fiches-espaces-csv"]').count()) === 1 && (await docFreshness("archive-projet")) === "a-jour" && (await docFreshness("dossier-exemple")) === "a-jour" && (await docFreshness("harmonie-synthese")) === "a-jour");
  // Les productions du scénario (rapport de l'étape 02, synthèse, archive, bilan puis références directionnelles) ont eu lieu sur la variante : son catalogue (33 documents, sans les fiches de la référence) les reconnaît.
  await page.goto(`${variantUrl}?module=documents`);
  await page.waitForSelector(".documents-table tbody tr", { timeout: 30000 });
  check("documents (variante) : 33 documents productibles — pas de fiches de l'exemple résolu hors référence, dossier complet présent", (await page.locator(".documents-table tbody tr").count()) === 33 && (await page.locator('tr[data-document="fiches-espaces-csv"]').count()) === 0 && (await page.locator('tr[data-document="dossier-exemple"]').count()) === 1);
  const variantFreshness = { etape02: await docFreshness("harmonie-etape-02"), synthese: await docFreshness("harmonie-synthese"), archive: await docFreshness("archive-projet"), bilan: await docFreshness("bilan-batiment"), surfaces: await docFreshness("tableau-surfaces") };
  check("documents (variante) : productions antérieures reconnues — rapport de l'étape 02 à jour ; bilan périmé (références directionnelles enregistrées après sa production) ; synthèse, archive et tableau jamais produits ici", variantFreshness.etape02 === "a-jour" && variantFreshness.synthese === "aucune" && variantFreshness.archive === "aucune" && variantFreshness.bilan === "perime" && variantFreshness.surfaces === "aucune", JSON.stringify(variantFreshness));
  const [surfacesDl] = await Promise.all([page.waitForEvent("download"), page.locator('tr[data-document="tableau-surfaces"] a:has-text("Produire")').click()]);
  const surfacesCsv = await (await import("node:fs/promises")).readFile(await surfacesDl.path(), "utf8");
  await page.waitForFunction(() => document.querySelector('tr[data-document="tableau-surfaces"]')?.getAttribute("data-freshness") === "a-jour", null, { timeout: 10000 });
  check("documents : « Produire » le tableau des surfaces → Tableau_surfaces_V7.csv (74 zones + 6 totaux de niveau), production enregistrée « À jour · révision N »", surfacesDl.suggestedFilename() === "Tableau_surfaces_V7.csv" && surfacesCsv.split("\r\n").length === 82 && /^À jour · révision \d+$/.test(await page.locator('tr[data-document="tableau-surfaces"] .h7-chip').textContent()));
  await page.locator(".documents-module .biz-card").nth(2).screenshot({ path: `${OUT}/documents-desktop.png` });
}

/** 6d. Sources de l'étape (import, téléchargement, suppression). */
export async function sources(sc) {
  const { BASE, OUT, page, check } = sc;
  const { exampleUrl } = sc;
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
}
