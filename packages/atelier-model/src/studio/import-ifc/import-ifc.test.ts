import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, type StudioDocument } from "../document-2d.js";
import { exportStudioIfc } from "../ifc.js";
import { quantitesStudio } from "../quantites.js";
import { lireDxfStudio } from "../import-dxf.js";
import { dxf, ligne } from "../import-dxf.fixtures.js";
import { lireIfcStudio, validerTransformation } from "./import-ifc.js";
import { lireStep } from "./step.js";

const RECETTE = readFileSync(new URL("./fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");

/** Petit IFC écrit en clair : en-tête, puis les instances données (aucune instance implicite). */
function ifc(schema: string, lignes: string[]): string {
  return ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('t.ifc','',(''),(''),'','','');", `FILE_SCHEMA(('${schema}'));`, "ENDSEC;", "DATA;", ...lignes, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
}
const G = (s: string) => (s + "0".repeat(22)).slice(0, 22);
/** Projet IFC4 en pieds (unité convertie déclarée dans le fichier), un niveau, un mur d'un profil `IfcIndexedPolyCurve`. */
const ENPIEDS = ifc("IFC4", [
  `#1=IFCPROJECT('${G("P")}',$,'P',$,$,$,$,(#20),#10);`,
  "#10=IFCUNITASSIGNMENT((#13));",
  "#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
  "#12=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#11);",
  "#13=IFCCONVERSIONBASEDUNIT(#14,.LENGTHUNIT.,'FOOT',#12);",
  "#14=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);",
  "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);",
  "#21=IFCAXIS2PLACEMENT3D(#22,$,$);",
  "#22=IFCCARTESIANPOINT((0.,0.,0.));",
  `#50=IFCBUILDINGSTOREY('${G("N")}',$,'Niveau 0',$,$,#51,$,$,.ELEMENT.,0.);`,
  "#51=IFCLOCALPLACEMENT($,#21);",
  `#100=IFCWALL('${G("W")}',$,'Mur',$,$,#101,#110,$,.NOTDEFINED.);`,
  "#101=IFCLOCALPLACEMENT(#51,#21);",
  "#110=IFCPRODUCTDEFINITIONSHAPE($,$,(#120));",
  "#120=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#121));",
  "#121=IFCEXTRUDEDAREASOLID(#122,$,#127,10.);",
  "#122=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#123);",
  "#123=IFCINDEXEDPOLYCURVE(#124,(IFCLINEINDEX((1,2,3,4,1))),$);",
  "#124=IFCCARTESIANPOINTLIST2D(((0.,0.),(10.,0.),(10.,1.),(0.,1.)));",
  "#127=IFCDIRECTION((0.,0.,1.));",
  `#900=IFCRELCONTAINEDINSPATIALSTRUCTURE('${G("R")}',$,$,$,(#100),#50);`,
]);

describe("lireIfcStudio — IFC2X3 en millimètres (fixture écrite à la main)", () => {
  const r = lireIfcStudio(RECETTE);
  const doc = applyStudioCommands(newStudioDocument("d"), r.commandes);

  it("unité lue dans le fichier (IfcSIUnit MILLI METRE), schéma déclaré, effectifs du rapport", () => {
    expect(r.statut).toBe("pret");
    expect(r.rapport.schema).toBe("IFC2X3");
    expect(r.rapport.unite).toEqual({ origine: "fichier", nom: "MILLI METRE", facteur: 0.001 });
    expect(r.rapport.entites).toEqual({ murs: 2, ouvertures: 2, portes: 1, fenetres: 1, prismes: 1, total: 5 });
    expect(r.rapport.niveaux).toBe(2);
    expect(r.rapport.bornes).toEqual({ min: { x: 0, y: 0 }, max: { x: 5, y: 4 } });
    expect(r.rapport.transformation).toBeNull();
  });

  it("murs : axe, épaisseur, hauteur et cote lus ; l'axe `Axis` du fichier donne la justification", () => {
    expect(doc.architecture?.filter((a) => a.type === "wall")).toEqual([
      { id: "ifc-0MurW10000000000000000", type: "wall", layerId: "ifc-calque-1", axis: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thickness: 0.2, height: 2.8, base: 0, justification: "center" },
      { id: "ifc-0MurW20000000000000000", type: "wall", layerId: "ifc-calque-1", axis: [{ x: 5, y: 0 }, { x: 5, y: 4 }], thickness: 0.2, height: 2.8, base: 0, justification: "left" },
    ]);
  });

  it("ouvertures hébergées (IfcRelVoidsElement) ; porte et fenêtre déclarées par leur remplissage (IfcRelFillsElement)", () => {
    expect(doc.architecture?.filter((a) => a.type === "opening")).toEqual([
      { id: "ifc-0BaieO1000000000000000", type: "opening", hostId: "ifc-0MurW10000000000000000", position: 1, width: 0.9, height: 2.1, sill: 0, kind: "porte" },
      { id: "ifc-0BaieO2000000000000000", type: "opening", hostId: "ifc-0MurW10000000000000000", position: 3, width: 1.2, height: 1.2, sill: 0.9, kind: "fenetre" },
    ]);
  });

  it("dalle → prisme libre posé à sa cote, sur le calque de son niveau ; perte de sémantique comptée", () => {
    expect(doc.solides).toEqual([{ id: "ifc-0DalleS100000000000000", type: "prism", layerId: "ifc-calque-2", placement: { origin: { x: 0, y: 0, z: 2.8 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }], height: 0.2 }]);
    expect(r.rapport.pertes).toContainEqual({ type: "IfcSlab", motif: "prisme-libre", nombre: 1 });
  });

  it("niveaux → calques (nom du niveau, donnée) ; chaque élément suit le niveau qui le contient", () => {
    expect(doc.layers).toEqual([{ id: "ifc-calque-1", name: "RDC", visible: true, locked: false }, { id: "ifc-calque-2", name: "R+1", visible: true, locked: false }]);
    expect(r.rapport.calques).toEqual([{ nom: "RDC", cible: "cree", id: "ifc-calque-1", objets: 7 }, { nom: "R+1", cible: "cree", id: "ifc-calque-2", objets: 1 }]);
  });

  it("état non natif : espace, poteau répété et porte isolée conservés (type, GlobalId, nom, raison, empreinte lue)", () => {
    expect(r.rapport.nonNatifs).toEqual([{ type: "IfcColumn", nombre: 1 }, { type: "IfcDoor", nombre: 1 }, { type: "IfcSpace", nombre: 1 }]);
    expect(r.rapport.nonNatifsTotal).toBe(3);
    expect(doc.nonNatifs).toEqual([
      { id: "ifc-0EspaceSP1000000000000", type: "non-native", layerId: "ifc-calque-1", origine: { format: "ifc", entite: "IfcSpace", identifiant: "0EspaceSP1000000000000", nom: "1.01" }, raison: "type-sans-equivalent", empreinte: [{ x: 0, y: 0 }, { x: 4.8, y: 0 }, { x: 4.8, y: 3.9 }, { x: 0, y: 3.9 }] },
      { id: "ifc-0PoteauC10000000000000", type: "non-native", layerId: "ifc-calque-1", origine: { format: "ifc", entite: "IfcColumn", identifiant: "0PoteauC10000000000000", nom: "Poteau" }, raison: "type-sans-equivalent", detail: "IfcMappedItem" },
      { id: "ifc-0PorteD200000000000000", type: "non-native", layerId: "ifc-calque-1", origine: { format: "ifc", entite: "IfcDoor", identifiant: "0PorteD200000000000000", nom: "Porte isolée" }, raison: "hote-introuvable", detail: "IfcRelFillsElement" },
    ]);
  });

  it("rapport de pertes : jeux de propriétés, matériaux, site et bâtiment comptés par type, jamais écartés en silence", () => {
    expect(r.rapport.pertes).toEqual([
      { type: "IfcBuilding", nombre: 1 }, { type: "IfcPropertySet", nombre: 1 }, { type: "IfcRelAssociatesMaterial", nombre: 1 },
      { type: "IfcSite", nombre: 1 }, { type: "IfcSlab", motif: "prisme-libre", nombre: 1 },
    ]);
  });

  it("déterministe ; un second import dans le même document suffixe les identifiants (aucune collision)", () => {
    expect(lireIfcStudio(RECETTE)).toEqual(r);
    const deux = lireIfcStudio(RECETTE, { document: doc });
    expect(deux.rapport.calques.map((c) => c.cible)).toEqual(["existant", "existant"]);
    const apres = applyStudioCommands(doc, deux.commandes);
    expect(apres.architecture).toHaveLength(8);
    expect(apres.nonNatifs?.map((n) => n.id)).toContain("ifc-0EspaceSP1000000000000-2");
  });
});

describe("lireIfcStudio — unités lues, jamais supposées", () => {
  it("unité de longueur absente : aucune commande, unité « non évaluée » (statut unite-inconnue)", () => {
    const sans = RECETTE.replace("#10=IFCUNITASSIGNMENT((#11,#12));", "#10=IFCUNITASSIGNMENT((#12));");
    const r = lireIfcStudio(sans);
    expect(r).toMatchObject({ statut: "unite-inconnue", commandes: [], rapport: { unite: { origine: "inconnue", nom: null, facteur: null } } });
    expect(lireIfcStudio(RECETTE.replace(",(#20),#10);", ",(#20),$);")).statut).toBe("unite-inconnue");
  });

  it("IfcConversionBasedUnit : facteur déclaré dans le fichier (pied = 0,3048 m) ; profil IfcIndexedPolyCurve", () => {
    const r = lireIfcStudio(ENPIEDS);
    expect(r.rapport.unite).toEqual({ origine: "fichier", nom: "FOOT", facteur: 0.3048 });
    const doc = applyStudioCommands(newStudioDocument("d"), r.commandes);
    expect(doc.architecture).toEqual([{ id: `ifc-${G("W")}`, type: "wall", layerId: "ifc-calque-1", axis: [{ x: 0, y: 0.1524 }, { x: 3.048, y: 0.1524 }], thickness: 0.3048, height: 3.048, base: 0, justification: "center" }]);
  });
});

describe("lireIfcStudio — transformation déclarée (modèle partenaire)", () => {
  it("translation puis rotation autour de z, appliquées seulement si elles sont déclarées", () => {
    const r = lireIfcStudio(RECETTE, { transformation: { dx: 10, dy: 20, dz: 3, rotation: Math.PI / 2 } });
    expect(r.rapport.transformation).toEqual({ dx: 10, dy: 20, dz: 3, rotation: Math.PI / 2 });
    const doc = applyStudioCommands(newStudioDocument("d"), r.commandes);
    const w1 = doc.architecture?.find((a) => a.id === "ifc-0MurW10000000000000000");
    expect(w1).toMatchObject({ axis: [{ x: 10, y: 20 }, { x: 10, y: 25 }], base: 3 });
    expect(() => validerTransformation({ dx: 1, dy: 2, dz: 3 })).toThrow(StudioValidationError);
    expect(() => validerTransformation({ dx: Number.NaN, dy: 2, dz: 3, rotation: 0 })).toThrow(StudioValidationError);
    expect(validerTransformation({ dx: 0, dy: 0, dz: 0, rotation: -Math.PI / 2 }).rotation).toBeCloseTo(1.5 * Math.PI, 12);
  });
});

describe("lireIfcStudio — aller-retour avec l'export IFC4X3 de Studio", () => {
  it("murs (justification comprise), ouvertures et leurs types déclarés reviennent à l'identique ; le reste est non natif", () => {
    const source: StudioDocument = applyStudioCommands(newStudioDocument("src"), [
      { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.25, height: 3, base: 0.5, justification: "center" } },
      { toolId: "studio.architecture.mur", params: { id: "m2", type: "wall", axis: [{ x: 0, y: 2 }, { x: 0, y: 7 }], thickness: 0.2, height: 2.5, base: 0, justification: "right" } },
      { toolId: "studio.architecture.ouverture", params: { id: "p1", type: "opening", hostId: "m1", position: 1, width: 0.9, height: 2.1, sill: 0, kind: "porte" } },
      { toolId: "studio.architecture.ouverture", params: { id: "f1", type: "opening", hostId: "m1", position: 3, width: 1.4, height: 1.2, sill: 1, kind: "fenetre" } },
      { toolId: "studio.architecture.ouverture", params: { id: "b1", type: "opening", hostId: "m2", position: 2, width: 1, height: 2 , sill: 0 } },
      { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 8, y: 0 }, width: 2, height: 1, extrusion: { base: 0, height: 1 } } },
    ]);
    const texte = exportStudioIfc(source, { studyName: "É", variantName: "V", timestamp: "2026-10-25T00:00:00" });
    const r = lireIfcStudio(texte);
    expect(r.rapport.schema).toBe("IFC4X3_ADD2");
    const doc = applyStudioCommands(newStudioDocument("d"), r.commandes);
    const sans = (a: object) => { const { id: _i, layerId: _l, hostId: _h, ...reste } = a as Record<string, unknown>; return reste; };
    expect(doc.architecture?.map(sans)).toEqual(source.architecture?.map(sans));
    expect(doc.nonNatifs?.map((n) => [n.origine.entite, n.origine.nom])).toEqual([["IfcBuildingElementProxy", "r1"]]);
    expect(doc.nonNatifs?.[0]?.empreinte).toEqual([{ x: 8, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1 }, { x: 8, y: 1 }]);
    expect(r.rapport.pertes.map((p) => p.type)).toEqual(expect.arrayContaining(["IfcPropertySet", "IfcPresentationLayerWithStyle", "IfcSite", "IfcBuilding"]));
  });
});

describe("lireIfcStudio — refus motivés", () => {
  it("fichier non STEP, schéma non pris en charge, instance mal formée, trop grand", () => {
    expect(() => lireIfcStudio("bonjour")).toThrow(/ISO-10303-21/);
    expect(() => lireIfcStudio(ifc("CIS2", []))).toThrow(/schéma IFC non pris en charge : CIS2/);
    expect(() => lireIfcStudio(ifc("IFC4", ["#1=IFCPROJECT('a',$;"]))).toThrow(StudioValidationError);
    expect(() => lireIfcStudio(ifc("IFC4", ["#1=IFCX(1);", "#1=IFCX(2);"]))).toThrow(/définie deux fois/);
    expect(() => lireIfcStudio(" ".repeat(5 * 1024 * 1024 + 1))).toThrow(/Mo au plus/);
  });

  it("chaînes STEP décodées (\\X2\\, apostrophe doublée, \\S\\) ; commentaires ignorés", () => {
    const f = lireStep(ifc("IFC4", ["/* c */ #1=IFCLABEL('l''\\X2\\00E9\\X0\\t\\S\\i');"]));
    expect(f.entites.get(1)).toEqual({ n: 1, type: "IFCLABEL", attrs: [{ t: "str", v: "l'été" }] });
  });

  it("calque cible verrouillé dans le document : refus, rien n'est ajouté", () => {
    const doc = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.calque.creer", params: { id: "x", name: "RDC", visible: true, locked: true } }]);
    expect(() => lireIfcStudio(RECETTE, { document: doc })).toThrow(/calque verrouillé dans le document : RDC/);
  });
});

describe("Éléments non natifs dans le document", () => {
  const doc = applyStudioCommands(newStudioDocument("d"), lireIfcStudio(RECETTE).commandes);
  const id = "ifc-0PoteauC10000000000000";

  it("non éditables comme un objet natif : déplacer, modifier, supprimer, extruder les refusent", () => {
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.dessin.deplacer", params: { id, dx: 1, dy: 0 } }])).toThrow(StudioValidationError);
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.dessin.supprimer", params: { ids: [id] } }])).toThrow(StudioValidationError);
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.objet.extruder", params: { ids: [id], base: 0, height: 1 } }])).toThrow(StudioValidationError);
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.solide.supprimer", params: { ids: [id] } }])).toThrow(StudioValidationError);
    // Un identifiant non natif reste réservé : aucun objet natif ne peut le reprendre.
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }])).toThrow(/identifiant déjà utilisé/);
  });

  it("retrait explicite (studio.nonnatif.retirer) ; un élément inconnu ou natif est refusé", () => {
    const apres = applyStudioCommands(doc, [{ toolId: "studio.nonnatif.retirer", params: { ids: [id] } }]);
    expect(apres.nonNatifs?.map((n) => n.id)).not.toContain(id);
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.nonnatif.retirer", params: { ids: ["inconnu"] } }])).toThrow(/élément non natif introuvable/);
    expect(() => applyStudioCommands(doc, [{ toolId: "studio.nonnatif.retirer", params: { ids: ["ifc-0MurW10000000000000000"] } }])).toThrow(/ce n’est pas un élément non natif/);
    const vide = applyStudioCommands(doc, [{ toolId: "studio.nonnatif.retirer", params: { ids: doc.nonNatifs!.map((n) => n.id) } }]);
    expect(Object.hasOwn(vide, "nonNatifs")).toBe(false);
  });

  it("exclus du métré, avec mention (nonNatifsExclus) ; aucune quantité n'en est tirée", () => {
    const q = quantitesStudio(doc);
    expect(q.nonNatifsExclus).toBe(3);
    expect(q.objets.some((o) => doc.nonNatifs!.some((n) => n.id === o.objetId))).toBe(false);
    expect(Object.hasOwn(quantitesStudio(newStudioDocument("v")), "nonNatifsExclus")).toBe(false);
  });

  it("validation stricte : champ inconnu, raison inconnue, empreinte de moins de 3 sommets refusés", () => {
    const n = doc.nonNatifs![0]!;
    const avec = (x: object) => ({ ...doc, nonNatifs: [{ ...n, ...x }] });
    expect(() => applyStudioCommands(avec({ categorie: "x" }) as StudioDocument, [{ toolId: "studio.nonnatif.retirer", params: { ids: [n.id] } }])).toThrow(StudioValidationError);
    expect(() => applyStudioCommands(avec({ raison: "autre" }) as StudioDocument, [{ toolId: "studio.nonnatif.retirer", params: { ids: [n.id] } }])).toThrow(/raison inconnue/);
    expect(() => applyStudioCommands(avec({ empreinte: [{ x: 0, y: 0 }] }) as StudioDocument, [{ toolId: "studio.nonnatif.retirer", params: { ids: [n.id] } }])).toThrow(/sommets/);
  });

  it("import DXF : avec conserverNonNatifs, chaque entité entière non prise devient un élément non natif (type, handle, bloc)", () => {
    const texte = dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0), "0\r\nINSERT\r\n5\r\n2A\r\n8\r\nMOBILIER\r\n2\r\nCHAISE\r\n10\r\n0\r\n20\r\n0", "0\r\nTEXT\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n1\r\nbonjour"] });
    const sans = lireDxfStudio(texte);
    expect(sans.rapport.nonNatifs).toBeUndefined();
    expect(sans.commandes.some((c) => c.toolId === "studio.nonnatif.conserver")).toBe(false);
    const avec = lireDxfStudio(texte, { conserverNonNatifs: true });
    expect(avec.rapport.nonNatifs).toBe(2);
    expect(avec.rapport.nonPris).toEqual(sans.rapport.nonPris);
    const d = applyStudioCommands(newStudioDocument("d"), avec.commandes);
    expect(d.nonNatifs).toEqual([
      { id: "dxf-nn-1", type: "non-native", layerId: "dxf-calque-1", origine: { format: "dxf", entite: "INSERT", identifiant: "2A", nom: "CHAISE" }, raison: "type-sans-equivalent" },
      { id: "dxf-nn-2", type: "non-native", origine: { format: "dxf", entite: "TEXT" }, raison: "type-sans-equivalent" },
    ]);
    expect(d.layers).toEqual([{ id: "dxf-calque-1", name: "MOBILIER", visible: true, locked: false }]);
    // Un second import retrouve le calque et ne réutilise aucun identifiant.
    const encore = applyStudioCommands(d, lireDxfStudio(texte, { document: d, conserverNonNatifs: true }).commandes);
    expect(encore.nonNatifs?.map((n) => n.id)).toEqual(["dxf-nn-1", "dxf-nn-2", "dxf-nn-3", "dxf-nn-4"]);
  });
});
