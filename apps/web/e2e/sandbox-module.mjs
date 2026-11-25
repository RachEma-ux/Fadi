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
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

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
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `sandbox-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "sandbox-module-ci-123");
  await page.click('button[type="submit"]');
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
  check(`${contexte} : barre d'actions au centre du bandeau (Cadrer, Grouper, Composant, Éclater, Unique), plus de barre flottante`, ba.actions && ba.cadrer && ba.cadrer.t >= ba.bd.t - 1 && ba.cadrer.b <= ba.bd.b + 1 && JSON.stringify(ba.ids) === JSON.stringify(["cadrer", "groupe", "composant", "eclater", "rendre-unique"]) && ba.flottantes === 0, JSON.stringify(ba));
  check(`${contexte} : sans sélection, Cadrer seul actif ; le reste grisé avec son motif en infobulle`, ba.grises.length === 4 && ba.grises.every((g) => g.titre.includes("—")), JSON.stringify(ba.grises));
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
  check("fenêtre détachée : barre d'actions au centre du bandeau, plus de barre flottante", m.actions[0] === "cadrer" && m.actions.length === 5 && m.flottantes === 0, JSON.stringify(m));
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
    const { context: c2, page: p2 } = await nouvellePage({ width: 1440, height: 900 });
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
      check("extensions : la fenêtre liste « Bois et menuiserie » et « Volumes et solides », actives d'origine", JSON.stringify(lignes) === JSON.stringify(["bois:true", "volumes:true"]), lignes.join(", "));
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
