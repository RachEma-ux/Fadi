/**
 * Recette des compléments (après le lot 9) dans un vrai navigateur : historique d'un objet (DA-21-06), consultation
 * d'un état passé en lecture seule, réutilisation d'une partie d'un autre modèle avec aperçu (DA-21-09), référence
 * externe à la publication d'un autre projet — superposition grise, publication plus récente signalée, différences,
 * épinglage, refus d'une référence circulaire (DA-05-11) ; coupes remplies en 3D ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-complements.mjs
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CONTRAT = "atelier-commands/1";
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));
page.on("dialog", (d) => void d.accept());

async function axe(nom, selecteur) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  }, selecteur);
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
const api = async (methode, chemin, data) => {
  const r = await page.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const modele = async (pid) => (await api("get", `/projects/${pid}/atelier/model`)).body;
const lot = (pid, requestId, baseRevision, commands) => api("post", `/projects/${pid}/atelier/commands`, { requestId, baseRevision, contract: CONTRAT, label: requestId, commands });
const attendreEnregistre = () => page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const ouvrir = async (pid, avecObjets = true) => {
  await page.goto(`${BASE}/projets/${pid}?module=atelier`);
  await page.waitForSelector(avecObjets ? ".plan2d .plan-objets [data-objet]" : ".plan2d", { timeout: 30000 });
  await attendreEnregistre();
};
const m = (value) => ({ value, unit: "m" });
const selectionner = async (id) => {
  await page.locator(".nav-filtre").fill(id);
  await page.locator(`.nav-objets button[data-objet="${id}"]`).click();
};

const email = `complements-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "complements-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · compléments" })).body.id;
const voisin = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · voisin" })).body.id;

// 1. Historique d'un objet.
const depart = await modele(pid);
const murA = Object.values(depart.modele.objets).find((o) => o.classe === "mur");
check("modification d'un mur (épaisseur)", (await lot(pid, `h-${Date.now()}`, depart.revision, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.37) } } }])).status === 200);
await ouvrir(pid);
await selectionner(murA.id);
await page.locator(".inspecteur-historique summary").click();
await page.waitForSelector('.inspecteur-historique [data-historique="modifie"]', { timeout: 15000 }).catch(() => {});
const histo = (await page.locator(".inspecteur-historique").textContent()) ?? "";
check("historique de l'objet : la modification est listée avec son auteur et sa révision", (await page.locator('.inspecteur-historique [data-historique="modifie"]').count()) >= 1 && histo.includes(email), histo.slice(0, 200));
await axe("historique d'un objet", ".inspecteur-historique");

// Composition de la paroi (D-026) : deux couches sur le type du mur, somme = épaisseur (370 mm) → couches dessinées.
await page.locator(".inspecteur-composition > summary").click();
await page.locator("[data-couche-ajouter]").click();
await page.locator("[data-couche-ajouter]").click();
await page.locator('[data-couche-materiau="0"]').fill("Béton");
await page.locator('[data-couche-epaisseur="0"]').fill("200");
await page.locator('[data-couche-materiau="1"]').fill("Isolant");
await page.locator('[data-couche-epaisseur="1"]').fill("170");
await page.locator("[data-couche-enregistrer]").click();
await page.waitForSelector('.inspecteur-composition[data-composition="coherente"]', { timeout: 15000 }).catch(() => {});
await attendreEnregistre();
await page.waitForSelector(`.plan2d [data-objet="${murA.id}"] .mur-couche`, { timeout: 15000 }).catch(() => {});
const typeMur = (await modele(pid)).modele.definitions[murA.definitionId];
check("composition du type : couches enregistrées, cohérentes avec l'épaisseur, dessinées dans le mur", typeMur?.params?.couches?.length === 2 && (await page.locator('.inspecteur-composition[data-composition="coherente"]').count()) === 1 && (await page.locator(`.plan2d [data-objet="${murA.id}"] .mur-couche`).count()) >= 1, `${JSON.stringify(typeMur?.params?.couches ?? null).slice(0, 160)} · ${murA.definitionId} · ${await page.locator(".inspecteur-composition").getAttribute("data-composition").catch(() => "?")} · ${((await page.locator(".inspecteur-composition").textContent().catch(() => "")) ?? "").slice(0, 200)} · ${((await page.locator(".etat-aide, .etat-erreur").first().textContent().catch(() => "")) ?? "").slice(0, 150)}`);

// 2. Consulter un état passé (lecture seule), puis revenir.
await page.locator('select[aria-label="Niveau d\'affichage des outils"]').selectOption("complet");
await page.locator(".mod-journal summary").click();
const bouton = page.locator("[data-consulter-revision]").first();
const revPassee = Number(await bouton.getAttribute("data-consulter-revision").catch(() => "NaN"));
await bouton.click().catch(() => {});
await page.waitForSelector(".barre-consultation", { timeout: 15000 }).catch(() => {});
check("consultation d'une révision passée : bandeau « lecture seule », barre d'enregistrement masquée", (await page.locator(".barre-consultation").count()) === 1 && (await page.locator(".barre-sync").isHidden()), `révision ${revPassee}`);
await selectionner(murA.id);
const champEpaisseur = page.locator(".inspecteur input:enabled");
check("consultation : l'inspecteur n'offre aucun champ modifiable", (await champEpaisseur.count()) === 0);
await page.locator('.barre-consultation button:has-text("Revenir")').click();
check("retour à l'état courant", (await page.locator(".barre-consultation").count()) === 0 && (await page.locator(".barre-sync").isVisible()));

// Lasso (Alt + glisser avec l'outil Sélection) : un contour libre autour de tout le plan sélectionne le niveau entier.
await page.keyboard.press("Escape");
const zone = await page.locator(".plan2d").boundingBox();
const cx = zone.x + zone.width / 2;
const cy = zone.y + zone.height / 2;
const rx = zone.width / 2 - 8;
const ry = zone.height / 2 - 8;
await page.keyboard.down("Alt");
await page.mouse.move(cx + rx, cy);
await page.mouse.down();
for (let k = 1; k <= 36; k++) await page.mouse.move(cx + rx * Math.cos((k * Math.PI) / 18), cy + ry * Math.sin((k * Math.PI) / 18));
await page.mouse.up();
await page.keyboard.up("Alt");
const aideLasso = (await page.locator(".etat-aide").textContent()) ?? "";
check("lasso : les objets entièrement entourés sont sélectionnés", /objet\(s\) sélectionné\(s\) au lasso/.test(aideLasso) && /objets$/.test((await page.locator(".etat-selection").textContent()) ?? ""), aideLasso);
await page.keyboard.press("Escape");

// 3. Réutilisation d'une partie d'un autre modèle (dans un projet vide).
const cible = (await api("post", "/projects", { code: "P.200", name: "Projet repris" })).body.id;
check("projet cible : un niveau « Rez »", (await lot(cible, `n-${Date.now()}`, 0, [{ type: "niveau.creer", params: { id: "rez", nom: "Rez", elevation: 0, hauteur: 3 } }])).status === 200);
await ouvrir(cible, false);
await page.locator("details.reprise summary").click();
await page.locator('[data-reprise="source"]').selectOption(pid);
await page.locator('details.reprise button:has-text("Aperçu")').click();
await page.waitForSelector("[data-reprise-apercu]", { timeout: 30000 }).catch(() => {});
const nApercu = Number((await page.locator("[data-reprise-apercu]").getAttribute("data-reprise-apercu").catch(() => "0")) ?? 0);
check("aperçu de reprise : objets comptés, rien écrit", nApercu > 0 && (await modele(cible)).revision === 1, `${nApercu} objet(s)`);
await axe("réutilisation de modèle", "details.reprise");
await page.locator('details.reprise button:has-text("Reprendre")').click();
await page.waitForFunction(() => /Reprise effectuée/.test(document.querySelector("details.reprise")?.textContent ?? ""), null, { timeout: 60000 }).catch(() => {});
const repris = await modele(cible);
const objetsRepris = Object.values(repris.modele.objets);
check("reprise : une révision, objets nouveaux avec leur provenance, aucune donnée de site reprise", repris.revision === 2 && objetsRepris.length === nApercu && objetsRepris.every((o) => o.proprietes["reprise:origine"]?.provenance === "import") && repris.modele.site.parcelle === null, `${objetsRepris.length} objet(s), r${repris.revision}`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 15000 }).catch(() => {});
check("reprise : les objets repris sont dessinés", (await page.locator(".plan2d .plan-objets [data-objet]").count()) > 0);
await page.screenshot({ path: `${OUT}/10-reprise.png` });
// Bibliothèque partagée (D-031) : la famille « définitions » propose le filtre par bibliothèque, l'aperçu compte les définitions.
await page.locator('[data-famille="architecture"]').uncheck().catch(() => {});
await page.locator('[data-famille="definitions"]').check();
const champBib = await page.locator('[data-reprise="bibliotheque"]').isVisible().catch(() => false);
await page.locator('details.reprise button:has-text("Aperçu")').click();
await page.waitForFunction(() => /définition\(s\)/.test(document.querySelector("[data-reprise-apercu]")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
check("bibliothèque de définitions : filtre proposé, aperçu sans écriture", champBib && /définition\(s\)/.test((await page.locator("[data-reprise-apercu]").textContent().catch(() => "")) ?? "") && (await modele(cible)).revision === 2);

// 4. Référence externe : la publication du voisin, superposée en gris sur le RDC du projet.
const pub1 = await api("post", `/projects/${voisin}/atelier/publications`, { nom: "Voisin v1" });
check("publication du projet voisin", pub1.status === 201);
await ouvrir(pid);
await page.locator("details.refext summary").click();
await page.locator('[data-refext="source"]').selectOption(voisin);
await page.locator('[data-refext="publication"]').selectOption(pub1.body.id);
await page.waitForSelector('[data-refext="niveau-source"]', { timeout: 15000 });
await page.locator('[data-refext="niveau-source"]').selectOption({ index: 1 });
await page.locator('[data-refext="position"]').fill("25;0");
await page.locator('[data-refext="angle"]').fill("0");
await axe("références externes", "details.refext");
await page.locator('[data-refext="rattacher"]').click();
await page.waitForFunction(() => /Référence rattachée|refus|inconnu/i.test(document.querySelector("details.refext")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
await page.waitForSelector(".plan2d .plan-externes path", { timeout: 20000 }).catch(() => {});
const apresRef = await modele(pid);
check(
  "référence rattachée : superposition grise dessinée, rien copié dans le modèle",
  (await page.locator(".plan2d .plan-externes path").count()) === 1 && Object.keys(apresRef.modele.objets).length === Object.keys(depart.modele.objets).length && Object.values(apresRef.modele.definitions).some((d) => d.classe === "reference-externe"),
  (await page.locator("details.refext").textContent())?.slice(0, 200),
);
check("référence : état « à jour »", (await page.locator('.refext-liste [data-etat="a-jour"]').count()) === 1);
await page.screenshot({ path: `${OUT}/10-reference-externe.png` });

// Le voisin publie une nouvelle révision : signalée, différences consultables, épinglage.
const v = await modele(voisin);
const murVoisin = Object.values(v.modele.objets).find((o) => o.classe === "mur");
check("le voisin modifie puis publie « Voisin v2 »", (await lot(voisin, `v-${Date.now()}`, v.revision, [{ type: "objet.modifier", params: { id: murVoisin.id, params: { epaisseur: m(0.5) } } }])).status === 200 && (await api("post", `/projects/${voisin}/atelier/publications`, { nom: "Voisin v2" })).status === 201);
await ouvrir(pid);
await page.locator("details.refext summary").click();
await page.waitForSelector('.refext-liste [data-etat="plus-recente"]', { timeout: 20000 }).catch(() => {});
check("publication plus récente signalée", (await page.locator('.refext-liste [data-etat="plus-recente"]').count()) === 1);
await page.locator('.refext-liste button:has-text("Différences")').click();
await page.waitForFunction(() => /1 modifié/.test(document.querySelector(".refext-liste")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
check("différences avant d'épingler : 1 objet modifié", /1 modifié\(s\)/.test((await page.locator(".refext-liste").textContent()) ?? ""));
await page.locator("[data-epingler]").click();
await page.waitForSelector('.refext-liste [data-etat="a-jour"]', { timeout: 20000 }).catch(() => {});
check("dernière publication épinglée : de nouveau « à jour »", (await page.locator('.refext-liste [data-etat="a-jour"]').count()) === 1);

// Coupes remplies en 3D et murs raccordés (lot 3b, limites levées) ; manipulateur à poignées.
await selectionner(murA.id);
const avantGlisse = (await modele(pid)).modele.objets[murA.id].params.a;
await page.locator('.barre-mode button:has-text("3D")').click();
await page.waitForSelector(".vue3d canvas", { timeout: 30000 });
await page.waitForFunction(() => (window.fadiMesures3D?.poignees ?? 0) === 3, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(500);
const fleche = await page.evaluate(() => window.fadiMesures3D?.localiserPoignee?.("x") ?? null);
const cadre3d = await page.locator(".vue3d-canevas").boundingBox();
if (fleche && cadre3d) {
  await page.mouse.move(cadre3d.x + fleche.x, cadre3d.y + fleche.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(cadre3d.x + fleche.x + k * 6, cadre3d.y + fleche.y);
  await page.mouse.up();
}
await attendreEnregistre().catch(() => {});
const apresGlisse = (await modele(pid)).modele.objets[murA.id].params.a;
check("manipulateur 3D : la flèche X glissée déplace la sélection en X seulement, un lot enregistré", !!fleche && Math.abs(apresGlisse.x - avantGlisse.x) > 0.01 && Math.abs(apresGlisse.y - avantGlisse.y) < 1e-9, `${JSON.stringify(fleche)} · ${avantGlisse.x} → ${apresGlisse.x}`);
// Anneau : rotation autour de la verticale du centre de la sélection (un lot « transformer.tourner »).
await page.waitForFunction(() => (window.fadiMesures3D?.poignees ?? 0) === 3, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(400);
const anneau = await page.evaluate(() => window.fadiMesures3D?.localiserPoignee?.("r") ?? null);
const centreG = await page.evaluate(() => window.fadiMesures3D?.localiserPoignee?.("c") ?? null);
const avantRot = (await modele(pid)).modele.objets[murA.id].params;
if (anneau && centreG && cadre3d) {
  // Glisser le long de l'anneau d'environ un quart de tour.
  const r0 = Math.hypot(anneau.x - centreG.x, anneau.y - centreG.y);
  const a0 = Math.atan2(anneau.y - centreG.y, anneau.x - centreG.x);
  await page.mouse.move(cadre3d.x + anneau.x, cadre3d.y + anneau.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    const a = a0 + (k / 12) * (Math.PI / 2);
    await page.mouse.move(cadre3d.x + centreG.x + r0 * Math.cos(a), cadre3d.y + centreG.y + r0 * Math.sin(a));
  }
  await page.mouse.up();
}
await attendreEnregistre().catch(() => {});
const apresRot = (await modele(pid)).modele.objets[murA.id].params;
const dirAvant = Math.atan2(avantRot.b.y - avantRot.a.y, avantRot.b.x - avantRot.a.x);
const dirApres = Math.atan2(apresRot.b.y - apresRot.a.y, apresRot.b.x - apresRot.a.x);
const tour = Math.abs((((dirApres - dirAvant) * 180) / Math.PI + 540) % 360 - 180);
const journalRot = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.at(-1)?.label ?? "";
check("manipulateur 3D : l'anneau tourne la sélection autour de son centre, un lot enregistré", !!anneau && tour > 20 && /Tourner .* \(manipulateur 3D\)/.test(journalRot), `${tour.toFixed(1)}° · ${journalRot}`);
await page.keyboard.press("Escape");
const chapeaux = {};
for (const vue of ["Coupe nord–sud", "Plan (dessus)"]) {
  await page.locator('.vue3d-commandes select[aria-label="Vue"]').selectOption({ label: vue });
  await page.waitForFunction(() => (window.fadiMesures3D?.chapeaux ?? 0) > 0, null, { timeout: 15000 }).catch(() => {});
  chapeaux[vue] = await page.evaluate(() => window.fadiMesures3D?.chapeaux ?? 0);
  if (vue === "Coupe nord–sud") await page.screenshot({ path: `${OUT}/10-coupe-remplie.png` });
}
await page.locator('.vue3d-commandes select[aria-label="Vue"]').selectOption({ label: "Perspective" });
await page.waitForTimeout(300);
const sansCoupe = await page.evaluate(() => window.fadiMesures3D?.chapeaux ?? 0);
check("référence externe dessinée aussi en 3D (traits gris au niveau de rattachement)", (await page.evaluate(() => window.fadiMesures3D?.externes ?? 0)) === 1);
check("coupe en 3D : la matière coupée est remplie (coupe N–S, plan) ; rien sans plan de coupe", chapeaux["Coupe nord–sud"] > 0 && chapeaux["Plan (dessus)"] > 0 && sansCoupe === 0, JSON.stringify({ ...chapeaux, sansCoupe }));
// Documents : le plan du niveau dessine la référence (traits lus avec les droits de l'utilisateur) et le dit.
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForSelector(".atelier-docs");
await page.locator(".docs-nouvelle > summary").click();
await page.locator('[data-nouvelle="plan"]').click();
await page.waitForSelector('[data-detail="vue"] .docs-svg svg', { timeout: 60000 });
await page.waitForFunction(() => /dessinée en trait fin/.test(document.querySelector(".docs-avertissements")?.textContent ?? ""), null, { timeout: 45000 }).catch(() => {});
check("plan en document : la référence externe est dessinée en trait fin, avec sa révision publiée", /Référence externe « .* » dessinée en trait fin/.test((await page.locator(".docs-avertissements").textContent().catch(() => "")) ?? ""));
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.waitForSelector(".plan2d");

// Cycle : le voisin ne peut pas référencer une publication de ce projet, qui le référence déjà.
const pubA = (await api("post", `/projects/${pid}/atelier/publications`, { nom: "Compléments v1" })).body;
const niveauA = Object.keys((await modele(pid)).modele.niveaux)[0];
const cycle = await lot(voisin, `c-${Date.now()}`, (await modele(voisin)).revision, [{ type: "refexterne.rattacher", params: { nom: "retour", projetSourceId: pid, publicationId: pubA.id, revisionSource: pubA.revision, empreinteSource: pubA.empreinte, niveauSourceId: niveauA, niveauId: niveauA, position: { x: 0, y: 0, frame: "local", unit: "m" }, calqueId: null } }]);
check("référence circulaire refusée (409)", cycle.status === 409 && cycle.body?.motif === "reference-circulaire", JSON.stringify(cycle.body).slice(0, 160));

check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette des compléments : tout est vert.");
process.exit(echecs ? 1 : 0);
