#!/usr/bin/env node
/**
 * Recette de la géométrie 3D de Studio (lot F1) — édition des faces, direction d'extrusion, profil source lié, division
 * d'une face cotée — sur l'API de Studio V1, par l'interface (API et application construites, même origine) :
 *
 *  - TEST-002 / A.3-03 / TR-EX-005 : nouvelle étude sans dessin 2D → boîte posée dans la vue 3D → pousser / tirer de
 *    deux faces (sommet, x+) par l'outil de la barre (icône, raccourci) → annuler / rétablir → enregistrement (même
 *    identifiant, dimensions relues) → vue plane dérivée (vue en plan, coupe horizontale à une cote que seule la face
 *    poussée atteint) ; pivot du solide, annulé ;
 *  - TEST-005 / A.4-07 : formulaire Volume — la direction est demandée (aucune proposée), −Z enregistrée et relue ;
 *    prisme selon un vecteur saisi (oblique), volume = aire × hauteur perpendiculaire ;
 *  - TEST-006 / A.4-02 / TR-EX-006 : prisme en référence liée et prisme en copie indépendante d'une même polyligne ;
 *    la polyligne modifiée recalcule le premier (serveur et interface), pas le second ; source supprimée → « à
 *    résoudre », volume non évalué, détachement explicite ;
 *  - TEST-007 : division d'une face latérale du prisme lié → l'arête source est divisée, cotes réattachées de façon
 *    prouvée, cote angulaire du segment divisé « à résoudre ».
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-faces node apps/web/e2e/studio-faces.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-faces";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

/** Un bouton rangé dans un menu « ▾ » de la barre compacte s'atteint en ouvrant ce menu, comme le ferait l'utilisateur. */
async function atteindre(barre, selecteur) {
  const el = barre.locator(selecteur).first();
  await el.waitFor({ state: "attached" });
  if (!(await el.isVisible())) {
    const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
    if (menu) await barre.locator(`[aria-controls="${menu}"]`).click();
    await el.waitFor({ state: "visible" });
  }
  return el;
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-faces-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-faces-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const commandes = async (chemin, cs) => api("post", `${chemin}/commands`, {
    contractVersion: "studio-commands/1", requestId: `faces-${randomUUID()}`, baseRevisionId: (await api("get", chemin)).revision.id, commands: cs,
  });
  const projet = await api("post", "/projects", { code: "P.STU.F1", name: "Studio — géométrie 3D" });
  const outils = page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  const enAttente = () => page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre");
  const attendre = (n) => page.waitForFunction((v) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === v, String(n));
  const flou = () => page.evaluate(() => document.activeElement?.blur());
  const enregistrer = async () => {
    await flou();
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  };
  const ouvrir = async (etude) => {
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  };
  const ouvrir3d = async () => {
    await flou();
    await page.keyboard.press("Shift+D");
    await panneaux3d.locator("canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 20000 });
  };
  const texteSolide = (id) => panneaux3d.locator(`[data-studio-solide="${id}"]`).textContent();

  // ——— TEST-002 : étude neuve, sans dessin 2D ———
  const etude1 = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude faces" });
  const chemin1 = `/projects/${projet.id}/studio/studies/${etude1.study.id}/variants/${etude1.variant.id}`;
  await ouvrir(etude1);
  const vide = (await api("get", chemin1)).revision.document;
  check("TEST-002 : étude neuve, document vide (aucun objet 2D, aucun solide)", vide.objects.length === 0 && (vide.solides ?? []).length === 0);
  const nouveaux = [
    ["studio.solide.face-decaler", "Pousser / tirer la face", "Control+Shift+U"], ["studio.solide.face-diviser", "Diviser la face", "Control+Shift+V"],
    ["studio.solide.pivoter", "Pivoter le solide", "Control+Shift+H"], ["studio.solide.resoudre", "Résoudre le lien du solide", "Control+Shift+G"],
  ];
  const presents = [];
  for (const [id, nom, touche] of nouveaux) presents.push(await outils.locator(`[data-studio-famille="volume"] [data-studio-outil="${id}"][aria-label="${nom}"][aria-keyshortcuts="${touche}"] svg path`).count());
  check("A.3-03 (règle d'or) : Pousser / tirer la face (Ctrl+Maj+U), Diviser la face (Ctrl+Maj+V), Pivoter le solide (Ctrl+Maj+H), Résoudre le lien du solide (Ctrl+Maj+G) dans la famille Volume, icône propre", presents.every((n) => n === 1), JSON.stringify(presents));
  await ouvrir3d();
  await flou();
  await page.keyboard.press("b");
  const formBoite = panneaux3d.locator("[data-studio-boite]");
  await formBoite.waitFor();
  check("TEST-002 : vue 3D ouverte sans planche 2D, outil Boîte prêt", (await planche.count()) === 0);
  for (const [libelle, valeur] of [["Origine x (m)", "1"], ["Origine y (m)", "1"], ["Origine z (m)", "0"], ["Largeur selon x (m)", "2"], ["Profondeur selon y (m)", "1"], ["Hauteur selon z (m)", "3"]]) await formBoite.getByLabel(libelle, { exact: true }).fill(valeur);
  await formBoite.getByRole("button", { name: "Poser la boîte", exact: true }).click();
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
  const [idBoite] = await panneaux3d.locator('[data-studio-solide-type="box"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-solide")));
  check("TEST-002 : boîte 2 × 1 × 3 posée (6 m³)", (await texteSolide(idBoite)).includes("Boîte 2 × 1 × 3 m · 6 m³"), await texteSolide(idBoite));
  await flou();
  await page.keyboard.press("Control+Shift+U");
  await page.waitForFunction(() => document.querySelector('[data-studio-outil="studio.solide.face-decaler"]')?.getAttribute("aria-pressed") === "true");
  const formFace = panneaux3d.locator(`[data-studio-face-decaler="${idBoite}"]`);
  check("TEST-002 : Ctrl+Maj+U active Pousser / tirer la face ; le formulaire de face vient avec la sélection, aucune face ni distance proposée",
    (await formFace.count()) === 1 && (await formFace.locator("[data-studio-face-choix]").inputValue()) === "" && (await formFace.getByLabel("Distance (m, positive vers l’extérieur)").inputValue()) === "");
  await formFace.locator("[data-studio-face-choix]").selectOption("sommet");
  await formFace.getByLabel("Distance (m, positive vers l’extérieur)").fill("1");
  await formFace.getByRole("button", { name: "Pousser / tirer la face", exact: true }).click();
  await attendre(2);
  check("TEST-002 / TR-EX-005 : sommet poussé de 1 m — même solide, hauteur 4 m, volume recalculé 8 m³", (await texteSolide(idBoite)).includes("Boîte 2 × 1 × 4 m · 8 m³"), await texteSolide(idBoite));
  await formFace.locator("[data-studio-face-choix]").selectOption("lateral-1");
  await formFace.getByLabel("Distance (m, positive vers l’extérieur)").fill("0.5");
  await formFace.getByRole("button", { name: "Pousser / tirer la face", exact: true }).click();
  await attendre(3);
  check("TEST-002 : face x+ tirée de 0,5 m — largeur 2,5 m, volume 10 m³", (await texteSolide(idBoite)).includes("Boîte 2,5 × 1 × 4 m · 10 m³"), await texteSolide(idBoite));
  await flou();
  await page.keyboard.press("Control+z");
  await attendre(2);
  check("TEST-002 : annuler retire la dernière édition de face (2 × 1 × 4)", (await texteSolide(idBoite)).includes("Boîte 2 × 1 × 4 m · 8 m³"));
  await page.keyboard.press("Control+y");
  await attendre(3);
  check("TEST-002 : rétablir la rejoue (2,5 × 1 × 4)", (await texteSolide(idBoite)).includes("Boîte 2,5 × 1 × 4 m · 10 m³"));
  await enregistrer();
  const doc1 = (await api("get", chemin1)).revision.document;
  check("TEST-002 : après Ctrl+S, le document relu a un solide, même identifiant, 2,5 × 1 × 4 m, aucun objet 2D",
    doc1.solides?.length === 1 && doc1.solides[0].id === idBoite && doc1.solides[0].type === "box" && doc1.solides[0].width === 2.5 && doc1.solides[0].depth === 1 && doc1.solides[0].height === 4 && doc1.objects.length === 0,
    JSON.stringify(doc1.solides));
  await flou();
  await page.keyboard.press("Shift+G");
  await page.locator('[data-studio-vue3d][data-studio-navigation="plan"]').waitFor();
  check("TEST-002 : vue en plan (Maj+G) de l'étude enregistrée, brouillon inchangé", (await enAttente()) === "0");
  await page.keyboard.press("Shift+G");
  await page.keyboard.press("Shift+K");
  const coupe = panneaux3d.locator("[data-studio-coupe]");
  await coupe.waitFor();
  await coupe.getByLabel("Cote de coupe z (m)", { exact: true }).fill("3.5");
  await page.locator('[data-studio-coupe][data-studio-coupe-z="3.5"]').waitFor();
  check("TEST-002 : vue plane dérivée — coupe à z = 3,5 m (atteinte par la seule face poussée) : 4 contours du solide, provenance, non modifiable",
    (await coupe.getAttribute("data-studio-coupe-segments")) === "4" && (await coupe.getAttribute("data-studio-coupe-sources")) === idBoite && (await coupe.getByRole("status").textContent()).includes("non modifiable"),
    `${await coupe.getAttribute("data-studio-coupe-segments")} · ${await coupe.getAttribute("data-studio-coupe-sources")}`);
  await page.screenshot({ path: join(OUT, "studio-faces-test-002.png") });
  const formPivot = panneaux3d.locator(`[data-studio-pivoter="${idBoite}"]`);
  await formPivot.getByLabel("Angle (°, sens trigonométrique)").fill("90");
  await formPivot.getByRole("button", { name: "Pivoter le solide", exact: true }).click();
  await attendre(1);
  check("pivoter : rotation de 90° autour de l'axe vertical de l'origine (une commande), coupe toujours issue du même solide", (await coupe.getAttribute("data-studio-coupe-sources")) === idBoite);
  await flou();
  await page.keyboard.press("Control+z");
  await attendre(0);

  // ——— TEST-005 / TEST-006 / TEST-007 : polyligne source, rectangle, prismes liés ———
  const etude2 = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude profils liés" });
  const chemin2 = `/projects/${projet.id}/studio/studies/${etude2.study.id}/variants/${etude2.variant.id}`;
  await commandes(chemin2, [
    { toolId: "studio.dessin.polyligne", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], closed: true } },
    { toolId: "studio.dessin.rectangle", params: { id: "R", type: "rectangle", origin: { x: 8, y: 0 }, width: 2, height: 1 } },
  ]);
  await ouvrir(etude2);
  // TEST-005 : extrusion 2D, direction demandée.
  await page.locator('[data-studio-objet="R"]').waitFor({ state: "attached" });
  await page.locator('[data-studio-objet="R"]').focus();
  await page.keyboard.press("Enter");
  const formExtrusion = page.locator("[data-studio-extrusion]");
  await formExtrusion.waitFor();
  check("TEST-005 : formulaire Volume — direction d'extrusion vide, rien n'est proposé", (await formExtrusion.locator("[data-studio-extrusion-direction]").inputValue()) === "");
  await formExtrusion.getByLabel("Base (m)").fill("3");
  await formExtrusion.getByLabel("Hauteur (m)").fill("2");
  await formExtrusion.getByRole("button", { name: "Extruder la sélection", exact: true }).click();
  await page.waitForTimeout(300);
  check("TEST-005 : sans direction choisie, l'extrusion n'est pas envoyée (aucune commande en attente)", (await enAttente()) === "0");
  await formExtrusion.locator("[data-studio-extrusion-direction]").selectOption("-z");
  await formExtrusion.getByRole("button", { name: "Extruder la sélection", exact: true }).click();
  await attendre(1);
  await enregistrer();
  const rRelu = (await api("get", chemin2)).revision.document.objects.find((o) => o.id === "R");
  check("TEST-005 : direction −Z enregistrée et relue par le serveur (base 3, hauteur 2)", JSON.stringify(rRelu.extrusion) === JSON.stringify({ base: 3, height: 2, direction: "-z" }), JSON.stringify(rRelu.extrusion));
  await page.reload();
  await page.locator('[data-studio-objet="R"]').waitFor({ state: "attached" });
  await page.locator('[data-studio-objet="R"]').focus();
  await page.keyboard.press("Enter");
  await formExtrusion.waitFor();
  check("TEST-005 : après actualisation, la direction relue est −Z", (await formExtrusion.locator("[data-studio-extrusion-direction]").inputValue()) === "-z");

  // TEST-006 : deux prismes sur P — référence liée (+Z) et copie indépendante (vecteur oblique).
  await ouvrir3d();
  await flou();
  await page.keyboard.press("Shift+B");
  const formPrisme = panneaux3d.locator("[data-studio-prisme]");
  await formPrisme.waitFor();
  check("TEST-006 : formulaire du prisme — relation et direction vides (aucun choix d'office)",
    (await formPrisme.locator("[data-studio-prisme-relation]").inputValue()) === "" && (await formPrisme.locator("[data-studio-prisme-direction]").inputValue()) === "");
  const poserPrisme = async (relation, direction, vecteur) => {
    await formPrisme.locator("[data-studio-prisme-profil]").selectOption("P");
    await formPrisme.getByLabel("Cote de base z (m)", { exact: true }).fill("0");
    await formPrisme.getByLabel("Hauteur (m)", { exact: true }).fill("3");
    await formPrisme.locator("[data-studio-prisme-relation]").selectOption(relation);
    await formPrisme.locator("[data-studio-prisme-direction]").selectOption(direction);
    if (vecteur) for (const [k, v] of Object.entries(vecteur)) await formPrisme.getByLabel(`Direction ${k}`, { exact: true }).fill(String(v));
    await formPrisme.getByRole("button", { name: "Poser le prisme", exact: true }).click();
  };
  await poserPrisme("reference-liee", "+z");
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="1"]').waitFor();
  await poserPrisme("copie-independante", "vecteur", { dx: 1, dy: 0, dz: 1 });
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="2"]').waitFor();
  const idLie = await panneaux3d.locator('[data-studio-solide-relation="reference-liee"]').getAttribute("data-studio-solide");
  const idCopie = await panneaux3d.locator('[data-studio-solide-relation="copie-independante"]').getAttribute("data-studio-solide");
  check("TEST-006 : relations affichées dans la désignation — « référence liée · à jour » (36 m³), « copie indépendante · aucune propagation »",
    (await panneaux3d.locator(`[data-studio-solide-lien-texte="${idLie}"]`).textContent()) === "Lien : référence liée · à jour" && (await texteSolide(idLie)).includes("36 m³")
    && (await panneaux3d.locator(`[data-studio-solide-lien-texte="${idCopie}"]`).textContent()) === "Lien : copie indépendante · aucune propagation");
  check("TEST-005 : prisme selon le vecteur (1 ; 0 ; 1) — direction affichée, volume = aire × hauteur perpendiculaire (12 × 3 × 0,7071 ≈ 25,456 m³)",
    (await texteSolide(idCopie)).includes("direction (1 ; 0 ; 1)") && (await texteSolide(idCopie)).includes("25,456 m³"), await texteSolide(idCopie));
  await enregistrer();
  const doc2 = (await api("get", chemin2)).revision.document;
  const lie = doc2.solides.find((s) => s.id === idLie), copie = doc2.solides.find((s) => s.id === idCopie);
  check("TEST-006 : enregistrés avec leur relation et leur direction saisies",
    JSON.stringify(lie.source) === JSON.stringify({ objectId: "P", relation: "reference-liee" }) && JSON.stringify(lie.direction) === JSON.stringify({ x: 0, y: 0, z: 1 })
    && JSON.stringify(copie.source) === JSON.stringify({ objectId: "P", relation: "copie-independante" }) && JSON.stringify(copie.direction) === JSON.stringify({ x: 1, y: 0, z: 1 }), JSON.stringify(doc2.solides));
  // La polyligne est modifiée (5 × 3) : le serveur applique le même modèle — le prisme lié suit, la copie non.
  await commandes(chemin2, [{ toolId: "studio.dessin.modifier", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }], closed: true } }]);
  const doc3 = (await api("get", chemin2)).revision.document;
  check("TEST-006 : polyligne modifiée — le prisme lié est recalculé dans la même révision, la copie indépendante est intacte",
    JSON.stringify(doc3.solides.find((s) => s.id === idLie).profile) === JSON.stringify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }])
    && JSON.stringify(doc3.solides.find((s) => s.id === idCopie)) === JSON.stringify(copie), JSON.stringify(doc3.solides));
  // Cotes rattachées à la polyligne (TEST-007) : sommets 2-3, milieu du segment 1 au sommet 0, cotes angulaires 1-2 et 2-3.
  const cote = (id, a, pa, b, pb) => ({ toolId: "studio.dessin.cote", params: { id, type: "dimension", start: pa, end: pb, offset: 0.4, links: { start: { objectId: "P", anchor: a }, end: { objectId: "P", anchor: b } }, toResolve: false } });
  await commandes(chemin2, [
    cote("cv", "vertex-2", { x: 5, y: 3 }, "vertex-3", { x: 0, y: 3 }),
    cote("cm", "mid-1", { x: 5, y: 1.5 }, "vertex-0", { x: 0, y: 0 }),
    { toolId: "studio.dessin.cote-angulaire", params: { id: "a12", type: "angular-dimension", vertex: { x: 5, y: 3 }, first: { x: 5, y: 0 }, second: { x: 0, y: 3 }, radius: 0.5, links: { first: { objectId: "P", segment: 1 }, second: { objectId: "P", segment: 2 } }, toResolve: false } },
    { toolId: "studio.dessin.cote-angulaire", params: { id: "a23", type: "angular-dimension", vertex: { x: 0, y: 3 }, first: { x: 5, y: 3 }, second: { x: 0, y: 0 }, radius: 0.5, links: { first: { objectId: "P", segment: 2 }, second: { objectId: "P", segment: 3 } }, toResolve: false } },
  ]);
  await page.reload();
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await ouvrir3d();
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="2"]').waitFor();
  check("TEST-006 : relue, l'interface montre le volume recalculé du prisme lié (45 m³, à jour) et la copie inchangée (25,456 m³)",
    (await texteSolide(idLie)).includes("45 m³") && (await panneaux3d.locator(`[data-studio-solide-lien-texte="${idLie}"]`).textContent()) === "Lien : référence liée · à jour" && (await texteSolide(idCopie)).includes("25,456 m³"),
    `${await texteSolide(idLie)} | ${await texteSolide(idCopie)}`);

  // TEST-007 : diviser la face latérale 2 (arête (5, 0) → (5, 3)) du prisme lié, à 1,5 m : le milieu coté devient sommet.
  await panneaux3d.locator(`[data-studio-solide="${idLie}"]`).click();
  await flou();
  await page.keyboard.press("Control+Shift+V");
  await page.waitForFunction(() => document.querySelector('[data-studio-outil="studio.solide.face-diviser"]')?.getAttribute("aria-pressed") === "true");
  const formDivision = panneaux3d.locator(`[data-studio-face-diviser="${idLie}"]`);
  await formDivision.locator("[data-studio-division-choix]").selectOption("lateral-1");
  await formDivision.getByLabel("Distance depuis le début de l’arête (m)").fill("1.5");
  await formDivision.getByRole("button", { name: "Diviser la face", exact: true }).click();
  await attendre(1);
  check("TEST-007 : face divisée — prisme lié à 5 sommets, toujours à jour, même volume (45 m³)",
    (await texteSolide(idLie)).includes("Prisme sur profil de 5 sommets") && (await texteSolide(idLie)).includes("45 m³") && (await panneaux3d.locator(`[data-studio-solide-lien-texte="${idLie}"]`).textContent()) === "Lien : référence liée · à jour",
    await texteSolide(idLie));
  await enregistrer();
  const doc4 = (await api("get", chemin2)).revision.document;
  const d = (id) => doc4.dimensions.find((x) => x.id === id), an = (id) => doc4.annotations.find((x) => x.id === id);
  check("TEST-007 : arête source divisée, cotes réattachées de façon prouvée (sommets 2-3 → 3-4, milieu 1 → nouveau sommet 2), cote angulaire 2-3 → 3-4",
    JSON.stringify(doc4.objects.find((o) => o.id === "P").points) === JSON.stringify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1.5 }, { x: 5, y: 3 }, { x: 0, y: 3 }])
    && d("cv").links.start.anchor === "vertex-3" && d("cv").links.end.anchor === "vertex-4" && d("cv").toResolve === false
    && d("cm").links.start.anchor === "vertex-2" && d("cm").toResolve === false
    && an("a23").links.first.segment === 3 && an("a23").links.second.segment === 4 && an("a23").toResolve === false,
    JSON.stringify({ dims: doc4.dimensions, ann: doc4.annotations }));
  check("TEST-007 : la cote angulaire du segment divisé passe « à résoudre » (lien rompu, jamais rattachée à une moitié)", an("a12").toResolve === true && an("a12").links.first === null, JSON.stringify(an("a12")));

  // TEST-006 : source supprimée → « à résoudre », volume non évalué ; détachement explicite.
  await flou();
  await page.keyboard.press("Shift+D");
  await page.locator('[data-studio-objet="P"]').waitFor({ state: "attached" });
  await page.locator('[data-studio-objet="P"]').focus();
  await page.keyboard.press("Enter");
  await flou();
  await page.keyboard.press("Delete");
  await attendre(1);
  await ouvrir3d();
  await panneaux3d.locator(`[data-studio-solide="${idLie}"]`).waitFor();
  const choisi = panneaux3d.locator(`[data-studio-lien-solide="${idLie}"]`);
  if (!(await choisi.count())) await panneaux3d.locator(`[data-studio-solide="${idLie}"]`).click();
  await choisi.waitFor();
  check("TEST-006 : source supprimée — le prisme lié est « à résoudre », volume non évalué, mise à jour impossible, géométrie gardée",
    (await panneaux3d.locator(`[data-studio-solide="${idLie}"]`).getAttribute("data-studio-solide-lien")) === "a-resoudre" && (await texteSolide(idLie)).includes("volume non évalué")
    && (await choisi.getAttribute("data-studio-lien-etat")) === "a-resoudre" && (await choisi.locator("[data-studio-lien-mettre-a-jour]").isDisabled())
    && (await panneaux3d.locator(`[data-studio-solide-lien-texte="${idLie}"]`).textContent()) === "Lien : référence liée · à résoudre : polyligne source supprimée",
    await texteSolide(idLie));
  await page.screenshot({ path: join(OUT, "studio-faces-test-006.png") });
  await choisi.locator("[data-studio-lien-detacher]").click();
  await attendre(2);
  check("TEST-006 : « Détacher » en fait une copie indépendante, volume de nouveau évalué (45 m³)",
    (await panneaux3d.locator(`[data-studio-solide="${idLie}"]`).getAttribute("data-studio-solide-relation")) === "copie-independante" && (await texteSolide(idLie)).includes("45 m³"));
  await flou();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await attendre(0);
  check("annuler : suppression et détachement retirés, le prisme lié redevient à jour",
    (await panneaux3d.locator(`[data-studio-solide="${idLie}"]`).getAttribute("data-studio-solide-lien")) === "a-jour");
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette géométrie 3D de Studio (lot F1) : tous les contrôles passent.");
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (erreurs.length) console.error(erreurs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
