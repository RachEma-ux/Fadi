import { describe, expect, it } from "vitest";
import { caracteristiqueAdmise, estCaracteristiqueNommee, indiceContourDalle } from "./caracteristiques.js";
import { CLASSES_OBJET, type ObjetDe, type ObjetMur } from "./classes.js";
import { CLASSES_TYPEES, definitionNonType } from "./definitions.js";
import { ONTOLOGIE, VERSION_ONTOLOGIE } from "./descripteurs.js";
import { CLASSES_IFC } from "./ifc.js";
import { nonEvaluee } from "./provenance.js";
import { pointCadastral, pointLocal } from "./reperes.js";
import { relationAdmise } from "./relations.js";
import { aire, angle, longueur } from "./unites.js";
import { validerObjet } from "./validation.js";

const mur = (): ObjetMur => ({
  id: "p_EX118-rdc-W-009",
  classe: "mur",
  ontologie: "building.architecture",
  niveauId: "p_rdc",
  calqueId: "p_calque-Noyaux",
  definitionId: "mur",
  provenance: "import",
  statut: "declaree",
  params: {
    axe: { a: pointLocal(-8.185371454921551, 8.843867132789455), b: pointLocal(-4.742765219300054, 13.7750595145626) },
    epaisseur: longueur(0.2),
    hauteur: longueur(3.2),
    alignement: "axe",
    typeId: "mur",
    exterieur: false,
    nom: "Noyau A",
  },
  proprietes: [
    { nom: "import.lineRef", valeur: "axe", provenance: "import", statut: "declaree" },
    { nom: "import.color", valeur: "#e5e0d5", provenance: "import", statut: "declaree" },
  ],
});

/** Retire une clé (pour fabriquer des objets invalides). */
function sans<T extends object>(o: T, cle: string): Record<string, unknown> {
  const copie: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  delete copie[cle];
  return copie;
}

describe("catalogue de l'ontologie", () => {
  it("décrit chaque classe du §5.2 avec son ontologie et sa correspondance IFC", () => {
    expect(VERSION_ONTOLOGIE).toBe(1);
    for (const c of CLASSES_OBJET) {
      expect(ONTOLOGIE[c].classe).toBe(c);
      expect(ONTOLOGIE[c].ifc).toBe(CLASSES_IFC[c]);
    }
    expect(ONTOLOGIE.poteau.ontologie).toBe("building.structure");
    expect(ONTOLOGIE.solide.ontologie).toBe("drawing");
    expect(ONTOLOGIE.cotation.ontologie).toBe("annotation");
    expect(ONTOLOGIE.calque.ontologie).toBe("projet");
    expect(CLASSES_OBJET).toEqual(expect.arrayContaining(["structureDeclaree", "hypothese", "source", "parcelle", "emprise", "groupe", "esquisse.hachure"]));
  });

  it("dérive les classes IFC de l'annexe C", () => {
    expect(CLASSES_IFC.niveau?.entite).toBe("IfcBuildingStorey");
    expect(CLASSES_IFC.dalle).toMatchObject({ entite: "IfcSlab", typePredefini: "FLOOR" });
    expect(CLASSES_IFC.piece?.entite).toBe("IfcSpace");
    expect(CLASSES_IFC.zone?.entite).toBe("IfcZone");
    expect(CLASSES_IFC.solide?.entite).toBe("IfcBuildingElementProxy");
    expect(CLASSES_IFC.cotation?.entite).toBe("IfcAnnotation");
    expect(CLASSES_IFC.calque).toBeNull();
  });

  it("n'admet un type que pour mur, porte, fenêtre, ouverture ; « non-type » sans donnée", () => {
    expect(CLASSES_OBJET.filter((c) => ONTOLOGIE[c].admetType)).toEqual([...CLASSES_TYPEES]);
    const d = definitionNonType("mur", 1);
    expect(d).toMatchObject({ id: "non-type", classe: "mur", classeIfc: "IfcWallType", proprietes: [], versionCatalogue: 1 });
    expect(d.dimensionsProposees).toBeUndefined();
  });

  it("déclare les caractéristiques nommées", () => {
    expect(ONTOLOGIE.mur.caracteristiques).toEqual(["mur:face-gauche", "mur:face-droite", "mur:arete-debut", "mur:arete-fin", "mur:axe"]);
    expect(caracteristiqueAdmise("porte", "ouverture:centre")).toBe(true);
    expect(caracteristiqueAdmise("mur", "poteau:centre")).toBe(false);
    expect(caracteristiqueAdmise("dalle", "dalle:contour[3]")).toBe(true);
    expect(indiceContourDalle("dalle:contour[12]")).toBe(12);
    expect(indiceContourDalle("dalle:contour[-1]")).toBeNull();
    expect(estCaracteristiqueNommee("escalier:arrivee")).toBe(true);
    expect(estCaracteristiqueNommee("mur:milieu")).toBe(false);
  });

  it("contrôle les relations admises", () => {
    expect(relationAdmise("heberge-par", "porte", "mur")).toBe(true);
    expect(relationAdmise("heberge-par", "porte", "dalle")).toBe(false);
    expect(relationAdmise("relie", "escalier", "niveau")).toBe(true);
    expect(relationAdmise("contient", "zone", "piece")).toBe(true);
    expect(relationAdmise("contient", "zone", "mur")).toBe(false);
    // D-024 : pas de relation « contient » niveau → objets (le niveau est porté par `niveauId`).
    expect(relationAdmise("contient", "niveau", "mur")).toBe(false);
  });
});

describe("validation d'un objet", () => {
  it("accepte un mur importé bien formé", () => {
    expect(validerObjet(mur())).toEqual([]);
  });

  it("exige provenance et statut sur l'objet", () => {
    expect(validerObjet(sans(mur(), "provenance")).map((e) => e.message).join(" ")).toMatch(/provenance obligatoire/);
    expect(validerObjet(sans(mur(), "statut")).map((e) => e.message).join(" ")).toMatch(/statut obligatoire/);
    expect(validerObjet({ ...mur(), statut: "probable" }).length).toBeGreaterThan(0);
  });

  it("exige provenance et statut sur chaque propriété et chaque annotation", () => {
    const o = { ...mur(), proprietes: [{ nom: "import.lineRef", valeur: "axe" }] };
    expect(validerObjet(o).some((e) => e.chemin === "proprietes[0]")).toBe(true);
    const a = { ...mur(), annotations: { epaisseur: { provenance: "import" } } };
    expect(validerObjet(a).some((e) => e.chemin === "annotations.epaisseur")).toBe(true);
  });

  it("refuse une classe inconnue et une ontologie fausse", () => {
    expect(validerObjet({ ...mur(), classe: "cheminee" })[0]?.message).toMatch(/classe inconnue/);
    expect(validerObjet({ ...mur(), ontologie: "drawing" }).some((e) => e.chemin === "ontologie")).toBe(true);
  });

  it("refuse une unité incompatible ou absente", () => {
    const m = mur();
    expect(validerObjet({ ...m, params: { ...m.params, epaisseur: { value: 20, unit: "cm" } } }).some((e) => e.chemin === "params.epaisseur")).toBe(true);
    expect(validerObjet({ ...m, params: { ...m.params, epaisseur: 0.2 } }).some((e) => e.chemin === "params.epaisseur")).toBe(true);
    expect(validerObjet({ ...m, params: { ...m.params, epaisseur: longueur(0) } }).some((e) => /strictement positive/.test(e.message))).toBe(true);
  });

  it("refuse un axe aux repères mélangés ou hors du repère local du projet", () => {
    const m = mur();
    const melange = { ...m, params: { ...m.params, axe: { a: pointLocal(0, 0), b: pointCadastral(321946.82, 347183.88, "EPSG:26191") } } };
    expect(validerObjet(melange).some((e) => e.chemin.startsWith("params.axe"))).toBe(true);
    const autre = { ...m, params: { ...m.params, axe: { a: pointLocal(0, 0, "registration"), b: pointLocal(1, 0, "registration") } } };
    expect(validerObjet(autre).some((e) => /repère local du projet attendu/.test(e.message))).toBe(true);
  });

  it("exige hauteur ou niveauHaut, jamais devinés", () => {
    const m = mur();
    const { hauteur: _h, ...sansHauteur } = m.params;
    void _h;
    expect(validerObjet({ ...m, params: sansHauteur }).some((e) => /hauteur \/ niveauHaut/.test(e.message))).toBe(true);
    expect(validerObjet({ ...m, params: { ...sansHauteur, niveauHaut: "p_mezz" } })).toEqual([]);
  });

  it("refuse un paramètre inconnu et un niveau manquant", () => {
    const m = mur();
    expect(validerObjet({ ...m, params: { ...m.params, couleur: "#ffffff" } }).some((e) => e.chemin === "params.couleur")).toBe(true);
    expect(validerObjet(sans(m, "niveauId")).some((e) => e.chemin === "niveauId")).toBe(true);
  });

  it("pièce : polygones courants en repère projet, polygones source dans leur propre repère (D-021)", () => {
    const reg = "p118-layoutV819-registration";
    const piece: ObjetDe<"piece"> = {
      id: "p_piece-rdc-R01",
      classe: "piece",
      ontologie: "building.architecture",
      niveauId: "p_rdc",
      provenance: "import",
      statut: "declaree",
      params: {
        polygones: [{ contour: [pointLocal(0, 0), pointLocal(4, 0), pointLocal(4, 3)], trous: [] }],
        polygonesSource: [{ contour: [pointLocal(15.811, 8.9725, reg), pointLocal(15.811, 8.148, reg), pointLocal(19.109, 8.148, reg)], trous: [] }],
        code: "R01",
        nom: "Accueil, attente et hall",
        aireDeclaree: aire(160.649),
        etiquette: pointLocal(7.857, 4.268, reg),
      },
      annotations: { aireDeclaree: { provenance: "prototype", statut: "a-verifier", note: "antérieure à la révision 8.19" } },
      proprietes: [],
    };
    expect(validerObjet(piece)).toEqual([]);
    // Polygones courants dans le repère de la registration : refusés.
    const fautive = { ...piece, params: { ...piece.params, polygones: piece.params.polygonesSource } };
    expect(validerObjet(fautive).some((e) => e.chemin.startsWith("params.polygones"))).toBe(true);
    // Mélange de repères dans les polygones source : refusé.
    const melange = {
      ...piece,
      params: { ...piece.params, polygonesSource: [...(piece.params.polygonesSource ?? []), { contour: [pointLocal(0, 0), pointLocal(1, 0), pointLocal(1, 1)], trous: [] }] },
    };
    expect(validerObjet(melange).some((e) => /repères mélangés/.test(e.message))).toBe(true);
    // Pièce sans tracé courant : admise (problème listé par l'importeur, rien n'est supprimé).
    expect(validerObjet({ ...piece, params: { ...piece.params, polygones: [] } })).toEqual([]);
  });

  it("escalier : valeur absente = « non évaluée », jamais devinée", () => {
    const esc: ObjetDe<"escalier"> = {
      id: "p_EX118-r1-B1",
      classe: "escalier",
      ontologie: "building.architecture",
      niveauId: "p_r1",
      provenance: "import",
      statut: "declaree",
      params: {
        axe: { a: pointLocal(0, 0), b: pointLocal(3, 0) },
        largeur: longueur(1.3),
        hauteurAFranchir: longueur(1.7),
        marches: 10,
        contremarches: nonEvaluee("absent de la source"),
        epaisseurPaillasse: nonEvaluee("absent de la source"),
        decalageBase: longueur(0),
        referencePlanSeulement: true,
      },
      proprietes: [],
    };
    expect(validerObjet(esc)).toEqual([]);
    expect(validerObjet({ ...esc, params: { ...esc.params, contremarches: -1 } }).some((e) => e.chemin === "params.contremarches")).toBe(true);
  });

  it("dalle importée : épaisseur « à vérifier », propriété importée conservée bit à bit (D-021)", () => {
    const dalle: ObjetDe<"dalle"> = {
      id: "p_EX118-rdc-P-001",
      classe: "dalle",
      ontologie: "building.architecture",
      niveauId: "p_rdc",
      calqueId: "p_calque-Dalles",
      provenance: "import",
      statut: "declaree",
      params: { contour: [pointLocal(0, 0), pointLocal(1, 0), pointLocal(1, 1)], trous: [], epaisseur: longueur(0.25), decalageBase: longueur(-0.25) },
      annotations: { epaisseur: { provenance: "import", statut: "a-verifier", note: "0,25 m conservé uniquement pour la représentation" } },
      proprietes: [
        { nom: "import.thickness", valeur: 0.1, unite: "m", provenance: "import", statut: "declaree" },
        { nom: "import.vertexOffsets", valeur: [0.30000000000000004, -0.1], provenance: "import", statut: "declaree" },
      ],
    };
    expect(validerObjet(dalle)).toEqual([]);
    const conserve = dalle.proprietes[1]?.valeur as readonly number[];
    expect(Object.is(conserve[0], 0.30000000000000004)).toBe(true);
  });

  it("calque : présence par niveau et remplissage absent conservé absent (D-021, DA-05-01)", () => {
    const calque: ObjetDe<"calque"> = {
      id: "p_calque-Gabarits acces",
      classe: "calque",
      ontologie: "projet",
      provenance: "import",
      statut: "declaree",
      params: { nom: "Gabarits accès", couleur: "#315b4b", visible: false, verrouille: false, ordre: 17, niveauxPresence: ["p_rdc", "p_mezz", "p_r1", "p_r2", "p_r3"] },
      proprietes: [],
    };
    expect(validerObjet(calque)).toEqual([]);
    expect(validerObjet({ ...calque, params: { ...calque.params, couleur: "vert" } }).some((e) => e.chemin === "params.couleur")).toBe(true);
    expect(validerObjet({ ...calque, niveauId: "p_rdc" }).some((e) => e.chemin === "niveauId")).toBe(true);
  });

  it("parcelle : sommets cadastraux tagués, aires conservées séparément", () => {
    const crs = "EPSG:26191";
    const parcelle: ObjetDe<"parcelle"> = {
      id: "p_parcelle-118",
      classe: "parcelle",
      ontologie: "projet",
      provenance: "import",
      statut: "declaree",
      sourceId: "CAD-S01",
      params: {
        numero: "118",
        crs,
        crsSource: "LAMBERT — EPSG:26191 sous hypothèse",
        sommetsCadastraux: [pointCadastral(321946.82, 347183.88, crs), pointCadastral(321954.11, 347215.38, crs), pointCadastral(321995.84, 347186.25, crs), pointCadastral(321978.68, 347161.67, crs)],
        identifiantsSommets: ["B.266", "B.267", "B.268", "B.265"],
        aire: aire(1345.5475500009647),
        aireOfficielle: aire(1346),
        aireCorrigeeImprimee: aire(1346.4787),
        recul: longueur(5),
      },
      proprietes: [],
    };
    expect(validerObjet(parcelle)).toEqual([]);
    const melange = { ...parcelle, params: { ...parcelle.params, sommetsCadastraux: [...parcelle.params.sommetsCadastraux.slice(0, 3), pointLocal(0, 0)] } };
    expect(validerObjet(melange).some((e) => e.chemin.startsWith("params.sommetsCadastraux"))).toBe(true);
  });

  it("hypothèse : statut « à confirmer », jamais une exigence (R4)", () => {
    const h: ObjetDe<"hypothese"> = {
      id: "p_H-charge",
      classe: "hypothese",
      ontologie: "projet",
      provenance: "import",
      statut: "a-confirmer",
      params: { code: "structure.loadNature", texte: "Charge d’exploitation supposée, à confirmer" },
      proprietes: [],
    };
    expect(validerObjet(h)).toEqual([]);
    expect(validerObjet(sans(h, "statut")).length).toBeGreaterThan(0);
  });

  it("poteau : angle en degrés", () => {
    const p: ObjetDe<"poteau"> = {
      id: "p_COL-01",
      classe: "poteau",
      ontologie: "building.structure",
      niveauId: "p_rdc",
      provenance: "import",
      statut: "declaree",
      params: { point: pointLocal(-16.17, -1.18), formeId: "basic-square", largeur: longueur(0.35), profondeur: longueur(0.35), hauteur: longueur(3.2), angle: angle(55.080006596041926) },
      proprietes: [],
    };
    expect(validerObjet(p)).toEqual([]);
    expect(validerObjet({ ...p, params: { ...p.params, angle: { value: 0.96, unit: "rad" } } }).some((e) => e.chemin === "params.angle")).toBe(true);
  });
});
