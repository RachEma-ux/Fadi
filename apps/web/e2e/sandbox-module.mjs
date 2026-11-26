#!/usr/bin/env node
/**
 * Recette du module Sandbox (lot 1, décision du maître d'ouvrage du 20 octobre 2026 : 8ᵉ module, autonome) :
 * - `/sandbox` charge la Planche de Sandbox (vue 3D, barre d'outils visible et garnie), sous l'enveloppe de Fadi, avec le
 *   fil d'Ariane « Studio / Console / Sandbox » et l'entrée « Console » marquée (apparence inchangée) ;
 * - l'ancienne adresse `/studio/console/sandbox` redirige vers `/sandbox` (remplacement dans l'historique) ;
 * - la carte « 00 Sandbox » de la Console est un simple lien vers `/sandbox` ;
 * - un échec du chargement de la Planche affiche la limite d'erreur du Sandbox et « Réessayer » la recharge ;
 * - chaque bouton de la barre d'outils porte un pictogramme SVG (lot 3) ;
 * - disposition par défaut proche de SketchUp (lot 4) : barre gauche, colonne à un clic, barre du haut, Cadrer, zoom ± au
 *   téléphone, curseur de l'outil ;
 * - personnalisation (lot 5) : préférences du compte (401 sans session, entrée inconnue refusée), profil, favori,
 *   regroupement, rechargement, copie locale si le serveur manque, « Réinitialiser » ;
 * - au téléphone, la barre d'actions ne recouvre pas la barre d'outils de gauche ;
 * - aucun appel à l'API d'un projet (Atelier, Studio, Parcours) pendant que le Sandbox est ouvert, aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/sandbox node apps/web/e2e/sandbox-module.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/sandbox";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
// Appels à l'API d'un projet (Atelier, Studio, Parcours…) pendant que le Sandbox est ouvert : le Sandbox n'en fait aucun.
// La liste des projets (`GET /projects`) est lue par l'enveloppe de Fadi (barre latérale), sur toute page : hors du contrôle.
let surSandbox = false;
const appels = [];

async function nouvellePage(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("request", (r) => {
    const chemin = new URL(r.url()).pathname;
    if (surSandbox && r.resourceType() !== "document" && (/^\/projects\/./.test(chemin) || /^\/(atelier|studio)(\/|$)/.test(chemin) || (chemin === "/projects" && r.method() !== "GET"))) appels.push(`${r.method()} ${r.url()}`);
  });
  return { context, page };
}

async function inscrire(page) {
  await inscrireDansLaPage(page, `sandbox-${Date.now()}@example.com`, "sandbox-module-ci-123", BASE);
  await page.waitForURL(/\/(accueil|projets)$/);
}

/** Disposition par défaut proche de SketchUp (lot 4), sur ordinateur et sur téléphone. */
/** Aspect du chevron (fond, bordure, texte, contour) : il ne change jamais de couleur (demande du 24 novembre 2026). */
const aspectChevron = (racine) => racine.evaluate((r) => {
  const c = getComputedStyle(r.querySelector("[data-planche-colonne-bascule]"));
  return [c.backgroundColor, c.borderTopColor, c.color, c.outlineStyle].join(" | ");
});

/** Écran tactile : chevron caché au repos, affiché ~3 s après un toucher sur la colonne, et un toucher dessus plie / déplie. */
async function toucherColonneEtChevron(page, racine, contexte, repos) {
  const etat = () => racine.evaluate((r) => {
    const k = r.querySelector("[data-planche-colonne-bascule]");
    return { opacite: Number(getComputedStyle(k).opacity), visible: getComputedStyle(k).visibility === "visible", replie: r.querySelector("[data-planche]").classList.contains("colonne-repliee"), panneau: r.querySelectorAll("[data-planche-panneau]").length };
  });
  check(`${contexte} : chevron caché au repos (écran tactile)`, repos.opacite === 0 && !(await etat()).visible, JSON.stringify(repos));
  // Toucher un bouton de la colonne : son panneau s'ouvre comme avant, et le chevron paraît, au-dessus du panneau.
  await racine.locator("[data-planche-panneau-icone='styles']").tap();
  await page.waitForTimeout(300);
  const touche = await etat();
  const dessus = await racine.evaluate((r) => {
    const k = r.querySelector("[data-planche-colonne-bascule]");
    const b = k.getBoundingClientRect();
    const el = k.ownerDocument.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return el === k || k.contains(el);
  });
  check(`${contexte} : un toucher sur la colonne ouvre le panneau et fait paraître le chevron, au-dessus`, touche.panneau === 1 && touche.opacite === 1 && touche.visible && dessus, JSON.stringify(touche));
  const avant = touche.replie;
  const aspect = await aspectChevron(racine);
  await racine.locator("[data-planche-colonne-bascule]").tap();
  await page.waitForTimeout(200);
  check(`${contexte} : un toucher sur le chevron plie / déplie la colonne`, (await etat()).replie === !avant);
  check(`${contexte} : le chevron touché ne change pas de couleur`, (await aspectChevron(racine)) === aspect, `${aspect} → ${await aspectChevron(racine)}`);
  await racine.locator("[data-planche-colonne-bascule]").tap();
  await page.waitForTimeout(200);
  check(`${contexte} : un second toucher la remet comme avant`, (await etat()).replie === avant);
  await page.waitForTimeout(3600);
  check(`${contexte} : sans nouveau toucher, le chevron disparaît (environ 3 s)`, !(await etat()).visible);
  await racine.locator("[data-planche-panneau-icone='styles']").tap();
  await page.waitForTimeout(3600);
}

async function disposition(page, contexte, tactile = contexte === "téléphone") {
  const racine = page.locator("[data-sandbox-page] [data-sandbox-planche]");
  const barre = await racine.locator('.planche-outils[role="toolbar"] [data-planche-outil]').evaluateAll((l) => l.map((b) => b.getAttribute("data-planche-outil")));
  const attendue = ["selection", "gomme", "ligne", "arc", "rectangle", "pousser-tirer", "decalage", "deplacer", "faire-pivoter", "echelle", "metre", "peinture", "orbite", "panoramique", "zoom", "zoom-etendu"];
  check(`${contexte} : barre gauche — seize outils dans l'ordre de SketchUp, puis « ⋯ »`, JSON.stringify(barre) === JSON.stringify(attendue), barre.join(", "));
  check(`${contexte} : « ⋯ » en bas de la barre`, await racine.locator("[data-planche-plus]").count() === 1);
  const colonne = await racine.locator("[data-planche-panneau-icone]").evaluateAll((l) => l.map((b) => b.getAttribute("data-planche-panneau-icone")));
  check(`${contexte} : colonne — chaque panneau à un clic (Repères compris, chantier Axes), Info modèle en bas`, colonne.length === 14 && colonne.includes("reperes") && colonne.at(-1) === "info-modele" && !colonne.includes("objets"), colonne.join(", "));
  check(`${contexte} : menu Planche (pictogramme seul) et loupe ; plus de barre du haut`, (await racine.locator(".planche > [data-planche-bandeau] > [data-planche-menu-principal] [data-planche-menu-ouvrir]").count()) === 1 && (await racine.locator("[data-planche-recherche]").count() === 1) && (await racine.locator(".planche-haut").count()) === 0 && (await racine.locator("[data-planche-outils-bouton]").count()) === 0);
  await bandeau(page, racine, contexte);
  check(`${contexte} : Cadrer dans la barre d'actions`, (await racine.locator("[data-barre-actions] [data-planche-cadrer]").count()) === 1);
  const curseur = await racine.locator("[data-planche-vue]").evaluate((v) => v.style.cursor);
  check(`${contexte} : curseur propre à l'outil (Sélection : flèche)`, curseur === "default", curseur);
  // Chevron plier / déplier (comme SketchUp) : à mi-hauteur de la colonne, collé à son bord gauche ; au survol au bureau.
  const chevron = async () => racine.evaluate((r) => {
    const c = r.querySelector(".planche-colonne").getBoundingClientRect();
    const k = r.querySelector("[data-planche-colonne-bascule]");
    const b = k.getBoundingClientRect();
    return { opacite: Number(getComputedStyle(k).opacity), milieu: Math.abs(b.top + b.height / 2 - (c.top + c.height / 2)) <= 2, gauche: b.right <= c.left && c.left - b.right <= 12 };
  });
  const repos = await chevron();
  check(`${contexte} : chevron de la colonne à mi-hauteur, au bord gauche`, repos.milieu && repos.gauche, JSON.stringify(repos));
  const replie = () => racine.evaluate((r) => r.querySelector("[data-planche]").classList.contains("colonne-repliee"));
  if (!tactile) {
    check(`${contexte} : chevron caché au repos`, repos.opacite === 0);
    await racine.locator("[data-planche-panneau-icone='styles']").hover();
    await page.waitForTimeout(300);
    check(`${contexte} : chevron visible au survol de la colonne`, (await chevron()).opacite === 1);
    // Le chevron n'est pas qu'affiché : un clic plie puis déplie vraiment la colonne ; il ne change jamais de couleur.
    const avant = await replie();
    const aspect = await aspectChevron(racine);
    await racine.locator("[data-planche-colonne-bascule]").hover();
    check(`${contexte} : le chevron survolé ne change pas de couleur`, (await aspectChevron(racine)) === aspect, `${aspect} → ${await aspectChevron(racine)}`);
    await racine.locator("[data-planche-colonne-bascule]").click();
    check(`${contexte} : un clic sur le chevron plie / déplie la colonne`, (await replie()) === !avant);
    await racine.locator("[data-planche-colonne-bascule]").click();
    check(`${contexte} : un second clic la remet comme avant`, (await replie()) === avant);
    await page.mouse.move(400, 400);
    await page.waitForTimeout(900);
    check(`${contexte} : chevron de nouveau caché hors survol`, (await chevron()).opacite === 0);
  } else {
    // Écran tactile (24 novembre 2026) : pas de survol ; l'équivalent est un toucher sur la colonne, qui fait paraître le
    // chevron environ 3 s (au repos il reste caché, demande du maître d'ouvrage) ; le chevron touché plie / déplie la colonne.
    await toucherColonneEtChevron(page, racine, contexte, repos);
  }
  if (contexte === "téléphone") {
    const choix = await racine.locator(".canevas-bas select").first().isVisible().catch(() => false);
    check("téléphone : langue et périphérique restent accessibles (barre du bas)", choix === true);
    check("téléphone : boutons zoom + / − visibles", (await racine.locator('[data-barre-actions] [data-planche-zoom="plus"]').isVisible()) && (await racine.locator('[data-barre-actions] [data-planche-zoom="moins"]').isVisible()));
    // Commandes du registre : leur raccourci est affiché dans l'info-bulle (F8, Alt+Maj+Y).
    const titres = await racine.locator("[data-barre-actions] [data-planche-zoom]").evaluateAll((l) => l.map((b) => b.getAttribute("title") ?? ""));
    check("téléphone : zoom + / − portent leur raccourci", titres.length === 2 && /\(Alt\+Maj\+Y\)/.test(titres[0]) && /\(F8\)/.test(titres[1]), JSON.stringify(titres));
  }
}

/**
 * Bandeau d'en-tête (24 novembre 2026, à la manière de l'UI Shell de Carbon) : ordinateur — 48 px sombres collés en haut
 * de la Planche, ☰ dans le carré gauche (non déplaçable), « Planche » et le nom ; la loupe juste dessous ; le menu
 * s'ouvre sous le bandeau, contenu inchangé ; aucune barre flottante sur le bandeau. Téléphone — pas de bandeau, ☰ reste
 * une carte flottante déplaçable.
 */
async function bandeau(page, racine, contexte) {
  const m = await racine.evaluate((r) => {
    const box = (sel) => { const e = r.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height }; };
    const bd = r.querySelector("[data-planche-bandeau]");
    return {
      planche: box(".planche"), bandeau: box("[data-planche-bandeau]"), bouton: box("[data-planche-menu-ouvrir]"), loupe: box("[data-planche-recherche]"), cadre: box("[data-planche-cadre]"),
      actions: box("[data-barre-actions]"), affichage: getComputedStyle(bd).display, fond: getComputedStyle(bd).backgroundColor,
      nom: r.querySelector("[data-planche-bandeau-nom]")?.textContent?.trim() ?? "", nomVisible: getComputedStyle(r.querySelector("[data-planche-bandeau-nom]")).display !== "none",
      deplacable: r.querySelector("[data-planche-menu-principal]")?.getAttribute("data-planche-menu-deplacable"),
    };
  });
  if (contexte === "téléphone") {
    check("téléphone : pas de bandeau d'en-tête, ☰ reste une carte flottante déplaçable", m.affichage === "contents" && !m.nomVisible && m.deplacable === "true" && Math.abs(m.cadre.t - m.planche.t) <= 1, JSON.stringify({ a: m.affichage, d: m.deplacable }));
    return;
  }
  check(`${contexte} : bandeau d'en-tête de 48 px, sombre (#161616), en haut de la Planche, pleine largeur`, Math.round(m.bandeau.h) === 48 && Math.abs(m.bandeau.t - m.planche.t) <= 1 && Math.abs(m.bandeau.w - m.planche.w) <= 1 && m.fond === "rgb(22, 22, 22)", JSON.stringify({ b: m.bandeau, f: m.fond }));
  check(`${contexte} : ☰ dans le carré gauche du bandeau (48 × 48 px), non déplaçable`, Math.abs(m.bouton.l - m.planche.l) <= 1 && Math.abs(m.bouton.t - m.planche.t) <= 1 && Math.round(m.bouton.w) === 48 && m.bouton.h >= 46 && m.deplacable === "false", JSON.stringify(m.bouton));
  check(`${contexte} : le bandeau porte « Planche » et le nom de la Planche`, /^Planche\s+\S/.test(m.nom) && m.nomVisible, m.nom);
  check(`${contexte} : le dessin commence sous le bandeau ; la loupe remonte juste dessous`, Math.abs(m.cadre.t - m.bandeau.b) <= 1 && m.loupe.t >= m.bandeau.b && m.loupe.t - m.bandeau.b <= 16, JSON.stringify({ cadre: m.cadre.t, loupe: m.loupe.t, bandeau: m.bandeau.b }));
  // Barre d'actions intégrée au bandeau (24 novembre 2026) : au centre, dans les 48 px ; « Détacher » à droite ; plus
  // aucune barre flottante sur le dessin.
  const ba = await racine.evaluate((r) => {
    const bd = r.querySelector("[data-planche-bandeau]").getBoundingClientRect();
    const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    const actions = r.querySelector("[data-planche-bandeau] [data-planche-bandeau-actions]");
    const cadrer = r.querySelector("[data-planche-bandeau-actions] [data-planche-cadrer]");
    const detacher = r.querySelector("[data-planche-bandeau-droite] [data-planche-detacher]");
    const ids = [...r.querySelectorAll("[data-planche-bandeau-actions] [data-action]")].map((b) => b.getAttribute("data-action"));
    const grises = [...r.querySelectorAll("[data-planche-bandeau-actions] button:disabled")].map((b) => ({ id: b.getAttribute("data-action"), titre: b.getAttribute("title") ?? "" }));
    return { bd: box({ getBoundingClientRect: () => bd }), actions: actions && box(actions), cadrer: cadrer && box(cadrer), detacher: detacher && box(detacher), detacherTexte: detacher?.textContent?.trim(), ids, grises, flottantes: r.querySelectorAll(".barre-actions").length };
  });
  // 26 novembre 2026 : le centre du bandeau ne porte plus que Annuler · Rétablir | Cadrer · Zoom ; les commandes de groupe
  // restent dans la barre « Groupe » de la liste Outils, au clic droit et au clavier.
  check(`${contexte} : centre du bandeau — Annuler, Rétablir, Cadrer, Zoom ; plus de commandes de groupe ni de barre flottante`, ba.actions && ba.cadrer && ba.cadrer.t >= ba.bd.t - 1 && ba.cadrer.b <= ba.bd.b + 1 && JSON.stringify(ba.ids) === JSON.stringify(["annuler", "retablir", "cadrer", "zoom"]) && ba.flottantes === 0, JSON.stringify(ba));
  check(`${contexte} : seuls Annuler / Rétablir peuvent être grisés, avec leur motif en infobulle ; Cadrer et Zoom toujours actifs`, ba.grises.every((g) => (g.id === "annuler" || g.id === "retablir") && g.titre.includes("—")), JSON.stringify(ba.grises));
  const outilCourant = () => page.evaluate(() => window.fadiPlanche?.outil());
  await racine.locator('[data-planche-bandeau-actions] [data-action="zoom"]').click();
  check(`${contexte} : Zoom du bandeau choisit l'outil Zoom (Z), bouton enfoncé`, (await outilCourant()) === "zoom" && (await racine.locator('[data-planche-bandeau-actions] [data-action="zoom"]').getAttribute("aria-pressed")) === "true" && /\(Z\)/.test((await racine.locator('[data-planche-bandeau-actions] [data-action="zoom"]').getAttribute("title")) ?? ""), String(await outilCourant()));
  await racine.locator('.planche-outils [data-planche-outil="selection"]').click();
  check(`${contexte} : « Détacher » à droite du bandeau`, ba.detacher && Math.abs(ba.detacher.r - ba.bd.r) <= 1 && ba.detacherTexte === "Détacher", JSON.stringify(ba.detacher));
  await racine.locator("[data-planche-menu-ouvrir]").click();
  const liste = await racine.locator(".planche-menu-liste").evaluate((e) => { const b = e.getBoundingClientRect(); return { t: b.top, l: b.left, items: e.querySelectorAll("[data-planche-menu-item]").length }; });
  check(`${contexte} : ☰ ouvre le menu sous le bandeau, douze entrées (Extensions en dernier)`, liste.t >= m.bandeau.b - 1 && liste.t - m.bandeau.b <= 4 && Math.abs(liste.l - m.planche.l) <= 1 && liste.items === 12, JSON.stringify(liste));
  // Les couleurs claires du bandeau ne fuient ni dans le menu ni dans la page Informations (rendus dans le bandeau).
  const couleurMenu = await racine.locator(".planche-menu-liste [data-planche-menu-item='informations']").evaluate((e) => getComputedStyle(e).color);
  await racine.locator("[data-planche-menu-item='informations']").click();
  const info = page.locator("[data-planche-informations]");
  await info.waitFor({ state: "visible", timeout: 5000 });
  const couleurInfo = await info.evaluate((e) => getComputedStyle(e).color);
  const clair = (c) => { const n = (c.match(/\d+/g) ?? []).slice(0, 3).map(Number); return n.length === 3 && n.every((x) => x > 200); };
  check(`${contexte} : le menu et la page Informations gardent un texte foncé (rien n'hérite du bandeau sombre)`, !clair(couleurMenu) && !clair(couleurInfo), `${couleurMenu} · ${couleurInfo}`);
  await page.keyboard.press("Escape");
  await info.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  if (await racine.locator(".planche-menu-liste").count()) await page.keyboard.press("Escape");
  check(`${contexte} : Échap referme le menu`, (await racine.locator(".planche-menu-liste").count()) === 0);
}

/** Lot 6 : raccourcis harmonisés avec SketchUp — recherche Maj+S, Zoom étendu Maj+Z, Texte 3D Alt+Maj+Z, Diviser Maj+D. */
async function raccourcisHarmonises(page) {
  const racine = page.locator("[data-sandbox-page] [data-sandbox-planche]");
  const outil = () => page.evaluate(() => window.fadiPlanche?.outil());
  await page.mouse.move(700, 450);
  await page.keyboard.press("Escape");
  check("lot 6 : le bouton de recherche annonce Maj + S", /Maj \+ S/.test((await racine.locator("[data-planche-recherche]").getAttribute("title")) ?? ""));
  await page.keyboard.press("Shift+S");
  const dialogue = racine.locator("[data-planche-recherche-dialogue]");
  await dialogue.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  check("lot 6 : Maj + S ouvre la recherche d'outil (comme SketchUp)", await dialogue.isVisible());
  await page.keyboard.press("Escape");
  await dialogue.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  await page.keyboard.press("Alt+Shift+Z");
  check("lot 6 : Alt + Maj + Z choisit Texte 3D", (await outil()) === "texte-3d", String(await outil()));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+D");
  check("lot 6 : Maj + D choisit l'outil Diviser", (await outil()) === "diviser", String(await outil()));
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+Z");
  check("lot 6 : Maj + Z lance le Zoom étendu, plus Texte 3D", (await outil()) !== "texte-3d", String(await outil()));
  check("lot 6 : Cadrer annonce Maj + Z", /Maj\+Z/.test((await racine.locator("[data-planche-cadrer]").getAttribute("title")) ?? ""), (await racine.locator("[data-planche-cadrer]").getAttribute("title")) ?? "");
  await page.keyboard.press("Space");
}

/**
 * Fenêtre détachée (Document Picture-in-Picture, 24 novembre 2026) : demandée à la taille de l'écran (jamais sous
 * 1040 × 700) ; même bandeau, barre d'actions au centre ; plus de « Rattacher » : ✕ « Fermer et rattacher » à droite,
 * qui ferme la fenêtre et ramène la Planche dans la page.
 */
async function fenetreDetachee(page, context) {
  const racine = page.locator("[data-sandbox-page] [data-sandbox-planche]");
  const ouverture = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  await racine.locator("[data-planche-bandeau-droite] [data-planche-detacher]").click();
  const w = await ouverture;
  if (!w) {
    check("fenêtre détachée : ouverte (Document Picture-in-Picture)", false, "aucune fenêtre");
    return;
  }
  await w.locator("[data-planche-bandeau]").waitFor({ state: "visible" });
  const taille = await w.evaluate(() => ({ l: innerWidth, h: innerHeight, ecranL: screen.availWidth, ecranH: screen.availHeight }));
  check("fenêtre détachée : plus grande que l'ancienne fenêtre fixe 1040 × 700", taille.l >= 1040 && taille.h >= 700 && (taille.l > 1040 || taille.h > 700), JSON.stringify(taille));
  const m = await w.evaluate(() => ({
    actions: [...document.querySelectorAll("[data-planche-bandeau-actions] [data-action]")].map((b) => b.getAttribute("data-action")),
    fermer: document.querySelector("[data-planche-bandeau-droite] [data-planche-fermer-rattacher]")?.getAttribute("title") ?? null,
    rattacher: [...document.querySelectorAll("[data-planche-bandeau] button")].some((b) => /Rattacher/.test(b.textContent ?? "")),
    flottantes: document.querySelectorAll(".barre-actions").length,
  }));
  check("fenêtre détachée : barre d'actions au centre du bandeau, plus de barre flottante", m.actions.join(",") === "annuler,retablir,cadrer,zoom" && m.flottantes === 0, JSON.stringify(m));
  check("fenêtre détachée : plus de « Rattacher » ; ✕ « Fermer et rattacher » à droite", m.fermer === "Fermer et rattacher" && !m.rattacher, JSON.stringify(m));
  await w.screenshot({ path: join(OUT, "sandbox-fenetre-detachee.png") });
  // Fenêtre détachée rétrécie au format téléphone : la barre flottante y revient (commandes jamais perdues).
  await w.setViewportSize({ width: 700, height: 700 });
  await w.locator(".barre-actions [data-planche-cadrer]").waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  check("fenêtre détachée étroite : la barre flottante reprend les commandes", (await w.locator(".barre-actions [data-planche-cadrer]").isVisible()) && (await w.locator(".barre-actions [data-planche-detacher]").isVisible()));
  await w.setViewportSize({ width: taille.l, height: taille.h });
  await w.locator("[data-planche-fermer-rattacher]").waitFor({ state: "visible", timeout: 5000 });
  await w.locator("[data-planche-fermer-rattacher]").click();
  await racine.locator("[data-planche-bandeau-droite] [data-planche-detacher]").waitFor({ state: "visible", timeout: 10000 });
  check("fenêtre détachée : ✕ ferme la fenêtre et rattache la Planche", w.isClosed() && (await racine.locator("[data-planche-detache-carte]").count()) === 0);
}

/** La Planche de Sandbox est chargée : vue 3D (canvas) et barre d'outils garnie, visibles. */
async function plancheChargee(page, contexte) {
  const racine = page.locator("[data-sandbox-page] [data-sandbox-planche]");
  await racine.waitFor({ state: "visible" });
  const vue = racine.locator("[data-planche-vue] canvas").first();
  await vue.waitFor({ state: "visible" });
  check(`${contexte} : vue 3D affichée`, await vue.isVisible());
  const barre = racine.locator('.planche-outils[role="toolbar"]').first();
  await barre.waitFor({ state: "visible" });
  const outils = await barre.locator("button").count();
  check(`${contexte} : barre d'outils visible et garnie`, outils >= 6, `${outils} boutons`);
  // Lot 3 : chaque bouton de la barre montre un pictogramme SVG (Tabler ou sur mesure), jamais un caractère.
  const pictos = await barre.locator("button svg.sandbox-picto").count();
  check(`${contexte} : un pictogramme SVG par bouton de la barre`, pictos === outils, `${pictos} / ${outils}`);
}

try {
  // 1. Ordinateur : /sandbox directement.
  const { context, page } = await nouvellePage({ width: 1440, height: 900 });
  await inscrire(page);
  surSandbox = true;
  await page.goto(`${BASE}/sandbox`);
  check("/sandbox : l'adresse reste /sandbox", new URL(page.url()).pathname === "/sandbox", page.url());
  await plancheChargee(page, "/sandbox");
  const fil = page.locator('[data-sandbox-page] nav[aria-label="Fil d’Ariane Studio"]');
  check("/sandbox : fil d'Ariane « Studio / Console / Sandbox »", (await fil.innerText()).replace(/\s+/g, " ").trim() === "Studio / Console / Sandbox", await fil.innerText());
  check("/sandbox : « Console » marquée dans la barre latérale", (await page.locator("[data-studio-menu-console]").getAttribute("aria-current")) === "page");
  check("/sandbox : hors de l'enveloppe du Studio", (await page.locator(".studio-shell").count()) === 0);
  await disposition(page, "ordinateur");
  await raccourcisHarmonises(page);
  await page.screenshot({ path: join(OUT, "sandbox-ordinateur.png") });
  await fenetreDetachee(page, context);
  surSandbox = false;

  // 2. Ancienne adresse : redirection vers /sandbox, sans entrée d'historique supplémentaire.
  await page.goto(`${BASE}/accueil`);
  await page.goto(`${BASE}/studio/console/sandbox`);
  await page.waitForURL(`${BASE}/sandbox`);
  check("/studio/console/sandbox redirige vers /sandbox", new URL(page.url()).pathname === "/sandbox", page.url());
  await plancheChargee(page, "ancienne adresse");
  await page.goBack();
  await page.waitForURL(/\/accueil$/);
  check("la redirection remplace l'ancienne adresse dans l'historique", new URL(page.url()).pathname === "/accueil", page.url());

  // 3. Carte « 00 Sandbox » de la Console : un simple lien vers /sandbox.
  await page.goto(`${BASE}/studio/console`);
  const carte = page.locator('[data-studio-console-carte="sandbox"]');
  check("carte « 00 Sandbox » : lien vers /sandbox", (await carte.getAttribute("href")) === "/sandbox", await carte.getAttribute("href"));
  surSandbox = true;
  await carte.click();
  await page.waitForURL(`${BASE}/sandbox`);
  await plancheChargee(page, "depuis la carte 00");
  surSandbox = false;
  await context.close();

  // 4. Échec du chargement de la Planche : limite d'erreur du Sandbox, navigation de Fadi gardée, « Réessayer » recharge.
  {
    // Service worker bloqué (comme studio-chargement) : un morceau servi par lui échapperait à `route` et l'échec ne serait
    // jamais simulé ; l'inscription par lien (deux pages) lui laisse le temps de prendre la main.
    const { context: c2, page: p2 } = await nouvellePage({ width: 1440, height: 900 }, { serviceWorkers: "block" });
    await inscrire(p2);
    const morceau = /\/assets\/SandboxPlanche-[^/]+\.js$/;
    await p2.route(morceau, (r) => r.abort());
    const avant = erreurs.length;
    await p2.goto(`${BASE}/sandbox`);
    const alerte = p2.locator("[data-sandbox-erreur]");
    await alerte.waitFor({ state: "visible" });
    check("échec du chargement : message d'erreur du Sandbox", (await alerte.getAttribute("role")) === "alert");
    check("échec du chargement : barre latérale et fil d'Ariane toujours là", (await p2.locator("[data-studio-menu-console]").isVisible()) && (await p2.locator("[data-sandbox-page] nav").isVisible()));
    await p2.unroute(morceau);
    await p2.locator("[data-sandbox-reessayer]").click();
    await plancheChargee(p2, "après « Réessayer »");
    // Les erreurs levées par l'échec simulé ne comptent pas comme des erreurs de la page.
    erreurs.splice(avant);
    await c2.close();
  }

  // 5. Personnalisation (lot 5) : préférences d'outils sur le serveur, par compte ; copie locale si le serveur manque.
  {
    const { context: c3, page: p3 } = await nouvellePage({ width: 1440, height: 900 });
    p3.on("dialog", (d) => void d.accept());
    await inscrire(p3);
    const api = async (method, data) => {
      const r = await p3.request[method](`${BASE}/sandbox/preferences`, data === undefined ? undefined : { data });
      return { statut: r.status(), corps: await r.json() };
    };
    const lu = await api("get");
    check("préférences : sans enregistrement, profil Standard et rien de choisi", lu.statut === 200 && lu.corps.profil === "standard" && lu.corps.updatedAt === null, JSON.stringify(lu.corps));
    const inconnue = await api("put", { profil: "standard", barrePersonnelle: ["fantome"], favoris: [], regroupements: [] });
    check("préférences : entrée absente du registre refusée et nommée (400 unknown_entry)", inconnue.statut === 400 && inconnue.corps.error === "unknown_entry" && inconnue.corps.inconnues?.[0] === "outil:fantome", JSON.stringify(inconnue.corps));
    const anonyme = await (await browser.newContext()).request.get(`${BASE}/sandbox/preferences`);
    check("préférences : réservées au compte connecté (401 sans session)", anonyme.status() === 401, String(anonyme.status()));

    await p3.goto(`${BASE}/sandbox`);
    await plancheChargee(p3, "personnalisation");
    const racine = p3.locator("[data-sandbox-page] [data-sandbox-planche]");
    const ordreBarre = () => racine.locator('.planche-outils[role="toolbar"] [data-planche-outil]').evaluateAll((l) => l.map((b) => b.getAttribute("data-planche-outil")));
    await racine.locator("[data-planche-plus]").click();
    await racine.locator("[data-planche-grille-modifier]").click();
    const panneau = racine.locator('[data-planche-panneau="personnaliser"]');
    await panneau.waitFor({ state: "visible" });
    check("« Modifier » de la grille ouvre « Personnaliser les outils »", await panneau.isVisible());
    // Profil métier : la barre gauche change tout de suite et l'enregistrement part sur le compte.
    await panneau.locator('[data-personnaliser-profil="metier:bois"]').check();
    await p3.waitForTimeout(300);
    check("profil Métier « Bois » : barre gauche du profil", (await ordreBarre()).includes("onglet") && !(await ordreBarre()).includes("arc"), (await ordreBarre()).join(", "));
    await panneau.locator('[data-personnaliser-favori="outil:secteur"]').check();
    await panneau.locator("[data-personnaliser-nouveau-nom]").fill("Mes outils");
    await panneau.locator("[data-personnaliser-creer]").click();
    await panneau.locator('[data-personnaliser-groupe="outil:cercle"]').check();
    await panneau.locator('[data-personnaliser-etat="serveur"]').waitFor();
    const enregistre = await api("get");
    check("préférences enregistrées sur le compte (profil, favori, regroupement)", enregistre.corps.profil === "metier:bois" && enregistre.corps.favoris.includes("outil:secteur") && enregistre.corps.regroupements[0]?.nom === "Mes outils" && enregistre.corps.regroupements[0]?.entrees.includes("outil:cercle"), JSON.stringify(enregistre.corps));
    // Rechargement : relues du compte ; la grille montre les favoris et le regroupement.
    await p3.reload();
    await plancheChargee(p3, "personnalisation rechargée");
    check("rechargement : la barre du profil revient", (await ordreBarre()).includes("onglet"));
    await racine.locator("[data-planche-plus]").click();
    check("grille : section Favoris avec l'outil choisi", (await racine.locator('[data-planche-grille-section="favoris"] [data-planche-outil="secteur"]').count()) === 1);
    check("grille : section du regroupement nommé", (await racine.locator('[data-planche-grille-section="groupe-mes-outils"] [data-planche-outil="cercle"]').count()) === 1);
    // Serveur injoignable : la copie locale (dernière version reçue) s'applique.
    await p3.route("**/sandbox/preferences", (r) => r.abort());
    await p3.reload();
    await plancheChargee(p3, "serveur injoignable");
    check("serveur injoignable : la copie locale garde le profil", (await ordreBarre()).includes("onglet"));
    await p3.unroute("**/sandbox/preferences");
    // Réinitialiser : retour au profil Standard, sans favori ni regroupement.
    await racine.locator("[data-planche-plus]").click();
    await racine.locator("[data-planche-grille-modifier]").click();
    await panneau.locator("[data-personnaliser-reinitialiser]").click();
    await panneau.locator('[data-personnaliser-etat="serveur"]').waitFor();
    const remis = await api("get");
    check("« Réinitialiser » : profil Standard, rien de choisi, barre par défaut", remis.corps.profil === "standard" && remis.corps.favoris.length === 0 && remis.corps.regroupements.length === 0 && (await ordreBarre())[3] === "arc", JSON.stringify(remis.corps));
    // Navigateur partagé : un changement en attente laissé par un autre compte n'est jamais envoyé à celui-ci.
    check("préférences : la réponse nomme le compte connecté", typeof remis.corps.compte === "string" && remis.corps.compte.length > 0);
    await p3.evaluate(() => localStorage.setItem("fadi.sandbox.preferences", JSON.stringify({ preferences: { profil: "metier:volumes", barrePersonnelle: [], favoris: [], regroupements: [] }, enAttente: true, recue: true, compte: "autre-compte" })));
    await p3.reload();
    await plancheChargee(p3, "copie d'un autre compte");
    await racine.locator('[data-planche-outil="arc"]').first().waitFor();
    await p3.waitForTimeout(500);
    const apres = await api("get");
    check("copie en attente d'un autre compte : remplacée par la version du compte, rien envoyé", apres.corps.profil === "standard" && apres.corps.updatedAt === remis.corps.updatedAt && (await ordreBarre())[3] === "arc", JSON.stringify(apres.corps));
    // Extensions (25 novembre 2026) : fenêtre du menu, un interrupteur par extension, choix enregistré sur le compte.
    {
      const nbGrille = async (outil) => {
        await racine.locator("[data-planche-plus]").click();
        const n = await racine.locator(`[data-planche-grille] [data-planche-outil="${outil}"]`).count();
        await p3.keyboard.press("Escape");
        return n;
      };
      check("extensions : d'origine, les outils de « Volumes et solides » sont dans la grille", (await nbGrille("union")) >= 1);
      await racine.locator("[data-planche-menu-ouvrir]").click();
      await racine.locator('[data-planche-menu-item="extensions"]').click();
      const fenetre = racine.locator("[data-planche-extensions]");
      await fenetre.waitFor({ state: "visible" });
      const lignes = await fenetre.locator("[data-planche-extension]").evaluateAll((l) => l.map((e) => `${e.getAttribute("data-planche-extension")}:${e.getAttribute("data-planche-extension-active")}`));
      check("extensions : la fenêtre liste les regroupements actifs d'origine et « Contrôle et nettoyage » à activer", JSON.stringify(lignes) === JSON.stringify(["bois:true", "volumes:true", "controle:false", "dynamiques:false", "emplacement:false", "scripts:false"]), lignes.join(", "));
      await p3.screenshot({ path: join(OUT, "sandbox-extensions-fenetre.png") });
      await fenetre.locator('[data-planche-extension-interrupteur="volumes"]').click();
      await fenetre.locator('[data-planche-extensions-etat="compte"]').waitFor();
      await p3.waitForTimeout(400);
      const coupe = await api("get");
      check("extensions : le choix est enregistré sur le compte (écart seul)", JSON.stringify(coupe.corps.extensions) === JSON.stringify({ volumes: false }), JSON.stringify(coupe.corps.extensions));
      await p3.keyboard.press("Escape");
      await p3.keyboard.press("Escape");
      check("extensions : désactivée, ses outils quittent la grille ; les autres restent", (await nbGrille("union")) === 0 && (await nbGrille("onglet")) >= 1);
      await p3.reload();
      await plancheChargee(p3, "extensions rechargées");
      check("extensions : le choix revient au rechargement", (await nbGrille("union")) === 0);
      const inconnueX = await api("put", { profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [], extensions: { fantome: true } });
      check("extensions : identifiant inconnu refusé (400 unknown_extension)", inconnueX.statut === 400 && inconnueX.corps.error === "unknown_extension", JSON.stringify(inconnueX.corps));
      await racine.locator("[data-planche-menu-ouvrir]").click();
      await racine.locator('[data-planche-menu-item="extensions"]').click();
      await fenetre.locator('[data-planche-extension-interrupteur="volumes"]').click();
      await p3.waitForTimeout(600);
      await p3.keyboard.press("Escape");
      await p3.keyboard.press("Escape");
      check("extensions : réactivée, ses outils reviennent sans rechargement", (await nbGrille("union")) >= 1);
      // Extension « Contrôle et nettoyage » : à activer ; son panneau rejoint la colonne, le relevé compte, Nettoyer retire.
      const iconeControle = racine.locator('[data-planche-panneau-icone="controle"]');
      check("contrôle : extension inactive d'origine, pas de panneau dans la colonne", (await iconeControle.count()) === 0);
      await racine.locator("[data-planche-menu-ouvrir]").click();
      await racine.locator('[data-planche-menu-item="extensions"]').click();
      await fenetre.locator('[data-planche-extension-interrupteur="controle"]').click();
      await p3.waitForTimeout(600);
      await p3.keyboard.press("Escape");
      await p3.keyboard.press("Escape");
      check("contrôle : activée, son panneau est dans la colonne", (await iconeControle.count()) === 1);
      await racine.locator('[data-planche-outil="ligne"]').first().click();
      await p3.mouse.click(900, 600);
      await p3.mouse.move(1000, 640, { steps: 5 });
      await p3.mouse.click(1000, 640);
      await p3.keyboard.press("Escape");
      await racine.locator('[data-planche-outil="selection"]').first().click();
      await iconeControle.click();
      const releve = racine.locator("[data-planche-controle]");
      await releve.waitFor({ state: "visible" });
      const isolees = () => releve.locator('[data-planche-controle-nombre="aretesIsolees"]').innerText();
      check("contrôle : le trait dessiné est relevé comme arête isolée, rien n'est retiré", (await isolees()) === "1", await isolees());
      check("contrôle : Nettoyer grisé tant que rien de coché n'est à retirer", await releve.locator('[data-planche-commande="nettoyer"]').isDisabled());
      await releve.locator('[data-planche-controle-choix="aretesIsolees"]').check();
      await p3.screenshot({ path: join(OUT, "sandbox-controle-releve.png") });
      await releve.locator('[data-planche-commande="nettoyer"]').click();
      await p3.waitForTimeout(400);
      check("contrôle : Nettoyer retire l'arête cochée et le dit", (await isolees()) === "0" && (await releve.locator("[data-planche-controle-note]").count()) === 1, await isolees());
      // Annuler du bandeau (26 novembre 2026) : actif après une opération, l'infobulle la nomme ; Rétablir la refait.
      const boutonAnnuler = racine.locator("[data-planche-bandeau-actions] [data-planche-annuler]");
      const boutonRetablir = racine.locator("[data-planche-bandeau-actions] [data-planche-retablir]");
      check("bandeau : Annuler actif après Nettoyer, l'infobulle nomme l'opération (Ctrl Z)", !(await boutonAnnuler.isDisabled()) && /^Annuler .+\(Ctrl Z\)$/.test((await boutonAnnuler.getAttribute("title")) ?? ""), (await boutonAnnuler.getAttribute("title")) ?? "");
      await boutonAnnuler.click();
      await p3.waitForTimeout(400);
      check("contrôle : un seul Annuler (bouton du bandeau) rétablit ce qui a été retiré", (await isolees()) === "1", await isolees());
      check("bandeau : Rétablir actif après Annuler", !(await boutonRetablir.isDisabled()) && /\(Ctrl Y\)$/.test((await boutonRetablir.getAttribute("title")) ?? ""), (await boutonRetablir.getAttribute("title")) ?? "");
      await boutonRetablir.click();
      await p3.waitForTimeout(400);
      check("bandeau : Rétablir refait Nettoyer", (await isolees()) === "0", await isolees());
      await boutonAnnuler.click();
      await p3.waitForTimeout(400);
      // Extension « Composants dynamiques » : une étagère paramétrée (jeu d'essai) ; ses options redessinent ses tablettes.
      await racine.locator("[data-planche-menu-ouvrir]").click();
      await racine.locator('[data-planche-menu-item="extensions"]').click();
      await fenetre.locator('[data-planche-extension-interrupteur="dynamiques"]').click();
      await p3.waitForTimeout(600);
      const etagere = readFileSync(new URL("./donnees/sandbox-etagere-dynamique.json", import.meta.url), "utf8").trim();
      await p3.evaluate((valeur) => new Promise((ok, ko) => {
        const r = indexedDB.open("fadi-local");
        r.onerror = () => ko(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction("keyValue", "readwrite");
          tx.objectStore("keyValue").put({ key: "sandbox-planche-brouillon", value: valeur, updatedAt: new Date().toISOString() });
          tx.oncomplete = () => { r.result.close(); ok(null); };
          tx.onerror = () => ko(tx.error);
        };
      }), etagere);
      await p3.reload();
      await plancheChargee(p3, "étagère dynamique");
      await racine.locator('[data-planche-panneau-icone="dynamique"]').click();
      const dynamique = racine.locator('[data-planche-panneau="dynamique"]');
      check("dynamique : sans sélection, le panneau demande de choisir un composant", (await dynamique.locator("[data-planche-dynamique-aucun]").count()) === 1);
      await racine.locator('[data-planche-outil="selection"]').first().click();
      await p3.keyboard.press("Control+a");
      await dynamique.locator('[data-planche-dynamique="dynamique"]').waitFor();
      const lire = (nom) => dynamique.locator(`[data-planche-dynamique-option="${nom}"]`).inputValue();
      check("dynamique : le composant sélectionné montre ses options (largeur, tablettes, essence)", (await lire("Largeur")) === "1" && (await lire("Tablettes")) === "3" && (await lire("Essence")) === "Chêne");
      const brouillonLu = () => p3.evaluate(() => new Promise((ok) => {
        const r = indexedDB.open("fadi-local");
        r.onsuccess = () => {
          const q = r.result.transaction("keyValue").objectStore("keyValue").get("sandbox-planche-brouillon");
          q.onsuccess = () => { r.result.close(); ok(JSON.parse(q.result.value).modele); };
        };
      }));
      const tablettes = async () => {
        const m = await brouillonLu();
        const d = Object.values(m.definitions).find((x) => x.dynamique);
        const occ = Object.values(d.contenu.occurrences);
        return { n: occ.length, largeur: Number(Math.hypot(occ[0].transformation[0], occ[0].transformation[4], occ[0].transformation[8]).toFixed(3)), matiere: occ.map((o) => o.materiau).join(",") };
      };
      const champ = dynamique.locator('[data-planche-dynamique-option="Tablettes"]');
      await champ.fill("5");
      await champ.blur();
      const large = dynamique.locator('[data-planche-dynamique-option="Largeur"]');
      await large.fill("1,6");
      await large.blur();
      await dynamique.locator('[data-planche-dynamique-option="Essence"]').selectOption("Hêtre");
      await p3.waitForTimeout(1500);
      const apresOptions = await tablettes();
      check("dynamique : les options redessinent le composant (5 tablettes, largeur × 1,6, matière Hêtre)", apresOptions.n === 5 && apresOptions.largeur === 1.6 && apresOptions.matiere === "m2,m2,m2,m2,m2", JSON.stringify(apresOptions));
      await p3.screenshot({ path: join(OUT, "sandbox-dynamique-options.png") });
      await p3.keyboard.press("Control+z");
      await p3.waitForTimeout(1500);
      check("dynamique : Annuler défait la dernière option seulement", (await tablettes()).matiere === "m1,m1,m1,m1,m1" && (await tablettes()).n === 5, JSON.stringify(await tablettes()));
      // Extension « Emplacement » : position saisie et vrai nord ; les ombres les reprennent.
      await racine.locator("[data-planche-menu-ouvrir]").click();
      await racine.locator('[data-planche-menu-item="extensions"]').click();
      await fenetre.locator('[data-planche-extension-interrupteur="emplacement"]').click();
      await p3.waitForTimeout(600);
      await p3.keyboard.press("Escape");
      await p3.keyboard.press("Escape");
      await racine.locator('[data-planche-panneau-icone="emplacement"]').click();
      const lieu = racine.locator("[data-planche-lieu]");
      check("emplacement : sans position, le panneau le dit", (await lieu.getAttribute("data-planche-lieu")) === "absent" && (await lieu.locator("[data-planche-lieu-absent]").count()) === 1);
      await lieu.locator('[data-planche-lieu-champ="latitude"]').fill("95");
      await lieu.locator("[data-planche-lieu-enregistrer]").click();
      check("emplacement : une latitude hors de −90 à 90 est refusée", (await lieu.locator('[data-planche-lieu-erreur="latitude"]').count()) === 1 && (await lieu.getAttribute("data-planche-lieu")) === "absent");
      for (const [champ, valeur] of [["latitude", "46,2"], ["longitude", "6,15"], ["nord", "30"]]) await lieu.locator(`[data-planche-lieu-champ="${champ}"]`).fill(valeur);
      await lieu.locator("[data-planche-lieu-enregistrer]").click();
      await p3.waitForTimeout(400);
      check("emplacement : la position est enregistrée dans la Planche", (await lieu.getAttribute("data-planche-lieu")) === "renseigne" && (await lieu.locator("[data-planche-lieu-note]").count()) === 1);
      await lieu.locator('[data-planche-commande="afficher-nord"]').click();
      check("emplacement : la flèche du nord s'affiche sur commande", (await lieu.locator('[data-planche-commande="afficher-nord"]').getAttribute("aria-pressed")) === "true");
      await p3.screenshot({ path: join(OUT, "sandbox-emplacement.png") });
      await racine.locator('[data-planche-panneau-icone="ombres"]').click();
      check("emplacement : les ombres prennent la latitude de l'emplacement", (await racine.locator("[data-planche-ombres-emplacement]").count()) === 1 && (await racine.locator("[data-planche-ombres]").innerText()).includes("46,2"));
      await p3.keyboard.press("Control+z");
      await p3.waitForTimeout(600);
      await racine.locator('[data-planche-panneau-icone="emplacement"]').click();
      check("emplacement : Annuler retire la position", (await racine.locator("[data-planche-lieu]").getAttribute("data-planche-lieu")) === "absent");
      // Extension « Scripts » : un script personnel dessine sur une copie isolée ; un seul Annuler ; « Mes scripts » suit le compte.
      await racine.locator("[data-planche-menu-ouvrir]").click();
      await racine.locator('[data-planche-menu-item="extensions"]').click();
      await fenetre.locator('[data-planche-extension-interrupteur="scripts"]').click();
      await p3.waitForTimeout(600);
      await p3.keyboard.press("Escape");
      await p3.keyboard.press("Escape");
      await racine.locator('[data-planche-panneau-icone="scripts"]').click();
      const scripts = racine.locator("[data-planche-scripts]");
      const editeur = scripts.locator("[data-planche-scripts-code]");
      const issue = scripts.locator("[data-planche-scripts-issue]");
      /** Lance le script affiché et attend sa fin ; rend l'état de l'issue. */
      const lancer = async (code) => {
        if (code !== undefined) await editeur.fill(code);
        await scripts.locator('[data-planche-commande="executer-script"]').click();
        await racine.locator('[data-planche-scripts="pret"] [data-planche-scripts-issue]:not([data-planche-scripts-issue="encours"])').waitFor({ timeout: 20_000 });
        return issue.getAttribute("data-planche-scripts-issue");
      };
      const journal = async () => ((await scripts.locator("[data-planche-scripts-journal]").count()) ? scripts.locator("[data-planche-scripts-journal]").innerText() : "");
      const objets = async () => {
        await lancer("planche.afficher(planche.objets().length);");
        return Number(await journal());
      };
      check("scripts : le panneau s'ouvre sur l'exemple « Rangée de poteaux »", (await editeur.inputValue()).includes("planche.boite(") && (await scripts.locator("[data-planche-scripts-choix]").inputValue()) === "exemple:rangee-poteaux");
      const avantScript = await objets();
      await scripts.locator("[data-planche-scripts-choix]").selectOption("exemple:rangee-poteaux");
      check("scripts : l'exemple s'exécute et modifie le dessin", (await lancer()) === "modifie" && (await journal()).includes("6 poteaux"), await journal());
      await p3.screenshot({ path: join(OUT, "sandbox-scripts.png") });
      check("scripts : six poteaux sont ajoutés", (await objets()) === avantScript + 6);
      await p3.keyboard.press("Control+z");
      await p3.waitForTimeout(600);
      check("scripts : un seul Annuler défait tout le script", (await objets()) === avantScript, String(await objets()));
      check("scripts : une erreur donne sa ligne et laisse le dessin intact", (await lancer("planche.boite([0, 0, 0], 1, 1, 1);\n\nplanche.boite([0, 0, 0], -1, 1, 1);")) === "erreur" && (await scripts.locator("[data-planche-scripts-erreur]").getAttribute("data-planche-scripts-ligne")) === "3" && (await scripts.locator("[data-planche-scripts-erreur]").getAttribute("data-planche-scripts-erreur")) === "positif");
      check("scripts : après l'erreur, rien n'a été dessiné", (await objets()) === avantScript && (await lancer("planche.afficher(planche.faces().length);")) === "inchange");
      // Sans réseau : ni connexion, ni code chargé d'ailleurs, ni exécution différée.
      for (const [quoi, code] of [
        ["fetch", "fetch('/sandbox/preferences');"],
        ["XMLHttpRequest", "new XMLHttpRequest();"],
        ["WebSocket", "new WebSocket('wss://exemple.invalid');"],
        ["importScripts", "importScripts('/sw.js');"],
        ["Function", "Function('return 1')();"],
        ["fonction asynchrone", "(async () => {}).constructor('return 1')();"],
        ["setTimeout", "setTimeout(() => {}, 0);"],
      ]) {
        check(`scripts : « ${quoi} » est refusé au script`, (await lancer(code)) === "erreur" && (await scripts.locator("[data-planche-scripts-erreur]").getAttribute("data-planche-scripts-erreur")) === "execution", await scripts.locator("[data-planche-scripts-issue]").innerText());
      }
      check("scripts : « import » est refusé à la lecture", (await lancer("const m = import('/sw.js');")) === "erreur" && (await scripts.locator("[data-planche-scripts-erreur]").getAttribute("data-planche-scripts-erreur")) === "import");
      {
        const actif = await p3.evaluate(async () => (await fetch(performance.getEntriesByType("resource").map((e) => e.name).find((n) => /scripts-planche\.worker-/.test(n)) ?? "/absent")).headers.get("content-security-policy"));
        check("scripts : le fichier du Worker est servi avec sa politique de contenu (aucune connexion)", typeof actif === "string" && actif.includes("connect-src 'none'") && actif.includes("default-src 'none'"), String(actif));
      }
      const debutBoucle = Date.now();
      check("scripts : une boucle sans fin est arrêtée d'office, la page reste utilisable", (await lancer("for (;;) {}")) === "delai" && Date.now() - debutBoucle < 15_000 && (await objets()) === avantScript);
      // « Mes scripts » : enregistré avec le compte, retrouvé après rechargement, supprimé sur demande.
      await scripts.locator("[data-planche-scripts-choix]").selectOption("nouveau");
      await editeur.fill("planche.afficher('bonjour');");
      await scripts.locator("[data-planche-scripts-enregistrer]").click();
      check("scripts : sans nom, l'enregistrement est refusé", (await scripts.locator('[data-planche-scripts-refus="nom"]').count()) === 1);
      await scripts.locator("[data-planche-scripts-nom]").fill("Mon essai");
      await scripts.locator("[data-planche-scripts-enregistrer]").click();
      await scripts.locator('[data-planche-scripts-etat="compte"]').waitFor();
      await p3.waitForTimeout(800);
      const enregistres = (await api("get")).corps.scripts;
      check("scripts : le script est enregistré avec le compte", JSON.stringify(enregistres) === JSON.stringify([{ id: "mon-essai", nom: "Mon essai", code: "planche.afficher('bonjour');" }]), JSON.stringify(enregistres));
      {
        const courant = (await api("get")).corps;
        const sans = await api("put", { profil: courant.profil, barrePersonnelle: courant.barrePersonnelle, favoris: courant.favoris, regroupements: courant.regroupements, extensions: courant.extensions });
        check("scripts : un enregistrement sans le champ « scripts » (ancienne version) garde les scripts du compte", sans.statut === 200 && sans.corps.scripts?.length === 1, JSON.stringify(sans.corps.scripts));
        const refus = await api("put", { ...courant, format: undefined, compte: undefined, updatedAt: undefined, catalogue: undefined, scripts: [{ id: "Mauvais Id", nom: "x", code: "" }] });
        // Le refus doit venir des scripts eux-mêmes, pas d'un autre champ du corps (le catalogue n'est pas renvoyé au serveur).
        check("scripts : une liste de scripts invalide est refusée (400 invalid_input)", refus.statut === 400 && refus.corps.error === "invalid_input" && /script/.test(String(refus.corps.detail)), JSON.stringify(refus.corps));
      }
      await p3.reload();
      await plancheChargee(p3, "scripts enregistrés");
      await racine.locator('[data-planche-panneau-icone="scripts"]').click();
      await scripts.locator("[data-planche-scripts-choix]").selectOption("personnel:mon-essai");
      check("scripts : après rechargement, le script du compte se relit et s'exécute", (await editeur.inputValue()) === "planche.afficher('bonjour');" && (await lancer()) === "inchange" && (await journal()) === "bonjour");
      await scripts.locator("[data-planche-scripts-supprimer]").click();
      await p3.waitForTimeout(1200);
      check("scripts : supprimé, il quitte le compte", (await api("get")).corps.scripts.length === 0 && (await scripts.locator('[data-planche-scripts-choix] option[value="personnel:mon-essai"]').count()) === 0);
    }
    await c3.close();
  }

  // 6. Téléphone : la Planche se charge et sa barre d'outils reste visible.
  const tel = await nouvellePage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await inscrire(tel.page);
  surSandbox = true;
  await tel.page.goto(`${BASE}/sandbox`);
  await plancheChargee(tel.page, "téléphone");
  await disposition(tel.page, "téléphone");
  // La barre d'actions flottante ne recouvre pas la barre d'outils de gauche (position par défaut).
  const recouvrement = await tel.page.evaluate(() => {
    const a = document.querySelector(".sandbox-planche [data-barre-actions]")?.getBoundingClientRect();
    const o = document.querySelector(".sandbox-planche .planche-outils")?.getBoundingClientRect();
    if (!a || !o) return null;
    return a.left < o.right && o.left < a.right && a.top < o.bottom && o.top < a.bottom;
  });
  check("téléphone : la barre d'actions ne recouvre pas la barre d'outils", recouvrement === false, String(recouvrement));
  await tel.page.screenshot({ path: join(OUT, "sandbox-telephone.png") });
  surSandbox = false;
  await tel.context.close();

  // 7. Téléphone en « version ordinateur » (signalé le 24 novembre 2026) : mise en page large, mais écran tactile ; le
  // chevron de la colonne de droite paraît au toucher de la colonne, et un toucher sur lui la plie / déplie.
  const large = await nouvellePage({ width: 980, height: 1900 }, { hasTouch: true, isMobile: true });
  await inscrire(large.page);
  surSandbox = true;
  await large.page.goto(`${BASE}/sandbox`);
  await plancheChargee(large.page, "téléphone, version ordinateur");
  const r7 = large.page.locator("[data-sandbox-page] [data-sandbox-planche]");
  const repos7 = await r7.evaluate((r) => ({ opacite: Number(getComputedStyle(r.querySelector("[data-planche-colonne-bascule]")).opacity) }));
  check("téléphone, version ordinateur : colonne dépliée au départ", (await r7.evaluate((r) => r.querySelector("[data-planche]").classList.contains("colonne-repliee"))) === false);
  await toucherColonneEtChevron(large.page, r7, "téléphone, version ordinateur", repos7);
  // Captures : repos (chevron caché), puis chevron paru après un toucher sur la colonne (Styles ouvert).
  await large.page.screenshot({ path: join(OUT, "sandbox-telephone-large-repos.png") });
  await r7.locator("[data-planche-panneau-icone='styles']").tap();
  await large.page.waitForTimeout(300);
  await large.page.screenshot({ path: join(OUT, "sandbox-telephone-large-chevron.png") });
  await r7.locator("[data-planche-colonne-bascule]").tap();
  await large.page.waitForTimeout(300);
  await large.page.screenshot({ path: join(OUT, "sandbox-telephone-large-repliee.png") });

  surSandbox = false;
  await large.context.close();

  // 8. Planche détachée au téléphone (demande du 24 novembre 2026) : la Planche couvre l'écran du navigateur, en mise en
  // page large (bandeau, barre de gauche, colonne avec libellés, bande du bas) réduite à l'écran (balise viewport) ;
  // aucun composant ne manque, rien ne déborde.
  for (const [nom, viewport] of [["téléphone détaché", { width: 412, height: 915 }], ["téléphone détaché couché", { width: 915, height: 412 }]]) {
    const d = await nouvellePage(viewport, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await inscrire(d.page);
    surSandbox = true;
    await d.page.goto(`${BASE}/sandbox`);
    await plancheChargee(d.page, nom);
    const rd = d.page.locator("[data-sandbox-page] [data-sandbox-planche]");
    const viewportAvant = await d.page.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute("content"));
    await rd.locator("[data-planche-detacher]").first().tap();
    await d.page.waitForTimeout(1000);
    const couvre = await d.page.evaluate(() => getComputedStyle(document.querySelector("[data-planche]")).position === "fixed" && document.querySelector("[data-planche]").getAttribute("data-planche-detache") === "plein-ecran");
    check(`${nom} : la Planche couvre tout l'écran du navigateur`, couvre);
    const mesure = await d.page.evaluate(() => {
      const r = document.querySelector("[data-planche]");
      const b = r.getBoundingClientRect();
      const dedans = (sel) => [...r.querySelectorAll(sel)].every((e) => {
        const x = e.getBoundingClientRect();
        return x.width > 0 && x.left >= -1 && x.top >= -1 && x.right <= innerWidth + 1 && x.bottom <= innerHeight + 1;
      });
      return {
        vue: [innerWidth, innerHeight], planche: [Math.round(b.width), Math.round(b.height)], large: !matchMedia("(max-width: 760px)").matches,
        deborde: b.right > innerWidth + 1 || b.bottom > innerHeight + 1,
        bandeau: dedans("[data-planche-bandeau]"), outils: r.querySelectorAll('.planche-outils[role="toolbar"] [data-planche-outil]').length,
        colonne: r.querySelectorAll("[data-planche-panneau-icone]").length, libelles: !r.classList.contains("colonne-repliee"),
        pied: dedans("[data-planche-pied]"), mesures: dedans("[data-planche-pied] input"), colonneDedans: dedans(".planche-colonne"),
        // Barre de gauche et colonne entières, sans défilement : aucun outil ni panneau caché.
        entieres: [".planche-outils", ".planche-colonne"].every((sel) => { const e = r.querySelector(sel); return e && e.scrollHeight <= e.clientHeight + 1; }),
      };
    });
    check(`${nom} : la Planche remplit exactement l'écran, rien ne déborde`, Math.abs(mesure.planche[0] - mesure.vue[0]) <= 1 && Math.abs(mesure.planche[1] - mesure.vue[1]) <= 1 && !mesure.deborde, JSON.stringify(mesure));
    check(`${nom} : mise en page large — bandeau, barre de gauche, colonne avec libellés, bande du bas et Mesures`, mesure.large && mesure.bandeau && mesure.outils >= 6 && mesure.colonne === 14 && mesure.libelles && mesure.pied && mesure.mesures && mesure.colonneDedans && mesure.entieres, JSON.stringify(mesure));
    await d.page.screenshot({ path: join(OUT, `sandbox-${nom.replaceAll(" ", "-").normalize("NFD").replace(/[^\w-]/g, "")}.png`) });
    // Le chevron de la colonne se comporte comme dans la page : caché, puis paru au toucher de la colonne.
    const vuChevron = () => rd.locator("[data-planche-colonne-bascule]").evaluate((k) => getComputedStyle(k).visibility === "visible");
    const cache = !(await vuChevron());
    await rd.locator("[data-planche-panneau-icone='styles']").tap();
    await d.page.waitForTimeout(300);
    check(`${nom} : chevron caché, puis paru au toucher de la colonne`, cache && (await vuChevron()));
    await rd.locator("[data-planche-panneau-icone='styles']").tap();
    // Un outil répond toujours au doigt, et « Quitter » remet la Planche dans la page, avec la mise en page d'avant.
    await rd.locator('[data-planche-outil="rectangle"]').first().tap();
    check(`${nom} : un outil se choisit au doigt`, (await rd.locator("[data-planche]").getAttribute("data-outil-actif")) === "rectangle");
    await rd.locator("[data-planche-bandeau-droite] [data-planche-detacher]").tap();
    await d.page.waitForTimeout(800);
    const apres = await d.page.evaluate(() => ({ plein: getComputedStyle(document.querySelector("[data-planche]")).position === "fixed", viewport: document.querySelector('meta[name="viewport"]').getAttribute("content"), etroit: matchMedia("(max-width: 760px)").matches }));
    check(`${nom} : « Quitter » remet la Planche dans la page, mise en page d'avant rétablie`, !apres.plein && apres.viewport === viewportAvant && (await rd.locator("[data-planche] [data-planche-vue] canvas").count()) === 1, JSON.stringify(apres));
    surSandbox = false;
    await d.context.close();
  }

  check("aucun appel à l'API d'un projet pendant le Sandbox", appels.length === 0, appels.slice(0, 5).join(" ; "));
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 5).join(" ; "));
} catch (e) {
  console.log(`✗ recette interrompue — ${e instanceof Error ? e.message : e}`);
  echecs++;
} finally {
  await browser.close();
}

if (echecs > 0) {
  console.log(`\n${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("\nModule Sandbox : recette réussie.");
