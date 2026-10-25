#!/usr/bin/env node
/**
 * Recette des profils et favoris d'outils Studio (#166, B.2-02, B.2-04, B.2-05, B.2-06, B.2-07) sur l'API réelle et
 * l'application construite (même origine, base migrée : table studio_tool_preferences dans init.sql).
 *
 *  - API : préférences par défaut (Standard, aucun favori), aller-retour PUT → GET, outil hors registre refusé
 *    (400 unknown_tool) sans rien écrire, forme invalide refusée, préférences propres au compte (un autre compte ne
 *    les voit pas), projet non partagé refusé (404), lecteur : règle ses barres mais ses commandes restent refusées
 *    (403), le changement de profil ne touche ni la tête de révision ni le document.
 *  - Navigateur : étoile du gestionnaire « Outils » enregistrée sur le serveur et relue après actualisation, groupe
 *    « Favoris » en tête de la palette, mention « raccourci actif » des outils masqués des barres.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-profils.mjs
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
const credentials = () => ({ email: `studio-profils-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") });

const owner = client(), other = client(), reader = client();
const ownerCredentials = credentials(), readerCredentials = credentials();
check("comptes créés", (await owner("POST", "/auth/register", ownerCredentials)).status === 201
  && (await other("POST", "/auth/register", credentials())).status === 201 && (await reader("POST", "/auth/register", readerCredentials)).status === 201);
const project = await owner("POST", "/projects", { code: "P.STU.PROFILS", name: "Studio — profils d'outils" });
const otherProject = await other("POST", "/projects", { code: "P.STU.AUTRE", name: "Studio — autre compte" });
const projectId = project.body.id;
check("lecteur invité, invitation acceptée (phase 3)", (await inviterEtAccepter(owner, reader, projectId, readerCredentials.email, "lecteur")).ok);
const study = await owner("POST", `/projects/${projectId}/studio/studies`, { name: "Profils" });
check("étude créée", study.status === 201, String(study.status));
const variantPath = `/projects/${projectId}/studio/studies/${study.body.study.id}/variants/${study.body.variant.id}`;
const prefsPath = (p = projectId) => `/projects/${p}/studio/preferences/outils`;

// Défaut, aller-retour, refus.
const initial = await owner("GET", prefsPath());
check("GET : défaut Standard, aucun favori, rien d'enregistré", initial.status === 200 && initial.body.profil === "standard" && initial.body.favoris.length === 0 && initial.body.updatedAt === null, JSON.stringify(initial.body));
const choix = { profil: "metier:cotation", favoris: ["studio.dessin.cote", "studio.dessin.ligne"], personnel: ["studio.dessin.arc"] };
const ecrit = await owner("PUT", prefsPath(), choix);
check("PUT : préférences enregistrées", ecrit.status === 200 && ecrit.body.profil === "metier:cotation" && typeof ecrit.body.updatedAt === "string", JSON.stringify(ecrit.body));
const relu = await owner("GET", prefsPath());
check("aller-retour : GET relit exactement ce qui a été enregistré", relu.status === 200 && relu.body.profil === choix.profil && JSON.stringify(relu.body.favoris) === JSON.stringify(choix.favoris) && JSON.stringify(relu.body.personnel) === JSON.stringify(choix.personnel));
const inconnu = await owner("PUT", prefsPath(), { profil: "standard", favoris: ["studio.dessin.ligne", "studio.outil.inexistant"], personnel: [] });
check("outil hors registre : 400 unknown_tool, outil nommé", inconnu.status === 400 && inconnu.body.error === "unknown_tool" && JSON.stringify(inconnu.body.tools) === '["studio.outil.inexistant"]', JSON.stringify(inconnu.body));
check("outil hors registre : rien n'est écrit", JSON.stringify((await owner("GET", prefsPath())).body.favoris) === JSON.stringify(choix.favoris));
for (const [nom, corps] of [["profil inconnu", { profil: "equipe", favoris: [], personnel: [] }], ["doublon", { profil: "standard", favoris: ["studio.dessin.cote", "studio.dessin.cote"], personnel: [] }], ["champ en trop", { ...choix, droits: "modify" }]]) {
  check(`forme invalide (${nom}) : 400`, (await owner("PUT", prefsPath(), corps)).status === 400);
}
// Propres au compte, mêmes dans tous ses projets.
const autre = await other("GET", prefsPath(otherProject.body.id));
check("un autre compte ne voit pas ces préférences", autre.status === 200 && autre.body.profil === "standard" && autre.body.favoris.length === 0);
check("projet non partagé : 404", (await other("GET", prefsPath())).status === 404 && (await other("PUT", prefsPath(), choix)).status === 404);
check("non connecté : refusé", [401, 403].includes((await client()("GET", prefsPath())).status));
// Visibilité ≠ droit : le lecteur règle ses barres ; ses commandes restent refusées par le serveur.
const avant = await owner("GET", variantPath);
check("lecteur : règle ses propres barres", (await reader("PUT", prefsPath(), { profil: "standard", favoris: ["studio.objet.extruder"], personnel: [] })).status === 200);
const commande = await reader("POST", `${variantPath}/commands`, { contractVersion: "studio-commands/1", requestId: `profils-${randomUUID()}`, baseRevisionId: avant.body.revision.id, commands: [{ toolId: "studio.dessin.ligne", params: { id: "l-1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] });
check("lecteur : un outil favori ne donne aucun droit (commande 403)", commande.status === 403, String(commande.status));
check("le propriétaire garde ses préférences (indépendantes du lecteur)", (await owner("GET", prefsPath())).body.favoris.includes("studio.dessin.cote"));
const apres = await owner("GET", variantPath);
check("changer de profil ne touche ni la révision ni le document", apres.body.variant.headRevisionId === avant.body.variant.headRevisionId && JSON.stringify(apres.body.revision.document) === JSON.stringify(avant.body.revision.document));
check("remise à Standard sans favori", (await owner("PUT", prefsPath(), { profil: "standard", favoris: [], personnel: [] })).status === 200);

// Navigateur : étoile du gestionnaire, relue après actualisation ; groupe « Favoris » de la palette.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  const login = await context.request.post(`${BASE}/auth/login`, { data: ownerCredentials, headers: { origin: BASE } });
  check("navigateur : connexion du propriétaire", login.ok(), String(login.status()));
  await page.goto(`${BASE}/studio/projets/${projectId}/etudes/${study.body.study.id}/variantes/${study.body.variant.id}`);
  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  await outils.waitFor();
  const ouvrirGestionnaire = async () => {
    await page.getByRole("toolbar", { name: "Actions de l’espace" }).getByRole("button", { name: "Outils", exact: true }).click();
    const g = page.locator("[data-studio-gestionnaire-outils]");
    await g.waitFor();
    await g.locator('[data-studio-preferences-etat="pret"]').waitFor();
    return g;
  };
  let gestionnaire = await ouvrirGestionnaire();
  const etoile = () => gestionnaire.locator('[data-studio-favori="studio.dessin.ligne"]');
  check("gestionnaire : étoile non cochée au départ", (await etoile().getAttribute("aria-pressed")) === "false");
  const enregistrement = page.waitForResponse((r) => r.request().method() === "PUT" && new URL(r.url()).pathname === prefsPath());
  await etoile().click();
  check("gestionnaire : l'étoile enregistre sur le serveur", (await enregistrement).status() === 200);
  check("gestionnaire : l'étoile est cochée", (await etoile().getAttribute("aria-pressed")) === "true");
  check("API : le favori est relu du serveur", JSON.stringify((await owner("GET", prefsPath())).body.favoris) === '["studio.dessin.ligne"]');
  // Profil Cotation : Ligne masquée des barres, toujours au catalogue, raccourci annoncé actif.
  const profil = page.waitForResponse((r) => r.request().method() === "PUT" && new URL(r.url()).pathname === prefsPath());
  await gestionnaire.locator("[data-studio-choix-profil]").selectOption("metier:cotation");
  await profil;
  check("profil Cotation : Ligne masquée des barres, raccourci actif, toujours au catalogue",
    (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.ligne"] [data-studio-barres="masque"]').count()) === 1
    && (await gestionnaire.locator('[data-studio-catalogue-entree="studio.dessin.cote"] [data-studio-barres="visible"]').count()) === 1);
  await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  await gestionnaire.waitFor({ state: "detached" });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("l");
  check("raccourci L : l'outil Ligne s'active même masqué par le profil", (await outils.getByRole("button", { name: "Ligne", exact: true }).getAttribute("aria-pressed")) === "true");
  await page.keyboard.press("Escape");

  await page.reload();
  await outils.waitFor();
  gestionnaire = await ouvrirGestionnaire();
  check("actualisation : étoile et profil relus du serveur", (await etoile().getAttribute("aria-pressed")) === "true" && (await gestionnaire.locator("[data-studio-choix-profil]").inputValue()) === "metier:cotation");
  await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  await gestionnaire.waitFor({ state: "detached" });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+k");
  const palette = page.locator("[data-studio-palette]");
  await palette.waitFor();
  check("palette : groupe « Favoris » en tête, Ligne en première proposition",
    (await palette.locator('[data-studio-palette-groupe="favoris"] [role="option"]').first().getAttribute("data-studio-palette-entree")) === "studio.dessin.ligne"
    && (await palette.locator('[role="option"]').first().getAttribute("data-studio-palette-entree")) === "studio.dessin.ligne");
  check("palette : aucune entrée retirée par le profil", (await palette.locator('[data-studio-palette-entree="studio.objet.extruder"]').count()) === 1);
  await page.keyboard.press("Escape");

  // TEST-016 : Studio ouvert avec un profil personnel de vingt outils (même profil que studio-mesures-chargement.mjs) —
  // aucun moteur rare initialisé d'office (rendu 3D, calcul), three.js ni vue 3D demandés ; ressources relevées sans
  // seuil ni verdict (DEC-13).
  const VINGT = [
    "studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne",
    "studio.dessin.cote", "studio.dessin.cote-angulaire", "studio.dessin.texte", "studio.dessin.deplacer", "studio.dessin.copier", "studio.dessin.rotation",
    "studio.dessin.symetrie", "studio.dessin.echelle", "studio.dessin.modifier", "studio.dessin.decaler", "studio.architecture.mur", "studio.architecture.ouverture",
    "studio.dessin.supprimer", "studio.objet.calque",
  ];
  const vingt = await owner("PUT", prefsPath(), { profil: "personnel", favoris: [], personnel: VINGT });
  check("TEST-016 : profil personnel de vingt outils enregistré", vingt.status === 200 && vingt.body.profil === "personnel" && vingt.body.personnel.length === 20, JSON.stringify(vingt.body));
  const contexte20 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const p20 = await contexte20.newPage();
    p20.setDefaultTimeout(20000);
    p20.on("pageerror", (e) => erreurs.push(e.message));
    const login20 = await contexte20.request.post(`${BASE}/auth/login`, { data: ownerCredentials, headers: { origin: BASE } });
    check("TEST-016 : connexion du propriétaire (contexte neuf)", login20.ok(), String(login20.status()));
    await p20.goto(`${BASE}/studio/projets/${projectId}/etudes/${study.body.study.id}/variantes/${study.body.variant.id}`);
    await p20.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    await p20.waitForFunction(() => !!globalThis.__fadiRessources);
    const e20 = await p20.evaluate(() => Object.fromEntries(globalThis.__fadiRessources.etats().map((e) => [e.id, { ...e }])));
    check("TEST-016 : moteurs rares non initialisés à l'ouverture (rendu-3d, calcul), planche initialisée",
      !!e20["rendu-3d"] && !!e20.calcul && !e20["rendu-3d"].initialise && !e20.calcul.initialise && e20["planche-2d"]?.initialise === true,
      JSON.stringify(Object.values(e20).map((e) => [e.id, e.phase, e.initialise])));
    const carte = await p20.evaluate(async () => (await fetch("/chargement.json")).json());
    const famille = (f) => new Set(Object.entries(carte.morceaux).filter(([, m]) => m.familles.includes(f)).map(([chemin]) => chemin));
    const three = famille("three"), vue3d = famille("studio-3d");
    const scripts = await p20.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((c) => c.endsWith(".js")));
    check("TEST-016 : three.js et vue 3D repérés dans la carte du build, aucun de leurs morceaux demandé",
      three.size > 0 && vue3d.size > 0 && !scripts.some((c) => three.has(c) || vue3d.has(c)),
      JSON.stringify({ three: [...three], vue3d: [...vue3d], demandes: scripts.filter((c) => three.has(c) || vue3d.has(c)) }));
    const ressources = await p20.evaluate(() => {
      const entrees = performance.getEntriesByType("resource");
      const nav = performance.getEntriesByType("navigation")[0];
      const memoire = performance.memory;
      return {
        requetes: entrees.length,
        octetsTransferes: entrees.reduce((s, e) => s + (e.transferSize ?? 0), 0) + (nav?.transferSize ?? 0),
        octetsDecodes: entrees.reduce((s, e) => s + (e.decodedBodySize ?? 0), 0) + (nav?.decodedBodySize ?? 0),
        tasJs: memoire ? memoire.usedJSHeapSize : null,
      };
    });
    console.log(`  TEST-016 relevé (sans seuil, DEC-13) : ${JSON.stringify(ressources)}`);
    check("TEST-016 : ressources relevées (requêtes, octets transférés et décodés, tas JavaScript si exposé) — nombres finis, sans seuil",
      [ressources.requetes, ressources.octetsTransferes, ressources.octetsDecodes].every((n) => Number.isFinite(n) && n >= 0) && ressources.requetes > 0
      && (ressources.tasJs === null || (Number.isFinite(ressources.tasJs) && ressources.tasJs > 0)), JSON.stringify(ressources));
  } finally {
    await contexte20.close();
  }
  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
await owner("PUT", prefsPath(), { profil: "standard", favoris: [], personnel: [] });
if (failures) { console.log(`Recette des profils d'outils Studio : ${failures} échec(s).`); process.exit(1); }
console.log("Recette des profils d'outils Studio : réussie.");
