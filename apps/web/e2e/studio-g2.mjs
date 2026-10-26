#!/usr/bin/env node
/**
 * Recette du lot G2 (achèvement Studio, outils et BIM) — API et application construites (même origine), Chromium réel,
 * comptes et projet synthétiques ; les dimensions sont des données de test, pas des valeurs de projet :
 *
 *  - TR-EX-027 : outil « Échelle d'accès » (Ctrl+Maj+F12, famille Architecture, icône propre), distinct de la
 *    transformation « Échelle » ; posé d'un clic avec les valeurs saisies au panneau ; dessiné en plan, maillé en 3D,
 *    métré ; enregistré ; exporté en IFC (IfcStair .LADDER.) ;
 *  - TR-AC-004 : cas ambigu d'accrochage (deux lignes confondues) tracé (« 1/n ») et résolu explicitement (« Cible
 *    d'accrochage suivante », Ctrl+Maj+F1) : la cote se lie à l'objet choisi ; désignation ambiguë au clic, résolue de
 *    même ;
 *  - TR-INV-013 : cote de face 3D (Maj+F12) qui suit la face poussée, puis « à résoudre » après la division de la
 *    face cotée, rattachée explicitement ;
 *  - TR-AC-010 : un concepteur (éditeur) trouve « Approuver » par la recherche de la palette, l'exécute et reçoit le
 *    refus du serveur ; le propriétaire, qui a le droit, approuve par la même commande (Ctrl+Maj+F11) ;
 *  - TR-IF-006 : enveloppe complète (portée, cibles, opération, mode) : essai sans écriture puis application.
 *
 * BASE_URL=http://localhost:3001 MAILPIT_URL=http://localhost:8025 OUT=atelier-captures/studio-g2 node apps/web/e2e/studio-g2.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-g2";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
let echecs = 0;

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

/** Compte connecté dans son propre contexte : page, appels d'API (session du contexte), fonction d'appel pour les invitations. */
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
  const appel = async (method, path, body) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE }, ...(body === undefined ? {} : { data: body }) });
    let json = null;
    try { json = await r.json(); } catch { json = null; }
    return { status: r.status(), body: json };
  };
  const api = async (method, path, body) => {
    const r = await appel(method, path, body);
    if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { context, page, email, appel, api };
}

const flou = (page) => page.evaluate(() => document.activeElement?.blur());
const enregistrer = async (page) => {
  await flou(page);
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
};
/** Point du repère local-2d → écran (la planche défile si besoin). */
const ecran = (page, monde) => page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).evaluate((svg, point) => {
  const versEcran = () => new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM());
  const s = versEcran();
  if (s.y < 40 || s.y > window.innerHeight - 40) window.scrollBy(0, s.y - window.innerHeight / 2);
  const p = versEcran();
  return { x: p.x, y: p.y };
}, monde);

try {
  const proprietaire = await compte("g2-proprietaire");
  const editeur = await compte("g2-editeur");
  const { page, api } = proprietaire;
  const projet = await api("POST", "/projects", { code: `P.G2.${randomUUID().slice(0, 6)}`, name: "Studio — lot G2 (recette synthétique)" });
  const etude = await api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude G2" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const tete = async () => (await api("GET", chemin)).revision;
  const commandes = async (cs, extra = {}) => api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `g2-${randomUUID()}`, baseRevisionId: (await tete()).id, commands: cs, ...extra });
  const outils = page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');
  const ouvrir = async (p = page) => {
    await p.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
    await p.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  };

  // ——— TR-IF-006 : enveloppe complète, essai puis application ———
  const portee = { projectId: projet.id, studyId: etude.study.id, variantId: etude.variant.id };
  const ligne = (id, y) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 4, y } } });
  const avantEssai = (await tete()).id;
  const essai = await proprietaire.appel("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: "g2-essai", baseRevisionId: avantEssai, scope: portee, mode: "essai", commands: [{ ...ligne("l1", 0), targetIds: ["l1"], operation: "creer" }] });
  check("TR-IF-006 : mode essai — enveloppe complète validée, effets calculés (l1 créée), rien n'est écrit (tête inchangée)",
    essai.status === 200 && essai.body?.mode === "essai" && essai.body.written === false && essai.body.effects?.crees?.includes("l1") && (await tete()).id === avantEssai, JSON.stringify(essai.body?.effects ?? essai.body).slice(0, 200));
  const faux = await proprietaire.appel("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: "g2-faux", baseRevisionId: avantEssai, scope: { ...portee, variantId: "autre" }, commands: [ligne("l1", 0)] });
  check("TR-IF-006 : portée déclarée différente de l'adresse : 400 scope_mismatch, rien n'est écrit", faux.status === 400 && faux.body?.error === "scope_mismatch" && (await tete()).id === avantEssai);
  // Deux lignes confondues (l1, l2) : cas ambigu d'accrochage et de désignation (AC-004).
  await commandes([{ ...ligne("l1", 0), targetIds: ["l1"], operation: "creer" }, { ...ligne("l2", 0), targetIds: ["l2"], operation: "creer" }], { scope: portee, mode: "appliquer" });
  check("TR-IF-006 : mode appliquer — révision écrite, auteur = la session", (await tete()).document.objects.map((o) => o.id).join(",") === "l1,l2");

  // ——— TR-EX-027 : Échelle d'accès ———
  await ouvrir();
  const bouton = outils.locator('[data-studio-outil="studio.architecture.echelle-acces"][aria-label="Échelle d’accès"][aria-keyshortcuts="Control+Shift+F12"]');
  check("TR-EX-027 (règle d'or) : Échelle d'accès dans la famille Architecture, icône propre, Ctrl+Maj+F12 ; distincte de la transformation Échelle",
    (await bouton.locator("svg path").count()) === 1 && (await bouton.evaluate((b) => b.closest("[data-studio-famille]")?.getAttribute("data-studio-famille"))) === "architecture"
    && (await outils.locator('[data-studio-outil="studio.dessin.echelle"]').getAttribute("aria-keyshortcuts")) !== "Control+Shift+F12");
  await flou(page);
  await page.keyboard.press("Control+Shift+F12");
  const formEchelle = page.locator("[data-studio-architecture-echelle-formulaire]");
  await formEchelle.waitFor();
  check("TR-EX-027 : formulaire de l'outil, aucune valeur proposée", (await formEchelle.locator('[data-studio-champ-architecture="echelle-largeur"]').inputValue()) === "");
  for (const [nom, v] of [["echelle-largeur", "0.5"], ["echelle-hauteur", "3"], ["echelle-base", "0"], ["echelle-echelons", "9"], ["echelle-section", "0.04"], ["echelle-orientation", "0"]]) await formEchelle.locator(`[data-studio-champ-architecture="${nom}"]`).fill(v);
  const pied = await ecran(page, { x: 2, y: 5 });
  await page.mouse.click(pied.x, pied.y);
  const echelle = page.locator('[data-studio-architecture][data-studio-type="ladder"]');
  await echelle.waitFor();
  check("TR-EX-027 : un clic pose l'échelle ; plan : deux montants et le contour des échelons", (await echelle.locator("polygon").count()) === 3);
  await enregistrer(page);
  const doc = (await tete()).document;
  const posee = (doc.architecture ?? []).find((a) => a.type === "ladder");
  check("TR-EX-027 : enregistrée par le serveur avec les valeurs saisies (aucune ajoutée)", posee && posee.width === 0.5 && posee.height === 3 && posee.rungs === 9 && posee.section === 0.04 && posee.rotation === 0 && Math.abs(posee.position.y - 5) < 0.02, JSON.stringify(posee));
  await page.locator(`[data-studio-architecture-choisir="${posee.id}"]`).click();
  const metre = page.locator(`[data-studio-architecture-choisi="${posee.id}"] [data-studio-architecture-metre]`);
  check("TR-EX-027 : métré de l'échelle sélectionnée (9 échelons, pas 0,3 m)", (await metre.getAttribute("data-studio-echelons")) === "9" && Math.abs(Number(await metre.getAttribute("data-studio-pas")) - 0.3) < 1e-9);
  const ifc = await proprietaire.context.request.get(`${BASE}${chemin}/export?format=ifc`);
  const texteIfc = await ifc.text();
  check("TR-EX-027 : export IFC — IfcStair de type LADDER, jeu de propriétés Fadi_StudioLadder", ifc.ok() && /IFCSTAIR\([^)]*\.LADDER\.\)/.test(texteIfc) && texteIfc.includes("'Fadi_StudioLadder'"));
  const svg = await (await proprietaire.context.request.get(`${BASE}${chemin}/export?format=svg`)).text();
  check("TR-EX-027 : export SVG — l'échelle est tracée en plan", svg.includes(`data-architecture="ladder" data-id="${posee.id}"`));

  // ——— TR-AC-004 : cas ambigu d'accrochage résolu explicitement ———
  await flou(page);
  await page.keyboard.press("Shift+C");
  await page.waitForFunction(() => document.querySelector('[data-studio-outil="studio.dessin.cote"]')?.getAttribute("aria-pressed") === "true");
  const origine = await ecran(page, { x: 0, y: 0 });
  await page.mouse.move(origine.x + 1, origine.y + 1);
  await page.mouse.move(origine.x, origine.y);
  const repere = page.locator("g.studio-repere");
  await repere.waitFor();
  const ambigu1 = await repere.getAttribute("data-studio-accroche-ambigu");
  const accroche1 = await repere.getAttribute("data-studio-accroche");
  check("TR-AC-004 : extrémités confondues — cas ambigu tracé (« 1/n »), la règle retient l1 (ordre du document)", /^1\/[2-9]$/.test(ambigu1 ?? "") && accroche1 === "l1:start", `${ambigu1} ${accroche1}`);
  await page.keyboard.press("Control+Shift+F1");
  await page.waitForFunction(() => document.querySelector("g.studio-repere")?.getAttribute("data-studio-accroche-ambigu")?.startsWith("2/"));
  check("TR-AC-004 : « Cible d'accrochage suivante » (Ctrl+Maj+F1) — la candidate suivante (l2) devient le point posé", (await repere.getAttribute("data-studio-accroche")) === "l2:start");
  await page.mouse.click(origine.x, origine.y);
  const fin = await ecran(page, { x: 4, y: 0 });
  await page.mouse.move(fin.x, fin.y);
  await page.mouse.click(fin.x, fin.y);
  await enregistrer(page);
  const cote = ((await tete()).document.dimensions ?? [])[0];
  check("TR-AC-004 : la cote enregistrée est liée à l'objet choisi explicitement (début : l2) et à l1 par la règle (fin)",
    cote?.links?.start?.objectId === "l2" && cote.links.start.anchor === "start" && cote.links.end?.objectId === "l1", JSON.stringify(cote?.links));
  // Désignation ambiguë : clic sur les deux lignes confondues, puis objet suivant.
  await flou(page);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector('[data-studio-outil="studio.dessin.selection"]')?.getAttribute("aria-pressed") === "true");
  const milieu = await ecran(page, { x: 2, y: 0 });
  await page.mouse.click(milieu.x, milieu.y);
  const choisie = () => page.locator('svg [role="button"][aria-label^="Ligne "][aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-objet")));
  const premiere = await choisie();
  await flou(page);
  await page.keyboard.press("Control+Shift+F1");
  await page.waitForFunction((avant) => [...document.querySelectorAll('svg [role="button"][aria-label^="Ligne "][aria-pressed="true"]')].map((e) => e.getAttribute("data-studio-objet")).join() !== avant, premiere.join());
  const seconde = await choisie();
  check("TR-AC-004 : désignation ambiguë au clic (deux lignes confondues) — l'objet suivant sous le clic est désigné explicitement",
    premiere.length === 1 && seconde.length === 1 && new Set([premiere[0], seconde[0]]).size === 2 && [premiere[0], seconde[0]].every((x) => x === "l1" || x === "l2"), `${premiere} → ${seconde}`);

  // ——— TR-INV-013 : cote de face 3D ———
  await commandes([{ toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 20, y: 0, z: 0 }, rotation: 0 }, width: 4, depth: 2, height: 3 } }]);
  await ouvrir();
  await flou(page);
  await page.keyboard.press("Shift+F12");
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  await panneaux3d.locator("canvas[data-studio-vue3d-canvas]").waitFor({ timeout: 30000 });
  await panneaux3d.locator('[data-studio-solide="b1"]').click();
  const formCote = panneaux3d.locator('[data-studio-cote-face="b1"]');
  await formCote.waitFor();
  check("TR-INV-013 (règle d'or) : Cote de face 3D (Maj+F12) active l'outil ; aucune face proposée",
    (await page.locator('[data-studio-outil="studio.solide.cote-face"]').first().getAttribute("aria-pressed")) === "true" && (await formCote.locator("[data-studio-cote-face-a]").inputValue()) === "");
  await formCote.locator("[data-studio-cote-face-a]").selectOption("lateral-0");
  await formCote.locator("[data-studio-cote-face-b]").selectOption("lateral-2");
  await formCote.locator("[data-studio-coter-faces]").click();
  const ligneCote = panneaux3d.locator("[data-studio-cote-face-id]").first();
  await ligneCote.waitFor();
  check("TR-INV-013 : cote entre les faces y− et y+ : 2 m", (await ligneCote.textContent()).includes(": 2 m"), await ligneCote.textContent());
  const formFace = panneaux3d.locator('[data-studio-face-decaler="b1"]');
  await formFace.locator("[data-studio-face-choix]").selectOption("lateral-2");
  await formFace.getByLabel("Distance (m, positive vers l’extérieur)").fill("0.5");
  await formFace.getByRole("button", { name: "Pousser / tirer la face", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-cote-face-id]")?.textContent?.includes(": 2,5 m"));
  check("TR-INV-013 : face cotée tirée de 0,5 m — la cote la suit (2,5 m), toujours rattachée", (await ligneCote.getAttribute("data-studio-cote-face-etat")) === "rattachee");
  const formDiv = panneaux3d.locator('[data-studio-face-diviser="b1"]');
  await formDiv.locator("[data-studio-division-choix]").selectOption("lateral-0");
  await formDiv.getByLabel("Distance depuis le début de l’arête (m)").fill("1");
  await formDiv.getByRole("button", { name: "Diviser la face", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-cote-face-id]")?.getAttribute("data-studio-cote-face-etat") === "a-resoudre");
  check("TR-INV-013 : face cotée divisée — deux moitiés plausibles, aucune choisie : cote conservée « à résoudre »", (await ligneCote.textContent()).includes("à résoudre"));
  await ligneCote.locator("[data-studio-cote-face-rattacher]").click();
  await formCote.locator("[data-studio-cote-face-a]").selectOption("lateral-1");
  await formCote.locator("[data-studio-cote-face-b]").selectOption("lateral-3");
  await formCote.locator("[data-studio-coter-faces]").click();
  await page.waitForFunction(() => document.querySelector("[data-studio-cote-face-id]")?.getAttribute("data-studio-cote-face-etat") === "rattachee");
  await enregistrer(page);
  const cf = ((await tete()).document.cotesFaces ?? []);
  check("TR-INV-013 : rattachement explicite enregistré (même cote, faces choisies)", cf.length === 1 && cf[0].toResolve === false && cf[0].faces.join() === "lateral-1,lateral-3", JSON.stringify(cf));

  // ——— TR-AC-010 : Approuver, commande du catalogue ———
  check("éditeur invité, invitation acceptée", (await inviterEtAccepter(proprietaire.appel, editeur.appel, projet.id, editeur.email, "editeur")).ok);
  const pub = await api("POST", `${chemin}/publications`, { title: "Dossier G2", contenu: "dessin-2d" });
  const soumise = await api("POST", `/projects/${projet.id}/studio/studies/${etude.study.id}/publications/${pub.id}/soumettre`, {});
  check("publication soumise par le propriétaire", soumise.workStatus === "en-revue", soumise.workStatus);
  const ep = editeur.page;
  await ouvrir(ep);
  await flou(ep);
  await ep.keyboard.press("Control+k");
  const palette = ep.locator("[data-studio-palette]");
  await palette.waitFor();
  await palette.locator("[data-studio-recherche-palette]").fill("approuver");
  const entree = palette.locator('[data-studio-palette-entree="approuver"]');
  check("TR-AC-010 : le concepteur trouve « Approuver » par la recherche de la palette", (await entree.count()) === 1);
  await palette.locator("[data-studio-recherche-palette]").press("Enter");
  const boite = ep.locator("[data-studio-approbation]");
  await boite.waitFor();
  const avantRefus = (await api("GET", `/projects/${projet.id}/studio/studies/${etude.study.id}/publications/${pub.id}`)).workStatus;
  await boite.locator("[data-studio-approbation-confirmer]").click();
  const refus = boite.locator('[data-studio-approbation-message="refus"]');
  await refus.waitFor();
  check("TR-AC-010 : exécutée, l'approbation est refusée par le serveur (droit métier absent), rien n'est écrit",
    (await refus.textContent()).startsWith("Approbation refusée par le serveur") && (await api("GET", `/projects/${projet.id}/studio/studies/${etude.study.id}/publications/${pub.id}`)).workStatus === avantRefus);
  await ep.keyboard.press("Escape");
  await ouvrir();
  await flou(page);
  await page.keyboard.press("Control+Shift+F11");
  const boiteP = page.locator("[data-studio-approbation]");
  await boiteP.waitFor();
  await boiteP.locator("[data-studio-approbation-confirmer]").click();
  await boiteP.locator('[data-studio-approbation-message="ok"]').waitFor();
  check("TR-AC-010 : le propriétaire, qui détient le droit, approuve par la même commande (Ctrl+Maj+F11)",
    (await api("GET", `/projects/${projet.id}/studio/studies/${etude.study.id}/publications/${pub.id}`)).workStatus === "approuve");

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  await page.screenshot({ path: `${OUT}/fin.png` });
} catch (e) {
  echecs += 1;
  console.log(`✗ recette interrompue — ${e?.stack ?? e}`);
} finally {
  await browser.close();
}
if (echecs) { console.log(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette du lot G2 : tous les contrôles passent.");
