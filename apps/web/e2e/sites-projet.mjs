/**
 * Recette « Sites de projet » (27 novembre 2026) : la même base dédiée (`/sites/api`) sert GeoData (bouton « Sites » à
 * côté de « Thèmes ») et la Planche du Sandbox (menu « Sites » du bandeau, après Fenêtres).
 *
 * GeoData : Nouveau site de projet… depuis le centre de la carte. Planche : Ouvrir un site de projet… pose sa position
 * comme Emplacement (nord non évalué signalé) ; Sauvegarder écrit l'Emplacement dans le site ; Sauvegarder sous… le
 * copie ; Exporter le site… et Importer un site… font l'aller-retour du fichier d'échange. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 API_LOG=api.log node apps/web/e2e/sites-projet.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "atelier-captures/sites-projet";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`); if (!ok) echecs++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `sites-${Date.now()}@example.com`, "sites-projet-pass-123", BASE);
await page.waitForURL(/\/(projets|accueil)/);
const api = async (chemin) => (await page.request.get(`${BASE}/sites/api${chemin}`)).json();

// --- GeoData : bouton « Sites » à côté de « Thèmes », Nouveau site depuis le centre de la carte ----------------------
await page.goto(`${BASE}/geodata`);
const bouton = page.locator("[data-gd-sites]");
await bouton.waitFor({ timeout: 60000 });
await page.locator("[data-gd-carte], .gd-carte, canvas").first().waitFor({ timeout: 60000 }).catch(() => undefined);
await page.waitForTimeout(1500);
await bouton.click();
const articles = await page.locator("[data-gd-sites-menu] [role='menuitem']").allTextContents();
check("GeoData : six articles dans l'ordre de la maquette", JSON.stringify(articles) === JSON.stringify(["Nouveau site de projet…", "Ouvrir un site de projet…", "Sauvegarder", "Sauvegarder sous…", "Importer un site…", "Exporter le site…"]), articles.join(" | "));
check("GeoData : un séparateur après « Sauvegarder sous… »", (await page.locator("[data-gd-sites-menu] [role='separator']").count()) === 1);
check("GeoData : sans site ouvert, Sauvegarder sous et Exporter sont inactifs", (await page.locator("[data-gd-sites-article='exporter']").getAttribute("aria-disabled")) === "true" && (await page.locator("[data-gd-sites-article='sauvegarderSous']").getAttribute("aria-disabled")) === "true");
await page.screenshot({ path: `${OUT}/geodata-menu-sites.png` });
await page.locator("[data-gd-sites-article='nouveau']").click();
await page.locator("[data-sites-fenetre]").waitFor();
await page.locator("[data-sites-nom]").fill("Villa Anfa");
await page.locator("[data-sites-nature]").selectOption("construction");
await page.locator("[data-sites-lieu]").fill("Casablanca");
await page.screenshot({ path: `${OUT}/geodata-nouveau-site.png` });
await page.locator("[data-sites-valider]").click();
await page.locator("[data-sites-fenetre]").waitFor({ state: "detached" });
let liste = (await api("/sites")).sites;
check("GeoData : le site est créé dans la base dédiée", liste.length === 1 && liste[0].nom === "Villa Anfa" && liste[0].nature === "construction" && liste[0].lieu === "Casablanca", JSON.stringify(liste));
const cree = await api(`/sites/${liste[0].id}`);
check("GeoData : position = centre de la carte, déclarée avec sa source ; nord non évalué", cree.position !== null && cree.observations.geographic?.source === "Centre de la carte GeoData" && cree.observations.nord === null, JSON.stringify(cree.position));

// --- Planche : menu « Sites » après Fenêtres ------------------------------------------------------------------------
await page.goto(`${BASE}/sandbox`);
await page.locator("[data-sandbox-page] [data-planche-menus-bandeau]").waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
const titres = await page.locator("[data-planche-menu-bandeau]").evaluateAll((els) => els.map((e) => e.getAttribute("data-planche-menu-bandeau")));
check("Planche : « Sites » vient juste après Fenêtres", titres.indexOf("sites") === titres.indexOf("fenetres") + 1, titres.join(","));
const ouvrirMenu = async () => { await page.locator('[data-planche-menu-bandeau="sites"]').click(); await page.waitForTimeout(150); };
const article = (id) => page.locator(`[data-planche-menu-entree="sites-${id}"], [data-planche-menu-bandeau-entree="sites-${id}"]`).first();
await ouvrirMenu();
const libelles = await page.locator(".planche-bandeau-menu-liste .planche-bandeau-menu-libelle").allTextContents();
check("Planche : mêmes articles que GeoData", JSON.stringify(libelles) === JSON.stringify(articles), libelles.join(" | "));
await page.screenshot({ path: `${OUT}/planche-menu-sites.png` });
await page.locator(".planche-bandeau-menu-liste [role^='menuitem']", { hasText: "Ouvrir un site de projet…" }).click();
await page.locator("[data-sites-fenetre]").waitFor();
await page.locator("[data-sites-ligne]").first().click();
await page.screenshot({ path: `${OUT}/planche-ouvrir-site.png` });
await page.locator("[data-sites-ouvrir]").click();
await page.locator("[data-sites-fenetre]").waitFor({ state: "detached" });
await page.locator("[data-planche-lieu]").waitFor({ timeout: 30000 });
const valeur = async (c) => page.locator(`[data-planche-lieu-champ='${c}']`).inputValue();
const lat = Number((await valeur("latitude")).replace(",", "."));
const lon = Number((await valeur("longitude")).replace(",", "."));
check("Planche : la position du site devient l'Emplacement", Math.abs(lat - cree.position.latitude) < 1e-4 && Math.abs(lon - cree.position.longitude) < 1e-4 && (await valeur("lieu")) === "Casablanca", `${lat} ${lon}`);
const statut = (await page.locator("body").textContent()) ?? "";
check("Planche : le nord non évalué est dit, pas supposé en silence", statut.includes("nord vrai non évalué"));
await page.screenshot({ path: `${OUT}/planche-site-ouvert.png` });

// Sauvegarder : l'Emplacement (nord compris) est écrit dans le site, révision suivante.
await page.locator("[data-planche-lieu-champ='nord']").fill("12");
await page.locator("[data-planche-lieu-enregistrer], [data-planche-lieu] button[type='submit']").first().click().catch(() => undefined);
await page.waitForTimeout(300);
await ouvrirMenu();
await page.locator(".planche-bandeau-menu-liste [role^='menuitem']", { hasText: /^Sauvegarder$/ }).click();
await page.waitForTimeout(1200);
const sauve = await api(`/sites/${cree.id}`);
check("Planche : Sauvegarder écrit l'Emplacement dans le site", sauve.revision === 2 && sauve.observations.geographic?.source === "Emplacement de la Planche" && sauve.liens.some((l) => l.genre === "planche"), `révision ${sauve.revision}, nord ${JSON.stringify(sauve.observations.nord)}`);

// Sauvegarder sous… : copie sous un autre nom.
await ouvrirMenu();
await page.locator(".planche-bandeau-menu-liste [role^='menuitem']", { hasText: "Sauvegarder sous…" }).click();
await page.locator("[data-sites-nom]").fill("Villa Anfa — variante");
await page.locator("[data-sites-valider]").click();
await page.locator("[data-sites-fenetre]").waitFor({ state: "detached" });
liste = (await api("/sites")).sites;
check("Planche : Sauvegarder sous… crée une copie", liste.length === 2 && liste.some((s) => s.nom === "Villa Anfa — variante"), liste.map((s) => s.nom).join(" | "));

// Exporter puis importer : aller-retour du fichier d'échange.
await ouvrirMenu();
const [telechargement] = await Promise.all([page.waitForEvent("download"), page.locator(".planche-bandeau-menu-liste [role^='menuitem']", { hasText: "Exporter le site…" }).click()]);
const chemin = await telechargement.path();
const { readFileSync } = await import("node:fs");
const fichier = JSON.parse(readFileSync(chemin, "utf8"));
check("Exporter : fichier de site de projet", fichier.format === "fadi-site-de-projet" && fichier.fiche.nom === "Villa Anfa — variante", telechargement.suggestedFilename());
await page.locator("[data-sites-fichier]").setInputFiles({ name: "villa.site.json", mimeType: "application/json", buffer: readFileSync(chemin) });
await page.waitForTimeout(1500);
liste = (await api("/sites")).sites;
check("Importer : le fichier devient un nouveau site", liste.length === 3, liste.map((s) => s.nom).join(" | "));

// --- Parcours, étape 01 : « Enregistrer comme site de projet » (exemple P.118, parcelle en EPSG:26191) ---------------
await page.goto(`${BASE}/projets`);
await page.locator('.example-card button:has-text("Importer")').first().click();
await page.waitForURL(/\/projets\/proj_/, { timeout: 60000 });
const exemple = page.url().split("?")[0];
// L'exemple de référence est en lecture : on travaille sur sa copie modifiable (même parcelle).
const idExemple = exemple.split("/").pop();
const copie = await page.evaluate(async (id) => (await fetch(`/projects/${id}/copies`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" })).json(), idExemple);
await page.goto(`${exemple.replace(idExemple, copie.id)}?module=parcours&etape=1`);
await page.waitForFunction(() => !!document.querySelector("[data-site-projet]") || !!document.querySelector(".parcelle-tool iframe")?.contentDocument?.querySelector("[data-site-projet]"), null, { timeout: 60000 });
const dansCadre = await page.evaluate(() => !document.querySelector("[data-site-projet]"));
const slot = dansCadre ? page.frameLocator(".parcelle-tool iframe").locator("body") : page.locator("body");
const pli = slot.locator("details.h7-fold:has(> summary:has-text('Données du site, hypothèses'))").first();
// Ouvert par son résumé (le pli garde son état dans React, il ne se referme pas au rendu suivant).
await pli.evaluate((d) => { if (!d.open) d.querySelector(":scope > summary")?.click(); });
const bloc = slot.locator("[data-site-projet]");
await bloc.waitFor({ timeout: 20000 });
await bloc.locator("[data-site-projet-enregistrer]").scrollIntoViewIfNeeded();
await bloc.locator("[data-site-projet-enregistrer]").click();
await bloc.locator("[role='status'], [role='alert']").first().waitFor({ timeout: 20000 }).catch(() => undefined);
const texteBloc = (await bloc.textContent()) ?? "";
check("étape 01 : site de projet créé depuis le projet", texteBloc.includes("Site de projet créé"), texteBloc);
await bloc.screenshot({ path: `${OUT}/etape01-site-projet.png` }).catch(() => undefined);
liste = (await api("/sites")).sites;
const duProjet = await api(`/sites/${liste[0].id}`);
check("étape 01 : parcelle cadastrale, données du site et lien au projet ; position tirée du contour converti", duProjet.parcelle?.crs === "EPSG:26191" && duProjet.parcelle.vertices.length >= 3 && duProjet.position?.hypothese === false && duProjet.liens.some((l) => l.genre === "projet"), `${duProjet.parcelle?.crs} ${JSON.stringify(duProjet.position)}`);

check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette Sites de projet : tout est vert.");
process.exit(echecs ? 1 : 0);
