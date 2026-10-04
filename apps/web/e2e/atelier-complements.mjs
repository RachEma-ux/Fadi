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

/** Choisit un outil par la palette et attend qu'il soit actif (une seconde tentative au besoin). */
const choisirOutil = async (requete, libelle) => {
  for (let essai = 0; essai < 2; essai++) {
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press("Escape");
    if (!(await page.locator(".palette-champ").isVisible().catch(() => false))) await page.keyboard.press("Control+k");
    if (!(await page.locator(".palette-champ").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) {
      await page.keyboard.press("Control+k");
      if (!(await page.locator(".palette-champ").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) continue;
    }
    await page.locator(".palette-champ").fill(requete);
    await page.waitForFunction((l) => (document.querySelector(".palette-resultats li")?.textContent ?? "").includes(l), libelle, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press("Enter");
    const ok = await page.waitForFunction((l) => (document.querySelector(".atelier-n-outils .outil.est-actif")?.textContent ?? "").includes(l), libelle, { timeout: 5000 }).then(() => true, () => false);
    if (ok) return true;
  }
  return false;
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
// Le mur suivi est pris sur le niveau affiché à l'ouverture (l'ordre des objets du modèle n'est pas garanti).
await ouvrir(pid);
const dessinesA = await page.locator(".plan2d .plan-objets [data-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-objet")));
const depart = await modele(pid);
const murA = Object.values(depart.modele.objets).find((o) => o.classe === "mur" && dessinesA.includes(o.id)) ?? Object.values(depart.modele.objets).find((o) => o.classe === "mur");
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
// Flèche Z : seulement pour un objet à décalage de base (une dalle s'élève) ; un mur suit son niveau.
await page.waitForTimeout(400);
const poigneesMur = await page.evaluate(() => window.fadiMesures3D?.poignees ?? 0);
const modeleZ = (await modele(pid)).modele;
const dalle = Object.values(modeleZ.objets).find((o) => o.classe === "dalle" && !(o.calqueId && modeleZ.calques[o.calqueId]?.verrouille));
let elevation = null;
let journalZ = "";
if (dalle) {
  await selectionner(dalle.id);
  await page.waitForFunction(() => (window.fadiMesures3D?.poignees ?? 0) === 4, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
  const fz = await page.evaluate(() => window.fadiMesures3D?.localiserPoignee?.("z") ?? null);
  const cz = await page.evaluate(() => window.fadiMesures3D?.localiserPoignee?.("c") ?? null);
  if (fz && cz && cadre3d) {
    const l = Math.hypot(fz.x - cz.x, fz.y - cz.y) || 1;
    const [ux, uy] = [(fz.x - cz.x) / l, (fz.y - cz.y) / l];
    await page.mouse.move(cadre3d.x + fz.x, cadre3d.y + fz.y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(cadre3d.x + fz.x + ux * k * 6, cadre3d.y + fz.y + uy * k * 6);
    await page.mouse.up();
  }
  await attendreEnregistre().catch(() => {});
  elevation = (await modele(pid)).modele.objets[dalle.id].params.decalageBase.value - dalle.params.decalageBase.value;
  journalZ = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.at(-1)?.label ?? "";
}
check("manipulateur 3D : flèche Z pour une dalle (décalage de base modifié, un lot), absente pour un mur", poigneesMur === 3 && elevation !== null && elevation > 0.01 && /Élever .* \(Z, manipulateur 3D\)/.test(journalZ), `${poigneesMur} poignées sur le mur · ${elevation} m · ${journalZ}`);
// Mesure 3D (D-048) : outil Mesurer, deux points relevés sur des surfaces.
{
  const ok = await choisirOutil("mesurer", "Mesurer");
  const m0 = (await modele(pid)).modele;
  const autresMurs = Object.values(m0.objets).filter((o) => o.classe === "mur" && o.niveauId === murA.niveauId && o.id !== murA.id).map((o) => o.id);
  const ecrans = [];
  for (const id of [murA.id, ...autresMurs]) {
    const q = await page.evaluate((x) => window.fadiMesures3D?.localiser?.(x) ?? null, id);
    if (q && cadre3d) ecrans.push(q);
    if (ecrans.length === 2) break;
  }
  for (const q of ecrans) await page.mouse.click(cadre3d.x + q.x, cadre3d.y + q.y);
  await page.waitForTimeout(300);
  const d = await page.evaluate(() => window.fadiMesures3D?.mesure3d ?? null);
  check("mesure 3D entre deux points relevés sur les surfaces", ok && typeof d === "number" && d > 0, `${d} · ${(await page.locator(".vue3d").textContent())?.match(/Distance[^)]*\)/)?.[0] ?? ""}`);
  await page.keyboard.press("Escape");
}
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
// Axonométrie (D-048) : vue créée et dessinée.
await page.locator(".docs-nouvelle > summary").click();
await page.locator('[data-nouvelle="axonometrie"]').click();
await page.waitForSelector('[data-detail="vue"] .docs-svg svg', { timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => (document.querySelector('[data-detail="vue"] .docs-svg svg')?.querySelectorAll("line, path, polyline").length ?? 0) > 10, null, { timeout: 60000 }).catch(() => {});
check("axonométrie : vue créée et dessinée (projection parallèle)", (await page.locator('[data-detail="vue"] .docs-svg svg').locator("line, path, polyline").count()) > 10 && /projection parallèle/.test((await page.locator(".docs-avertissements").textContent().catch(() => "")) ?? ""));
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.waitForSelector(".plan2d");

// Croisement (D-034) : deux murs qui se traversent ; la zone commune est peinte d'un seul tenant dans le plan.
{
  // Ouverture tolérante : l'état de synchronisation est relevé dans le diagnostic au lieu d'interrompre la recette.
  const ouvrirPlan = async () => {
    await attendreEnregistre().catch(() => {}); // rien en attente d'envoi avant de quitter la page
    await page.goto(`${BASE}/projets/${pid}?module=atelier`);
    await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }).catch(() => {});
    await attendreEnregistre().catch(() => {});
  };
  await ouvrirPlan();
  const m0 = await modele(pid);
  // Niveau affiché : celui d'un objet dessiné dans le plan.
  const dessines = await page.locator(".plan2d .plan-objets [data-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-objet")));
  const nv = dessines.map((id) => m0.modele.objets[id]?.niveauId).find(Boolean);
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const r = await lot(pid, `x-${Date.now()}`, m0.revision, [
    { type: "mur.tracer", params: { id: "croix-h", niveauId: nv, a: P(300, 0), b: P(304, 0), epaisseur: { value: 0.2, unit: "m" }, hauteur: { value: 3, unit: "m" } } },
    { type: "mur.tracer", params: { id: "croix-v", niveauId: nv, a: P(302, -2), b: P(302, 2), epaisseur: { value: 0.2, unit: "m" }, hauteur: { value: 3, unit: "m" } } },
  ]);
  await ouvrirPlan();
  await page.waitForSelector('[data-croisement*="croix-h"]', { state: "attached", timeout: 20000 }).catch(() => {});
  const n = await page.locator('[data-croisement*="croix-h"]').count();
  check("croisement de murs : zone commune peinte d'un seul tenant dans le plan", r.status === 200 && n === 1, `lot ${r.status} · niveau ${nv} · ${n} zone(s) · ${await page.locator("[data-croisement]").count()} au total · ${(await page.locator(".barre-sync").textContent().catch(() => ""))?.slice(0, 60)}`);
  // Sens d'ouverture d'une porte (D-037) : choisi dans l'inspecteur, suivi par le plan.
  const porte = Object.values((await modele(pid)).modele.objets).find((o) => o.classe === "porte" && o.niveauId === nv);
  let ouvrantLu = null;
  let dessin = null;
  if (porte) {
    await selectionner(porte.id);
    await page.locator('select[data-champ="ouvrant"]').selectOption("fin-droite");
    await attendreEnregistre().catch(() => {});
    ouvrantLu = (await modele(pid)).modele.objets[porte.id].params.ouvrant ?? null;
    dessin = await page.locator(`.plan2d [data-objet="${porte.id}"]`).getAttribute("data-ouvrant").catch(() => null);
  }
  check("porte : sens d'ouverture renseigné dans l'inspecteur, enregistré et dessiné", !!porte && ouvrantLu?.charniere === "fin" && ouvrantLu?.cote === "droite" && dessin === "fin-droite", `${porte?.id} · ${JSON.stringify(ouvrantLu)} · ${dessin}`);
  // Porte double (D-047) : nature du vantail choisie dans l'inspecteur, dessinée avec deux vantaux.
  let dessinDouble = null;
  if (porte) {
    await page.locator('select[data-champ="vantail"]').selectOption("double");
    await attendreEnregistre().catch(() => {});
    dessinDouble = await page.locator(`.plan2d [data-objet="${porte.id}"]`).getAttribute("data-ouvrant").catch(() => null);
  }
  check("porte double : nature du vantail enregistrée et dessinée", dessinDouble === "fin-droite-double" && (await modele(pid)).modele.objets[porte?.id]?.params.ouvrant?.type === "double", String(dessinDouble));
  // Vers un autre niveau (D-039) : copier un mur sur un autre niveau depuis l'inspecteur.
  const mAvant = await modele(pid);
  const autre = Object.values(mAvant.modele.niveaux).find((n) => n.id !== nv);
  let copieOk = false;
  if (autre) {
    await selectionner("croix-h");
    await page.locator(".inspecteur-vers-niveau > summary").click();
    await page.locator('[data-vers-niveau="cible"]').selectOption(autre.id);
    await page.locator('[data-vers-niveau="copier"]').click();
    await attendreEnregistre().catch(() => {});
    const mApres = (await modele(pid)).modele;
    copieOk = Object.values(mApres.objets).some((o) => o.classe === "mur" && o.id !== "croix-h" && o.niveauId === autre.id && o.params.a.x === 300 && o.params.a.y === 0) && mApres.objets["croix-h"].niveauId === nv;
  }
  check("vers un autre niveau : un mur copié sur le niveau choisi, l'original reste", copieOk, autre?.nom);
  // Dupliquer un niveau (D-040) : « Ajouter un niveau » avec « Copier le contenu de ».
  const avantDup = (await modele(pid)).modele;
  const nbSource = Object.values(avantDup.objets).filter((o) => o.niveauId === nv).length;
  await page.locator(".nav-ajout").click();
  const form = page.locator(".nav-formulaire");
  await form.locator("input").nth(0).fill("Copie e2e");
  await form.locator("input").nth(1).fill("42");
  await form.locator('[data-niveau="source"]').selectOption(nv);
  await form.locator('button[type="submit"]').click();
  await attendreEnregistre().catch(() => {});
  const apresDup = (await modele(pid)).modele;
  const nouveau = Object.values(apresDup.niveaux).find((n) => n.nom === "Copie e2e");
  const nbCopie = nouveau ? Object.values(apresDup.objets).filter((o) => o.niveauId === nouveau.id).length : -1;
  check("dupliquer un niveau : nouveau niveau avec la copie de tout son contenu, une révision", !!nouveau && nouveau.elevation === 42 && nbCopie === nbSource, `${nbSource} → ${nbCopie}`);
  // Groupe (D-041) : retirer un membre depuis l'inspecteur.
  const rg = await lot(pid, `g-${Date.now()}`, (await modele(pid)).revision, [{ type: "groupe.creer", params: { id: "g-croix", nom: "Croix", cibles: ["croix-h", "croix-v"] } }]);
  await ouvrirPlan();
  await selectionner("croix-v");
  await page.locator(".inspecteur-groupe > summary").click();
  await page.locator('[data-groupe-action="retirer"]').click();
  await attendreEnregistre().catch(() => {});
  const mg = (await modele(pid)).modele;
  check("groupe : un membre retiré depuis l'inspecteur, le groupe garde les autres", rg.status === 200 && mg.objets["croix-v"].groupeId === null && mg.objets["croix-h"].groupeId === "g-croix", `${rg.status} · ${mg.objets["croix-v"].groupeId}`);
  // Constructions d'esquisse (D-042) : polygone régulier (côtés renseignés) et cercle par trois points.
  const compterFormes = async () => { const o = Object.values((await modele(pid)).modele.objets); return { hex: o.filter((x) => x.classe === "esquisse" && x.params.forme === "polygone" && x.params.points.length === 6).length, cercles: o.filter((x) => x.classe === "esquisse" && x.params.forme === "cercle").length }; };
  const avantFormes = await compterFormes();
  const cadre = await page.locator(".plan2d").boundingBox();
  const cx = cadre.x + cadre.width * 0.5;
  const cy = cadre.y + cadre.height * 0.5;
  await page.keyboard.press("Escape");
  await choisirOutil("hexagone", "Polygone régulier");
  await page.locator("#outil-cotes").fill("6");
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx + 60, cy);
  await attendreEnregistre().catch(() => {});
  await page.keyboard.press("Escape");
  await choisirOutil("circonscrit", "Cercle par 3 points");
  const outilCercle = (await page.locator(".atelier-n-outils .outil.est-actif").textContent().catch(() => "")) ?? "";
  // Loin de l'hexagone (aucun accrochage sur ses sommets).
  await page.mouse.click(cx - 250, cy + 40);
  await page.mouse.click(cx - 200, cy + 90);
  await page.mouse.click(cx - 150, cy + 40);
  await attendreEnregistre().catch(() => {});
  await page.keyboard.press("Escape");
  const apresFormes = await compterFormes();
  check("polygone régulier (6 côtés renseignés) et cercle par trois points tracés", apresFormes.hex === avantFormes.hex + 1 && apresFormes.cercles === avantFormes.cercles + 1, `${JSON.stringify(avantFormes)} → ${JSON.stringify(apresFormes)} · outil ${outilCercle}`);
  // Trame d'axes et ellipse (D-046).
  const compter2 = async () => { const o = Object.values((await modele(pid)).modele.objets); return { axes: o.filter((x) => x.classe === "esquisse" && x.params.forme === "construction").length, ellipses: o.filter((x) => x.classe === "esquisse" && x.params.forme === "ellipse").length }; };
  const avant2 = await compter2();
  await choisirOutil("trame", "Trame d'axes");
  await page.locator('[data-trame="entraxesX"]').fill("2*3");
  await page.locator('[data-trame="entraxesY"]').fill("4");
  await page.locator("#outil-depassement").fill("1");
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.click(cx + 200, cy - 150);
  await attendreEnregistre().catch(() => {});
  await page.keyboard.press("Escape");
  await choisirOutil("ovale", "Ellipse");
  await page.mouse.click(cx - 250, cy - 120);
  await page.mouse.click(cx - 170, cy - 120);
  await page.mouse.click(cx - 250, cy - 90);
  await attendreEnregistre().catch(() => {});
  await page.keyboard.press("Escape");
  const apres2 = await compter2();
  check("trame d'axes (entraxes saisis) et ellipse tracées", apres2.axes === avant2.axes + 5 && apres2.ellipses === avant2.ellipses + 1, `${JSON.stringify(avant2)} → ${JSON.stringify(apres2)}`);
  // Scinder un mur en parts égales (D-043).
  await selectionner("croix-v");
  await page.locator('[data-scinder="parts"]').fill("4");
  await page.locator('[data-scinder="valider"]').click();
  await attendreEnregistre().catch(() => {});
  const morceaux = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur" && o.niveauId === nv && Math.abs(o.params.a.x - 302) < 1e-6 && Math.abs(o.params.b.x - 302) < 1e-6);
  // Calcul dans un champ de l'inspecteur (D-049) : « 0,15 + 0,1 » donne 0,25 m.
  await selectionner("croix-h");
  await page.locator('input[id="croix-h-epaisseur"]').fill("0,15 + 0,1");
  await page.locator('input[id="croix-h-epaisseur"]').press("Enter");
  await attendreEnregistre().catch(() => {});
  check("champ de l'inspecteur : un calcul est accepté (0,15 + 0,1 → 0,25 m)", Math.abs(((await modele(pid)).modele.objets["croix-h"].params.epaisseur.value) - 0.25) < 1e-9);
  check("scinder un mur en 4 parts égales depuis l'inspecteur", morceaux.length === 4 && morceaux.every((o) => Math.abs(Math.abs(o.params.b.y - o.params.a.y) - 1) < 1e-6), `${morceaux.length} morceau(x)`);
  // Changer la nature d'une ouverture sur place (D-044).
  if (porte) {
    await selectionner(porte.id);
    await page.locator('select[data-champ="classeOuverture"]').selectOption("fenetre");
    await attendreEnregistre().catch(() => {});
  }
  check("ouverture : porte changée en fenêtre sur place", !!porte && (await modele(pid)).modele.objets[porte.id]?.classe === "fenetre");
  // Supprimer un niveau avec ses objets depuis le navigateur (D-044).
  await page.locator('.nav-niveaux button:has-text("Copie e2e")').click();
  await page.locator(".nav-gerer-niveau > summary").click();
  await page.locator('[data-niveau="suppression"]').selectOption("avec");
  await page.locator('[data-niveau="supprimer"]').click();
  await attendreEnregistre().catch(() => {});
  const mSup = (await modele(pid)).modele;
  check("niveau supprimé avec ses objets depuis le navigateur", !Object.values(mSup.niveaux).some((n) => n.nom === "Copie e2e"));
  // Propriétés en tableau (D-045) : import CSV, une ligne refusée nominativement ; historique exporté en CSV.
  const cheminCsv = `${OUT}/proprietes-e2e.csv`;
  (await import("node:fs")).writeFileSync(cheminCsv, "id;propriete;valeur;unite\ncroix-h;Résistance au feu;EI 60;\ncroix-h;Épaisseur relevée;20;\n");
  await page.locator(".barre-imports > summary").click();
  await page.locator('[data-entree="proprietes-csv"]').setInputFiles(cheminCsv);
  // L'import part en un lot : attendre qu'il soit enregistré sur le serveur (banc de CI chargé).
  let propsCroix = {};
  for (let k = 0; k < 40; k++) {
    propsCroix = (await modele(pid)).modele.objets["croix-h"].proprietes;
    if (propsCroix["Résistance au feu"]) break;
    await page.waitForTimeout(500);
  }
  check("propriétés importées d'un CSV, ligne numérique sans unité refusée", propsCroix["Résistance au feu"]?.valeur === "EI 60" && propsCroix["Résistance au feu"]?.provenance === "import" && !propsCroix["Épaisseur relevée"], JSON.stringify(Object.keys(propsCroix)));
  const histo = await page.request.get(`${BASE}/projects/${pid}/atelier/journal.csv`);
  const histoTexte = await histo.text();
  check("historique exporté en CSV (une ligne par révision)", histo.status() === 200 && /^\uFEFF?revision;date;nature;libelle;auteur/.test(histoTexte) && histoTexte.split("\r\n").length > 5);
}

// Fichier de bibliothèque (D-050) : exporté de ce projet, importé dans un projet neuf.
{
  await page.locator(".barre-exports > summary").click();
  const [dlBib] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator('[data-export="bibliotheque"]').click()]);
  const cheminBib = `${OUT}/bibliotheque-e2e.json`;
  await dlBib.saveAs(cheminBib);
  const neuf = (await api("post", "/projects", { code: "P.300", name: "Projet bibliothèque" })).body.id;
  const nv0 = await lot(neuf, `n-${Date.now()}`, 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }]);
  await ouvrir(neuf, false);
  await page.locator(".barre-imports > summary").click();
  await page.locator('[data-entree="bibliotheque"]').setInputFiles(cheminBib);
  let defs = 0;
  for (let k = 0; k < 40 && !defs; k++) {
    defs = Object.keys((await modele(neuf)).modele.definitions).length;
    if (!defs) await page.waitForTimeout(500);
  }
  check("bibliothèque : fichier exporté puis importé dans un projet neuf (définitions reprises)", nv0.status === 200 && defs > 0, `${defs} définition(s)`);
  await ouvrir(pid);
}

// Cycle : le voisin ne peut pas référencer une publication de ce projet, qui le référence déjà.
const pubA = (await api("post", `/projects/${pid}/atelier/publications`, { nom: "Compléments v1" })).body;
const niveauA = Object.keys((await modele(pid)).modele.niveaux)[0];
const cycle = await lot(voisin, `c-${Date.now()}`, (await modele(voisin)).revision, [{ type: "refexterne.rattacher", params: { nom: "retour", projetSourceId: pid, publicationId: pubA.id, revisionSource: pubA.revision, empreinteSource: pubA.empreinte, niveauSourceId: niveauA, niveauId: niveauA, position: { x: 0, y: 0, frame: "local", unit: "m" }, calqueId: null } }]);
check("référence circulaire refusée (409)", cycle.status === 409 && cycle.body?.motif === "reference-circulaire", JSON.stringify(cycle.body).slice(0, 160));

check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette des compléments : tout est vert.");
process.exit(echecs ? 1 : 0);
