/**
 * Lot P2-5 — Réseaux (cahier P2 §5 : « tracer un réseau de deux tuyaux et un raccord, la connectivité est vérifiée ;
 * P&ID dérivé ; IFC ») : dans P.118 copié, l'ontologie réseaux activée depuis le navigateur ; catalogue de tubes sourcé
 * et spécification ; réseau d'eau froide routé depuis l'inspecteur (deux tronçons et un coude connectés en une
 * révision) ; pompe créée depuis l'inspecteur, connexion refusée (sections différentes) puis acceptée depuis l'outil
 * Connexion ; connexion rompue par un déplacement, signalée puis réparée ; fiche d'un tronçon ; nomenclature CSV, P&ID
 * SVG, IFC réimporté ; un seul écran ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-reseaux.mjs
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
await page.fill('input[name="email"]', `p2-reseaux-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "reseaux-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-R" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
const m = (value) => ({ value, unit: "m" });
let n = 0;
const commandes = async (label, cmds) => { const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2r-${Date.now()}-${++n}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label, commands: cmds }); if (r.status !== 200) console.log("  ↳ refus", label, JSON.stringify(r.body).slice(0, 300)); return r; };
const recharger = async () => { await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }); await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 }); await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click(); await page.waitForTimeout(300); };
const choisirObjet = async (texte, selecteurFiche) => { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.keyboard.press("Escape"); await page.locator(".nav-filtre").fill(texte); await page.locator(`.nav-objets button:has-text("${texte}")`).first().click(); await page.waitForSelector(selecteurFiche, { timeout: 10000 }); await page.locator(".nav-filtre").fill(""); };
const outil = async (recherche, selecteur, garderSelection = false) => {
  if (!garderSelection) { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.locator(".plan2d").focus().catch(() => {}); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  await page.locator(".barre-palette").click(); await page.locator(".palette-champ").fill(recherche); await page.keyboard.press("Enter");
  try { await page.waitForSelector(selecteur, { timeout: 15000 }); } catch (e) { console.log("  ↳ outil non affiché :", recherche, "| actif =", await page.evaluate(() => document.querySelector(".atelier-n")?.dataset.outilActif), "| sélection =", await page.evaluate(() => document.querySelectorAll(".plan2d .est-selectionne").length)); throw e; }
};
const CSV = "designation;diametre_exterieur_mm;epaisseur_mm;diametre_nominal;fluide;materiau;source;edition;page\nTube 60,3 x 2,9;60,3;2,9;DN 50;eau;acier;Catalogue tubes T;2025;p. 7\nTube 33,7 x 2,6;33,7;2,6;DN 25;eau;acier;Catalogue tubes T;2025;p. 7\n";

// 1. P.118-R dans l'Atelier ; activation de l'ontologie réseaux depuis le navigateur.
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
await page.locator('[data-ontologie="mep"]').check();
await enregistre();
check("activation : ontologie réseaux activée par une commande du journal (ontologies = [mep])", JSON.stringify((await modele()).modele.ontologies) === JSON.stringify(["mep"]), JSON.stringify((await modele()).modele.ontologies));
await page.locator(".barre-palette").click();
await page.locator(".palette-champ").fill("tuyau");
await page.waitForTimeout(200);
check("palette : « Segment de réseau » proposé pour « tuyau », sans écran nouveau", /Segment de réseau/.test((await page.locator(".palette").textContent()) ?? "") && navigations.length === 0);
await page.keyboard.press("Escape");

// 2. Catalogue de tubes sourcé et spécification (API, données du projet) ; rechargement.
let r = await commandes("Catalogue de tubes et spécification", [
  { type: "catalogue.importer", params: { id: "cat-tubes", nom: "Tubes T (sourcé)", ontologie: "mep", csv: CSV } },
  { type: "specification.definir", params: { id: "spec-ef", nom: "Eau froide acier", systeme: "tuyau", fluide: "eau froide", materiau: "acier", catalogueId: "cat-tubes", designations: ["Tube 60,3 x 2,9"] } },
]);
check("catalogue tubes-raccords.csv sourcé importé (deux lignes, DN 50 et DN 25) et spécification « Eau froide acier » définie sur ce catalogue", r.status === 200 && (await modele()).modele.definitions["spec-ef"]?.classe === "specification");
await recharger();

// 3. Réseau routé depuis l'inspecteur : trois sommets, coudes de 100 mm, section du catalogue par la spécification.
const cx = 20, cy = 20;
await outil("tuyau", "[data-outil-segment-reseau]");
await page.locator("[data-segment-nom]").fill("EF");
await page.locator("[data-segment-sommets]").fill(`${cx} ; ${cy} ; 2,5\n${cx + 4} ; ${cy} ; 2,5\n${cx + 4} ; ${cy + 3} ; 2,5`);
await page.locator("[data-segment-fluide]").fill("eau froide");
await page.locator("[data-segment-sens]").selectOption("a-vers-b");
await page.locator('[data-editeur-section-reseau="outil-sectionReseau"] [data-section-mode]').selectOption("catalogue");
await page.locator('[data-editeur-section-reseau="outil-sectionReseau"] [data-section-designation]').fill("Tube 60,3 x 2,9");
await page.locator("[data-choix-specification]").selectOption("spec-ef");
await page.locator("[data-segment-coude]").fill("100");
check("outil Segment : trois sommets saisis, le bouton propose « Router le réseau »", /Router le réseau/.test((await page.locator("[data-segment-creer]").textContent()) ?? ""));
await page.locator("[data-segment-creer]").click();
await enregistre();
let mod = (await modele()).modele;
const segments = Object.values(mod.objets).filter((o) => o.classe === "segment-reseau").sort((a, b) => (a.id < b.id ? -1 : 1));
const coudes = Object.values(mod.objets).filter((o) => o.classe === "raccord-reseau");
const connexions = () => Object.values(mod.relations).filter((x) => x.kind === "connecte");
check(`routage : deux tronçons et un coude créés en une révision (${segments.length} segments, ${coudes.length} coude), tronçons raccourcis des bras (3,9 m et 2,9 m), deux connexions`, segments.length === 2 && coudes.length === 1 && Math.abs(Math.hypot(segments[0].params.sommets[1].x - segments[0].params.sommets[0].x, segments[0].params.sommets[1].y - segments[0].params.sommets[0].y) - 3.9) < 1e-6 && connexions().length === 2, JSON.stringify(segments.map((s) => s.params.sommets)));
check("spécification pilotée : section « Tube 60,3 x 2,9 (DN 50) » du catalogue sourcé, fluide et matériau hérités de la spécification", segments.every((s) => s.params.profil?.diametreNominal === "DN 50" && s.params.fluide === "eau froide" && s.params.materiau === "acier" && s.params.specificationId === "spec-ef"), JSON.stringify(segments[0]?.params).slice(0, 200));
await page.waitForFunction(() => document.querySelectorAll(".plan2d .obj-segment-reseau").length >= 2, null, { timeout: 15000 }).catch(() => {});
check("plan : les tronçons et le coude se dessinent dans le même plan que le bâtiment", (await page.locator(".plan2d .obj-segment-reseau").count()) === 2 && (await page.locator(".plan2d .obj-raccord-reseau").count()) === 1);
await page.screenshot({ path: `${OUT}/p2-reseaux-routage.png` });

// 4. Pompe depuis l'inspecteur (aspiration DN 25 d'abord : connexion refusée, sections différentes), puis corrigée ; connexion depuis l'outil.
await outil("pompe", "[data-outil-equipement-reseau]");
await page.locator("[data-equipement-nom]").fill("Pompe P1");
await page.locator("[data-equipement-type]").fill("pompe");
await page.locator("[data-equipement-categorie]").selectOption("mouvement");
await page.locator("[data-equipement-x]").fill(String(cx + 4));
await page.locator("[data-equipement-y]").fill(String(cy + 3.5));
await page.locator("[data-equipement-z]").fill("2.2");
await page.locator("[data-equipement-longueur]").fill("600");
await page.locator("[data-equipement-largeur]").fill("400");
await page.locator("[data-equipement-hauteur]").fill("600");
await page.locator("[data-port-id]").first().fill("asp");
await page.locator("[data-port-dy]").first().fill("-0.5");
await page.locator("[data-port-dz]").first().fill("0.3");
await page.locator("[data-port-sens]").first().selectOption("entree");
await page.locator("[data-port-diametre]").first().fill("33.7");
await page.locator("[data-port-fluide]").first().fill("eau froide");
await page.locator("[data-equipement-creer]").click();
await enregistre();
mod = (await modele()).modele;
const pompe = Object.values(mod.objets).find((o) => o.classe === "equipement-reseau");
check("pompe : créée depuis l'inspecteur (600 × 400 × 600, port d'aspiration Ø 33,7 en entrée, à 0,3 m au-dessus de la base)", !!pompe && pompe.params.ports.length === 1 && pompe.params.ports[0].sens === "entree", JSON.stringify(pompe?.params).slice(0, 200));
const dernier = segments[1];
await page.locator(".nav-filtre").fill("EF 2");
await page.locator('.nav-objets button:has-text("EF 2")').first().click();
await page.keyboard.down("Shift");
await page.locator(".nav-filtre").fill("Pompe P1");
await page.locator('.nav-objets button:has-text("Pompe P1")').first().click();
await page.keyboard.up("Shift");
await page.locator(".nav-filtre").fill("");
await outil("connecter", "[data-outil-connexion-reseau]", true);
const motifs = (await page.locator("[data-connexion-motifs]").textContent().catch(() => "")) ?? "";
check("connexion : lue avant d'agir — « sections différentes » (Ø 60 / Ø 34) et le bouton Connecter est inactif", /sections différentes/.test(motifs) && (await page.locator("[data-connexion-creer]").isDisabled()), motifs || "aucun motif affiché");
const refus = await commandes("Connexion incompatible (serveur)", [{ type: "reseau.connecter", params: { a: dernier.id, portA: "b", b: pompe.id, portB: "asp" } }]);
r = await commandes("Aspiration corrigée en DN 50", [{ type: "equipementReseau.modifier", params: { id: pompe.id, params: { ports: [{ id: "asp", dy: -0.5, dz: 0.3, sens: "entree", section: { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) }, systeme: "tuyau", fluide: "eau froide" }] } } }]);
check("le serveur refuse lui aussi la connexion incompatible (409, « sections différentes ») ; aspiration corrigée en Ø 60,3 par une révision", refus.status === 409 && /sections différentes/.test(JSON.stringify(refus.body)) && r.status === 200, `${refus.status} ${JSON.stringify(refus.body).slice(0, 160)}`);
// Le modèle corrigé est relu (rechargement), les deux objets resélectionnés, l'outil Connexion rouvert.
await recharger();
await page.locator(".nav-filtre").fill("EF 2");
await page.locator('.nav-objets button:has-text("EF 2")').first().click();
await page.keyboard.down("Shift");
await page.locator(".nav-filtre").fill("Pompe P1");
await page.locator('.nav-objets button:has-text("Pompe P1")').first().click();
await page.keyboard.up("Shift");
await page.locator(".nav-filtre").fill("");
await outil("connecter", "[data-outil-connexion-reseau]", true);
await page.waitForFunction(() => !!document.querySelector("[data-connexion-pret]"), null, { timeout: 15000 }).catch(() => {});
check("après correction, l'outil annonce « Ports compatibles » (même section, entrée ← sortie, ports coïncidents)", (await page.locator("[data-connexion-pret]").count()) === 1, await page.locator("[data-outil-connexion-reseau]").textContent());
await page.locator("[data-connexion-creer]").click();
await enregistre();
mod = (await modele()).modele;
check("connexion EF 2 → pompe enregistrée : trois connexions, aucun problème de réseau", connexions().length === 3 && !Object.values(mod.problemes).some((p) => p.type === "reseau"), `${connexions().length} connexion(s)`);

// 5. Connexion rompue par un déplacement (problème « reseau »), réparée en revenant.
r = await commandes("Déplacer la pompe de 2 cm", [{ type: "transformer.deplacer", params: { dx: 0.02, dy: 0 }, cibles: [pompe.id] }]);
let pb = (await api("get", `/projects/${pid}/atelier/problemes`)).body.problemes.filter((p) => p.type === "reseau");
check("pompe déplacée de 20 mm : la connexion est rejugée, problème « ports distants de 20 mm » signalé, jamais corrigé en silence", pb.length === 1 && /20 mm/.test(pb[0].message), JSON.stringify(pb));
await recharger();
await choisirObjet("Pompe P1", "[data-fiche-reseau]");
const ficheP = (await page.locator("[data-fiche-reseau]").textContent()) ?? "";
check("fiche de la pompe : ports avec leur état (asp connecté à EF 2:b), problème de connectivité affiché, performances non évaluées", /connecté à/.test(ficheP) && /20 mm/.test(ficheP) && /non évaluées/.test(ficheP), ficheP.slice(0, 300));
r = await commandes("Ramener la pompe", [{ type: "transformer.deplacer", params: { dx: -0.02, dy: 0 }, cibles: [pompe.id] }]);
pb = (await api("get", `/projects/${pid}/atelier/problemes`)).body.problemes.filter((p) => p.type === "reseau");
check("pompe ramenée : le problème disparaît", pb.length === 0);

// 6. Vanne, gaine et support (API), fiche d'un tronçon.
r = await commandes("Gaine, vanne et support", [
  { type: "segmentReseau.creer", params: { id: "gaine-1", niveauId: niveau.id, nom: "Soufflage", systeme: "gaine", sommets: [{ x: cx, y: cy + 6, z: 2.8 }, { x: cx + 6, y: cy + 6, z: 2.8 }], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.25) }, fluide: "air" } },
  { type: "supportReseau.creer", params: { id: "susp-1", porteId: "gaine-1", type: "suspente", position: pt(cx + 3, cy + 6), z: 2.8, longueur: m(0.2) } },
  { type: "vanne.creer", params: { id: "vanne-1", niveauId: niveau.id, nom: "V1", repere: "V-01", type: "anti-retour", position: pt(cx + 8, cy), z: 2.5, section: { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) }, longueur: m(0.2), fluide: "eau froide" } },
]);
check("gaine rectangulaire 400 × 250 (air), suspente de 200 mm et clapet anti-retour : objets du modèle", r.status === 200 && !!(await modele()).modele.objets["vanne-1"]);
await recharger();
await choisirObjet("EF 1", "[data-fiche-reseau]");
const ficheS = (await page.locator("[data-fiche-reseau]").textContent()) ?? "";
check("fiche du tronçon EF 1 : section du catalogue et sa source, longueur 3,9 m, port a libre, port b connecté au coude", /DN 50/.test(ficheS) && /Catalogue tubes T/.test(ficheS) && /3,9/.test(ficheS) && (await page.locator('[data-fiche-ports] [data-port="a"][data-port-etat="libre"]').count()) === 1 && (await page.locator('[data-fiche-ports] [data-port="b"][data-port-etat="connecte"]').count()) === 1, ficheS.slice(0, 300));

// 7. Documents : nomenclature de réseau (CSV), P&ID (SVG), IFC MEP réimporté.
const docs = (await api("get", `/projects/${pid}/documents`)).body?.documents ?? [];
const tReseau = docs.find((d) => d.kind === "atelier-tableau-reseau");
const pidDoc = docs.find((d) => d.kind === "atelier-pid");
const csv = tReseau ? await api("get", tReseau.href) : { status: 0, text: "" };
const svg = pidDoc ? await api("get", pidDoc.href) : { status: 0, text: "" };
check("nomenclature de réseau : tronçons (DN 50, source, spécification), coude, vanne anti-retour, pompe, suspente ; masse non évaluée", csv.status === 200 && (csv.text.match(/Tube 60,3 x 2,9 \(DN 50\)/g) ?? []).length >= 3 && csv.text.includes("Catalogue tubes T, 2025, p. 7") && csv.text.includes("Eau froide acier") && csv.text.includes("anti-retour") && csv.text.includes("pompe (mouvement)") && csv.text.includes("suspente") && csv.text.includes("non évaluée"), csv.text.slice(0, 300));
check("P&ID dérivé (SVG) : 3 segments, nœuds coude / vanne / pompe, ports libres marqués (EF 1:a, vanne, gaine), aucune valeur de débit", svg.status === 200 && svg.text.includes("data-pid") && (svg.text.match(/data-segment=/g) ?? []).length === 3 && (svg.text.match(/data-noeud=/g) ?? []).length === 3 && (svg.text.match(/data-port-libre=/g) ?? []).length === 5, `${svg.status} · ${(svg.text.match(/data-port-libre=/g) ?? []).length} libres`);
const ifc = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
const attendus = ["IFCPIPESEGMENT(", "IFCPIPEFITTING(", ".BEND.", "IFCVALVE(", ".CHECK.", "IFCFLOWMOVINGDEVICE(", "IFCDUCTSEGMENT(", "IFCDISCRETEACCESSORY(", "IFCDISTRIBUTIONPORT(", "IFCRELNESTS(", "IFCRELCONNECTSPORTS(", "IFCDISTRIBUTIONSYSTEM("];
check("IFC MEP : IfcPipeSegment / IfcPipeFitting .BEND. / IfcValve .CHECK. / IfcFlowMovingDevice / IfcDuctSegment / IfcDiscreteAccessory, ports IfcDistributionPort emboîtés, IfcRelConnectsPorts, IfcDistributionSystem", ifc.status === 200 && attendus.every((a) => ifc.text.includes(a)), attendus.filter((a) => !ifc.text.includes(a)).join(" "));
const copie = (await api("post", `/projects/${ref}/copies`, { name: "P.118-R réimport" })).body.id;
const imp = await page.request.post(`${BASE}/projects/${copie}/atelier/import-ifc`, { headers: { "Content-Type": "application/octet-stream", "X-File-Name": "p118-r.ifc" }, data: Buffer.from(ifc.text) });
const mImp = (await api("get", `/projects/${copie}/atelier/model`)).body?.modele ?? { objets: {} };
const importes = Object.values(mImp.objets).filter((o) => o.classe === "objet-importe");
check("réimport : tuyaux, vanne et pompe reviennent en représentations importées (IfcPipeSegment, IfcValve), jamais reclassés", imp.status() === 200 && importes.some((o) => o.params.ifcClasse === "IfcPipeSegment") && importes.some((o) => o.params.ifcClasse === "IfcValve"), `${imp.status()} · ${importes.length}`);

// 8. Un seul écran, un seul journal, bâtiment inchangé ; téléphone ; axe-core.
await recharger();
check("un seul écran : aucune navigation hors de l'Atelier", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : activation, catalogue, routage, pompe, connexion, déplacements, gaine sont des révisions successives", (await modele()).revision >= r0 + 8);
check("bâtiment inchangé : P.118 garde ses objets, le réseau s'y ajoute", Object.keys((await modele()).modele.objets).length >= objets0 + 7);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-reseaux-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

await browser.close();
console.log(echecs ? `Lot P2-5 réseaux : ${echecs} contrôle(s) en échec` : "Lot P2-5 réseaux : tout est vert");
process.exit(echecs ? 1 : 0);
