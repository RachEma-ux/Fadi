#!/usr/bin/env node
/**
 * Recette du lot W3-B (achèvement Studio, X.1-04 « immeuble multi-niveaux ») — API et application construites (même
 * origine), Chromium réel, compte et projet synthétiques ; toutes les dimensions sont des données de test, pas des
 * valeurs de projet (aucune vérification structurelle, aucune constante normative) :
 *
 *  - règle d'or : Niveau (Ctrl+F2), Composant (Ctrl+F3), Occurrence de composant (Ctrl+F6) et Élément structurel
 *    (Ctrl+F7), chacun son icône, rangés dans la famille Architecture ; ouverts au clavier, formulaires sans valeur proposée ;
 *  - niveaux comme objets : deux niveaux nommés avec leur cote ; poteau, poutre, dalle et occurrences rattachés ; un mur
 *    rattaché par « Niveau de rattachement » ; déplacer un niveau (nouvelle cote) translate ses seuls objets ;
 *  - composants : définition partagée, deux occurrences ; modifier la définition change les deux ; « Rendre unique » ;
 *  - vue par niveau : la planche et la vue 3D n'affichent que les objets du niveau choisi ;
 *  - refus : élément structurel sans valeur, message affiché, rien n'est écrit ;
 *  - échanges : IFC (IfcBuildingStorey réels, IfcColumn / IfcBeam / IfcSlab, IfcMappedItem), SVG en plan, métré.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-w3b node apps/web/e2e/studio-w3b.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-w3b";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
let echecs = 0;

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

async function compte(prefixe) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => erreurs.push(`${prefixe} : ${e.message}`));
  page.on("dialog", (d) => void d.accept());
  const email = `${prefixe}-${randomUUID().slice(0, 8)}@example.com`;
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', randomBytes(12).toString("hex"));
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, body) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE }, ...(body === undefined ? {} : { data: body }) });
    let json = null;
    try { json = await r.json(); } catch { json = null; }
    if (r.status() >= 400) throw new Error(`${method} ${path} → ${r.status()} ${JSON.stringify(json)}`);
    return json;
  };
  return { context, page, api };
}

const flou = (page) => page.evaluate(() => document.activeElement?.blur());
const enregistrer = async (page) => {
  await flou(page);
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
};
const remplir = async (form, champs) => { for (const [nom, v] of champs) await form.locator(`[data-studio-champ-batiment="${nom}"]`).fill(v); };
const choisir = async (form, nom, valeur) => form.locator(`[data-studio-champ-batiment="${nom}"]`).selectOption(valeur);
const proche = (a, b) => Math.abs(a - b) < 1e-9;

try {
  const { page, api, context } = await compte("w3b");
  const projet = await api("POST", "/projects", { code: `P.W3B.${randomUUID().slice(0, 6)}`, name: "Studio — lot W3-B (recette synthétique)" });
  const etude = await api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude W3-B" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const tete = async () => (await api("GET", chemin)).revision;
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const outils = page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');

  // ——— Règle d'or : quatre outils, icône propre, famille Architecture, raccourcis de la réserve ———
  const attendus = [["studio.niveau.definir", "Niveau", "Control+F2"], ["studio.composant.definir", "Composant", "Control+F3"], ["studio.composant.placer", "Occurrence de composant", "Control+F6"], ["studio.structure.element", "Élément structurel", "Control+F7"]];
  const traces = new Set();
  let regle = true;
  for (const [id, libelle, raccourci] of attendus) {
    const b = outils.locator(`[data-studio-outil="${id}"][aria-label="${libelle}"][aria-keyshortcuts="${raccourci}"]`);
    if ((await b.count()) !== 1) { regle = false; continue; }
    traces.add(await b.locator("svg path").first().getAttribute("d"));
    if ((await b.evaluate((x) => x.closest("[data-studio-famille]")?.getAttribute("data-studio-famille"))) !== "architecture") regle = false;
  }
  check("X.1-04 (règle d'or) : Niveau Ctrl+F2, Composant Ctrl+F3, Occurrence Ctrl+F6, Élément structurel Ctrl+F7 — chacun son icône, famille Architecture", regle && traces.size === 4);

  // ——— Niveaux : deux niveaux nommés, cote saisie ———
  await flou(page);
  await page.keyboard.press("Control+F2");
  const formNiveau = page.locator("[data-studio-niveau-formulaire]");
  await formNiveau.waitFor();
  check("X.1-04 : Ctrl+F2 ouvre le formulaire Niveau, aucune valeur proposée", (await formNiveau.locator('[data-studio-champ-batiment="niveau-cote"]').inputValue()) === "");
  for (const [nom, cote] of [["Rez-de-chaussée", "0"], ["Étage 1", "3.2"]]) {
    await remplir(formNiveau, [["niveau-nom", nom], ["niveau-cote", cote]]);
    await formNiveau.locator("[data-studio-creer-niveau]").click();
  }
  await page.locator("[data-studio-niveaux-liste] li").nth(1).waitFor();
  const niveaux = await page.locator("[data-studio-niveaux-liste] li").evaluateAll((ls) => ls.map((l) => [l.getAttribute("data-studio-niveau"), Number(l.getAttribute("data-studio-niveau-cote"))]));
  check("X.1-04 : deux niveaux objets créés au clavier, rangés par cote (0 ; 3,2 m)", niveaux.length === 2 && niveaux[0][1] === 0 && niveaux[1][1] === 3.2, JSON.stringify(niveaux));
  const [rez, etage] = niveaux.map((n) => n[0]);

  // ——— Éléments structurels : refus sans valeur, puis poteau, poutre, dalle rattachés à l'étage ———
  await flou(page);
  await page.keyboard.press("Control+F7");
  const formStructure = page.locator("[data-studio-structure-formulaire]");
  await formStructure.waitFor();
  const avantRefus = JSON.stringify((await page.evaluate(() => document.querySelectorAll("[data-studio-architecture]").length)));
  await formStructure.evaluate((f) => f.requestSubmit ? f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })) : null);
  const alerte = page.getByRole("alert").filter({ hasText: /aucune valeur n’est proposée/ });
  check("X.1-04 [−] : élément structurel sans valeur — refus affiché, rien n'est dessiné", (await alerte.count()) > 0 && JSON.stringify(await page.evaluate(() => document.querySelectorAll("[data-studio-architecture]").length)) === avantRefus);
  const creerStructure = async (type, champs) => {
    await choisir(formStructure, "structure-type", type);
    await choisir(formStructure, "structure-niveau", etage);
    await remplir(formStructure, champs);
    await formStructure.locator("[data-studio-creer-structure]").click();
  };
  await creerStructure("column", [["structure-geometrie", "1 1"], ["structure-largeur", "0.3"], ["structure-profondeur", "0.3"], ["structure-hauteur", "3"], ["structure-base", "0"], ["structure-orientation", "0"]]);
  await creerStructure("beam", [["structure-geometrie", "1 1; 7 1"], ["structure-largeur", "0.2"], ["structure-hauteur", "0.4"], ["structure-base", "2.6"]]);
  await creerStructure("slab", [["structure-geometrie", "0 0; 8 0; 8 6; 0 6"], ["structure-hauteur", "0.2"], ["structure-base", "3"]]);
  for (const t of ["column", "beam", "slab"]) await page.locator(`[data-studio-architecture][data-studio-type="${t}"]`).first().waitFor();
  check("X.1-04 : poteau, poutre et dalle créés et dessinés en plan (emprise)", (await page.locator('[data-studio-architecture][data-studio-type="column"], [data-studio-architecture][data-studio-type="beam"], [data-studio-architecture][data-studio-type="slab"]').count()) === 3);

  // ——— Composant partagé et deux occurrences ———
  await flou(page);
  await page.keyboard.press("Control+F3");
  const formComposant = page.locator("[data-studio-composant-formulaire]");
  await formComposant.waitFor();
  await remplir(formComposant, [["composant-nom", "Gaine"], ["composant-boites", "0 0 0 0.2 0.2 3"]]);
  await formComposant.locator("[data-studio-definir-composant]").click();
  await page.locator("[data-studio-composants-liste] li").first().waitFor();
  const composantId = await page.locator("[data-studio-composants-liste] li").first().getAttribute("data-studio-composant");
  await flou(page);
  await page.keyboard.press("Control+F6");
  const formOcc = page.locator("[data-studio-occurrence-formulaire]");
  await formOcc.waitFor();
  for (const [niveau, x] of [[etage, "5"], [rez, "5"]]) {
    await choisir(formOcc, "occurrence-composant", composantId);
    await choisir(formOcc, "occurrence-niveau", niveau);
    await remplir(formOcc, [["occurrence-x", x], ["occurrence-y", "5"], ["occurrence-z", "0"], ["occurrence-orientation", "0"]]);
    await formOcc.locator("[data-studio-placer-occurrence]").click();
  }
  await page.locator("[data-studio-occurrences-liste] li").nth(1).waitFor();
  await enregistrer(page);
  let doc = (await tete()).document;
  const poteau = doc.architecture.find((a) => a.type === "column");
  const occs = doc.occurrences ?? [];
  check("X.1-04 : enregistré par le serveur — deux niveaux, poteau / poutre / dalle rattachés à l'étage (cote absolue = cote du niveau + saisie), une définition, deux occurrences",
    doc.niveaux?.length === 2 && ["column", "beam", "slab"].every((t) => doc.architecture.find((a) => a.type === t)?.niveauId === etage)
    && proche(poteau.base, 3.2) && proche(doc.architecture.find((a) => a.type === "beam").base, 5.8) && doc.composants?.length === 1 && occs.length === 2
    && proche(occs.find((o) => o.niveauId === etage).placement.origin.z, 3.2), JSON.stringify({ niveaux: doc.niveaux, poteau, occs }).slice(0, 300));

  // ——— Un mur rattaché à l'étage depuis le panneau Architecture ———
  const chemins = async (cs) => api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `w3b-${randomUUID()}`, baseRevisionId: (await tete()).id, commands: cs });
  await chemins([{ toolId: "studio.architecture.mur", params: { id: "m-etage", type: "wall", axis: [{ x: 0, y: 8 }, { x: 6, y: 8 }], thickness: 0.2, height: 3, base: 3.2, justification: "center" } }]);
  await page.reload();
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await page.locator('[data-studio-architecture="m-etage"]').click();
  const rattacher = page.locator('[data-studio-rattacher-niveau="m-etage"]');
  await rattacher.waitFor();
  await rattacher.selectOption(etage);
  await page.waitForFunction(() => document.querySelector('[data-studio-rattacher-niveau="m-etage"]')?.value);
  await enregistrer(page);
  doc = (await tete()).document;
  check("X.1-04 : un mur existant rattaché à l'étage (Modifier, même identifiant, cote inchangée)", doc.architecture.find((a) => a.id === "m-etage")?.niveauId === etage && doc.architecture.find((a) => a.id === "m-etage").base === 3.2);

  // ——— Déplacer l'étage : ses objets suivent, ceux du rez ne bougent pas ———
  await flou(page);
  await page.keyboard.press("Control+F2");
  await page.locator(`[data-studio-editer-niveau="${etage}"]`).click();
  await page.locator('[data-studio-champ-batiment="edition-niveau-cote"]').fill("4");
  await page.locator("[data-studio-modifier-niveau]").click();
  await page.locator(`[data-studio-niveau="${etage}"][data-studio-niveau-cote="4"]`).waitFor();
  await enregistrer(page);
  const avant = doc;
  doc = (await tete()).document;
  const z = (d, id) => d.occurrences.find((o) => o.id === id).placement.origin.z;
  const base = (d, id) => d.architecture.find((a) => a.id === id).base;
  const occEtage = occs.find((o) => o.niveauId === etage).id, occRez = occs.find((o) => o.niveauId === rez).id;
  check("X.1-04 : déplacer l'étage (3,2 → 4 m) translate de 0,8 m ses poteau, poutre, dalle, mur et occurrence ; l'occurrence du rez ne bouge pas",
    ["m-etage", poteau.id].every((id) => proche(base(doc, id) - base(avant, id), 0.8)) && proche(z(doc, occEtage) - z(avant, occEtage), 0.8) && z(doc, occRez) === z(avant, occRez));

  // ——— Modifier la définition : les deux occurrences changent ; Rendre unique ———
  await flou(page);
  await page.keyboard.press("Control+F3");
  await page.locator(`[data-studio-editer-composant="${composantId}"]`).click();
  await page.locator('[data-studio-champ-batiment="composant-boites"]').fill("0 0 0 0.4 0.4 3");
  await page.locator("[data-studio-definir-composant]").click();
  await enregistrer(page);
  doc = (await tete()).document;
  check("X.1-04 : modifier la définition change ses deux occurrences (géométrie dérivée, occurrences inchangées)", doc.composants[0].solides[0].width === 0.4 && JSON.stringify(doc.occurrences) === JSON.stringify((await tete()).document.occurrences) && doc.occurrences.every((o) => o.composantId === composantId));
  await flou(page);
  await page.keyboard.press("Control+F6");
  await page.locator(`[data-studio-rendre-unique="${occRez}"]`).click();
  await enregistrer(page);
  doc = (await tete()).document;
  check("X.1-04 : rendre unique — une définition copiée, l'occurrence du rez la désigne seule", doc.composants.length === 2 && doc.occurrences.find((o) => o.id === occRez).composantId !== composantId && doc.occurrences.find((o) => o.id === occEtage).composantId === composantId);

  // ——— Vue par niveau : planche et vue 3D ———
  const tousEnPlan = await page.locator("[data-studio-architecture]").count();
  await page.locator("[data-studio-vue-niveau]").selectOption(rez);
  await page.waitForFunction((n) => document.querySelectorAll("[data-studio-architecture]").length < n, tousEnPlan);
  const rezEnPlan = await page.locator("[data-studio-architecture]").count();
  await page.locator("[data-studio-vue-niveau]").selectOption(etage);
  await page.waitForFunction(() => document.querySelectorAll('[data-studio-architecture][data-studio-type="column"]').length === 1);
  const etageEnPlan = await page.locator("[data-studio-architecture]").count();
  check("X.1-04 : vue par niveau — la planche n'affiche que les objets du niveau choisi (rez : aucun, étage : mur, poteau, poutre, dalle)", rezEnPlan === 0 && etageEnPlan === 4 && tousEnPlan === 4, `${tousEnPlan} / ${rezEnPlan} / ${etageEnPlan}`);
  await flou(page);
  await page.keyboard.press("Shift+D");
  const vue3d = page.locator("section[data-studio-vue3d]");
  await vue3d.waitFor();
  await page.waitForFunction(() => document.querySelector("section[data-studio-vue3d]")?.getAttribute("data-studio-maillage") === "pret" || document.querySelector("section[data-studio-vue3d]")?.getAttribute("data-studio-architecture-3d") !== null);
  await page.waitForFunction(() => Number(document.querySelector("section[data-studio-vue3d]")?.getAttribute("data-studio-occurrences-3d")) === 1);
  check("X.1-04 : vue 3D de l'étage — quatre objets architecturaux et une occurrence (celle de l'étage)", (await vue3d.getAttribute("data-studio-architecture-3d")) === "4" && (await vue3d.getAttribute("data-studio-occurrences-3d")) === "1");
  await page.screenshot({ path: `${OUT}/vue-niveau-etage.png`, fullPage: false });
  await page.locator("[data-studio-vue-niveau]").selectOption("");
  await page.waitForFunction(() => Number(document.querySelector("section[data-studio-vue3d]")?.getAttribute("data-studio-occurrences-3d")) === 2);
  check("X.1-04 : tous les niveaux — deux occurrences en vue 3D", (await vue3d.getAttribute("data-studio-occurrences-3d")) === "2");

  // ——— Échanges ———
  const ifc = await (await context.request.get(`${BASE}${chemin}/export?format=ifc`)).text();
  const n = (re) => (ifc.match(re) ?? []).length;
  check("X.1-04 : export IFC — trois IfcBuildingStorey (référence, rez, étage à 4 m), IfcColumn / IfcBeam / IfcSlab, deux IfcMappedItem d'un type partagé",
    n(/^#\d+=IFCBUILDINGSTOREY\(/gm) === 3 && /IFCBUILDINGSTOREY\([^\n]*,4\.\)/.test(ifc) && n(/^#\d+=IFCCOLUMN\(/gm) === 1 && n(/^#\d+=IFCBEAM\(/gm) === 1 && n(/^#\d+=IFCSLAB\(/gm) === 1
    && n(/^#\d+=IFCMAPPEDITEM\(/gm) === 2 && n(/^#\d+=IFCBUILDINGELEMENTPROXYTYPE\(/gm) === 2 && n(/^#\d+=IFCRELDEFINESBYTYPE\(/gm) === 2);
  const svg = await (await context.request.get(`${BASE}${chemin}/export?format=svg`)).text();
  check("X.1-04 : export SVG — poteau, poutre et dalle tracés en plan", ["column", "beam", "slab"].every((t) => svg.includes(`data-architecture="${t}"`)));
  const rapport = await api("GET", `${chemin}/export/rapport?format=ifc`);
  const raisons = new Set(rapport.lignes.map((l) => `${l.categorie}.${l.type}:${l.raison}`));
  check("X.1-04 : rapport de fidélité IFC — niveaux en étages, définitions en type partagé, occurrences en représentation partagée, structure extrudée exacte",
    ["niveaux.niveau:niveau-en-etage", "composants.composant:type-partage", "occurrences.occurrence:occurrence-partagee", "architecture.column:extrusion-exacte"].every((r) => raisons.has(r)));
  await page.screenshot({ path: `${OUT}/batiment.png`, fullPage: false });
} catch (e) {
  console.error(e);
  echecs += 1;
} finally {
  for (const e of erreurs) console.log(`✗ erreur de page : ${e}`);
  await browser.close();
}
if (erreurs.length) echecs += erreurs.length;
console.log(echecs ? `✗ ${echecs} échec(s)` : "✓ recette studio-w3b réussie");
process.exit(echecs ? 1 : 0);
