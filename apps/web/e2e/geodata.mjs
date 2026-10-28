#!/usr/bin/env node
/**
 * Recette de GeoData (9ᵉ module, ADR-GEODATA-01/02) dans un vrai navigateur, contre l'API construite qui sert l'application.
 *
 * Amorçage (base jetable de la recette, `DATABASE_URL`) : un compte « gestionnaire » reçoit les rôles GeoData par la ligne
 * de commande, puis le jeu SYNTHÉTIQUE de test (`apps/api/test-corpus/geodata/`) est préparé et publié par la chaîne
 * administrative réelle (`geodata:import-reference`). Aucune donnée réelle n'est inventée.
 *
 * Critères couverts : GEO 01 (compte sans projet), 02 (accès direct, entrée du menu, aucun sélecteur de projet), 05
 * (carte enregistrée relue après reconnexion), 06 (valeur absente distincte de zéro : légende, fiche, table), 07 (GeoJSON
 * projeté refusé à l'import, import valide → couche privée), 08 (un tiers ne voit ni la carte ni la couche), 09 (export
 * autorisé : PNG + fiche de sources avec attribution), 10 (analyse figée), 11 (sans WebGL : message, recherche et table
 * utilisables), 12 (téléphone : un seul panneau ; clavier ; axe-core sans violation critique ou sérieuse), 13 (deux
 * onglets : second enregistrement refusé, copie de « ma version »), interface anglaise sans résidu français.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=… OUT=atelier-captures/geodata node apps/web/e2e/geodata.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/geodata";
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const MDP = "geodata-recette-123";
const suffixe = Date.now().toString(36);
const AVEC_WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const lancer = (args) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args });

async function inscrire(page, email) {
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)/);
}
async function connecter(page, email) {
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', MDP);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)/);
}
/** Les espaces de travail sont des entrées du menu hamburger (en haut à droite). */
async function volet(p, v) {
  if (await p.locator(`[data-gd-volet-ouvert='${v}']`).count()) return;
  if (!(await p.locator(`[data-gd-volet='${v}']`).isVisible())) await p.locator("[data-gd-menu]").click();
  await p.locator(`[data-gd-volet='${v}']`).click();
}
/** Onglet du panneau Données (rouvert par le bouton « Données » s'il est fermé). */
async function onglet(p, o) { if (!(await p.locator("[data-gd-panneau]").count())) await p.locator("[data-gd-donnees]").click(); await p.locator(`[data-gd-onglet='${o}']`).click(); }
const npmApi = (script, args) => execFileSync("npm", ["run", "-s", script, "--workspace=@fadi/api", "--", ...args], { cwd: RACINE, env: process.env, encoding: "utf8" });

const navigateur = await lancer(AVEC_WEBGL);
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await contexte.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
const appelsProjet = [];
page.on("request", (r) => { if (/\/projects\//.test(new URL(r.url()).pathname) && new URL(r.url()).pathname.startsWith("/projects/")) appelsProjet.push(r.url()); });

// --- Amorçage : gestionnaire et jeu synthétique publié par la chaîne administrative ---
const gestionnaire = `gd-gestion-${suffixe}@example.test`;
await inscrire(page, gestionnaire);
for (const role of ["gestionnaire-donnees", "responsable-publication"]) npmApi("geodata:role", ["--email", gestionnaire, "--role", role]);
const sortieImport = npmApi("geodata:import-reference", ["--fiche", "apps/api/test-corpus/geodata/synthetique-unites.fiche.json", "--fichier", "apps/api/test-corpus/geodata/synthetique-unites.geojson", "--preparateur", gestionnaire, "--publier-par", gestionnaire].map((a) => (a.startsWith("apps/") ? join(RACINE, a) : a)));
check("chaîne administrative : jeu synthétique préparé puis publié (ou déjà présent, même empreinte)", /Version (\S+ )?publiée|Version déjà présente/.test(sortieImport), sortieImport.split("\n").filter((l) => /Version/.test(l)).join(" | "));
// Découpage synthétique en données (D-GD-35) : niveaux et liens parent → enfant importés en base par la commande d'import
// unique ; relancée, elle ne fait rien (aucun doublon).
const sortieDecoupage = npmApi("geodata:import-decoupage", ["--dossier", join(RACINE, "apps/api/test-corpus/geodata")]);
check("découpage : import unique des niveaux et des entités synthétiques (ou déjà importé)", /Découpage ZZ (importé|déjà importé)/.test(sortieDecoupage), sortieDecoupage.split("\n").filter((l) => /Découpage/.test(l)).join(" | "));
check("découpage : relancé sur le même fichier, rien n'est fait", /Découpage ZZ déjà importé/.test(npmApi("geodata:import-decoupage", ["--dossier", join(RACINE, "apps/api/test-corpus/geodata")])));
// Navigation par niveaux (lot B) : deux régions et trois provinces synthétiques, parenté lue dans le découpage en base.
for (const n of ["regions", "provinces"]) {
  const sortie = npmApi("geodata:import-reference", ["--fiche", join(RACINE, `apps/api/test-corpus/geodata/synthetique-${n}.fiche.json`), "--fichier", join(RACINE, `apps/api/test-corpus/geodata/synthetique-${n}.geojson`), "--preparateur", gestionnaire, "--publier-par", gestionnaire]);
  check(`chaîne administrative : ${n === "regions" ? "régions" : "provinces"} synthétiques publiées`, /Version (\S+ )?publiée|Version déjà présente/.test(sortie));
}
const sortieRaster = npmApi("geodata:import-reference", ["--fiche", join(RACINE, "apps/api/test-corpus/geodata/synthetique-raster.fiche.json"), "--preparateur", gestionnaire, "--publier-par", gestionnaire]);
check("chaîne administrative : grille raster synthétique (GeoTIFF) préparée puis publiée", /Version (\S+ )?publiée|Version déjà présente/.test(sortieRaster), sortieRaster.split("\n").filter((l) => /Version|raster/.test(l)).join(" | "));
await page.context().clearCookies();

// --- GEO 01 / 02 : compte sans projet, accès direct ---
const alice = `gd-alice-${suffixe}@example.test`;
await inscrire(page, alice);
const projets = await (await page.request.get(`${BASE}/projects`)).json();
check("GEO 01 · le compte n'a aucun projet", Array.isArray(projets) && projets.length === 0);
const entree = page.locator("[data-nav-geodata]");
check("GEO 02 · entrée GeoData dans la navigation générale", (await entree.count()) === 1);
await entree.click();
await page.waitForURL(/\/geodata$/);
await page.locator("[data-geodata-page]").waitFor();
check("GEO 02 · /geodata ouvre directement la carte (aucun tableau de bord intermédiaire)", (await page.locator("[data-gd-moteur]").count()) === 1);
check("GEO 02 · aucun sélecteur ni navigation de projet dans l'espace GeoData", (await page.locator("[data-geodata-page] select, [data-geodata-page] a").evaluateAll((els) => els.filter((e) => /projet/i.test(e.textContent ?? "")).length)) === 0);
check("GEO 02 · titre du bandeau général : GeoData", ((await page.locator(".fadi-topbar-title h1").textContent()) ?? "").trim() === "GeoData");
await page.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
check("carte : moteur chargé (canevas MapLibre)", (await page.locator(".maplibregl-canvas").count()) === 1);

// --- Disposition (D-GD-14) : barre d'outils verticale à gauche, bouton « Données », menu hamburger ---
const barreOutils = page.locator("[data-gd-barre-outils]");
const outils = await barreOutils.locator("[data-gd-barre-outil]").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
check("carte : barre d'outils verticale (zoom, nord, position, plein écran, mesures, zone, annotation, libellés, mini-carte, légende, impression), chaque bouton nommé", outils.length === 13 && outils.every(Boolean), outils.join(" | "));
const boiteBarre = await barreOutils.boundingBox();
const boiteCarte = await page.locator("main.gd-carte").boundingBox();
check("carte : barre d'outils flottante, verticale, à droite par défaut", !!boiteBarre && !!boiteCarte && boiteCarte.x + boiteCarte.width - (boiteBarre.x + boiteBarre.width) < 30 && boiteBarre.height > boiteBarre.width * 3);
// Déplacement par la poignée (glisser), borné à la carte, mémorisé ; flèches du clavier ; double-clic : retour à droite.
const poignee = await page.locator("[data-gd-poignee]").boundingBox();
const px = poignee.x + poignee.width / 2, py = poignee.y + poignee.height / 2;
await page.mouse.move(px, py);
await page.mouse.down();
await page.mouse.move(px - 300, py + 40, { steps: 8 });
await page.mouse.up();
const deplacee = await barreOutils.boundingBox();
check("barre d'outils : déplacée à la souris par sa poignée", Math.abs(deplacee.x - (boiteBarre.x - 300)) < 3 && Math.abs(deplacee.y - (boiteBarre.y + 40)) < 3, `${boiteBarre.x},${boiteBarre.y} → ${deplacee.x},${deplacee.y}`);
await page.mouse.move(px - 300, py + 40);
await page.mouse.down();
await page.mouse.move(px + 900, py - 900, { steps: 8 });
await page.mouse.up();
const bornee = await barreOutils.boundingBox();
check("barre d'outils : reste entière dans la carte", bornee.x + bornee.width <= boiteCarte.x + boiteCarte.width && bornee.y >= boiteCarte.y);
await page.locator("[data-gd-poignee]").focus();
await page.keyboard.press("ArrowLeft");
check("barre d'outils : déplaçable au clavier (flèches)", Math.abs((await barreOutils.boundingBox()).x - (bornee.x - 10)) < 2);
await page.locator("[data-gd-poignee]").dblclick();
const retour = await barreOutils.boundingBox();
check("barre d'outils : double-clic sur la poignée → position par défaut à droite", Math.abs(retour.x - boiteBarre.x) < 2 && Math.abs(retour.y - boiteBarre.y) < 2);
check("carte : aucun contrôle de navigation MapLibre en double", (await page.locator(".maplibregl-ctrl-zoom-in").count()) === 0);
const zoomAvant = Number(await page.locator("main.gd-carte").getAttribute("data-gd-zoom"));
await page.locator("[data-gd-barre-outil='zoom-plus']").click();
await page.waitForFunction((z) => Number(document.querySelector("main.gd-carte")?.getAttribute("data-gd-zoom")) >= z + 0.9, zoomAvant, { timeout: 5000 }).catch(() => undefined);
const zoomApres = Number(await page.locator("main.gd-carte").getAttribute("data-gd-zoom"));
check("carte : le bouton « Zoom avant » agit sur la carte (un cran)", Math.abs(zoomApres - zoomAvant - 1) < 0.05, `${zoomAvant} → ${zoomApres}`);
await page.locator("[data-gd-barre-outil='zoom-moins']").click();
await page.locator("[data-gd-menu]").click();
const entreesMenu = await page.locator("#gd-menu-liste button").allTextContents();
check("menu hamburger : Données, Mes cartes, Études, Importer, Exporter", entreesMenu.join("|") === "Données|Mes cartes|Études|Importer|Exporter", entreesMenu.join("|"));
await page.locator("[data-gd-menu]").click();
check("bouton « Données » : le catalogue est ouvert sur la carte", (await page.locator("[data-gd-donnees]").getAttribute("aria-pressed")) === "true" && (await page.locator("[data-gd-catalogue]").count()) === 1);
await page.locator("[data-gd-donnees]").click();
check("bouton « Données » : referme le panneau (carte entière)", (await page.locator("[data-gd-panneau]").count()) === 0);
await page.locator("[data-gd-donnees]").click();

// --- Catalogue rangé par catégorie (D-GD-14) ---
const entetes = await page.locator("[data-gd-entete-categorie]").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-gd-entete-categorie")));
check("catalogue : sections par catégorie, repliées par défaut", entetes.includes("test") && (await page.locator("[data-gd-entete-categorie][aria-expanded='true']").count()) === 0, entetes.join(","));
check("catalogue : bascule Vecteurs / Imagerie", (await page.locator("[data-gd-type]").count()) === 2 && (await page.locator("[data-gd-type='vecteurs']").getAttribute("aria-pressed")) === "true");
await page.locator("[data-gd-entete-categorie='test']").click();

// --- Catalogue, couche, indicateur, légende (GEO 06) ---
const carteCatalogue = page.locator("[data-gd-couche-catalogue]").filter({ hasText: "Unités synthétiques (test)" });
await carteCatalogue.waitFor();
check("catalogue : jeu synthétique signalé comme tel", (await carteCatalogue.locator(".gd-badge-alerte").textContent())?.includes("Jeu synthétique") === true);
await carteCatalogue.getByRole("button", { name: "Fiche de la couche" }).click();
const ficheVersion = carteCatalogue.locator("[data-gd-fiche-version]");
check("catalogue : fiche de version (licence, empreinte, droits par usage)", (await ficheVersion.textContent())?.includes("Empreinte SHA-256") === true && (await ficheVersion.locator(".gd-droits li").count()) === 8);
await carteCatalogue.locator("[data-gd-ajouter]").click();
check("catalogue : compte des couches actives de la catégorie (1/n)", /^1\/\d+$/.test(((await page.locator("[data-gd-entete-categorie='test'] .gd-compte").textContent()) ?? "").trim()));
await onglet(page, "couches");
const coucheActive = page.locator("[data-gd-couche-active]").first();
await coucheActive.waitFor();
const choixColoration = coucheActive.locator("[data-gd-coloration]");
const optionsColoration = await choixColoration.locator("option").evaluateAll((os) => os.map((o) => o.value));
check("coloration (D-GD-32) : la liste ne propose que « Couleur unie » et « Une couleur par entité », aucun indicateur, aucun groupe", optionsColoration.join(",") === ",__entites__" && (await coucheActive.locator("optgroup").count()) === 0, optionsColoration.join(","));
check("coloration : aucun endroit de l'onglet Couches ne permet de choisir un indicateur", (await page.locator("[data-gd-couche-active] [data-gd-indicateur], [data-gd-couche-active] [data-gd-arbre]").count()) === 0);
await onglet(page, "legende");
check("légende : couleur unie de la couche (aucune classe d'indicateur)", (await page.locator("[data-gd-legende] .gd-pastille").count()) === 1 && (await page.locator("[data-gd-legende] [data-classe]").count()) === 0);

// --- Libellés (lot C, D-GD-24) : bouton de la barre d'outils et Alt+L ; glyphes hébergés par Fadi ; points d'étiquette ---
const boutonLibelles = page.locator("[data-gd-barre-outil='etiquettes']");
check("libellés : bouton « Afficher les libellés (Alt+L) » dans la barre d'outils, non pressé", (await boutonLibelles.getAttribute("aria-label")) === "Afficher les libellés (Alt+L)" && (await boutonLibelles.getAttribute("aria-pressed")) === "false" && !(await boutonLibelles.isDisabled()));
const glyphes = page.waitForResponse((r) => r.url().includes("/geodata/glyphes/NotoSans-Regular/") && r.status() === 200, { timeout: 20_000 }).catch(() => null);
const pointsEtiquette = page.waitForResponse((r) => /\/geodata\/api\/etiquettes\//.test(r.url()) && r.status() === 200, { timeout: 20_000 }).catch(() => null);
const policesTierces = [];
const surRequete = (r) => { if (/fonts|glyphs/i.test(r.url()) && !r.url().startsWith(new URL(page.url()).origin)) policesTierces.push(r.url()); };
page.on("request", surRequete);
await page.locator("body").press("Alt+l");
check("libellés : Alt+L les affiche (bouton pressé, case « Libellés » de la couche cochée)", (await boutonLibelles.getAttribute("aria-pressed")) === "true" && (await boutonLibelles.getAttribute("aria-label")) === "Masquer les libellés (Alt+L)");
const [repGlyphes, repPoints] = await Promise.all([glyphes, pointsEtiquette]);
check("libellés : glyphes servis par Fadi (/geodata/glyphes, 200), aucune police tierce", !!repGlyphes && policesTierces.length === 0, policesTierces.join(" "));
check("libellés : points d'étiquette lus seulement une fois les libellés affichés (/etiquettes, 200)", !!repPoints && (repPoints.headers()["content-type"] ?? "").includes("vector-tile"));
await page.waitForTimeout(800);
check("libellés : aucune erreur de carte", (await page.locator("[data-gd-erreur-carte]").count()) === 0);
await page.screenshot({ path: join(OUT, "01b-libelles.png") });
await onglet(page, "couches");
const caseLibelles = page.locator("[data-gd-couche-active]").first().locator("[data-gd-etiquettes]");
check("libellés : la case « Libellés (nom) » de la couche est cochée (le nom seul, jamais « nom + valeur »)", (await caseLibelles.isChecked()) && ((await caseLibelles.locator("xpath=..").textContent()) ?? "").trim() === "Libellés (nom)");
await caseLibelles.uncheck();
check("libellés : décochés sur la couche → bouton non pressé", (await boutonLibelles.getAttribute("aria-pressed")) === "false");
await boutonLibelles.click();
check("libellés : le bouton les rétablit", (await caseLibelles.isChecked()) && (await boutonLibelles.getAttribute("aria-pressed")) === "true");
await boutonLibelles.click();
check("libellés : le bouton les masque", !(await caseLibelles.isChecked()));
page.off("request", surRequete);
await onglet(page, "legende");

// --- Mini-carte de situation (lot G, D-GD-27) : Alt+M, bouton, emprise de la vue, clic qui recentre ---
const boutonMini = page.locator("[data-gd-barre-outil='mini-carte']");
const annonceGd = page.locator("[data-geodata-page] p.sr-only[role='status']");
check("mini-carte : masquée par défaut, bouton « Afficher la mini-carte de situation (Alt+M) »", (await page.locator("[data-gd-mini-carte]").count()) === 0 && (await boutonMini.getAttribute("aria-label")) === "Afficher la mini-carte de situation (Alt+M)");
await page.locator("body").press("Alt+m");
await page.locator("[data-gd-mini-carte] canvas").waitFor({ timeout: 15_000 });
check("mini-carte : Alt+M l'affiche (canevas, bouton pressé, annonce)", (await boutonMini.getAttribute("aria-pressed")) === "true" && ((await annonceGd.textContent()) ?? "").includes("Mini-carte affichée"));
const boiteMini = await page.locator("[data-gd-mini-carte]").boundingBox();
const boitePanneau = await page.locator("[data-gd-panneau]").boundingBox();
check("mini-carte : en bas de la carte, à droite du panneau ouvert (jamais dessous)", !!boiteMini && boiteMini.width >= 100 && (!boitePanneau || boiteMini.x >= boitePanneau.x + boitePanneau.width), JSON.stringify({ boiteMini, boitePanneau }));
await page.waitForTimeout(1000);
await page.screenshot({ path: join(OUT, "01d-mini-carte.png") });
await page.locator("[data-gd-mini-carte]").click({ position: { x: 20, y: 20 } });
check("mini-carte : un clic ne provoque aucune erreur de carte", (await page.locator("[data-gd-erreur-carte]").count()) === 0);
await boutonMini.click();
check("mini-carte : le bouton la masque", (await page.locator("[data-gd-mini-carte]").count()) === 0 && (await boutonMini.getAttribute("aria-pressed")) === "false");
// Impression directe : une carte non enregistrée n'est pas imprimée (mêmes droits que l'export).
await page.locator("[data-gd-barre-outil='imprimer']").click();
check("impression : carte non enregistrée → invitation à l'enregistrer (aucune fenêtre)", ((await annonceGd.textContent()) ?? "").includes("Enregistrez la carte pour l'imprimer"));

// --- Rubrique « Indicateurs » du catalogue (D-GD-31, D-GD-32) : choix dans le catalogue seulement ; valeur affichée en texte propre, jamais de coloration ---
await onglet(page, "couches");
check("catalogue : « Parcourir les indicateurs » n'est plus sur les cartes de couche", (await page.locator("[data-gd-couche-active] [data-gd-arbre]").count()) === 0);
await onglet(page, "catalogue");
check("catalogue : la rubrique « Indicateurs » est parmi les vecteurs", (await page.locator("[data-gd-entete-categorie='indicateurs']").count()) === 1);
const entetesCat = await page.locator("[data-gd-entete-categorie]").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-gd-entete-categorie")));
check("catalogue : la rubrique « Indicateurs » suit « Géologie » (ou ferme la liste quand « Géologie » est vide)", entetesCat.includes("geologie") ? entetesCat.indexOf("indicateurs") === entetesCat.indexOf("geologie") + 1 : entetesCat[entetesCat.length - 1] === "indicateurs", entetesCat.join(","));
await page.locator("[data-gd-entete-categorie='indicateurs']").click();
const arbre = page.locator("[data-gd-arbre='catalogue']");
await arbre.waitFor();
const rechercheArbre = arbre.locator("[data-gd-arbre-recherche]");
await rechercheArbre.fill("EFFECTIF synthetique");
const familleTrouvee = arbre.locator("[data-gd-arbre-famille='Effectif synthétique']");
check("rubrique Indicateurs : recherche sans accents ni casse, thème déplié, famille trouvée", (await familleTrouvee.isVisible()) && ((await arbre.locator("[data-gd-arbre-compte]").textContent()) ?? "").includes("1 famille(s) trouvée(s)"));
await rechercheArbre.fill("introuvable");
check("rubrique Indicateurs : recherche sans résultat annoncée", ((await arbre.locator("[data-gd-arbre-compte]").textContent()) ?? "").includes("Aucun indicateur ne correspond."));
await rechercheArbre.press("Escape");
check("rubrique Indicateurs : Échap vide la recherche", (await rechercheArbre.inputValue()) === "");
await rechercheArbre.fill("Effectif");
await familleTrouvee.click();
await page.waitForFunction(() => document.querySelector("[data-gd-arbre='catalogue'] [data-gd-arbre-famille='Effectif synthétique']")?.getAttribute("aria-pressed") === "true", null, { timeout: 10_000 }).catch(() => undefined);
check("rubrique Indicateurs : la famille choisie est marquée active", (await familleTrouvee.getAttribute("aria-pressed")) === "true");
await onglet(page, "couches");
const carteIndicateur = page.locator("[data-gd-couche-active]").first();
const caseIndicateur = carteIndicateur.locator("[data-gd-indicateur-affiche] input");
const caseNoms = carteIndicateur.locator("[data-gd-etiquettes]");
const valeursAffichees = async () => ((await page.locator("[data-geodata-page]").getAttribute("data-gd-valeurs-affichees")) ?? "").split(" ").filter(Boolean);
await page.waitForFunction(() => ((document.querySelector("[data-geodata-page]")?.getAttribute("data-gd-valeurs-affichees")) ?? "") !== "", null, { timeout: 10_000 }).catch(() => undefined);
check("indicateur actif : case « Afficher l'indicateur — Effectif synthétique » cochée par défaut, valeurs affichées sur la couche", (await caseIndicateur.isChecked()) && ((await carteIndicateur.locator("[data-gd-indicateur-affiche]").textContent()) ?? "").includes("Afficher l'indicateur — Effectif synthétique") && (await valeursAffichees()).length === 1);
check("indicateur actif : la coloration de la couche n'a pas changé (couleur unie), aucune classe en légende", (await carteIndicateur.locator("[data-gd-coloration]").inputValue()) === "");
// Les quatre combinaisons nom / valeur : deux cases sans aucun lien entre elles.
check("nom / valeur : état de départ — noms masqués, valeurs affichées", !(await caseNoms.isChecked()) && (await caseIndicateur.isChecked()));
await caseNoms.check();
check("nom / valeur : les deux textes (cocher « Libellés » ne touche pas l'indicateur)", (await caseNoms.isChecked()) && (await caseIndicateur.isChecked()) && (await valeursAffichees()).length === 1);
await caseIndicateur.uncheck();
check("nom / valeur : nom seul (décocher l'indicateur masque ses valeurs, les libellés restent, l'indicateur reste mémorisé)", (await caseNoms.isChecked()) && !(await caseIndicateur.isChecked()) && (await valeursAffichees()).length === 0 && ((await carteIndicateur.locator("[data-gd-indicateur-affiche]").textContent()) ?? "").includes("Effectif synthétique"));
await caseNoms.uncheck();
check("nom / valeur : aucun texte (décocher « Libellés » ne recoche pas l'indicateur)", !(await caseNoms.isChecked()) && !(await caseIndicateur.isChecked()) && (await valeursAffichees()).length === 0);
await caseIndicateur.check();
check("nom / valeur : valeur seule (recocher l'indicateur n'affiche pas les noms)", !(await caseNoms.isChecked()) && (await caseIndicateur.isChecked()) && (await valeursAffichees()).length === 1);
await page.waitForTimeout(800);
check("indicateur actif : aucune erreur de carte avec les valeurs affichées", (await page.locator("[data-gd-erreur-carte]").count()) === 0);
await page.screenshot({ path: join(OUT, "01c-valeurs-indicateur.png") });
// Couche retirée puis rechargée : elle repart comme une couche nouvelle et reçoit l'indicateur actif (case cochée).
await carteIndicateur.getByRole("button", { name: "Retirer", exact: true }).click();
await onglet(page, "catalogue");
if (!(await carteCatalogue.isVisible())) await page.locator("[data-gd-entete-categorie='test']").click();
await carteCatalogue.locator("[data-gd-ajouter]").click();
await onglet(page, "couches");
await page.waitForFunction(() => ((document.querySelector("[data-geodata-page]")?.getAttribute("data-gd-valeurs-affichees")) ?? "") !== "", null, { timeout: 10_000 }).catch(() => undefined);
check("indicateur actif : une couche retirée puis rechargée le reçoit à nouveau, case cochée", (await caseIndicateur.isChecked()) && (await valeursAffichees()).length === 1);
await onglet(page, "legende");

// Recherche : coordonnées étiquetées, paire nue refusée, unité par code à zéro initial.
const recherche = page.locator("[data-gd-recherche]");
await recherche.fill("33.5, -7.6");
await recherche.press("Enter");
await page.locator(".gd-resultats").waitFor();
check("recherche : une paire de nombres sans étiquette est refusée (aucun ordre deviné)", ((await page.locator(".gd-resultats").textContent()) ?? "").includes("précisez « lon … lat … »"));
await recherche.fill("003");
await recherche.press("Enter");
await page.locator("[data-gd-resultat='003']").click();
const fiche = page.locator("[data-gd-fiche='003']");
await fiche.waitFor();
const valeurAbsente = fiche.locator("[data-gd-valeur][data-absente]");
check("GEO 06 · fiche : « Valeur absente — Valeur couverte par le secret statistique », jamais 0", ((await valeurAbsente.textContent()) ?? "").includes("Valeur absente — Valeur couverte par le secret statistique"));
await page.screenshot({ path: join(OUT, "01-carte-thematique.png") });

// Une couleur par entité : six unités → six couleurs distinctes en légende, puis retour à la couleur unie.
await onglet(page, "couches");
await page.locator("[data-gd-couche-active]").first().locator("[data-gd-coloration]").selectOption("__entites__");
await onglet(page, "legende");
const entites = page.locator("[data-gd-legende] [data-gd-entite]");
await entites.first().waitFor();
const pastilles = await entites.locator(".gd-pastille").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
check("une couleur par entité : six unités, six couleurs distinctes en légende", (await entites.count()) === 6 && new Set(pastilles).size === 6, `${await entites.count()} / ${new Set(pastilles).size}`);
await onglet(page, "couches");
await page.locator("[data-gd-couche-active]").first().locator("[data-gd-coloration]").selectOption("");

// Table : zéro affiché 0, absence affichée « Valeur absente ».
await onglet(page, "couches");
await page.locator("[data-gd-couche-active]").first().getByRole("button", { name: "Table" }).click();
const table = page.locator("[data-gd-table]");
await table.locator("[data-gd-ligne='001']").waitFor();
const ligne1 = await table.locator("[data-gd-ligne='001'] td").allTextContents();
const ligne3 = await table.locator("[data-gd-ligne='003'] td").allTextContents();
check("GEO 06 · table : zéro reste « 0 » et l'absence reste « Valeur absente »", ligne1.includes("0") && ligne3.some((t) => t.startsWith("Valeur absente")), `${ligne1.join("|")} / ${ligne3.join("|")}`);
await table.getByRole("button", { name: "Fermer la table" }).click();

// --- GEO 05 : enregistrer, se reconnecter, retrouver la composition ---
await page.locator("[data-gd-enregistrer]").click();
await page.locator("[data-gd-nom-carte]").fill("Carte de recette");
await page.locator("[data-gd-enregistrer-sous]").click();
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
check("GEO 05 · carte enregistrée (état « Enregistrée »)", true);
const compositionAvant = await page.evaluate(async () => { const r = await fetch("/geodata/api/cartes"); const l = await r.json(); const c = await (await fetch(`/geodata/api/cartes/${l.cartes[0].id}`)).json(); return c; });
await page.context().clearCookies();
await connecter(page, alice);
await page.goto(`${BASE}/geodata`);
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor({ timeout: 20_000 });
const compositionApres = await page.evaluate(async (id) => (await (await fetch(`/geodata/api/cartes/${id}`)).json()).composition, compositionAvant.id);
check("GEO 05 · après reconnexion : la dernière carte se rouvre, composition, versions et seuils identiques", JSON.stringify(compositionApres) === JSON.stringify(compositionAvant.composition));
check("GEO 05 · la coloration enregistrée est un mode de style (couleur unie), jamais une classe d'indicateur", compositionApres.couches[0]?.style?.mode === "simple" && !JSON.stringify(compositionApres).includes("thematique"));

// --- GEO 13 : deux onglets ---
const onglet2 = await contexte.newPage();
await onglet2.goto(`${BASE}/geodata`);
await onglet2.locator("[data-gd-etat-enregistrement='enregistree']").waitFor({ timeout: 20_000 });
await onglet(page, "couches");
await page.locator("[data-gd-couche-active] input[type='range']").first().fill("40");
await page.locator("[data-gd-enregistrer]").click();
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
await onglet(onglet2, "couches");
await onglet2.locator("[data-gd-couche-active] input[type='range']").first().fill("90");
await onglet2.locator("[data-gd-enregistrer]").click();
await onglet2.locator("[data-gd-conflit]").waitFor();
check("GEO 13 · second onglet : enregistrement périmé refusé, conflit visible", (await onglet2.locator("[data-gd-etat-enregistrement='conflit']").count()) === 1);
await onglet2.locator("[data-gd-copie-conflit]").click();
await onglet2.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
const cartes = await page.evaluate(async () => (await (await fetch("/geodata/api/cartes")).json()).cartes.map((c) => c.nom));
check("GEO 13 · « ma version » enregistrée comme copie, l'original intact", cartes.some((n) => n.endsWith("(ma version)")) && cartes.includes("Carte de recette"), cartes.join(", "));
await onglet2.close();
await page.goto(`${BASE}/geodata`);
await page.locator("[data-gd-etat-enregistrement]").waitFor();

// --- GEO 07 : import GeoJSON personnel ---
await volet(page, "import");
const projete = { type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::26191" } }, features: [{ type: "Feature", properties: { nom: "x" }, geometry: { type: "Point", coordinates: [350000, 380000] } }] };
await page.locator("[data-gd-fichier]").setInputFiles({ name: "projete.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(projete)) });
await page.locator("[data-gd-rapport='rejete']").waitFor();
check("GEO 07 · GeoJSON projeté refusé avant traitement, motif affiché", ((await page.locator("[data-gd-rapport='rejete']").textContent()) ?? "").includes("non pris en charge"));
const secteur = { type: "FeatureCollection", features: [{ type: "Feature", properties: { nom: "Secteur importé" }, geometry: { type: "Polygon", coordinates: [[[-8.95, 30.05], [-8.6, 30.05], [-8.6, 30.3], [-8.95, 30.3], [-8.95, 30.05]]] } }] };
await page.locator("[data-gd-fichier]").setInputFiles({ name: "secteur.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(secteur)) });
await page.locator("[data-gd-rapport='valide']").waitFor();
await page.locator("[data-gd-titre-import]").fill("Mon secteur");
await page.locator("[data-gd-confirmer-import]").click();
await page.locator(".gd-succes").waitFor();
const coucheImportee = await page.evaluate(async () => (await (await fetch("/geodata/api/catalogue")).json()).couches.find((c) => c.titre === "Mon secteur"));
check("GEO 07 · import confirmé : couche privée versionnée", coucheImportee?.version?.privee === true);

// --- Zone par coordonnées (clavier) et analyse (GEO 10 côté interface) ---
await volet(page, "etudes");
await page.locator("[data-gd-etudes] details summary").click();
const champs = page.locator("[data-gd-etudes] details input");
await champs.nth(0).fill("-9");
await champs.nth(1).fill("30.05");
await champs.nth(2).fill("-8.7");
await champs.nth(3).fill("30.15");
await champs.nth(4).fill("Zone de recette");
await page.locator("[data-gd-etudes] details").getByRole("button", { name: "Créer la zone" }).click();
const zone = page.locator("[data-gd-zone]").filter({ hasText: "Zone de recette" });
await zone.waitFor();
await page.locator("[data-gd-etudes] select").last().selectOption({ label: "Unités synthétiques (test)" });
await zone.locator("[data-gd-analyser]").click();
const analyse = page.locator("[data-gd-analyse]").first();
await analyse.waitFor();
check("analyse : superficie et unités intersectées, limites déclarées", /unité\(s\) intersectée\(s\)/.test((await analyse.textContent()) ?? "") && ((await analyse.textContent()) ?? "").includes("ni population"));
// Mesure indicative au tracé.
// Outil choisi depuis la barre verticale ; le panneau Données est refermé pour dégager la carte.
if (await page.locator("[data-gd-panneau]").count()) await page.locator("[data-gd-fermer-panneau]").click();
await page.locator("[data-gd-barre-outil='distance']").click();
check("barre d'outils : « Mesurer une distance » active l'outil et ouvre Études", (await page.locator("[data-gd-barre-outil='distance']").getAttribute("aria-pressed")) === "true" && (await page.locator("[data-gd-outil='distance']").isChecked()));
const boite = await page.locator(".maplibregl-canvas").boundingBox();
await page.mouse.click(boite.x + boite.width * 0.4, boite.y + boite.height * 0.5);
await page.mouse.click(boite.x + boite.width * 0.6, boite.y + boite.height * 0.5);
await page.locator("[data-gd-mesure]").waitFor();
check("mesure indicative : distance affichée avec sa méthode", /Distance : .*(m|km)/.test((await page.locator("[data-gd-mesure]").textContent()) ?? "") && ((await page.locator("[data-gd-mesure]").textContent()) ?? "").includes("indicative"));
await page.locator("[data-gd-outil='navigation']").check();

// --- GEO 09 : export autorisé (PNG + fiche) ---
await page.locator("[data-gd-enregistrer]").click().catch(() => undefined);
await page.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
await volet(page, "export");
const telechargement = page.waitForEvent("download", { timeout: 30_000 });
await page.locator("[data-gd-exporter]").click();
const png = await telechargement;
const cheminPng = join(OUT, "export.png");
await png.saveAs(cheminPng);
const octets = readFileSync(cheminPng);
check("GEO 09 · export autorisé : image PNG téléchargée", octets.subarray(1, 4).toString() === "PNG" && octets.length > 5000, `${octets.length} octets`);
await page.locator("[data-gd-export-ok]").waitFor();
const lienFiche = await page.locator("[data-gd-export-ok] a").getAttribute("href");
const ficheHtml = await (await page.request.get(`${BASE}${lienFiche}`)).text();
check("GEO 09 · fiche de sources : attribution et nature synthétique déclarées", ficheHtml.includes("Jeu synthétique GeoData — aucune donnée réelle") && ficheHtml.includes("Empreinte SHA-256"));

// --- Impression directe (lot G, D-GD-27) : carte enregistrée, même verdict que l'export, mini-carte en encart ---
await page.evaluate(() => {
  window.__impressionsCarte = [];
  const ouvrir = window.open.bind(window);
  window.open = (...a) => {
    const w = ouvrir(...a);
    if (w) w.print = () => {
      const img = w.document.querySelector("img");
      const c = document.createElement("canvas");
      if (img) { c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); }
      window.__impressionsCarte.push({ titre: w.document.title, largeur: img?.naturalWidth ?? 0, src: img?.src.slice(0, 5) ?? "", png: img ? c.toDataURL("image/png") : "" });
    };
    return w;
  };
});
await page.locator("body").press("Alt+m");
await page.locator("[data-gd-mini-carte] canvas").waitFor({ timeout: 15_000 });
await page.waitForTimeout(800);
await page.locator("body").press("Alt+i");
await page.waitForFunction(() => window.__impressionsCarte.length > 0, null, { timeout: 30_000 }).catch(() => undefined);
const impressionsCarte = await page.evaluate(() => window.__impressionsCarte);
if (impressionsCarte[0]?.png) writeFileSync(join(OUT, "impression-carte.png"), Buffer.from(impressionsCarte[0].png.split(",")[1], "base64"));
check("impression directe (Alt+I) : fenêtre d'impression avec l'image autorisée de la carte enregistrée", impressionsCarte.length === 1 && impressionsCarte[0].titre.startsWith("Carte de recette") && impressionsCarte[0].largeur > 300 && impressionsCarte[0].src === "blob:", JSON.stringify(impressionsCarte.map(({ png: _p, ...x }) => x)));
await page.locator("body").press("Alt+m");

// --- Couche raster (D-GD-13) : tuiles d'image, légende en dégradé, valeur au point, nodata « non évaluée » ---
await onglet(page, "catalogue");
await page.locator("[data-gd-type='imagerie']").click();
await page.locator("[data-gd-entete-categorie='test']").click();
check("catalogue : la grille raster est rangée sous Imagerie", (await page.locator("[data-gd-couche-catalogue]").filter({ hasText: "Unités synthétiques (test)" }).count()) === 0);
const carteRaster = page.locator("[data-gd-couche-catalogue]").filter({ hasText: "Grille synthétique (test)" });
await carteRaster.waitFor();
const reponseTuile = page.waitForResponse((r) => /\/geodata\/api\/raster\/.+\/\d+\/\d+\/\d+\.png$/.test(r.url()), { timeout: 20_000 });
await carteRaster.locator("[data-gd-ajouter]").click();
const tuile = await reponseTuile;
check("raster : tuile d'image servie (PNG)", tuile.status() === 200 && tuile.headers()["content-type"] === "image/png");
await onglet(page, "legende");
const legendeRaster = page.locator("[data-gd-legende-raster]");
await legendeRaster.waitFor();
check("raster : légende en dégradé avec grandeur et unité", (await legendeRaster.locator(".gd-degrade").count()) === 1 && ((await legendeRaster.textContent()) ?? "").includes("Valeur synthétique (u)"));
const idRaster = (await legendeRaster.getAttribute("data-gd-legende-couche")) ?? "";
const valeurRaster = await (await page.request.get(`${BASE}/geodata/api/raster/${idRaster}/valeur?lon=-8.79&lat=30.15`)).json();
const horsRaster = await (await page.request.get(`${BASE}/geodata/api/raster/${idRaster}/valeur?lon=-8.995&lat=30.295`)).json();
check("raster : valeur au point exacte ; cellule sans donnée « non évaluée » (null, jamais 0)", valeurRaster.valeur === 225 && horsRaster.valeur === null, `${valeurRaster.valeur} / ${horsRaster.valeur}`);
await onglet(page, "couches");
await page.locator(`[data-gd-couche-active='${idRaster}']`).getByRole("button", { name: "Retirer" }).click();

// --- Barre territoriale permanente (lot H, D-GD-28) : découpage lu EN BASE (pays synthétique « ZZ » chargé par la
// chaîne d'import), sans aucune couche de limites sur la carte ; aucun pays écrit dans le code ---
const barreTerr = page.locator("[data-gd-territoires]");
check("barre territoriale : présente sans couche de limites sur la carte", (await barreTerr.count()) === 1 && (await page.locator("[data-gd-couche-active]").filter({ hasText: "Régions synthétiques (test)" }).count()) === 0);
await page.waitForFunction(() => document.querySelector("[data-gd-territoires]")?.getAttribute("data-gd-territoires") !== "", null, { timeout: 15_000 });
if (await page.locator("[data-gd-pays]").count()) await page.locator("[data-gd-pays]").selectOption("ZZ");
check("barre territoriale : le pays vient de la base (« Pays synthétique (test) »)", (await barreTerr.getAttribute("data-gd-territoires")) === "ZZ" && ((await barreTerr.textContent()) ?? "").includes("Pays synthétique (test)"));
const choixRegion = barreTerr.locator("[data-gd-niveau-select='1']");
await page.waitForFunction(() => (document.querySelector("[data-gd-territoires] [data-gd-niveau-select='1']")?.querySelectorAll("option").length ?? 0) > 1, null, { timeout: 15_000 });
const optionsRegions = await choixRegion.locator("option").allTextContents();
check("barre territoriale : niveau « Régions » de la base, ses unités listées", optionsRegions[0]?.startsWith("Régions (2)") === true && optionsRegions.includes("Région synthétique Nord"), optionsRegions.join(" | "));
await choixRegion.selectOption({ label: "Région synthétique Nord" });
await page.locator("[data-gd-territoires][data-gd-niveaux='1']").waitFor();
const choixProvince = barreTerr.locator("[data-gd-niveau-select='2']");
await page.waitForFunction(() => (document.querySelector("[data-gd-territoires] [data-gd-niveau-select='2']")?.querySelectorAll("option").length ?? 0) > 1, null, { timeout: 15_000 });
const optionsProvinces = await choixProvince.locator("option").allTextContents();
check("barre territoriale : une région choisie → ses provinces (parenté lue en base)", optionsProvinces.length === 3 && optionsProvinces.slice(1).every((x) => x.includes(" N-")), optionsProvinces.join(" | "));
await choixProvince.selectOption({ index: 1 });
await page.locator("[data-gd-territoires][data-gd-niveaux='2']").waitFor();
check("barre territoriale : province choisie, Retour actif, attribution de la source affichée", !(await page.locator("[data-gd-retour]").isDisabled()) && ((await page.locator(".maplibregl-ctrl-attrib").textContent()) ?? "").includes("Jeu synthétique GeoData"));
await page.screenshot({ path: join(OUT, "07a-barre-territoriale.png") });
await page.locator("body").press("Alt+ArrowUp");
await page.locator("[data-gd-territoires][data-gd-niveaux='1']").waitFor();
await page.locator("[data-gd-retour]").click();
await page.locator("[data-gd-territoires][data-gd-niveaux='0']").waitFor();
check("barre territoriale : Alt+↑ puis Retour ramènent au pays", (await page.locator("[data-gd-retour]").isDisabled()) === true);

// --- Sélection par nombre de clics (D-GD-34), carte vierge : aucune couche de limites sur la carte, les unités viennent
// du découpage en base (ZZ : provinces puis régions) ; 1 clic → province, 2 clics → région, 3 clics → région encore ---
const selectionCourante = async () => (await page.locator("[data-geodata-page]").getAttribute("data-gd-selection")) ?? "";
const attendreSelection = (attendu) => page.waitForFunction((a) => document.querySelector("[data-geodata-page]")?.getAttribute("data-gd-selection") === a, attendu, { timeout: 10_000 }).catch(() => undefined);
await choixRegion.selectOption({ label: "Région synthétique Nord" });
await page.locator("[data-gd-territoires][data-gd-niveaux='1']").waitFor();
if (await page.locator("[data-gd-panneau]").count()) await page.locator("[data-gd-fermer-panneau]").click();
await page.waitForTimeout(1200);
const canevas = await page.locator(".maplibregl-canvas").boundingBox();
const xClic = canevas.x + canevas.width * 0.35, yClic = canevas.y + canevas.height * 0.5;
const zoomAvantClics = await page.locator("[data-gd-zoom]").getAttribute("data-gd-zoom");
await page.mouse.click(xClic, yClic);
await attendreSelection("2:1001");
await page.locator("[data-gd-fiche='1001']").waitFor({ timeout: 10_000 }).catch(() => undefined);
check("clics, carte vierge : 1 clic sélectionne la province (niveau le plus élémentaire en base), fiche ouverte, aucune couche ajoutée", (await selectionCourante()) === "2:1001" && (await page.locator("[data-gd-fiche='1001']").count()) === 1 && (await page.locator("[data-gd-couche-active]").filter({ hasText: "Provinces synthétiques (test)" }).count()) === 0, await selectionCourante());
await page.waitForTimeout(500);
await page.mouse.dblclick(xClic, yClic);
await attendreSelection("1:1");
await page.locator("[data-gd-fiche='1']").waitFor({ timeout: 10_000 }).catch(() => undefined);
check("clics, carte vierge : 2 clics rapides sélectionnent la région (parent lu en base), fiche de la région", (await selectionCourante()) === "1:1" && (await page.locator("[data-gd-fiche='1']").count()) === 1, await selectionCourante());
check("clics : le double-clic ne zoome plus", (await page.locator("[data-gd-zoom]").getAttribute("data-gd-zoom")) === zoomAvantClics);
await page.waitForTimeout(500);
await page.mouse.click(xClic, yClic); await page.mouse.click(xClic, yClic); await page.mouse.click(xClic, yClic);
await page.waitForTimeout(600);
check("clics, carte vierge : un 3e clic ne change rien (dernier niveau)", (await selectionCourante()) === "1:1", await selectionCourante());
// Clic hors du découpage du pays courant (carte recentrée loin des unités synthétiques) : la sélection est effacée.
await page.locator("[data-gd-recherche]").fill("lon -7 lat 32.5");
await page.locator("[data-gd-recherche]").press("Enter");
await page.locator("[data-gd-resultat='coordonnees']").click();
await page.waitForTimeout(1500);
await page.mouse.click(canevas.x + canevas.width * 0.5, canevas.y + canevas.height * 0.6);
await attendreSelection("");
check("clics : un clic hors de toute entité efface la sélection", (await selectionCourante()) === "");
await page.locator("[data-gd-retour]").click();
await page.locator("[data-gd-territoires][data-gd-niveaux='0']").waitFor();

// --- Navigation par niveaux (lot B) : descendre depuis la fiche, barre territoriale à jour, couche du niveau inférieur ajoutée, Alt+↑ ---
await onglet(page, "catalogue");
await page.locator("[data-gd-type='vecteurs']").click();
const carteRegions = page.locator("[data-gd-couche-catalogue]").filter({ hasText: "Régions synthétiques (test)" });
if (!(await carteRegions.count())) await page.locator("[data-gd-entete-categorie='test']").click();
await carteRegions.locator("[data-gd-ajouter]").click();
await page.locator("[data-gd-couche-active]").filter({ hasText: "Régions synthétiques (test)" }).waitFor({ state: "attached", timeout: 20_000 }).catch(() => undefined);
check("niveaux : au pays, Retour inactif", (await page.locator("[data-gd-retour]").isDisabled()) === true);
await page.locator("[data-gd-recherche]").fill("Région synthétique Nord");
await page.locator("[data-gd-recherche]").press("Enter");
await page.locator("[data-gd-resultat='1']").click();
const descendreBouton = page.locator("[data-gd-fiche='1'] [data-gd-descendre]");
await descendreBouton.waitFor();
// Le nom du niveau inférieur vient du découpage en base (pays ZZ : « Provinces »), jamais d'un référentiel du code.
check("niveaux : la fiche d'une région propose « Voir ses provinces » (nom du niveau lu en base, Alt+↓)", ((await descendreBouton.textContent()) ?? "").includes("Voir ses provinces") && !((await descendreBouton.textContent()) ?? "").includes("préfectures") && (await descendreBouton.getAttribute("aria-keyshortcuts")) === "Alt+ArrowDown");
await descendreBouton.click();
await page.locator("[data-gd-niveaux='1']").waitFor();
check("niveaux : la barre territoriale passe à « Pays synthétique (test) › Région synthétique Nord »", (await page.locator("[data-gd-niveau-select='1']").inputValue()) === "1");
await onglet(page, "couches");
check("niveaux : la couche des provinces du même producteur est ajoutée à la carte", (await page.locator("[data-gd-couche-active]").filter({ hasText: "Provinces synthétiques (test)" }).count()) === 1);
// Sélection par clics avec couches chargées (D-GD-34) : régions et provinces sur la carte → 1 clic province, 2 clics
// région (parent par les codes HCP, lu en base), 3e clic sans effet ; le double-clic ne zoome pas.
await page.locator("[data-gd-fermer-panneau]").click();
await page.waitForTimeout(1500);
const canevas2 = await page.locator(".maplibregl-canvas").boundingBox();
const xC = canevas2.x + canevas2.width * 0.35, yC = canevas2.y + canevas2.height * 0.5;
const zoomAvant2 = await page.locator("[data-gd-zoom]").getAttribute("data-gd-zoom");
await page.mouse.click(xC, yC);
await attendreSelection("2:1001");
await page.locator("[data-gd-fiche='1001']").waitFor({ timeout: 10_000 }).catch(() => undefined);
check("clics, couches chargées : 1 clic sélectionne la province touchée (plus petit niveau chargé)", (await selectionCourante()) === "2:1001" && (await page.locator("[data-gd-fiche='1001']").count()) === 1, await selectionCourante());
await page.waitForTimeout(500);
await page.mouse.dblclick(xC, yC);
await attendreSelection("1:1");
await page.locator("[data-gd-fiche='1']").waitFor({ timeout: 10_000 }).catch(() => undefined);
check("clics, couches chargées : 2 clics sélectionnent la région de la couche chargée", (await selectionCourante()) === "1:1" && (await page.locator("[data-gd-fiche='1']").count()) === 1 && (await page.locator("[data-gd-zoom]").getAttribute("data-gd-zoom")) === zoomAvant2, await selectionCourante());
await page.waitForTimeout(500);
await page.mouse.click(xC, yC); await page.mouse.click(xC, yC); await page.mouse.click(xC, yC);
await page.waitForTimeout(600);
check("clics, couches chargées : un 3e clic ne change rien (deux niveaux chargés)", (await selectionCourante()) === "1:1", await selectionCourante());
await page.waitForTimeout(500);
// Fiche territoriale (lot E) : impression de la fiche seule (bouton et Alt+P) dans une fenêtre d'impression, sections
// dépliées, sans boutons ; la page n'est pas modifiée. L'impression est interceptée (aucune boîte de dialogue en recette).
await page.evaluate(() => {
  window.__impressions = [];
  const ouvrir = window.open.bind(window);
  window.open = (...a) => {
    const w = ouvrir(...a);
    w.print = () => { const d = w.document; window.__impressions.push({ titre: d.querySelector(".gd-fiche h3")?.textContent ?? "", fermees: d.querySelectorAll("details:not([open])").length, boutons: w.getComputedStyle(d.querySelector("[data-gd-imprimer]")).display }); };
    return w;
  };
});
await page.locator("[data-gd-imprimer]").click();
await page.locator("body").press("Alt+p");
const impressions = await page.evaluate(() => window.__impressions);
check("fiche territoriale : « Imprimer la fiche » (et Alt+P) imprime la fiche seule, sections dépliées, sans boutons", impressions.length === 2 && impressions.every((x) => x.titre === "Région synthétique Nord" && x.fermees === 0 && x.boutons === "none"), JSON.stringify(impressions));
await page.locator("body").press("Alt+ArrowUp");
await page.locator("[data-gd-niveaux='0']").waitFor();
check("niveaux : Alt+↑ remonte au pays", (await page.locator("[data-gd-retour]").isDisabled()) === true);
await page.screenshot({ path: join(OUT, "07-niveaux.png") });

// --- Menu ☰ → Données : catégories et couches (D-GD-14) ---
await volet(page, "donnees");
await page.locator("[data-gd-gestion]").waitFor();
check("Données : lecture seule sans rôle de gestionnaire", (await page.locator("[data-gd-lecture-seule]").count()) === 1 && (await page.locator("[data-gd-creer-categorie]").count()) === 0);
npmApi("geodata:role", ["--email", alice, "--role", "gestionnaire-donnees"]);
await page.reload();
await page.locator("[data-geodata-page]").waitFor();
await volet(page, "donnees");
const nomCategorie = `Recette ${suffixe}`;
await page.locator("[data-gd-nouvelle-categorie]").fill(nomCategorie);
await page.locator("[data-gd-creer-categorie]").click();
const blocCategorie = page.locator("[data-gd-gestion-categorie]").filter({ hasText: nomCategorie });
await blocCategorie.waitFor();
check("Données : catégorie créée par le gestionnaire", (await blocCategorie.count()) === 1);
const idCategorie = (await blocCategorie.getAttribute("data-gd-gestion-categorie")) ?? "";
const blocRenomme = page.locator(`[data-gd-gestion-categorie='${idCategorie}']`);
await blocRenomme.locator("[data-gd-renommer-categorie]").click();
await blocRenomme.locator("[data-gd-libelle-categorie]").fill(`${nomCategorie} bis`);
await blocRenomme.locator("[data-gd-valider-libelle]").click();
await blocRenomme.filter({ hasText: `${nomCategorie} bis` }).waitFor();
check("Données : catégorie renommée", (await blocRenomme.count()) === 1);
await blocRenomme.locator("[data-gd-ouvrir-categorie]").click();
const choixCouche = blocRenomme.locator("[data-gd-ajouter-couche-categorie]");
const valeurUnites = await choixCouche.locator("option").filter({ hasText: "Unités synthétiques (test)" }).getAttribute("value");
await choixCouche.selectOption(valeurUnites ?? "");
await blocRenomme.locator(`[data-gd-gestion-couche='${valeurUnites}']`).waitFor();
check("Données : couche rangée dans la catégorie", (await blocRenomme.locator("[data-gd-gestion-couche]").count()) === 1);
await page.locator("[data-gd-donnees]").click();
await onglet(page, "catalogue");
await page.locator(`[data-gd-entete-categorie='${idCategorie}']`).click();
check("catalogue : la couche apparaît sous la catégorie gérée", (await page.locator(`[data-gd-categorie='${idCategorie}'] [data-gd-couche-catalogue='${valeurUnites}']`).count()) === 1);
await volet(page, "donnees");
await blocRenomme.locator("[data-gd-supprimer-categorie]").click();
await blocRenomme.locator("[data-gd-confirmer-suppression]").click();
await blocRenomme.waitFor({ state: "detached" });
const testOuvert = page.locator("[data-gd-gestion-categorie='test']");
await testOuvert.locator("[data-gd-ouvrir-categorie]").click();
check("Données : catégorie supprimée, sa couche revient à son thème (aucune couche supprimée)", (await testOuvert.locator(`[data-gd-gestion-couche='${valeurUnites}']`).count()) === 1);
await page.locator(".gd-volet .gd-ligne-titre button").filter({ hasText: "Fermer" }).click();

// --- Accessibilité (axe-core), clavier ---
await page.addScriptTag({ path: AXE });
const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector("[data-geodata-page]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, cibles: v.nodes.slice(0, 3).map((x) => x.target) })));
writeFileSync(join(OUT, "axe-geodata.json"), JSON.stringify(violations, null, 2));
const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
check("GEO 12 · axe-core : aucune violation critique ou sérieuse", graves.length === 0, graves.map((v) => `${v.id} ${JSON.stringify(v.cibles)}`).join(" ; "));
await page.locator("[data-gd-recherche]").focus();
await page.keyboard.press("Tab");
const focusApres = await page.evaluate(() => document.activeElement?.textContent?.trim());
check("GEO 12 · clavier : la recherche mène au bouton « Rechercher »", focusApres === "Rechercher", focusApres);

// --- GEO 12 : téléphone, un seul panneau ouvert à la fois ---
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/geodata`);
await page.locator("[data-geodata-page]").waitFor();
await page.locator("[data-gd-donnees]").click();
await page.locator("[data-gd-menu]").click();
const boiteMenu = await page.locator("#gd-menu-liste").boundingBox();
check("GEO 12 · téléphone : le menu ☰ reste dans l'écran, à droite", !!boiteMenu && boiteMenu.x >= 60 && boiteMenu.x + boiteMenu.width <= 391, JSON.stringify(boiteMenu));
await volet(page, "cartes");
const ouverts = await page.evaluate(() => [document.querySelector(".gd-panneau.gd-ouvert"), document.querySelector("[data-gd-volet-ouvert]")].filter(Boolean).length);
check("GEO 12 · téléphone : un seul panneau principal ouvert", ouverts === 1);
check("GEO 12 · téléphone : aucun débordement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await page.screenshot({ path: join(OUT, "02-telephone.png") });
// Mini-carte au téléphone, panneau Données ouvert (posé en bas) : elle reste visible au-dessus du panneau, cliquable.
if (await page.locator("[data-gd-volet-ouvert]").count()) await page.locator("[data-gd-volet-ouvert] .gd-ligne-titre").getByRole("button", { name: "Fermer" }).click();
if (!(await page.locator("[data-gd-panneau]").count())) await page.locator("[data-gd-donnees]").click();
await page.locator("body").press("Alt+m");
await page.locator("[data-gd-mini-carte] canvas").waitFor({ timeout: 15_000 });
const miniTel = await page.locator("[data-gd-mini-carte]").boundingBox();
const panneauTel = await page.locator("[data-gd-panneau]").boundingBox();
const auDessus = await page.evaluate(() => { const m = document.querySelector("[data-gd-mini-carte]").getBoundingClientRect(); return document.elementFromPoint(m.x + m.width / 2, m.y + m.height / 2)?.closest("[data-gd-mini-carte]") !== null; });
check("GEO 12 · téléphone : mini-carte au-dessus du panneau ouvert, visible et cliquable", !!miniTel && !!panneauTel && miniTel.y + miniTel.height <= panneauTel.y + 1 && auDessus, JSON.stringify({ miniTel, panneauTel }));
await page.screenshot({ path: join(OUT, "02b-telephone-mini-carte.png") });
await page.locator("body").press("Alt+m");
await page.setViewportSize({ width: 1440, height: 900 });

// --- Fournisseurs de fonds (D-GD-15) : saisis dans Paramètres, MapTiler par défaut, proposés par GeoData ---
const ctxFonds = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const pf = await ctxFonds.newPage();
const erreursFonds = [];
pf.on("pageerror", (e) => erreursFonds.push(e.message));
// Aucune requête réelle vers le fournisseur : ses tuiles sont refusées ici, comme une clé invalide.
await pf.route("https://api.maptiler.com/**", (r) => r.fulfill({ status: 403, body: "" }));
await pf.route("https://tuiles.example.org/**", (r) => r.fulfill({ status: 403, body: "" }));
await connecter(pf, alice);
await pf.goto(`${BASE}/parametres`);
const sectionFonds = pf.locator("[data-settings-fournisseurs]");
await sectionFonds.waitFor();
check("Paramètres : fournisseurs de fonds, MapTiler intégré et par défaut", (await pf.locator("[data-fournisseur-defaut='maptiler']").isChecked()) && ((await sectionFonds.textContent()) ?? "").includes("clé MapTiler absente"));
await pf.goto(`${BASE}/geodata`);
await pf.locator("[data-gd-fond]").waitFor();
check("GeoData sans clé MapTiler : fond neutre, MapTiler signalé « clé absente » (aucun fond inventé)", (await pf.locator("[data-gd-fond]").inputValue()) === "neutre" && (await pf.locator("[data-gd-fond] option[disabled]").filter({ hasText: "clé absente" }).count()) === 1);
await pf.goto(`${BASE}/parametres`);
await pf.fill("#settings-maptiler-key", "cle-recette-geodata");
await pf.locator("#settings-maptiler-key").press("Enter");
await pf.locator("[data-fournisseur-ajouter]").click();
await pf.locator("[data-fournisseur-nom]").fill("Fournisseur recette");
await pf.locator("[data-fournisseur-modele]").fill("http://tuiles.example.org/{z}/{x}/{y}.png");
await pf.locator("[data-fournisseur-attribution]").fill("© Recette");
await pf.locator("[data-fournisseur-enregistrer]").click();
check("Paramètres : adresse de tuiles non https refusée", ((await pf.locator(".settings-erreurs").textContent()) ?? "").includes("https"));
await pf.locator("[data-fournisseur-modele]").fill("https://tuiles.example.org/{z}/{x}/{y}.png?k={cle}");
await pf.locator("[data-fournisseur-cle]").fill("cle-xyz");
await pf.locator("[data-fournisseur-enregistrer]").click();
await pf.locator("[data-fournisseur='fournisseur-recette']").waitFor();
await pf.locator("[data-fournisseur-modifier='fournisseur-recette']").click();
await pf.locator("[data-fournisseur-nom]").fill("Fournisseur recette modifié");
await pf.locator("[data-fournisseur-enregistrer]").click();
check("Paramètres : fournisseur saisi puis modifié", ((await pf.locator("[data-fournisseur='fournisseur-recette']").textContent()) ?? "").includes("Fournisseur recette modifié"));
const stockage = await pf.evaluate(() => localStorage.getItem("fadi.fournisseurs-carte.v1") ?? "");
await pf.goto(`${BASE}/geodata`);
await pf.locator("[data-gd-fond]").waitFor();
// Les fournisseurs saisis sont relus après le montage : attendre leur option avant de lire la liste (sans changer le critère).
await pf.locator("[data-gd-fond] option", { hasText: "Fournisseur recette modifié" }).waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
const optionsFond = await pf.locator("[data-gd-fond] option:not([disabled])").allTextContents();
check("GeoData : fonds MapTiler et fournisseur saisi proposés ; nouvelle carte sur le fond MapTiler par défaut", optionsFond.includes("MapTiler — Satellite") && optionsFond.includes("Fournisseur recette modifié") && (await pf.locator("[data-gd-fond]").inputValue()) === "navigateur:maptiler:satellite", optionsFond.join(" | "));
await pf.locator("[data-gd-avis-fond]").waitFor({ timeout: 15_000 });
check("GeoData : tuiles du fond refusées → avis non bloquant, outils de la carte disponibles", (await pf.locator("[data-gd-erreur-carte]").count()) === 0 && !(await pf.locator("[data-gd-barre-outil='zoom-plus']").isDisabled()));
await pf.locator("[data-gd-avis-fond] button").filter({ hasText: "Fond neutre" }).click();
check("GeoData : retour au fond neutre en un geste", (await pf.locator("[data-gd-fond]").inputValue()) === "neutre");
const appelsApi = [];
pf.on("request", (r) => { if (r.url().startsWith(`${BASE}/geodata/api`) && /cle-recette-geodata|cle-xyz/.test(`${r.url()} ${r.postData() ?? ""}`)) appelsApi.push(r.url()); });
await pf.locator("[data-gd-fond]").selectOption("navigateur:fournisseur-recette:fond");
await volet(pf, "cartes");
await pf.locator("[data-gd-nom-carte]").fill(`Fond fournisseur ${suffixe}`);
await pf.locator("[data-gd-enregistrer-sous]").click();
await pf.locator("[data-gd-etat-enregistrement='enregistree']").waitFor();
check("carte enregistrée sur un fond de fournisseur : ni adresse ni clé envoyées à l'API Fadi", appelsApi.length === 0 && !stockage.includes("cle-recette-geodata"), appelsApi.join(", "));
await pf.goto(`${BASE}/parametres`);
await pf.locator("[data-fournisseur-supprimer='fournisseur-recette']").click();
check("Paramètres : fournisseur supprimé, MapTiler reste", (await pf.locator("[data-fournisseur='fournisseur-recette']").count()) === 0 && (await pf.locator("[data-fournisseur='maptiler']").count()) === 1);
check("fournisseurs de fonds : aucune erreur JavaScript", erreursFonds.length === 0, erreursFonds.slice(0, 3).join(" | "));
await ctxFonds.close();

// --- GEO 08 : un tiers ---
const tiers = await (await navigateur.newContext()).newPage();
await inscrire(tiers, `gd-bob-${suffixe}@example.test`);
const statutCarte = (await tiers.request.get(`${BASE}/geodata/api/cartes/${compositionAvant.id}`)).status();
const statutCouche = (await tiers.request.get(`${BASE}/geodata/api/couches/${coucheImportee.id}`)).status();
const statutFiche = (await tiers.request.get(`${BASE}${lienFiche}`)).status();
check("GEO 08 · un tiers : carte, couche privée et fiche d'export refusées (404)", statutCarte === 404 && statutCouche === 404 && statutFiche === 404, `${statutCarte}/${statutCouche}/${statutFiche}`);

// --- GEO 11 : sans WebGL ---
const sansGl = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--disable-gpu", "--disable-software-rasterizer", "--disable-webgl", "--disable-3d-apis"] });
const p2 = await (await sansGl.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await connecter(p2, alice);
await p2.goto(`${BASE}/geodata`);
await p2.locator("[data-gd-erreur-carte]").waitFor({ timeout: 20_000 });
check("GEO 11 · sans WebGL : message explicite, pas d'animation de chargement sans fin", ((await p2.locator("[data-gd-erreur-carte]").textContent()) ?? "").includes("WebGL") && (await p2.getByText("Chargement de la carte…").count()) === 0);
await p2.locator("[data-gd-recherche]").fill("Unité synthétique B");
await p2.locator("[data-gd-recherche]").press("Enter");
await p2.locator("[data-gd-resultat='002']").click();
await p2.locator("[data-gd-fiche='002']").waitFor();
check("GEO 11 · sans WebGL : recherche et fiche restent utilisables", true);
await sansGl.close();

// --- Interface anglaise : aucun résidu français hors données ---
const en = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await en.goto(`${BASE}/inscription`);
await en.locator("[data-choix-langue]").selectOption("en");
await en.waitForFunction(() => document.documentElement.lang === "en");
await en.fill('input[name="email"]', `gd-en-${suffixe}@example.test`);
await en.fill('input[name="password"]', MDP);
await en.click('button[type="submit"]');
await en.waitForURL(/\/(accueil|projets)/);
const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|carte|couche|valeur)\b/i;
const residus = new Set();
async function releve() {
  await en.waitForTimeout(800);
  for (const t of await en.evaluate(() => {
    const out = [];
    const exclu = (n) => { for (let e = n.parentElement; e; e = e.parentElement) { if (e.getAttribute("translate") === "no" || ["SCRIPT", "STYLE", "TEXTAREA", "CODE", "OPTION"].includes(e.tagName) || e.classList.contains("maplibregl-ctrl-attrib")) return true; const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") return true; } return false; };
    const w = document.createTreeWalker(document.querySelector("[data-geodata-page]"), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.replace(/\s+/g, " ").trim(); if (t.length >= 3 && !exclu(n)) out.push(t); }
    for (const e of document.querySelectorAll("[data-geodata-page] [aria-label], [data-geodata-page] [placeholder], [data-geodata-page] [title]")) for (const a of ["aria-label", "placeholder", "title"]) { const v = e.getAttribute(a); if (v && v.length >= 3) out.push(v); }
    return out;
  })) if (FR.test(t)) residus.add(t);
}
await en.goto(`${BASE}/geodata`);
await en.locator("[data-geodata-page]").waitFor();
await releve();
for (const v of ["donnees", "cartes", "etudes", "import", "export"]) { await volet(en, v); await releve(); }
await en.locator("[data-gd-menu]").click(); await releve(); await en.locator("[data-gd-menu]").click();
await onglet(en, "catalogue"); await en.locator("[data-gd-type='imagerie']").click(); await releve(); await en.locator("[data-gd-type='vecteurs']").click();
for (const o of ["couches", "legende"]) { await onglet(en, o); await releve(); }
writeFileSync(join(OUT, "residus-anglais.txt"), [...residus].join("\n"));
check("interface anglaise : aucun texte d'interface resté en français", residus.size === 0, [...residus].slice(0, 8).join(" | "));

check("aucun appel à l'API d'un projet depuis GeoData", appelsProjet.length === 0, appelsProjet.slice(0, 3).join(", "));
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await navigateur.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette GeoData : tout est conforme.");
process.exit(echecs ? 1 : 0);
