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
async function disposition(page, contexte) {
  const racine = page.locator("[data-sandbox-page] [data-sandbox-planche]");
  const barre = await racine.locator('.planche-outils[role="toolbar"] [data-planche-outil]').evaluateAll((l) => l.map((b) => b.getAttribute("data-planche-outil")));
  const attendue = ["selection", "gomme", "ligne", "arc", "rectangle", "pousser-tirer", "decalage", "deplacer", "faire-pivoter", "echelle", "metre", "peinture", "orbite", "panoramique", "zoom", "zoom-etendu"];
  check(`${contexte} : barre gauche — seize outils dans l'ordre de SketchUp, puis « ⋯ »`, JSON.stringify(barre) === JSON.stringify(attendue), barre.join(", "));
  check(`${contexte} : « ⋯ » en bas de la barre`, await racine.locator("[data-planche-plus]").count() === 1);
  const colonne = await racine.locator("[data-planche-panneau-icone]").evaluateAll((l) => l.map((b) => b.getAttribute("data-planche-panneau-icone")));
  check(`${contexte} : colonne — chaque panneau à un clic, Info modèle en bas`, colonne.length === 13 && colonne.at(-1) === "info-modele" && !colonne.includes("objets"), colonne.join(", "));
  check(`${contexte} : barre du haut — Fichier, Annuler, Rétablir`, (await racine.locator(".planche-haut [data-planche-menu-ouvrir]").count()) === 1 && (await racine.locator(".planche-haut [data-planche-annuler]").count()) === 1 && (await racine.locator(".planche-haut [data-planche-retablir]").count()) === 1);
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
  if (contexte === "téléphone") check("téléphone : chevron visible sans survol", repos.opacite === 1);
  else {
    check("ordinateur : chevron caché au repos", repos.opacite === 0);
    await racine.locator("[data-planche-panneau-icone='styles']").hover();
    await page.waitForTimeout(300);
    check("ordinateur : chevron visible au survol de la colonne", (await chevron()).opacite === 1);
    await page.mouse.move(400, 400);
  }
  if (contexte === "téléphone") {
    const haut = await racine.locator(".planche-haut").evaluate((h) => {
      const b = h.getBoundingClientRect();
      const o = h.querySelector("[data-planche-outils-bouton]")?.getBoundingClientRect();
      return o ? o.right <= b.right && o.left >= b.left : false;
    });
    check("téléphone : « Outils ▾ » visible sans défiler la barre du haut", haut === true);
    check("téléphone : boutons zoom + / − visibles", (await racine.locator('[data-barre-actions] [data-planche-zoom="plus"]').isVisible()) && (await racine.locator('[data-barre-actions] [data-planche-zoom="moins"]').isVisible()));
    // Commandes du registre : leur raccourci est affiché dans l'info-bulle (Alt+Maj+X, Alt+Maj+Y).
    const titres = await racine.locator("[data-barre-actions] [data-planche-zoom]").evaluateAll((l) => l.map((b) => b.getAttribute("title") ?? ""));
    check("téléphone : zoom + / − portent leur raccourci", titres.length === 2 && titres.every((x) => /Alt/.test(x) && /Maj|Shift/.test(x)), JSON.stringify(titres));
  }
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
