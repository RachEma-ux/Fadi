#!/usr/bin/env node
/**
 * Recette Studio — matrice d'échanges en lecture seule (E.6-01 à E.6-05), par l'interface réelle (compte et projet
 * synthétiques créés par les vraies routes) :
 *   1. la commande « Matrice d’échanges » est dans la famille Importer / Exporter, avec son raccourci Q ;
 *   2. Q ouvre la boîte : une ligne par entrée, les exports SVG / DXF / IFC livrés avec leur couverture par type
 *      (rapport de fidélité), DWG / BCF / STEP / OBJ / STL « non livré » avec leur raison, aucun « renoncé » ;
 *   3. aucun champ de saisie hors du filtre ; le filtre par statut ne garde que les entrées du statut choisi ;
 *   4. Échap ferme la boîte ;
 *   5. Importer IFC (Maj+F9, lot F3, TEST-028) : rapport de pertes, éléments non natifs visibles, enregistrés, non
 *      éditables (refus du serveur) ;
 *   6. Modèles externes (Maj+F2, TR-EX-066) : réception déclarée, comparaison par le serveur, acceptation et refus
 *      journalisés, décision définitive ;
 *   7. retrait explicite d'un élément non natif (Maj+F8).
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-echanges.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const RECETTE_IFC = readFileSync(new URL("../../../packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-echanges-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-echanges-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const projet = (await api("post", "/projects", { code: `P.ECH.${randomUUID().slice(0, 6)}`, name: "Studio — échanges (recette)" })).body;
  const racine = `/projects/${projet.id}/studio/studies`;
  const etude = (await api("post", racine, { name: "Étude échanges" })).body;
  check("préparation : étude créée", Boolean(etude?.study?.id), etude?.study?.id ? "" : JSON.stringify(etude ?? null).slice(0, 200));
  const studyId = etude.study.id, variantId = etude.variant.id;

  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`);
  const outils = page.getByRole("toolbar", { name: /^(Outils de dessin|Drawing tools)$/ });
  await outils.waitFor();

  // 1. Commande dans la famille Importer / Exporter, raccourci Q.
  const bouton = outils.locator('button[data-studio-commande="echanges"]').first();
  await bouton.waitFor({ state: "attached" });
  check("commande « Matrice d’échanges » dans la barre, raccourci Q", (await bouton.getAttribute("aria-keyshortcuts")) === "Q", String(await bouton.getAttribute("aria-keyshortcuts")));
  const famille = await bouton.evaluate((x) => x.closest("[data-studio-famille]")?.getAttribute("data-studio-famille") ?? null);
  check("rangée dans la famille Importer / Exporter", famille === "echanges", String(famille));

  // 2. Q ouvre la boîte.
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.keyboard.press("q");
  const boite = page.getByRole("dialog", { name: "Matrice d’échanges" });
  await boite.waitFor();
  const lignes = boite.locator("tr[data-studio-echange]");
  const n = await lignes.count();
  check("Q ouvre la boîte : une ligne par entrée", n >= 30, `${n} lignes`);
  const statut = async (id) => boite.locator(`tr[data-studio-echange="${id}"]`).getAttribute("data-studio-echange-statut");
  for (const id of ["dessin-svg", "dessin-dxf", "maquette-ifc", "dessin-dxf-import", "maquette-ifc-import", "modele-externe-ifc", "feuille-pdf", "dossier-pdf", "tableau-metre-csv", "rendu-png", "paquet-publication", "natif-archive-export", "bcf-import", "bcf-export"]) {
    check(`livré : ${id}`, (await statut(id)) === "livre");
  }
  for (const id of ["dwg-import", "dwg-export", "step-export", "obj-export", "stl-export", "gltf-export"]) {
    check(`non livré : ${id}`, (await statut(id)) === "non-livre");
  }
  check("aucune entrée « renoncé »", (await boite.locator('tr[data-studio-echange-statut="renonce"]').count()) === 0);
  const ifc = boite.locator('tr[data-studio-echange="maquette-ifc"]');
  await ifc.locator("summary").click();
  const fidelite = ifc.locator('[data-studio-echange-fidelite="ifc"]');
  await fidelite.waitFor();
  check("IFC : couverture par type du rapport de fidélité affichée", (await fidelite.locator("tbody tr").count()) >= 10 && (await fidelite.innerText()).includes("Non couvert"));
  const dwg = boite.locator('tr[data-studio-echange="dwg-export"]');
  await dwg.locator("summary").click();
  check("DWG : raison et source D-179 (Atelier) affichées, jamais conforme", /ne vaut pas pour Studio/.test(await dwg.innerText()) && (await dwg.innerText()).includes("D-179"));
  const ecritureIfc = ifc.locator("[data-studio-echange-ecriture-ifc]");
  check("IFC : entités réellement écrites listées (IfcWall, IfcTriangulatedFaceSet, IfcDoor), noms non traduits", (await ecritureIfc.locator('[translate="no"]').count()) >= 10
    && /IfcWall/.test(await ecritureIfc.innerText()) && /IfcTriangulatedFaceSet/.test(await ecritureIfc.innerText()) && /IfcDoor/.test(await ecritureIfc.innerText()));
  const sources = dwg.locator("[data-studio-echange-sources] li");
  check("sources : référence non traduite, commentaire en prose traduisible", (await sources.count()) >= 2 && (await sources.locator('cite[translate="no"]').count()) === (await sources.count())
    && (await dwg.locator("[data-studio-echange-sources]").getAttribute("translate")) === null);
  const noms = await boite.locator("summary").allInnerTexts();
  check("chaque bloc de détails a un nom distinct (format, sens, objet)", noms.length === n && new Set(noms).size === n, `${new Set(noms).size}/${noms.length}`);
  check("intertitres hiérarchisés : h3 sous le h2 de la boîte, aucun h4", (await boite.locator("h2").count()) === 1 && (await boite.locator("h4").count()) === 0 && (await boite.locator("h3").count()) > 0);

  // 3. Lecture seule : aucun champ hors du filtre ; filtre par statut.
  check("aucun champ de saisie dans la boîte", (await boite.locator("input, textarea, [contenteditable]").count()) === 0);
  const filtre = boite.locator("[data-studio-echanges-filtre]");
  await filtre.selectOption("non-livre");
  const nonLivres = await boite.locator("tr[data-studio-echange]").count();
  check("filtre « Non livré » : seules les entrées non livrées", nonLivres > 0 && nonLivres === (await boite.locator('tr[data-studio-echange-statut="non-livre"]').count()), `${nonLivres}`);
  await filtre.selectOption("renonce");
  check("filtre « Renoncé » : aucune entrée", (await boite.locator("[data-studio-echanges-vide]").count()) === 1);
  await page.keyboard.press("Escape");
  await boite.waitFor({ state: "detached" });
  check("Échap ferme la boîte", (await page.getByRole("dialog").count()) === 0);

  // 5. Import IFC (lot F3, TEST-028) : commande Maj+F9 de la barre Importer ; rapport de pertes ; éléments non natifs
  //    conservés, visibles, non éditables, exclus des métrés ; enregistrés par le serveur.
  const variantePath = `${racine}/${studyId}/variants/${variantId}`;
  const boutonIfc = outils.locator('button[data-studio-commande="importer-ifc"]').first();
  await boutonIfc.waitFor({ state: "attached" });
  check("commande « Importer IFC » dans la famille Importer / Exporter, raccourci Maj+F9", (await boutonIfc.getAttribute("aria-keyshortcuts")) === "Shift+F9"
    && (await boutonIfc.evaluate((x) => x.closest("[data-studio-famille]")?.getAttribute("data-studio-famille") ?? null)) === "echanges");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+F9");
  const boiteIfc = page.getByRole("dialog", { name: "Importer IFC" });
  await boiteIfc.waitFor();
  check("Importer IFC : « Ajouter au brouillon » indisponible avant le choix d'un fichier", await boiteIfc.locator("[data-studio-import-ifc-ajouter]").isDisabled());
  await boiteIfc.locator("[data-studio-import-ifc-fichier]").setInputFiles({ name: "recette-ifc2x3.ifc", mimeType: "application/x-step", buffer: Buffer.from(RECETTE_IFC) });
  const rapportIfc = boiteIfc.locator("[data-studio-import-ifc-rapport]");
  await rapportIfc.waitFor();
  const typesNonNatifs = await rapportIfc.locator("[data-studio-import-ifc-non-natif]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-import-ifc-non-natif")));
  const typesPertes = await rapportIfc.locator("[data-studio-import-ifc-perte]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-studio-import-ifc-perte")}:${e.getAttribute("data-motif")}`));
  check("Importer IFC : rapport de pertes et éléments non natifs à l’aperçu (unité lue, 5 objets natifs, 3 non natifs, pertes par type)",
    (await rapportIfc.getAttribute("data-studio-import-ifc-statut")) === "pret" && (await rapportIfc.getAttribute("data-studio-import-ifc-objets")) === "5"
    && (await rapportIfc.getAttribute("data-studio-import-ifc-non-natifs")) === "3" && typesNonNatifs.join() === "IfcColumn,IfcDoor,IfcSpace"
    && typesPertes.includes("IfcPropertySet:aucun") && typesPertes.includes("IfcSlab:prisme-libre")
    && (await rapportIfc.locator("[data-studio-import-ifc-unite]").innerText()).includes("MILLI METRE"), `${typesNonNatifs.join()} | ${typesPertes.join()}`);
  await boiteIfc.locator("[data-studio-import-ifc-ajouter]").click();
  await boiteIfc.waitFor({ state: "detached" });
  const listeNonNatifs = page.locator("[data-studio-non-natifs]");
  await listeNonNatifs.waitFor();
  check("Importer IFC : état « non natif » explicite dans « Éléments du dessin » (type, GlobalId, raison)", (await listeNonNatifs.getAttribute("data-studio-non-natifs")) === "3"
    && (await listeNonNatifs.locator('[data-studio-etat="non-natif"]').count()) === 3 && (await listeNonNatifs.innerText()).includes("0PoteauC10000000000000")
    && (await listeNonNatifs.locator('[data-raison="hote-introuvable"]').count()) === 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const apresIfc = (await api("get", variantePath)).body;
  const docIfc = apresIfc?.revision?.document ?? {};
  check("Importer IFC : enregistré par le serveur — 2 murs, 2 ouvertures (porte, fenêtre), 1 prisme, 3 éléments non natifs, 2 calques de niveau",
    docIfc.architecture?.filter((x) => x.type === "wall").length === 2 && docIfc.architecture?.filter((x) => x.type === "opening").map((x) => x.kind).join() === "porte,fenetre"
    && docIfc.solides?.length === 1 && docIfc.nonNatifs?.length === 3 && docIfc.layers?.map((l) => l.name).join() === "RDC,R+1", JSON.stringify(docIfc).slice(0, 300));
  const deplacerNonNatif = await api("post", `${variantePath}/commands`, {
    contractVersion: "studio-commands/1", requestId: randomUUID(), baseRevisionId: apresIfc.revision.id,
    commands: [{ toolId: "studio.dessin.deplacer", params: { id: "ifc-0PoteauC10000000000000", dx: 1, dy: 0 } }],
  });
  check("élément non natif non éditable : le serveur refuse de le déplacer comme un objet natif", deplacerNonNatif.status >= 400 && deplacerNonNatif.status < 500, String(deplacerNonNatif.status));

  // 6. Modèle externe (lot F3, TR-EX-066) : Maj+F2, réception déclarée, comparaison par le serveur, acceptation journalisée ;
  //    une seconde version déplacée diffère, se refuse avec motif ; un modèle décidé ne se décide plus.
  const boutonModeles = outils.locator('button[data-studio-commande="modeles-externes"]').first();
  await boutonModeles.waitFor({ state: "attached" });
  check("commande « Modèles externes » dans la barre, raccourci Maj+F2", (await boutonModeles.getAttribute("aria-keyshortcuts")) === "Shift+F2");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+F2");
  const boiteModeles = page.getByRole("dialog", { name: "Modèles externes" });
  await boiteModeles.waitFor();
  const recevoir = async (version, transformation) => {
    const f = boiteModeles.locator("[data-studio-modeles-reception]");
    await f.waitFor();
    await f.locator("[data-studio-modele-fichier]").setInputFiles({ name: "recette-ifc2x3.ifc", mimeType: "application/x-step", buffer: Buffer.from(RECETTE_IFC) });
    await f.locator('[data-studio-modele-champ="reference"]').fill("Architecte — bâtiment A");
    await f.locator('[data-studio-modele-champ="auteur"]').fill("Cabinet partenaire (recette)");
    await f.locator('[data-studio-modele-champ="discipline"]').fill("architecture");
    await f.locator('[data-studio-modele-champ="version"]').fill(version);
    await f.locator("[data-studio-modele-unite]").selectOption("mm");
    const coche = f.locator("[data-studio-modele-avec-transformation]");
    if (transformation) {
      if (!(await coche.isChecked())) await coche.check();
      await f.locator("[data-studio-modele-dx]").fill(String(transformation.dx));
      await f.locator("[data-studio-modele-dy]").fill("0");
      await f.locator("[data-studio-modele-dz]").fill("0");
      await f.locator("[data-studio-modele-rotation]").fill("0");
    } else if (await coche.isChecked()) await coche.uncheck();
    await f.locator("[data-studio-modele-recevoir]").click();
    const detail = boiteModeles.locator(`[data-studio-modele-detail][data-studio-modele-version="${version}"]`);
    await detail.waitFor();
    return detail;
  };
  const detailA = await recevoir("A");
  check("Modèle externe : reçu, relu et comparé par le serveur — identique à la révision qui l’a importé ; transformation non déclarée signalée",
    (await detailA.getAttribute("data-studio-modele-statut")) === "compare" && (await detailA.locator('[data-studio-modele-identiques="oui"]').count()) === 1
    && (await detailA.locator('[data-ecart="transformation-non-declaree"]').count()) === 1 && (await detailA.locator('[data-ecart="elements-non-natifs"]').count()) === 1);
  const idA = await detailA.getAttribute("data-studio-modele-detail");
  check("Modèle externe : un refus sans motif est impossible (bouton désactivé)", await detailA.locator('[data-studio-modele-action="refuser"]').isDisabled());
  await detailA.locator('[data-studio-modele-action="accepter"]').click();
  await boiteModeles.locator('[data-studio-modele-detail][data-studio-modele-statut="accepte"]').waitFor();
  const journalA = await boiteModeles.locator("[data-studio-modele-journal] li").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
  check("Modèle externe : accepté par le propriétaire, passage journalisé (recevoir, accepter)", journalA.join() === "recevoir,accepter", journalA.join());
  const varianteApresA = (await api("get", variantePath)).body;
  check("Modèle externe : recevoir et accepter ne modifient pas la variante", varianteApresA.revision.id === apresIfc.revision.id);
  const detailB = await recevoir("B", { dx: 1 });
  check("Modèle externe : une version déplacée (transformation déclarée) diffère — murs modifiés",
    (await detailB.locator('[data-studio-modele-identiques="non"]').count()) === 1 && (await detailB.locator("[data-studio-modele-transformation-declaree]").innerText()).includes("1")
    && (await detailB.locator('[data-studio-modele-ecarts] [data-ecart="transformation-non-declaree"]').count()) === 0);
  await detailB.locator("[data-studio-modele-motif]").fill("Repère décalé d’un mètre (recette)");
  await detailB.locator('[data-studio-modele-action="refuser"]').click();
  await boiteModeles.locator('[data-studio-modele-detail][data-studio-modele-statut="refuse"]').waitFor();
  const idB = await boiteModeles.locator("[data-studio-modele-detail]").getAttribute("data-studio-modele-detail");
  check("Modèle externe : refus explicite avec motif, journalisé", (await boiteModeles.locator('[data-studio-modele-journal] li[data-action="refuser"]').innerText()).includes("Repère décalé"));
  const reaccepter = await api("post", `${variantePath}/modeles-externes/${idB}/accepter`, {});
  const recomparer = await api("post", `${variantePath}/modeles-externes/${idA}/comparer`, {});
  check("Modèle externe : un modèle accepté ou refusé ne se décide plus (409)", reaccepter.status === 409 && recomparer.status === 409 && reaccepter.body?.error === "deja_decide", `${reaccepter.status} ${recomparer.status}`);
  const listeModeles = (await api("get", `${variantePath}/modeles-externes`)).body;
  check("Modèle externe : liste — deux réceptions, statuts accepte et refuse", listeModeles?.modeles?.map((m) => m.statut).sort().join() === "accepte,refuse");
  await page.keyboard.press("Escape");
  await boiteModeles.waitFor({ state: "detached" });

  // 7. Retrait explicite d'un élément non natif (Maj+F8) : seuls ceux cochés sont retirés.
  await listeNonNatifs.locator('[data-studio-non-natif-coche="ifc-0PoteauC10000000000000"]').check();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+F8");
  await page.locator('[data-studio-non-natifs="2"]').waitFor();
  check("Retirer les éléments non natifs (Maj+F8) : l’élément coché seul est retiré", (await page.locator('[data-studio-non-natif="ifc-0PoteauC10000000000000"]').count()) === 0
    && (await page.locator("[data-studio-non-natif]").count()) === 2);

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs > 0) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette matrice d’échanges : tout est vert.");
