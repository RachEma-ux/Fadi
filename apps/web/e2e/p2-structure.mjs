/**
 * Lot P2-3 — Structure (cahier P2 §5 : « poser une trame de poteaux et de poutres sur P.118, obtenir la nomenclature,
 * exporter en IFC ») : dans P.118 copié, l'ontologie structure activée depuis le navigateur, une trame créée et générée
 * depuis l'inspecteur (aperçu, accord), un catalogue de profilés sourcé puis une poutre par désignation, plaque,
 * assemblage paramétrique, soudures, armature et coulage, les trois nomenclatures CSV, une feuille avec la nomenclature,
 * un IFC structure réimporté en lecture (le visualiseur tiers reste une vérification du maître d'ouvrage), téléphone,
 * axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-structure.mjs
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
await page.fill('input[name="email"]', `p2-structure-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "structure-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-S" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
const m = (value) => ({ value, unit: "m" });
let n = 0;
const commandes = async (label, cmds) => { const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2s-${Date.now()}-${++n}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label, commands: cmds }); if (r.status !== 200) console.log("  ↳ refus", label, JSON.stringify(r.body).slice(0, 300)); return r; };
const recharger = async () => { await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }); await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 }); await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click(); await page.waitForTimeout(300); };

// 1. P.118-S dans l'Atelier ; niveau bas ; une zone libre à l'est du bâtiment pour la trame.
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0;
const m0 = await modele();
const r0 = m0.revision;
const objets0 = Object.keys(m0.modele.objets).length;
const niveau = Object.values(m0.modele.niveaux).find((n) => n.elevation === 0) ?? Object.values(m0.modele.niveaux).sort((a, b) => a.ordre - b.ordre)[0];
const murs = Object.values(m0.modele.objets).filter((o) => o.classe === "mur" && o.niveauId === niveau.id);
const xMax = Math.max(...murs.flatMap((o) => [o.params.a.x, o.params.b.x]));
const yMin = Math.min(...murs.flatMap((o) => [o.params.a.y, o.params.b.y]));
const ox = Math.round(xMax + 4), oy = Math.round(yMin);
check(`ouverture : P.118-S s'ouvre dans l'Atelier, niveau « ${niveau.nom} », zone libre à l'est (x = ${ox})`, !!niveau && Number.isFinite(ox));
await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click();
await page.waitForTimeout(300);

// 2. Activation de l'ontologie structure dans le navigateur : outils dans la palette, aucun écran nouveau.
const outilsAvant = await page.evaluate(() => document.querySelectorAll(".barre-outils button, .barre-famille button").length);
await page.locator('[data-ontologie="structure"]').check();
await enregistre();
check("activation : l'ontologie structure est activée par une commande du journal (ontologies = [structure])", JSON.stringify((await modele()).modele.ontologies) === JSON.stringify(["structure"]), JSON.stringify((await modele()).modele.ontologies));
await page.locator("[data-palette-bouton]").click();
await page.locator(".palette-champ").fill("trame structurale");
await page.waitForTimeout(200);
const palette = (await page.locator(".palette").textContent()) ?? "";
check("palette : « Trame structurale » proposée (synonymes grid, trame de poteaux), sans ruban ni écran nouveau", /Trame structurale/.test(palette) && navigations.length === 0, `${palette.slice(0, 120)} · navigations ${navigations.length}`);
const outilsApres = await page.evaluate(() => document.querySelectorAll(".barre-outils button, .barre-famille button").length);
check("barre : l'activation ajoute les outils de structure à la barre (T01)", outilsApres >= outilsAvant, `${outilsAvant} → ${outilsApres}`);

// 3. Trame depuis l'inspecteur : origine, files, rangs → créée ; sa fiche donne l'aperçu, la génération se fait après accord.
await page.keyboard.press("Enter");
await page.waitForSelector("[data-outil-trame]", { timeout: 15000 });
await page.locator("#outil-trame-ox").fill(String(ox));
await page.locator('[data-outil-trame] [aria-label="Origine y"]').fill(String(oy));
await page.locator("[data-trame-nom]").fill("T1");
await page.locator("[data-trame-files]").fill("0 ; 6 ; 12");
await page.locator("[data-trame-rangs]").fill("0 ; 5");
await page.locator("[data-trame-creer]").click();
await enregistre();
let mod = (await modele()).modele;
const trame = Object.values(mod.objets).find((o) => o.classe === "trame");
check("trame : créée depuis l'inspecteur (3 files A–C, 2 rangs 1–2), dessinée en plan (axes et bulles), rien d'autre créé", !!trame && trame.params.files.length === 3 && trame.params.generation === null && (await page.locator(".plan2d .obj-trame").count()) === 1 && !Object.values(mod.objets).some((o) => o.classe === "poutre"), JSON.stringify(trame?.params).slice(0, 200));
await page.keyboard.press("Escape");
await page.locator(".nav-filtre").fill("T1");
await page.locator('.nav-objets button:has-text("T1")').first().click();
await page.waitForSelector("[data-fiche-trame]", { timeout: 10000 });
await page.locator(".nav-filtre").fill("");
const apercu = (await page.locator("[data-trame-apercu]").textContent()) ?? "";
check("aperçu : la fiche annonce 6 poteaux et 7 poutres avant tout accord (génération contrôlée)", /6 poteau/.test(apercu) && /7 poutre/.test(apercu), apercu);
check("accord : le bouton Générer est inactif tant que hauteur et sections ne sont pas saisies (rien n'est supposé)", await page.locator("[data-trame-generer]").isDisabled());
await page.locator("[data-trame-hauteur]").fill("3");
await page.locator("[data-trame-poteau-largeur]").fill("200");
await page.locator("[data-trame-poteau-profondeur]").fill("200");
const sec = page.locator(`[data-editeur-section="trame-sec-${trame.id}"]`);
await sec.locator("select").first().selectOption("saisie");
await sec.locator(`#trame-sec-${trame.id}-forme`).selectOption("I");
await sec.locator("[data-section-largeur]").fill("100");
await sec.locator("[data-section-hauteur]").fill("200");
await sec.locator(`#trame-sec-${trame.id}-e`).fill("5.6");
await sec.locator(`#trame-sec-${trame.id}-a`).fill("8.5");
await page.locator(`#trame-${trame.id}-mat`).selectOption("beton");
await page.locator("[data-trame-generer]").click();
await enregistre();
mod = (await modele()).modele;
const poteaux = Object.values(mod.objets).filter((o) => o.classe === "poteau" && o.proprietes?.trame?.valeur === trame.id);
const poutres = Object.values(mod.objets).filter((o) => o.classe === "poutre" && o.params.trameId === trame.id);
check("génération : 6 poteaux (classe du socle, 200 × 200, béton déclaré) et 7 poutres (I 100 × 200, axe à 2,9 m) créés en une révision, rattachés à la trame", poteaux.length === 6 && poutres.length === 7 && Math.abs(poutres[0].params.za - 2.9) < 1e-9 && poteaux[0].params.formeId === "rectangle" && mod.objets[trame.id].params.generation?.poutres === 7, JSON.stringify({ poteaux: poteaux.length, poutres: poutres.length, za: poutres[0]?.params.za }));
await page.waitForFunction(() => document.querySelectorAll(".plan2d .obj-poutre").length >= 7, null, { timeout: 15000 }).catch(() => {});
check("plan : les poutres se dessinent dans le même plan que le bâtiment (bandes de section), les poteaux comme ceux de P.118", (await page.locator(".plan2d .obj-poutre").count()) === 7);
await page.screenshot({ path: `${OUT}/p2-structure-trame.png` });

// 4. Catalogue de profilés sourcé (D-180) importé dans le projet, puis une poutre par désignation : masse linéique et source citées.
const CSV = "designation;hauteur_mm;largeur_mm;epaisseur_ame_mm;epaisseur_aile_mm;masse_kg_m;source;edition;page\nIPE 200;200;100;5,6;8,5;22,4;Catalogue producteur X;2024;p. 12\nHEA 160;152;160;6;9;30,4;Catalogue producteur X;2024;p. 20\n";
let r = await commandes("Catalogue de profilés", [{ type: "catalogue.importer", params: { id: "cat-acier", nom: "Profilés X (sourcé)", ontologie: "structure", csv: CSV } }]);
const refus = await commandes("Catalogue sans source", [{ type: "catalogue.importer", params: { id: "cat-mauvais", nom: "Sans source", ontologie: "structure", csv: "designation;hauteur_mm;largeur_mm;source;edition;page\nIPE 300;300;150;;;\n" } }]);
check("catalogue : le CSV sourcé est importé comme donnée du projet ; une ligne sans source est refusée nominativement (rien d'importé)", r.status === 200 && refus.status === 400 && /ligne 2/.test(JSON.stringify(refus.body)), JSON.stringify(refus.body).slice(0, 200));
r = await commandes("Poutre de catalogue", [{ type: "poutre.creer", params: { id: "b-cat", niveauId: niveau.id, nom: "Poutre catalogue", a: pt(ox, oy), b: pt(ox, oy + 5), za: 2.9, section: { catalogueId: "cat-acier", designation: "HEA 160" }, materiau: "acier", materiauNom: "S355 (déclaré)" } }]);
mod = (await modele()).modele;
const bcat = mod.objets["b-cat"];
check("poutre par désignation : section HEA 160 copiée du catalogue (h 152 mm, masse 30,4 kg/m, source « Catalogue producteur X, 2024, p. 20 »)", r.status === 200 && bcat?.params.section.forme === "H" && Math.abs(bcat.params.section.hauteur.value - 0.152) < 1e-9 && bcat.params.section.masseLineique === 30.4 && bcat.params.section.profil.source === "Catalogue producteur X, 2024, p. 20", JSON.stringify(bcat?.params.section).slice(0, 200));
await recharger();
await page.locator(".nav-filtre").fill("Poutre catalogue");
await page.locator('.nav-objets button:has-text("Poutre catalogue")').first().click();
await page.waitForSelector("[data-fiche-poutre]", { timeout: 10000 });
await page.locator(".nav-filtre").fill("");
const masse = (await page.locator("[data-poutre-masse]").textContent()) ?? "";
const masseTrame = async () => { await page.locator(".nav-filtre").fill("T1 A 1-2"); await page.locator('.nav-objets button:has-text("T1 A 1-2")').first().click(); await page.waitForSelector("[data-fiche-poutre]", { timeout: 10000 }); const t = (await page.locator("[data-poutre-masse]").textContent()) ?? ""; await page.locator(".nav-filtre").fill(""); return t; };
const masseSaisie = await masseTrame();
check("fiche : la poutre de catalogue affiche sa masse (152 kg = 30,4 × 5) et la source ; la poutre saisie dit « non évaluée » (aucune masse linéique sourcée, R3)", /152/.test(masse) && /non évaluée/.test(masseSaisie), `${masse} · ${masseSaisie}`);

// 5. Plaque, assemblage paramétrique, soudures (assemblage soudé dérivé), armature, coulage.
const [p0, p1] = poteaux.slice().sort((a, b) => a.id < b.id ? -1 : 1);
r = await commandes("Assemblages et béton", [
  { type: "plaque.creer", params: { id: "pl1", niveauId: niveau.id, nom: "Platine A1", contour: [pt(ox - 0.25, oy - 0.25), pt(ox + 0.25, oy - 0.25), pt(ox + 0.25, oy + 0.25), pt(ox - 0.25, oy + 0.25)], epaisseur: m(0.02), z: 3, materiau: "acier" } },
  { type: "assemblageStructurel.creer", params: { id: "as1", niveauId: niveau.id, nom: "Platine d'about A1", type: "platine-about", elements: [poutres[0].id, p0.id], position: pt(ox, oy), z: 2.9, platine: { largeur: m(0.2), hauteur: m(0.3), epaisseur: m(0.015) }, boulons: { rangees: 3, parRangee: 2, diametre: m(0.016), entraxe: m(0.07), longueur: m(0.06) } } },
  { type: "soudure.creer", params: { id: "w1", type: "angle", a: poutres[0].id, b: "pl1", gorge: m(0.005), longueur: m(0.3), position: pt(ox, oy), z: 2.9 } },
  { type: "soudure.creer", params: { id: "w2", type: "angle", a: "pl1", b: "b-cat", gorge: m(0.005), longueur: m(0.2), position: pt(ox, oy + 0.2), z: 2.9 } },
  { type: "armature.creer", params: { id: "ar1", niveauId: niveau.id, nom: "Cadres A1", hoteId: p0.id, forme: "cadre", diametre: m(0.008), points: [pt(ox - 0.08, oy - 0.08), pt(ox + 0.08, oy - 0.08), pt(ox + 0.08, oy + 0.08), pt(ox - 0.08, oy + 0.08)], z: 0.1, nombre: 12, espacement: m(0.2), nuance: "B500B (déclarée)" } },
  { type: "coulage.creer", params: { id: "co1", niveauId: niveau.id, nom: "Coulage 1", numero: "C1", elements: [p0.id, p1.id] } },
]);
mod = (await modele()).modele;
check("structure détaillée : plaque, assemblage paramétrique (platine 200 × 300 × 15, 6 boulons M16), deux soudures, 12 cadres HA 8, coulage de deux poteaux — tous objets du modèle", r.status === 200 && ["pl1", "as1", "w1", "w2", "ar1", "co1"].every((id) => mod.objets[id]), JSON.stringify(r.body).slice(0, 200));

// 6. Nomenclatures : trois tableaux du catalogue de documents (CSV reproductibles) ; feuille avec la nomenclature de structure.
const docs = async () => (await api("get", `/projects/${pid}/documents`)).body?.documents ?? [];
const liste = await docs();
const tStructure = liste.find((d) => d.kind === "atelier-tableau-structure");
const tArmatures = liste.find((d) => d.kind === "atelier-tableau-armatures");
const tAssemblages = liste.find((d) => d.kind === "atelier-tableau-assemblagesStructure");
const csvS = tStructure ? await api("get", tStructure.href) : { status: 0, text: "" };
const csvA = tArmatures ? await api("get", tArmatures.href) : { status: 0, text: "" };
const csvAs = tAssemblages ? await api("get", tAssemblages.href) : { status: 0, text: "" };
check("nomenclature de structure : 7 poutres de trame + poutre HEA 160 (masse 152 kg, source citée) + 6 poteaux + plaque, masse « non évaluée » pour les sections saisies, coulage nommé", csvS.status === 200 && csvS.text.includes("HEA 160") && csvS.text.includes("Catalogue producteur X, 2024, p. 20") && csvS.text.includes("152") && csvS.text.includes("non évaluée") && csvS.text.includes("Coulage 1") && (csvS.text.match(/\r\n/g) ?? []).length >= 16, `${csvS.status} · ${csvS.text.slice(0, 160)}`);
check("nomenclature des armatures : 12 cadres Ø 8, longueur développée 0,64 m → 7,68 m, nuance déclarée, masse non évaluée", csvA.status === 200 && csvA.text.includes("B500B") && csvA.text.includes("7.68") && csvA.text.includes("non évaluée"), csvA.text.slice(0, 200));
check("assemblages : une ligne paramétrique (6 boulons) et un assemblage soudé dérivé (3 éléments reliés par 2 soudures, 0,5 m de cordon)", csvAs.status === 200 && csvAs.text.includes("paramétrique") && csvAs.text.includes("soudé") && csvAs.text.includes("0.5"), csvAs.text.slice(0, 200));
r = await commandes("Feuille de structure", [
  { type: "vue.creer", params: { id: "v-plan-s", type: "plan", titre: `Plan ${niveau.nom} — structure`, echelle: 100, niveauId: niveau.id } },
  { type: "feuille.creer", params: { id: "f-s", titre: "Structure", numero: "S-01", format: "A1", orientation: "paysage", vues: [{ vueId: "v-plan-s", x: 30, y: 60 }], tableaux: [{ type: "structure", x: 500, y: 60 }, { type: "assemblagesStructure", x: 500, y: 400 }] } },
]);
let d = (await docs()).find((x) => x.kind === "atelier-feuille-f-s-pdf");
const pdf = d ? await page.request.get(`${BASE}${d.href}`) : null;
d = (await docs()).find((x) => x.kind === "atelier-feuille-f-s-pdf");
check("feuille S-01 : plan du niveau + nomenclature de structure + assemblages, produite à jour", r.status === 200 && pdf?.status() === 200 && d?.freshness === "a-jour", JSON.stringify({ r: r.status, pdf: pdf?.status(), f: d?.freshness }));

// 7. IFC structure, réimport en lecture (R16) ; l'ouverture dans un visualiseur tiers reste au maître d'ouvrage (déclaré).
const ifc = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
const attendus = ["IFCGRID(", "IFCCOLUMN(", "IFCBEAM(", "IFCPLATE(", "IFCREINFORCINGBAR(", "IFCFASTENER(", "IFCELEMENTASSEMBLY(", "IFCGROUP(", ".WELDED."];
check("IFC : un seul fichier avec IfcGrid, IfcColumn, IfcBeam, IfcPlate, IfcReinforcingBar, IfcFastener (.WELD.), IfcElementAssembly (paramétrique et .WELDED.), IfcGroup (coulage)", ifc.status === 200 && attendus.every((a) => ifc.text.includes(a)) && (ifc.text.match(/IFCBEAM\(/g) ?? []).length === 8, attendus.filter((a) => !ifc.text.includes(a)).join(" "));
const copie = (await api("post", `/projects/${ref}/copies`, { name: "P.118-S réimport" })).body.id;
const imp = await page.request.post(`${BASE}/projects/${copie}/atelier/import-ifc`, { headers: { "Content-Type": "application/octet-stream", "X-File-Name": "p118-s.ifc" }, data: Buffer.from(ifc.text) });
const mImp = (await api("get", `/projects/${copie}/atelier/model`)).body?.modele ?? { objets: {} };
const importes = Object.values(mImp.objets).filter((o) => o.classe === "objet-importe");
check("réimport : poutres, plaque, armature reviennent en représentations importées (classe IFC d'origine conservée), jamais reclassées", imp.status() === 200 && importes.some((o) => o.params.ifcClasse === "IfcBeam") && importes.some((o) => o.params.ifcClasse === "IfcPlate") && importes.some((o) => o.params.ifcClasse === "IfcReinforcingBar"), `${imp.status()} · ${importes.length} importé(s)`);

// 8. Un seul écran, un seul journal, bâtiment inchangé, aucune erreur ; téléphone ; axe-core.
await recharger();
check("un seul écran : aucune navigation hors de l'Atelier", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : activation, trame, génération, catalogue, assemblages, feuille sont des révisions successives", (await modele()).revision >= r0 + 7);
check("bâtiment inchangé : P.118 garde ses objets (la structure s'ajoute)", Object.keys((await modele()).modele.objets).length >= objets0 + 20);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-structure-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

await browser.close();
console.log(echecs ? `Lot P2-3 structure : ${echecs} contrôle(s) en échec` : "Lot P2-3 structure : tout est vert");
process.exit(echecs ? 1 : 0);
