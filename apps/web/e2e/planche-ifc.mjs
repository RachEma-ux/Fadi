/**
 * Recette « IFC structuré » de la Planche (cas 4 du catalogue des extensions, lot C4, étape 6 : D10-S-001, D10-F14-012,
 * N-D10-1, D10-R-002, D10-R-006, N-D10-2, D10-F14-124 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-6-ifc.png`) :
 * - Ctrl+Maj+Espace puis O ouvre « Import IFC structuré » ; le fichier choisi est lu (schéma, étages, trame,
 *   géoréférencement, classes, géométries non lues comptées) ; Maj+O importe en un pas : étages en niveaux, objets
 *   rattachés à leur étage avec leur classe et leur GlobalId, trame en guides étiquetés, point de base posé ;
 *   le fichier reçu est archivé en base ;
 * - Ctrl+Maj+Espace puis U ouvre « IFC structuré » ; Maj+K contrôle avant émission (constats) ; Maj+U exporte, relu à
 *   l'identique avant le téléchargement : classes et GlobalId gardés, géoréférencement depuis le point de base et le
 *   niveau de référence ; .ifczip ; IFC2X3 ;
 * - chaque commande : icône et raccourci ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-ifc node apps/web/e2e/planche-ifc.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-ifc";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

// Fichier reçu : IFC4 en millimètres, deux étages, un mur extrudé au rez, une dalle triangulée à l'étage, un poteau en
// sphère (géométrie non lue), une trame de deux axes, un géoréférencement EPSG:2056 tourné de 30°.
const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('recu.ifc','2026-11-27T21:00:00',(''),(''),'Recette','Recette','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCCARTESIANPOINT((0.,0.,0.));
#4=IFCAXIS2PLACEMENT3D(#3,$,$);
#5=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#4,$);
#6=IFCPROJECT('0P000000000000000000a1',$,'Recu',$,$,$,$,(#5),#2);
#7=IFCPROJECTEDCRS('EPSG:2056',$,$,$,$,$,$);
#8=IFCMAPCONVERSION(#5,#7,2600120.,1199870.,432.15,0.866025403784,0.5,1.);
#9=IFCLOCALPLACEMENT($,#4);
#10=IFCBUILDINGSTOREY('0S000000000000000000a1',$,'Rez',$,$,#9,$,$,.ELEMENT.,0.);
#11=IFCCARTESIANPOINT((0.,0.,3000.));
#12=IFCAXIS2PLACEMENT3D(#11,$,$);
#13=IFCLOCALPLACEMENT(#9,#12);
#14=IFCBUILDINGSTOREY('0S000000000000000000a2',$,'Etage 1',$,$,#13,$,$,.ELEMENT.,3000.);
#20=IFCCARTESIANPOINT((2000.,500.));
#21=IFCAXIS2PLACEMENT2D(#20,$);
#22=IFCRECTANGLEPROFILEDEF(.AREA.,$,#21,4000.,200.);
#23=IFCDIRECTION((0.,0.,1.));
#24=IFCEXTRUDEDAREASOLID(#22,#4,#23,2500.);
#25=IFCSHAPEREPRESENTATION(#5,'Body','SweptSolid',(#24));
#26=IFCPRODUCTDEFINITIONSHAPE($,$,(#25));
#27=IFCWALL('0W000000000000000000a1',$,'Mur nord',$,$,#9,#26,$,.NOTDEFINED.);
#30=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(4000.,0.,0.),(4000.,3000.,0.),(0.,3000.,0.)));
#31=IFCTRIANGULATEDFACESET(#30,$,$,((1,2,3),(1,3,4)),$);
#32=IFCSHAPEREPRESENTATION(#5,'Body','Tessellation',(#31));
#33=IFCPRODUCTDEFINITIONSHAPE($,$,(#32));
#34=IFCSLAB('0D000000000000000000a1',$,'Dalle',$,$,#13,#33,$,.FLOOR.);
#35=IFCSPHERE(#4,300.);
#36=IFCSHAPEREPRESENTATION(#5,'Body','CSG',(#35));
#37=IFCPRODUCTDEFINITIONSHAPE($,$,(#36));
#38=IFCCOLUMN('0C000000000000000000a1',$,'Poteau',$,$,#9,#37,$,.NOTDEFINED.);
#39=IFCRELCONTAINEDINSPATIALSTRUCTURE('0R000000000000000000a1',$,$,$,(#27,#38),#10);
#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('0R000000000000000000a2',$,$,$,(#34),#14);
#50=IFCCARTESIANPOINT((0.,-1000.));
#51=IFCCARTESIANPOINT((0.,5000.));
#52=IFCPOLYLINE((#50,#51));
#53=IFCGRIDAXIS('A',#52,.T.);
#54=IFCCARTESIANPOINT((-1000.,0.));
#55=IFCCARTESIANPOINT((6000.,0.));
#56=IFCPOLYLINE((#54,#55));
#57=IFCGRIDAXIS('1',#56,.T.);
#58=IFCGRID('0G000000000000000000a1',$,'Trame',$,$,#9,$,(#53),(#57),$,$);
ENDSEC;
END-ISO-10303-21;
`;
writeFileSync(`${OUT}/recu.ifc`, IFC);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `ifc-${Date.now()}@example.com`, "planche-ifc-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const vue = page.locator("[data-planche-vue]");
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.locator("[data-planche-deux-temps]").waitFor();
  await page.keyboard.press(touche);
  await page.waitForTimeout(80);
};
const telechargements = [];
page.on("download", (d) => telechargements.push(d));
const attendre = async (n) => {
  for (let i = 0; i < 100 && telechargements.length < n; i++) await page.waitForTimeout(100);
  return Promise.all(telechargements.splice(0, n).map(async (d) => ({ nom: d.suggestedFilename(), octets: readFileSync(await d.path()) })));
};

// --- Import IFC structuré ------------------------------------------------------------------------------------------------
await deuxTemps("o");
const imp = page.locator("[data-planche-import-ifc]");
await imp.waitFor();
check("Ctrl+Maj+Espace puis O ouvre « Import IFC structuré », hors de la colonne", (await page.evaluate(() => window.fadiPlanche.panneau())) === "import-ifc" && (await page.locator("[data-planche-panneau-icone='import-ifc']").count()) === 0);
check("sans fichier : Importer grisé avec son motif", (await imp.locator("[data-planche-commande='importer-ifc']").isDisabled()) && ((await imp.locator("[data-planche-commande='importer-ifc']").getAttribute("title")) ?? "").includes("Choisissez d'abord un fichier IFC"));
await page.locator("[data-planche-import-ifc-entree]").setInputFiles(`${OUT}/recu.ifc`);
await page.waitForFunction(() => document.querySelector("[data-planche-import-ifc]")?.getAttribute("data-planche-import-ifc") === "2");
const lu = (await imp.locator("[data-planche-import-ifc-lu]").textContent()) ?? "";
check("fichier lu : nom, schéma IFC4, 2 objets", lu.includes("recu.ifc") && lu.includes("IFC4") && lu.includes("2 objet"), lu);
const texteImport = (await imp.textContent()) ?? "";
check("2 étages (Rez ±0,00, Etage 1 +3,00), trame A et 1, géoréférencement EPSG:2056 lu", texteImport.includes("2 étage(s)") && texteImport.includes("Rez ±0,00") && texteImport.includes("Etage 1 +3,00") && texteImport.includes("2 axe(s) (A, 1)") && texteImport.includes("EPSG:2056"), texteImport.slice(0, 300));
check("géométrie non lue comptée (IfcColumn)", ((await imp.locator("[data-planche-import-ifc-non-lus]").textContent()) ?? "").includes("IfcColumn"));
check("classes lues : IfcSlab, IfcWall", ((await imp.locator("[data-planche-import-ifc-classes]").textContent()) ?? "").includes("IfcSlab") && ((await imp.locator("[data-planche-import-ifc-classes]").textContent()) ?? "").includes("IfcWall"));
await imp.locator("[data-planche-import-ifc-choix='georef']").check();
const pas0 = await pas();
await deuxTemps("Shift+O");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 2);
await page.locator("[data-planche-import-ifc-note]").waitFor();
let m = await modele();
const occs = Object.values(m.racine.occurrences);
const niveaux = Object.values(m.annotations?.niveaux ?? {}).sort((a, b) => a.altitude - b.altitude);
check("Maj+O : un seul pas d'historique", (await pas()) === pas0 + 1);
check("étages en niveaux : Rez à 0 m, Etage 1 à 3 m (hauteur 3 m)", niveaux.length === 2 && niveaux[0].nom === "Rez" && niveaux[1].altitude === 3 && niveaux[0].hauteur === 3, JSON.stringify(niveaux));
const mur = occs.find((o) => o.ifc?.classe === "IfcWall");
const dalle = occs.find((o) => o.ifc?.classe === "IfcSlab");
check("objets : classe et GlobalId gardés, rattachés à leur étage", mur?.ifc.globalId === "0W000000000000000000a1" && dalle?.ifc.globalId === "0D000000000000000000a1" && mur.niveau === niveaux[0].id && dalle.niveau === niveaux[1].id);
check("trame en guides étiquetés A et 1", Object.values(m.annotations?.guides ?? {}).length === 2 && JSON.stringify(Object.values(m.annotations?.textes ?? {}).map((x) => x.texte).sort()) === JSON.stringify(["1", "A"]));
const pb = m.annotations?.reglages?.pointDeBase;
check("point de base posé : EPSG:2056, E 2 600 120, N 1 199 870, nord 30°", pb?.systeme === "EPSG:2056" && pb.e === 2600120 && pb.n === 1199870 && Math.abs(pb.rotation - 30) < 1e-6, JSON.stringify(pb));
await page.screenshot({ path: `${OUT}/01-import.png` });
await page.keyboard.press("Control+z");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 0);
check("Annuler retire tout l'import (objets, niveaux, trame, point de base)", Object.keys((await modele()).annotations?.niveaux ?? {}).length === 0 && !(await modele()).annotations?.reglages?.pointDeBase);
await page.keyboard.press("Control+y");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 2);

// --- Niveau de référence (H du géoréférencement) ---------------------------------------------------------------------------
await page.locator("[data-planche-panneau-icone='niveaux']").click();
await page.locator("[data-planche-niveaux-reference]").fill("432,15");
await page.locator("[data-planche-niveaux-reference]").press("Enter");
await page.waitForTimeout(300);

// --- Export IFC structuré -------------------------------------------------------------------------------------------------
await deuxTemps("u");
const exp = page.locator("[data-planche-ifc]");
await exp.waitFor();
check("Ctrl+Maj+Espace puis U ouvre « IFC structuré », IFC4 par défaut", (await page.evaluate(() => window.fadiPlanche.panneau())) === "ifc-structure" && (await exp.getAttribute("data-planche-ifc")) === "IFC4");
const classes = (await exp.locator("[data-planche-ifc-classes]").textContent()) ?? "";
check("classes écrites : 2 niveaux, IfcSlab, IfcWall, classe importée", classes.includes("2 niveau(x)") && classes.includes("IfcSlab") && classes.includes("IfcWall") && classes.includes("2 objet(s) réexporté(s)"), classes);
const georefTexte = ((await exp.locator("[data-planche-ifc-georef-texte]").textContent()) ?? "").replace(/[\u202f\u00a0]/g, " ");
check("géoréférencement : EPSG:2056 · E 2 600 120,000 · H 432,150", georefTexte.includes("E 2 600 120,000") && georefTexte.includes("H 432,150") && (await exp.locator("[data-planche-ifc-georef]").isChecked()), georefTexte);
await deuxTemps("Shift+K");
await page.waitForFunction(() => (document.querySelector("[data-planche-ifc-constats]")?.getAttribute("data-planche-ifc-constats") ?? "") !== "");
const constats = (await exp.locator("[data-planche-ifc-constats]").getAttribute("data-planche-ifc-constats")) ?? "";
check("Maj+K : contrôle avant émission (géoréférencement déclaré, objets rattachés)", constats.includes("georef-declare") && constats.includes("objets-niveau"), constats);
await deuxTemps("Shift+U");
let fichiers = await attendre(1);
const ifc = fichiers[0];
const texte = ifc ? ifc.octets.toString("utf8") : "";
if (ifc) writeFileSync(`${OUT}/${ifc.nom}`, ifc.octets);
check("Maj+U : un fichier .ifc IFC4 téléchargé", !!ifc && ifc.nom.endsWith(".ifc") && texte.includes("FILE_SCHEMA(('IFC4'))"), ifc?.nom);
check("classes et GlobalId réexportés à l'identique", texte.includes("IFCWALL('0W000000000000000000a1'") && texte.includes("IFCSLAB('0D000000000000000000a1'"));
check("géoréférencé : IfcMapConversion (E, N, H) et IfcProjectedCRS", /IFCMAPCONVERSION\(#\d+,#\d+,2600120\.,1199870\.,432\.15,/.test(texte) && texte.includes("IFCPROJECTEDCRS('EPSG:2056'"));
check("deux IfcBuildingStorey (0 et 3 m)", (texte.match(/IFCBUILDINGSTOREY\(/g) ?? []).length === 2);
check("relu à l'identique avant le téléchargement", ((await exp.locator("[data-planche-ifc-note]").textContent()) ?? "").includes("Relu à l'identique : 2 étage(s), 2 objet(s)"), (await exp.locator("[data-planche-ifc-note]").textContent()) ?? "");
await exp.locator("[data-planche-ifc-format='ifczip']").check();
await exp.locator("[data-planche-ifc-schema='IFC2X3']").check();
await exp.locator("[data-planche-commande='exporter-ifc']").click();
fichiers = await attendre(1);
const zip = fichiers[0];
check(".ifczip en IFC2X3 : archive ZIP contenant le fichier .ifc", !!zip && zip.nom.endsWith(".ifczip") && zip.octets.readUInt32LE(0) === 0x04034b50 && zip.octets.includes(Buffer.from("FILE_SCHEMA(('IFC2X3'))")), zip?.nom);
if (zip) writeFileSync(`${OUT}/${zip.nom}`, zip.octets);
await page.screenshot({ path: `${OUT}/02-export.png` });

// --- Règle d'or ----------------------------------------------------------------------------------------------------------------
let regle = true;
for (const [id, r] of [["exporter-ifc", "Maj+U"], ["controler-ifc", "Maj+K"]]) regle &&= ((await exp.locator(`[data-planche-commande='${id}']`).getAttribute("title")) ?? "").includes(`Ctrl+Maj+Espace, ${r}`) && (await exp.locator(`[data-planche-commande='${id}'] svg`).count()) === 1;
await deuxTemps("o");
await imp.waitFor();
regle &&= ((await imp.locator("[data-planche-commande='importer-ifc']").getAttribute("title")) ?? "").includes("Ctrl+Maj+Espace, Maj+O") && (await imp.locator("[data-planche-commande='importer-ifc'] svg").count()) === 1;
check("chaque commande des deux panneaux : icône et raccourci", regle);

// --- Menu par familles (28 novembre 2026) : recherche par nom dans l'encadré en deux temps ----------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+Space");
const encadre = page.locator("[data-planche-deux-temps]");
await encadre.waitFor();
check("encadré : champ de recherche, aucune famille affichée tant qu'aucune n'a de commande, commandes actuelles listées",
  (await encadre.locator("[data-planche-deux-temps-recherche]").count()) === 1 && (await encadre.locator("[data-planche-deux-temps-porte]").count()) === 0
  && (await encadre.locator("[data-planche-deux-temps-commande='ifc-structure'] kbd").textContent()) === "U");
await page.keyboard.press("Tab");
const champ = encadre.locator("[data-planche-deux-temps-recherche]");
await page.waitForFunction(() => document.activeElement?.hasAttribute("data-planche-deux-temps-recherche"));
await page.keyboard.type("ifc structu");
const trouves = await encadre.locator("[data-planche-deux-temps-resultat]").evaluateAll((l) => l.map((x) => x.getAttribute("data-planche-deux-temps-resultat")));
check("Tab ouvre la recherche ; « ifc structu » trouve IFC structuré et l'import, sans casse ni accents", trouves.includes("ifc-structure") && trouves.includes("import-ifc"), JSON.stringify(trouves));
await page.waitForTimeout(5500);
check("la recherche ouverte ne se referme pas d'elle-même (pas de délai de 5 s)", (await encadre.count()) === 1);
const premier = trouves[0];
check("le premier résultat est choisi, sa touche affichée", (await encadre.locator(`[data-planche-deux-temps-resultat='${premier}']`).getAttribute("aria-selected")) === "true");
await champ.press("Escape");
check("Échap ferme l'encadré et rend le focus à la vue", (await encadre.count()) === 0 && (await page.evaluate(() => document.activeElement?.hasAttribute("data-planche-vue"))));
await page.keyboard.press("Control+Shift+Space");
await encadre.waitFor();
await page.keyboard.press("Tab");
await page.waitForFunction(() => document.activeElement?.hasAttribute("data-planche-deux-temps-recherche"));
await page.keyboard.type("IFC STRUCTURÉ");
const ordre = await encadre.locator("[data-planche-deux-temps-resultat]").evaluateAll((l) => l.map((x) => x.getAttribute("data-planche-deux-temps-resultat")));
const cible = ordre.indexOf("ifc-structure");
for (let i = 0; i < cible; i++) await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.fadiPlanche.panneau() === "ifc-structure");
check("Flèches puis Entrée lancent la commande choisie (IFC structuré)", (await encadre.count()) === 0 && (await page.evaluate(() => window.fadiPlanche.panneau())) === "ifc-structure");
await page.keyboard.press("Control+Shift+Space");
await encadre.waitFor();
await page.keyboard.press("Shift+I");
await page.waitForTimeout(80);
check("une porte sans famille livrée ne fait rien et l'encadré se referme", (await encadre.count()) === 0);
await page.screenshot({ path: `${OUT}/03-recherche.png` });

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette de l'IFC structuré : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette de l'IFC structuré : tous les contrôles passent.");
