#!/usr/bin/env node
/**
 * Recette du catalogue d'outils Studio (#166, lot B : B.1-06, B.2-01, B.2-02, B.2-05, B.2-06, B.2-07, B.2-08) sur
 * l'API réelle et l'application construite (base migrée : colonnes `groups`, `manifest_version` de
 * studio_tool_preferences).
 *
 *  - API : catalogue autorisé (`GET …/studio/preferences/catalogue`) — droit réel du serveur par outil, propriétaire et
 *    lecteur ; regroupements personnels (aller-retour, refus d'un outil hors registre, PUT sans `groupes` qui les
 *    garde) ; version du manifeste ; profil d'équipe refusé (option non implémentée) ; changement de profil sans effet
 *    sur la révision, le document ni les droits.
 *  - Navigateur (propriétaire) : filtres du gestionnaire « Outils » (contexte Vue 3D, nature, favoris), regroupement
 *    créé, composé et filtré, relu après actualisation.
 *  - Navigateur (lecteur) : un outil visible dans les barres mais non autorisé est désactivé avec sa raison ; le
 *    gestionnaire et la palette disent pourquoi ; « Autorisés pour moi seulement » ne garde que les lectures.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-catalogue.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`✓ ${label}`);
  else { failures += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}
function client() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
}
const credentials = () => ({ email: `studio-catalogue-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") });

const owner = client(), reader = client();
const ownerCredentials = credentials(), readerCredentials = credentials();
check("comptes créés", (await owner("POST", "/auth/register", ownerCredentials)).status === 201 && (await reader("POST", "/auth/register", readerCredentials)).status === 201);
const project = await owner("POST", "/projects", { code: "P.STU.CATALOGUE", name: "Studio — catalogue d'outils" });
const projectId = project.body.id;
check("lecteur invité, invitation acceptée (phase 3)", (await inviterEtAccepter(owner, reader, projectId, readerCredentials.email, "lecteur")).ok);
const study = await owner("POST", `/projects/${projectId}/studio/studies`, { name: "Catalogue" });
check("étude créée", study.status === 201, String(study.status));
const variantPath = `/projects/${projectId}/studio/studies/${study.body.study.id}/variants/${study.body.variant.id}`;
const pagePath = `/studio/projets/${projectId}/etudes/${study.body.study.id}/variantes/${study.body.variant.id}`;
const prefsPath = `/projects/${projectId}/studio/preferences/outils`;
const cataloguePath = `/projects/${projectId}/studio/preferences/catalogue`;

// Catalogue autorisé : droit réel du serveur, outil par outil.
const catProprio = await owner("GET", cataloguePath);
check("catalogue autorisé (propriétaire) : manifeste versionné, tout est autorisé",
  catProprio.status === 200 && catProprio.body.manifeste === "studio-tool-manifest/1" && catProprio.body.droits.ecriture === true && catProprio.body.entrees.length > 30 && catProprio.body.entrees.every((e) => e.autorise), JSON.stringify(catProprio.body?.droits));
const catLecteur = await reader("GET", cataloguePath);
const autorisesLecteur = (catLecteur.body?.entrees ?? []).filter((e) => e.autorise).map((e) => e.toolId);
check("catalogue autorisé (lecteur) : seules les lectures, motif « role »",
  catLecteur.status === 200 && catLecteur.body.role === "lecteur" && catLecteur.body.droits.motif === "role" && JSON.stringify(autorisesLecteur) === '["studio.dessin.selection","studio.scene.rappeler"]', JSON.stringify(catLecteur.body?.droits));
check("catalogue autorisé : non connecté refusé", [401, 403].includes((await client()("GET", cataloguePath)).status));

// Regroupements personnels.
const groupes = [{ id: "murs", nom: "Murs et ouvertures", outils: ["studio.architecture.mur", "studio.architecture.ouverture"] }];
const ecrit = await owner("PUT", prefsPath, { profil: "standard", favoris: [], personnel: [], groupes });
check("PUT : regroupement enregistré, manifeste rendu", ecrit.status === 200 && JSON.stringify(ecrit.body.groupes) === JSON.stringify(groupes) && ecrit.body.manifeste === "studio-tool-manifest/1", JSON.stringify(ecrit.body));
const sansGroupes = await owner("PUT", prefsPath, { profil: "standard", favoris: ["studio.dessin.cote"], personnel: [] });
check("PUT sans « groupes » (client antérieur) : regroupements gardés", sansGroupes.status === 200 && JSON.stringify(sansGroupes.body.groupes) === JSON.stringify(groupes));
const horsRegistre = await owner("PUT", prefsPath, { profil: "standard", favoris: [], personnel: [], groupes: [{ id: "x", nom: "X", outils: ["studio.outil.inexistant"] }] });
check("regroupement citant un outil hors registre : 400 unknown_tool", horsRegistre.status === 400 && horsRegistre.body.error === "unknown_tool");
check("profil d'équipe : refusé (option non implémentée)", (await owner("PUT", prefsPath, { profil: "equipe:atelier", favoris: [], personnel: [] })).status === 400
  && (await owner("PUT", prefsPath, { profil: "standard", favoris: [], personnel: [], equipe: "atelier" })).status === 400);
check("GET : regroupement relu", JSON.stringify((await owner("GET", prefsPath)).body.groupes) === JSON.stringify(groupes));

// B.2-07 : profil, favoris et regroupements ne touchent ni la révision, ni le document, ni les droits.
const avant = await owner("GET", variantPath);
for (const profil of ["metier:cotation", "personnel", "metier:volume", "standard"]) await reader("PUT", prefsPath, { profil, favoris: ["studio.dessin.ligne"], personnel: ["studio.dessin.ligne"], groupes });
const apres = await owner("GET", variantPath);
check("changements de profil : tête de révision et document inchangés", apres.body.variant.headRevisionId === avant.body.variant.headRevisionId && JSON.stringify(apres.body.revision.document) === JSON.stringify(avant.body.revision.document));
check("changements de profil : droits du lecteur inchangés", JSON.stringify((await reader("GET", cataloguePath)).body.entrees) === JSON.stringify(catLecteur.body.entrees));
const commande = await reader("POST", `${variantPath}/commands`, { contractVersion: "studio-commands/1", requestId: `catalogue-${randomUUID()}`, baseRevisionId: avant.body.revision.id, commands: [{ toolId: "studio.dessin.ligne", params: { id: "l-1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] });
check("lecteur : outil favori, dans son profil et son regroupement, toujours refusé (403)", commande.status === 403, String(commande.status));
await owner("PUT", prefsPath, { profil: "standard", favoris: [], personnel: [], groupes: [] });
await reader("PUT", prefsPath, { profil: "standard", favoris: [], personnel: [], groupes: [] });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
async function ouvrir(creds) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  const login = await context.request.post(`${BASE}/auth/login`, { data: creds, headers: { origin: BASE } });
  check("navigateur : connexion", login.ok(), String(login.status()));
  await page.goto(`${BASE}${pagePath}`);
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  await outils.waitFor();
  const ouvrirGestionnaire = async () => {
    await page.getByRole("toolbar", { name: "Actions de l’espace" }).getByRole("button", { name: "Outils", exact: true }).click();
    const g = page.locator("[data-studio-gestionnaire-outils]");
    await g.waitFor();
    await g.locator('[data-studio-preferences-etat="pret"]').waitFor();
    return g;
  };
  const fermer = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
    await page.locator("[data-studio-gestionnaire-outils], [data-studio-palette]").first().waitFor({ state: "detached" });
  };
  return { context, page, outils, ouvrirGestionnaire, fermer };
}
const enregistre = (page) => page.waitForResponse((r) => r.request().method() === "PUT" && new URL(r.url()).pathname === prefsPath);
const ids = async (g) => g.locator("[data-studio-catalogue-entree]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-catalogue-entree")));

try {
  // Propriétaire : filtres et regroupements.
  const p = await ouvrir(ownerCredentials);
  let g = await p.ouvrirGestionnaire();
  check("gestionnaire : manifeste affiché", (await g.getAttribute("data-studio-manifeste")) === "studio-tool-manifest/1");
  const total = Number(await g.locator("[data-studio-nombre-entrees]").getAttribute("data-studio-nombre-entrees"));
  await g.locator('[data-studio-filtre="contexte"]').selectOption("vue-3d");
  const v3d = await ids(g);
  check("filtre contexte Vue 3D : volume libre et scènes, sans la Ligne", v3d.includes("studio.solide.boite") && v3d.includes("studio.scene.creer") && !v3d.includes("studio.dessin.ligne") && v3d.length < total, `${v3d.length}/${total}`);
  await g.locator('[data-studio-filtre="nature"]').selectOption("lecture");
  check("filtres combinés (Vue 3D + Lecture) : Sélection et Rappeler la scène", JSON.stringify(await ids(g)) === '["studio.dessin.selection","studio.scene.rappeler"]', JSON.stringify(await ids(g)));
  await g.locator('[data-studio-filtre="contexte"]').selectOption("");
  await g.locator('[data-studio-filtre="nature"]').selectOption("");
  check("filtres retirés : catalogue entier", Number(await g.locator("[data-studio-nombre-entrees]").getAttribute("data-studio-nombre-entrees")) === total);
  const fav = enregistre(p.page);
  await g.locator('[data-studio-favori="studio.dessin.arc"]').click();
  await fav;
  await g.locator('[data-studio-filtre="favoris"]').check();
  check("filtre « Favoris seulement » : l'Arc seul", JSON.stringify(await ids(g)) === '["studio.dessin.arc"]', JSON.stringify(await ids(g)));
  await g.locator('[data-studio-filtre="favoris"]').uncheck();

  await g.locator("[data-studio-nom-groupe]").fill("Murs");
  const cree = enregistre(p.page);
  await g.locator("[data-studio-creer-groupe]").click();
  check("regroupement créé et enregistré sur le serveur", (await cree).status() === 200 && (await g.locator('[data-studio-groupe="murs"]').count()) === 1);
  await g.locator("[data-studio-nom-groupe]").fill("murs");
  check("nom déjà pris : création refusée avec sa raison", (await g.locator("[data-studio-creer-groupe]").isDisabled()) && (await g.locator('[data-studio-refus-groupe="pris"]').count()) === 1);
  await g.locator("[data-studio-nom-groupe]").fill("");
  await g.locator('[data-studio-composer-groupe="murs"]').click();
  for (const id of ["studio.architecture.mur", "studio.architecture.ouverture"]) {
    const r = enregistre(p.page);
    await g.locator(`[data-studio-groupe-membre="${id}"]`).check();
    await r;
  }
  check("regroupement composé : deux outils", (await g.locator('[data-studio-groupe="murs"] [data-studio-groupe-taille]').getAttribute("data-studio-groupe-taille")) === "2");
  await g.locator('[data-studio-composer-groupe="murs"]').click();
  await g.locator('[data-studio-filtre="groupe"]').selectOption("murs");
  check("filtre par regroupement : Mur et Ouverture", JSON.stringify(await ids(g)) === '["studio.architecture.mur","studio.architecture.ouverture"]', JSON.stringify(await ids(g)));
  const barresAvant = await p.outils.locator("[data-studio-outil]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-outil")));
  await p.fermer();
  const barresApres = await p.outils.locator("[data-studio-outil]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-outil")));
  check("regroupements : les barres ne changent pas", JSON.stringify(barresAvant) === JSON.stringify(barresApres));
  const relu = (await owner("GET", prefsPath)).body;
  check("API : regroupement relu du serveur", JSON.stringify(relu.groupes) === '[{"id":"murs","nom":"Murs","outils":["studio.architecture.mur","studio.architecture.ouverture"]}]', JSON.stringify(relu.groupes));
  await p.page.reload();
  await p.outils.waitFor();
  g = await p.ouvrirGestionnaire();
  check("actualisation : regroupement relu", (await g.locator('[data-studio-groupe="murs"] [data-studio-groupe-taille]').getAttribute("data-studio-groupe-taille")) === "2");
  const suppr = enregistre(p.page);
  await g.locator('[data-studio-supprimer-groupe="murs"]').click();
  await suppr;
  check("regroupement supprimé", (await g.locator('[data-studio-groupe="murs"]').count()) === 0 && (await owner("GET", prefsPath)).body.groupes.length === 0);
  check("propriétaire : la Ligne est autorisée", (await g.locator('[data-studio-catalogue-entree="studio.dessin.ligne"]').getAttribute("data-studio-autorise")) === "oui");
  await p.fermer();
  await p.context.close();

  // Lecteur : visible mais non autorisé → désactivé avec sa raison.
  const l = await ouvrir(readerCredentials);
  const ligne = l.outils.locator('[data-studio-outil="studio.dessin.ligne"]');
  await l.page.locator('[data-studio-raison="droit-role"]').first().waitFor();
  check("lecteur : la Ligne reste dans la barre, désactivée, raison « rôle »",
    (await ligne.count()) === 1 && (await ligne.isDisabled()) && (await ligne.getAttribute("data-studio-raison")) === "droit-role" && (await ligne.getAttribute("title")).includes("votre rôle sur ce projet ne permet pas de modifier"));
  check("lecteur : la Sélection reste active, sans raison", !(await l.outils.locator('[data-studio-outil="studio.dessin.selection"]').isDisabled()) && (await l.outils.locator('[data-studio-outil="studio.dessin.selection"]').getAttribute("data-studio-raison")) === null);
  const gl = await l.ouvrirGestionnaire();
  const entree = gl.locator('[data-studio-catalogue-entree="studio.dessin.ligne"]');
  check("lecteur : le gestionnaire dit pourquoi", (await entree.getAttribute("data-studio-autorise")) === "non" && (await entree.locator("[data-studio-disponibilite]").textContent()).startsWith("Non autorisé"));
  await gl.locator('[data-studio-filtre="barre"]').selectOption("dessin");
  await gl.locator('[data-studio-filtre="executables"]').check();
  check("lecteur : « Autorisés pour moi » dans Dessin → Sélection seule", JSON.stringify(await ids(gl)) === '["studio.dessin.selection"]', JSON.stringify(await ids(gl)));
  await l.fermer();
  await l.page.evaluate(() => document.activeElement?.blur());
  await l.page.keyboard.press("Control+k");
  const palette = l.page.locator("[data-studio-palette]");
  await palette.waitFor();
  check("lecteur : la palette dit pourquoi", (await palette.locator('[data-studio-palette-entree="studio.dessin.ligne"]').getAttribute("data-studio-raison")) === "droit-role");
  await l.page.keyboard.press("Escape");
  await l.context.close();
  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
await owner("PUT", prefsPath, { profil: "standard", favoris: [], personnel: [], groupes: [] });
if (failures) { console.log(`Recette du catalogue d'outils Studio : ${failures} échec(s).`); process.exit(1); }
console.log("Recette du catalogue d'outils Studio : réussie.");
