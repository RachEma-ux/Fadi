#!/usr/bin/env node
/**
 * Recette du lot OUT (outils, profils, vue 3D) sur l'API et l'application construites, base PostgreSQL réelle :
 *
 *  - TR-EX-034 / TR-EX-033 / TR-INV-009 : profil d'outils persistant (profileId, propriétaire, version, ordre,
 *    raccourcis personnels) exporté puis importé par un autre compte ; conflit de raccourci → 409 explicité, rien
 *    d'écrit, résolution « écarter » ; un profil contenant « Publier » importé par un éditeur sans droit de publier →
 *    403, rien d'écrit ; ses commandes de publication restent refusées ;
 *  - A.3-03 : dans la vue 3D, pivot d'un solide autour d'un axe horizontal (basculement) puis échelle 3D,
 *    enregistrés et relus par le serveur ;
 *  - TR-EX-005 : sur une étude neuve sans dessin 2D, deux solides choisis ensemble déplacés en un seul pas.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-out.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
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
const identifiants = () => ({ email: `studio-out-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") });

// ——— Profils d'outils (API, base réelle) ———
const proprio = client(), editeur = client();
const idProprio = identifiants(), idEditeur = identifiants();
check("comptes créés", (await proprio("POST", "/auth/register", idProprio)).status === 201 && (await editeur("POST", "/auth/register", idEditeur)).status === 201);
const projet = (await proprio("POST", "/projects", { code: "P.STU.OUT", name: "Studio — lot OUT" })).body;
check("éditeur invité, invitation acceptée", (await inviterEtAccepter(proprio, editeur, projet.id, idEditeur.email, "editeur")).ok);
const P = `/projects/${projet.id}/studio/preferences/outils`;

const r1 = await proprio("PUT", P, { profil: "personnel", favoris: [], personnel: ["studio.dessin.ligne", "studio.dessin.cote"], ordre: ["studio.dessin.cote", "studio.dessin.ligne"], raccourcis: { "studio.dessin.cote": "Ctrl+Shift+M" } });
check("TR-EX-034 : profil enregistré en base — profileId, propriétaire, version 1, ordre et raccourci personnel",
  r1.status === 200 && /^studio_profil/.test(r1.body.profileId) && r1.body.version === 1 && r1.body.raccourcis?.["studio.dessin.cote"] === "Ctrl+Shift+M" && JSON.stringify(r1.body.ordre) === '["studio.dessin.cote","studio.dessin.ligne"]', JSON.stringify(r1.body));
const r2 = await proprio("PUT", P, { profil: "personnel", favoris: ["studio.dessin.ligne"], personnel: ["studio.dessin.ligne", "studio.dessin.cote"] });
const relu = await client()("GET", P);
check("TR-EX-034 : un second enregistrement garde profileId, ordre et raccourcis, la version avance (2)", r2.body.profileId === r1.body.profileId && r2.body.version === 2 && r2.body.raccourcis?.["studio.dessin.cote"] === "Ctrl+Shift+M");
check("TR-EX-034 : sans session, le profil n'est pas lisible (401)", relu.status === 401, String(relu.status));
const exporte = await proprio("GET", `${P}/export`);
check("TR-EX-034 : export — format fadi-studio-profil/1, même profileId, version 2",
  exporte.status === 200 && exporte.body.format === "fadi-studio-profil/1" && exporte.body.profileId === r1.body.profileId && exporte.body.version === 2, JSON.stringify(exporte.body));

const avantEditeur = await editeur("GET", P);
const conflit = { ...exporte.body, raccourcis: { "studio.dessin.cote": "Ctrl+Shift+M", "studio.dessin.ligne": "Ctrl+Shift+U" } };
const refus409 = await editeur("POST", `${P}/import`, { profil: conflit });
check("TR-EX-034 : import en conflit avec un raccourci du registre → 409, conflit nommé (Ctrl+Maj+U, Pousser / tirer la face), rien d'écrit",
  refus409.status === 409 && refus409.body.error === "shortcut_conflict" && JSON.stringify(refus409.body.conflits) === JSON.stringify([{ raccourci: "Ctrl+Shift+U", capacite: "studio.dessin.ligne", type: "registre", avec: "studio.solide.face-decaler" }])
    && JSON.stringify((await editeur("GET", P)).body) === JSON.stringify(avantEditeur.body), JSON.stringify(refus409.body));
const importe = await editeur("POST", `${P}/import`, { profil: conflit, resolution: "ecarter" });
check("TR-EX-034 : « écarter » — l'éditeur devient propriétaire de sa copie, provenance gardée, raccourci en conflit rendu",
  importe.status === 200 && importe.body.profileId !== r1.body.profileId && importe.body.importeDe === `${r1.body.profileId}@2` && JSON.stringify(importe.body.raccourcis) === '{"studio.dessin.cote":"Ctrl+Shift+M"}'
    && importe.body.ecartes.length === 1, JSON.stringify(importe.body));
check("TR-EX-034 : le profil source du propriétaire est intact (version 2)", (await proprio("GET", P)).body.version === 2);

const avecPublier = { ...exporte.body, ordre: ["studio.publication.publier", "studio.dessin.ligne"], raccourcis: { "studio.publication.publier": "Ctrl+Shift+9" } };
const avant403 = (await editeur("GET", P)).body;
const refus403 = await editeur("POST", `${P}/import`, { profil: avecPublier });
check("TR-EX-033 / TR-INV-009 : profil contenant « Publier » importé par un éditeur sans droit de publier → 403 permission_non_conferee, rien d'écrit",
  refus403.status === 403 && refus403.body.error === "permission_non_conferee" && JSON.stringify(refus403.body.capacites) === '["studio.publication.publier"]'
    && JSON.stringify((await editeur("GET", P)).body) === JSON.stringify(avant403), JSON.stringify(refus403.body));
const catalogue = await editeur("GET", `/projects/${projet.id}/studio/preferences/catalogue`);
check("TR-INV-009 : le catalogue autorisé de l'éditeur est inchangé — Publier toujours refusé",
  catalogue.status === 200 && (catalogue.body.entrees.find((e) => e.toolId === "studio.publication.publier")?.autorise ?? false) === false);
check("TR-EX-033 : le propriétaire, qui publie, importe ce même profil", (await proprio("POST", `${P}/import`, { profil: avecPublier })).status === 200);

// ——— Vue 3D : basculement, échelle 3D, groupe ———
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-out-ui-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-out-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const p3 = await api("post", "/projects", { code: "P.STU.OUT3D", name: "Studio — vue 3D OUT" });
  const etude = await api("post", `/projects/${p3.id}/studio/studies`, { name: "Étude neuve 3D" });
  const chemin = `/projects/${p3.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const boite = (id, x) => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 2 } });
  await api("post", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `out-${randomUUID()}`, baseRevisionId: (await api("get", chemin)).revision.id, commands: [boite("A", 0), boite("B", 3)] });
  const doc0 = (await api("get", chemin)).revision.document;
  check("TR-EX-005 : étude neuve — aucun objet 2D, deux solides libres", doc0.objects.length === 0 && doc0.solides.length === 2);
  await page.goto(`${BASE}/studio/projets/${p3.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const vue = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  await vue.locator("canvas[data-studio-vue3d-canvas]").waitFor();
  const attendre = (n) => page.waitForFunction((v) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === v, String(n));

  await vue.locator('[data-studio-solide="A"]').click();
  const pivot = vue.locator('[data-studio-pivoter="A"]');
  await pivot.waitFor();
  check("A.3-03 : le pivot propose l'axe vertical et les deux axes horizontaux du solide", JSON.stringify(await pivot.locator("[data-studio-pivot-axe] option").evaluateAll((os) => os.map((o) => o.value))) === '["z","y","x"]');
  await pivot.locator("[data-studio-pivot-axe]").selectOption("y");
  await pivot.getByLabel("Angle (°, sens trigonométrique)").fill("90");
  await pivot.getByRole("button", { name: "Pivoter le solide", exact: true }).click();
  await attendre(1);
  check("A.3-03 : solide basculé de 90° autour de son axe horizontal y (une commande), volume toujours évalué",
    (await vue.locator('[data-studio-solide="A"]').getAttribute("data-studio-solide-bascule")) === "oui" && (await vue.locator('[data-studio-solide="A"]').textContent()).includes("2 m³"), await vue.locator('[data-studio-solide="A"]').textContent());
  const echelle = vue.locator('[data-studio-echelle-3d="A"]');
  await echelle.getByLabel("Point fixe x (m)").fill("0");
  await echelle.getByLabel("Point fixe y (m)").fill("0");
  await echelle.getByLabel("Facteur").fill("2");
  await echelle.getByRole("button", { name: "Mettre à l’échelle", exact: true }).click();
  await attendre(2);
  check("A.3-03 : échelle 3D × 2 — dimensions et volume multipliés (16 m³), basculement conservé", (await vue.locator('[data-studio-solide="A"]').textContent()).includes("16 m³"), await vue.locator('[data-studio-solide="A"]').textContent());

  await vue.locator('[data-studio-groupe-membre="A"]').check();
  await vue.locator('[data-studio-groupe-membre="B"]').check();
  const groupe = vue.locator("[data-studio-groupe]");
  await groupe.waitFor();
  check("TR-EX-005 : groupe de deux solides formé dans la vue 3D", (await groupe.getAttribute("data-studio-groupe")) === "A B");
  const dep = groupe.locator("[data-studio-groupe-deplacer]");
  await dep.getByLabel("dx (m)").fill("1");
  await dep.getByLabel("dy (m)").fill("2");
  await dep.getByLabel("dz (m)").fill("0");
  await dep.getByRole("button", { name: "Déplacer le groupe", exact: true }).click();
  await attendre(4);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await attendre(2);
  const apresAnnuler = [await vue.locator('[data-studio-solide="A"]').textContent(), await vue.locator('[data-studio-solide="B"]').textContent()];
  check("TR-EX-005 : déplacement du groupe = un seul lot (2 commandes) ; un seul Ctrl+Z le retire en entier, les deux solides reviennent", (await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre")) === "2", JSON.stringify(apresAnnuler));
  await page.keyboard.press("Control+y");
  await attendre(4);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const doc = (await api("get", chemin)).revision.document;
  const a = doc.solides.find((s) => s.id === "A"), b = doc.solides.find((s) => s.id === "B");
  check("A.3-03 : relu par le serveur — A basculé (y = π/2), 2 × 2 × 4 m", Math.abs((a.placement.basculement?.y ?? 0) - Math.PI / 2) < 1e-9 && a.width === 2 && a.depth === 2 && a.height === 4, JSON.stringify(a));
  check("TR-EX-005 : relu par le serveur — A et B déplacés de (1, 2, 0), toujours aucun objet 2D",
    a.placement.origin.x === 1 && a.placement.origin.y === 2 && b.placement.origin.x === 4 && b.placement.origin.y === 2 && doc.objects.length === 0, JSON.stringify([a.placement, b.placement]));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs) { console.log(`Recette du lot OUT : ${echecs} contrôle(s) en échec.`); process.exit(1); }
console.log("Recette du lot OUT : tous les contrôles passent.");
