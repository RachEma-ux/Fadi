#!/usr/bin/env node
/**
 * Recette de la visualisation de Studio (lot E.5-01 à E.5-05) sur l'API réelle et l'application construite (même
 * origine, base migrée) :
 * - scène créée par son outil (V) dans la vue 3D, enregistrée (Ctrl+S), relue après actualisation et rappelée (F) :
 *   la vue reprend caméra, calques montrés et mode d'affichage, sans aucune commande envoyée ;
 * - apparence d'affichage d'un mur : la géométrie, les murs, les solides, les exports SVG / DXF et l'effectif IFC sont
 *   inchangés ;
 * - « Exporter le rendu PNG » (F4) : un vrai PNG du canevas WebGL, provenance incluse (bloc iTXt : étude, variante,
 *   révision, scène, date, « rendu du modèle ») ; d'une révision historique, la provenance porte cette révision ;
 * - les rendus « Illustration IA contrainte » et « Exploration libre » sont annoncés indisponibles, sans bouton.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-visualisation.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

/** Textes iTXt / tEXt d'un PNG (lecture indépendante de celle de l'application). */
function textesPng(octets) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (sig.some((o, i) => octets[i] !== o)) return null;
  const out = {};
  for (let i = 8; i + 12 <= octets.length;) {
    const n = octets.readUInt32BE(i), type = octets.toString("latin1", i + 4, i + 8), d = octets.subarray(i + 8, i + 8 + n);
    if (type === "iTXt") {
      const z = d.indexOf(0), cle = d.toString("latin1", 0, z);
      let j = z + 3; j = d.indexOf(0, j) + 1; j = d.indexOf(0, j) + 1;
      out[cle] = d.toString("utf8", j);
    }
    if (type === "IEND") break;
    i += 12 + n;
  }
  return out;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-visu-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-visualisation-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r;
  };
  const json = async (method, path, data) => (await api(method, path, data)).json();

  // Projet, étude et modèle synthétiques : un calque, une ligne extrudée, un mur et son ouverture, une boîte.
  const projet = await json("post", "/projects", { code: "P.STU.VISU", name: "Studio — visualisation" });
  const etude = await json("post", `/projects/${projet.id}/studio/studies`, { name: "Étude visualisation" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const envoyer = async (base, commands) => (await json("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `visu-${Date.now()}-${Math.random()}`, baseRevisionId: base, commands })).revision;
  const modele = await envoyer(etude.revision.id, [
    { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
    { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } } },
    { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 4 }, { x: 6, y: 4 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
    { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
    { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 8, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
  ]);
  check("préparation : modèle enregistré par les commandes (mur, ouverture, ligne extrudée, boîte)", modele.document.architecture?.length === 2 && modele.document.solides?.length === 1);

  const envois = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/variants\/[^/]+\/commands$/.test(new URL(r.url()).pathname)) envois.push(r.postDataJSON()); });
  const adresse = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  await page.goto(adresse);
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  await outils.waitFor();
  const ouvrir3d = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+D");
    await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor();
    await page.waitForTimeout(300);
  };
  const vue = page.locator("[data-studio-vue3d]");
  const sansFocus = () => page.evaluate(() => document.activeElement?.blur());

  // Règle d'or : chaque outil de la famille Visualisation a son bouton, son icône et son raccourci dans la barre.
  const attendus = [["studio.scene.creer", "V"], ["studio.scene.modifier", "F2"], ["studio.scene.rappeler", "F"], ["studio.scene.supprimer", "Control+Shift+X"], ["studio.apparence.definir", "T"], ["studio.apparence.retirer", "Control+Shift+L"]];
  for (const [id, r] of attendus) check(`barre : ${id} présent, raccourci ${r}, icône dessinée`, (await outils.locator(`[data-studio-outil="${id}"][aria-keyshortcuts="${r}"] svg path`).count()) === 1);
  check("barre : « Exporter le rendu PNG » (F4) présent", (await outils.locator('[data-studio-commande="exporter-png"][aria-keyshortcuts="F4"] svg path').count()) === 1);

  // E.5-04 : types de rendu ; seuls le rendu du modèle a un bouton.
  await ouvrir3d();
  check("rendus : « Rendu du modèle » disponible avec un bouton d'export", (await vue.locator('[data-studio-rendu="rendu-modele"][data-studio-disponible="oui"] [data-studio-exporter-png]').count()) === 1);
  for (const id of ["illustration-ia", "exploration-libre"]) {
    const li = vue.locator(`[data-studio-rendu="${id}"]`);
    check(`rendus : ${id} annoncé non disponible, sans aucun bouton`, (await li.getAttribute("data-studio-disponible")) === "non" && (await li.locator("button, a").count()) === 0 && (await li.textContent()).includes("Non disponible"));
  }

  // E.5-01 : nouvelle scène par son raccourci V, après réglages (nom, mode filaire, calques montrés).
  await vue.locator("[data-studio-scene-nom]").fill("Vue de recette");
  await vue.locator("[data-studio-scene-mode]").selectOption("wireframe");
  await sansFocus();
  check("mode d'affichage filaire appliqué à la vue", (await vue.getAttribute("data-studio-affichage")) === "wireframe");
  await page.keyboard.press("v");
  await vue.locator("[data-studio-scene]").first().waitFor();
  const sceneId = await vue.locator("[data-studio-scene]").first().getAttribute("data-studio-scene");
  check("Nouvelle scène (V) : scène listée et active", !!sceneId && (await vue.getAttribute("data-studio-scene-active")) === sceneId);
  const avantEnr = envois.length;
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const envoi = envois[avantEnr];
  check("enregistrement : une commande studio.scene.creer", envoi?.commands.length === 1 && envoi.commands[0].toolId === "studio.scene.creer", JSON.stringify(envoi?.commands));
  const tete1 = await json("get", variantePath);
  const sc = tete1.revision.document.scenes?.[0];
  check("serveur : scène enregistrée dans la liste `scenes`, repère local-3d, caméra perspective relevée", sc?.id === sceneId && sc.type === "scene" && sc.frame === "local-3d" && sc.name === "Vue de recette" && sc.camera.projection === "perspective" && sc.camera.fov > 0 && sc.displayMode === "wireframe", JSON.stringify(sc));
  check("serveur : calques montrés = calques visibles (implicite et Murs)", JSON.stringify([...(sc?.visibleLayers ?? [])].sort()) === JSON.stringify(["default", "murs"]));
  const refuse = await page.request.post(`${BASE}${variantePath}/commands`, { data: { contractVersion: "studio-commands/1", requestId: `visu-refus-${Date.now()}`, baseRevisionId: tete1.revision.id, commands: [{ toolId: "studio.scene.creer", params: { ...sc, id: "autre", frame: "local-2d" } }] } });
  check("serveur : une scène hors repère local-3d est refusée (400)", refuse.status() === 400, String(refuse.status()));

  // Actualisation, navigation (la vue n'est plus la scène), puis rappel (F) : caméra, calques, mode repris.
  await page.reload();
  await outils.waitFor();
  await ouvrir3d();
  check("après actualisation : scène relue, vue du dessin (aucune scène active, mode initial)", (await vue.locator(`[data-studio-scene="${sceneId}"]`).count()) === 1 && (await vue.getAttribute("data-studio-scene-active")) === "" && (await vue.getAttribute("data-studio-affichage")) === "shaded-edges");
  const canevas = vue.locator("canvas[data-studio-vue3d-canvas]");
  const boite = await canevas.boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + 120, boite.y + boite.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await vue.locator(`[data-studio-scene="${sceneId}"]`).click();
  const envoisAvantRappel = envois.length;
  await sansFocus();
  await page.keyboard.press("f");
  await page.locator(`[data-studio-vue3d][data-studio-scene-active="${sceneId}"]`).waitFor();
  check("Rappeler (F) : la vue reprend la scène (caméra, calques, mode filaire)", (await vue.getAttribute("data-studio-affichage")) === "wireframe" && (await vue.getAttribute("data-studio-calques-montres")).split(" ").sort().join() === "default,murs");
  check("Rappeler : aucune commande, aucune modification en attente", envois.length === envoisAvantRappel && (await page.locator("[data-studio-annuler-portee]").textContent()).includes("(0 commande(s)"));

  // E.5-02 : apparence d'affichage du mur, géométrie et données constructives inchangées.
  const docAvant = (await json("get", variantePath)).revision;
  const exporter = async (format, revision) => (await api("get", `${variantePath}/export?format=${format}&revision=${encodeURIComponent(revision)}`)).text();
  const [svgAvant, dxfAvant, ifcAvant] = [await exporter("svg", docAvant.id), await exporter("dxf", docAvant.id), await exporter("ifc", docAvant.id)];
  await vue.locator("[data-studio-apparence-cible]").selectOption("object:m1");
  await vue.locator("[data-studio-apparence-couleur]").fill("#c0392b");
  await vue.locator("[data-studio-apparence-finition]").selectOption("gloss");
  await sansFocus();
  await page.keyboard.press("t");
  await vue.locator('[data-studio-apparence-etat="definie"]').waitFor();
  check("brouillon non enregistré : export PNG désactivé, raison affichée", await vue.locator("[data-studio-exporter-png]").isDisabled() && (await vue.locator("[data-studio-rendu-raison]").textContent()).includes("Enregistrez d’abord"));
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const docApres = (await json("get", variantePath)).revision;
  const ap = docApres.document.scenes?.find((s) => s.type === "appearance");
  check("serveur : apparence d'affichage enregistrée (mur m1, #c0392b, brillante)", ap?.target?.kind === "object" && ap.target.id === "m1" && ap.color === "#c0392b" && ap.finish === "gloss", JSON.stringify(ap));
  const constructif = (d) => JSON.stringify({ objects: d.objects, layers: d.layers, dimensions: d.dimensions, solides: d.solides, annotations: d.annotations, architecture: d.architecture });
  check("géométrie inchangée : objets, calques, murs, ouvertures et solides identiques", constructif(docApres.document) === constructif(docAvant.document));
  check("exports SVG et DXF identiques octet pour octet", (await exporter("svg", docApres.id)) === svgAvant && (await exporter("dxf", docApres.id)) === dxfAvant);
  const effectif = (t) => ["IFCWALL", "IFCOPENINGELEMENT", "IFCEXTRUDEDAREASOLID", "IFCMATERIAL", "IFCSURFACESTYLE", "IFCBUILDINGELEMENTPROXY"].map((e) => (t.match(new RegExp(`=\\s*${e}\\(`, "g")) ?? []).length).join(",");
  const ifcApres = await exporter("ifc", docApres.id);
  check("IFC : mêmes entités constructives, aucune couleur ni matériau ajouté", effectif(ifcApres) === effectif(ifcAvant) && !ifcApres.includes("c0392b"), `${effectif(ifcAvant)} / ${effectif(ifcApres)}`);

  // E.5-03 : rendu du modèle (F4) de la scène rappelée, provenance incluse.
  await vue.locator(`[data-studio-scene="${sceneId}"]`).click();
  await sansFocus();
  await page.keyboard.press("f");
  await page.locator(`[data-studio-vue3d][data-studio-scene-active="${sceneId}"]`).waitFor();
  // Le maillage de la scène (tous calques affichés, filtré) est calculé en tâche de fond : l'export attend qu'il soit à jour.
  await vue.locator("[data-studio-exporter-png]:not([disabled])").waitFor();
  const telechargement = page.waitForEvent("download");
  await page.keyboard.press("F4");
  const fichier = await telechargement;
  const octets = readFileSync(await fichier.path());
  const textes = textesPng(octets);
  const p = textes?.["fadi:rendu"] ? JSON.parse(textes["fadi:rendu"]) : null;
  check("PNG : vrai fichier PNG tiré du canevas", !!textes && octets.length > 1000, String(octets.length));
  check("provenance : « rendu du modèle », étude, variante, révision de tête, scène, date", p?.nature === "rendu du modèle" && p.schema === "studio-rendu/1" && p.etude?.nom === "Étude visualisation" && p.variante?.id === variantId && p.revisionId === docApres.id && p.scene?.id === sceneId && p.scene.nom === "Vue de recette" && Math.abs(Date.parse(p.date) - Date.now()) < 120_000 && p.repere === "local-3d", JSON.stringify(p));
  check("PNG : nom de fichier dérivé de la variante, de la scène et de la révision", fichier.suggestedFilename() === `rendu-Variante-initiale-Vue-de-recette-${docApres.id.slice(-8).replace(/[^A-Za-z0-9]+/g, "-")}.png`, fichier.suggestedFilename());

  // Révision historique (celle de la scène seule) : lecture seule, l'export porte cette révision.
  await page.goto(`${adresse}?revision=${encodeURIComponent(tete1.revision.id)}`);
  await outils.waitFor();
  await ouvrir3d();
  check("révision historique : création de scène indisponible (lecture seule)", await vue.locator('[data-studio-scene-action="studio.scene.creer"]').isDisabled());
  await vue.locator("[data-studio-exporter-png]:not([disabled])").waitFor();
  const telechargementHist = page.waitForEvent("download");
  await vue.locator("[data-studio-exporter-png]").click();
  const pHist = JSON.parse(textesPng(readFileSync(await (await telechargementHist).path()))?.["fadi:rendu"] ?? "null");
  check("révision historique : la provenance porte la révision affichée", pHist?.revisionId === tete1.revision.id && pHist.revisionId !== docApres.id && pHist.nature === "rendu du modèle", JSON.stringify(pHist));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.log(`✗ recette interrompue — ${e instanceof Error ? e.stack : e}`);
} finally {
  await browser.close();
}
console.log(echecs ? `${echecs} contrôle(s) en échec` : "Recette visualisation : tous les contrôles passent");
process.exit(echecs ? 1 : 0);
