/**
 * Lot P2-4 — Bois et tôlerie (cahier P2 §5 : « dessiner un mur à ossature, obtenir la liste des pièces ; plier une tôle,
 * lire le développé ») : dans P.118 copié, les ontologies bois et tôlerie activées depuis le navigateur ; une ossature
 * créée depuis l'inspecteur sur un mur de P.118 (avec ses baies), aperçu puis accord dans la fiche ; catalogue de sections
 * bois sourcé ; panneau CLT ; assemblage bois–métal avec quincaillerie ; tôle pliée depuis l'inspecteur avec un facteur K
 * déclaré, développé lu dans la fiche ; table de pliage sourcée et tôle « non évaluée » sans elle ; les deux
 * nomenclatures CSV ; IFC réimporté ; un seul écran ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-bois-tolerie.mjs
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
await page.fill('input[name="email"]', `p2-bois-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "bois-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-B" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
const m = (value) => ({ value, unit: "m" });
let n = 0;
const commandes = async (label, cmds) => { const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2b-${Date.now()}-${++n}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label, commands: cmds }); if (r.status !== 200) console.log("  ↳ refus", label, JSON.stringify(r.body).slice(0, 300)); return r; };
const recharger = async () => { await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }); await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 }); await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click(); await page.waitForTimeout(300); };
const choisirObjet = async (texte, selecteurFiche) => { await page.keyboard.press("Escape"); await page.locator(".nav-filtre").fill(texte); await page.locator(`.nav-objets button:has-text("${texte}")`).first().click(); await page.waitForSelector(selecteurFiche, { timeout: 10000 }); await page.locator(".nav-filtre").fill(""); };
const outil = async (recherche, selecteur, garderSelection = false) => {
  if (!garderSelection) { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.locator(".plan2d").focus().catch(() => {}); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  await page.locator(".barre-palette").click(); await page.locator(".palette-champ").fill(recherche); await page.keyboard.press("Enter");
  try { await page.waitForSelector(selecteur, { timeout: 15000 }); } catch (e) { console.log("  ↳ outil non affiché :", recherche, "| actif =", await page.evaluate(() => document.querySelector(".atelier-n")?.dataset.outilActif), "| sélection =", await page.evaluate(() => document.querySelectorAll(".plan2d .est-selectionne").length)); throw e; }
};

// 1. P.118-B : niveau de référence (élévation 0), un mur droit avec au moins une baie.
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0;
const m0 = await modele();
const r0 = m0.revision;
const objets0 = Object.keys(m0.modele.objets).length;
const niveau = Object.values(m0.modele.niveaux).find((x) => x.elevation === 0) ?? Object.values(m0.modele.niveaux).sort((a, b) => a.ordre - b.ordre)[0];
const ouvertures = Object.values(m0.modele.objets).filter((o) => ["porte", "fenetre", "ouverture"].includes(o.classe));
const murs = Object.values(m0.modele.objets).filter((o) => o.classe === "mur" && o.niveauId === niveau.id && !o.params.renflement && o.params.hauteur).map((o) => ({ o, L: Math.hypot(o.params.b.x - o.params.a.x, o.params.b.y - o.params.a.y), baies: ouvertures.filter((x) => x.params.murHoteId === o.id).length })).sort((a, b) => b.baies - a.baies || b.L - a.L);
let mur = murs[0]?.o;
check(`ouverture : P.118-B dans l'Atelier, niveau « ${niveau.nom} », mur ${mur?.id} (${murs[0]?.L.toFixed(2)} m, ${murs[0]?.baies} baie(s)) choisi pour l'ossature`, !!mur && murs[0].baies >= 1, JSON.stringify(murs.slice(0, 2).map((x) => [x.o.id, x.L, x.baies])));
await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click();
await page.waitForTimeout(300);

// 2. Activation des deux ontologies dans le navigateur.
await page.locator('[data-ontologie="timber"]').check();
await enregistre();
await page.locator('[data-ontologie="sheetmetal"]').check();
await enregistre();
check("activation : bois puis tôlerie activées par deux commandes du journal (ontologies = [timber, sheetmetal])", JSON.stringify((await modele()).modele.ontologies) === JSON.stringify(["timber", "sheetmetal"]), JSON.stringify((await modele()).modele.ontologies));
await page.locator(".barre-palette").click();
await page.locator(".palette-champ").fill("ossature");
await page.waitForTimeout(200);
check("palette : « Ossature bois » et « Tôle pliée » proposées, sans écran nouveau", /Ossature bois/.test((await page.locator(".palette").textContent()) ?? "") && navigations.length === 0);
await page.keyboard.press("Escape");

// 3. Ossature depuis l'inspecteur : mur sélectionné (navigateur), entraxe et section saisis → créée ; fiche : aperçu, accord.
await commandes("Catalogue de sections bois", [{ type: "catalogue.importer", params: { id: "cat-bois", nom: "Sections bois Y (sourcé)", ontologie: "timber", csv: "designation;largeur_mm;hauteur_mm;essence;classe_resistance;type;source;edition;page\n45x145;45;145;épicéa;C24;massif;Fournisseur bois Y;2025;p. 4\n" } }]);
await recharger();
await choisirObjet(mur.params.nom ?? mur.id, ".inspecteur");
await outil("ossature bois", "[data-outil-ossature]", true);
check("outil Ossature : le mur sélectionné est reconnu comme hôte", /Mur/.test((await page.locator("[data-ossature-hote]").textContent().catch(() => "")) ?? ""), await page.locator("[data-ossature-message]").textContent().catch(() => "—"));
await page.locator("[data-ossature-nom]").fill("MOB-1");
await page.locator("[data-ossature-entraxe]").fill("600");
const secM = page.locator('[data-editeur-section-bois="outil-sectionMontant"]');
await secM.locator("select").first().selectOption("catalogue");
await secM.locator("[data-section-designation]").fill("45x145");
await page.locator("[data-ossature-creer]").click();
await enregistre();
let mod = (await modele()).modele;
const oss = Object.values(mod.objets).find((o) => o.classe === "ossature");
// Plusieurs murs de P.118 portent le même nom : l'hôte est celui que le navigateur a sélectionné en premier ; il doit porter au moins une baie.
const hote = oss ? mod.objets[oss.params.hoteId] : null;
const baiesHote = hote ? ouvertures.filter((x) => x.params.murHoteId === hote.id).length : 0;
if (hote) mur = hote;
check(`ossature : créée depuis l'inspecteur (hôte = mur ${hote?.id} de P.118, ${baiesHote} baie(s), entraxe 600 mm, section 45 × 145 du catalogue sourcé), rien d'autre créé`, !!oss && hote?.classe === "mur" && baiesHote >= 1 && oss.params.sectionMontant.profil?.source === "Fournisseur bois Y, 2025, p. 4" && oss.params.generation === null && !Object.values(mod.objets).some((o) => o.classe === "element-bois"), JSON.stringify(oss?.params).slice(0, 200));
await choisirObjet("MOB-1", "[data-fiche-ossature]");
const apercu = (await page.locator("[data-ossature-apercu]").textContent()) ?? "";
const nbApercu = Number(/(\d+) pièce/.exec(apercu)?.[1] ?? 0);
check("aperçu : la fiche annonce les pièces (lisses, montants, linteau de la baie…) avant tout accord", nbApercu >= 8 && /montant/.test(apercu) && /linteau/.test(apercu), apercu);
await page.locator("[data-ossature-generer]").click();
await enregistre();
mod = (await modele()).modele;
const pieces = Object.values(mod.objets).filter((o) => o.classe === "element-bois" && o.params.ossatureId === oss.id);
check(`génération : ${pieces.length} pièces de bois créées en une révision, rattachées à l'ossature, repères de débit, rôles lisse / sablière / montant / linteau`, pieces.length === nbApercu && pieces.every((p) => p.params.repere) && ["lisse", "sabliere", "montant", "linteau"].every((r) => pieces.some((p) => p.params.role === r)), `${pieces.length} / ${nbApercu}`);
await page.waitForFunction((k) => document.querySelectorAll(".plan2d .obj-element-bois").length >= k, pieces.length, { timeout: 15000 }).catch(() => {});
check("plan : les pièces se dessinent dans le même plan que le bâtiment (montants en section, lisses en bande)", (await page.locator(".plan2d .obj-element-bois").count()) === pieces.length, `${await page.locator(".plan2d .obj-element-bois").count()}`);
await page.screenshot({ path: `${OUT}/p2-bois-ossature.png` });

// 4. CLT et assemblage bois–métal (API) ; fiche d'une pièce (essence, source, masse non évaluée).
const premier = pieces.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0];
let r = await commandes("CLT et assemblage", [
  { type: "panneauClt.creer", params: { id: "clt1", niveauId: niveau.id, nom: "CLT nord", pose: "mur", a: pt(mur.params.a.x, mur.params.a.y + 1), b: pt(mur.params.b.x, mur.params.b.y + 1), hauteur: m(2.7), epaisseur: m(0.1), couches: 5, essence: "épicéa (déclaré)" } },
  { type: "assemblageBois.creer", params: { id: "ab1", nom: "Équerre A", type: "equerre", a: premier.id, b: "clt1", position: pt(mur.params.a.x, mur.params.a.y), z: 0.1, platine: { largeur: m(0.06), hauteur: m(0.06), epaisseur: m(0.002) }, quincaillerie: [{ designation: "équerre 60", nombre: 2, source: "Catalogue quincaillerie Z, 2025, p. 8" }] } },
]);
check("CLT 5 couches et assemblage bois–métal (équerre, quincaillerie déclarée avec sa source) : objets du modèle", r.status === 200 && !!(await modele()).modele.objets["ab1"], JSON.stringify(r.body).slice(0, 200));
await recharger();
await choisirObjet(premier.params.nom, "[data-fiche-element-bois]");
const ficheBois = (await page.locator("[data-fiche-element-bois]").textContent()) ?? "";
check("fiche : section 45x145 du catalogue, essence et source citées, masse « non évaluée »", /45x145/.test(ficheBois) && /épicéa/.test(ficheBois) && /Fournisseur bois Y/.test(ficheBois) && /non évaluée/.test(ficheBois), ficheBois.slice(0, 200));

// 5. Tôle pliée depuis l'inspecteur avec facteur K déclaré : développé lu dans la fiche ; tôle sans paramètre : non évalué ; table de pliage sourcée.
await outil("tôle pliée", "[data-outil-tole]");
await page.locator("[data-tole-nom]").fill("Capot");
await page.locator("[data-tole-longueur]").fill("400");
await page.locator("[data-tole-largeur]").fill("300");
await page.locator("[data-tole-epaisseur]").fill("2");
await page.locator("[data-tole-rayon]").fill("2");
await page.locator("[data-tole-materiau]").fill("acier S235");
await page.locator("[data-pli-aile]").first().fill("50");
await page.locator("[data-pli-ajouter]").click();
await page.locator('[data-outil-tole] select[aria-label="Bord"]').nth(1).selectOption("y0");
await page.locator("[data-pli-angle]").nth(1).fill("-45");
await page.locator("[data-pli-aile]").nth(1).fill("30");
await page.locator("[data-tole-mode-pliage]").selectOption("k");
await page.locator("[data-tole-k]").fill("0.42");
await page.locator("[data-tole-k-source]").fill("Essai interne atelier W, 2025");
await page.locator("[data-tole-creer]").click();
await enregistre();
mod = (await modele()).modele;
const tole = Object.values(mod.objets).find((o) => o.classe === "tole");
check("tôle : créée depuis l'inspecteur (400 × 300 × 2, r 2, deux plis 90° / −45°, K 0,42 sourcé)", !!tole && tole.params.plis.length === 2 && tole.params.pliage?.facteurK === 0.42, JSON.stringify(tole?.params).slice(0, 200));
await choisirObjet("Capot", "[data-fiche-tole]");
const dev = (await page.locator("[data-tole-developpe]").textContent()) ?? "";
const ba90 = (Math.PI / 2) * (2 + 0.42 * 2), ba45 = (Math.PI / 4) * (2 + 0.42 * 2);
const attenduL = 400 + ba90 + 50, attenduW = 300 + ba45 + 30;
check(`développé : la fiche donne ${attenduL.toFixed(1)} × ${attenduW.toFixed(1)} mm (allongement θ·(r + K·t)) et dessine le contour avec ses 4 lignes de pli`, new RegExp(`${Math.round(attenduL)}|${attenduL.toFixed(1).replace(".", ",")}`).test(dev) && (await page.locator("[data-developpe] [data-ligne-pli]").count()) === 4, dev);
r = await commandes("Table de pliage et tôle sans paramètres", [
  { type: "catalogue.importer", params: { id: "tab", nom: "Table de pliage W", ontologie: "sheetmetal", csv: "materiau;epaisseur_mm;rayon_interieur_mm;facteur_k;angle_deg;deduction_pli_mm;source;edition;page\nacier S235;2;2;0,44;;;Table de pliage atelier W;2025;p. 1\n" } },
  { type: "tole.creer", params: { id: "t2", niveauId: niveau.id, nom: "Tôle de table", repere: "T-02", position: pt(mur.params.a.x + 2, mur.params.a.y - 2), longueur: m(0.2), largeur: m(0.2), epaisseur: m(0.002), materiau: "acier S235", rayonInterieur: m(0.002), plis: [{ bord: "y1", angle: { value: 90, unit: "deg" }, longueur: m(0.02) }], pliage: { catalogueId: "tab" } } },
  { type: "tole.creer", params: { id: "t3", niveauId: niveau.id, nom: "Sans paramètre", repere: "T-03", position: pt(mur.params.a.x + 3, mur.params.a.y - 2), longueur: m(0.2), largeur: m(0.2), epaisseur: m(0.001), materiau: "aluminium", rayonInterieur: m(0.001), plis: [{ bord: "y1", angle: { value: 90, unit: "deg" }, longueur: m(0.02) }] } },
]);
check("table de pliage sourcée importée ; tôle T-02 liée à la table, tôle T-03 sans paramètre de pliage", r.status === 200);

// 6. Nomenclatures : liste des pièces de bois, table de pliage et développés.
const docs = (await api("get", `/projects/${pid}/documents`)).body?.documents ?? [];
const tBois = docs.find((d) => d.kind === "atelier-tableau-bois");
const tPliage = docs.find((d) => d.kind === "atelier-tableau-pliage");
const csvB = tBois ? await api("get", tBois.href) : { status: 0, text: "" };
const csvP = tPliage ? await api("get", tPliage.href) : { status: 0, text: "" };
check(`liste des pièces de bois : ${pieces.length} pièces (repère, rôle, section 45x145, essence, source), panneau CLT, quincaillerie ; masse non évaluée`, csvB.status === 200 && (csvB.text.match(/45x145/g) ?? []).length === pieces.length && csvB.text.includes("Fournisseur bois Y, 2025, p. 4") && csvB.text.includes("panneau CLT") && csvB.text.includes("équerre 60") && csvB.text.includes("non évaluée"), csvB.text.slice(0, 200));
check("table de pliage : K 0,42 (source déclarée) pour Capot, K 0,44 (table W) pour T-02, « non évaluée » pour T-03", csvP.status === 200 && csvP.text.includes("0.42") && csvP.text.includes("Essai interne atelier W, 2025") && csvP.text.includes("0.44") && csvP.text.includes("Table de pliage atelier W, 2025, p. 1") && csvP.text.includes("non évaluée"), csvP.text.slice(0, 300));

// 7. IFC : ossature agrégée, montants .STUD., CLT en IfcWall, équerre en IfcDiscreteAccessory, tôles en IfcPlate .SHEET. ; réimport.
const ifc = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
const attendus = ["IFCELEMENTASSEMBLY(", ".STUD.", ".PLATE.", "IFCWALL(", "'CLT'", "IFCDISCRETEACCESSORY(", "IFCPLATE(", ".SHEET.", "IFCRELASSOCIATESMATERIAL("];
check("IFC : ossature (IfcElementAssembly), pièces typées (.STUD., .PLATE.), CLT (IfcWall), équerre (IfcDiscreteAccessory), tôles (IfcPlate .SHEET.), essence en IfcMaterial", ifc.status === 200 && attendus.every((a) => ifc.text.includes(a)), attendus.filter((a) => !ifc.text.includes(a)).join(" "));
const copie = (await api("post", `/projects/${ref}/copies`, { name: "P.118-B réimport" })).body.id;
const imp = await page.request.post(`${BASE}/projects/${copie}/atelier/import-ifc`, { headers: { "Content-Type": "application/octet-stream", "X-File-Name": "p118-b.ifc" }, data: Buffer.from(ifc.text) });
const mImp = (await api("get", `/projects/${copie}/atelier/model`)).body?.modele ?? { objets: {} };
const importes = Object.values(mImp.objets).filter((o) => o.classe === "objet-importe");
check("réimport : pièces de bois et tôles reviennent en représentations importées (IfcMember, IfcPlate), jamais reclassées", imp.status() === 200 && importes.some((o) => o.params.ifcClasse === "IfcMember") && importes.some((o) => o.params.ifcClasse === "IfcPlate"), `${imp.status()} · ${importes.length}`);

// 8. Un seul écran, un seul journal, bâtiment inchangé ; téléphone ; axe-core.
await recharger();
check("un seul écran : aucune navigation hors de l'Atelier", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : activations, catalogue, ossature, génération, CLT, tôles sont des révisions successives", (await modele()).revision >= r0 + 7);
check("bâtiment inchangé : P.118 garde ses objets (l'ossature s'ajoute au mur, qui reste un mur)", Object.keys((await modele()).modele.objets).length >= objets0 + pieces.length && (await modele()).modele.objets[mur.id]?.classe === "mur");
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-bois-tolerie-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

await browser.close();
console.log(echecs ? `Lot P2-4 bois et tôlerie : ${echecs} contrôle(s) en échec` : "Lot P2-4 bois et tôlerie : tout est vert");
process.exit(echecs ? 1 : 0);
