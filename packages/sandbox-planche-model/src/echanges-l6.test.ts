import { describe, expect, it } from "vitest";
import { ajouterRectangle, contexte, grouper, modeleVide, modifierAnnotations, pousserTirer, type Modele } from "./geometrie-libre.js";
import { exporterIfc } from "./echanges-ifc.js";
import { exporterObj } from "./echanges.js";
import { lireIfcComplet, decoderChaineStep } from "./echanges-ifc-lecture.js";
import {
  aretesCollees,
  donneesIfcDe,
  empreinteCourte,
  enveloppeNatif,
  importerIfc,
  lireEchelleColle,
  lireTraceColle,
  objetsNonAffiches,
  ouvrirEnveloppeNatif,
  poserTraces,
  preparerExport,
  rapportExport,
  resumeNatif,
  sommetsColles,
  texteRapport,
} from "./echanges-l6.js";
import { sha256Hex } from "./empreinte.js";
import { REPERE_DU_MODELE } from "./reperes.js";
import { v3 } from "./vecteur.js";

/** Fichier IFC4 d'essai : millimètres, deux étages, un mur extrudé posé sur l'étage 1, une dalle polygonale, un poteau
 * rond (approché), un meuble par IfcMappedItem, un brep à faces planes, une surface courbe non lue, une ouverture. */
export const IFC_ESSAI = `ISO-10303-21;
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

const boite = (): Modele => {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const b = pousserTirer(r, Object.keys(r.racine.faces)[0]!, 1).modele;
  return grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)], { nom: "Boîte", genre: "groupe" }).modele;
};

const bornes = (pts: readonly { x: number; y: number; z: number }[]) => ({
  min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) },
  max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) },
});

describe("cas 2, lot 6 — lecture IFC complète (n° 2, 22, 91)", () => {
  const lu = lireIfcComplet(IFC_ESSAI);
  const objet = (nom: string) => lu.objets.find((o) => o.nom === nom)!;

  it("unité millimètre lue, ouvertures écartées, chaînes décodées", () => {
    expect(lu.echelle).toBe(0.001);
    expect(lu.ouvertures).toBe(1);
    expect(lu.objets.map((o) => o.nom)).toEqual(["Mur façade sud", "Dalle", "Poteau", "Table", "Borne", "Toiture"]);
    expect(decoderChaineStep("d''essai \\X2\\00E9\\X0\\")).toBe("d'essai é");
    expect(lu.etages).toEqual([{ nom: "Rez-de-chaussée", altitude: 0 }, { nom: "Étage 1", altitude: 3 }]);
  });

  it("n° 2 : placements composés — le mur est posé à sa place (bâtiment +1 m en x, étage +3 m, mur +2 m)", () => {
    const b = bornes(objet("Mur façade sud").triangles.flat());
    expect(b.min.x).toBeCloseTo(1 + 2 - 2, 9);
    expect(b.max.x).toBeCloseTo(1 + 2 + 2, 9);
    expect(b.min.y).toBeCloseTo(0.1 - 0.1, 9);
    expect(b.max.y).toBeCloseTo(0.1 + 0.1, 9);
    expect(b.min.z).toBeCloseTo(3, 9);
    expect(b.max.z).toBeCloseTo(5.5, 9);
    // L'axe (« Axis ») n'est pas lu comme corps.
    expect(objet("Mur façade sud").nonLues).toEqual([]);
  });

  it("n° 22 : faces polygonales, extrusions, brep et occurrence typée lus ; surface courbe comptée non lue", () => {
    expect(lu.lues).toEqual({ triangulation: 1, "faces-polygonales": 1, extrusion: 2, brep: 1 });
    // Dalle en L de 16 m² : triangulée sans déborder de son contour.
    const dalle = objet("Dalle").triangles;
    const aire = dalle.reduce((s, [a, b, c]) => s + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2, 0);
    expect(aire).toBeCloseTo(16, 9);
    // Meuble : IfcMappedItem décalé de (0,1 ; 0,2) puis bâtiment +1 m.
    const t = bornes(objet("Table").triangles.flat());
    expect(t.min.x).toBeCloseTo(1.1, 9);
    expect(t.min.y).toBeCloseTo(0.2, 9);
    expect(objet("Borne").triangles).toHaveLength(4);
    expect(objet("Poteau").approche).toBe(true);
    expect(objet("Toiture").triangles).toHaveLength(0);
    expect(objet("Toiture").nonLues).toEqual(["IfcAdvancedBrep"]);
  });

  it("n° 91 : GlobalId, classe, étage, propriétés et quantités tels qu'écrits ; valeur absente non remplacée", () => {
    const m = objet("Mur façade sud");
    expect(m.globalId).toBe("2O2Fr$t4X7Zf8NOew3FLOH");
    expect(m.classe).toBe("IfcWall");
    expect(m.etage).toBe("Étage 1");
    expect(m.proprietes).toEqual({ Pset_WallCommon: { IsExternal: "vrai", Reference: "M-01" }, Qto_WallBaseQuantities: { Length: "4000" } });
    expect(objet("Dalle").etage).toBe("Rez-de-chaussée");
  });

  it("unité refusée, unité convertie (pied) acceptée", () => {
    expect(() => lireIfcComplet(IFC_ESSAI.replace(".MILLI.,.METRE.", "$,.GRAM."))).toThrow(/non prise en charge/);
    const pied = IFC_ESSAI.replace("#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#3=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'FOOT',#5);#4=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);#5=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#6);#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);");
    expect(lireIfcComplet(pied).echelle).toBeCloseTo(0.3048, 12);
  });

  it("aller-retour : l'IFC écrit par Fadi est relu (triangulation)", () => {
    const r = lireIfcComplet(exporterIfc(boite(), "Essai", new Date("2026-11-27T12:00:00Z")).contenu);
    expect(r.lues.triangulation).toBe(1);
    expect(r.objets[0]!.triangles).toHaveLength(12);
  });
});

describe("cas 2, lot 6 — import dans la Planche et rapport d'échange (n° 6)", () => {
  const r = importerIfc(modeleVide(), lireIfcComplet(IFC_ESSAI), "Immeuble.ifc", "27.11.2026 19:40");

  it("rangé fichier → étage → classe ; chaque objet garde ses données IFC", () => {
    const racine = Object.values(r.modele.racine.occurrences);
    expect(racine).toHaveLength(1);
    expect(r.modele.definitions[racine[0]!.definition]!.nom).toBe("Immeuble");
    expect(r.arbre).toEqual([
      { nom: "Rez-de-chaussée", altitude: 0, objets: 4, classes: [{ classe: "IfcBuildingElementProxy", objets: 1 }, { classe: "IfcColumn", objets: 1 }, { classe: "IfcFurniture", objets: 1 }, { classe: "IfcSlab", objets: 1 }] },
      { nom: "Étage 1", altitude: 3, objets: 1, classes: [{ classe: "IfcWall", objets: 1 }] },
    ]);
    const fichier = contexte(r.modele, racine[0]!.id);
    const etage1 = Object.values(fichier.occurrences).find((o) => r.modele.definitions[o.definition]!.nom === "Étage 1")!;
    const murs = Object.values(contexte(r.modele, etage1.id).occurrences)[0]!;
    const mur = Object.values(contexte(r.modele, murs.id).occurrences)[0]!;
    expect(r.modele.definitions[mur.definition]!.nom).toBe("Mur façade sud");
    expect(donneesIfcDe(r.modele, mur)).toEqual({ globalId: "2O2Fr$t4X7Zf8NOew3FLOH", classe: "IfcWall", etage: "Étage 1", proprietes: { Pset_WallCommon: { IsExternal: "vrai", Reference: "M-01" }, Qto_WallBaseQuantities: { Length: "4000" } } });
    expect(Object.values(r.modele.annotations!.correspondances ?? {})[0]).toMatchObject({ format: "ifc", fichier: "Immeuble.ifc", metresParUnite: 0.001 });
  });

  it("rapport chiffré : écrits, omis (ouverture), approchés (poteau rond), refusés (surface courbe)", () => {
    expect(r.rapport.lignes).toEqual([
      { cle: "objets", ecrits: 4, omis: 1, approches: 1, refuses: 1 },
      { cle: "triangulation", ecrits: 1, omis: null, approches: null, refuses: null },
      { cle: "faces-polygonales", ecrits: 1, omis: null, approches: null, refuses: null },
      { cle: "extrusion", ecrits: 2, omis: null, approches: null, refuses: null },
      { cle: "brep", ecrits: 1, omis: null, approches: null, refuses: null },
      { cle: "non-lues", ecrits: null, omis: null, approches: null, refuses: 1 },
    ]);
    expect(r.rapport.nonLues).toEqual([{ classe: "IfcAdvancedBrep", objet: "Toiture" }]);
    const t = texteRapport(r.rapport);
    expect(t).toContain("Rapport d'échange — Import IFC");
    expect(t).toContain("- IfcAdvancedBrep : Toiture");
    expect(t).toContain("Aucune valeur absente n'est remplacée.");
  });
});

describe("cas 2, lot 6 — export préparé (n° 90, 95)", () => {
  const prepare = (): Modele => {
    let m = boite();
    const r = ajouterRectangle(m, v3(5, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    m = grouper(r, [...Object.keys(r.racine.faces), ...Object.keys(r.racine.aretes)], { nom: "Table" }).modele;
    const ids = Object.keys(m.racine.occurrences);
    const occ = (k: number) => m.racine.occurrences[ids[k]!]!;
    m = modifierAnnotations(m, (a) => {
      a.balises["b1"] = { id: "b1", nom: "Mobilier", couleur: "#888888", visible: false };
    }).modele;
    return { ...m, racine: { ...m.racine, occurrences: { ...m.racine.occurrences, [ids[0]!]: { ...occ(0), nom: "Abri", masquee: true }, [ids[1]!]: { ...occ(1), balise: "b1" } } } };
  };

  it("objets masqués et balises éteintes déclarés", () => {
    const m = prepare();
    const n = objetsNonAffiches(m);
    expect(n.masques.map((x) => x.nom)).toEqual(["Abri"]);
    expect(n.eteintes).toEqual([{ balise: "b1", nom: "Mobilier", objets: 1 }]);
  });

  it("inclus au choix ; les omis sont comptés dans le rapport, avec l'unité et le repère écrits", () => {
    const m = prepare();
    const rien = preparerExport(m, { masques: false, balises: [] });
    expect(rien.omis).toBe(2);
    expect(exporterObj(rien.modele).objets).toBe(0);
    const tout = preparerExport(m, { masques: true, balises: ["b1"] });
    expect(tout.omis).toBe(0);
    const e = exporterObj(tout.modele);
    expect(e.objets).toBe(2);
    const rapport = rapportExport("obj", "Planche.obj", e, tout.omis, "27.11.2026", { unite: "mètre", repere: "Repère de la Planche" });
    expect(rapport.lignes[0]).toEqual({ cle: "objets", ecrits: 2, omis: 0, approches: 0, refuses: 0 });
    expect(texteRapport(rapport)).toContain("Unité écrite : mètre");
    // Le document n'est pas touché.
    expect(m.racine.occurrences[Object.keys(m.racine.occurrences)[0]!]!.masquee).toBe(true);
  });
});

describe("cas 2, lot 6 — fichier natif contrôlé par son empreinte (n° 36)", () => {
  it("SHA-256 conforme (FIPS 180-4)", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("aller-retour : empreinte recalculée = empreinte écrite ; fichier modifié refusé", () => {
    const texte = JSON.stringify(boite());
    const e = enveloppeNatif(texte, "Immeuble A", new Date("2026-11-27T18:40:00Z"));
    const r = ouvrirEnveloppeNatif(e.contenu);
    expect(r).toMatchObject({ ok: true, nom: "Immeuble A", empreinte: e.empreinte, texteModele: texte });
    const triche = JSON.parse(e.contenu) as { modele: string };
    triche.modele = triche.modele.replace("Boîte", "Boite");
    expect(ouvrirEnveloppeNatif(JSON.stringify(triche))).toEqual({ ok: false, motif: "empreinte" });
    expect(ouvrirEnveloppeNatif("{}")).toEqual({ ok: false, motif: "format" });
    expect(ouvrirEnveloppeNatif("pas du json")).toEqual({ ok: false, motif: "illisible" });
    expect(empreinteCourte(e.empreinte)).toMatch(/^[0-9a-f]{4}…[0-9a-f]{4}$/);
    expect(resumeNatif(boite())).toEqual({ objets: 1, balises: 0, scenes: 0 });
  });
});

describe("cas 2, lot 6 — coller un tracé (n° 112)", () => {
  it("SVG : chemin fermé, y retourné ; unité lue seulement si déclarée", () => {
    const l = lireTraceColle('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 H320 V100 h140 v180 H0 Z"/><text>note</text></svg>')!;
    expect(l.type).toBe("svg");
    expect(l.unite).toBeNull();
    expect(l.traces).toHaveLength(1);
    expect(l.traces[0]!.ferme).toBe(true);
    expect(sommetsColles(l)).toBe(6);
    expect(aretesCollees(l)).toBe(6);
    expect(l.refuses).toBe(1);
    expect(l.traces[0]!.points[2]).toEqual(v3(320, -100, 0));
    expect(lireTraceColle('<svg width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="0" y="0" width="10" height="5"/></svg>')!.unite).toBe("mm");
    expect(lireTraceColle('<svg width="100mm" viewBox="0 0 200 50"><rect width="10" height="5"/></svg>')!.unite).toBeNull();
  });
  it("SVG : courbes approchées, transformations de groupe appliquées", () => {
    const l = lireTraceColle('<svg><g transform="translate(10,0)"><circle cx="0" cy="0" r="5"/><path d="M0 0 C 0 10 10 10 10 0"/></g><line x1="0" y1="0" x2="1" y2="0"/></svg>')!;
    expect(l.courbesApprochees).toBe(2);
    expect(l.traces).toHaveLength(3);
    expect(l.traces[0]!.points[0]!.x).toBeCloseTo(15, 9);
    expect(l.traces[2]!.points[0]).toEqual(v3(0, -0, 0));
  });
  it("DXF : lignes et polylignes, unité $INSUNITS, textes refusés", () => {
    const dxf = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "1000", "21", "0", "31", "0", "0", "LWPOLYLINE", "90", "3", "70", "1", "10", "0", "20", "0", "10", "100", "20", "0", "10", "100", "20", "100", "0", "TEXT", "1", "note", "0", "ENDSEC", "0", "EOF"].join("\n");
    const l = lireTraceColle(dxf)!;
    expect(l.type).toBe("dxf");
    expect(l.unite).toBe("mm");
    expect(l.traces.map((t) => [t.points.length, t.ferme])).toEqual([[2, false], [3, true]]);
    expect(l.refuses).toBe(1);
  });
  it("liste de sommets : « x ; y » à virgule décimale, « x, y, z » ; un texte quelconque n'est pas un tracé", () => {
    expect(lireTraceColle("0 ; 0\n1,5 ; 0\n1,5 ; 2")!.traces[0]!.points).toEqual([v3(0, 0, 0), v3(1.5, 0, 0), v3(1.5, 2, 0)]);
    expect(lireTraceColle("0, 0, 0\n1, 0, 0.5")!.traces[0]!.points[1]).toEqual(v3(1, 0, 0.5));
    expect(lireTraceColle("bonjour\nle monde")).toBeNull();
    expect(lireTraceColle("12")).toBeNull();
  });
  it("posé sur le plan de travail : unité × échelle, arêtes créées", () => {
    const l = lireTraceColle("0 ; 0\n1000 ; 0\n1000 ; 500\n0 ; 500\n0 ; 0")!;
    expect(l.traces[0]!.ferme).toBe(true);
    const r = poserTraces(modeleVide(), l, { metresParUnite: 0.001, echelle: 1, repere: REPERE_DU_MODELE });
    expect(Object.keys(r.modele.racine.aretes)).toHaveLength(4);
    expect(Object.keys(r.modele.racine.faces)).toHaveLength(1);
    const xs = Object.values(r.modele.racine.sommets).map((s) => s.position.x);
    expect(Math.max(...xs)).toBeCloseTo(1, 12);
    expect(lireEchelleColle("1:100")).toBe(100);
    expect(lireEchelleColle("1:1")).toBe(1);
    expect(lireEchelleColle("x")).toBeNull();
  });
});
