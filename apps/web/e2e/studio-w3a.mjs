#!/usr/bin/env node
/**
 * Recette du lot W3-A (X.1-01) — blocs définis par l'utilisateur et contraintes géométriques, par l'interface et par
 * l'API, dans Chromium :
 *  - Blocs (Maj+F1, Maj+F3, Ctrl+F12) : définir un bloc depuis la sélection (formes remplacées par une insertion, même
 *    dessin), insérer une deuxième occurrence transformée (position, rotation, échelle, symétrie), redéfinir le bloc et
 *    voir les deux insertions changer ensemble, changer la pose d'une insertion, l'éclater en formes du dessin ;
 *    enregistrer : révision serveur relue, export DXF du serveur en BLOCK / INSERT, export SVG développé ;
 *  - Contraintes (Ctrl+F1) : poser un parallélisme et une distance depuis la sélection (système résolu, marques sur la
 *    planche), refus de l'insatisfaisable et de la sur-contrainte (motif dit, rien n'est écrit) ; enregistrer ; une
 *    rotation envoyée par l'API (autre écriture) fait passer la contrainte « à résoudre » côté serveur, l'interface la
 *    montre ainsi, puis la résout sur demande ; l’API refuse aussi une sur-contrainte (400 studio-invalid) ;
 *  - Règle d'or : chaque outil a son bouton nommé dans « Outils ▾ » / la barre, son raccourci, et s'atteint au clavier
 *    (désignation d'une insertion par Entrée, sans pointeur).
 *
 * BASE_URL=http://localhost:3821 OUT=atelier-captures/studio-w3a node apps/web/e2e/studio-w3a.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-w3a";
mkdirSync(OUT, { recursive: true });
const erreurs = [];
const controles = [];
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  controles.push({ nom, ok, ...(detail ? { detail } : {}) });
  if (!ok) throw new Error(nom);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
let echec = null;
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-w3a-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-w3a-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const appel = async (method, path, data) => context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
  const api = async (method, path, data) => {
    const r = await appel(method, path, data);
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.W3A", name: "Studio — blocs et contraintes" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude blocs et contraintes" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const tete = async () => (await api("get", chemin)).revision;
  const envoyer = async (commands) => appel("post", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `w3a-${randomUUID()}`, baseRevisionId: (await tete()).id, commands });
  const ligne = (id, a, b) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } } });
  const r0 = await envoyer([
    // Formes du futur bloc (repère) et lignes à contraindre.
    ligne("repere-trait", [0, 0], [1, 0]),
    { toolId: "studio.dessin.cercle", params: { id: "repere-rond", type: "circle", center: { x: 0.5, y: 0.5 }, radius: 0.25 } },
    ligne("ligne-a", [0, 4], [4, 4.3]), ligne("ligne-b", [0, 6], [3, 6.6]),
  ]);
  check("préparation : formes posées par l'API", r0.ok(), String(r0.status()));

  const flou = () => page.evaluate(() => document.activeElement?.blur());
  const enregistrer = async () => {
    await flou();
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  };
  const ouvrir = async () => {
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  };
  await ouvrir();
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  /** Sélection au clavier : l'élément de la planche a le focus, Entrée le désigne (Maj+Entrée l'ajoute). */
  const designer = async (selecteur, ajouter = false) => { await planche.locator(selecteur).first().press(ajouter ? "Shift+Enter" : "Enter"); };

  // ——— Règle d'or : quatre outils dans le catalogue « Outils », chacun son raccourci ———
  await flou();
  await page.keyboard.press("Shift+O");
  const catalogue = page.getByRole("dialog");
  await catalogue.waitFor();
  const texteCatalogue = await catalogue.innerText();
  check("Règle d'or : « Définir un bloc » (Maj+F1), « Insérer un bloc » (Maj+F3), « Éclater l’insertion » (Ctrl+F12) et « Contraindre » (Ctrl+F1) au catalogue",
    ["Définir un bloc", "Insérer un bloc", "Éclater l’insertion", "Contraindre"].every((n) => texteCatalogue.includes(n)) && /Maj\+F1/.test(texteCatalogue) && /Maj\+F3/.test(texteCatalogue) && /Ctrl\+F12/.test(texteCatalogue) && /Ctrl\+F1\b/.test(texteCatalogue));
  await page.keyboard.press("Escape");
  await catalogue.waitFor({ state: "detached" });

  // ——— Blocs : définir depuis la sélection, formes remplacées par une insertion ———
  await designer('[data-studio-objet="repere-trait"]');
  await designer('[data-studio-objet="repere-rond"]', true);
  await flou();
  await page.keyboard.press("Shift+F1");
  const blocs = page.locator("[data-studio-blocs]");
  await blocs.waitFor();
  check("Maj+F1 ouvre la boîte « Blocs » ; deux formes sélectionnées", (await blocs.locator("[data-studio-bloc-formes]").getAttribute("data-studio-bloc-formes")) === "2");
  // Refus dit : point de base absent (aucune valeur supposée).
  await blocs.locator("[data-studio-bloc-nom]").fill("Repère");
  await blocs.locator("[data-studio-bloc-definir]").click();
  check("Définir sans point de base : refus dit, rien n'est écrit", (await blocs.locator("[data-studio-bloc-erreur]").innerText()).includes("Point de base") && (await blocs.locator("[data-studio-bloc]").count()) === 0);
  await blocs.locator("[data-studio-bloc-base-x]").fill("0");
  await blocs.locator("[data-studio-bloc-base-y]").fill("0");
  await blocs.locator("[data-studio-bloc-remplacer]").check();
  await blocs.locator("[data-studio-bloc-definir]").click();
  await blocs.locator("[data-studio-bloc]").waitFor();
  check("Bloc défini : la définition est listée avec une insertion, les formes d'origine sont remplacées (même dessin)",
    (await blocs.locator("[data-studio-bloc]").getAttribute("data-studio-bloc-insertions")) === "1" && (await planche.locator('[data-studio-objet="repere-trait"]').count()) === 0
    && (await planche.locator("[data-studio-insertion] line").count()) === 1 && (await planche.locator("[data-studio-insertion] circle").count()) === 1);
  // Deuxième occurrence transformée : position, rotation 90°, échelle 2, symétrie.
  await blocs.locator("[data-studio-bloc-choix]").selectOption({ label: "Repère" });
  await blocs.locator("[data-studio-bloc-x]").fill("10");
  await blocs.locator("[data-studio-bloc-y]").fill("0");
  await blocs.locator("[data-studio-bloc-rotation]").fill("90");
  await blocs.locator("[data-studio-bloc-echelle]").fill("2");
  await blocs.locator("[data-studio-bloc-symetrie]").check();
  await blocs.locator("[data-studio-bloc-inserer]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-insertion]").length === 2);
  const poses = await planche.locator("[data-studio-insertion]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-studio-insertion"), rotation: Number(e.getAttribute("data-studio-rotation")), echelle: e.getAttribute("data-studio-echelle"), symetrie: e.getAttribute("data-studio-symetrie"), cercle: e.querySelector("circle")?.getAttribute("r"), cx: e.querySelector("circle")?.getAttribute("cx"), cy: e.querySelector("circle")?.getAttribute("cy") })));
  check("Maj+F3 / « Insérer le bloc » : deuxième insertion tournée de 90°, échelle 2, symétrique ; cercle posé exactement (centre (9 ; −1) : symétrie, échelle, quart de tour, translation ; rayon 0,5)",
    poses.length === 2 && Math.abs(poses[1].rotation - Math.PI / 2) < 1e-12 && poses[1].echelle === "2" && poses[1].symetrie === "oui" && poses[1].cercle === "0.5" && Number(poses[1].cx) === 9 && Number(poses[1].cy) === -1, JSON.stringify(poses));
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  await blocs.waitFor({ state: "detached" });

  // ——— Redéfinir : les deux insertions changent ensemble ———
  await designer('[data-studio-objet="ligne-b"]');
  await flou();
  await page.keyboard.press("Shift+F1");
  await blocs.waitFor();
  await blocs.locator("[data-studio-bloc-redefinir]").selectOption({ label: "Repère" });
  await blocs.locator("[data-studio-bloc-nom]").fill("Repère redéfini");
  await blocs.locator("[data-studio-bloc-base-x]").fill("0");
  await blocs.locator("[data-studio-bloc-base-y]").fill("6");
  await blocs.locator("[data-studio-bloc-definir]").click();
  await blocs.locator("[data-studio-bloc-info]").waitFor();
  const apresRedef = await planche.locator("[data-studio-insertion]").evaluateAll((els) => els.map((e) => [e.querySelectorAll("line").length, e.querySelectorAll("circle").length, e.getAttribute("data-studio-bloc-nom")]));
  check("Redéfinir le bloc : les deux insertions suivent la nouvelle définition (une ligne, plus de cercle), sans recopie",
    JSON.stringify(apresRedef) === JSON.stringify([[1, 0, "Repère redéfini"], [1, 0, "Repère redéfini"]]), JSON.stringify(apresRedef));
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  await blocs.waitFor({ state: "detached" });

  // ——— Pose d'une insertion désignée au clavier, puis éclatement (Ctrl+F12) ———
  const ids = await planche.locator("[data-studio-insertion]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-insertion")));
  await designer(`[data-studio-insertion="${ids[1]}"]`);
  check("Une insertion se désigne au clavier (Entrée) : sélectionnée sur la planche", (await planche.locator(`[data-studio-insertion="${ids[1]}"]`).getAttribute("aria-pressed")) === "true");
  await flou();
  await page.keyboard.press("Shift+F3");
  await blocs.waitFor();
  check("Maj+F3 avec une insertion sélectionnée : pose pré-remplie (rotation 90°, échelle 2, symétrie)",
    (await blocs.locator("[data-studio-bloc-rotation]").inputValue()) === "90" && (await blocs.locator("[data-studio-bloc-echelle]").inputValue()) === "2" && (await blocs.locator("[data-studio-bloc-symetrie]").isChecked()));
  await blocs.locator("[data-studio-bloc-x]").fill("12");
  await blocs.locator("[data-studio-bloc-symetrie]").uncheck();
  await blocs.locator("[data-studio-bloc-modifier]").click();
  await blocs.locator("[data-studio-bloc-info]").waitFor();
  check("« Appliquer la pose » : l'insertion garde son identité, nouvelle position et sans symétrie",
    (await planche.locator(`[data-studio-insertion="${ids[1]}"]`).getAttribute("data-studio-symetrie")) === null);
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  await blocs.waitFor({ state: "detached" });
  await designer(`[data-studio-insertion="${ids[1]}"]`);
  await flou();
  await page.keyboard.press("Control+F12");
  await page.waitForFunction((id) => !document.querySelector(`[data-studio-insertion="${id}"]`), ids[1]);
  check("Ctrl+F12 : l'insertion est éclatée en formes du dessin (identifiant insertion.élément)", (await planche.locator(`[data-studio-objet^="${ids[1]}."]`).count()) === 1);
  await enregistrer();
  const rev1 = (await tete()).document;
  check("Enregistré : la révision serveur porte une définition, une insertion et la forme éclatée",
    rev1.blocs?.length === 1 && rev1.blocs[0].nom === "Repère redéfini" && rev1.insertions?.length === 1 && rev1.objects.some((o) => o.id.startsWith(`${ids[1]}.`)), JSON.stringify({ blocs: rev1.blocs?.length, insertions: rev1.insertions?.length }));
  const dxf = await (await context.request.get(`${BASE}${chemin}/export?format=dxf`)).text();
  const svg = await (await context.request.get(`${BASE}${chemin}/export?format=svg`)).text();
  check("Export du serveur : DXF en BLOCK / INSERT (nom ASCII dérivé), SVG développé (data-insertion, data-bloc)",
    /\r\nBLOCKS\r\n/.test(dxf) && /\r\nINSERT\r\n8\r\n0\r\n2\r\nREPERE_REDEFINI\r\n/.test(dxf) && (svg.match(/data-insertion="/g) ?? []).length === 1 && svg.includes("data-bloc="));

  // ——— Contraintes : poser depuis la sélection, refus dits ———
  await designer('[data-studio-objet="ligne-a"]');
  await designer('[data-studio-objet^="' + ids[1] + '."]', true);
  await flou();
  await page.keyboard.press("Control+F1");
  const ctr = page.locator("[data-studio-contraintes]");
  await ctr.waitFor();
  check("Ctrl+F1 ouvre la boîte « Contraintes », cibles pré-remplies depuis la sélection", (await ctr.locator('[data-studio-contrainte-objet="0"]').inputValue()) === "ligne-a");
  await ctr.locator("[data-studio-contrainte-poser]").click();
  await ctr.locator("[data-studio-contrainte]").waitFor();
  check("Parallélisme posé et résolu : satisfaite, marque sur la planche",
    (await ctr.locator("[data-studio-contrainte]").getAttribute("data-studio-contrainte-statut")) === "satisfaite" && (await planche.locator("[data-studio-contrainte-marque]").count()) === 1);
  await ctr.locator("[data-studio-contrainte-type]").selectOption("distance");
  await ctr.locator('[data-studio-contrainte-objet="0"]').selectOption("ligne-a");
  await ctr.locator('[data-studio-contrainte-objet="1"]').selectOption("");
  await ctr.locator("[data-studio-contrainte-poser]").click();
  check("Distance sans valeur : refus dit, aucune valeur supposée", (await ctr.locator("[data-studio-contrainte-erreur]").innerText()).includes("aucune valeur n’est supposée"));
  await ctr.locator("[data-studio-contrainte-valeur]").fill("5");
  await ctr.locator("[data-studio-contrainte-poser]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-contrainte]").length === 2);
  const a = await planche.locator('[data-studio-objet="ligne-a"] line').evaluate((l) => Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value));
  check("Distance fixée 5 m posée : la ligne mesure 5 m sur la planche", Math.abs(a - 5) < 1e-6, String(a));
  // Insatisfaisable : verticale sur une ligne parallèle à une ligne… horizontale ? Une même ligne verticale et horizontale.
  await ctr.locator("[data-studio-contrainte-type]").selectOption("horizontal");
  await ctr.locator('[data-studio-contrainte-objet="0"]').selectOption("ligne-b");
  await ctr.locator("[data-studio-contrainte-poser]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-studio-contrainte]").length === 3);
  await ctr.locator("[data-studio-contrainte-type]").selectOption("vertical");
  await ctr.locator('[data-studio-contrainte-objet="0"]').selectOption("ligne-b");
  await ctr.locator("[data-studio-contrainte-poser]").click();
  const insat = await ctr.locator("[data-studio-contrainte-erreur]").innerText();
  check("Insatisfaisable (horizontale puis verticale de la même ligne) : refusé avec son motif, jamais résolu en silence", /insatisfaisable/.test(insat) && (await ctr.locator("[data-studio-contrainte]").count()) === 3, insat);
  await ctr.locator("[data-studio-contrainte-type]").selectOption("horizontal");
  await ctr.locator('[data-studio-contrainte-objet="0"]').selectOption("ligne-b");
  await ctr.locator("[data-studio-contrainte-poser]").click();
  const sur = await ctr.locator("[data-studio-contrainte-erreur]").innerText();
  check("Sur-contrainte (même horizontale deux fois) : signalée, la contrainte redondante nommée, rien n'est écrit", /Sur-contrainte : .* est redondante/.test(sur) && (await ctr.locator("[data-studio-contrainte]").count()) === 3, sur);
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  await ctr.waitFor({ state: "detached" });
  await enregistrer();
  const rev2 = (await tete()).document;
  check("Enregistré : trois contraintes satisfaites dans la révision serveur (aucune « à résoudre »)", rev2.contraintes?.length === 3 && rev2.contraintes.every((c) => !c.aResoudre), JSON.stringify(rev2.contraintes?.map((c) => c.type)));

  // ——— Une autre écriture rompt une contrainte : « à résoudre » côté serveur, résolue sur demande dans l'interface ———
  const rot = await envoyer([{ toolId: "studio.dessin.rotation", params: { ids: ["ligne-b"], center: { x: 0, y: 6 }, angle: 0.3 } }]);
  const rev3 = (await tete()).document;
  check("API : une rotation de la ligne contrainte est acceptée ; le serveur marque sa contrainte « à résoudre » (géométrie gardée)",
    rot.ok() && rev3.contraintes.filter((c) => c.aResoudre).map((c) => c.type).join() === "horizontal", JSON.stringify(rev3.contraintes.map((c) => [c.type, !!c.aResoudre])));
  const avantRefus = (await tete()).id;
  const parallele = rev3.contraintes.find((c) => c.type === "parallele");
  const refusApi = await envoyer([{ toolId: "studio.contrainte.poser", params: { contraintes: [{ id: "x-doublon", type: "parallele", cibles: parallele.cibles }] } }]);
  const corpsRefus = await refusApi.text();
  check("API : une sur-contrainte (même parallélisme posé deux fois) est refusée par le serveur (400 studio-invalid, motif nommé), révision inchangée",
    refusApi.status() === 400 && /"code":"studio-invalid"/.test(corpsRefus) && /sur-contrainte : x-doublon/.test(corpsRefus) && (await tete()).id === avantRefus, `${refusApi.status()} ${corpsRefus.slice(0, 200)}`);
  await ouvrir();
  await flou();
  await page.keyboard.press("Control+F1");
  await ctr.waitFor();
  const statuts = await ctr.locator("[data-studio-contrainte]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-contrainte-statut")));
  check("Interface : la contrainte rompue est montrée « à résoudre » (et sa marque en rouge)", statuts.filter((s) => s === "a-resoudre").length === 1 && (await planche.locator(".studio-contrainte-marque.a-resoudre").count()) === 1, JSON.stringify(statuts));
  const rompue = await ctr.locator('[data-studio-contrainte-statut="a-resoudre"]').getAttribute("data-studio-contrainte");
  await ctr.locator(`[data-studio-contrainte-coche="${rompue}"]`).check();
  await ctr.locator("[data-studio-contrainte-resoudre]").click();
  await page.waitForFunction(() => !document.querySelector('[data-studio-contrainte-statut="a-resoudre"]'));
  check("« Résoudre les contraintes cochées » : satisfaite de nouveau, sur demande seulement", (await ctr.locator('[data-studio-contrainte-statut="satisfaite"]').count()) === 3);
  await page.locator("[role=dialog] [data-studio-fermer-dialogue]").click();
  await enregistrer();
  const rev4 = (await tete()).document;
  const b = rev4.objects.find((o) => o.id === "ligne-b");
  check("Enregistré : contrainte résolue par le serveur (ligne horizontale à 10⁻⁹ m près), aucune « à résoudre »", rev4.contraintes.every((c) => !c.aResoudre) && Math.abs(b.end.y - b.start.y) < 1e-9, JSON.stringify(b));
  await page.screenshot({ path: `${OUT}/studio-w3a.png` });
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echec = e;
} finally {
  writeFileSync(`${OUT}/studio-w3a.json`, `${JSON.stringify({ recette: "studio-w3a", date: new Date().toISOString(), base: BASE, controles, erreurs, ...(echec ? { echec: String(echec.message ?? echec) } : {}) }, null, 2)}\n`);
  await browser.close();
}
if (echec) { console.error(echec); process.exit(1); }
console.log(`Recette studio-w3a : ${controles.length} contrôles réussis.`);
