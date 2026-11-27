/**
 * IFC structuré (cas 4, lot C4, étape 6 : D10-S-001, D10-F14-012, N-D10-1, D10-R-002, D10-R-006, N-D10-2, D10-F14-124).
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGLAGES_DEFAUT } from "./annotations.js";
import { lireModelePlanche } from "./delta.js";
import { type Id, type Modele, ajouterRectangle, grouper, modeleVide, modifierAnnotations, pousserTirer, rattacherOccurrencesNiveau } from "./geometrie-libre.js";
import { lireStep, decoderChaineStep } from "./ifc-step.js";
import { SCHEMAS_IFC, classesAExporter, controlerAvantEmissionIfc, exporterIfcStructure, ifczip, importerIfcStructure, lireIfcStructure, pointDeBaseDepuisIfc, relireIfcStructure } from "./ifc-structure.js";
import { creerLocal } from "./locaux.js";
import { ajouterNiveau } from "./niveaux.js";
import { poserMurs } from "./murs.js";
import { v3 } from "./vecteur.js";
import { crc32, ecrireZip, lireZip } from "./zip.js";

const DATE = new Date("2026-11-27T21:00:00Z");

function boite(m: Modele, x0: number, z0: number): { m: Modele; occ: Id } {
  const sol = ajouterRectangle(m, v3(x0, 0, z0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const f = Object.keys(sol.racine.faces).find((id) => !m.racine.faces[id]) as Id;
  const avant = new Set([...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
  const p = pousserTirer(sol, f, sol.racine.faces[f]!.normale.z > 0 ? 2 : -2).modele;
  const ids = [...Object.keys(p.racine.faces), ...Object.keys(p.racine.aretes)].filter((id) => !avant.has(id)) as Id[];
  const g = grouper(p, ids);
  return { m: g.modele, occ: g.occurrence };
}

/** Deux niveaux, deux boîtes (une par niveau), un mur au rez, un local, un point de base tourné de 30°. */
function modele(): Modele {
  let m = modeleVide();
  const a = boite(m, 0, 0);
  const b = boite(a.m, 6, 3);
  m = b.m;
  const rez = ajouterNiveau(m, { nom: "Rez", altitude: 0, hauteur: 3 });
  if (!rez.ok) throw new Error();
  const et = ajouterNiveau(rez.modele, { nom: "Étage 1", altitude: 3, hauteur: 3 });
  if (!et.ok) throw new Error();
  m = rattacherOccurrencesNiveau(et.modele, [a.occ], rez.id).modele;
  m = rattacherOccurrencesNiveau(m, [b.occ], et.id).modele;
  const mur = poserMurs(m, [[v3(0, 6, 0), v3(5, 6, 0)]], { epaisseur: 0.2, hauteur: 2.5, reference: "axe" });
  if (!mur.ok) throw new Error("mur");
  m = mur.modele;
  const occMur = Object.values(m.annotations!.murs!)[0]!.occurrence;
  m = rattacherOccurrencesNiveau(m, [occMur], rez.id).modele;
  const sol = ajouterRectangle(m, v3(-10, 0, 0), v3(3, 0, 0), v3(0, 3, 0)).modele;
  const face = Object.keys(sol.racine.faces).find((id) => !m.racine.faces[id]) as Id;
  const l = creerLocal(sol, face, { numero: "001", nom: "Séjour", usage: "Habitation" });
  if (!l.ok) throw new Error("local");
  m = modifierAnnotations(l.modele, (an) => {
    an.reglages = { ...REGLAGES_DEFAUT, pointDeBase: { e: 2600120, n: 1199870, systeme: "EPSG:2056", systemeVertical: "LN02", rotation: 30 } };
  }).modele;
  return m;
}

describe("Lecture STEP", () => {
  it("chaînes, références, énumérations, valeurs typées, listes imbriquées", () => {
    const f = lireStep("ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;\nDATA;\n#1=IFCX('l''a\\X2\\00E9\\X0\\',#2,.T.,$,*,IFCLABEL('x'),((1.,2.),(3.E1,-4)));\n/* note */#2=IFCY();\nENDSEC;");
    expect(f.schema).toBe("IFC4");
    expect(f.entites.get(1)!.args).toEqual([{ texte: "l'aé" }, { ref: 2 }, { enum: "T" }, null, "*", { type: "IFCLABEL", valeur: { texte: "x" } }, [[1, 2], [30, -4]]]);
    expect(f.entites.get(2)!.args).toEqual([]);
    expect(decoderChaineStep("\\X\\E9t\\X2\\00C9\\X0\\")).toBe("étÉ");
    expect(() => lireStep("pas un ifc")).toThrow();
  });
});

describe("Archive ZIP", () => {
  it("écrit une archive stockée relue à l'identique, CRC contrôlé", () => {
    const d = new TextEncoder().encode("ISO-10303-21;");
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const z = ecrireZip([{ nom: "a.ifc", donnees: d }], DATE);
    expect(lireZip(z)).toEqual([{ nom: "a.ifc", donnees: d }]);
    const abime = z.slice();
    abime[36] = abime[36]! ^ 0xff;
    expect(lireZip(abime)).toBeNull();
  });
});

describe("Export IFC structuré", () => {
  it.each(SCHEMAS_IFC)("%s : étages, classes, géoréférencement ; relu à l'identique, en .ifc et en .ifczip", (schema) => {
    const m = modele();
    const x = exporterIfcStructure(m, { schema, georef: true, nom: "Essai", maintenant: DATE, reference: 432.15 });
    writeFileSync(`/tmp/fadi-ifc-${schema}.ifc`, x.contenu);
    expect(x.contenu).toContain(`FILE_SCHEMA(('${schema}'))`);
    expect(x.etages).toBe(2);
    expect(x.locaux).toBe(1);
    expect(x.classes).toEqual({ IfcWall: 1, IfcBuildingElementProxy: 3 });
    expect(x.georef).toMatchObject({ systeme: "EPSG:2056", e: 2600120, n: 1199870, h: 432.15 });
    expect(x.contenu.includes("IFCMAPCONVERSION")).toBe(schema !== "IFC2X3");
    expect(x.contenu.includes("ePset_MapConversion")).toBe(schema === "IFC2X3");
    expect(x.contenu.includes("IFCOWNERHISTORY")).toBe(schema === "IFC2X3");
    const r = relireIfcStructure(x, schema, x.contenu);
    expect(r.ecarts).toEqual([]);
    expect(r.identique).toBe(true);
    expect(relireIfcStructure(x, schema, ifczip(x, DATE)).identique).toBe(true);
    // Reproductible : même modèle, même date, mêmes octets.
    expect(exporterIfcStructure(m, { schema, georef: true, nom: "Essai", maintenant: DATE, reference: 432.15 }).contenu).toBe(x.contenu);
    // Le géoréférencement relu redonne le point de base (rotation comprise).
    const p = pointDeBaseDepuisIfc(lireIfcStructure(x.contenu).georef!)!;
    expect(p.rotation).toBeCloseTo(30, 9);
    expect([p.e, p.n, p.systeme]).toEqual([2600120, 1199870, "EPSG:2056"]);
  });

  it("sans niveau de référence : pas de géoréférencement, constat ; relecture qui détecte un écart", () => {
    const m = modele();
    const x = exporterIfcStructure(m, { schema: "IFC4", georef: true, nom: "Essai", maintenant: DATE, reference: null });
    expect(x.georef).toBeNull();
    expect(x.contenu).not.toContain("IFCMAPCONVERSION");
    expect(controlerAvantEmissionIfc(m, { schema: "IFC4", georef: true, reference: null }).map((c) => c.cle)).toContain("reference-absente");
    const tronque = x.contenu.replace(/#\d+=IFCBUILDINGSTOREY\([^;]*;\n/, "");
    expect(relireIfcStructure(x, "IFC4", tronque).ecarts.map((e) => e.cle)).toContain("etages");
  });

  it("contrôle avant émission : constats sans correction ; modèle vide bloqué", () => {
    const m = modele();
    const c = controlerAvantEmissionIfc(m, { schema: "IFC4", georef: true, reference: 432.15 });
    expect(c.find((x) => x.cle === "georef-declare")?.niveau).toBe("ok");
    expect(c.find((x) => x.cle === "objets-sans-niveau")).toMatchObject({ niveau: "attention", nombre: 1 });
    expect(controlerAvantEmissionIfc(m, { schema: "IFC2X3", georef: true, reference: 432.15 }).map((x) => x.cle)).toContain("georef-2x3");
    expect(controlerAvantEmissionIfc(modeleVide(), { schema: "IFC4", georef: false, reference: null })).toEqual([{ cle: "vide", niveau: "bloquant" }]);
    expect(classesAExporter(m)).toEqual({ classes: { IfcWall: 1, IfcBuildingElementProxy: 3 }, importes: 0, etages: 2, locaux: 1 });
  });
});

describe("Import IFC structuré", () => {
  it("étages en niveaux, objets rattachés, identité IFC gardée et réexportée à l'identique", () => {
    const x = exporterIfcStructure(modele(), { schema: "IFC4", georef: true, nom: "Essai", maintenant: DATE, reference: 432.15 });
    const l = lireIfcStructure(x.contenu);
    expect(l.etages.map((e) => [e.nom, e.altitude])).toEqual([["Rez", 0], ["Étage 1", 3]]);
    const r = importerIfcStructure(modeleVide(), l, { niveaux: true, trame: true, georef: true }, "essai.ifc");
    expect([r.objets, r.niveaux, r.pointDeBase]).toEqual([4, 2, true]);
    const m = r.modele;
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))).not.toBeNull();
    const occs = Object.values(m.racine.occurrences);
    expect(occs.filter((o) => o.ifc).map((o) => o.ifc!.classe).sort()).toEqual(["IfcBuildingElementProxy", "IfcBuildingElementProxy", "IfcBuildingElementProxy", "IfcWall"]);
    expect(occs.filter((o) => o.niveau).length).toBe(3);
    expect(m.annotations!.reglages!.pointDeBase!.rotation).toBeCloseTo(30, 9);
    // Réexport : mêmes classes et mêmes GlobalId que le fichier reçu.
    const y = exporterIfcStructure(m, { schema: "IFC4X3_ADD2", georef: false, nom: "Retour", maintenant: DATE, reference: null });
    expect(new Set(y.globalIds.slice(0, y.objets))).toEqual(new Set(l.objets.map((o) => o.globalId)));
    expect(y.classes).toEqual({ IfcWall: 1, IfcBuildingElementProxy: 3 });
    // Le point de base existant n'est jamais remplacé.
    expect(importerIfcStructure(m, l, { niveaux: false, trame: false, georef: true }, "essai.ifc").pointDeBase).toBe(false);
  });

  it("trame d'axes, extrusions, unité en millimètres et objets non lus comptés", () => {
    const ifc = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCCARTESIANPOINT((0.,0.,0.));
#3=IFCAXIS2PLACEMENT3D(#2,$,$);
#4=IFCLOCALPLACEMENT($,#3);
#5=IFCBUILDINGSTOREY('0aaaaaaaaaaaaaaaaaaaaa',$,'Niveau 0',$,$,#4,$,$,.ELEMENT.,0.);
#10=IFCCARTESIANPOINT((0.,0.));
#11=IFCAXIS2PLACEMENT2D(#10,$);
#12=IFCRECTANGLEPROFILEDEF(.AREA.,$,#11,2000.,1000.);
#13=IFCDIRECTION((0.,0.,1.));
#14=IFCEXTRUDEDAREASOLID(#12,#3,#13,3000.);
#15=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#14));
#16=IFCPRODUCTDEFINITIONSHAPE($,$,(#15));
#17=IFCWALLSTANDARDCASE('1bbbbbbbbbbbbbbbbbbbbb',$,'Mur A',$,$,#4,#16,$,$);
#18=IFCRELCONTAINEDINSPATIALSTRUCTURE('2ccccccccccccccccccccc',$,$,$,(#17,#22),#5);
#19=IFCSPHERE(#3,500.);
#20=IFCSHAPEREPRESENTATION($,'Body','CSG',(#19));
#21=IFCPRODUCTDEFINITIONSHAPE($,$,(#20));
#22=IFCCOLUMN('3ddddddddddddddddddddd',$,'Poteau',$,$,#4,#21,$,$);
#30=IFCCARTESIANPOINT((0.,-1000.));
#31=IFCCARTESIANPOINT((0.,9000.));
#32=IFCPOLYLINE((#30,#31));
#33=IFCGRIDAXIS('A',#32,.T.);
#34=IFCCARTESIANPOINT((-1000.,0.));
#35=IFCCARTESIANPOINT((9000.,0.));
#36=IFCPOLYLINE((#34,#35));
#37=IFCGRIDAXIS('1',#36,.T.);
#38=IFCGRID('4eeeeeeeeeeeeeeeeeeeee',$,'Trame',$,$,#4,$,(#33),(#37),$,$);
ENDSEC;
END-ISO-10303-21;`;
    const l = lireIfcStructure(ifc);
    expect(l.echelle).toBe(0.001);
    expect(l.objets.map((o) => [o.classe, o.nom, o.etage, o.triangles.length / 3])).toEqual([["IfcWall", "Mur A", "0aaaaaaaaaaaaaaaaaaaaa", 12]]);
    const xs = l.objets[0]!.positions.filter((_v, i) => i % 3 === 0);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-1, 1]);
    expect(Math.max(...l.objets[0]!.positions.filter((_v, i) => i % 3 === 2))).toBe(3);
    expect(l.nonLus).toEqual({ IfcColumn: 1 });
    expect(l.axes).toEqual([{ etiquette: "A", a: [0, -1, 0], b: [0, 9, 0] }, { etiquette: "1", a: [-1, 0, 0], b: [9, 0, 0] }]);
    const r = importerIfcStructure(modeleVide(), l, { niveaux: true, trame: true, georef: true }, "trame.ifc");
    expect([r.objets, r.niveaux, r.axes, r.pointDeBase]).toEqual([1, 1, 2, false]);
    expect(Object.values(r.modele.annotations!.guides).length).toBe(2);
    expect(Object.values(r.modele.annotations!.textes).map((t) => ("texte" in t ? t.texte : ""))).toEqual(["A", "1"]);
  });
});
