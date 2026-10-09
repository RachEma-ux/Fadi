/**
 * Lot P2-7 — Documentation et échanges P2 (cahier P2 §5 : « feuille de ferraillage, feuille de pliage, nuage affiché
 * derrière le modèle ») : dans P.118 copié, ontologies structure et réseaux activées ; poutre, plaque, armatures et
 * tuyau posés (API) ; annotation de fabrication (soudure) créée depuis l'inspecteur sur la poutre ; cote mécanique
 * (Ø, tolérance) et étiquette intelligente appliquées depuis les fiches ; feuilles gabarits « production béton » et
 * « pliage » et vue isométrique créées depuis Documents ; nuage de points LAS lu par le serveur, posé derrière le plan,
 * tranche changée depuis la fiche ; tableaux ferraillage / débit / perçages ; un seul écran ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-documentation.mjs
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`); if (!ok) echecs += 1; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); const text = await r.text().catch(() => ""); let body = null; try { body = JSON.parse(text); } catch { body = null; } return { status: r.status(), body, text }; };
const navigations = [];
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `p2-documentation-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "documentation-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-D" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
const m = (value) => ({ value, unit: "m" });
const P3 = (x, y, z) => ({ x, y, z });
let n = 0;
const commandes = async (label, cmds) => { const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2d-${Date.now()}-${++n}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label, commands: cmds }); if (r.status !== 200) console.log("  ↳ refus", label, JSON.stringify(r.body).slice(0, 300)); return r; };
const recharger = async () => { await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }); await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 }); await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click(); await page.waitForTimeout(300); };
const choisirId = async (id, selecteurFiche) => { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.keyboard.press("Escape"); await page.locator(".nav-filtre").fill(id); await page.locator(`.nav-objets button[data-objet="${id}"]`).first().click(); await page.waitForSelector(selecteurFiche, { timeout: 10000 }); await page.locator(".nav-filtre").fill(""); };
const outil = async (recherche, selecteur, garderSelection = false) => {
  if (!garderSelection) { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.locator(".plan2d").focus().catch(() => {}); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  await page.locator("[data-palette-bouton]").click(); await page.locator(".palette-champ").fill(recherche); await page.keyboard.press("Enter");
  try { await page.waitForSelector(selecteur, { timeout: 15000 }); } catch (e) { console.log("  ↳ outil non affiché :", recherche, "| actif =", await page.evaluate(() => document.querySelector(".atelier-n")?.dataset.outilActif)); throw e; }
};
const classe = (mod, c) => Object.values(mod.objets).filter((o) => o.classe === c);
function las(points) {
  const header = 227, rec = 20, scale = 0.001, offset = { x: 1000, y: 2000, z: 100 };
  const buf = Buffer.alloc(header + points.length * rec);
  buf.write("LASF", 0, "latin1"); buf[24] = 1; buf[25] = 2;
  buf.writeUInt16LE(header, 94); buf.writeUInt32LE(header, 96); buf[104] = 0; buf.writeUInt16LE(rec, 105); buf.writeUInt32LE(points.length, 107);
  buf.writeDoubleLE(scale, 131); buf.writeDoubleLE(scale, 139); buf.writeDoubleLE(scale, 147); buf.writeDoubleLE(offset.x, 155); buf.writeDoubleLE(offset.y, 163); buf.writeDoubleLE(offset.z, 171);
  points.forEach((p, i) => { const o = header + i * rec; buf.writeInt32LE(Math.round((p.x - offset.x) / scale), o); buf.writeInt32LE(Math.round((p.y - offset.y) / scale), o + 4); buf.writeInt32LE(Math.round((p.z - offset.z) / scale), o + 8); });
  return buf;
}

// 1. P.118-D : structure et réseaux activés, objets de production (API).
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0;
const m0 = await modele();
const r0 = m0.revision;
const objets0 = Object.keys(m0.modele.objets).length;
const niveau = Object.values(m0.modele.niveaux).find((x) => x.elevation === 0) ?? Object.values(m0.modele.niveaux).sort((a, b) => a.ordre - b.ordre)[0];
await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click();
await page.waitForTimeout(300);
await page.locator('[data-ontologie="structure"]').check();
await enregistre();
await page.locator('[data-ontologie="mep"]').check();
await enregistre();
const cx = 30, cy = 30;
const IPE = { forme: "I", largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.006), epaisseurAile: m(0.009) };
const D50 = { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) };
let r = await commandes("Objets de production", [
  { type: "poutre.creer", params: { id: "b1", niveauId: niveau.id, nom: "P1", a: pt(cx, cy), b: pt(cx + 6, cy), za: 2.8, section: IPE, materiau: "acier" } },
  { type: "plaque.creer", params: { id: "pl1", niveauId: niveau.id, nom: "Dalle D1", contour: [pt(cx, cy + 2), pt(cx + 1, cy + 2), pt(cx + 1, cy + 3), pt(cx, cy + 3)], trous: [], epaisseur: m(0.2), z: 3, materiau: "beton" } },
  { type: "armature.creer", params: { id: "ar1", niveauId: niveau.id, nom: "C1", hoteId: "pl1", forme: "cadre", diametre: m(0.01), points: [pt(cx + 0.05, cy + 2.05), pt(cx + 0.45, cy + 2.05), pt(cx + 0.45, cy + 2.45), pt(cx + 0.05, cy + 2.45)], z: 3.01, nombre: 4, espacement: m(0.1), nuance: "B500B (déclarée)" } },
  { type: "segmentReseau.creer", params: { id: "s1", niveauId: niveau.id, nom: "EF 1", repere: "EF-01", systeme: "tuyau", sommets: [P3(cx, cy + 6, 2.5), P3(cx + 4, cy + 6, 2.5)], section: D50, fluide: "eau froide" } },
  { type: "cotation.creer", params: { id: "k1", niveauId: niveau.id, a: pt(cx, cy), b: pt(cx + 6, cy), decalage: m(0.8) } },
  { type: "etiquette.creer", params: { id: "et1", niveauId: niveau.id, position: pt(cx + 3, cy + 1), texte: "P1", objetId: "b1" } },
]);
check("activation structure + réseaux ; poutre, plaque, armature, tuyau, cote et étiquette posés", r.status === 200 && JSON.stringify([...((await modele()).modele.ontologies ?? [])].sort()) === JSON.stringify(["mep", "structure"]));
await recharger();

// 2. Annotation de fabrication (soudure) depuis l'inspecteur, sur la poutre sélectionnée.
await choisirId("b1", "[data-fiche-poutre]");
await outil("annotation de fabrication", "[data-outil-annotation-fabrication]", true);
check("outil Annotation de fabrication : la poutre sélectionnée est l'objet annoté", /P1/.test((await page.locator("[data-annotation-cible]").textContent()) ?? ""));
await page.locator("[data-annotation-type]").selectOption("soudure");
await page.locator("[data-annotation-cordon]").selectOption("angle");
await page.locator("[data-annotation-taille]").fill("5");
const apercu = (await page.locator("[data-annotation-apercu]").textContent()) ?? "";
check("aperçu du texte dérivé avant création : « Angle a5 »", /Angle a5/.test(apercu), apercu);
await page.locator("[data-annotation-creer]").click();
await enregistre();
let mod = (await modele()).modele;
const annot = classe(mod, "annotation-fabrication")[0];
check("annotation créée : soudure d'angle a5 attachée à P1, dessinée dans le plan avec sa flèche", !!annot && annot.params.type === "soudure" && annot.params.objetId === "b1" && (await page.locator(".plan2d .obj-annotation-fabrication").count()) === 1, JSON.stringify(annot?.params).slice(0, 200));

// 3. Cote mécanique et étiquette intelligente depuis les fiches.
await choisirId("k1", "[data-cotation-mecanique]");
await page.locator("[data-cotation-prefixe]").selectOption("Ø");
await page.locator("[data-cotation-plus]").fill("1");
await page.locator("[data-cotation-moins]").fill("0,5");
check("fiche de la cote : aperçu « Ø6000 +1/−0,5 » (mm) avant application", /Ø6000 \+1\/−0,5/.test((await page.locator("[data-cotation-apercu]").textContent()) ?? ""), await page.locator("[data-cotation-apercu]").textContent());
await page.locator("[data-cotation-appliquer]").click();
await enregistre();
mod = (await modele()).modele;
check("cote mécanique enregistrée (préfixe Ø, tolérance +1 / −0,5 mm) et dessinée avec son texte tolérancé", mod.objets["k1"].params.prefixe === "Ø" && mod.objets["k1"].params.tolerance?.plus === 0.001 && /Ø6000/.test((await page.locator('.plan2d [data-objet="k1"]').textContent()) ?? ""));
await choisirId("et1", "[data-etiquette-intelligente]");
await page.locator("[data-etiquette-champ]").fill("{nom} · {section} · {longueur}");
check("fiche de l'étiquette : aperçu lu sur la poutre (nom, section, longueur 6 m)", /P1 · Profilé I 100 × 200 .* · 6 m/.test((await page.locator("[data-etiquette-apercu]").textContent()) ?? ""), await page.locator("[data-etiquette-apercu]").textContent());
await page.locator("[data-etiquette-appliquer]").click();
await enregistre();
mod = (await modele()).modele;
check("étiquette intelligente enregistrée : gabarit porté par l'objet, texte dérivé dans le plan", mod.objets["et1"].params.champ === "{nom} · {section} · {longueur}" && /Profilé I 100/.test((await page.locator('.plan2d [data-objet="et1"]').textContent()) ?? ""));
await page.screenshot({ path: `${OUT}/p2-documentation-annotations.png` });

// 4. Documents : feuille gabarit production béton, feuille de pliage, vue isométrique.
await page.keyboard.press("Escape");
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForSelector("[data-gabarits]", { timeout: 15000 });
await page.locator("[data-gabarits] summary").click();
await page.locator('[data-gabarit="production-beton"]').click();
await enregistre();
await page.locator("[data-gabarits] summary").click();
await page.locator('[data-gabarit="pliage"]').click();
await enregistre();
await page.locator('.docs-nouvelle summary:has-text("Nouvelle vue")').first().click();
await page.locator('[data-nouvelle="isometrique"]').click();
await enregistre();
mod = (await modele()).modele;
const feuilles = Object.values(mod.definitions).filter((d) => d.classe === "feuille");
const vuesIso = Object.values(mod.definitions).filter((d) => d.classe === "vue" && d.params.type === "isometrique");
check("feuilles gabarits « production béton » (plan + armatures + ferraillage) et « pliage » (plan + table de pliage + débit) créées d'un clic, A1 paysage ; vue isométrique de tuyauterie créée", feuilles.some((f) => f.params.titre.startsWith("Plan de production béton") && f.params.tableaux.map((t) => t.type).join(",") === "armatures,ferraillage" && f.params.format === "A1") && feuilles.some((f) => f.params.titre.startsWith("Feuille de pliage") && f.params.tableaux.map((t) => t.type).join(",") === "pliage,debit") && vuesIso.length >= 1, `${feuilles.map((f) => f.params.titre).join(" | ")} | iso ${vuesIso.length}`);
const docs = (await api("get", `/projects/${pid}/documents`)).body?.documents ?? [];
const fBeton = feuilles.find((f) => f.params.titre.startsWith("Plan de production béton"));
const svgF = fBeton ? await api("get", `/projects/${pid}/documents/atelier/feuilles/${encodeURIComponent(fBeton.id)}.svg`) : { status: 0, text: "" };
check("feuille de ferraillage produite (SVG) : plan du niveau, armature C1 et nuance B500B dans la nomenclature", svgF.status === 200 && /C1/.test(svgF.text) && /B500B/.test(svgF.text));
const vIso = vuesIso[0];
const svgIso = vIso ? await api("get", `/projects/${pid}/documents/atelier/vues/${encodeURIComponent(vIso.id)}.svg`) : { status: 0, text: "" };
check("isométrique de tuyauterie (SVG) : tronçon EF-01 en trait unique avec sa longueur 4,00 m", svgIso.status === 200 && /EF-01/.test(svgIso.text) && /4,00 m/.test(svgIso.text));
const csv = async (type) => { const d = docs.find((x) => x.kind === `atelier-tableau-${type}`); return d ? await api("get", d.href) : { status: 0, text: "" }; };
const fer = await csv("ferraillage"), debit = await csv("debit"), perc = await csv("percages");
check("tableaux : feuille de ferraillage (C1, 400 + 400 + 400 + 400, allongement non évalué), liste de débit (structure, réseau tuyau), perçages (vide, en-têtes) ; 18 tableaux au catalogue", fer.status === 200 && /C1/.test(fer.text) && /400 \+ 400/.test(fer.text) && /non évaluée/.test(fer.text) && debit.status === 200 && /structure/.test(debit.text) && /réseau tuyau/.test(debit.text) && perc.status === 200 && docs.filter((d) => d.kind.startsWith("atelier-tableau-")).length === 18);
await page.screenshot({ path: `${OUT}/p2-documentation-feuilles.png` });

// 5. Nuage de points LAS : lu par le serveur (origine déclarée), posé derrière le plan ; tranche changée depuis la fiche.
const pts = Array.from({ length: 2000 }, (_, i) => ({ x: 1000 + cx + (i % 50) * 0.2, y: 2000 + cy + 8 + Math.floor(i / 50) * 0.2, z: 100 + (i % 3 === 0 ? 1.2 : 2.6) }));
const nuage = await page.request.post(`${BASE}/projects/${pid}/atelier/nuages`, { headers: { "Content-Type": "application/octet-stream", "X-File-Name": "releve.las", "X-Nuage-Niveau": niveau.id, "X-Nuage-Nom": encodeURIComponent("Relevé laser"), "X-Nuage-Coupe": "1.2", "X-Nuage-Points": "1000", "X-Nuage-Origine": encodeURIComponent(JSON.stringify({ x: 1000, y: 2000, z: 100 })) }, data: las(pts) });
const nuageBody = await nuage.json().catch(() => null);
check("nuage LAS 1.2 de 2 000 points lu par le serveur, décimé à 1 000 (un sur 2), origine 1 000 ; 2 000 ; 100 soustraite", nuage.status() === 200 && nuageBody?.lecture?.nombrePoints === 2000 && nuageBody?.lecture?.retenus === 1000 && nuageBody?.lecture?.pas === 2, JSON.stringify(nuageBody).slice(0, 200));
const refusE57 = await page.request.post(`${BASE}/projects/${pid}/atelier/nuages`, { headers: { "Content-Type": "application/octet-stream", "X-File-Name": "releve.e57", "X-Nuage-Niveau": niveau.id, "X-Nuage-Origine": encodeURIComponent(JSON.stringify({ x: 0, y: 0, z: 0 })) }, data: Buffer.from("xxxx") });
check("E57 refusé nommément (déclaré : non lu en P2-7)", refusE57.status() === 400 && /E57/.test(await refusE57.text()));
await recharger();
mod = (await modele()).modele;
const nu = classe(mod, "nuage-de-points")[0];
check("le nuage est un objet du modèle (échantillon 1 000 points, tranche z 1,20 m) dessiné derrière le plan", !!nu && nu.params.points.length === 1000 && nu.params.coupeZ === 1.2 && (await page.locator(".plan2d .obj-nuage-de-points").count()) === 1, JSON.stringify(nu?.params?.bornes));
const pointsTranche = Number(await page.locator(".plan2d .obj-nuage-de-points").getAttribute("data-points"));
await choisirId(nu.id, "[data-fiche-nuage]");
check("fiche du nuage : source, origine déclarée, bornes, tranche z 1,20 m", /releve\.las/.test((await page.locator("[data-nuage-source]").textContent()) ?? "") && /1,2/.test((await page.locator("[data-nuage-tranche]").textContent()) ?? ""));
await page.locator("[data-nuage-coupe-fiche]").fill("2,6");
await page.locator("[data-nuage-trancher]").click();
await enregistre();
await page.waitForFunction((avant) => Number(document.querySelector(".plan2d .obj-nuage-de-points")?.getAttribute("data-points")) !== avant, pointsTranche, { timeout: 15000 }).catch(() => {});
const pointsTranche2 = Number(await page.locator(".plan2d .obj-nuage-de-points").getAttribute("data-points"));
check("tranche changée depuis la fiche (z 2,60 m) : les points dessinés changent (relevé de plans, aucune surface déduite)", pointsTranche2 !== pointsTranche && pointsTranche2 > 0 && pointsTranche > 0, `${pointsTranche} → ${pointsTranche2}`);
await page.screenshot({ path: `${OUT}/p2-documentation-nuage.png` });

// 6. Un seul écran, un seul journal, bâtiment inchangé ; téléphone ; axe-core.
check("un seul écran : aucune navigation hors de l'Atelier", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : activations, objets, annotation, cote, étiquette, feuilles, vue, nuage, tranche sont des révisions successives", (await modele()).revision >= r0 + 10);
check("bâtiment inchangé : P.118 garde ses objets, les objets de production s'y ajoutent", Object.keys((await modele()).modele.objets).length >= objets0 + 7);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-documentation-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

await browser.close();
console.log(echecs ? `Lot P2-7 documentation : ${echecs} contrôle(s) en échec` : "Lot P2-7 documentation : tout est vert");
process.exit(echecs ? 1 : 0);
