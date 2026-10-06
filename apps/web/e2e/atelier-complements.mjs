/**
 * Recette des compléments (après le lot 9) dans un vrai navigateur : historique d'un objet (DA-21-06), consultation
 * d'un état passé en lecture seule, réutilisation d'une partie d'un autre modèle avec aperçu (DA-21-09), référence
 * externe à la publication d'un autre projet — superposition grise, publication plus récente signalée, différences,
 * épinglage, refus d'une référence circulaire (DA-05-11) ; coupes remplies en 3D ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-complements.mjs
 */
import { readFileSync } from "node:fs";
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

/** Boîte d'un élément du plan une fois la vue stable (la sélection recentre la vue). */
const boiteStable = async (selecteur) => {
  let b = null;
  for (let k = 0; k < 25; k++) {
    const n = await page.locator(selecteur).boundingBox().catch(() => null);
    if (n && b && Math.abs(n.x - b.x) < 0.5 && Math.abs(n.y - b.y) < 0.5 && Math.abs(n.width - b.width) < 0.5) return n;
    b = n;
    await page.waitForTimeout(150);
  }
  return b;
};

/** Zoom à la molette sur un élément du plan jusqu'à une largeur affichée minimale (px). */
const zoomerSur = async (selecteur, largeurMin) => {
  for (let k = 0; k < 15; k++) {
    const b = await boiteStable(selecteur);
    if (!b || Math.max(b.width, b.height) >= largeurMin) return b;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, -500);
  }
  return boiteStable(selecteur);
};

/** Choisit un outil par la palette et attend qu'il soit actif (une seconde tentative au besoin). */
const choisirOutil = async (requete, libelle, id = null) => {
  for (let essai = 0; essai < 2; essai++) {
    // Pointeur hors de la palette : un survol choisirait l'élément sous la souris au lieu du premier résultat.
    await page.mouse.move(2, 2);
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
    // Outil actif : bouton de la barre, ou (outil rangé dans un menu) le plan qui annonce l'outil courant.
    const ok = await page.waitForFunction(([l, i]) => (document.querySelector(".atelier-n-outils .outil.est-actif")?.textContent ?? "").includes(l) || (!!i && (document.querySelector(".plan2d")?.getAttribute("aria-label") ?? "").endsWith(`outil ${i}`)), [libelle, id], { timeout: 5000 }).then(() => true, () => false);
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
// Commentaire attaché à une entrée du journal (D-055) : publié depuis le panneau, relu par révision.
{
  if ((await page.locator(".mod-journal").getAttribute("open")) === null) await page.locator(".mod-journal summary").click();
  const btn = page.locator("[data-commenter-revision]").first();
  const rev = Number(await btn.getAttribute("data-commenter-revision"));
  await btn.click();
  await page.locator(`[data-fil-revision="${rev}"] textarea`).fill("À vérifier avec le BET");
  await page.locator(`[data-fil-revision="${rev}"] button[type="submit"]`).click();
  let fil = [];
  for (let k = 0; k < 30 && !fil.length; k++) {
    fil = (await api("get", `/projects/${pid}/collaboration/comments?revision=${rev}`)).body ?? [];
    if (!fil.length) await page.waitForTimeout(500);
  }
  await page.waitForSelector(`[data-fil-revision="${rev}"] li`, { timeout: 10000 }).catch(() => {});
  check("commentaire attaché à une entrée du journal, relu par révision et affiché dans son fil", fil.length === 1 && fil[0].atelierRevision === rev && (await page.locator(`[data-fil-revision="${rev}"] li`).count()) === 1, `r${rev} · ${JSON.stringify(fil).slice(0, 120)}`);
}

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
// Calage par le repère cadastral (D-138) : le voisin est une copie de P.118 (même parcelle, même système) → 0 ; 0.
await page.locator("[data-refext-caler]").click();
check("calage cadastral : position déduite des deux origines locales (même système)", (await page.locator('[data-refext="position"]').inputValue()) === "0;0", await page.locator('[data-refext="position"]').inputValue());
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
// Décalage d'altitude de la référence (D-137) : saisi dans le panneau, enregistré dans sa définition.
{
  const refId = Object.values(apresRef.modele.definitions).find((d) => d.classe === "reference-externe")?.id;
  await page.locator(`[data-refext-decalage="${refId}"]`).fill("-1,5");
  await page.locator(`[data-refext-decalage-appliquer="${refId}"]`).click();
  let dec = null;
  for (let k = 0; k < 30 && dec === null; k++) {
    dec = (await modele(pid)).modele.definitions[refId]?.params.decalageAltitude?.value ?? null;
    if (dec === null) await page.waitForTimeout(500);
  }
  check("référence externe : décalage d'altitude enregistré (−1,5 m)", dec === -1.5, String(dec));
}

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
// Vues 3D enregistrées et éclaté horizontal (D-053) : la vue est enregistrée dans le modèle, puis rejouée.
{
  const pres = page.locator('.vue3d-commandes select[aria-label="Présentation"]');
  await pres.selectOption("eclate-horizontal");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/10b-eclate-horizontal.png` });
  await page.locator("[data-vues-3d] > summary").click();
  await page.locator('[data-vues-3d] input[aria-label="Nom de la vue 3D"]').fill("Éclaté e2e");
  await page.locator('[data-vues-3d] button:has-text("Enregistrer la vue")').click();
  let v3 = null;
  for (let k = 0; k < 40 && !v3; k++) {
    v3 = Object.values((await modele(pid)).modele.definitions).find((d) => d.classe === "vue-3d" && d.nom === "Éclaté e2e") ?? null;
    if (!v3) await page.waitForTimeout(500);
  }
  await pres.selectOption("batiment");
  await page.waitForTimeout(200);
  await page.locator('[data-vues-3d] select[aria-label="Vue enregistrée"]').selectOption({ label: "Éclaté e2e" });
  await page.waitForTimeout(300);
  const rejouee = await pres.inputValue();
  check("vue 3D enregistrée (caméra, présentation éclatée horizontale) puis rejouée", !!v3 && v3.params.presentation === "eclate-horizontal" && typeof v3.params.camera?.position?.x === "number" && rejouee === "eclate-horizontal", `${JSON.stringify(v3?.params ?? null).slice(0, 160)} · rejouée ${rejouee}`);
  await pres.selectOption("batiment");
  await page.locator("[data-vues-3d] > summary").click();
}
// Documents : le plan du niveau dessine la référence (traits lus avec les droits de l'utilisateur) et le dit.
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForSelector(".atelier-docs");
await page.locator(".docs-nouvelle > summary").click();
await page.locator('[data-nouvelle="plan"]').click();
await page.waitForSelector('[data-detail="vue"] .docs-svg svg', { timeout: 60000 });
await page.waitForFunction(() => /dessinée en trait fin/.test(document.querySelector(".docs-avertissements")?.textContent ?? ""), null, { timeout: 45000 }).catch(() => {});
check("plan en document : la référence externe est dessinée en trait fin, avec sa révision publiée", /Référence externe « .* » dessinée en trait fin/.test((await page.locator(".docs-avertissements").textContent().catch(() => "")) ?? ""));
// Calques masqués dans cette vue seulement (D-057).
{
  const caseCalque = page.locator('[data-detail="vue"] [data-calque-vue]:enabled').first();
  const calqueId = await caseCalque.getAttribute("data-calque-vue").catch(() => null);
  if (calqueId) {
    await caseCalque.check();
    await page.locator('[data-detail="vue"] button.docs-principal:has-text("Appliquer")').click();
  }
  let vueMasquee = null;
  for (let k = 0; k < 40 && calqueId && !vueMasquee; k++) {
    const mv = (await modele(pid)).modele;
    vueMasquee = Object.values(mv.definitions).find((d) => d.classe === "vue" && d.params.calquesMasques?.includes(calqueId)) ?? null;
    if (!vueMasquee) await page.waitForTimeout(500);
  }
  const calqueProjet = calqueId ? (await modele(pid)).modele.calques[calqueId] : null;
  check("vue : un calque masqué dans cette vue seulement (le calque reste visible dans le projet)", !!vueMasquee && calqueProjet?.visible === true, `${calqueId} · ${vueMasquee?.id ?? "—"}`);
}
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
  // Conversion d'esquisse (D-054) : l'ellipse devient une polyligne fermée de 24 segments, depuis l'inspecteur.
  {
    const ell = Object.values((await modele(pid)).modele.objets).find((x) => x.classe === "esquisse" && x.params.forme === "ellipse");
    if (ell) {
      await selectionner(ell.id);
      await page.locator("[data-convertir-esquisse] input").fill("24");
      await page.locator('[data-convertir-esquisse] button[type="submit"]').click();
    }
    let conv = null;
    for (let k = 0; k < 40 && ell && !conv; k++) {
      const x = (await modele(pid)).modele.objets[ell.id];
      if (x?.params.forme === "polyligne") conv = x;
      else await page.waitForTimeout(500);
    }
    check("esquisse convertie : ellipse → polyligne fermée de 24 segments (inspecteur)", !!conv && conv.params.ferme === true && conv.params.points.length === 24, `${ell?.id} · ${conv?.params.points.length ?? "—"}`);
    await page.keyboard.press("Escape");
  }
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

// Verrou d'objet (D-052) : verrouillé depuis l'inspecteur, la suppression au clavier est refusée ; déverrouillé ensuite.
{
  const mv = (await modele(pid)).modele;
  const murV = Object.values(mv.objets).find((o) => o.classe === "mur" && o.niveauId === murA.niveauId && !o.groupeId) ?? Object.values(mv.objets).find((o) => o.classe === "mur" && o.niveauId === murA.niveauId);
  await page.keyboard.press("Escape");
  await selectionner(murV.id);
  await page.locator("#verrou-objet").check();
  let verrou = false;
  for (let k = 0; k < 40 && !verrou; k++) {
    verrou = (await modele(pid)).modele.objets[murV.id]?.verrouille === true;
    if (!verrou) await page.waitForTimeout(500);
  }
  const alerte = await page.locator("[data-verrou-objet]").isVisible();
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Delete");
  await page.waitForTimeout(2500);
  const encore = !!(await modele(pid)).modele.objets[murV.id];
  await page.locator("#verrou-objet").uncheck();
  let libre = false;
  for (let k = 0; k < 40 && !libre; k++) {
    libre = !("verrouille" in ((await modele(pid)).modele.objets[murV.id] ?? { verrouille: true }));
    if (!libre) await page.waitForTimeout(500);
  }
  check("verrou d'objet : verrouillé depuis l'inspecteur, suppression refusée, puis déverrouillé", verrou && alerte && encore && libre, `verrou ${verrou} · alerte ${alerte} · présent ${encore} · libre ${libre}`);
}

// Appartenance aux zones (D-056) : une pièce ou une zone d'un autre niveau rattachée depuis l'inspecteur de la zone.
{
  const etatZ = await modele(pid);
  const pts = [[0, 0], [3, 0], [3, 3], [0, 3]].map(([x, y]) => ({ x: x + 500, y: y + 500, frame: "local", unit: "m" }));
  const cree = await lot(pid, `z-${Date.now()}`, etatZ.revision, [{ type: "zone.creer", params: { id: "zone-e2e", niveauId: murA.niveauId, nom: "Zone e2e", contour: pts } }]);
  if (cree.status === 200) await ouvrir(pid);
  const mz = (await modele(pid)).modele;
  const zone = mz.objets["zone-e2e"];
  const avant = Object.values(mz.relations).filter((r) => r.kind === "contient" && r.sourceId === zone?.id).length;
  let apres = avant;
  if (zone) {
    await page.keyboard.press("Escape");
    await selectionner(zone.id);
    const choix = page.locator("[data-zone-candidat] option").nth(1);
    const valeur = await choix.getAttribute("value");
    await page.locator("[data-zone-candidat]").selectOption(valeur);
    await page.locator("[data-zone-rattacher]").click();
    for (let k = 0; k < 40 && apres === avant; k++) {
      apres = Object.values((await modele(pid)).modele.relations).filter((r) => r.kind === "contient" && r.sourceId === zone.id).length;
      if (apres === avant) await page.waitForTimeout(500);
    }
  }
  check("zone : un membre (pièce, espace ou zone, tout niveau) rattaché depuis l'inspecteur de la zone", !!zone && apres === avant + 1, `${zone?.id} · ${avant} → ${apres}`);
  await page.keyboard.press("Escape");
}

// Réseau sur trajectoire (D-058) : trois copies d'une ligne le long d'une allée, outil de la palette.
{
  const eR = await modele(pid);
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  const r0 = await lot(pid, `rt-${Date.now()}`, eR.revision, [
    // Loin de toute autre géométrie : le premier clic doit tomber sur l'allée seule.
    { type: "esquisse.polyligne", params: { id: "allee-e2e", niveauId: murA.niveauId, points: [P(-89.3, -88.7), P(-86.3, -88.7)] } },
    { type: "esquisse.ligne", params: { id: "banc-e2e", niveauId: murA.niveauId, points: [P(-89.3, -89.1), P(-88.9, -89.1)] } },
  ]);
  await ouvrir(pid);
  const avant = Object.keys((await modele(pid)).modele.objets).length;
  // Sélection d'abord (l'outil n'est proposé qu'avec une sélection), puis la palette sans Échap (qui la viderait).
  await selectionner("banc-e2e");
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+k");
  await page.locator(".palette-champ").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await page.locator(".palette-champ").fill("trajectoire");
  await page.waitForFunction(() => (document.querySelector(".palette-resultats li")?.textContent ?? "").includes("Réseau sur trajectoire"), null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Enter");
  const ok = await page.waitForFunction(() => (document.querySelector(".atelier-n-outils .outil.est-actif")?.textContent ?? "").includes("Réseau sur trajectoire"), null, { timeout: 5000 }).then(() => true, () => false);
  if (!ok) await page.keyboard.press("Escape");
  await page.locator("#outil-copiesTrajet").fill("3");
  await page.evaluate(() => document.activeElement?.blur?.());
  const boiteAllee = await zoomerSur('.plan2d [data-objet="allee-e2e"]', 120);
  const boiteBanc = await page.locator('.plan2d [data-objet="banc-e2e"]').boundingBox().catch(() => null);
  if (boiteAllee && boiteBanc) {
    await page.mouse.click(boiteAllee.x + boiteAllee.width / 2, boiteAllee.y + boiteAllee.height / 2);
    await page.mouse.click(boiteBanc.x + boiteBanc.width / 2, boiteBanc.y + boiteBanc.height / 2);
  }
  let apres = avant;
  for (let k = 0; k < 30 && apres === avant; k++) {
    apres = Object.keys((await modele(pid)).modele.objets).length;
    if (apres === avant) await page.waitForTimeout(500);
  }
  check("réseau sur trajectoire : trois copies posées le long de l'allée (outil de la palette)", r0.status === 200 && ok && apres === avant + 3, `${r0.status} · outil ${ok} · ${avant} → ${apres} · allée ${JSON.stringify(boiteAllee)}`);
  await page.keyboard.press("Escape");
}

// Trémie d'escalier et hauteur propre d'une pièce (D-059), depuis l'inspecteur.
{
  const e0 = await modele(pid);
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  const M = (v) => ({ value: v, unit: "m" });
  const r0 = await lot(pid, `tr-${Date.now()}`, e0.revision, [
    { type: "dalle.creer", params: { id: "dalle-e2e", niveauId: murA.niveauId, contour: [P(-20, -20), P(-10, -20), P(-10, -10), P(-20, -10)], epaisseur: M(0.2) } },
    { type: "escalier.creer", params: { id: "esc-e2e", niveauId: murA.niveauId, a: P(-18, -15), b: P(-13, -15), largeur: M(1.2), hauteurAFranchir: M(3), niveauDepartId: murA.niveauId } },
    { type: "piece.creer", params: { id: "piece-e2e", niveauId: murA.niveauId, nom: "Local e2e", contour: [P(-30, -30), P(-26, -30), P(-26, -27), P(-30, -27)] } },
  ]);
  await ouvrir(pid);
  await selectionner("esc-e2e");
  await page.locator("[data-tremie-dalle]").selectOption("dalle-e2e");
  await page.locator('[data-tremie] button[type="submit"]').click();
  let trous = 0;
  for (let k = 0; k < 30 && !trous; k++) {
    trous = (await modele(pid)).modele.objets["dalle-e2e"]?.params.trous.length ?? 0;
    if (!trous) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  await selectionner("piece-e2e");
  await page.locator('input[id="piece-e2e-hauteur"]').fill("2,5");
  await page.locator('input[id="piece-e2e-hauteur"]').press("Enter");
  let h = null;
  for (let k = 0; k < 30 && !h; k++) {
    h = (await modele(pid)).modele.objets["piece-e2e"]?.params.hauteur ?? null;
    if (!h) await page.waitForTimeout(500);
  }
  check("trémie percée dans la dalle depuis l'escalier, hauteur propre d'une pièce saisie (D-059)", r0.status === 200 && trous === 1 && h?.value === 2.5, `${r0.status} · trous ${trous} · hauteur ${JSON.stringify(h)}`);
  await page.keyboard.press("Escape");
}

// Changer de classe sur place (D-060) : une esquisse fermée devient une pièce nommée.
{
  const e0 = await modele(pid);
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  const r0 = await lot(pid, `cc-${Date.now()}`, e0.revision, [{ type: "esquisse.polygone", params: { id: "contour-e2e", niveauId: murA.niveauId, points: [P(-40, -40), P(-36, -40), P(-36, -37), P(-40, -37)] } }]);
  await ouvrir(pid);
  await selectionner("contour-e2e");
  await page.locator("[data-classe-cible]").selectOption("piece");
  await page.locator("[data-classe-nom]").fill("Réserve e2e");
  await page.locator('[data-changer-classe] button[type="submit"]').click();
  let o = null;
  for (let k = 0; k < 30 && o?.classe !== "piece"; k++) {
    o = (await modele(pid)).modele.objets["contour-e2e"];
    if (o?.classe !== "piece") await page.waitForTimeout(500);
  }
  check("changer de classe : l'esquisse fermée devient une pièce nommée, même identifiant", r0.status === 200 && o?.classe === "piece" && o?.params.nom === "Réserve e2e", `${r0.status} · ${o?.classe}`);
  await page.keyboard.press("Escape");
}

// Rectangle à coins arrondis (D-063) : sommets arrondis depuis l'inspecteur, segments en arc dessinés.
{
  const e0 = await modele(pid);
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  const r0 = await lot(pid, `ar-${Date.now()}`, e0.revision, [{ type: "esquisse.rectangle", params: { id: "rect-e2e", niveauId: murA.niveauId, points: [P(-50, -50), P(-46, -47)] } }]);
  await ouvrir(pid);
  await selectionner("rect-e2e");
  await page.locator("[data-arrondir-rayon]").fill("0,5");
  await page.locator('[data-arrondir] button[type="submit"]').click();
  let q = null;
  for (let k = 0; k < 30 && !q?.renflements; k++) {
    q = (await modele(pid)).modele.objets["rect-e2e"]?.params;
    if (!q?.renflements) await page.waitForTimeout(500);
  }
  const d = (await page.locator('.plan2d [data-objet="rect-e2e"]').getAttribute("d").catch(() => "")) ?? "";
  check("rectangle à coins arrondis : quatre segments en arc, dessinés en plan", r0.status === 200 && q?.forme === "polyligne" && q?.points.length === 8 && q?.renflements.filter((b) => b !== 0).length === 4 && (d.match(/L/g) ?? []).length > 8, `${r0.status} · ${q?.forme} · ${q?.points?.length} · tracé ${(d.match(/L/g) ?? []).length}`);
  await page.keyboard.press("Escape");
}

// Classification avec référentiel chargé (D-065) : CSV lu dans l'inspecteur, code vérifié sur un mur.
{
  await page.keyboard.press("Escape");
  await selectionner(murA.id);
  await page.locator("[data-classification] > summary").click();
  await page.locator(".classif-referentiels > summary").click();
  await page.locator('[data-referentiel="systeme"]').fill("CFC-e2e");
  await page.locator('[data-referentiel="edition"]').fill("2017");
  await page.locator('[data-referentiel="fichier"]').setInputFiles({ name: "cfc-e2e.csv", mimeType: "text/csv", buffer: Buffer.from("Code;Libellé\n211;Maçonnerie\n214;Charpente\n") });
  let ref = null;
  for (let k = 0; k < 30 && !ref; k++) {
    ref = Object.values((await modele(pid)).modele.definitions).find((d) => d.classe === "referentiel-classification" && d.params.systeme === "CFC-e2e") ?? null;
    if (!ref) await page.waitForTimeout(500);
  }
  await page.locator('[data-classif="systeme"]').fill("CFC-e2e");
  await page.locator('[data-classif="code"]').fill("211");
  await page.locator('[data-classification] button:has-text("Classer")').click();
  let prop = null;
  for (let k = 0; k < 30 && !prop; k++) {
    prop = (await modele(pid)).modele.objets[murA.id]?.proprietes["classification:CFC-e2e"] ?? null;
    if (!prop) await page.waitForTimeout(500);
  }
  check("classification : référentiel chargé depuis un CSV, code vérifié et libellé noté sur le mur", !!ref && Object.keys(ref.params.codes).length === 2 && prop?.statut === "verifiee" && (await modele(pid)).modele.objets[murA.id]?.proprietes["classification:CFC-e2e:libelle"]?.valeur === "Maçonnerie", `${JSON.stringify(ref?.params?.codes ?? null)} · ${JSON.stringify(prop)}`);
  await page.keyboard.press("Escape");
}

// Filtres d'affichage et ensembles (D-066) : une classe masquée pour soi disparaît du plan ; un ensemble partagé.
{
  await page.keyboard.press("Escape");
  const classe = "mur";
  const avantMurs = await page.locator(".plan2d .obj-mur").count();
  await page.locator(`[data-classe-bascule="${classe}"]`).first().click();
  await page.waitForTimeout(400);
  const masques = await page.locator(".plan2d .obj-mur").count();
  await page.locator("[data-ensemble-nom]").fill("Sans murs e2e");
  await page.locator("[data-ensemble-partager]").check();
  await page.locator('[data-ensembles] .nav-formulaire-ensemble button[type="submit"]').click();
  let ens = null;
  for (let k = 0; k < 30 && !ens; k++) {
    ens = Object.values((await modele(pid)).modele.definitions).find((d) => d.classe === "ensemble-affichage" && d.nom === "Sans murs e2e") ?? null;
    if (!ens) await page.waitForTimeout(500);
  }
  await page.locator("[data-ensemble-tout]").click();
  await page.waitForTimeout(400);
  const remis = await page.locator(".plan2d .obj-mur").count();
  check("filtre d'affichage local : les murs masqués pour soi disparaissent du plan, ensemble partagé enregistré, « Tout afficher » les rend", avantMurs > 0 && masques === 0 && remis === avantMurs && ens?.params.classesMasquees.includes("mur") === true, `${avantMurs} → ${masques} → ${remis} · ${JSON.stringify(ens?.params ?? null)}`);
}

// Main levée et repère altimétrique (D-067).
{
  await page.keyboard.press("Escape");
  const avant = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "esquisse" && o.params.forme === "polyligne").length;
  const ok = await choisirOutil("main levée", "Main levée");
  const z = await page.locator(".plan2d").boundingBox();
  const x0 = z.x + z.width * 0.3;
  const y0 = z.y + z.height * 0.3;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let k = 1; k <= 30; k++) await page.mouse.move(x0 + k * 6, y0 + Math.sin(k / 4) * 20);
  await page.mouse.up();
  let apres = avant;
  for (let k = 0; k < 30 && apres === avant; k++) {
    apres = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "esquisse" && o.params.forme === "polyligne").length;
    if (apres === avant) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  await page.locator(".nav-altimetrie > summary").click();
  await page.locator('[data-altimetrie-champ="altitude"]').fill("432,15");
  await page.locator('[data-altimetrie-champ="systeme"]').fill("NGF-IGN69");
  await page.locator('[data-altimetrie-champ="source"]').fill("plan du géomètre (e2e)");
  await page.locator('.nav-altimetrie button[type="submit"]').click();
  await page.waitForSelector('.nav-altimetrie[data-altimetrie="declaree"]', { timeout: 30000 }).catch(() => {});
  const niveauTxt = (await page.locator(".nav-niveaux").textContent()) ?? "";
  check("main levée : un tracé glissé devient une polyligne simplifiée ; repère altimétrique déclaré, altitudes absolues des niveaux affichées", ok && apres === avant + 1 && /NGF-IGN69/.test(niveauTxt), `outil ${ok} · ${avant} → ${apres} · ${niveauTxt.slice(0, 80)}`);
}

// Gestion des calques, jonction de deux murs, isolement (D-068).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  let rj = { status: 0 };
  for (let k = 0; k < 5 && rj.status !== 200; k++) rj = await lot(pid, `j-${Date.now()}-${k}`, (await modele(pid)).revision, [
    { type: "mur.tracer", params: { id: "jonc-a", niveauId: murA.niveauId, a: P(50, 50), b: P(53, 50), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "jonc-b", niveauId: murA.niveauId, a: P(54, 51), b: P(54, 55), epaisseur: m(0.2), hauteur: m(3) } },
  ]);
  if (rj.status !== 200) console.log("lot jonction", rj.status, JSON.stringify(rj.body).slice(0, 300));
  await ouvrir(pid);
  // Calques : créer, renommer, supprimer depuis le navigateur.
  await page.locator(".nav-gerer-calques > summary").click();
  await page.locator("[data-calque-nouveau]").fill("Calque e2e");
  await page.locator('.nav-gerer-calques form button[type="submit"]').click();
  let cal = null;
  for (let k = 0; k < 30 && !cal; k++) {
    cal = Object.values((await modele(pid)).modele.calques).find((c) => c.nom === "Calque e2e") ?? null;
    if (!cal) await page.waitForTimeout(500);
  }
  let renomme = null;
  let supprime = false;
  if (cal) {
    await page.locator("[data-calque-choix]").selectOption(cal.id);
    await page.locator("[data-calque-nom]").fill("Calque e2e renommé");
    await page.locator('.nav-gerer-calques button:has-text("Renommer")').click();
    for (let k = 0; k < 30 && renomme !== "Calque e2e renommé"; k++) {
      renomme = (await modele(pid)).modele.calques[cal.id]?.nom ?? null;
      if (renomme !== "Calque e2e renommé") await page.waitForTimeout(500);
    }
    // Calques imbriqués (D-080) : un parent créé, le calque rangé dessous, masquer le parent masque l'enfant.
    await page.locator("[data-calque-nouveau]").fill("Parent e2e");
    await page.locator('.nav-gerer-calques form button[type="submit"]').click();
    let parent = null;
    for (let k = 0; k < 30 && !parent; k++) {
      parent = Object.values((await modele(pid)).modele.calques).find((c) => c.nom === "Parent e2e") ?? null;
      if (!parent) await page.waitForTimeout(500);
    }
    await page.locator("[data-calque-choix]").selectOption(cal.id);
    await page.locator("[data-calque-parent]").selectOption(parent.id);
    let range = false;
    for (let k = 0; k < 30 && !range; k++) {
      range = (await modele(pid)).modele.calques[cal.id]?.parentId === parent.id;
      if (!range) await page.waitForTimeout(500);
    }
    await page.locator(`.nav-calques li:has-text("Parent e2e") button[title="Masquer"]`).click();
    let enfantMasque = false;
    for (let k = 0; k < 30 && !enfantMasque; k++) {
      enfantMasque = (await modele(pid)).modele.calques[cal.id]?.visible === false;
      if (!enfantMasque) await page.waitForTimeout(500);
    }
    check("calques imbriqués : rangé sous un parent, masquer le parent masque le sous-calque", range && enfantMasque, `${range} · ${enfantMasque}`);
    await page.locator("[data-calque-choix]").selectOption(cal.id);
    // Propriété d'un calque (D-088).
    await page.locator('.nav-gerer-calques [data-prop-cible="nom"]').fill("Lot e2e");
    await page.locator('.nav-gerer-calques [data-prop-cible="valeur"]').fill("Gros œuvre");
    await page.locator('.nav-gerer-calques [data-prop-cible="ajouter"]').click();
    let propCalque = null;
    for (let k = 0; k < 30 && !propCalque; k++) {
      propCalque = (await modele(pid)).modele.calques[cal.id]?.proprietes?.["Lot e2e"]?.valeur ?? null;
      if (!propCalque) await page.waitForTimeout(500);
    }
    check("propriété d'un calque : saisie dans « Gérer les calques », enregistrée", propCalque === "Gros œuvre", String(propCalque));
    await page.locator("[data-calque-supprimer]").click();
    for (let k = 0; k < 30 && !supprime; k++) {
      supprime = !(await modele(pid)).modele.calques[cal.id];
      if (!supprime) await page.waitForTimeout(500);
    }
  }
  check("calques : créé, renommé puis supprimé depuis le navigateur", !!cal && renomme === "Calque e2e renommé" && supprime, `${cal?.id} · ${renomme} · ${supprime}`);
  // Joindre deux murs : sélection des deux, palette « Joindre ».
  await selectionner("jonc-a");
  await page.locator(".nav-filtre").fill("jonc-b");
  await page.locator('.nav-objets button[data-objet="jonc-b"]').click({ modifiers: ["Shift"] });
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+k");
  await page.locator(".palette-champ").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await page.locator(".palette-champ").fill("joindre");
  await page.waitForFunction(() => (document.querySelector(".palette-resultats li")?.textContent ?? "").includes("Joindre"), null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Enter");
  let joints = null;
  for (let k = 0; k < 30 && !joints; k++) {
    const o = (await modele(pid)).modele.objets;
    const A = o["jonc-a"]?.params.b;
    const B = o["jonc-b"]?.params.a;
    if (A && B && Math.hypot(A.x - (ax + 54), A.y - (ay + 50)) < 1e-6 && Math.hypot(B.x - (ax + 54), B.y - (ay + 50)) < 1e-6) joints = { A, B };
    else await page.waitForTimeout(500);
  }
  check("joindre deux murs : chacun prolongé jusqu'à l'axe de l'autre (angle)", rj.status === 200 && !!joints, `${rj.status} · ${JSON.stringify(joints)}`);
  // Isolement en 3D : seuls les deux murs restent, puis on quitte.
  await selectionner("jonc-a");
  await page.locator(".nav-filtre").fill("jonc-b");
  await page.locator('.nav-objets button[data-objet="jonc-b"]').click({ modifiers: ["Shift"] });
  await page.locator('.barre-mode button:has-text("3D")').click();
  await page.locator('[data-isolement="isoler"]').click();
  await page.locator(".nav-filtre").fill("");
  const isole = await page.locator("[data-isolement-actif]").getAttribute("data-isolement-actif").catch(() => null);
  await page.locator('[data-isolement="quitter"]').click();
  const quitte = (await page.locator("[data-isolement-actif]").count()) === 0;
  // Éclaté par classe (D-075) : présentation choisie, écart réglable.
  await page.locator('select[aria-label="Présentation"]').selectOption("eclate-classes");
  await page.locator("[data-ecart-eclate]").fill("6");
  await page.waitForTimeout(300);
  check("éclaté par classe : présentation choisie, écart réglé", (await page.locator('select[aria-label="Présentation"]').inputValue()) === "eclate-classes" && (await page.locator("[data-ecart-eclate]").inputValue()) === "6");
  await page.locator('select[aria-label="Présentation"]').selectOption("eclate-groupes");
  await page.waitForTimeout(300);
  check("éclaté par groupe : présentation choisie", (await page.locator('select[aria-label="Présentation"]').inputValue()) === "eclate-groupes");
  await page.locator('select[aria-label="Présentation"]').selectOption("batiment");
  // Boîte de coupe et annotation 3D enregistrées avec une vue (D-090).
  await page.locator("[data-boite-coupe]").check();
  await page.locator('[data-boite="x1"]').fill("0.6");
  await page.locator("[data-annoter]").click();
  const can = await page.locator(".vue3d canvas").first().boundingBox();
  let annotee = false;
  // Un point du canevas qui touche une surface (sonde de la scène), puis le clic d'annotation.
  const cible = await page.evaluate(([w, h]) => {
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) { const x = (w * i) / 12; const y = (h * j) / 12; if (window.fadiMesures3D?.sonder?.(x, y)) return { x, y }; }
    return null;
  }, [can.width, can.height]);
  if (cible) {
    await page.mouse.click(can.x + cible.x, can.y + cible.y);
    annotee = await page.locator("[data-annotation-texte]").isVisible().catch(() => false);
  }
  if (annotee) {
    await page.locator("[data-annotation-texte]").fill("Point e2e");
    await page.locator('.vue3d-annotation-saisie button[type="submit"]').click();
  }
  await page.locator("[data-annoter]").click();
  await page.locator("[data-vues-3d] > summary").click().catch(() => {});
  await page.locator('input[aria-label="Nom de la vue 3D"]').fill("Coupe annotée e2e");
  await page.locator('[data-vues-3d] button:has-text("Enregistrer la vue")').click();
  let vueAnn = null;
  for (let k = 0; k < 30 && !vueAnn; k++) {
    vueAnn = Object.values((await modele(pid)).modele.definitions).find((d) => d.classe === "vue-3d" && d.nom === "Coupe annotée e2e") ?? null;
    if (!vueAnn) await page.waitForTimeout(500);
  }
  check("vue 3D : boîte de coupe et annotation enregistrées avec la vue", annotee && vueAnn?.params.boiteCoupe?.x1 === 0.6 && vueAnn?.params.annotations?.[0]?.texte === "Point e2e" && (await page.locator("[data-annotation]").count()) === 1, `${annotee} · ${JSON.stringify(vueAnn?.params?.boiteCoupe ?? null)} · ${JSON.stringify(vueAnn?.params?.annotations ?? null)}`);
  // Échange BCF (D-097) : export des vues 3D (.bcfzip, catalogue), réimport : une vue de plus, annotation et point repris.
  {
    await page.locator(".barre-exports > summary").click();
    const [dlBcf] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator('[data-export="bcf"]').click()]);
    const bcfCatalogue = await page.waitForFunction(() => window.__fadiExports?.some((e) => e.kind === "bcf"), null, { timeout: 15000 }).then(() => true).catch(() => false);
    const chemin = await dlBcf.path();
    const octets = chemin ? readFileSync(chemin) : Buffer.alloc(0);
    const nAvant = Object.values((await modele(pid)).modele.definitions).filter((d) => d.classe === "vue-3d").length;
    await page.locator("[data-vues-3d] > summary").click().catch(() => {});
    if (!(await page.locator("[data-import-bcf]").isVisible().catch(() => false))) await page.locator("[data-vues-3d] > summary").click().catch(() => {});
    await page.locator("[data-import-bcf]").setInputFiles({ name: dlBcf.suggestedFilename(), mimeType: "application/octet-stream", buffer: octets });
    let reprise = null;
    let nApres = nAvant;
    for (let k = 0; k < 30 && !reprise; k++) {
      const defs = Object.values((await modele(pid)).modele.definitions).filter((d) => d.classe === "vue-3d");
      nApres = defs.length;
      reprise = defs.find((d) => d.nom === "Coupe annotée e2e (2)") ?? null;
      if (!reprise) await page.waitForTimeout(500);
    }
    const a0 = vueAnn?.params.annotations?.[0];
    const a1 = reprise?.params.annotations?.[0];
    check("BCF : vues 3D exportées (.bcfzip, catalogue) puis réimportées — annotation et point repris", dlBcf.suggestedFilename().endsWith(".bcfzip") && octets.subarray(0, 2).toString() === "PK" && bcfCatalogue && nApres === 2 * nAvant && a1?.texte === "Point e2e" && !!a0 && Math.abs(a1.position.x - a0.position.x) < 1e-5 && Math.abs(a1.position.z - a0.position.z) < 1e-5, `${dlBcf.suggestedFilename()} · ${bcfCatalogue} · ${nAvant} → ${nApres} · ${JSON.stringify(a1 ?? null)}`);
  }
  await page.locator("[data-boite-coupe]").uncheck();
  // Visite à hauteur d'œil (D-075) : œil à niveau + 1,60 m, avancer au clavier à hauteur constante.
  await page.locator("[data-visite-oeil]").fill("1,6");
  await page.locator('[data-visite="commencer"]').click();
  const v0 = await page.evaluate(() => window.fadiMesures3D?.pointDeVue?.() ?? null);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  const v1 = await page.evaluate(() => window.fadiMesures3D?.pointDeVue?.() ?? null);
  const alt = Number(await page.locator("[data-visite-active]").getAttribute("data-visite-active").catch(() => "NaN"));
  await page.locator('[data-visite="quitter"]').click();
  const avance = v0 && v1 ? Math.hypot(v1.position.x - v0.position.x, v1.position.y - v0.position.y) : 0;
  check("visite à hauteur d'œil : caméra à niveau + 1,60 m, avance de 1 m au clavier sans changer de hauteur", !!v0 && Math.abs(v0.position.z - alt) < 1e-3 && Math.abs(avance - 1) < 0.01 && Math.abs(v1.position.z - v0.position.z) < 1e-6, `${JSON.stringify(v0?.position)} → ${JSON.stringify(v1?.position)} · œil ${alt}`);
  await page.locator('.barre-mode button:has-text("Plan")').click();
  check("isolement : la sélection isolée pour soi en 3D, puis l'affichage complet revient", isole === "2" && quitte, `${isole} · ${quitte}`);
}

// Outil Plancher (D-069) : contour proposé depuis les murs fermés, rive choisie, clic dans la proposition.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  const W = (id, a, b) => ({ type: "mur.tracer", params: { id, niveauId: murA.niveauId, a, b, epaisseur: m(0.2), hauteur: m(3) } });
  let rp = { status: 0 };
  for (let k = 0; k < 5 && rp.status !== 200; k++) rp = await lot(pid, `pl-${Date.now()}-${k}`, (await modele(pid)).revision, [W("pl-w1", P(80, 80), P(86, 80)), W("pl-w2", P(86, 80), P(86, 84)), W("pl-w3", P(86, 84), P(80, 84)), W("pl-w4", P(80, 84), P(80, 80))]);
  await ouvrir(pid);
  await selectionner("pl-w1");
  const avant = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "dalle" && o.params.usage === "plancher").length;
  const ok = await choisirOutil("plancher", "Plancher");
  await page.locator("[data-plancher-rive]").selectOption("exterieur");
  await page.locator("#outil-epaisseurPlancher").fill("0.25");
  await page.waitForSelector("[data-propositions-plancher]", { state: "attached", timeout: 10000 }).catch(() => {});
  // La vue se recentre sur la sélection : attendre qu'elle soit stable avant de viser.
  let b1 = null;
  let b3 = null;
  for (let k = 0; k < 20; k++) {
    const n1 = await page.locator('.plan2d [data-objet="pl-w1"]').boundingBox();
    const n3 = await page.locator('.plan2d [data-objet="pl-w3"]').boundingBox();
    const stable = !!n1 && !!b1 && Math.abs(n1.x - b1.x) < 0.5 && Math.abs(n1.y - b1.y) < 0.5;
    b1 = n1;
    b3 = n3;
    if (stable) break;
    await page.waitForTimeout(200);
  }
  // Aperçu chiffré au survol (D-098) : aire de la proposition, trémies retenues, aire nette.
  let survol = "";
  if (b1 && b3) {
    for (let k = 0; k < 4 && !survol; k++) {
      // Au milieu exact (la proposition peut ne faire que quelques pixels à l'échelle du niveau) : un léger aller-retour.
      await page.mouse.move((b1.x + b1.width / 2 + b3.x + b3.width / 2) / 2 + (k % 2 ? 0.5 : 0), (b1.y + b1.height / 2 + b3.y + b3.height / 2) / 2);
      survol = (await page.locator("[data-plancher-survol]").textContent({ timeout: 2000 }).catch(() => "")) ?? "";
    }
  }
  check("outil Plancher : aperçu chiffré au survol d'une proposition", /m² · 0\/0 trémie\(s\) · net .* m²/.test(survol), survol);
  if (b1 && b3) await page.mouse.click((b1.x + b1.width / 2 + b3.x + b3.width / 2) / 2, (b1.y + b1.height / 2 + b3.y + b3.height / 2) / 2);
  let cree = null;
  for (let k = 0; k < 30 && !cree; k++) {
    const ds = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "dalle" && o.params.usage === "plancher");
    cree = ds.length > avant ? ds.find((d) => d.params.contour.some((q) => Math.abs(q.x - (ax + 79.9)) < 1e-6)) ?? null : null;
    if (!cree) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  check("outil Plancher : contour proposé depuis quatre murs, rive sur la face extérieure, plancher créé au clic", rp.status === 200 && ok && !!cree && cree.params.epaisseur.value === 0.25, `${rp.status} · outil ${ok} · ${JSON.stringify(cree?.params.contour ?? null).slice(0, 160)}`);
}

// Manipulateur 2D (D-070) : flèche X glissée = un seul lot, déplacement en x seulement ; anneau = rotation.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await selectionner("pl-w2");
  await page.waitForSelector("[data-manipulateur]", { timeout: 10000 }).catch(() => {});
  const fx = await page.locator('[data-poignee="x"]').boundingBox();
  const avant = await modele(pid);
  const a0 = avant.modele.objets["pl-w2"].params.a;
  if (fx) {
    await page.mouse.move(fx.x + fx.width / 2, fx.y + fx.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(fx.x + fx.width / 2 + k * 8, fx.y + fx.height / 2 + k * 3);
    await page.mouse.up();
  }
  let a1 = a0;
  let rev = avant.revision;
  for (let k = 0; k < 30 && a1.x === a0.x; k++) {
    const m1 = await modele(pid);
    a1 = m1.modele.objets["pl-w2"].params.a;
    rev = m1.revision;
    if (a1.x === a0.x) await page.waitForTimeout(500);
  }
  check("manipulateur 2D : poignées d'au moins 44 px ; flèche X glissée = un lot, déplacement en x seulement", !!fx && fx.width >= 44 && fx.height >= 44 && a1.x > a0.x && Math.abs(a1.y - a0.y) < 1e-9 && rev === avant.revision + 1, `${JSON.stringify(fx)} · ${a0.x} → ${a1.x} · y ${a0.y} → ${a1.y} · r${avant.revision} → r${rev}`);
  await attendreEnregistre().catch(() => {});
  await selectionner("pl-w2"); // recentre la vue sur le mur déplacé
  await page.waitForTimeout(300);
  const fr = await page.locator('[data-poignee="r"]').boundingBox();
  const fc = await page.locator('[data-poignee="c"]').boundingBox();
  if (fr && fc) {
    const cx = fc.x + fc.width / 2;
    const cy = fc.y + fc.height / 2;
    const rx = fr.x + fr.width / 2;
    const ry = fr.y + fr.height / 2;
    const r = Math.hypot(rx - cx, ry - cy);
    const t0 = Math.atan2(ry - cy, rx - cx);
    await page.mouse.move(rx, ry);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) { const t = t0 - (k / 12) * (Math.PI / 2); await page.mouse.move(cx + r * Math.cos(t), cy + r * Math.sin(t)); }
    await page.mouse.up();
  }
  let journal = "";
  for (let k = 0; k < 30 && !/Tourner/.test(journal); k++) {
    journal = (await api("get", `/projects/${pid}/atelier/journal`)).body?.entrees?.at(-1)?.label ?? "";
    if (!/Tourner/.test(journal)) await page.waitForTimeout(500);
  }
  check("manipulateur 2D : l'anneau tourne la sélection (90°) en un lot", /Tourner 1 objet de 90° \(manipulateur\)/.test(journal), journal);
}

// Espace programmé depuis l'inspecteur d'une pièce (D-071) : lecture du cas de programme, état dit sans invention.
{
  await page.keyboard.press("Escape");
  await selectionner("piece-e2e");
  await page.locator("[data-espace-programme] > summary").click();
  await page.waitForFunction(() => /programme appliqué|Pièce liée|liée à/.test(document.querySelector("[data-espace-programme]")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  const txt = (await page.locator("[data-espace-programme]").textContent()) ?? "";
  let lie = "sans programme";
  if ((await page.locator("[data-espace-choix] option").count()) > 1) {
    const valeur = await page.locator("[data-espace-choix] option").nth(1).getAttribute("value");
    await page.locator("[data-espace-choix]").selectOption(valeur);
    await page.locator('[data-espace-programme] button[type="submit"]').click();
    lie = await page.waitForSelector(`[data-espace-lie="${valeur}"]`, { timeout: 15000 }).then(() => "lié", () => "non lié");
  }
  check("espace programmé : la pièce liée depuis son inspecteur à un espace du programme appliqué", /Aucun programme appliqué/.test(txt) || lie === "lié", `${lie} · ${txt.slice(0, 100)}`);
}

// Motif de hachure (D-072) : choisi dans l'inspecteur, dessiné au plan.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  let rh = { status: 0 };
  for (let k = 0; k < 5 && rh.status !== 200; k++) rh = await lot(pid, `h-${Date.now()}-${k}`, (await modele(pid)).revision, [{ type: "esquisse.hachure", params: { id: "hach-e2e", niveauId: murA.niveauId, points: [P(100, 100), P(103, 100), P(103, 102), P(100, 102)] } }]);
  await ouvrir(pid);
  await selectionner("hach-e2e");
  await page.locator('select[data-champ="motif"]').selectOption("croisee");
  await page.waitForSelector('.plan2d [data-motif="croisee"]', { state: "attached", timeout: 15000 }).catch(() => {});
  let motif = null;
  for (let k = 0; k < 30 && motif !== "croisee"; k++) {
    motif = (await modele(pid)).modele.objets["hach-e2e"]?.params.motif ?? null;
    if (motif !== "croisee") await page.waitForTimeout(500);
  }
  check("hachure : motif « croisée » choisi dans l'inspecteur, enregistré et dessiné", rh.status === 200 && motif === "croisee" && (await page.locator('.plan2d [data-motif="croisee"]').count()) > 0, `${rh.status} · ${motif}`);
}

// Contrainte de rayon sur un cercle (D-074) : depuis l'inspecteur, rayon piloté.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  let rc = { status: 0 };
  for (let k = 0; k < 5 && rc.status !== 200; k++) rc = await lot(pid, `cc-${Date.now()}-${k}`, (await modele(pid)).revision, [{ type: "esquisse.cercle", params: { id: "cercle-e2e", niveauId: murA.niveauId, centre: { x: ax + 110, y: ay + 100, frame: "local", unit: "m" }, rayon: m(1) } }]);
  await ouvrir(pid);
  await selectionner("cercle-e2e");
  await page.locator(".inspecteur-contraintes > summary").click();
  await page.locator("[data-contrainte-type]").selectOption("rayon");
  await page.locator("[data-contrainte-valeur]").fill("1,75");
  await page.locator('.ajout-contrainte button:has-text("Ajouter la contrainte")').click();
  let rayon = null;
  for (let k = 0; k < 30 && rayon !== 1.75; k++) {
    rayon = (await modele(pid)).modele.objets["cercle-e2e"]?.params.rayon?.value ?? null;
    if (rayon !== 1.75) await page.waitForTimeout(500);
  }
  check("contrainte de rayon : ajoutée depuis l'inspecteur du cercle, rayon piloté à 1,75 m", rc.status === 200 && rayon === 1.75, `${rc.status} · ${rayon}`);
}

// Propriétés en tableau (D-076) : une colonne ajoutée, deux cellules saisies, un seul lot.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const rev0 = (await modele(pid)).revision;
  await selectionner("jonc-a");
  await page.locator(".nav-filtre").fill("jonc-b");
  await page.locator('.nav-objets button[data-objet="jonc-b"]').click({ modifiers: ["Shift"] });
  await page.locator("[data-tableau-proprietes] > summary").click();
  await page.locator("[data-tableau-colonne]").fill("Repère e2e");
  await page.locator('[data-tableau-proprietes] button:has-text("Ajouter la colonne")').click();
  await page.locator('[data-cellule="jonc-a|Repère e2e"]').fill("M-A");
  await page.locator('[data-cellule="jonc-b|Repère e2e"]').fill("M-B");
  await page.locator("[data-tableau-enregistrer]").click();
  let vals = [];
  let rev = rev0;
  for (let k = 0; k < 30 && vals.join() !== "M-A,M-B"; k++) {
    const md = await modele(pid);
    vals = ["jonc-a", "jonc-b"].map((id) => md.modele.objets[id]?.proprietes["Repère e2e"]?.valeur);
    rev = md.revision;
    if (vals.join() !== "M-A,M-B") await page.waitForTimeout(500);
  }
  // Un seul lot : la dernière entrée de l'historique des deux objets est la même révision (indépendant d'une révision
  // de départ lue trop tôt).
  const derniere = async (id) => { const h = (await api("get", `/projects/${pid}/atelier/objets/${id}/historique`)).body?.entrees ?? []; return h[h.length - 1]?.revision ?? null; };
  const [ra, rb] = [await derniere("jonc-a"), await derniere("jonc-b")];
  check("propriétés en tableau : deux cellules saisies, enregistrées en un seul lot", vals.join() === "M-A,M-B" && ra !== null && ra === rb && rev >= ra && ra > rev0 - 1, `${vals.join()} · r${rev0} → r${rev} · historique ${ra}/${rb}`);
}

// Manipulateur 2D : valeur tapée pendant le glissement, pivot déplacé (D-077).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await selectionner("pl-w3");
  await page.waitForSelector("[data-manipulateur]", { timeout: 10000 }).catch(() => {});
  const a0 = (await modele(pid)).modele.objets["pl-w3"].params.a;
  const fx = await page.locator('[data-poignee="x"]').boundingBox();
  if (fx) {
    await page.mouse.move(fx.x + fx.width / 2, fx.y + fx.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 4; k++) await page.mouse.move(fx.x + fx.width / 2 + k * 5, fx.y + fx.height / 2);
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await page.mouse.up();
  }
  let a1 = a0;
  for (let k = 0; k < 30 && a1.x === a0.x; k++) {
    a1 = (await modele(pid)).modele.objets["pl-w3"].params.a;
    if (a1.x === a0.x) await page.waitForTimeout(500);
  }
  check("manipulateur 2D : « 2 » tapé pendant le glissement de la flèche X = déplacement de 2 m exactement", Math.abs(a1.x - a0.x - 2) < 1e-9 && a1.y === a0.y, `${a0.x} → ${a1.x}`);
  await attendreEnregistre().catch(() => {});
  await selectionner("pl-w3");
  const fp = await page.locator('[data-poignee="p"]').boundingBox();
  if (fp) {
    await page.mouse.move(fp.x + fp.width / 2, fp.y + fp.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(fp.x + fp.width / 2 - k * 10, fp.y + fp.height / 2 + k * 6);
    await page.mouse.up();
  }
  const deplace = (await page.locator(".manip-pivot-deplace").count()) === 1;
  const w0 = (await modele(pid)).modele.objets["pl-w3"].params;
  const fr = await page.locator('[data-poignee="r"]').boundingBox();
  if (fr) {
    await page.mouse.move(fr.x + fr.width / 2, fr.y + fr.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 4; k++) await page.mouse.move(fr.x + fr.width / 2 - k * 6, fr.y + fr.height / 2 - k * 4);
    await page.keyboard.type("90");
    await page.keyboard.press("Enter");
    await page.mouse.up();
  }
  let w1 = w0;
  for (let k = 0; k < 30 && w1.a.x === w0.a.x && w1.a.y === w0.a.y; k++) {
    w1 = (await modele(pid)).modele.objets["pl-w3"].params;
    if (w1.a.x === w0.a.x && w1.a.y === w0.a.y) await page.waitForTimeout(500);
  }
  const mil = (w) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
  const longueur = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  check("manipulateur 2D : pivot déplacé, rotation de 90° tapée autour de lui (le milieu du mur bouge, la longueur reste)", deplace && Math.hypot(mil(w1).x - mil(w0).x, mil(w1).y - mil(w0).y) > 0.01 && Math.abs(longueur(w1) - longueur(w0)) < 1e-6 && Math.abs((w1.b.x - w1.a.x) * (w0.b.x - w0.a.x) + (w1.b.y - w1.a.y) * (w0.b.y - w0.a.y)) < 1e-6, `pivot ${deplace} · ${JSON.stringify(mil(w0))} → ${JSON.stringify(mil(w1))}`);
}

// Forme reconnue proposée puis acceptée, gomme (D-079).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  const rond = Array.from({ length: 16 }, (_, i) => P(120 + 1.5 * Math.cos((i * Math.PI) / 8), 100 + 1.5 * Math.sin((i * Math.PI) / 8)));
  let rr = { status: 0 };
  for (let k = 0; k < 5 && rr.status !== 200; k++) rr = await lot(pid, `rf-${Date.now()}-${k}`, (await modele(pid)).revision, [
    { type: "esquisse.polyligne", params: { id: "croquis-e2e", niveauId: murA.niveauId, points: rond, ferme: true } },
    { type: "esquisse.ligne", params: { id: "gomme-e2e", niveauId: murA.niveauId, points: [P(130, 100), P(132, 100)] } },
  ]);
  await ouvrir(pid);
  await selectionner("croquis-e2e");
  await page.locator("[data-reconnaissance] > summary").click();
  await page.locator('[data-forme-reconnue="cercle"] button').click();
  let forme = null;
  for (let k = 0; k < 30 && forme !== "cercle"; k++) {
    forme = (await modele(pid)).modele.objets["croquis-e2e"]?.params.forme ?? null;
    if (forme !== "cercle") await page.waitForTimeout(500);
  }
  check("forme reconnue : le croquis presque circulaire proposé en cercle, remplacé sur clic (même identifiant)", rr.status === 200 && forme === "cercle", `${rr.status} · ${forme}`);
  await selectionner("gomme-e2e");
  const b = await page.locator('.plan2d [data-objet="gomme-e2e"]').boundingBox();
  const ok = await choisirOutil("gomme", "Gomme");
  if (b) {
    const x = b.x + b.width / 2;
    await page.mouse.move(x, b.y - 30);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(x, b.y - 30 + k * 6);
    await page.mouse.up();
  }
  let gommee = false;
  for (let k = 0; k < 30 && !gommee; k++) {
    gommee = !(await modele(pid)).modele.objets["gomme-e2e"];
    if (!gommee) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  check("gomme : le trait traversé est supprimé", ok && gommee, `outil ${ok} · ${JSON.stringify(b)}`);
}

// Tangente imposée à une courbe (D-082).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const P = (x, y) => ({ x: ax + x, y: ay + y, frame: "local", unit: "m" });
  let rs = { status: 0 };
  for (let k = 0; k < 5 && rs.status !== 200; k++) rs = await lot(pid, `sp-${Date.now()}-${k}`, (await modele(pid)).revision, [{ type: "esquisse.spline", params: { id: "courbe-e2e", niveauId: murA.niveauId, points: [P(140, 100), P(144, 100), P(148, 100)] } }]);
  await ouvrir(pid);
  await selectionner("courbe-e2e");
  await page.locator("[data-tangentes] > summary").click();
  await page.locator("[data-tangente-angle]").fill("90");
  await page.locator("[data-tangente-longueur]").fill("2");
  await page.locator("[data-tangente-imposer]").click();
  let t = null;
  for (let k = 0; k < 30 && !t; k++) {
    t = (await modele(pid)).modele.objets["courbe-e2e"]?.params.tangentes?.[0] ?? null;
    if (!t) await page.waitForTimeout(500);
  }
  check("courbe : tangente imposée au premier point depuis l'inspecteur (90°, 2 m)", rs.status === 200 && !!t && Math.abs(t.x) < 1e-9 && Math.abs(t.y - 2) < 1e-9, `${rs.status} · ${JSON.stringify(t)}`);
}

// Fenêtre d'angle et fenêtres jumelées (D-083).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await selectionner("jonc-a");
  await page.locator(".nav-filtre").fill("jonc-b");
  await page.locator('.nav-objets button[data-objet="jonc-b"]').click({ modifiers: ["Shift"] });
  // Panneau visible seulement : l'inspecteur peut exister en deux exemplaires (l'un masqué selon la mise en page).
  const angle = page.locator("[data-ouverture-angle]:visible").first();
  await angle.locator("> summary").click();
  for (const [k, v] of [["largeurA", "1,2"], ["largeurB", "1,2"], ["hauteur", "1,4"], ["allege", "0,9"]]) await angle.locator(`[data-angle-champ="${k}"]`).fill(v);
  await angle.locator("[data-angle-poser]").click();
  let surA = null;
  let surB = null;
  for (let k = 0; k < 30 && !(surA && surB); k++) {
    const os = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "fenetre");
    surA = os.find((o) => o.params.murHoteId === "jonc-a") ?? null;
    surB = os.find((o) => o.params.murHoteId === "jonc-b") ?? null;
    if (!(surA && surB)) await page.waitForTimeout(500);
  }
  check("fenêtre d'angle : deux fenêtres groupées sur les deux murs joints", !!surA && !!surB && surA.groupeId === surB.groupeId && !!surA.groupeId, `${surA?.id} · ${surB?.id}`);
  let jumelles = 0;
  if (surA) {
    await page.keyboard.press("Escape");
    await attendreEnregistre().catch(() => {});
    await selectionner(surA.id);
    await page.locator("[data-jumeler] > summary").click();
    await page.locator("[data-jumeler-meneau]").fill("0,1");
    await page.locator('[data-jumeler] button:has-text("Jumeler")').click();
    for (let k = 0; k < 30 && jumelles < 2; k++) {
      jumelles = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "fenetre" && o.params.murHoteId === "jonc-a").length;
      if (jumelles < 2) await page.waitForTimeout(500);
    }
  }
  check("fenêtres jumelées : la fenêtre partagée en deux, meneau de 0,10 m", jumelles === 2, String(jumelles));
  // Menuiserie paramétrée (D-101) : dormant, vitrage et deux vantaux saisis dans l'inspecteur de la fenêtre B.
  let men = null;
  if (surB) {
    await page.keyboard.press("Escape");
    await attendreEnregistre().catch(() => {});
    await selectionner(surB.id);
    await page.locator("[data-menuiserie] > summary").click();
    for (const [k, v] of [["profil", "0,06"], ["profondeur", "0,07"], ["vitrage", "0,024"], ["composition", "4/16/4"]]) await page.locator(`[data-menuiserie-champ="${k}"]`).fill(v);
    await page.locator('[data-menuiserie-champ="vantaux"]').selectOption("2");
    await page.locator("[data-menuiserie-appliquer]").click();
    for (let k = 0; k < 30 && !men; k++) {
      men = (await modele(pid)).modele.objets[surB.id]?.params.menuiserie ?? null;
      if (!men) await page.waitForTimeout(500);
    }
  }
  check("menuiserie de fenêtre : dormant, vitrage 4/16/4 et deux vantaux enregistrés", men?.dormant?.largeur.value === 0.06 && men?.vitrage?.composition === "4/16/4" && men?.vantaux === 2, JSON.stringify(men));
}

// Escalier à volées et palier tracé au plan (D-084).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const avant = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "escalier").length;
  const ok = await choisirOutil("escalier à volées", "Escalier à volées");
  for (const [k, v] of [["largeurVolees", "1"], ["hauteurVolees", "3"], ["contremarchesVolees", "18"], ["epaisseurPalier", "0.2"]]) await page.locator(`#outil-${k}`).fill(v);
  const z = await page.locator(".plan2d").boundingBox();
  for (const [fx, fy] of [[0.55, 0.7], [0.8, 0.7], [0.8, 0.45]]) {
    await page.mouse.click(z.x + z.width * fx, z.y + z.height * fy);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Enter");
  let apres = avant;
  for (let k = 0; k < 30 && apres < avant + 2; k++) {
    apres = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "escalier").length;
    if (apres < avant + 2) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  check("escalier à volées : deux volées et un palier posés au plan (trois points, Entrée)", ok && apres === avant + 2, `outil ${ok} · ${avant} → ${apres}`);
}

// Escalier balancé tracé au plan (D-123) : trois points, Entrée ; une marche balancée par contremarche.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const compter = async () => Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "solide" && o.params.role === "marche-balancee").length;
  const avant = await compter();
  const ok = await choisirOutil("marches balancées", "Escalier balancé", "escalier-balance");
  for (const [k, v] of [["largeurVolees", "1"], ["hauteurVolees", "2.8"], ["contremarchesVolees", "14"], ["epaisseurMarche", "0.05"], ["ligneFoulee", "0.5"], ["marchesBalancees", "4"]]) await page.locator(`#outil-${k}`).fill(v);
  const z = await page.locator(".plan2d").boundingBox();
  for (const [fx, fy] of [[0.3, 0.75], [0.6, 0.75], [0.6, 0.35]]) {
    await page.mouse.click(z.x + z.width * fx, z.y + z.height * fy);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Enter");
  let apres = avant;
  for (let k = 0; k < 30 && apres < avant + 14; k++) {
    apres = await compter();
    if (apres < avant + 14) await page.waitForTimeout(500);
  }
  const aide = (await page.locator(".etat-aide").textContent()) ?? "";
  await page.keyboard.press("Escape");
  check("escalier balancé : quatorze marches posées au plan (trois points, Entrée)", ok && apres === avant + 14, `outil ${ok} · ${avant} → ${apres} · ${aide}`);
}

// Loupe de précision au doigt (D-085) : appui tenu en traçant une ligne, la loupe paraît ; relâcher pose le point.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const ok = await choisirOutil("ligne", "Ligne", "ligne");
  const z = await page.locator(".plan2d").boundingBox();
  const toucher = async (type, x, y) => page.evaluate(([t, cx, cy]) => {
    const el = document.querySelector(".plan2d");
    el.dispatchEvent(new PointerEvent(t, { pointerType: "touch", pointerId: 77, isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: t === "pointerup" ? 0 : 1, bubbles: true }));
  }, [type, x, y]);
  const avant = Object.keys((await modele(pid)).modele.objets).length;
  const x0 = z.x + z.width * 0.35;
  const y0 = z.y + z.height * 0.8;
  await toucher("pointerdown", x0, y0);
  await page.waitForTimeout(500);
  const loupe = (await page.locator("[data-loupe]").count()) === 1;
  await toucher("pointermove", x0 + 3, y0 + 2);
  await toucher("pointerup", x0 + 3, y0 + 2);
  const sansLoupe = (await page.locator("[data-loupe]").count()) === 0;
  await page.mouse.click(x0 + 120, y0);
  let apres = avant;
  for (let k = 0; k < 30 && apres === avant; k++) {
    apres = Object.keys((await modele(pid)).modele.objets).length;
    if (apres === avant) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  check("loupe au doigt : appui tenu → loupe ; relâcher pose le premier point de la ligne", ok && loupe && sansLoupe && apres === avant + 1, `outil ${ok} · loupe ${loupe} · ${sansLoupe} · ${avant} → ${apres}`);
}

// Mur courbe tracé au plan (D-086).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const avant = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur" && o.params.renflement).length;
  const ok = await choisirOutil("mur courbe", "Mur courbe");
  await page.locator("#outil-epaisseur").fill("0.2");
  await page.locator("#outil-hauteur").fill("3");
  const z = await page.locator(".plan2d").boundingBox();
  for (const [fx, fy] of [[0.2, 0.85], [0.4, 0.85], [0.3, 0.8]]) {
    await page.mouse.click(z.x + z.width * fx, z.y + z.height * fy);
    await page.waitForTimeout(150);
  }
  const aideMur = (await page.locator(".etat-aide, .etat-erreur").first().textContent().catch(() => "")) ?? "";
  let apres = avant;
  for (let k = 0; k < 30 && apres === avant; k++) {
    apres = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur" && o.params.renflement).length;
    if (apres === avant) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  check("mur courbe : tracé en trois clics (début, fin, point de l'arc)", ok && apres === avant + 1, `outil ${ok} · ${avant} → ${apres} · ${aideMur}`);
  // Fenêtre posée sur l'arc (D-095) : clic sur le point de passage de l'arc.
  const courbes = new Set(Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur" && o.params.renflement).map((o) => o.id));
  const okF = await choisirOutil("fenêtre", "Fenêtre", "fenetre");
  await page.mouse.click(z.x + z.width * 0.3, z.y + z.height * 0.8);
  let fen = null;
  for (let k = 0; k < 30 && !fen; k++) {
    fen = Object.values((await modele(pid)).modele.objets).find((o) => o.classe === "fenetre" && courbes.has(o.params.murHoteId)) ?? null;
    if (!fen) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  const vide = fen ? await page.locator(`.plan2d [data-objet="${fen.id}"]`).count() : 0;
  check("fenêtre posée sur un mur courbe, dessinée au plan", okF && !!fen && Math.abs(fen.params.position - 0.5) < 0.1 && vide === 1, `outil ${okF} · ${fen?.id} · ${fen?.params.position} · ${vide}`);
}

// Repère de saisie (D-091) : posé en deux clics, affiché, retiré par « Repère global ».
{
  await page.keyboard.press("Escape");
  const ok = await choisirOutil("repère de saisie", "Repère de saisie", "repere-saisie");
  const z = await page.locator(".plan2d").boundingBox();
  await page.mouse.click(z.x + z.width * 0.5, z.y + z.height * 0.9);
  await page.mouse.click(z.x + z.width * 0.6, z.y + z.height * 0.8);
  const pose = (await page.locator("[data-repere-saisie]").count()) === 1;
  await page.locator("[data-repere-global]").click();
  const retire = (await page.locator("[data-repere-saisie]").count()) === 0;
  await page.keyboard.press("Escape");
  check("repère de saisie : posé en deux clics, affiché au plan, retiré par « Repère global »", ok && pose && retire, `${ok} · ${pose} · ${retire}`);
}

// Escalier hélicoïdal au plan (D-092).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const avant = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "solide" && o.params.role === "marche-helicoidale").length;
  const ok = await choisirOutil("escalier hélicoïdal", "Escalier hélicoïdal", "escalier-helicoidal");
  for (const [k, v] of [["rayonInterieurHelice", "0.1"], ["balayageHelice", "270"], ["hauteurHelice", "3"], ["contremarchesHelice", "15"], ["epaisseurMarche", "0.05"]]) await page.locator(`#outil-${k}`).fill(v);
  const z = await page.locator(".plan2d").boundingBox();
  await page.mouse.click(z.x + z.width * 0.7, z.y + z.height * 0.85);
  await page.mouse.click(z.x + z.width * 0.75, z.y + z.height * 0.85);
  let apres = avant;
  for (let k = 0; k < 30 && apres === avant; k++) {
    apres = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "solide" && o.params.role === "marche-helicoidale").length;
    if (apres === avant) await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  check("escalier hélicoïdal : quinze marches posées (centre, bord extérieur)", ok && apres === avant + 15, `outil ${ok} · ${avant} → ${apres}`);
}

// Hachure associée à une pièce (D-092) : suit le contour quand la pièce bouge.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await selectionner("piece-e2e");
  const avant = Object.values((await modele(pid)).modele.objets).filter((o) => o.params?.sourceId === "piece-e2e").length;
  await page.locator('[data-hachurer="piece-e2e"]').click();
  let h = null;
  for (let k = 0; k < 30 && !h; k++) {
    h = Object.values((await modele(pid)).modele.objets).find((o) => o.params?.sourceId === "piece-e2e") ?? null;
    if (!h) await page.waitForTimeout(500);
  }
  let suivie = false;
  if (h) {
    await attendreEnregistre().catch(() => {});
    const x0 = h.params.points[0].x;
    const r = await lot(pid, `hm-${Date.now()}`, (await modele(pid)).revision, [{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["piece-e2e"] }]);
    const apres = (await modele(pid)).modele.objets[h.id];
    suivie = r.status === 200 && Math.abs(apres.params.points[0].x - x0 - 1) < 1e-9;
  }
  check("hachure associée : créée depuis l'inspecteur de la pièce, elle suit la pièce déplacée", avant === 0 && !!h && suivie, `${h?.id} · ${suivie}`);
}

// Poignées de tangente au plan (D-093) : glisser la poignée d'un point impose sa tangente (un lot) ; Alt + clic la libère.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const r0 = await lot(pid, `sp-${Date.now()}`, (await modele(pid)).revision, [{ type: "esquisse.spline", params: { id: "sp-e2e", niveauId: murA.niveauId, points: [P(-50, -50), P(-47, -47), P(-44, -50)], ferme: false } }]);
  await page.reload();
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await attendreEnregistre().catch(() => {});
  await selectionner("sp-e2e");
  await page.waitForSelector('[data-tangente-poignee="1"]', { timeout: 10000 }).catch(() => {});
  const nb = await page.locator("[data-tangente-poignee]").count();
  // Zoom à la molette sur la courbe jusqu'à ce que les poignées soient bien séparées.
  for (let k = 0; k < 12; k++) {
    const a = await page.locator('[data-tangente-poignee="1"]').boundingBox();
    const b = await page.locator('[data-tangente-poignee="2"]').boundingBox();
    if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) > 80) break;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(100);
  }
  const h = await page.locator('[data-tangente-poignee="1"]').boundingBox();
  const avant = await modele(pid);
  let t = null;
  let rev = avant.revision;
  if (h) {
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(x + k * 4, y - k * 6);
    await page.mouse.up();
    for (let k = 0; k < 30 && !t; k++) {
      const m1 = await modele(pid);
      t = m1.modele.objets["sp-e2e"].params.tangentes ?? null;
      rev = m1.revision;
      if (!t) await page.waitForTimeout(500);
    }
  }
  const imposee = !!t && t[0] === null && t[2] === null && !!t[1] && t[1].y > 0;
  let liberee = false;
  if (imposee) {
    await attendreEnregistre().catch(() => {});
    const h2 = await page.locator('[data-tangente-poignee="1"]').boundingBox();
    if (h2) {
      await page.keyboard.down("Alt");
      await page.mouse.click(h2.x + h2.width / 2, h2.y + h2.height / 2);
      await page.keyboard.up("Alt");
      for (let k = 0; k < 30 && !liberee; k++) {
        liberee = !(await modele(pid)).modele.objets["sp-e2e"].params.tangentes;
        if (!liberee) await page.waitForTimeout(500);
      }
    }
  }
  check("poignées de tangente : une par point ; glisser impose la tangente (un lot), Alt + clic la libère", r0.status === 200 && nb === 3 && imposee && rev === avant.revision + 1 && liberee, `${r0.status} · ${nb} · ${JSON.stringify(t)} · r${avant.revision} → r${rev} · ${liberee}`);
}

// Raccord multiple (D-094) : quatre lignes jointives sélectionnées, palette « Raccorder » : quatre arcs en un lot.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const cotes = [[-70, -70, -66, -70], [-66, -70, -66, -67], [-66, -67, -70, -67], [-70, -67, -70, -70]];
  const r0 = await lot(pid, `rm-${Date.now()}`, (await modele(pid)).revision, cotes.map(([ax2, ay2, bx, by], i) => ({ type: "esquisse.ligne", params: { id: `rac-${i + 1}`, niveauId: murA.niveauId, points: [P(ax2, ay2), P(bx, by)] } })));
  await page.reload();
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await attendreEnregistre().catch(() => {});
  const avant = await modele(pid);
  const arcsAvant = Object.values(avant.modele.objets).filter((o) => o.classe === "esquisse" && o.params.forme === "arc").length;
  await selectionner("rac-1");
  for (const id of ["rac-2", "rac-3", "rac-4"]) {
    await page.locator(".nav-filtre").fill(id);
    await page.locator(`.nav-objets button[data-objet="${id}"]`).click({ modifiers: ["Shift"] });
  }
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+k");
  await page.locator(".palette-champ").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await page.locator(".palette-champ").fill("raccorder");
  await page.waitForFunction(() => (document.querySelector(".palette-resultats li")?.textContent ?? "").includes("Raccorder"), null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Enter");
  let arcs = arcsAvant;
  let rev = avant.revision;
  for (let k = 0; k < 30 && arcs === arcsAvant; k++) {
    const md = await modele(pid);
    arcs = Object.values(md.modele.objets).filter((o) => o.classe === "esquisse" && o.params.forme === "arc").length;
    rev = md.revision;
    if (arcs === arcsAvant) await page.waitForTimeout(500);
  }
  check("raccord multiple : quatre lignes jointives, quatre arcs créés en un seul lot", r0.status === 200 && arcs === arcsAvant + 4 && rev === avant.revision + 1, `${r0.status} · arcs ${arcsAvant} → ${arcs} · r${avant.revision} → r${rev}`);
}

// Calque gelé (D-103) : geler depuis le navigateur retire ses objets du plan ; dégeler les rend.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const rg = await lot(pid, `gel-${Date.now()}`, (await modele(pid)).revision, [
    { type: "calque.creer", params: { id: "gel-e2e", nom: "Gel e2e" } },
    { type: "esquisse.ligne", params: { id: "trait-gel", niveauId: murA.niveauId, points: [P(ax - 95, ay - 95), P(ax - 92, ay - 95)], calqueId: "gel-e2e" } },
  ]);
  await ouvrir(pid);
  const avant = await page.locator('.plan2d [data-objet="trait-gel"]').count();
  await page.locator('[data-calque-geler="gel-e2e"]').click();
  let gele = false;
  for (let k = 0; k < 30 && !gele; k++) {
    gele = (await modele(pid)).modele.calques["gel-e2e"]?.gele === true;
    if (!gele) await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => !document.querySelector('.plan2d [data-objet="trait-gel"]'), null, { timeout: 5000 }).catch(() => {});
  const pendant = await page.locator('.plan2d [data-objet="trait-gel"]').count();
  await attendreEnregistre().catch(() => {});
  await page.locator('[data-calque-geler="gel-e2e"]').click();
  await page.waitForSelector('.plan2d [data-objet="trait-gel"]', { state: "attached", timeout: 10000 }).catch(() => {});
  const apres = await page.locator('.plan2d [data-objet="trait-gel"]').count();
  check("calque gelé : ses objets quittent le plan, dégelé ils reviennent", rg.status === 200 && avant === 1 && gele && pendant === 0 && apres === 1, `${rg.status} · ${avant} → ${pendant} → ${apres} · ${gele}`);
}

// Rejet de la paume (D-109) : stylet posé, un glisser du doigt ne déplace pas la vue ; une seconde après, si.
// (Outil de tracé : au doigt, un glisser déplace la vue.)
{
  await page.keyboard.press("Escape");
  await choisirOutil("ligne", "Ligne", "ligne");
  const zone = await page.locator(".plan2d").boundingBox();
  const cible = '.plan2d .plan-objets [data-objet]';
  const avant = await page.locator(cible).first().boundingBox();
  const geste = (type, id, x0, y0, dx) => page.evaluate(([type, id, x0, y0, dx]) => {
    const el = document.querySelector(".plan2d");
    const ev = (nom, x, y) => el.dispatchEvent(new PointerEvent(nom, { pointerId: id, pointerType: type, clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: nom === "pointerup" ? 0 : 1 }));
    ev("pointerdown", x0, y0);
    for (let k = 1; k <= 5; k++) ev("pointermove", x0 + (dx * k) / 5, y0);
    ev("pointerup", x0 + dx, y0);
  }, [type, id, x0, y0, dx]);
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;
  await page.evaluate(([x, y]) => document.querySelector(".plan2d").dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, pointerType: "pen", clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: 1 })), [cx - 200, cy - 150]);
  await geste("touch", 8, cx, cy, 120);
  const pendant = await page.locator(cible).first().boundingBox();
  await page.evaluate(([x, y]) => document.querySelector(".plan2d").dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, pointerType: "pen", clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: 0 })), [cx - 200, cy - 150]);
  await page.waitForTimeout(1200);
  await geste("touch", 9, cx, cy, 120);
  await page.waitForTimeout(200);
  const apres = await page.locator(cible).first().boundingBox();
  await page.keyboard.press("Escape");
  check("rejet de la paume : doigt ignoré pendant le stylet, glisser du doigt actif ensuite", !!avant && !!pendant && Math.abs(pendant.x - avant.x) < 1 && !!apres && Math.abs(apres.x - avant.x) > 50, `${avant?.x} → ${pendant?.x} → ${apres?.x}`);
}

// Classer par règle (D-112) : murs du niveau actif, proposition affichée, un seul lot.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const avant = await modele(pid);
  await page.locator("[data-classer-regle] > summary").click();
  await page.locator('[data-regle="classe"]').selectOption("mur");
  await page.locator("[data-classer-regle] input[type=checkbox]").first().check();
  await page.locator('[data-regle="systeme"]').fill("E2E");
  await page.locator('[data-regle="code"]').fill("R-1");
  const n = Number(await page.locator("[data-regle-proposition]").getAttribute("data-regle-proposition").catch(() => "0"));
  await page.locator("[data-regle-appliquer]").click();
  let classes = 0;
  let rev = avant.revision;
  for (let k = 0; k < 30 && classes < n; k++) {
    const md = await modele(pid);
    classes = Object.values(md.modele.objets).filter((o) => o.proprietes?.["classification:E2E"]?.valeur === "R-1").length;
    rev = md.revision;
    if (classes < n) await page.waitForTimeout(500);
  }
  check("classer par règle : murs du niveau actif proposés puis classés en un seul lot", n > 0 && classes === n && rev === avant.revision + 1, `${n} · ${classes} · r${avant.revision} → r${rev}`);
}

// Réseau associatif (D-115) : créé par un lot, recalculé depuis l'inspecteur d'une copie (nombre, pas).
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const r0 = await lot(pid, `res-${Date.now()}`, (await modele(pid)).revision, [
    { type: "poteau.creer", params: { id: "pot-res", niveauId: murA.niveauId, point: P(ax - 99, ay - 99), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
    { type: "transformer.repeter", params: { nombre: 3, dx: 2, dy: 0, associatif: true }, cibles: ["pot-res"] },
  ]);
  await ouvrir(pid);
  const g = Object.values((await modele(pid)).modele.groupes).find((x) => x.reseau?.sources?.includes("pot-res"));
  let apres = null;
  if (g) {
    await selectionner(g.reseau.copies[0]);
    await page.locator(`[data-groupe="${g.id}"] > summary`).click().catch(() => {});
    await page.locator('[data-reseau-champ="nombre"]').fill("2");
    await page.locator('[data-reseau-champ="dx"]').fill("3");
    await page.locator("[data-reseau-recalculer]").click();
    for (let k = 0; k < 30 && !apres; k++) {
      const gr = (await modele(pid)).modele.groupes[g.id];
      if (gr?.reseau?.nombre === 2) apres = gr;
      else await page.waitForTimeout(500);
    }
  }
  const xs = apres ? apres.reseau.copies.length : 0;
  check("réseau associatif : recalculé depuis l'inspecteur (2 copies au pas de 3 m)", r0.status === 200 && !!g && apres?.reseau?.dx === 3 && xs === 2, `${r0.status} · ${g?.id} · ${JSON.stringify(apres?.reseau ?? null).slice(0, 160)}`);
}

// Étirer par fenêtre polygonale (D-116) : lasso autour d'une extrémité, base puis destination ; l'autre reste.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const r0 = await lot(pid, `fen-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "ligne-fen", classe: "esquisse", niveauId: murA.niveauId, params: { forme: "ligne", points: [P(ax - 140, ay + 140), P(ax - 136, ay + 140)], ferme: false } } },
  ]);
  await ouvrir(pid);
  await selectionner("ligne-fen");
  const b = await zoomerSur('.plan2d [data-objet="ligne-fen"]', 300);
  let fini = null;
  if (b && (await choisirOutil("fenêtre polygonale", "Étirer par fenêtre", "etirer-fenetre"))) {
    const xr = b.x + b.width;
    const yc = b.y + b.height / 2;
    await page.mouse.move(xr - 20, yc - 20);
    await page.mouse.down();
    for (const [x, y] of [[xr + 25, yc - 25], [xr + 20, yc + 20], [xr - 25, yc + 25], [xr - 20, yc - 20]]) await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.up();
    const fenetre = await page.locator("[data-fenetre-etirer]").count();
    await page.mouse.click(xr, yc);
    await page.waitForFunction(() => /destination/.test(document.querySelector(".etat-aide")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    await page.mouse.click(xr, yc - 80);
    for (let k = 0; k < 30 && !fini; k++) {
      const o = (await modele(pid)).modele.objets["ligne-fen"];
      if (o && o.params.points[1].y > ay + 140 + 0.1) fini = { o, fenetre };
      else await page.waitForTimeout(500);
    }
  }
  const pts = fini?.o.params.points ?? [];
  const journal = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.at(-1)?.label ?? "";
  check("étirer par fenêtre : lasso libre, extrémité entourée étirée, l'autre fixe", r0.status === 200 && fini?.fenetre === 1 && Math.abs(pts[0].x - (ax - 140)) < 1e-6 && Math.abs(pts[0].y - (ay + 140)) < 1e-6 && pts[1].y > ay + 140 && /fenêtre/.test(journal), `${r0.status} · ${JSON.stringify(pts)} · ${journal}`);
  await page.keyboard.press("Escape");
}

// Ajuster une forme fermée (D-117) : dalle coupée par une ligne, côté gardé désigné au clic.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const r0 = await lot(pid, `ajf-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "dalle-aj", classe: "dalle", niveauId: murA.niveauId, params: { contour: [P(ax - 200, ay - 200), P(ax - 196, ay - 200), P(ax - 196, ay - 197), P(ax - 200, ay - 197)], trous: [], epaisseur: m(0.2) } } },
    { type: "objet.creer", params: { id: "ligne-aj", classe: "esquisse", niveauId: murA.niveauId, params: { forme: "ligne", points: [P(ax - 198, ay - 202), P(ax - 198, ay - 195)], ferme: false } } },
  ]);
  await ouvrir(pid);
  await selectionner("dalle-aj");
  const b = await zoomerSur('.plan2d [data-objet="dalle-aj"]', 250);
  // Palette ouverte sans Échap : la sélection (la dalle) est gardée.
  await page.mouse.move(2, 2);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+k");
  await page.locator(".palette-champ").fill("ajuster");
  await page.waitForFunction(() => (document.querySelector(".palette-resultats li")?.textContent ?? "").includes("Ajuster"), null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Enter");
  const outilOk = await page.waitForFunction(() => (document.querySelector(".plan2d")?.getAttribute("aria-label") ?? "").endsWith("outil ajuster"), null, { timeout: 5000 }).then(() => true, () => false);
  let contour = null;
  if (b && outilOk) {
    await page.mouse.click(b.x + b.width / 2, b.y - b.height / 3);
    await page.waitForFunction(() => /côté de la forme/.test(document.querySelector(".etat-aide")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    await page.mouse.click(b.x + b.width * 0.8, b.y + b.height / 2);
    for (let k = 0; k < 30 && !contour; k++) {
      const c = (await modele(pid)).modele.objets["dalle-aj"]?.params.contour;
      if (c && Math.min(...c.map((q) => q.x)) > ax - 199) contour = c;
      else await page.waitForTimeout(500);
    }
  }
  const xs = (contour ?? []).map((q) => Math.round((q.x - ax) * 1e6) / 1e6);
  check("ajuster une dalle : coupée par la ligne, côté désigné gardé", r0.status === 200 && Math.min(...xs) === -198 && Math.max(...xs) === -196, `${r0.status} · ${JSON.stringify(xs)} · ${await page.locator(".etat-aide").textContent()}`);
  await page.keyboard.press("Escape");
}

// Ensembles personnels synchronisés entre deux appareils du même compte (D-118).
{
  await page.keyboard.press("Escape");
  await page.locator("[data-ensemble-nom]").fill("Perso e2e");
  await page.locator("[data-ensemble-partager]").uncheck().catch(() => {});
  await page.locator('[data-ensembles] .nav-formulaire-ensemble button[type="submit"]').click();
  let serveur = null;
  for (let k = 0; k < 30 && !serveur; k++) {
    const r = await api("get", "/preferences/atelier-ensembles");
    if (r.body?.ensembles?.some((e) => e.nom === "Perso e2e")) serveur = r.body;
    else await page.waitForTimeout(500);
  }
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/connexion`);
  await page2.fill('input[name="email"]', email);
  await page2.fill('input[name="password"]', "complements-pass-123");
  await page2.click('button[type="submit"]');
  await page2.waitForURL(/\/(projets|accueil)/);
  await page2.goto(`${BASE}/projets/${pid}?module=atelier`);
  const vu = await page2.waitForSelector('[data-ensemble-local="Perso e2e"]', { state: "attached", timeout: 20000 }).then(() => true, () => false);
  // Supprimé sur le second appareil : le serveur ne l'a plus.
  if (vu) await page2.locator('[data-ensemble-local="Perso e2e"] button.lien').click();
  let retire = false;
  for (let k = 0; k < 30 && vu && !retire; k++) {
    retire = !(await api("get", "/preferences/atelier-ensembles")).body?.ensembles?.some((e) => e.nom === "Perso e2e");
    if (!retire) await page.waitForTimeout(500);
  }
  await ctx2.close();
  check("ensembles personnels : enregistrés sur un appareil, retrouvés et supprimés sur un autre du même compte", !!serveur?.version && vu && retire, `${JSON.stringify(serveur).slice(0, 120)} · ${vu} · ${retire}`);
}

// États de calques (D-119) : instantané enregistré dans le modèle, calque gelé ensuite, état restauré depuis le navigateur.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await page.locator("[data-etats-calques] > summary").click();
  await page.locator("[data-etat-calques-nom]").fill("Départ e2e");
  await page.locator("[data-etats-calques] form button[type=submit]").click();
  let def = null;
  for (let k = 0; k < 30 && !def; k++) {
    def = Object.values((await modele(pid)).modele.definitions).find((d) => d.classe === "etat-calques" && d.nom === "Départ e2e") ?? null;
    if (!def) await page.waitForTimeout(500);
  }
  const cid = def ? Object.keys(def.params.calques)[0] : null;
  if (cid) {
    await attendreEnregistre().catch(() => {});
    await page.locator(`[data-calque-geler="${cid}"]`).click();
    for (let k = 0; k < 30 && !(await modele(pid)).modele.calques[cid]?.gele; k++) await page.waitForTimeout(500);
    await attendreEnregistre().catch(() => {});
    await page.locator(`[data-etat-calques-restaurer="${def.id}"]`).click();
  }
  let restaure = false;
  for (let k = 0; k < 30 && cid && !restaure; k++) {
    restaure = (await modele(pid)).modele.calques[cid]?.gele !== true;
    if (!restaure) await page.waitForTimeout(500);
  }
  const journal = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.at(-1)?.label ?? "";
  check("états de calques : instantané enregistré, calque gelé puis état restauré", !!def && restaure && /Restaurer l'état de calques/.test(journal), `${def?.id} · ${cid} · ${restaure} · ${journal}`);
}

// Dégradé de hachure (D-120) : saisi dans l'inspecteur, dessiné en dégradé dans le plan.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const r0 = await lot(pid, `deg-${Date.now()}`, (await modele(pid)).revision, [
    { type: "esquisse.hachure", params: { id: "hach-deg", niveauId: murA.niveauId, points: [P(ax - 220, ay - 220), P(ax - 216, ay - 220), P(ax - 216, ay - 218), P(ax - 220, ay - 218)] } },
  ]);
  await ouvrir(pid);
  await selectionner("hach-deg");
  await page.locator("[data-degrade-hachure] > summary").click();
  await page.locator('[data-degrade-champ="de"]').fill("10");
  await page.locator('[data-degrade-champ="a"]').fill("90");
  await page.locator('[data-degrade-champ="angle"]').fill("45");
  await page.locator("[data-degrade-appliquer]").click();
  let d = null;
  for (let k = 0; k < 30 && !d; k++) {
    d = (await modele(pid)).modele.objets["hach-deg"]?.params.degrade ?? null;
    if (!d) await page.waitForTimeout(500);
  }
  const dessine = await page.waitForSelector('.plan2d [data-objet="hach-deg"][data-degrade]', { state: "attached", timeout: 10000 }).then(() => true, () => false);
  check("dégradé de hachure : saisi dans l'inspecteur, enregistré, dessiné dans le plan", r0.status === 200 && d?.de === 0.1 && d?.a === 0.9 && d?.angle?.value === 45 && dessine, `${r0.status} · ${JSON.stringify(d)} · ${dessine}`);
}

// Motif DXF nommé importé (D-121) : lignes de définition dessinées dans le plan, retour au catalogue depuis l'inspecteur.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const r0 = await lot(pid, `motif-${Date.now()}`, (await modele(pid)).revision, [
    { type: "esquisse.hachure", params: { id: "hach-ansi", niveauId: murA.niveauId, points: [P(ax - 230, ay - 230), P(ax - 226, ay - 230), P(ax - 226, ay - 228), P(ax - 230, ay - 228)], motif: "ANSI31", motifLignes: [{ angle: 45, pas: 0.2 }] } },
  ]);
  await ouvrir(pid);
  await selectionner("hach-ansi");
  const plan = await page.waitForSelector('.plan2d [data-motif-importe="1"]', { state: "attached", timeout: 10000 }).then(() => true, () => false);
  const libelle = (await page.locator(".inspecteur [data-motif-importe]").textContent().catch(() => "")) ?? "";
  await page.locator("[data-motif-catalogue]").click();
  let retour = false;
  for (let k = 0; k < 30 && !retour; k++) {
    const o = (await modele(pid)).modele.objets["hach-ansi"];
    retour = !!o && !o.params.motifLignes && !o.params.motif;
    if (!retour) await page.waitForTimeout(500);
  }
  check("motif DXF importé : dessiné par ses lignes, signalé dans l'inspecteur, retour au catalogue", r0.status === 200 && plan && /ANSI31/.test(libelle) && retour, `${r0.status} · ${plan} · ${libelle} · ${retour}`);
}

// Contrôle d'interférence à la demande (D-124) : un solide et un poteau qui se recouvrent sont listés.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const ax = murA.params.a.x;
  const ay = murA.params.a.y;
  const r0 = await lot(pid, `inter-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "inter-sol", classe: "solide", niveauId: murA.niveauId, params: { contour: [P(ax - 240, ay - 240), P(ax - 238, ay - 240), P(ax - 238, ay - 238), P(ax - 240, ay - 238)], trous: [], ferme: true, hauteur: m(1) } } },
    { type: "poteau.creer", params: { id: "inter-pot", niveauId: murA.niveauId, point: P(ax - 238, ay - 239), formeId: "rectangle", largeur: m(0.4), profondeur: m(0.4), hauteur: m(3) } },
  ]);
  await ouvrir(pid);
  await page.locator("[data-interferences] > summary").click();
  await page.locator("[data-interferences-controler]").click();
  const vu = await page.waitForSelector('[data-interference="inter-pot|inter-sol"]', { state: "attached", timeout: 10000 }).then(() => true, () => false);
  const texte = vu ? (await page.locator('[data-interference="inter-pot|inter-sol"]').textContent()) ?? "" : "";
  check("interférences : solide et poteau qui se recouvrent listés avec leur volume commun", r0.status === 200 && vu && /0,08 m³/.test(texte), `${r0.status} · ${vu} · ${texte}`);
}

// Pousser / tirer une face latérale en 3D (D-125) : face d'un poteau tournée vers la caméra, tirée de quelques dizaines de cm.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const cx = murA.params.a.x - 250;
  const cy = murA.params.a.y - 250;
  const r0 = await lot(pid, `face-${Date.now()}`, (await modele(pid)).revision, [
    { type: "poteau.creer", params: { id: "pot-face", niveauId: murA.niveauId, point: P(cx, cy), formeId: "rectangle", largeur: m(1), profondeur: m(1), hauteur: m(3) } },
  ]);
  await ouvrir(pid);
  await selectionner("pot-face");
  await page.locator('.barre-mode button:has-text("3D")').click();
  await page.waitForFunction(() => !!window.fadiMesures3D?.versEcran, null, { timeout: 30000 }).catch(() => {});
  await page.locator('[data-isolement="isoler"]').click();
  await page.waitForTimeout(500);
  await page.locator('.vue3d-commandes button:has-text("Cadrer"), button:has-text("Cadrer")').last().click();
  await page.waitForTimeout(500);
  await page.keyboard.press("u");
  const z0 = (await modele(pid)).modele.niveaux[murA.niveauId]?.elevation ?? 0;
  const cible = await page.evaluate(([cx, cy, z]) => {
    const m3 = window.fadiMesures3D;
    const cam = m3.pointDeVue().position;
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([nx, ny]) => ({ nx, ny, c: { x: cx + nx * 0.5, y: cy + ny * 0.5, z: z + 1.5 } }));
    const f = faces.sort((a, b) => ((cam.x - b.c.x) * b.nx + (cam.y - b.c.y) * b.ny) - ((cam.x - a.c.x) * a.nx + (cam.y - a.c.y) * a.ny))[0];
    const a = m3.versEcran(f.c);
    const b = m3.versEcran({ x: f.c.x + f.nx, y: f.c.y + f.ny, z: f.c.z });
    return a && b ? { a, b } : null;
  }, [cx, cy, z0]);
  const c3 = await page.locator(".vue3d-canevas").boundingBox();
  let fait = null;
  if (cible && c3) {
    const ux = cible.b.x - cible.a.x;
    const uy = cible.b.y - cible.a.y;
    await page.mouse.move(c3.x + cible.a.x, c3.y + cible.a.y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(c3.x + cible.a.x + (ux * 0.5 * k) / 10, c3.y + cible.a.y + (uy * 0.5 * k) / 10);
    await page.mouse.up();
    for (let k = 0; k < 30 && !fait; k++) {
      const o = (await modele(pid)).modele.objets["pot-face"];
      if (o && (o.params.largeur.value !== 1 || o.params.profondeur.value !== 1)) fait = o.params;
      else await page.waitForTimeout(500);
    }
  }
  const journal = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.at(-1)?.label ?? "";
  await page.locator("[data-isolement-quitter]").click().catch(() => {});
  await page.locator('.barre-mode button:has-text("Plan")').click().catch(() => {});
  check("pousser / tirer une face latérale : poteau élargi d'un côté en 3D", r0.status === 200 && !!fait && /Face de pot-face/.test(journal), `${r0.status} · ${JSON.stringify(cible)} · ${JSON.stringify(fait && { l: fait.largeur, p: fait.profondeur, pt: fait.point })} · ${journal}`);
}

// Accrochage 3D (D-127) : mesure entre deux coins opposés du dessus d'un poteau 1 × 1, cliqués à quelques pixels.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const cx = murA.params.a.x - 270;
  const cy = murA.params.a.y - 270;
  const r0 = await lot(pid, `acc3d-${Date.now()}`, (await modele(pid)).revision, [
    { type: "poteau.creer", params: { id: "pot-mes", niveauId: murA.niveauId, point: P(cx, cy), formeId: "rectangle", largeur: m(1), profondeur: m(1), hauteur: m(3) } },
  ]);
  await ouvrir(pid);
  await selectionner("pot-mes");
  await page.locator('.barre-mode button:has-text("3D")').click();
  await page.waitForFunction(() => !!window.fadiMesures3D?.versEcran, null, { timeout: 30000 }).catch(() => {});
  await page.locator('[data-isolement="isoler"]').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Cadrer")').last().click();
  await page.waitForTimeout(500);
  const ok = await choisirOutil("mesurer", "Mesurer");
  const z = ((await modele(pid)).modele.niveaux[murA.niveauId]?.elevation ?? 0) + 3;
  const coins = await page.evaluate(([cx, cy, z]) => {
    const v = window.fadiMesures3D.versEcran;
    const c = v({ x: cx, y: cy, z });
    return [v({ x: cx - 0.5, y: cy - 0.5, z }), v({ x: cx + 0.5, y: cy + 0.5, z })].map((q) => (q && c ? { x: q.x + Math.sign(c.x - q.x) * 4, y: q.y + Math.sign(c.y - q.y) * 4 } : null));
  }, [cx, cy, z]);
  const c3 = await page.locator(".vue3d-canevas").boundingBox();
  for (const q of coins) if (q && c3) {
    await page.mouse.click(c3.x + q.x, c3.y + q.y);
    await page.waitForTimeout(300);
  }
  const d = await page.evaluate(() => window.fadiMesures3D?.mesure3d ?? null);
  await page.locator("[data-isolement-quitter]").click().catch(() => {});
  await page.locator('.barre-mode button:has-text("Plan")').click().catch(() => {});
  check("accrochage 3D : coins du poteau accrochés, diagonale exacte (√2 m)", r0.status === 200 && ok && typeof d === "number" && Math.abs(d - Math.SQRT2) < 1e-6, `${r0.status} · ${ok} · ${d} · ${JSON.stringify(coins)}`);
}

// Chaîne jointive fermée proposée comme profil (D-126) : quatre lignes sélectionnées, « Joindre en profil ».
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 260;
  const y0 = murA.params.a.y - 260;
  const L = (id, a, b) => ({ type: "objet.creer", params: { id, classe: "esquisse", niveauId: murA.niveauId, params: { forme: "ligne", points: [P(x0 + a[0], y0 + a[1]), P(x0 + b[0], y0 + b[1])], ferme: false } } });
  const r0 = await lot(pid, `chaine-${Date.now()}`, (await modele(pid)).revision, [L("prof-a", [0, 0], [3, 0]), L("prof-b", [3, 0], [3, 2]), L("prof-c", [0, 2], [3, 2]), L("prof-d", [0, 2], [0, 0])]);
  await ouvrir(pid);
  await page.locator(".nav-filtre").fill("prof-");
  for (const [k, id] of ["prof-a", "prof-b", "prof-c", "prof-d"].entries()) await page.locator(`.nav-objets button[data-objet="${id}"]`).click({ modifiers: k ? ["Shift"] : [] });
  const propose = await page.waitForSelector('[data-profil-propose="4"]', { timeout: 10000 }).then(() => true, () => false);
  if (propose) await page.locator("[data-joindre-profil]").click();
  let profil = null;
  for (let k = 0; k < 30 && propose && !profil; k++) {
    const o = (await modele(pid)).modele.objets["prof-a"];
    if (o?.params.forme === "polygone") profil = o.params;
    else await page.waitForTimeout(500);
  }
  check("chaîne jointive fermée : profil proposé, joint en polygone sur demande", r0.status === 200 && propose && profil?.points?.length === 4, `${r0.status} · ${propose} · ${JSON.stringify(profil?.forme)}`);
}

// Contrainte entre deux murs (D-129) : perpendicularité ajoutée depuis l'inspecteur d'une sélection de deux murs.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 280;
  const y0 = murA.params.a.y - 280;
  const r0 = await lot(pid, `cmur-${Date.now()}`, (await modele(pid)).revision, [
    { type: "mur.tracer", params: { id: "cmur-1", niveauId: murA.niveauId, a: P(x0, y0), b: P(x0 + 5, y0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "cmur-2", niveauId: murA.niveauId, a: P(x0 + 7, y0 + 1), b: P(x0 + 8, y0 + 4), epaisseur: m(0.2), hauteur: m(3) } },
  ]);
  await ouvrir(pid);
  await page.locator(".nav-filtre").fill("cmur-");
  await page.locator('.nav-objets button[data-objet="cmur-1"]').click();
  await page.locator('.nav-objets button[data-objet="cmur-2"]').click({ modifiers: ["Shift"] });
  await page.locator(".inspecteur-contraintes > summary").click();
  await page.locator("[data-contrainte-type]").selectOption("perpendiculaire");
  await page.locator('.ajout-contrainte button:has-text("Ajouter la contrainte")').click();
  let pv = null;
  for (let k = 0; k < 30 && pv === null; k++) {
    const o = (await modele(pid)).modele.objets;
    const a = o["cmur-1"]?.params;
    const b = o["cmur-2"]?.params;
    const ps = a && b ? (a.b.x - a.a.x) * (b.b.x - b.a.x) + (a.b.y - a.a.y) * (b.b.y - b.a.y) : null;
    if (ps !== null && Math.abs(ps) < 1e-4) pv = ps;
    else await page.waitForTimeout(500);
  }
  check("contrainte entre murs : perpendicularité ajoutée depuis l'inspecteur, murs résolus", r0.status === 200 && pv !== null, `${r0.status} · ${pv}`);
}

// Longueur saisie avec son unité (D-130) : « 250 mm » dans l'épaisseur d'un mur, convertie en 0,25 m.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await selectionner(murA.id);
  const champ = page.locator(`.inspecteur input[id="${murA.id}-epaisseur"]`);
  await champ.fill("250 mm");
  await champ.press("Enter");
  let ep = null;
  for (let k = 0; k < 30 && ep !== 0.25; k++) {
    ep = (await modele(pid)).modele.objets[murA.id]?.params.epaisseur?.value ?? null;
    if (ep !== 0.25) await page.waitForTimeout(500);
  }
  const affiche = await champ.inputValue().catch(() => "");
  check("longueur saisie en millimètres : convertie explicitement en mètres (0,25 m)", ep === 0.25 && affiche === "0,25", `${ep} · ${affiche}`);
}

// Axes associés au centre d'un cercle (D-132) : créés depuis l'inspecteur, ils suivent le cercle déplacé.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const cx = murA.params.a.x - 290;
  const cy = murA.params.a.y - 290;
  const r0 = await lot(pid, `axc-${Date.now()}`, (await modele(pid)).revision, [{ type: "esquisse.cercle", params: { id: "cercle-axes", niveauId: murA.niveauId, centre: P(cx, cy), rayon: m(1) } }]);
  await ouvrir(pid);
  await selectionner("cercle-axes");
  await page.locator("[data-axes-creer]").click();
  let axes = [];
  for (let k = 0; k < 30 && axes.length < 2; k++) {
    axes = Object.values((await modele(pid)).modele.objets).filter((o) => o.params.axeDe?.sourceId === "cercle-axes");
    if (axes.length < 2) await page.waitForTimeout(500);
  }
  const md = await modele(pid);
  const r1 = await lot(pid, `axd-${Date.now()}`, md.revision, [{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["cercle-axes"] }]);
  const suivis = Object.values((await modele(pid)).modele.objets).filter((o) => o.params.axeDe?.sourceId === "cercle-axes");
  const ok = suivis.length === 2 && suivis.every((o) => Math.abs((o.params.points[0].x + o.params.points[1].x) / 2 - (cx + 1)) < 1e-6);
  check("axes associés : deux axes créés au centre du cercle, ils suivent le cercle déplacé", r0.status === 200 && r1.status === 200 && axes.length === 2 && ok, `${r0.status} · ${r1.status} · ${axes.length} · ${ok}`);
}

// Mode filaire de la vue 3D (D-133) : arêtes cachées en tirets, faces non dessinées.
{
  await page.keyboard.press("Escape");
  await page.locator('.barre-mode button:has-text("3D")').click();
  await page.waitForFunction(() => !!window.fadiMesures3D?.versEcran, null, { timeout: 30000 }).catch(() => {});
  await page.locator("[data-filaire]").check();
  const actif = await page.waitForFunction(() => window.fadiMesures3D?.filaire === true, null, { timeout: 5000 }).then(() => true, () => false);
  await page.screenshot({ path: `${OUT}/3d-filaire.png` });
  await page.locator("[data-filaire]").uncheck();
  const retire = await page.waitForFunction(() => window.fadiMesures3D?.filaire === false, null, { timeout: 5000 }).then(() => true, () => false);
  await page.locator('.barre-mode button:has-text("Plan")').click().catch(() => {});
  check("vue 3D filaire : activée puis retirée (arêtes cachées en tirets)", actif && retire, `${actif} · ${retire}`);
}

// Sélection des semblables sur tous les niveaux (D-134) : murs du même type, sélection multi-niveaux.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  await selectionner(murA.id);
  await page.locator("[data-semblables-tous]").click();
  const n = Number(await page.locator("[data-multi-niveaux]").getAttribute("data-multi-niveaux", { timeout: 5000 }).catch(() => "0"));
  const titre = (await page.locator(".inspecteur h3").first().textContent().catch(() => "")) ?? "";
  check("semblables : murs du même type sélectionnés sur plusieurs niveaux", n > 1 && /objets sélectionnés/.test(titre), `${n} · ${titre}`);
  await page.keyboard.press("Escape");
}

// Styles graphiques par classe en 3D (D-135) : couleur des murs choisie pour soi, puis rétablie.
{
  await page.keyboard.press("Escape");
  await page.locator('.barre-mode button:has-text("3D")').click();
  await page.waitForFunction(() => !!window.fadiMesures3D?.versEcran, null, { timeout: 30000 }).catch(() => {});
  await page.locator("[data-styles-classes] > summary").click();
  await page.locator('[data-style-couleur="mur"]').fill("#cc3300");
  const applique = await page.waitForFunction(() => window.fadiMesures3D?.styles === 1, null, { timeout: 5000 }).then(() => true, () => false);
  await page.screenshot({ path: `${OUT}/3d-styles.png` });
  await page.locator('[data-styles-classes] li:has([data-style-couleur="mur"]) button.lien').click();
  const retabli = await page.waitForFunction(() => window.fadiMesures3D?.styles === 0, null, { timeout: 5000 }).then(() => true, () => false);
  await page.locator('.barre-mode button:has-text("Plan")').click().catch(() => {});
  check("styles par classe en 3D : couleur des murs appliquée puis rétablie", applique && retabli, `${applique} · ${retabli}`);
}

// Section d'un poteau (D-139) : profilé I choisi dans l'inspecteur, dessiné au plan par son contour.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const r0 = await lot(pid, `sec-${Date.now()}`, (await modele(pid)).revision, [
    { type: "poteau.creer", params: { id: "pot-sec", niveauId: murA.niveauId, point: P(murA.params.a.x - 300, murA.params.a.y - 300), formeId: "rectangle", largeur: m(0.2), profondeur: m(0.3), hauteur: m(3) } },
  ]);
  await ouvrir(pid);
  await selectionner("pot-sec");
  await page.locator("[data-section-forme]").selectOption("I");
  await page.locator("[data-section-epaisseur]").fill("0,02");
  await page.locator("[data-section-appliquer]").click();
  let sec = null;
  for (let k = 0; k < 30 && !sec; k++) {
    const o = (await modele(pid)).modele.objets["pot-sec"];
    if (o?.params.formeId === "I") sec = o.params;
    else await page.waitForTimeout(500);
  }
  const dessine = await page.waitForSelector('.plan2d [data-objet="pot-sec"][data-section="I"]', { state: "attached", timeout: 10000 }).then(() => true, () => false);
  check("section de poteau : profilé I (parois 0,02 m) enregistré et dessiné au plan", r0.status === 200 && sec?.epaisseurProfil?.value === 0.02 && dessine, `${r0.status} · ${JSON.stringify(sec?.epaisseurProfil)} · ${dessine}`);
}

// Dalle inclinée (D-140) : pente saisie dans l'inspecteur, enregistrée avec sa direction.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 310;
  const y0 = murA.params.a.y - 310;
  const r0 = await lot(pid, `rampe-${Date.now()}`, (await modele(pid)).revision, [
    { type: "dalle.creer", params: { id: "rampe-e2e", niveauId: murA.niveauId, contour: [P(x0, y0), P(x0 + 6, y0), P(x0 + 6, y0 + 3), P(x0, y0 + 3)], trous: [], epaisseur: m(0.2) } },
  ]);
  await ouvrir(pid);
  await selectionner("rampe-e2e");
  await page.locator("[data-pente-dalle] > summary").click();
  await page.locator('[data-pente-champ="angle"]').fill("5");
  await page.locator('[data-pente-champ="direction"]').fill("90");
  await page.locator("[data-pente-appliquer]").click();
  let pente = null;
  for (let k = 0; k < 30 && !pente; k++) {
    pente = (await modele(pid)).modele.objets["rampe-e2e"]?.params.pente ?? null;
    if (!pente) await page.waitForTimeout(500);
  }
  check("dalle inclinée : pente de 5° vers 90° enregistrée", r0.status === 200 && pente?.angle?.value === 5 && pente?.direction?.value === 90, `${r0.status} · ${JSON.stringify(pente)}`);
}

// Baie cintrée (D-141) : arc surbaissé choisi dans l'inspecteur d'une fenêtre, flèche saisie.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 330;
  const y0 = murA.params.a.y - 330;
  const r0 = await lot(pid, `cintre-${Date.now()}`, (await modele(pid)).revision, [
    { type: "mur.tracer", params: { id: "mur-cintre-e2e", niveauId: murA.niveauId, a: P(x0, y0), b: P(x0 + 5, y0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "baie-cintre-e2e", classe: "fenetre", murHoteId: "mur-cintre-e2e", position: 0.5, largeur: m(1.2), hauteur: m(1.6), allege: m(0.9) } },
  ]);
  await ouvrir(pid);
  await selectionner("baie-cintre-e2e");
  await page.locator("[data-cintre-baie] > summary").click();
  await page.locator("[data-cintre-type]").selectOption("surbaisse");
  await page.locator("[data-cintre-fleche]").fill("25 cm");
  await page.locator("[data-cintre-appliquer]").click();
  let cintre = null;
  for (let k = 0; k < 30 && !cintre; k++) {
    cintre = (await modele(pid)).modele.objets["baie-cintre-e2e"]?.params.cintre ?? null;
    if (!cintre) await page.waitForTimeout(500);
  }
  check("baie cintrée : arc surbaissé de flèche 0,25 m enregistré", r0.status === 200 && cintre?.type === "surbaisse" && Math.abs((cintre?.fleche?.value ?? 0) - 0.25) < 1e-9, `${r0.status} · ${JSON.stringify(cintre)}`);
}

// Murs et ouvertures dans un bloc (D-150) : un mur et sa porte deviennent un bloc ; l'occurrence les dessine au plan.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 470;
  const y0 = murA.params.a.y - 470;
  const r0 = await lot(pid, `blocmur-${Date.now()}`, (await modele(pid)).revision, [
    { type: "mur.tracer", params: { id: "mur-bloc-e2e", niveauId: murA.niveauId, a: P(x0, y0), b: P(x0 + 4, y0), epaisseur: m(0.2), hauteur: m(2.5) } },
    { type: "ouverture.poser", params: { id: "porte-bloc-e2e", classe: "porte", murHoteId: "mur-bloc-e2e", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } },
    { type: "bloc.definir", params: { id: "bloc-mur-e2e", nom: "Cloison avec porte e2e", cibles: ["mur-bloc-e2e"], pointDeBase: P(x0, y0), remplacer: true } },
  ]);
  const occ = Object.values((await modele(pid)).modele.objets).find((o) => o.classe === "bloc-occurrence" && o.definitionId === "bloc-mur-e2e");
  await ouvrir(pid);
  if (occ) await selectionner(occ.id);
  const dessine = await page.waitForSelector(`.plan2d [data-objet="${occ?.id}"] [data-bloc-architecture] path`, { state: "attached", timeout: 10000 }).then(() => true, () => false);
  check("bloc d'un mur et de sa porte : occurrence posée, mur dessiné au plan", r0.status === 200 && !!occ && dessine, `${r0.status} · ${occ?.id} · ${dessine}`);
}

// Extrusion avec dépouille et oblique (D-148) : saisie dans l'inspecteur d'un solide.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 450;
  const y0 = murA.params.a.y - 450;
  const r0 = await lot(pid, `dep-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "solide-dep-e2e", classe: "solide", niveauId: murA.niveauId, params: { contour: [P(x0, y0), P(x0 + 4, y0), P(x0 + 4, y0 + 4), P(x0, y0 + 4)], trous: [], ferme: true, hauteur: m(1) } } },
  ]);
  await ouvrir(pid);
  await selectionner("solide-dep-e2e");
  await page.locator("[data-forme-solide] > summary").click();
  await page.locator('[data-forme-champ="depouille"]').fill("10");
  await page.locator('[data-forme-champ="inclinaison"]').fill("15");
  await page.locator('[data-forme-champ="direction"]').fill("90");
  await page.locator("[data-forme-appliquer]").click();
  let p = null;
  for (let k = 0; k < 30 && !p?.inclinaison; k++) {
    p = (await modele(pid)).modele.objets["solide-dep-e2e"]?.params ?? null;
    if (!p?.inclinaison) await page.waitForTimeout(500);
  }
  check("solide : dépouille 10° et inclinaison 15° vers 90° enregistrées", r0.status === 200 && p?.depouille?.value === 10 && p?.inclinaison?.angle?.value === 15 && p?.inclinaison?.direction?.value === 90, `${r0.status} · ${JSON.stringify({ d: p?.depouille, i: p?.inclinaison })}`);
}

// Presse-papiers (D-147) : Ctrl+C sur une sélection, Ctrl+V ici (décalé de 1 m) puis dans le projet voisin.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 430;
  const y0 = murA.params.a.y - 430;
  const r0 = await lot(pid, `pp-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "pp-e2e", classe: "esquisse", niveauId: murA.niveauId, params: { forme: "polygone", points: [P(x0, y0), P(x0 + 1, y0), P(x0 + 1, y0 + 1)], ferme: true, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null } } },
  ]);
  await ouvrir(pid);
  await selectionner("pp-e2e");
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  let copie = null;
  for (let k = 0; k < 30 && !copie; k++) {
    copie = (await modele(pid)).modele.objets["pp-e2e-c1"] ?? null;
    if (!copie) await page.waitForTimeout(500);
  }
  const ici = r0.status === 200 && !!copie && Math.abs(copie.params.points[0].x - (x0 + 1)) < 1e-9 && Math.abs(copie.params.points[0].y - (y0 - 1)) < 1e-9;
  check("presse-papiers : collé dans le même projet, décalé de 1 m", ici, `${r0.status} · ${JSON.stringify(copie?.params.points?.[0] ?? null)}`);
  globalThis.collerAilleurs = { x0 };
}

// Lot validé par le serveur mais réponse perdue (page fermée, réseau coupé) : à la réouverture, il est retiré de la
// file au lieu d'être rejoué (son rejeu sur un modèle qui le contient déjà passerait pour un conflit).
{
  await attendreEnregistre().catch(() => {});
  await page.route("**/atelier/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch().catch(() => {}); // le serveur valide…
    await route.abort("connectionreset"); // …mais la réponse n'arrive jamais
  });
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+v");
  let cree = null;
  for (let k = 0; k < 30 && !cree; k++) {
    cree = (await modele(pid)).modele.objets["pp-e2e-c2"] ?? null;
    if (!cree) await page.waitForTimeout(500);
  }
  await page.unroute("**/atelier/commands");
  const reouvert = await ouvrir(pid).then(() => true, () => false);
  const barre = await page.locator(".barre-sync").textContent().catch(() => "");
  check("lot validé dont la réponse s'est perdue : retiré de la file à la réouverture, aucun conflit", !!cree && reouvert && /^Enregistré · r\d+/.test(barre), `${!!cree} · ${barre}`);
}

// Orientation d'un texte (D-146) : saisie dans l'inspecteur, texte tourné au plan.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const r0 = await lot(pid, `texte-or-${Date.now()}`, (await modele(pid)).revision, [
    { type: "texte.creer", params: { id: "texte-oriente-e2e", niveauId: murA.niveauId, position: P(murA.params.a.x - 410, murA.params.a.y - 410), texte: "Nord" } },
  ]);
  await ouvrir(pid);
  await selectionner("texte-oriente-e2e");
  await page.locator("[data-texte-angle]").fill("45");
  await page.locator("[data-texte-angle-appliquer]").click();
  let angle = null;
  for (let k = 0; k < 30 && angle === null; k++) {
    angle = (await modele(pid)).modele.objets["texte-oriente-e2e"]?.params.angle?.value ?? null;
    if (angle === null) await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => (document.querySelector('.plan2d text[data-objet="texte-oriente-e2e"]')?.getAttribute("transform") ?? "").startsWith("rotate(-45"), null, { timeout: 10000 }).catch(() => {});
  const transform = await page.locator('.plan2d text[data-objet="texte-oriente-e2e"]').getAttribute("transform").catch(() => null);
  check("texte orienté à 45° depuis l'inspecteur, tourné au plan", r0.status === 200 && angle === 45 && (transform ?? "").startsWith("rotate(-45"), `${r0.status} · ${angle} · ${transform}`);
}

// Échelle non uniforme (D-145) : outil Échelle, centre cliqué, « 2;1 » tapé : largeur doublée, hauteur gardée.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 390;
  const y0 = murA.params.a.y - 390;
  const r0 = await lot(pid, `ech-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "ech-e2e", classe: "esquisse", niveauId: murA.niveauId, params: { forme: "polygone", points: [P(x0, y0), P(x0 + 2, y0), P(x0 + 2, y0 + 1), P(x0, y0 + 1)], ferme: true, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null } } },
  ]);
  await ouvrir(pid);
  await selectionner("ech-e2e");
  // Palette ouverte sans Échap (qui viderait la sélection) : l'outil Échelle exige une sélection.
  await page.mouse.move(2, 2);
  await page.keyboard.press("Control+k");
  await page.locator(".palette-champ").waitFor({ state: "visible", timeout: 5000 });
  await page.locator(".palette-champ").fill("échelle");
  await page.waitForFunction(() => (document.querySelector(".palette-resultats li")?.textContent ?? "").includes("Échelle"), null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Enter");
  const outilOk = await page.waitForFunction(() => (document.querySelector(".plan2d")?.getAttribute("aria-label") ?? "").endsWith("outil echelle") || (document.querySelector(".atelier-n-outils .outil.est-actif")?.textContent ?? "").includes("Échelle"), null, { timeout: 5000 }).then(() => true, () => false);
  const cadre = await page.locator(".plan2d").boundingBox();
  await page.mouse.click(cadre.x + cadre.width * 0.3, cadre.y + cadre.height * 0.3);
  await page.keyboard.type("2;1");
  await page.keyboard.press("Enter");
  let pts = null;
  for (let k = 0; k < 30; k++) {
    pts = (await modele(pid)).modele.objets["ech-e2e"]?.params.points ?? null;
    if (pts && Math.abs(Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x)) - 4) < 1e-6) break;
    await page.waitForTimeout(500);
  }
  const larg = pts ? Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x)) : null;
  const haut = pts ? Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y)) : null;
  check("échelle non uniforme : « 2;1 » double la largeur, garde la hauteur", r0.status === 200 && outilOk && Math.abs(larg - 4) < 1e-6 && Math.abs(haut - 1) < 1e-6, `${r0.status} · outil ${outilOk} · ${larg} × ${haut}`);
  await page.keyboard.press("Escape");
}

// Dalle à retombée de rive, épaisseur vers le bas (D-144) : saisie dans l'inspecteur, rive cachée tracée au plan.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const x0 = murA.params.a.x - 370;
  const y0 = murA.params.a.y - 370;
  const r0 = await lot(pid, `retombee-${Date.now()}`, (await modele(pid)).revision, [
    { type: "dalle.creer", params: { id: "dalle-retombee-e2e", niveauId: murA.niveauId, contour: [P(x0, y0), P(x0 + 6, y0), P(x0 + 6, y0 + 4), P(x0, y0 + 4)], trous: [], epaisseur: m(0.2) } },
  ]);
  await ouvrir(pid);
  await selectionner("dalle-retombee-e2e");
  await page.locator("[data-dalle-retombee] > summary").click();
  await page.locator("[data-dalle-sens]").selectOption("bas");
  await page.locator('[data-retombee-champ="largeur"]').fill("25 cm");
  await page.locator('[data-retombee-champ="hauteur"]').fill("0,3");
  await page.locator("[data-dalle-retombee-appliquer]").click();
  let p = null;
  for (let k = 0; k < 30 && !p?.retombee; k++) {
    p = (await modele(pid)).modele.objets["dalle-retombee-e2e"]?.params ?? null;
    if (!p?.retombee) await page.waitForTimeout(500);
  }
  await page.waitForSelector('[data-objet="dalle-retombee-e2e"] [data-retombee]', { state: "attached", timeout: 10000 }).catch(() => {});
  const trace = await page.locator('[data-objet="dalle-retombee-e2e"] [data-retombee]').count();
  check("dalle : épaisseur vers le bas et retombée de rive 0,25 × 0,30 m enregistrées, rive cachée au plan", r0.status === 200 && p?.sens === "bas" && p?.retombee?.largeur?.value === 0.25 && p?.retombee?.hauteur?.value === 0.3 && trace === 1, `${r0.status} · ${JSON.stringify({ sens: p?.sens, retombee: p?.retombee })} · ${trace}`);
}

// Espace sur plusieurs niveaux (D-142) : niveau haut choisi dans l'inspecteur, niveaux traversés annoncés.
{
  await page.keyboard.press("Escape");
  await attendreEnregistre().catch(() => {});
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const md = (await modele(pid)).modele;
  const bas = md.niveaux[murA.niveauId];
  const dessus = Object.values(md.niveaux).filter((n) => n.elevation > bas.elevation).sort((a, b) => a.elevation - b.elevation);
  if (dessus.length < 2) {
    const r = await lot(pid, `niv-${Date.now()}`, (await modele(pid)).revision, [
      { type: "niveau.creer", params: { id: "niv-e2e-1", nom: "Haut 1", elevation: bas.elevation + 50, hauteur: 3 } },
      { type: "niveau.creer", params: { id: "niv-e2e-2", nom: "Haut 2", elevation: bas.elevation + 53, hauteur: 3 } },
    ]);
    if (r.status !== 200) console.log("niveaux", r.status, JSON.stringify(r.body).slice(0, 200));
  }
  const md2 = (await modele(pid)).modele;
  const au = Object.values(md2.niveaux).filter((n) => n.elevation > bas.elevation).sort((a, b) => a.elevation - b.elevation);
  const x0 = murA.params.a.x - 350;
  const y0 = murA.params.a.y - 350;
  const r0 = await lot(pid, `atrium-${Date.now()}`, (await modele(pid)).revision, [
    { type: "objet.creer", params: { id: "atrium-e2e", classe: "espace", niveauId: murA.niveauId, params: { polygones: [{ contour: [P(x0, y0), P(x0 + 4, y0), P(x0 + 4, y0 + 3), P(x0, y0 + 3)], trous: [] }], nom: "Atrium e2e" } } },
  ]);
  await ouvrir(pid);
  await selectionner("atrium-e2e");
  await page.locator("[data-espace-niveaux] > summary").click();
  await page.locator("[data-espace-niveau-haut]").selectOption(au[1].id);
  await page.locator("[data-espace-niveaux-appliquer]").click();
  let haut = null;
  for (let k = 0; k < 30 && !haut; k++) {
    haut = (await modele(pid)).modele.objets["atrium-e2e"]?.params.niveauHautId ?? null;
    if (!haut) await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
  const annonce = await page.locator("[data-espace-traverses]").textContent().catch(() => "");
  check("espace sur plusieurs niveaux : niveau haut enregistré, niveau intermédiaire traversé", r0.status === 200 && haut === au[1].id && annonce.includes(au[0].nom), `${r0.status} · ${haut} · ${annonce}`);
}

// Presse-papiers, suite (D-147) : le même contenu collé dans le projet voisin (en dernier : la page reste sur le voisin).
{
  await ouvrir(voisin);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("Control+v");
  let ailleurs = null;
  for (let k = 0; k < 30 && !ailleurs; k++) {
    ailleurs = (await modele(voisin)).modele.objets["pp-e2e"] ?? null;
    if (!ailleurs) await page.waitForTimeout(500);
  }
  check("presse-papiers : collé dans un autre projet aux mêmes coordonnées", !!ailleurs && Math.abs(ailleurs.params.points[0].x - globalThis.collerAilleurs.x0) < 1e-9, JSON.stringify(ailleurs?.params.points?.[0] ?? null));
  await attendreEnregistre().catch(() => {});
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
