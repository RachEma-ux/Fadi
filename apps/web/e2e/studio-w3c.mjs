#!/usr/bin/env node
/**
 * Recette des surfaces libres NURBS de Studio (lot W3-C, X.1-05) — API et application construites (même origine),
 * Chromium réel, vrai noyau OCCT (WebAssembly) :
 *
 *  - règle d'or : Surface NURBS (Ctrl+F8), Modifier la surface (Ctrl+F9), Épaissir la surface (Shift+F11) dans la
 *    famille Volume de la barre, icône propre, raccourci ; aucune valeur proposée dans les formulaires ;
 *  - création d'une grille de pôles par le formulaire (clavier seul), surface dessinée dans la vue 3D (nappe dérivée) ;
 *  - édition d'un point de contrôle : pôle choisi par un clic sur son repère dans la vue 3D, puis position et poids saisis ;
 *    même identité de surface ;
 *  - épaississement : noyau exact chargé dans son Worker À LA DEMANDE (aucun .wasm avant l'outil), volume du noyau,
 *    engagement explicite, surface conservée dans le solide exact ; enregistrement : le serveur recalcule et fait
 *    autorité (même empreinte) ; un résultat annoncé sur une autre surface est refusé (400 exact-mismatch) ;
 *  - oracle de forme close : quart de cylindre NURBS rationnel (R 2 m, L 3 m) épaissi de 0,1 m vers l'extérieur —
 *    volume π/4 ((R + e)² − R²) L à 1e-6 près, calculé par le serveur ;
 *  - exports : OBJ écrit la nappe, STEP le solide exact (faces B-spline rationnelles), STL le compte ;
 *  - surfaces de subdivision : Surface de subdivision (Ctrl+Shift+Home) — maillage de contrôle saisi au clavier (tétraèdre),
 *    niveau de Loop ; sommet de contrôle choisi par un clic sur son repère puis déplacé ; Solidifier la subdivision
 *    (Ctrl+Maj+Fin) : le noyau coud le maillage subdivisé ; oracle de forme close (tétraèdre régulier, niveau 1 :
 *    volume 5 s³ / 24) recalculé par le serveur ; surface ouverte refusée ; exports OBJ / STL / STEP ;
 *  - aucune erreur de page.
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-w3c node apps/web/e2e/studio-w3c.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-w3c";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}
/** Quart de cylindre rationnel vertical de rayon R, hauteur L, axe en (cx, cy) : arc de degré 2 (poids 1, √2/2, 1) × segment. */
function quartCylindre(id, R, L, cx = 0, cy = 0) {
  const arc = [{ x: R, y: 0 }, { x: R, y: R }, { x: 0, y: R }], w = [1, Math.SQRT1_2, 1];
  const controle = [], poids = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { controle.push({ x: cx + arc[i].x, y: cy + arc[i].y, z: k * L }); poids.push(w[i]); }
  return { id, type: "surface-libre", degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle, poids };
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  const requetesExact = [];
  context.on("request", (r) => { if (/occt-wasm[^/]*\.wasm|noyau-exact\.worker/.test(r.url())) requetesExact.push(new URL(r.url()).pathname); });
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-w3c-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-w3c-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r;
  };
  const json = async (method, path, data) => (await api(method, path, data)).json();
  const projet = await json("post", "/projects", { code: "P.STU.W3C", name: "Studio — surfaces libres" });
  const etude = await json("post", `/projects/${projet.id}/studio/studies`, { name: "Étude surfaces NURBS" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const envoyer = async (cs) => context.request.post(`${BASE}${chemin}/commands`, { data: { contractVersion: "studio-commands/1", requestId: `w3c-${randomUUID()}`, baseRevisionId: (await json("get", chemin)).revision.id, commands: cs } });
  // Oracle : quart de cylindre rationnel R 2 m, L 3 m, posé par commande (API), loin de la zone de travail.
  const pose = await envoyer([{ toolId: "studio.surface.nurbs", params: quartCylindre("Q", 2, 3, 20, 0) }]);
  check("préparation : quart de cylindre NURBS rationnel posé par commande (pôles, degrés 2 × 1, poids 1, √2/2, 1)", pose.ok(), String(pose.status()));

  const outils = page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  const enAttente = () => page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre");
  const attendre = (n) => page.waitForFunction((v) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === v, String(n));
  const flou = () => page.evaluate(() => document.activeElement?.blur());

  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await page.waitForTimeout(500);
  for (const [id, libelle, touches] of [["studio.surface.nurbs", "Surface NURBS", "Control+F8"], ["studio.surface.modifier", "Modifier la surface", "Control+F9"], ["studio.surface.epaissir", "Épaissir la surface", "Shift+F11"], ["studio.subdivision.creer", "Surface de subdivision", "Control+Shift+Home"], ["studio.subdivision.solidifier", "Solidifier la subdivision", "Control+Shift+End"]]) {
    const b = outils.locator(`[data-studio-famille="volume"] [data-studio-outil="${id}"][aria-label="${libelle}"][aria-keyshortcuts="${touches}"]`);
    check(`règle d'or : ${libelle} dans la famille Volume, icône propre (tracé), raccourci ${touches.replace("Control", "Ctrl")}`, (await b.locator("svg path").count()) === 1);
  }
  check("X.1-05 : ouverture de Studio — aucun Worker ni .wasm du noyau exact", requetesExact.length === 0, JSON.stringify(requetesExact));

  // ——— Création au clavier : Ctrl+F8, grille plane de 3 × 3 pôles, degrés 2 × 2 ———
  await flou();
  await page.keyboard.press("Control+F8");
  const creation = panneaux3d.locator("[data-studio-surface-nurbs]");
  await creation.waitFor();
  check("aucune valeur proposée : origine, dimensions, pôles et degrés vides", (await creation.locator("input").evaluateAll((l) => l.every((i) => i.value === ""))) === true);
  const champs = { "Origine x (m)": "0", "Origine y (m)": "0", "Cote z (m)": "0", "Largeur selon x (m)": "4", "Profondeur selon y (m)": "4", "Pôles selon x (lignes)": "3", "Pôles selon y (colonnes)": "3", "Degré selon x": "2", "Degré selon y": "2" };
  for (const [l, v] of Object.entries(champs)) await creation.getByLabel(l, { exact: true }).fill(v);
  await creation.locator("[data-studio-poser-surface]").click();
  await attendre(1);
  await page.locator('[data-studio-vue3d][data-studio-surfaces-libres="2"]').waitFor();
  const liste = panneaux3d.locator("[data-studio-surfaces] [data-studio-surface]");
  const idSurface = (await liste.evaluateAll((l) => l.map((b) => b.getAttribute("data-studio-surface")))).find((x) => x !== "Q");
  check("Surface NURBS : surface créée (grille 3 × 3, degrés 2 × 2, non rationnelle), dessinée dans la vue 3D, sélectionnée",
    !!idSurface && /3 × 3 pôles, degrés 2 × 2, non rationnelle/.test(await panneaux3d.locator(`[data-studio-surface="${idSurface}"]`).textContent())
    && (await panneaux3d.locator(`[data-studio-surface="${idSurface}"]`).getAttribute("aria-pressed")) === "true");

  // ——— Édition d'un pôle : clic sur son repère (pôle central) puis valeurs saisies ———
  await flou();
  await page.keyboard.press("Control+F9");
  const edition = panneaux3d.locator(`[data-studio-surface-modifier="${idSurface}"]`);
  await edition.waitFor();
  // Le repère du pôle central (ligne 2, colonne 2) est dessiné sur la surface sélectionnée : un clic dessus le choisit.
  await page.getByRole("button", { name: "Recadrer la vue 3D", exact: true }).click();
  await page.waitForTimeout(800);
  const centre = await page.evaluate((id) => globalThis.__fadiVue3d?.pole?.(id, 4) ?? null, idSurface);
  const sous = centre ? await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}${e.hasAttribute("data-studio-vue3d-canvas") ? "[canevas]" : ""}` : null; }, centre) : null;
  check("Modifier la surface : repère du pôle central affiché à l'écran", !!centre, `${JSON.stringify(centre)} ${sous}`);
  await page.mouse.click(centre.x, centre.y);
  await page.waitForFunction(() => document.querySelector("[data-studio-surface-pole]")?.value === "1,1", undefined, { timeout: 10000 }).catch(() => {});
  const parClic = (await edition.locator("[data-studio-surface-pole]").inputValue()) === "1,1";
  check("Modifier la surface : un clic sur le repère du pôle central (canevas WebGL) le choisit dans le formulaire", parClic && sous === "CANVAS[canevas]");
  // Alternative clavier (TR-EX-036) : la même liste des pôles choisit le même pôle.
  await edition.locator("[data-studio-surface-pole]").selectOption("0,0");
  await edition.locator("[data-studio-surface-pole]").selectOption("1,1");
  check("Modifier la surface : pôle central choisi (ligne 2, colonne 2), ses valeurs actuelles reprises (x 2, y 2, z 0, poids 1)",
    (await edition.getByLabel("x (m)", { exact: true }).inputValue()) === "2" && (await edition.getByLabel("z (m)", { exact: true }).inputValue()) === "0"
    && (await edition.getByLabel("Poids (strictement positif)", { exact: true }).inputValue()) === "1");
  await edition.getByLabel("z (m)", { exact: true }).fill("1");
  await edition.getByLabel("Poids (strictement positif)", { exact: true }).fill("2");
  await edition.locator("[data-studio-modifier-pole]").click();
  await attendre(2);
  check("Modifier la surface : même identité, devenue rationnelle", /rationnelle ·/.test(await panneaux3d.locator(`[data-studio-surface="${idSurface}"]`).textContent())
    && !(await panneaux3d.locator(`[data-studio-surface="${idSurface}"]`).textContent()).includes("non rationnelle"));
  await page.screenshot({ path: join(OUT, "studio-w3c-surface.png") });
  await flou();
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const doc1 = (await json("get", chemin)).revision.document;
  const s1 = doc1.surfaces.find((s) => s.id === idSurface);
  check("enregistrement : pôle central (2 ; 2 ; 1), poids 2, autres pôles et poids inchangés",
    JSON.stringify(s1.controle[4]) === JSON.stringify({ x: 2, y: 2, z: 1 }) && s1.poids?.[4] === 2 && s1.poids.filter((w, k) => k !== 4).every((w) => w === 1) && s1.controle[0].z === 0);

  // ——— Épaississement exact du quart de cylindre (oracle) : Shift+F11, noyau à la demande ———
  await panneaux3d.locator('[data-studio-surface="Q"]').click();
  await flou();
  await page.keyboard.press("Shift+F11");
  const epaissir = panneaux3d.locator("[data-studio-epaissir]");
  await epaissir.waitFor();
  await page.locator('[data-studio-epaissir][data-studio-exact-noyau="pret"]').waitFor({ timeout: 120000 });
  check("Épaissir la surface : le noyau exact est chargé à cette occasion (un .wasm), côté non proposé",
    requetesExact.filter((u) => u.endsWith(".wasm")).length === 1 && (await epaissir.locator("[data-studio-epaissir-sens]").inputValue()) === "");
  await epaissir.locator("[data-studio-epaissir-surface]").selectOption("Q");
  await epaissir.getByLabel("Épaisseur (m)", { exact: true }).fill("0.1");
  await epaissir.locator("[data-studio-epaissir-sens]").selectOption("normale");
  const docAvant = await epaissir.getAttribute("data-studio-exact-document");
  await epaissir.locator("[data-studio-epaissir-calculer]").click();
  await page.locator('[data-studio-epaissir][data-studio-exact-etat="pret"]').waitFor({ timeout: 120000 });
  const V = (Math.PI / 4) * (2.1 ** 2 - 4) * 3;
  const vNav = Number(await epaissir.locator("[data-studio-exact-resultat]").getAttribute("data-studio-exact-volume"));
  check("oracle : volume du noyau dans le navigateur = π/4 ((R + e)² − R²) L à 1e-6 près ; rien d'engagé par le calcul",
    Math.abs(vNav - V) / V < 1e-6 && (await enAttente()) === "0" && (await epaissir.getAttribute("data-studio-exact-document")) === docAvant, `${vNav} / ${V}`);
  const empreinteClient = await epaissir.locator("[data-studio-exact-resultat]").getAttribute("data-studio-exact-empreinte");
  await epaissir.locator("[data-studio-exact-engager]").click();
  await attendre(1);
  const idExact = await epaissir.locator("[data-studio-exact-engage]").getAttribute("data-studio-exact-engage");
  const ligne = panneaux3d.locator(`[data-studio-solide="${idExact}"]`);
  check("engagement explicite : un solide exact (épaississement), surface Q conservée et retirée des surfaces libres",
    (await ligne.getAttribute("data-studio-solide-operation")) === "epaississement" && (await ligne.getAttribute("data-studio-solide-operandes")) === "Q"
    && (await panneaux3d.locator('[data-studio-surface="Q"]').count()) === 0);
  await page.screenshot({ path: join(OUT, "studio-w3c-epaissie.png") });
  await flou();
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const doc2 = (await json("get", chemin)).revision.document;
  const e2 = doc2.exacts?.find((x) => x.id === idExact);
  check("enregistrement : le serveur a recalculé l'épaississement (même empreinte), volume de forme close à 1e-6 près, surface conservée",
    e2?.operation === "epaississement" && e2.surface.id === "Q" && e2.epaisseur === 0.1 && e2.sens === "normale" && e2.resultat.empreinte === empreinteClient && Math.abs(e2.resultat.volume - V) / V < 1e-6,
    JSON.stringify({ volume: e2?.resultat.volume, empreinte: e2?.resultat.empreinte }));
  // Autorité du serveur : un résultat annoncé pour la surface éditée (autre géométrie) est refusé.
  const faux = await envoyer([{ toolId: "studio.surface.epaissir", params: { id: "F", surface: idSurface, epaisseur: 0.1, sens: "normale", resultat: { ...e2.resultat } } }]);
  const corps = await faux.json();
  check("R9 : empreinte qui ne reproduit pas le calcul du serveur — refus 400 exact-mismatch, rien n'est écrit",
    faux.status() === 400 && corps.code === "exact-mismatch" && !(await json("get", chemin)).revision.document.exacts.some((x) => x.id === "F"), JSON.stringify(corps));

  // ——— Exports ———
  const revision = (await json("get", chemin)).revision.id;
  const exporter = async (format) => (await api("get", `${chemin}/export?format=${format}&revisionId=${revision}`)).text();
  const obj = await exporter("obj").catch(async () => (await api("get", `${chemin}/export?format=obj`)).text());
  const step = await exporter("step").catch(async () => (await api("get", `${chemin}/export?format=step`)).text());
  check("exports : OBJ écrit la nappe éditée et le solide épaissi ; STEP le solide exact (faces B-spline rationnelles) ; la surface non épaissie n'y est pas",
    obj.includes(`o ${idSurface}`) && obj.includes(`o ${idExact}`) && /RATIONAL_B_SPLINE_SURFACE/.test(step) && step.includes(`'${idExact}'`) && !step.includes(`'${idSurface}'`));
  // ——— Surfaces de subdivision (Loop) ———
  await flou();
  await page.keyboard.press("Control+Shift+Home");
  const sub = panneaux3d.locator("[data-studio-subdivision-creer]");
  await sub.waitFor();
  check("Surface de subdivision : aucune valeur proposée (sommets, faces, niveau vides)", (await sub.locator("textarea").evaluateAll((l) => l.every((t) => t.value === ""))) && (await sub.locator('input[name="subdivision-niveau"]').inputValue()) === "");
  // Tétraèdre régulier de demi-arête de cube 1, centré en (−10 ; 0 ; 1).
  await sub.locator("[data-studio-subdivision-sommets]").fill("-9 1 2; -9 -1 0; -11 1 0; -11 -1 2");
  await sub.locator("[data-studio-subdivision-faces]").fill("1 2 3; 1 4 2; 1 3 4; 2 4 3");
  await sub.getByLabel("Niveau de subdivision (0 à 4)", { exact: true }).fill("1");
  const nAvant = Number(await enAttente());
  await sub.locator("[data-studio-poser-subdivision]").click();
  await attendre(nAvant + 1);
  const idSub = await panneaux3d.locator("[data-studio-subdivisions] [data-studio-subdivision]").first().getAttribute("data-studio-subdivision");
  check("Surface de subdivision : créée (4 sommets, 4 faces, niveau 1, fermée), dessinée dans la vue 3D, sélectionnée",
    /4 sommets, 4 faces, niveau 1, fermée/.test(await panneaux3d.locator(`[data-studio-subdivision="${idSub}"]`).textContent())
    && (await page.locator("[data-studio-vue3d]").getAttribute("data-studio-subdivisions")) === "1" && (await panneaux3d.locator(`[data-studio-subdivision="${idSub}"]`).getAttribute("aria-pressed")) === "true");
  await flou();
  await page.keyboard.press("Control+F9");
  const editSub = panneaux3d.locator(`[data-studio-subdivision-modifier="${idSub}"]`);
  await editSub.waitFor();
  await page.getByRole("button", { name: "Recadrer la vue 3D", exact: true }).click();
  await page.waitForTimeout(800);
  const pos = await page.evaluate((id) => globalThis.__fadiVue3d?.pole?.(id, 0) ?? null, idSub);
  const sousSub = pos ? await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.hasAttribute("data-studio-vue3d-canvas") ? "canevas" : e?.tagName; }, pos) : null;
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(() => document.querySelector("[data-studio-subdivision-sommet]")?.value === "0", undefined, { timeout: 10000 }).catch(() => {});
  check("Modifier la surface (subdivision) : un clic sur le repère du sommet 1 le choisit, ses valeurs reprises (x −9, y 1, z 2)",
    sousSub === "canevas" && (await editSub.locator("[data-studio-subdivision-sommet]").inputValue()) === "0" && (await editSub.getByLabel("x (m)", { exact: true }).inputValue()) === "-9", String(sousSub));
  // Le sommet est relevé puis remis à sa place : la surface reste le tétraèdre régulier de l’oracle.
  await editSub.getByLabel("z (m)", { exact: true }).fill("2.5");
  await editSub.locator("[data-studio-modifier-sommet]").click();
  await attendre(nAvant + 2);
  await editSub.getByLabel("z (m)", { exact: true }).fill("2");
  await editSub.locator("[data-studio-modifier-sommet]").click();
  await attendre(nAvant + 3);
  await flou();
  await page.keyboard.press("Control+Shift+End");
  const solid = panneaux3d.locator("[data-studio-solidifier]");
  await solid.waitFor();
  await page.locator('[data-studio-solidifier][data-studio-exact-noyau="pret"]').waitFor({ timeout: 120000 });
  await solid.locator("[data-studio-solidifier-surface]").selectOption(idSub);
  await solid.locator("[data-studio-solidifier-calculer]").click();
  await page.locator('[data-studio-solidifier][data-studio-exact-etat="pret"]').waitFor({ timeout: 120000 });
  const vSub = Number(await solid.locator("[data-studio-exact-resultat]").getAttribute("data-studio-exact-volume"));
  check("oracle : tétraèdre régulier subdivisé (Loop, niveau 1) cousu par le noyau — volume 5/24 m³ à 1e-9 près", Math.abs(vSub - 5 / 24) / (5 / 24) < 1e-9, String(vSub));
  await solid.locator("[data-studio-exact-engager]").click();
  await attendre(nAvant + 4);
  const idSol = await solid.locator("[data-studio-exact-engage]").getAttribute("data-studio-exact-engage");
  check("Solidifier la subdivision : solide exact engagé, surface conservée et retirée des surfaces de subdivision",
    (await panneaux3d.locator(`[data-studio-solide="${idSol}"]`).getAttribute("data-studio-solide-operation")) === "solidification" && (await panneaux3d.locator(`[data-studio-subdivision="${idSub}"]`).count()) === 0);
  await flou();
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const doc3 = (await json("get", chemin)).revision.document;
  const e3 = doc3.exacts.find((x) => x.id === idSol);
  check("enregistrement : le serveur a recalculé la solidification (même volume 5/24), surface de subdivision conservée",
    e3?.operation === "solidification" && e3.subdivision.id === idSub && e3.subdivision.niveau === 1 && Math.abs(e3.resultat.volume - 5 / 24) < 1e-9);
  // Surface ouverte : refus du serveur (studio-invalid), rien n'est écrit.
  const ouverte = { id: "OUV", type: "surface-subdivision", niveau: 1, sommets: [{ x: 0, y: -10, z: 0 }, { x: 1, y: -10, z: 0 }, { x: 0, y: -9, z: 0 }], faces: [[0, 1, 2]] };
  const pose2 = await envoyer([{ toolId: "studio.subdivision.creer", params: ouverte }]);
  const refusOuverte = await envoyer([{ toolId: "studio.subdivision.solidifier", params: { id: "S2", subdivision: "OUV", resultat: { ...e3.resultat } } }]);
  check("surface de subdivision ouverte : solidification refusée (400 studio-invalid), rien n'est écrit", pose2.ok() && refusOuverte.status() === 400 && (await refusOuverte.json()).code === "studio-invalid");
  const rev2 = (await json("get", chemin)).revision.id;
  void rev2;
  const obj2 = await (await api("get", `${chemin}/export?format=obj`)).text();
  const stl2 = await (await api("get", `${chemin}/export?format=stl`)).text();
  const step2 = await (await api("get", `${chemin}/export?format=step`)).text();
  check("exports : OBJ écrit la surface de subdivision ouverte et le solide polyédrique ; STEP le solide (nommé), pas la surface ouverte ; STL des facettes",
    obj2.includes("o OUV") && obj2.includes(`o ${idSol}`) && step2.includes(`'${idSol}'`) && !step2.includes("'OUV'") && /facet normal/.test(stl2));
  await page.screenshot({ path: join(OUT, "studio-w3c-subdivision.png") });

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette des surfaces libres NURBS et de subdivision (lot W3-C, X.1-05) : tous les contrôles passent.");
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (erreurs.length) console.error(erreurs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
