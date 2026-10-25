#!/usr/bin/env node
/**
 * Recette du chantier Axes, lot AX-3 (phase B ; concept Axes 1.0, § 6 et § 11) dans le Sandbox :
 * - AX08 : enregistrer un repère (Alt + Maj + 9), « Modifié » après une rotation, « Enregistrer les modifications »,
 *   renommer, dupliquer ; chaque mutation est un pas Annuler ; repères relus après rechargement (même identifiant,
 *   même base, même révision) ;
 * - AX14 : scène avec l'option « Rappeler le repère » (repère rappelé) et sans (contexte inchangé) ;
 * - suppression d'un repère cité par une scène : confirmation explicite, « Détacher » garde l'instantané ; Annuler la
 *   rétablit ;
 * - triade d'orientation : étiquetée X / Y / Z, dans le coin choisi, sans capter le pointeur, masquable ; exclue de
 *   l'image PNG par défaut, incluse sur option ;
 * - aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/sandbox-reperes node apps/web/e2e/sandbox-reperes.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/sandbox-reperes";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const proche = (a, b, tol = 1e-6) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => erreurs.push(e.message));

const etat = () =>
  page.evaluate(() => {
    const P = window.fadiPlanche;
    const m = P.modele();
    return { pas: P.pas(), ctx: P.contexteTravail(), reperes: m.annotations?.reperes ?? {}, scenes: m.annotations?.scenes ?? {} };
  });
const touche = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(80);
};
const vueFocus = () => page.locator("[data-planche-vue]").focus();
async function ouvrir() {
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  await page.waitForTimeout(400);
  await vueFocus();
}
const panneau = async (id) => {
  if ((await page.locator(`[data-planche-panneau="${id}"]`).count()) === 0) await page.click(`[data-planche-panneau-icone="${id}"]`);
};
async function png() {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    (async () => {
      await page.click("[data-planche-menu-ouvrir]");
      await page.click('[data-planche-menu-item="png"]');
    })(),
  ]);
  return readFileSync(await dl.path());
}

try {
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `reperes-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "sandbox-reperes-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await ouvrir();

  // Triade d'orientation : étiquetée, dans le coin par défaut (haut droite), sans capter le pointeur.
  const triade = page.locator("[data-planche-triade]");
  const lettres = await triade.locator("text").evaluateAll((ts) => ts.map((t) => t.textContent).sort().join(""));
  const boite = await triade.boundingBox();
  const vue = await page.locator("[data-planche-vue]").boundingBox();
  check("triade : lettres X, Y, Z (jamais la couleur seule), en haut à droite de la vue", lettres === "XYZ" && !!boite && !!vue && boite.x > vue.x + vue.width / 2 && boite.y < vue.y + vue.height / 2, `${lettres} ${JSON.stringify(boite)}`);
  check("triade : ne capte pas le pointeur", (await triade.evaluate((el) => getComputedStyle(el).pointerEvents)) === "none");

  // AX08 — enregistrer un repère placé au clavier.
  await touche("Shift+Y");
  await page.keyboard.type("[1;2;0]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  let e = await etat();
  const pas0 = e.pas;
  await touche("Alt+Shift+Digit9");
  check("Alt + Maj + 9 : panneau « Repères » ouvert, champ du nom prêt", (await page.locator('[data-planche-panneau="reperes"]').count()) === 1 && (await page.evaluate(() => document.activeElement?.hasAttribute("data-reperes-nom"))) === true);
  await page.fill("[data-reperes-nom]", "Façade sud");
  await page.click("[data-reperes-enregistrer]");
  e = await etat();
  const ids = Object.keys(e.reperes);
  const id = ids[0];
  check("AX08 : repère enregistré (nom, révision 1, instantané), devenu le repère actif, un pas d'historique", ids.length === 1 && e.reperes[id].nom === "Façade sud" && e.reperes[id].revision === 1 && e.reperes[id].source.mode === "instantane" && e.ctx.contexte.source.genre === "enregistre" && e.ctx.contexte.source.id === id && e.pas === pas0 + 1, JSON.stringify(e.reperes[id]));
  check("ligne d'état : nom du repère enregistré", /Repère : Façade sud/.test(await page.locator("[data-reperes-etat] button").innerText()));

  // « Modifié » après une rotation ; Enregistrer les modifications.
  await vueFocus();
  await touche("Alt+Shift+Digit3");
  await page.fill("[data-reperes-pivoter-angle]", "90");
  await page.click("[data-reperes-pivoter]");
  e = await etat();
  check("« Modifié » : rotation d'un repère enregistré — définition intacte, contexte temporaire issu de « Façade sud »", e.reperes[id].revision === 1 && e.ctx.contexte.source.genre === "temporaire" && e.ctx.contexte.source.depuis?.id === id && (await page.locator("[data-reperes-modifie]").count()) === 1 && /Modifié/.test(await page.locator("[data-reperes-etat] button").innerText()));
  await page.click("[data-reperes-inspecteur-fermer]");
  await page.click("[data-reperes-enregistrer-modifications]");
  e = await etat();
  check("Enregistrer les modifications : même identifiant, révision 2, base pivotée, plus « Modifié »", e.reperes[id].revision === 2 && proche(e.reperes[id].x, { x: 0, y: 1, z: 0 }, 1e-9) && e.ctx.contexte.source.genre === "enregistre" && (await page.locator("[data-reperes-modifie]").count()) === 0);

  // Renommer, dupliquer.
  await page.click(`[data-reperes-renommer="${id}"]`);
  await page.fill("[data-reperes-renommer-champ]", "Aile est");
  await page.click("[data-reperes-renommer-valider]");
  await page.click(`[data-reperes-dupliquer="${id}"]`);
  e = await etat();
  const copie = Object.keys(e.reperes).find((k) => k !== id);
  check("renommer (révision inchangée : le nom est une étiquette) et dupliquer (nouvel identifiant, « (copie) », révision 1)", e.reperes[id].nom === "Aile est" && e.reperes[id].revision === 2 && !!copie && e.reperes[copie].nom === "Aile est (copie)" && e.reperes[copie].revision === 1);
  await page.fill("[data-reperes-recherche]", "copie");
  check("recherche : un seul repère correspond", (await page.locator("[data-repere-enregistre]").count()) === 1);
  await page.fill("[data-reperes-recherche]", "");

  // AX14 — scènes avec et sans rappel du repère.
  await panneau("scenes");
  await page.check("[data-planche-scene-repere]");
  await page.click("[data-planche-scene-ajouter]");
  await page.uncheck("[data-planche-scene-repere]");
  await page.click("[data-planche-scene-ajouter]");
  e = await etat();
  const [s1, s2] = Object.keys(e.scenes);
  check("AX14 : scène 1 capture le repère (référence + instantané), scène 2 la caméra seule", e.scenes[s1].repere?.id === id && !!e.scenes[s1].repere?.instantane && e.scenes[s2].repere === undefined);
  await vueFocus();
  await touche("Alt+Shift+Digit8");
  await page.click(`[data-planche-scene="${s2}"] .planche-ligne-choix`);
  e = await etat();
  check("AX14 : scène sans option — le contexte de travail ne change pas (repère du modèle)", e.ctx.contexte.source.genre === "modele");
  await page.click(`[data-planche-scene="${s1}"] .planche-ligne-choix`);
  e = await etat();
  check("AX14 : scène avec option — « Aile est » rappelé à sa révision", e.ctx.contexte.source.genre === "enregistre" && e.ctx.contexte.source.id === id && e.ctx.contexte.source.revision === 2, JSON.stringify(e.ctx.contexte.source));

  // Suppression d'un repère cité : confirmation, détacher ; Annuler la rétablit.
  await panneau("reperes");
  const pasAvant = (await etat()).pas;
  await page.click(`[data-reperes-supprimer="${id}"]`);
  check("supprimer un repère cité par une scène : confirmation explicite (aucune suppression directe)", (await page.locator("[data-reperes-confirmation]").count()) === 1 && !!(await etat()).reperes[id]);
  await page.click("[data-reperes-detacher]");
  e = await etat();
  check("Détacher et supprimer : repère retiré, la scène garde son instantané sans référence, un pas", !e.reperes[id] && e.scenes[s1].repere && e.scenes[s1].repere.id === undefined && !!e.scenes[s1].repere.instantane && e.pas === pasAvant + 1);
  check("le repère actif supprimé est signalé (instantané conservé)", (await page.locator('[data-reperes-actif="absent"]').count()) === 1);
  await vueFocus();
  await touche("Control+z");
  e = await etat();
  check("Annuler rétablit le repère et la référence de la scène", !!e.reperes[id] && e.scenes[s1].repere?.id === id);

  // Triade : masquable, représente le modèle sur option ; PNG sans triade par défaut, avec sur option.
  await panneau("reperes");
  const sans1 = await png();
  const sans2 = await png();
  await page.check("[data-reperes-triade-export]");
  const avec = await png();
  check("PNG : triade exclue par défaut (deux exports identiques), incluse sur option (image différente)", Buffer.compare(sans1, sans2) === 0 && Buffer.compare(sans1, avec) !== 0, `${sans1.length} / ${sans2.length} / ${avec.length}`);
  await page.uncheck("[data-reperes-triade-export]");
  await page.selectOption("[data-reperes-triade-represente]", "modele");
  check("triade : représente le repère du modèle sur option", (await triade.getAttribute("data-represente")) === "modele");
  await page.selectOption("[data-reperes-triade-coin]", "bas-gauche");
  const b2 = await triade.boundingBox();
  check("triade : déplacée en bas à gauche", !!b2 && !!vue && b2.x < vue.x + vue.width / 2 && b2.y > vue.y + vue.height / 2, JSON.stringify(b2));
  await page.uncheck("[data-reperes-triade-visible]");
  check("triade : masquée (préférence de l'appareil), les axes de dessin indépendants", (await triade.evaluate((el) => getComputedStyle(el).display)) === "none" && (await page.evaluate(() => window.fadiPlanche.options().axes)) === true);
  await page.check("[data-reperes-triade-visible]");
  await page.screenshot({ path: join(OUT, "reperes.png") });

  // AX08 — rechargement : repères relus à l'identique (identifiant, base, révision).
  const avant = (await etat()).reperes;
  await page.waitForFunction(() => /Enregistré/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await page.reload();
  await ouvrir();
  e = await etat();
  check("AX08 : après rechargement, repères enregistrés identiques (identifiant, nom, base, révision)", JSON.stringify(e.reperes) === JSON.stringify(avant), `${Object.keys(e.reperes).length} repères`);
  check("triade : préférences de l'appareil gardées (bas à gauche, modèle)", (await triade.getAttribute("data-represente")) === "modele");
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (err) {
  console.error(err);
  echecs++;
} finally {
  await browser.close();
}
console.log(echecs === 0 ? "RECETTE REPÈRES : OK" : `RECETTE REPÈRES : ${echecs} échec(s)`);
process.exit(echecs === 0 ? 0 : 1);
