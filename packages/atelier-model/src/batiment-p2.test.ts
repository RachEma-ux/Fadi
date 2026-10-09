import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "./commandes/index.js";
import type { Commande } from "./commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { csvTableau, genererTableau, tableauxDisponibles } from "./documents/tableaux.js";
import { exporterIfc } from "./echanges/ifc.js";
import { maillageObjet } from "./projection/maillage.js";
import { delaunay, proprietesMasse, subdiviserLoop, triangulerFaces, volumeMaillage } from "./geometrie-3d.js";
import { altitudeTerrain, facesSubdivisees, nombreProfilsMurRideau, penteRampe } from "./batiment-p2.js";
import { collisionsOntologies, controlesSpecification } from "./coordination.js";
import { corpsDe } from "./interferences.js";
import { collisions } from "./versions.js";
import { inertieAssemblage, inertiePiece } from "./ontologies/mechanical/inerties.js";
import { premierObstacle, trajectoire } from "./ontologies/mechanical/cinematique.js";
import { m, pt } from "./unites.js";

const P3 = (x: number, y: number, z: number) => ({ x, y, z });
const carre = (x: number, y: number, c: number) => [pt(x, y), pt(x + c, y), pt(x + c, y + c), pt(x, y + c)];
let n = 0;
const lot = (etat: ModeleAtelier, commands: Commande[], label = "lot") => appliquerLot(etat, { requestId: `req-p26-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
const base = () => lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }]).etat;
const O = <C extends Occurrence["classe"]>(etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<C>;
const vol = (etat: ModeleAtelier, id: string) => volumeMaillage(maillageObjet(etat, etat.objets[id]!)!);

describe("bâtiment P2 (P2-6, DA-07) : classes à paramètres saisis, géométrie dérivée", () => {
  it("plafond : prisme du contour à la hauteur donnée ; rien n'est supposé (épaisseur et hauteur requises)", () => {
    const e = lot(base(), [{ type: "plafond.creer", params: { id: "pl", niveauId: "n1", contour: carre(0, 0, 4), trous: [], hauteur: m(2.5), epaisseur: m(0.05), suspendu: true, materiau: "plaque de plâtre (déclaré)" } }]).etat;
    expect(vol(e, "pl")).toBeCloseTo(16 * 0.05, 6);
    const mm = maillageObjet(e, e.objets["pl"]!)!;
    const zs = mm.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(2.5, 9);
    expect(Math.max(...zs)).toBeCloseTo(2.55, 9);
    expect(() => lot(base(), [{ type: "plafond.creer", params: { id: "x", niveauId: "n1", contour: carre(0, 0, 4), trous: [], hauteur: m(2.5) } }])).toThrow(/epaisseur/);
  });
  it("coque : dôme paraboloïdal déclaré (flèche au centre) ; volume entre le prisme plat et le prisme plein", () => {
    const e = lot(base(), [{ type: "coque.creer", params: { id: "cq", niveauId: "n1", contour: carre(0, 0, 10), trous: [], fleche: m(2), epaisseur: m(0.1) } }]).etat;
    const v = vol(e, "cq");
    expect(v).toBeGreaterThan(100 * 0.1);
    expect(v).toBeLessThan(100 * 2.1);
    const zs = maillageObjet(e, e.objets["cq"]!)!.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(2.1, 6);
  });
  it("rampe : paillasse inclinée a → b ; pente dérivée en % jamais confrontée à une règle ; longueur nulle refusée", () => {
    const e = lot(base(), [{ type: "rampe.creer", params: { id: "r", niveauId: "n1", a: pt(0, 0), b: pt(10, 0), largeur: m(1.4), hauteurAFranchir: m(0.5), epaisseur: m(0.15) } }]).etat;
    const r = O<"rampe">(e, "r");
    expect(penteRampe(r.params)).toBeCloseTo(5, 9);
    expect(vol(e, "r")).toBeCloseTo(Math.hypot(10, 0.5) * 1.4 * 0.15, 3); // paillasse balayée le long de la pente
    expect(() => lot(base(), [{ type: "rampe.creer", params: { id: "x", niveauId: "n1", a: pt(0, 0), b: pt(0, 0), largeur: m(1), hauteurAFranchir: m(0.5), epaisseur: m(0.1) } }])).toThrow(/longueur nulle/);
  });
  it("échelle : montants, barreaux à l'entraxe déclaré, crinoline déclarée ; entraxe ≥ hauteur refusé", () => {
    const e = lot(base(), [{ type: "echelle.creer", params: { id: "ec", niveauId: "n1", a: pt(0, 0), b: pt(0, 1), hauteur: m(4), largeur: m(0.5), entraxeBarreaux: m(0.3), crinolineDepuis: m(2.2) } }]).etat;
    const mm = maillageObjet(e, e.objets["ec"]!)!;
    expect(mm.indices.length).toBeGreaterThan(12 * 14);
    expect(() => lot(base(), [{ type: "echelle.creer", params: { id: "x", niveauId: "n1", a: pt(0, 0), b: pt(0, 1), hauteur: m(2), largeur: m(0.5), entraxeBarreaux: m(2.5) } }])).toThrow(/entraxe/);
  });
  it("mur-rideau : montants et traverses comptés depuis la trame, remplissage vitré ; export IfcCurtainWall", () => {
    const e = lot(base(), [{ type: "murRideau.creer", params: { id: "mr", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), hauteur: m(3), entraxeMontants: m(1.5), entraxeTraverses: m(1.5), largeurProfil: m(0.05), profondeurProfil: m(0.1), epaisseurVitrage: m(0.028) } }]).etat;
    const c = nombreProfilsMurRideau(O<"mur-rideau">(e, "mr").params);
    expect(c).toEqual({ montants: 5, traverses: 3, panneaux: 8 });
    expect(vol(e, "mr")).toBeGreaterThan(0);
  });
  it("terrain : semis triangulé (Delaunay), altitude interpolée dans le semis seulement, points ajoutés jamais inventés", () => {
    const e = lot(base(), [{ type: "terrain.creer", params: { id: "t", niveauId: "n1", points: [P3(0, 0, 0), P3(10, 0, 1), P3(10, 10, 2), P3(0, 10, 1)], source: "relevé géomètre (déclaré)" } }]).etat;
    const t = O<"terrain">(e, "t");
    expect(delaunay(t.params.points).length).toBe(2);
    expect(altitudeTerrain(t.params, { x: 5, y: 5 })).toBeCloseTo(1, 6);
    expect(altitudeTerrain(t.params, { x: 20, y: 20 })).toBeNull();
    const e2 = lot(e, [{ type: "terrain.ajouterPoints", params: { id: "t", points: [P3(5, 5, 3)] } }]).etat;
    expect(O<"terrain">(e2, "t").params.points.length).toBe(5);
    expect(delaunay(O<"terrain">(e2, "t").params.points).length).toBe(4);
    expect(altitudeTerrain(O<"terrain">(e2, "t").params, { x: 5, y: 5 })).toBeCloseTo(3, 6);
    expect(() => lot(e, [{ type: "terrain.creer", params: { id: "x", niveauId: "n1", points: [P3(0, 0, 0), P3(0, 0, 1), P3(1, 1, 0)] } }])).toThrow(/même position/);
  });
  it("installation de chantier : type, période ISO, phase ; fin avant début refusée ; tableau « chantier »", () => {
    const e = lot(base(), [
      { type: "installationChantier.creer", params: { id: "gr", niveauId: "n1", nom: "Grue G1", type: "grue", contour: carre(20, 20, 6), trous: [], hauteur: m(40), debut: "2027-03-01", fin: "2027-11-30", phaseChantier: "gros œuvre" } },
      { type: "installationChantier.creer", params: { id: "bv", niveauId: "n1", nom: "Base vie", type: "base-vie", contour: carre(30, 20, 12), trous: [] } },
    ]).etat;
    expect(() => lot(e, [{ type: "installationChantier.creer", params: { id: "x", niveauId: "n1", nom: "X", type: "acces", contour: carre(0, 0, 1), trous: [], debut: "2027-05-01", fin: "2027-01-01" } }])).toThrow(/fin avant le début/);
    const t = genererTableau(e, "chantier");
    expect(t.lignes.length).toBe(2);
    expect(t.lignes[1]).toEqual(["RDC", "Grue G1", "grue", 36, 40, "2027-03-01", "2027-11-30", "gros œuvre"]);
    expect(t.lignes[0]![4]).toBeNull();
    expect(csvTableau(t)).toContain("Base vie");
    expect(tableauxDisponibles()).toHaveLength(15);
  });
  it("tableau « rénovation » : objets comptés par phase déclarée, « non évaluée » sans phase", () => {
    const e = lot(base(), [
      { type: "mur.tracer", params: { id: "w1", niveauId: "n1", a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(3), phase: "existant" } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "n1", a: pt(0, 2), b: pt(5, 2), epaisseur: m(0.2), hauteur: m(3), phase: "démoli" } },
      { type: "mur.tracer", params: { id: "w3", niveauId: "n1", a: pt(0, 4), b: pt(5, 4), epaisseur: m(0.2), hauteur: m(3) } },
    ]).etat;
    const t = genererTableau(e, "renovation");
    expect(t.lignes.map((l) => [l[0], l[1], l[2]])).toEqual([["démoli", "Mur", 1], ["existant", "Mur", 1], ["non évaluée", "Mur", 1]]);
  });
  it("IFC : IfcCovering .CEILING., IfcRoof .FREEFORM., IfcRamp, IfcStair .LADDER., IfcCurtainWall, IfcGeographicElement .TERRAIN., IfcOpeningElement + IfcRelVoidsElement, proxy chantier", () => {
    const e = lot(base(), [
      { type: "mur.tracer", params: { id: "a-mur", niveauId: "n1", a: pt(-1, 1), b: pt(5, 1), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "plafond.creer", params: { id: "pl", niveauId: "n1", contour: carre(0, 0, 4), trous: [], hauteur: m(2.5), epaisseur: m(0.05) } },
      { type: "coque.creer", params: { id: "cq", niveauId: "n1", contour: carre(0, 0, 10), trous: [], fleche: m(2), epaisseur: m(0.1) } },
      { type: "rampe.creer", params: { id: "r", niveauId: "n1", a: pt(0, 0), b: pt(10, 0), largeur: m(1.4), hauteurAFranchir: m(0.5), epaisseur: m(0.15) } },
      { type: "echelle.creer", params: { id: "ec", niveauId: "n1", a: pt(0, 0), b: pt(0, 1), hauteur: m(4), largeur: m(0.5), entraxeBarreaux: m(0.3) } },
      { type: "murRideau.creer", params: { id: "mr", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), hauteur: m(3), entraxeMontants: m(1.5), entraxeTraverses: m(1.5), largeurProfil: m(0.05), profondeurProfil: m(0.1), epaisseurVitrage: m(0.028) } },
      { type: "terrain.creer", params: { id: "t", niveauId: "n1", points: [P3(0, 0, 0), P3(10, 0, 1), P3(10, 10, 2), P3(0, 10, 1)] } },
      { type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.8, 0.8, 0.5), trous: [], hoteId: "a-mur", z: 1, hauteur: m(0.5), statut: "accordee" } },
      { type: "installationChantier.creer", params: { id: "gr", niveauId: "n1", nom: "Grue G1", type: "grue", contour: carre(20, 20, 6), trous: [], hauteur: m(40) } },
    ]).etat;
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "P2-6", code: "P" }, revision: 1, horodatage: new Date(0).toISOString() });
    for (const s of ["IFCCOVERING(", ".CEILING.", "IFCROOF(", ".FREEFORM.", "IFCRAMP(", ".STRAIGHT_RUN_RAMP.", "IFCSTAIR(", ".LADDER.", "IFCCURTAINWALL(", "IFCGEOGRAPHICELEMENT(", ".TERRAIN.", "IFCOPENINGELEMENT(", "IFCRELVOIDSELEMENT(", "'chantier:grue'", ".PROVISIONFORSPACE.", "'Fadi_Rampe'", "'Fadi_Reservation'"]) expect(ifc.contenu, s).toContain(s);
    const classes = ifc.rapport.classes.map((c) => c.classe);
    for (const c of ["plafond", "coque", "rampe", "echelle", "mur-rideau", "terrain", "reservation", "installation-chantier"]) expect(classes).toContain(c);
    expect(ifc.rapport.classes.find((c) => c.classe === "reservation")!.ifc).toBe("IfcOpeningElement");
  });
});

describe("surfaces libres (DA-03-03, 05, 06, 07, 20) : subdivision, édition directe, conversion explicite", () => {
  const pyramide = { sommets: [P3(0, 0, 0), P3(2, 0, 0), P3(2, 2, 0), P3(0, 2, 0), P3(1, 1, 2)], faces: [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]] };
  it("géométrie : triangulation des quads, Loop multiplie les faces par 4 à chaque niveau, propriétés de masse d'un cube", () => {
    expect(triangulerFaces(pyramide.faces).length).toBe(6);
    const s1 = subdiviserLoop(pyramide.sommets.flatMap((p) => [p.x, p.y, p.z]), triangulerFaces(pyramide.faces), 1);
    expect(s1.indices.length / 3).toBe(24);
    expect(subdiviserLoop(pyramide.sommets.flatMap((p) => [p.x, p.y, p.z]), triangulerFaces(pyramide.faces), 2).indices.length / 3).toBe(96);
    const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
    const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const pm = proprietesMasse({ positions: P, indices: I });
    expect(pm.volume).toBeCloseTo(1, 9);
    expect(pm.centre.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.5, 0.5, 0.5]);
    expect(pm.inertie[0]).toBeCloseTo(1 / 6, 9);
    expect(pm.inertie[4]).toBeCloseTo(1 / 6, 9);
    expect(pm.inertie[8]).toBeCloseTo(1 / 6, 9);
    expect(Math.abs(pm.inertie[1]!)).toBeLessThan(1e-9);
  });
  it("création, subdivision 0 → 3, déplacement d'un sommet de contrôle (la surface suit), volume fermé lissé < volume de contrôle", () => {
    const e = lot(base(), [{ type: "surfaceLibre.creer", params: { id: "sl", niveauId: "n1", nom: "Dôme", ...pyramide, niveaux: 0, ferme: true } }]).etat;
    const v0 = vol(e, "sl");
    expect(v0).toBeCloseTo((4 * 2) / 3, 6);
    const e1 = lot(e, [{ type: "surfaceLibre.subdiviser", params: { id: "sl", niveaux: 3 } }]).etat;
    expect(facesSubdivisees(O<"surface-libre">(e1, "sl").params)).toBe(6 * 64);
    expect(maillageObjet(e1, e1.objets["sl"]!)!.indices.length / 3).toBe(384);
    expect(vol(e1, "sl")).toBeLessThan(v0);
    expect(vol(e1, "sl")).toBeGreaterThan(0);
    const e2 = lot(e1, [{ type: "surfaceLibre.deplacerSommet", params: { id: "sl", index: 4, dz: 2 } }]).etat;
    expect(O<"surface-libre">(e2, "sl").params.sommets[4]).toEqual(P3(1, 1, 4));
    expect(vol(e2, "sl")).toBeGreaterThan(vol(e1, "sl"));
    expect(() => lot(e, [{ type: "surfaceLibre.deplacerSommet", params: { id: "sl", index: 9, dz: 1 } }])).toThrow(/index/);
    expect(() => lot(e, [{ type: "surfaceLibre.subdiviser", params: { id: "sl", niveaux: 5 } }])).toThrow(/niveaux/);
  });
  it("relecture Codex #99 : budget de subdivision (triangles × 4ⁿ ≤ 200 000) refusé nommément ; coque à trous refusée", () => {
    // Grille 30 × 20 : 551 quads = 1 102 triangles ; × 4⁴ = 282 112 > 200 000 ; × 4³ = 70 528 admis.
    const grand = { sommets: Array.from({ length: 600 }, (_, i) => P3(i % 30, Math.floor(i / 30), 0)), faces: Array.from({ length: 551 }, (_, i) => { const r = Math.floor(i / 29), c = i % 29; const a = r * 30 + c; return [a, a + 1, a + 31, a + 30]; }) };
    expect(() => lot(base(), [{ type: "surfaceLibre.creer", params: { id: "x", niveauId: "n1", ...grand, niveaux: 4 } }])).toThrow(/200 ?000|200000/);
    const e = lot(base(), [{ type: "surfaceLibre.creer", params: { id: "x", niveauId: "n1", ...grand, niveaux: 3 } }]).etat;
    expect(() => lot(e, [{ type: "surfaceLibre.subdiviser", params: { id: "x", niveaux: 4 } }])).toThrow(/subdivis/);
    expect(() => lot(base(), [{ type: "coque.creer", params: { id: "c", niveauId: "n1", contour: carre(0, 0, 10), trous: [carre(4, 4, 2)], fleche: m(2), epaisseur: m(0.1) } }])).toThrow(/trous/);
  });
  it("conversion métier explicite depuis un solide : maillage de contrôle dédoublonné, origine nommée ; le solide reste", () => {
    const e = lot(base(), [{ type: "objet.creer", params: { id: "s", classe: "solide", niveauId: "n1", params: { contour: carre(0, 0, 2), trous: [], ferme: true, hauteur: m(1) } } }]).etat;
    const e1 = lot(e, [{ type: "surfaceLibre.depuisObjet", params: { id: "sl", sourceId: "s", niveaux: 1 } }]).etat;
    const sl = O<"surface-libre">(e1, "sl");
    expect(sl.params.origine).toEqual({ classe: "solide", id: "s" });
    expect(sl.params.sommets.length).toBe(8);
    expect(sl.params.faces.length).toBe(12);
    expect(sl.params.nom).toContain("surface libre");
    expect(e1.objets["s"]).toBeDefined();
    expect(() => lot(e, [{ type: "surfaceLibre.depuisObjet", params: { sourceId: "n1" } }])).toThrow();
  });
});

describe("coordination (cahier P2 §4, DA-17-14) : collisions entre ontologies, réservations, contrôles de spécification", () => {
  const scene = () => lot(base(), [
    { type: "ontologie.activer", params: { nom: "mep" } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n1", a: pt(-1, 1), b: pt(5, 1), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "segmentReseau.creer", params: { id: "g", niveauId: "n1", systeme: "gaine", sommets: [P3(2, -1, 1.5), P3(2, 3, 1.5)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.3) } } },
  ]).etat;
  it("relecture Codex #99 : un support de réseau, une armature ou un terrain épais noyés dans un mur sont des corps (classes maillées toutes retenues)", () => {
    const e = lot(scene(), [
      { type: "supportReseau.creer", params: { id: "sp", porteId: "g", type: "console", position: pt(2, 1), z: 1.5, longueur: m(0.5) } },
      { type: "terrain.creer", params: { id: "t", niveauId: "n1", points: [P3(-2, 0, 1.6), P3(6, 0, 1.6), P3(6, 2, 1.6), P3(-2, 2, 1.6)], epaisseur: m(0.5) } },
    ]).etat;
    expect(corpsDe(e, e.objets["sp"]!).length).toBeGreaterThan(0); // support maillé : un corps (volume commun sous le seuil de signalement, mais présent)
    expect(corpsDe(e, e.objets["t"]!).length).toBe(2); // un prisme par triangle du semis (4 points → 2 triangles), pas l'enveloppe entre z extrêmes
    expect(corpsDe(e, lot(base(), [{ type: "terrain.creer", params: { id: "t0", niveauId: "n1", points: [P3(0, 0, 0), P3(1, 0, 0), P3(0, 1, 0)] } }]).etat.objets["t0"]!)).toHaveLength(0); // épaisseur nulle : surface, pas de corps
    // Terrain épais (z 1,1 → 1,6) × gaine (z 1,35 → 1,65) : volume commun 0,4 × 2 × 0,25 = 0,2 m³ signalé (terrain = bâtiment, gaine = réseau).
    const tg = collisionsOntologies(e).find((c) => c.objets.includes("t") && c.objets.includes("g"));
    expect(tg).toBeDefined();
    expect(tg!.volume).toBeCloseTo(0.2, 2);
  });
  it("une gaine qui traverse un mur : collision « ontologies » (réseau / bâtiment) signalée, jamais corrigée", () => {
    const e = scene();
    const c = collisionsOntologies(e);
    expect(c.length).toBe(1);
    expect(c[0]!.objets).toEqual(["g", "w"]);
    expect(c[0]!.familles.sort()).toEqual(["batiment", "mep"]);
    expect(c[0]!.volume).toBeCloseTo(0.4 * 0.3 * 0.2, 3);
    expect(c[0]!.reservationId).toBeNull();
    const v = collisions(e).filter((x) => x.type === "ontologies");
    expect(v.length).toBe(1);
    expect(v[0]!.message).toMatch(/gaine|segment/i);
    expect(v[0]!.message).toContain("mur");
    expect(e.objets["g"]!.params).toEqual(O<"segment-reseau">(e, "g").params); // rien n'a bougé
  });
  it("une réservation accordée dans le mur qui couvre le passage l'exempte ; demandée ou trop petite, non", () => {
    const e = scene();
    const accordee = lot(e, [{ type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.7, 0.8, 0.6), trous: [], hoteId: "w", pourId: "g", z: 1.3, hauteur: m(0.4), statut: "accordee" } }]).etat;
    expect(collisionsOntologies(accordee)[0]!.reservationId).toBe("rv");
    expect(collisions(accordee).filter((x) => x.type === "ontologies")).toHaveLength(0);
    const demandee = lot(e, [{ type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.7, 0.8, 0.6), trous: [], hoteId: "w", z: 1.3, hauteur: m(0.4), statut: "demandee" } }]).etat;
    expect(collisionsOntologies(demandee)[0]!.reservationId).toBeNull();
    const petite = lot(e, [{ type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.9, 0.8, 0.2), trous: [], hoteId: "w", z: 1.3, hauteur: m(0.4), statut: "accordee" } }]).etat;
    expect(collisionsOntologies(petite)[0]!.reservationId).toBeNull();
    const basse = lot(e, [{ type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.7, 0.8, 0.6), trous: [], hoteId: "w", z: 0.2, hauteur: m(0.4), statut: "accordee" } }]).etat;
    expect(collisionsOntologies(basse)[0]!.reservationId).toBeNull();
    // Relecture Codex #99 : une réservation accordée pour un autre hôte (ou un autre réseau) n'exempte pas cette paire.
    const autreHote = lot(e, [{ type: "mur.tracer", params: { id: "w2", niveauId: "n1", a: pt(-1, 5), b: pt(5, 5), epaisseur: m(0.2), hauteur: m(3) } }, { type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.7, 0.8, 0.6), trous: [], hoteId: "w2", z: 1.3, hauteur: m(0.4), statut: "accordee" } }]).etat;
    expect(collisionsOntologies(autreHote)[0]!.reservationId).toBeNull();
    const autreReseau = lot(e, [{ type: "segmentReseau.creer", params: { id: "g2", niveauId: "n1", systeme: "gaine", sommets: [P3(20, 0, 2.5), P3(24, 0, 2.5)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.3) } } }, { type: "reservation.creer", params: { id: "rv", niveauId: "n1", contour: carre(1.7, 0.8, 0.6), trous: [], hoteId: "w", pourId: "g2", z: 1.3, hauteur: m(0.4), statut: "accordee" } }]).etat;
    expect(collisionsOntologies(autreReseau)[0]!.reservationId).toBeNull();
    expect(() => lot(e, [{ type: "reservation.creer", params: { id: "x", niveauId: "n1", contour: carre(0, 0, 1), trous: [], hoteId: "g", hauteur: m(0.4) } }])).toThrow(/hôte/);
  });
  it("contrôles de spécification : segment sans spécification alors qu'une existe pour son système ; fluide contredit", () => {
    const e = lot(scene(), [
      { type: "specification.definir", params: { id: "spec-g", nom: "Gaines galva", systeme: "gaine", materiau: "acier galvanisé" } },
      { type: "segmentReseau.creer", params: { id: "g2", niveauId: "n1", systeme: "gaine", sommets: [P3(10, 0, 2.5), P3(14, 0, 2.5)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.3) }, specificationId: "spec-g", materiau: "PVC" } },
    ]).etat;
    const c = controlesSpecification(e);
    expect(c.map((x) => x.objetId)).toEqual(["g", "g2"]);
    expect(c[0]!.motif).toContain("sans spécification");
    expect(c[1]!.motif).toContain("contredit");
    expect(collisions(e).filter((x) => x.type === "specification")).toHaveLength(2);
  });
});

describe("mécanique P2-6 : cinématique (DA-17-04..06) et inerties (DA-17-10)", () => {
  const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const solideExact = (id: string, nom: string, dx = 1, dy = 1, dz = 1) => ({ type: "solideExact.creer", params: { id, niveauId: "n1", nom, brep: "QlJFUA==", moteur: "occt-wasm", versionMoteur: "5.6.1", empreinteBrep: "0123456789abcdef", maillage: { positions: P.map((v, i) => v * [dx, dy, dz][i % 3]!), indices: I }, volume: dx * dy * dz, aire: 2 * (dx * dy + dy * dz + dx * dz), faces: 6, operation: { type: "extrusion", sources: [], libelle: nom } } });
  const mecanisme = () => lot(base(), [
    solideExact("se-socle", "Socle", 2, 1, 0.2), solideExact("se-bras", "Bras", 3, 0.2, 0.2),
    { type: "ontologie.activer", params: { nom: "mechanical" } },
    { type: "assemblage.creer", params: { id: "a1", niveauId: "n1", nom: "Potence", position: pt(5, 5) } },
    { type: "pieceMecanique.creer", params: { id: "p-socle", sourceId: "se-socle", assemblageId: "a1", fixe: true } },
    { type: "pieceMecanique.creer", params: { id: "p-bras", sourceId: "se-bras", assemblageId: "a1", pose: { x: 0, y: 0, z: 0.2 } } },
    { type: "liaison.creer", params: { id: "l-pivot", type: "pivot", a: "p-socle", b: "p-bras", pa: { x: 0, y: 0, z: 0.2 }, da: { x: 0, y: 0, z: 1 }, ea: { x: 1, y: 0, z: 0 }, pb: { x: 0, y: 0, z: 0 }, db: { x: 0, y: 0, z: 1 }, eb: { x: 1, y: 0, z: 0 }, valeur: 0 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n1", a: pt(7.5, 3), b: pt(7.5, 8), epaisseur: m(0.2), hauteur: m(3) } },
  ]).etat;
  it("trajectoire d'un pivot 0° → 90° en 7 pas : poses dérivées, modèle intact, obstacle (mur) relevé au premier pas qui bute", () => {
    const e = mecanisme();
    const t = trajectoire(e, "l-pivot", 0, 90, 7, { collisions: true });
    expect(t.unite).toBe("deg");
    expect(t.pas.length).toBe(7);
    expect(t.echecs).toEqual([]);
    expect(t.pas.map((p) => p.valeur)).toEqual([0, 15, 30, 45, 60, 75, 90]);
    expect(t.pas[0]!.poses["p-bras"]).toBeDefined();
    expect(t.pas[6]!.poses["p-bras"]!.rz).toBeCloseTo(Math.PI / 2, 4);
    expect(t.pas[4]!.poses["p-bras"]!.rz).toBeCloseTo(Math.PI / 3, 4);
    // Le bras de 3 m part de (5, 5) vers +x : à 0° il traverse le mur en x = 7,5 ; tourné de 90° il pointe vers +y et le quitte.
    expect(t.pas[0]!.collisions.some((c) => c.objets.includes("w"))).toBe(true);
    expect(t.pas[6]!.collisions.some((c) => c.objets.includes("w"))).toBe(false);
    expect(premierObstacle(t)).toEqual({ indice: 0, valeur: 0, objets: expect.arrayContaining(["w"]) });
    expect(O<"liaison">(e, "l-pivot").params.valeur).toBe(0); // rien n'est écrit
    expect(() => trajectoire(e, "p-socle", 0, 1, 3)).toThrow(/liaison/);
  });
  it("inerties : volume et tenseur géométrique toujours ; masse seulement avec une masse volumique sourcée ; assemblage par Huygens", () => {
    const e = mecanisme();
    const sansMasse = inertiePiece(e, O<"piece-mecanique">(e, "p-socle"));
    expect(sansMasse.volume).toBeCloseTo(0.4, 9);
    expect(sansMasse.masse).toBeNull();
    expect(sansMasse.inertie).toBeNull();
    expect(inertieAssemblage(e, "a1").masse).toBeNull();
    expect(inertieAssemblage(e, "a1").nonEvaluees).toEqual(["p-bras", "p-socle"]);
    expect(() => lot(e, [{ type: "pieceMecanique.modifier", params: { id: "p-socle", params: { masseVolumique: { valeur: 7850 } } } }])).toThrow(/source/);
    const e1 = lot(e, [
      { type: "pieceMecanique.modifier", params: { id: "p-socle", params: { masseVolumique: { valeur: 7850, source: "fiche matière fournisseur (déclarée)" } } } },
      { type: "pieceMecanique.modifier", params: { id: "p-bras", params: { masseVolumique: { valeur: 7850, source: "fiche matière fournisseur (déclarée)" } } } },
    ]).etat;
    const socle = inertiePiece(e1, O<"piece-mecanique">(e1, "p-socle"));
    expect(socle.masse).toBeCloseTo(0.4 * 7850, 6);
    expect(socle.inertie![8]).toBeCloseTo((socle.masse! * (2 * 2 + 1 * 1)) / 12, 3);
    const a = inertieAssemblage(e1, "a1");
    expect(a.masse).toBeCloseTo((0.4 + 0.12) * 7850, 6);
    expect(a.nonEvaluees).toEqual([]);
    expect(a.centreDeMasse![2]).toBeGreaterThan(0.1);
    const bras = inertiePiece(e1, O<"piece-mecanique">(e1, "p-bras"));
    expect(a.inertie![0]).toBeGreaterThan(socle.inertie![0]! + bras.inertie![0]! - 1e-9);
  });
});
