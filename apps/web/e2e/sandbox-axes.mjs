#!/usr/bin/env node
/**
 * Recette du chantier Axes (lots AX-1 et AX-2 ; concept `Fadi Concept - Axes.md` 1.0, § 11) dans le Sandbox :
 * - AX01 / AX03 : Placer les axes (Maj + Y) puis « [2;1;0] » au champ Mesures — origine déplacée, orientation gardée,
 *   géométrie et historique inchangés ; trois clics le long d'une direction à 45° ;
 * - AX02 : trois points alignés — refus expliqué, aucun repère posé, Échap annule l'aperçu ;
 * - AX05 : Aligner sur une face sélectionnée — Z du repère = normale de la face ;
 * - AX06 : plan de travail (Alt + Maj + 4), verrou (Alt + Maj + 5), vue normale (Alt + Maj + 6), affichage des axes (F4) —
 *   chacun ne change que ce qu'il annonce ;
 * - AX07 : Repère précédent (Alt + Maj + 7) ≠ Annuler (Ctrl + Z) ; Repère du modèle (Alt + Maj + 8) ;
 * - inspecteur : rotation de 90° autour de Z local (Alt + Maj + 3) ;
 * - AX17 : barre au clavier (Échap ferme le menu), raccourcis ignorés dans un champ, téléphone (barre rangée en bas, sans
 *   débordement horizontal), noms accessibles ;
 * - contexte de travail mémorisé par Planche (rechargement), aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/sandbox-axes node apps/web/e2e/sandbox-axes.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/sandbox-axes";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const proche = (a, b, tol = 1e-6) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];

async function nouvellePage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  return { context, page };
}

async function ouvrirSandbox(page) {
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  await page.waitForTimeout(400);
  await page.locator("[data-planche-vue]").focus();
}

const etat = (page) =>
  page.evaluate(() => {
    const P = window.fadiPlanche;
    const m = P.modele();
    return {
      sommets: Object.values(m.racine.sommets).map((s) => s.position),
      faces: Object.keys(m.racine.faces),
      pas: P.pas(),
      outil: P.outil(),
      ctx: P.contexteTravail(),
      options: P.options(),
      camera: P.camera(),
      repereDocument: m.annotations?.repere ?? null,
    };
  });

async function outils(page) {
  const boite = async () => page.locator("[data-planche-vue] canvas").boundingBox();
  const ecran = async (q) => {
    const b = await boite();
    const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
    return { x: b.x + e.x, y: b.y + e.y };
  };
  const survoler = async (q) => {
    const e = await ecran(q);
    await page.mouse.move(e.x, e.y, { steps: 4 });
    return e;
  };
  const cliquer = async (q) => {
    const e = await survoler(q);
    await page.mouse.click(e.x, e.y);
    await page.waitForTimeout(60);
  };
  const touche = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(80);
  };
  const saisir = async (texte) => {
    await page.keyboard.type(texte);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  };
  return { cliquer, survoler, touche, saisir };
}

const ligneEtat = (page) => page.locator("[data-reperes-etat] button").innerText();

try {
  // ———————————————————————————————————————————————————————————— Ordinateur
  const { context, page } = await nouvellePage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `axes-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "sandbox-axes-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await ouvrirSandbox(page);
  const { cliquer, touche, saisir } = await outils(page);

  let e = await etat(page);
  check("ligne d'état au départ : repère du modèle, plan XY du modèle, portée Modèle, unité m", /Repère : Modèle · Plan : XY du modèle · Portée : Modèle · Unité : m/.test(await ligneEtat(page)), await ligneEtat(page));

  // Une face de référence (rectangle de 2 m × 1 m au sol) : elle ne doit jamais bouger.
  await touche("r");
  await cliquer({ x: 1, y: 1, z: 0 });
  await cliquer({ x: 3, y: 2, z: 0 });
  await touche("Space");
  e = await etat(page);
  const reference = e.sommets;
  const pasReference = e.pas;
  check("rectangle de référence dessiné (4 sommets, 1 face)", reference.length === 4 && e.faces.length === 1, `${reference.length} sommets, ${e.faces.length} faces`);

  // AX03 — Placer les axes (Maj + Y) : la barre s'affiche ; « [2;1;0] » déplace l'origine seule.
  await touche("Shift+Y");
  check("Maj + Y : outil Axes actif et barre « Axes et repères » affichée", (await etat(page)).outil === "axes" && (await page.locator("[data-barre-reperes]").count()) === 1);
  await saisir("[2;1;0]");
  e = await etat(page);
  check("AX03 : origine saisie (2 ; 1 ; 0), axes du modèle conservés, contexte « temporaire »", proche(e.ctx.contexte.repere?.origine, { x: 2, y: 1, z: 0 }) && proche(e.ctx.contexte.repere?.x, { x: 1, y: 0, z: 0 }) && e.ctx.contexte.source.genre === "temporaire", JSON.stringify(e.ctx.contexte));
  check("AX03 : géométrie et historique inchangés, document sans repère écrit", JSON.stringify(e.sommets) === JSON.stringify(reference) && e.pas === pasReference && e.repereDocument === null);
  check("ligne d'état : repère temporaire, plan XY local, portée Travail", /Repère : Repère temporaire · Plan : XY local · Portée : Travail/.test(await ligneEtat(page)), await ligneEtat(page));

  // AX01 — trois clics : origine (0 ; 0 ; 0), X vers (1 ; 1 ; 0), côté Y vers (−1 ; 1 ; 0).
  await touche("Shift+Y");
  await cliquer({ x: 0, y: 0, z: 0 });
  await cliquer({ x: 1.5, y: 1.5, z: 0 });
  await cliquer({ x: -1.5, y: 1.5, z: 0 });
  e = await etat(page);
  const r45 = e.ctx.contexte.repere;
  check("AX01 : repère à 45° (X = (√2/2 ; √2/2 ; 0), Z = +Z), géométrie inchangée", !!r45 && proche(r45.x, { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, 1e-3) && proche(r45.z, { x: 0, y: 0, z: 1 }, 1e-3) && JSON.stringify(e.sommets) === JSON.stringify(reference), JSON.stringify(r45));
  check("AX07 : deux contextes précédents (modèle, origine saisie)", e.ctx.precedents === 2, String(e.ctx.precedents));

  // AX02 — trois points alignés : refus expliqué, rien n'est posé.
  await touche("Shift+Y");
  await cliquer({ x: 0, y: 0, z: 0 });
  await cliquer({ x: 1, y: 0, z: 0 });
  await cliquer({ x: 3, y: 0, z: 0 });
  const message = await page.locator("[data-planche-message]").innerText().catch(() => "");
  e = await etat(page);
  check("AX02 : refus « points alignés » affiché, repère inchangé, aucun contexte poussé", /alignés/.test(message) && proche(e.ctx.contexte.repere?.x, r45.x, 1e-9) && e.ctx.precedents === 2, message);
  await touche("Escape");
  e = await etat(page);
  check("AX02 : Échap annule tout l'aperçu, sans rien poser", e.ctx.precedents === 2 && proche(e.ctx.contexte.repere?.x, r45.x, 1e-9));
  await touche("Space");

  // AX05 — Aligner sur une face sélectionnée (avant toute vue normale : la face est visible d'au-dessus).
  const centre = { x: 2, y: 1.5, z: 0 };
  await cliquer(centre);
  await touche("Alt+Shift+Digit2");
  e = await etat(page);
  check("AX05 : Alt + Maj + 2 — repère aligné sur la face (Z = ±normale, origine au centre), géométrie inchangée", Math.abs(Math.abs(e.ctx.contexte.repere?.z.z ?? 0) - 1) < 1e-9 && proche(e.ctx.contexte.repere?.origine, centre, 1e-6) && JSON.stringify(e.sommets) === JSON.stringify(reference), JSON.stringify(e.ctx.contexte.repere));
  await touche("Alt+Shift+Digit7");
  e = await etat(page);
  check("Repère précédent : retour au repère à 45°", proche(e.ctx.contexte.repere?.x, r45.x, 1e-9) && e.ctx.precedents === 2);

  // AX06 — plan de travail, verrou, vue normale, affichage : chacun ne change que ce qu'il annonce.
  await touche("Alt+Shift+Digit4");
  e = await etat(page);
  check("AX06 : Alt + Maj + 4 — plan XZ local (repère inchangé)", e.ctx.contexte.plan === "xz" && proche(e.ctx.contexte.repere?.x, r45.x, 1e-9) && /Plan : XZ local/.test(await ligneEtat(page)), await ligneEtat(page));
  await touche("Alt+Shift+Digit5");
  e = await etat(page);
  check("AX06 : Alt + Maj + 5 — plan verrouillé, bouton enfoncé ; géométrie inchangée", e.ctx.contexte.verrou === true && JSON.stringify(e.sommets) === JSON.stringify(reference) && /verrouillé/.test(await ligneEtat(page)));
  const cameraAvant = e.camera;
  await touche("Alt+Shift+Digit6");
  e = await etat(page);
  check("AX06 : Alt + Maj + 6 — vue normale au plan : la caméra bouge, ni le repère ni la géométrie", JSON.stringify(e.camera.position) !== JSON.stringify(cameraAvant.position) && e.ctx.contexte.plan === "xz" && e.ctx.contexte.verrou && JSON.stringify(e.sommets) === JSON.stringify(reference));
  const axesAvant = e.options.axes;
  await touche("F4");
  e = await etat(page);
  check("AX06 : F4 — affichage des axes basculé, contexte inchangé", e.options.axes === !axesAvant && e.ctx.contexte.verrou === true);
  await touche("F4");
  await touche("Alt+Shift+Digit5");
  await touche("Alt+Shift+Digit4");
  await touche("Alt+Shift+Digit4");
  e = await etat(page);
  check("plan revenu à XY, verrou levé (cycle XY → XZ → YZ → XY)", e.ctx.contexte.plan === "xy" && e.ctx.contexte.verrou === false, JSON.stringify(e.ctx.contexte.plan));

  // Inspecteur — rotation de 90° autour de Z local (axe nommé, angle signé).
  await touche("Alt+Shift+Digit3");
  check("Alt + Maj + 3 : inspecteur ouvert (origine, orientation, rotation, plan)", (await page.locator("[data-reperes-inspecteur]").count()) === 1);
  await page.selectOption("[data-reperes-pivoter-axe]", "z");
  await page.selectOption("[data-reperes-pivoter-base]", "local");
  await page.fill("[data-reperes-pivoter-angle]", "90");
  // Un raccourci tapé dans un champ ne déclenche pas de commande.
  await page.locator("[data-reperes-pivoter-angle]").press("Alt+Shift+Digit8");
  e = await etat(page);
  check("AX17 : Alt + Maj + 8 tapé dans un champ de l'inspecteur n'agit pas", e.ctx.contexte.source.genre === "temporaire");
  await page.click("[data-reperes-pivoter]");
  e = await etat(page);
  check("rotation de 90° autour de Z local : X devient (−√2/2 ; √2/2 ; 0)", proche(e.ctx.contexte.repere?.x, { x: -Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, 1e-6), JSON.stringify(e.ctx.contexte.repere?.x));
  await page.fill("[data-reperes-origine='x']", "abc");
  await page.click("[data-reperes-origine-appliquer]");
  check("origine non numérique : refus affiché, rien ne change", /nombre fini/.test(await page.locator("[data-reperes-erreur]").innerText()) && proche((await etat(page)).ctx.contexte.repere?.x, { x: -Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, 1e-6));
  await page.click("[data-reperes-inspecteur-fermer]");
  await page.locator("[data-planche-vue]").focus();

  // AX07 — Précédent ≠ Annuler.
  const precedentsAvant = (await etat(page)).ctx.precedents;
  await touche("Alt+Shift+Digit7");
  e = await etat(page);
  check("AX07 : Alt + Maj + 7 — contexte précédent (avant la rotation), géométrie et historique intacts", proche(e.ctx.contexte.repere?.x, r45.x, 1e-6) && e.ctx.precedents === precedentsAvant - 1 && e.pas === pasReference);
  await touche("Control+z");
  e = await etat(page);
  check("AX07 : Ctrl + Z annule la géométrie (le rectangle), pas le contexte de travail", e.faces.length === 0 && proche(e.ctx.contexte.repere?.x, r45.x, 1e-6));
  await touche("Control+y");
  e = await etat(page);
  check("Ctrl + Y rétablit le rectangle à l'identique", JSON.stringify(e.sommets) === JSON.stringify(reference));

  // Sans face sélectionnée, Aligner dit pourquoi.
  await touche("Space");
  await cliquer({ x: 8, y: 8, z: 0 });
  const motifAligner = await page.locator("[data-reperes-commande='aligner-repere']").getAttribute("aria-label");
  check("sans face sélectionnée, Aligner est grisé et dit pourquoi", /Sélectionnez une face/.test(motifAligner ?? ""), motifAligner ?? "");

  // AX17 — barre au clavier : menu « Plus », Échap le ferme et rend le focus.
  await page.click("[data-reperes-plus]");
  check("menu « Plus » : Pivoter, Verrouiller, Vue normale, Affichage, Enregistrer, Gérer, Inspecteur, avec leurs raccourcis", (await page.locator("[data-reperes-menu-plus] [data-reperes-commande]").count()) === 6 && /Alt/.test(await page.locator("[data-reperes-menu-plus]").innerText()));
  await page.keyboard.press("Escape");
  check("Échap ferme le menu et rend le focus au bouton « Plus »", (await page.locator("[data-reperes-menu-plus]").count()) === 0 && (await page.evaluate(() => document.activeElement?.hasAttribute("data-reperes-plus"))) === true);
  const sansNom = await page.locator("[data-barre-reperes] button").evaluateAll((bs) => bs.filter((b) => !(b.getAttribute("aria-label") || b.textContent?.trim())).length);
  check("AX17 : chaque bouton de la barre a un nom accessible", sansNom === 0, String(sansNom));

  // AX07 — Repère du modèle ; puis mémoire par Planche au rechargement.
  await page.locator("[data-planche-vue]").focus();
  await touche("Alt+Shift+Digit8");
  e = await etat(page);
  check("Alt + Maj + 8 — repère du modèle et plan XY, géométrie inchangée", e.ctx.contexte.source.genre === "modele" && e.ctx.contexte.repere === null && JSON.stringify(e.sommets) === JSON.stringify(reference));
  await touche("Alt+Shift+Digit7");
  const avantRechargement = (await etat(page)).ctx.contexte;
  await page.screenshot({ path: join(OUT, "axes-ordinateur.png") });
  // Laisser l'enregistrement automatique écrire le brouillon avant de recharger.
  await page.waitForFunction(() => /Enregistré/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => undefined);
  await page.reload();
  await ouvrirSandbox(page);
  e = await etat(page);
  check("contexte de travail mémorisé par Planche dans ce navigateur (rechargement)", JSON.stringify(e.ctx.contexte) === JSON.stringify(avantRechargement) && e.ctx.precedents === 0, JSON.stringify(e.ctx.contexte.source));
  check("rechargement : la barre « Axes et repères » reste affichée (préférence de l'appareil)", (await page.locator("[data-barre-reperes]").count()) === 1);
  await context.close();

  // ———————————————————————————————————————————————————————————— Téléphone
  const tel = await nouvellePage({ width: 390, height: 844 });
  await tel.page.goto(`${BASE}/connexion`).catch(() => undefined);
  await tel.page.goto(`${BASE}/inscription`);
  await tel.page.fill('input[name="email"]', `axes-tel-${Date.now()}@example.com`);
  await tel.page.fill('input[name="password"]', "sandbox-axes-ci-123");
  await tel.page.click('button[type="submit"]');
  await tel.page.waitForURL(/\/(accueil|projets)$/);
  await ouvrirSandbox(tel.page);
  await tel.page.keyboard.press("Alt+Shift+Digit1");
  await tel.page.waitForTimeout(200);
  const barre = tel.page.locator("[data-barre-reperes]");
  check("téléphone : Alt + Maj + 1 ouvre la barre et la liste des repères", (await barre.count()) === 1 && (await tel.page.locator("[data-reperes-liste]").count()) === 1);
  check("téléphone : barre rangée en bas", (await barre.getAttribute("data-position")) === "docquee");
  check("téléphone : sélecteur et Placer visibles dans la rangée, le reste dans « Plus »", (await barre.locator(".planche-reperes-rangee [data-reperes-commande]").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-reperes-commande")).join(","))) === "choisir-repere,placer");
  await tel.page.click("[data-reperes-plus]");
  check("téléphone : « Plus » offre les dix autres commandes et l'inspecteur", (await tel.page.locator("[data-reperes-menu-plus] [data-reperes-commande]").count()) === 10 && (await tel.page.locator("[data-reperes-inspecteur-bascule]").count()) === 1);
  const debordement = await tel.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const b = await barre.boundingBox();
  check("téléphone : aucun débordement horizontal, barre entière dans l'écran", debordement <= 0 && !!b && b.x >= 0 && b.x + b.width <= 390, `${debordement} px ; ${JSON.stringify(b)}`);
  await tel.page.screenshot({ path: join(OUT, "axes-telephone.png") });
  await tel.context.close();

  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (err) {
  console.error(err);
  echecs++;
} finally {
  await browser.close();
}
console.log(echecs === 0 ? "RECETTE AXES : OK" : `RECETTE AXES : ${echecs} échec(s)`);
process.exit(echecs === 0 ? 0 : 1);
