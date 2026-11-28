/**
 * Recette « Échanges, import et export » de la Planche (cas 2 du catalogue, lot 6 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-6/lot6-1` à `lot6-4`, acceptées le 27 novembre 2026) :
 * - Fichier > Importer > IFC (fichier d'essai en millimètres) : « Import IFC · rapport d'échange » s'ouvre — 4 objets
 *   écrits, 1 omis (ouverture), 1 approché (poteau rond), 1 refusé (surface courbe), représentations lues comptées ;
 *   rangement par étage (Rez-de-chaussée, Étage 1) ; fichier et rapport archivés en base (« planche-echange ») ;
 * - l'objet importé masqué au Navigateur ; Fichier > Exporter > OBJ ouvre « Exporter » : unité et repère écrits, objet
 *   masqué déclaré puis inclus, rapport prévu ; Exporter télécharge le fichier et son .rapport.txt ;
 * - Alt+F1 : « Fichier natif et image » ; la Planche exportée (.planche) porte l'empreinte SHA-256 de son contenu ;
 *   réimportée, elle ouvre une nouvelle Planche (empreinte conforme) ; modifiée hors Fadi, elle est refusée ; image
 *   1200 × 800 px à fond transparent (PNG RGBA) puis opaque (PNG RGB), cadre affiché sur la vue ;
 * - Ctrl+V d'un texte quelconque garde le collage interne ; un tracé SVG collé ouvre « Coller un tracé » (unité demandée),
 *   posé en arêtes ; une liste de sommets passe aussi ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-echanges node apps/web/e2e/planche-echanges.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-echanges";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

// Fichier IFC4 d'essai (le même que les tests du modèle) : aucune donnée réelle.
const IFC_ESSAI = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('Immeuble.ifc','2026-11-27',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('0aaaaaaaaaaaaaaaaaaaaa',$,'Projet',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCSITE('0site000000000000000000',$,'Site',$,$,#12,$,$,.ELEMENT.,$,$,$,$,$);
#14=IFCCARTESIANPOINT((1000.,0.,0.));
#15=IFCAXIS2PLACEMENT3D(#14,$,$);
#16=IFCLOCALPLACEMENT(#12,#15);
#17=IFCBUILDING('0bat0000000000000000000',$,'Bâtiment',$,$,#16,$,$,.ELEMENT.,$,$,$);
#20=IFCLOCALPLACEMENT(#16,#11);
#21=IFCBUILDINGSTOREY('0rez0000000000000000000',$,'Rez-de-chauss\\X2\\00E9\\X0\\e',$,$,#20,$,$,.ELEMENT.,0.);
#22=IFCCARTESIANPOINT((0.,0.,3000.));
#23=IFCAXIS2PLACEMENT3D(#22,$,$);
#24=IFCLOCALPLACEMENT(#16,#23);
#25=IFCBUILDINGSTOREY('0et10000000000000000000',$,'\\X2\\00C9\\X0\\tage 1',$,$,#24,$,$,.ELEMENT.,3000.);
#30=IFCCARTESIANPOINT((0.,0.));
#31=IFCAXIS2PLACEMENT2D(#30,$);
#32=IFCRECTANGLEPROFILEDEF(.AREA.,$,#31,4000.,200.);
#33=IFCDIRECTION((0.,0.,1.));
#34=IFCEXTRUDEDAREASOLID(#32,#11,#33,2500.);
#35=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#34));
#36=IFCPOLYLINE((#30,#30));
#37=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#36));
#38=IFCPRODUCTDEFINITIONSHAPE($,$,(#37,#35));
#39=IFCCARTESIANPOINT((2000.,100.,0.));
#40=IFCAXIS2PLACEMENT3D(#39,$,$);
#41=IFCLOCALPLACEMENT(#24,#40);
#42=IFCWALL('2O2Fr$t4X7Zf8NOew3FLOH',$,'Mur fa\\X2\\00E7\\X0\\ade sud',$,$,#41,#38,$,.STANDARD.);
#50=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(5000.,0.,0.),(5000.,4000.,0.),(2000.,4000.,0.),(2000.,2000.,0.),(0.,2000.,0.)));
#51=IFCINDEXEDPOLYGONALFACE((1,2,3,4,5,6));
#52=IFCPOLYGONALFACESET(#50,$,(#51),$);
#53=IFCSHAPEREPRESENTATION($,'Body','Tessellation',(#52));
#54=IFCPRODUCTDEFINITIONSHAPE($,$,(#53));
#55=IFCLOCALPLACEMENT(#20,#11);
#56=IFCSLAB('1slab000000000000000000',$,'Dalle',$,$,#55,#54,$,.FLOOR.);
#60=IFCCIRCLEPROFILEDEF(.AREA.,$,#31,150.);
#61=IFCEXTRUDEDAREASOLID(#60,#11,#33,2800.);
#62=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#61));
#63=IFCPRODUCTDEFINITIONSHAPE($,$,(#62));
#64=IFCCOLUMN('1col0000000000000000000',$,'Poteau',$,$,#55,#63,$,.COLUMN.);
#70=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(500.,0.,0.),(0.,500.,0.)));
#71=IFCTRIANGULATEDFACESET(#70,$,$,((1,2,3)),$);
#72=IFCSHAPEREPRESENTATION($,'Body','Tessellation',(#71));
#73=IFCREPRESENTATIONMAP(#11,#72);
#74=IFCCARTESIANPOINT((100.,200.,0.));
#75=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#74,$,$);
#76=IFCMAPPEDITEM(#73,#75);
#77=IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#76));
#78=IFCPRODUCTDEFINITIONSHAPE($,$,(#77));
#79=IFCFURNITURE('1meu0000000000000000000',$,'Table',$,$,#55,#78,$,$);
#80=IFCCARTESIANPOINT((0.,0.,0.));
#81=IFCCARTESIANPOINT((1000.,0.,0.));
#82=IFCCARTESIANPOINT((0.,1000.,0.));
#83=IFCCARTESIANPOINT((0.,0.,1000.));
#84=IFCPOLYLOOP((#80,#82,#81));
#85=IFCPOLYLOOP((#80,#81,#83));
#86=IFCPOLYLOOP((#80,#83,#82));
#87=IFCPOLYLOOP((#81,#82,#83));
#88=IFCFACEOUTERBOUND(#84,.T.);
#89=IFCFACEOUTERBOUND(#85,.T.);
#90=IFCFACEOUTERBOUND(#86,.T.);
#91=IFCFACEOUTERBOUND(#87,.T.);
#92=IFCFACE((#88));
#93=IFCFACE((#89));
#94=IFCFACE((#90));
#95=IFCFACE((#91));
#96=IFCCLOSEDSHELL((#92,#93,#94,#95));
#97=IFCFACETEDBREP(#96);
#98=IFCSHAPEREPRESENTATION($,'Body','Brep',(#97));
#99=IFCPRODUCTDEFINITIONSHAPE($,$,(#98));
#100=IFCBUILDINGELEMENTPROXY('1brp0000000000000000000',$,'Borne',$,$,#55,#99,$,$);
#110=IFCADVANCEDBREP(#96);
#111=IFCSHAPEREPRESENTATION($,'Body','AdvancedBrep',(#110));
#112=IFCPRODUCTDEFINITIONSHAPE($,$,(#111));
#113=IFCROOF('1roof000000000000000000',$,'Toiture',$,$,#41,#112,$,$);
#120=IFCOPENINGELEMENT('1ouv0000000000000000000',$,'Baie',$,$,#41,#38,$,$);
#130=IFCRELCONTAINEDINSPATIALSTRUCTURE('1r10000000000000000000',$,$,$,(#56,#64,#79,#100),#21);
#131=IFCRELCONTAINEDINSPATIALSTRUCTURE('1r20000000000000000000',$,$,$,(#42,#113),#25);
#140=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#141=IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('M-01'),$);
#142=IFCPROPERTYSINGLEVALUE('FireRating',$,$,$);
#143=IFCPROPERTYSET('1ps00000000000000000000',$,'Pset_WallCommon',$,(#140,#141,#142));
#144=IFCRELDEFINESBYPROPERTIES('1rp00000000000000000000',$,$,$,(#42),#143);
#145=IFCQUANTITYLENGTH('Length',$,$,4000.,$);
#146=IFCELEMENTQUANTITY('1eq00000000000000000000',$,'Qto_WallBaseQuantities',$,$,(#145));
#147=IFCRELDEFINESBYPROPERTIES('1rq00000000000000000000',$,$,$,(#42),#146);
ENDSEC;
END-ISO-10303-21;
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", acceptDownloads: true });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `echanges-${Date.now()}@example.com`, "planche-echanges-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const racine = page.locator("[data-sandbox-planche]");
const vue = page.locator("[data-planche-vue]");
const panneau = (id) => racine.locator(`[data-planche-panneau='${id}']`);
const message = () => page.locator("[data-planche-message], .planche-message").first().textContent().catch(() => "");
const menu = async (item) => {
  if ((await racine.locator(".planche-menu-liste").count()) === 0) await racine.locator("[data-planche-menu-ouvrir]").click();
  await racine.locator(`[data-planche-menu-item="${item}"]`).click();
  await page.waitForTimeout(80);
};
const ligne = async (attribut, cle) => {
  const l = racine.locator(`[${attribut}] [data-planche-rapport-ligne='${cle}']`);
  return Promise.all(["ecrits", "omis", "approches", "refuses"].map((c) => l.locator(`[data-col='${c}']`).textContent()));
};
const telecharger = async (action, n = 1) => {
  const dls = [];
  const fin = new Promise((resolve) => {
    const surDl = (d) => {
      dls.push(d);
      if (dls.length === n) {
        page.off("download", surDl);
        resolve();
      }
    };
    page.on("download", surDl);
  });
  await action();
  await Promise.race([fin, page.waitForTimeout(15000)]);
  return Promise.all(dls.map(async (d) => ({ nom: d.suggestedFilename(), octets: readFileSync(await d.path()) })));
};
const coller = (texte) =>
  page.evaluate((txt) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", txt);
    document.querySelector("[data-planche-vue]").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, texte);

// --- Import IFC et rapport d'échange (maquette lot6-1) -------------------------------------------------------------------
await menu("importer");
const [choix] = await Promise.all([page.waitForEvent("filechooser"), racine.locator('[data-planche-importer="ifc"]').click()]);
await choix.setFiles({ name: "Immeuble.ifc", mimeType: "application/x-step", buffer: Buffer.from(IFC_ESSAI, "utf8") });
await panneau("echange-import").waitFor();
check("import IFC : le panneau « Import IFC · rapport d'échange » s'ouvre", (await panneau("echange-import").locator("h3").textContent()).includes("Import IFC"));
check("rapport : 4 écrits, 1 omis (ouverture), 1 approché (poteau rond), 1 refusé (surface courbe)", JSON.stringify(await ligne("data-planche-rapport-import", "objets")) === JSON.stringify(["4", "1", "1", "1"]), JSON.stringify(await ligne("data-planche-rapport-import", "objets")));
check("représentations lues : 1 triangulation, 1 face polygonale, 2 extrusions, 1 brep ; 1 non lue",
  (await ligne("data-planche-rapport-import", "triangulation"))[0] === "1" && (await ligne("data-planche-rapport-import", "faces-polygonales"))[0] === "1" && (await ligne("data-planche-rapport-import", "extrusion"))[0] === "2" && (await ligne("data-planche-rapport-import", "brep"))[0] === "1" && (await ligne("data-planche-rapport-import", "non-lues"))[3] === "1");
check("non lues nommées : IfcAdvancedBrep, Toiture", ((await racine.locator("[data-planche-echange-non-lues]").textContent()) ?? "").includes("IfcAdvancedBrep") && ((await racine.locator("[data-planche-echange-non-lues]").textContent()) ?? "").includes("Toiture"));
await racine.locator("[data-planche-echange-arbre] button").first().waitFor();
const etages = await racine.locator("[data-planche-echange-etage]").evaluateAll((l) => l.map((x) => x.getAttribute("data-planche-echange-etage")));
check("rangement par étage, dans l'ordre des altitudes", JSON.stringify(etages) === JSON.stringify(["Rez-de-chaussée", "Étage 1"]), JSON.stringify(etages));
await racine.locator("[data-planche-echange-etage='Étage 1'] button").click();
check("rangement par classe : IfcWall sous l'Étage 1", ((await racine.locator("[data-planche-echange-etage='Étage 1']").textContent()) ?? "").includes("IfcWall"));
const m1 = await modele();
const racineIds = Object.values(m1.racine.occurrences);
const ifcDefs = Object.values(m1.definitions).filter((d) => d.donnees?.ifc);
check("Planche : un groupe « Immeuble », 5 objets porteurs de leurs données IFC", racineIds.length === 1 && m1.definitions[racineIds[0].definition].nom === "Immeuble" && ifcDefs.length === 5, `${racineIds.length} / ${ifcDefs.length}`);
const mur = ifcDefs.find((d) => d.nom === "Mur façade sud");
check("mur : GlobalId, classe, étage, propriétés gardés", mur?.donnees.ifc.globalId === "2O2Fr$t4X7Zf8NOew3FLOH" && mur?.donnees.ifc.classe === "IfcWall" && mur?.donnees.ifc.etage === "Étage 1" && mur?.donnees.ifc.proprietes.Pset_WallCommon.Reference === "M-01");
await racine.locator("[data-planche-echange-archive]").waitFor({ timeout: 15000 });
check("fichier et rapport archivés en base", ((await racine.locator("[data-planche-echange-archive]").textContent()) ?? "").includes("archivés"), await racine.locator("[data-planche-echange-archive]").textContent());
const archives = await page.evaluate(async () => (await (await fetch("/sandbox/preferences/fichiers?extension=planche-echange", { credentials: "include" })).json()).archives.map((a) => a.nom).sort());
check("archives : Immeuble.ifc et Immeuble.ifc.rapport.txt", JSON.stringify(archives) === JSON.stringify(["Immeuble.ifc", "Immeuble.ifc.rapport.txt"]), JSON.stringify(archives));
await page.screenshot({ path: `${OUT}/lot6-1-import-ifc.png` });

// --- Export préparé (maquette lot6-2) -----------------------------------------------------------------------------------
if ((await panneau("navigateur").count()) === 0) await racine.locator("[data-planche-panneau-icone='navigateur']").click();
await page.locator("[data-planche-navigateur-objet]").first().locator("[data-planche-navigateur-masquer]").click();
await page.waitForTimeout(150);
await menu("exporter");
await racine.locator('[data-planche-exporter="obj"]').click();
await panneau("echange-export").waitFor();
check("Fichier > Exporter > OBJ ouvre « Exporter » (format OBJ)", (await racine.locator("[data-planche-echange-format]").inputValue()) === "obj");
check("unité et repère écrits annoncés : mètre, repère de la Planche", (await racine.locator("[data-planche-echange-unite]").textContent()) === "mètre" && (await racine.locator("[data-planche-echange-repere]").textContent()) === "Repère de la Planche");
check("objet masqué déclaré : « Inclure 1 objet masqué « Immeuble » »", ((await racine.locator("[data-planche-echange-masques]").locator("xpath=..").textContent()) ?? "").includes("Immeuble"));
check("rapport prévu sans l'objet masqué : 0 écrit, 1 omis", JSON.stringify((await ligne("data-planche-rapport-export", "objets")).slice(0, 2)) === JSON.stringify(["0", "1"]), JSON.stringify(await ligne("data-planche-rapport-export", "objets")));
await racine.locator("[data-planche-echange-masques]").check();
await page.waitForTimeout(150);
check("objet masqué inclus : 1 écrit, 0 omis", JSON.stringify((await ligne("data-planche-rapport-export", "objets")).slice(0, 2)) === JSON.stringify(["1", "0"]), JSON.stringify(await ligne("data-planche-rapport-export", "objets")));
await page.screenshot({ path: `${OUT}/lot6-2-export.png` });
const exportes = await telecharger(() => racine.locator("[data-planche-echange-exporter]").click(), 2);
const obj = exportes.find((f) => f.nom.endsWith(".obj"));
const rapport = exportes.find((f) => f.nom.endsWith(".rapport.txt"));
check("Exporter télécharge le fichier OBJ et son rapport", !!obj && !!rapport, exportes.map((f) => f.nom).join(", "));
check("rapport joint : unité et repère écrits, comptes", !!rapport && rapport.octets.toString("utf8").includes("Unité écrite : mètre") && rapport.octets.toString("utf8").includes("Repère écrit : Repère de la Planche"));
check("OBJ : l'objet inclus est écrit", !!obj && /\no /.test(obj.octets.toString("utf8")));

// --- Fichier natif et image (maquette lot6-3) ---------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Alt+F1");
await panneau("natif-image").waitFor();
check("Alt+F1 ouvre « Fichier natif et image »", true);
check("cadre de l'image affiché sur la vue", await racine.locator("[data-planche-cadre-image]").isVisible());
const [natif] = await telecharger(() => racine.locator("[data-planche-natif-exporter]").click());
const enveloppe = JSON.parse(natif.octets.toString("utf8"));
check("fichier natif .planche : format fadi-planche/1, empreinte SHA-256 du contenu", natif.nom.endsWith(".planche") && enveloppe.format === "fadi-planche/1" && createHash("sha256").update(enveloppe.modele, "utf8").digest("hex") === enveloppe.empreinte);
check("empreinte affichée dans le panneau", (await racine.locator("[data-planche-natif-empreinte]").getAttribute("data-planche-natif-empreinte")) === enveloppe.empreinte);
await page.screenshot({ path: `${OUT}/lot6-3-planche-image.png` });
const triche = { ...enveloppe, modele: enveloppe.modele.replace("Immeuble", "Immeuble modifié") };
const [c1] = await Promise.all([page.waitForEvent("filechooser"), racine.locator("[data-planche-natif-importer]").click()]);
await c1.setFiles({ name: "modifie.planche", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(triche), "utf8") });
await page.waitForTimeout(400);
check("fichier modifié hors Fadi : refusé", (await racine.locator("[data-planche-natif-reimport]").getAttribute("data-planche-natif-reimport")) === "refuse");
const avantNom = await racine.locator("[data-planche-menu-ouvrir]").getAttribute("data-planche-nom");
const [c2] = await Promise.all([page.waitForEvent("filechooser"), racine.locator("[data-planche-natif-importer]").click()]);
await c2.setFiles({ name: natif.nom, mimeType: "application/json", buffer: natif.octets });
await page.waitForFunction(() => document.querySelector("[data-planche-natif-reimport]")?.getAttribute("data-planche-natif-reimport") === "conforme", null, { timeout: 15000 });
await page.waitForTimeout(800);
const m2 = await modele();
check("réimport conforme : une nouvelle Planche, même contenu (1 objet, 5 objets IFC)", Object.keys(m2.racine.occurrences).length === 1 && Object.values(m2.definitions).filter((d) => d.donnees?.ifc).length === 5, `${avantNom} → ${await racine.locator("[data-planche-menu-ouvrir]").getAttribute("data-planche-nom")}`);
if ((await panneau("natif-image").count()) === 0) {
  await vue.focus();
  await page.keyboard.press("Alt+F1");
  await panneau("natif-image").waitFor();
}
const png = (o) => ({ l: o.readUInt32BE(16), h: o.readUInt32BE(20), type: o[25] });
await racine.locator("[data-planche-image-taille]").fill("1200 × 800");
await racine.locator("[data-planche-image-taille]").press("Enter");
await page.waitForTimeout(150);
const [img1] = await telecharger(() => racine.locator("[data-planche-image-exporter]").click());
const p1 = png(img1.octets);
check("image 1200 × 800 px, fond transparent (PNG RGBA)", p1.l === 1200 && p1.h === 800 && p1.type === 6, JSON.stringify(p1));
await racine.locator("[data-planche-image-transparent]").uncheck();
await racine.locator("[data-planche-image-definition]").selectOption("hd");
const [img2] = await telecharger(() => racine.locator("[data-planche-image-exporter]").click());
const p2 = png(img2.octets);
check("image Full HD opaque (PNG RGB)", p2.l === 1920 && p2.h === 1080 && p2.type === 2, JSON.stringify(p2));

// --- Coller un tracé (maquette lot6-4) ----------------------------------------------------------------------------------
await page.keyboard.press("Escape");
const aretes = async () => Object.keys((await modele()).racine.aretes).length;
const a0 = await aretes();
await coller("bonjour le monde");
await page.waitForTimeout(300);
check("un texte quelconque n'ouvre pas « Coller un tracé »", (await panneau("coller-trace").count()) === 0);
await coller('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 H3200 V1000 h1400 v1800 H0 Z"/></svg>');
await panneau("coller-trace").waitFor();
check("SVG collé reconnu : 1 tracé, 6 sommets", (await racine.locator("[data-planche-coller-type]").textContent()) === "SVG" && (await racine.locator("[data-planche-coller-sommets]").textContent()) === "6");
check("unité absente : demandée, Coller indisponible tant qu'elle manque", (await racine.locator("[data-planche-coller-unite-absente]").isVisible()) && (await racine.locator("[data-planche-coller-valider]").isDisabled()));
await racine.locator("[data-planche-coller-unite]").selectOption("mm");
await page.screenshot({ path: `${OUT}/lot6-4-coller.png` });
await racine.locator("[data-planche-coller-valider]").click();
await page.waitForTimeout(300);
const m3 = await modele();
const xs = Object.values(m3.racine.sommets).map((s) => s.position.x);
check("tracé posé en arêtes, en mètres (4,6 m de large)", (await aretes()) - a0 === 6 && Math.abs(Math.max(...xs) - 4.6) < 1e-9, `${(await aretes()) - a0} arêtes, x max ${Math.max(...xs)}`);
await page.evaluate(() => navigator.clipboard.writeText("0 ; 0\n2,5 ; 0\n2,5 ; 1"));
await vue.focus();
await page.keyboard.press("Control+v");
await panneau("coller-trace").waitFor({ timeout: 5000 }).catch(() => undefined);
check("Ctrl+V d'une liste de sommets copiée : « Coller un tracé » s'ouvre", (await panneau("coller-trace").count()) === 1 && (await racine.locator("[data-planche-coller-type]").textContent()) === "Liste de sommets");
await racine.locator("[data-planche-coller-annuler]").click();

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs) {
  console.log(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette échanges : tout est vert");
