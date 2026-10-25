import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { exportStudioIfc } from "../ifc.js";
import { studioMesh3d } from "../mesh-3d.js";
import { createStudioHistory, recordStudioHistory, undoStudioHistory, redoStudioHistory } from "../history.js";
import { projectionsAInvalider } from "../projections.js";
import { comparerDocumentsStudio } from "../comparaison.js";
import { studioAngularFromSegments } from "../objets/cote-angulaire.js";
import {
  couperStudio, studioLienSolide, studioProfilDepuisPolyligne, studioQuantitesSolides, studioVolumeSolide, type StudioBox, type StudioProfilePrism, type StudioSolid,
} from "../solides-libres.js";

/**
 * Lot F1 — géométrie 3D de Studio : direction d'extrusion (TEST-005, A.4-07), profil source lié et relations explicites
 * (TEST-006, A.4-02, TR-EX-006), édition des faces des solides libres (TEST-002, A.3-03, TR-EX-005), division d'une
 * face cotée (TEST-007).
 */

const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};
const appliquer = (d: StudioDocument, ...cs: unknown[]) => applyStudioCommands(d, cs as StudioCommand[]);
const sol = (d: StudioDocument, id: string): StudioSolid => d.solides!.find((s) => s.id === id)!;
const boite = (over: Partial<StudioBox> = {}): StudioBox => ({ id: "b1", type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3, ...over });
const carre: StudioProfilePrism["profile"] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
const prisme = (over: Partial<StudioProfilePrism> = {}): StudioProfilePrism => ({ id: "p1", type: "prism", placement: { origin: { x: 10, y: 0, z: 0 }, rotation: 0 }, profile: carre, height: 2, ...over });

/** Polyligne fermée 4 × 3 et un prisme sur son profil, dans la relation demandée. */
function avecSource(relation: "associe" | "reference-liee" | "copie-independante"): StudioDocument {
  const d = appliquer(newStudioDocument("f1"), { toolId: "studio.dessin.polyligne", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], closed: true } });
  const derive = studioProfilDepuisPolyligne(d.objects[0])!;
  return appliquer(d, { toolId: "studio.solide.prisme", params: { id: "S", type: "prism", placement: { origin: { ...derive.origin, z: 0 }, rotation: 0 }, profile: derive.profile, height: 3, direction: { x: 0, y: 0, z: 1 }, source: { objectId: "P", relation } } });
}
const modifierPoly = (d: StudioDocument, points: { x: number; y: number }[], closed = true) =>
  appliquer(d, { toolId: "studio.dessin.modifier", params: { id: "P", type: "polyline", points, closed } });
const AGRANDIE = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }];

describe("TEST-005 / A.4-07 — direction d'extrusion explicite", () => {
  const rectangle = () => appliquer(newStudioDocument("e"), { toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 1 } });

  it("extrusion 2D vers le bas (-z) : volume de base − hauteur à base, direction enregistrée et relue, +z inchangé", () => {
    const bas = appliquer(rectangle(), { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 3, height: 2, direction: "-z" } });
    expect(bas.objects[0]!.extrusion).toEqual({ base: 3, height: 2, direction: "-z" });
    const zs = studioMesh3d(bas).solids[0]!.vertices.map((v) => v.z);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([1, 3]);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(bas)))).toEqual(bas);
    const haut = appliquer(rectangle(), { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 3, height: 2, direction: "+z" } });
    const zh = studioMesh3d(haut).solids[0]!.vertices.map((v) => v.z);
    expect([Math.min(...zh), Math.max(...zh)]).toEqual([3, 5]);
    // Sans direction (documents antérieurs) : +z, comme avant.
    const ancien = appliquer(rectangle(), { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 3, height: 2 } });
    expect(studioMesh3d(ancien).solids[0]!.vertices).toEqual(studioMesh3d(haut).solids[0]!.vertices);
    // Le changement de direction est une modification de l'extrusion (comparaison des variantes).
    expect(JSON.stringify(comparerDocumentsStudio(haut, bas))).toContain("extrusion");
  });

  it("direction d'extrusion 2D validée : seules +z et -z, jamais une valeur inventée", () => {
    expect(refus(() => appliquer(rectangle(), { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 0, height: 2, direction: "x" } }))).toContain("direction d’extrusion « +z » ou « -z » attendue");
    expect(refus(() => appliquer(rectangle(), { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 0, height: 2, direction: null } }))).toContain("direction");
  });

  it("IFC : un volume -z est écrit depuis sa cote inférieure, la direction et la base déclarée restent dans le jeu de propriétés", () => {
    const bas = appliquer(rectangle(), { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 3, height: 2, direction: "-z" } });
    const ifc = exportStudioIfc(bas, { studyName: "E", variantName: "V", timestamp: "2026-10-25T00:00:00Z" });
    expect(ifc).toContain("IFCCARTESIANPOINT((0.,0.,1.))");
    expect(ifc).toContain("'Direction',$,IFCLABEL('-z')");
    expect(ifc).toContain("'Base',$,IFCLENGTHMEASURE(3.)");
  });

  it("prisme : direction saisie validée (non nulle, hors du plan du profil), portée par le maillage, les quantités et la coupe", () => {
    expect(refus(() => appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme({ direction: { x: 0, y: 0, z: 0 } }) }))).toContain("direction nulle");
    expect(refus(() => appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme({ direction: { x: 1, y: 0, z: 0 } }) }))).toContain("direction dans le plan du profil");
    // Vers le bas : même volume, cotes 0 à −2.
    const bas = appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme({ direction: { x: 0, y: 0, z: -1 } }) });
    const zs = studioMesh3d(bas).freeSolids![0]!.vertices.map((v) => v.z);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([-2, 0]);
    expect(studioQuantitesSolides(bas).items[0]!.volume).toBe(8);
    expect(couperStudio(bas, { z: -1 }).segments).toHaveLength(4);
    expect(couperStudio(bas, { z: 1 }).segments).toHaveLength(0);
    // Oblique (3, 0, 4) : longueur 5 le long de la direction, hauteur perpendiculaire 4, face d'arrivée translatée de 3 en x.
    const oblique = appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme({ height: 5, direction: { x: 3, y: 0, z: 4 } }) });
    expect(sol(oblique, "p1")).toMatchObject({ height: 5, direction: { x: 3, y: 0, z: 4 } });
    expect(studioVolumeSolide(sol(oblique, "p1"))).toBeCloseTo(16, 12);
    const m = studioMesh3d(oblique).freeSolids![0]!;
    const haut = m.vertices.filter((v) => v.z === 4);
    expect(haut).toHaveLength(4);
    expect(Math.min(...haut.map((v) => v.x))).toBeCloseTo(13, 12);
    const coupe = couperStudio(oblique, { z: 2 });
    expect(Math.min(...coupe.segments.map((s) => s.start.x))).toBeCloseTo(11.5, 12);
    // IFC : extrusion selon la direction unitaire, dans le repère local du solide.
    expect(exportStudioIfc(oblique, { studyName: "E", variantName: "V", timestamp: "2026-10-25T00:00:00Z" })).toContain("IFCDIRECTION((0.6,0.,0.8))");
  });

  it("une symétrie réfléchit la direction comme le profil ; un prisme sans direction garde son maillage d'avant", () => {
    const d = appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme({ direction: { x: 0, y: 1, z: 1 } }) });
    const m = appliquer(d, { toolId: "studio.dessin.symetrie", params: { ids: ["p1"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 }, keepSource: false } });
    expect((sol(m, "p1") as StudioProfilePrism).direction).toEqual({ x: 0, y: -1, z: 1 });
    const sans = appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme() });
    const avec = appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme({ direction: { x: 0, y: 0, z: 1 } }) });
    expect(studioMesh3d(avec).freeSolids![0]!.vertices).toEqual(studioMesh3d(sans).freeSolids![0]!.vertices);
  });
});

describe("TEST-006 / A.4-02 / TR-EX-006 — profil source lié, relations explicites", () => {
  it("référence liée : modifier la polyligne recalcule le prisme dans le même lot (volume relu, jamais l'ancien)", () => {
    const d = avecSource("reference-liee");
    expect(studioLienSolide(d, sol(d, "S"))).toEqual({ objectId: "P", relation: "reference-liee", etat: "a-jour" });
    expect(studioQuantitesSolides(d).items[0]!.volume).toBe(36);
    const m = modifierPoly(d, AGRANDIE);
    expect((sol(m, "S") as StudioProfilePrism).profile).toEqual(AGRANDIE);
    expect(studioLienSolide(m, sol(m, "S"))!.etat).toBe("a-jour");
    expect(studioQuantitesSolides(m).items[0]!.volume).toBe(45);
    // Déplacer la source déplace l'emprise du prisme (origine au premier sommet), sa cote et sa hauteur restent.
    const deplace = appliquer(m, { toolId: "studio.dessin.deplacer", params: { id: "P", dx: 1, dy: 2 } });
    expect(sol(deplace, "S").placement).toEqual({ origin: { x: 1, y: 2, z: 0 }, rotation: 0 });
    // Les morceaux de maillage du prisme sont invalidés avec sa source.
    expect(projectionsAInvalider(d, m).ids).toEqual(["P", "S"]);
  });

  it("référence liée : source supprimée ou devenue invalide → « à résoudre », quantités non évaluées, dernière géométrie gardée", () => {
    const d = avecSource("reference-liee");
    const sansSource = appliquer(d, { toolId: "studio.dessin.supprimer", params: { ids: ["P"] } });
    expect(studioLienSolide(sansSource, sol(sansSource, "S"))).toEqual({ objectId: "P", relation: "reference-liee", etat: "a-resoudre", motif: "source-absente" });
    expect(sol(sansSource, "S")).toEqual(sol(d, "S"));
    const q = studioQuantitesSolides(sansSource);
    expect(q.items[0]).toMatchObject({ footprint: null, volume: null });
    expect(q.totalVolume).toBeNull();
    expect(studioMesh3d(sansSource).freeSolids![0]!.lien).toMatchObject({ etat: "a-resoudre", motif: "source-absente" });
    expect(exportStudioIfc(sansSource, { studyName: "E", variantName: "V", timestamp: "2026-10-25T00:00:00Z" })).toContain("(source-absente)");
    // Polyligne rouverte : invalide comme profil ; refermée, le prisme la suit à nouveau.
    const ouverte = modifierPoly(d, AGRANDIE, false);
    expect(studioLienSolide(ouverte, sol(ouverte, "S"))).toMatchObject({ etat: "a-resoudre", motif: "source-invalide" });
    const refermee = modifierPoly(ouverte, AGRANDIE);
    expect(studioLienSolide(refermee, sol(refermee, "S"))!.etat).toBe("a-jour");
    expect((sol(refermee, "S") as StudioProfilePrism).profile).toEqual(AGRANDIE);
    // Annuler (historique des lots) rend exactement le document d'avant.
    const h = redoStudioHistory(undoStudioHistory(recordStudioHistory(createStudioHistory(d), sansSource)));
    expect(undoStudioHistory(h).present).toEqual(d);
    expect(h.present).toEqual(sansSource);
  });

  it("associé : le lien est contrôlé mais rien n'est recalculé seul ; mise à jour ou détachement explicites", () => {
    const d = avecSource("associe");
    const m = modifierPoly(d, AGRANDIE);
    expect(sol(m, "S")).toEqual(sol(d, "S"));
    expect(studioLienSolide(m, sol(m, "S"))).toMatchObject({ relation: "associe", etat: "a-resoudre", motif: "source-modifiee" });
    expect(studioQuantitesSolides(m).items[0]!.volume).toBeNull();
    expect(projectionsAInvalider(d, m).ids).toEqual(["P", "S"]);
    const ajour = appliquer(m, { toolId: "studio.solide.resoudre", params: { id: "S", action: "mettre-a-jour" } });
    expect((sol(ajour, "S") as StudioProfilePrism).profile).toEqual(AGRANDIE);
    expect(studioLienSolide(ajour, sol(ajour, "S"))!.etat).toBe("a-jour");
    expect(refus(() => appliquer(ajour, { toolId: "studio.solide.resoudre", params: { id: "S", action: "mettre-a-jour" } }))).toContain("lien déjà à jour");
    const detache = appliquer(m, { toolId: "studio.solide.resoudre", params: { id: "S", action: "detacher" } });
    expect((sol(detache, "S") as StudioProfilePrism).source).toEqual({ objectId: "P", relation: "copie-independante" });
    expect(studioLienSolide(detache, sol(detache, "S"))!.etat).toBe("independant");
    expect(studioQuantitesSolides(detache).items[0]!.volume).toBe(36);
    expect(refus(() => appliquer(detache, { toolId: "studio.solide.resoudre", params: { id: "S", action: "detacher" } }))).toContain("copie indépendante");
    expect(refus(() => appliquer(m, { toolId: "studio.solide.resoudre", params: { id: "S", action: "ignorer" } }))).toContain("action");
  });

  it("copie indépendante : aucune propagation, la source n'est qu'une provenance", () => {
    const d = avecSource("copie-independante");
    const m = modifierPoly(d, AGRANDIE);
    expect(sol(m, "S")).toEqual(sol(d, "S"));
    expect(studioLienSolide(m, sol(m, "S"))).toEqual({ objectId: "P", relation: "copie-independante", etat: "independant" });
    expect(studioQuantitesSolides(m).items[0]!.volume).toBe(36);
    expect(projectionsAInvalider(d, m).ids).toEqual(["P"]);
  });

  it("refus : relation inconnue, profil différent de la source, emprise liée modifiée seule (déplacer, pivoter, symétrie, rotation saisie)", () => {
    const d = appliquer(newStudioDocument("f1"), { toolId: "studio.dessin.polyligne", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], closed: true } });
    const p = studioProfilDepuisPolyligne(d.objects[0])!;
    const base = { id: "S", type: "prism", placement: { origin: { ...p.origin, z: 0 }, rotation: 0 }, profile: p.profile, height: 1 };
    expect(refus(() => appliquer(d, { toolId: "studio.solide.prisme", params: { ...base, source: { objectId: "P", relation: "lie" } } }))).toContain("relation");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.prisme", params: { ...base, profile: carre, source: { objectId: "P", relation: "reference-liee" } } }))).toContain("profil différent de celui de la polyligne source");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.prisme", params: { ...base, source: { objectId: "absente", relation: "reference-liee" } } }))).toContain("source absente ou invalide");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.prisme", params: { ...base, placement: { origin: { ...p.origin, z: 0 }, rotation: 1 }, source: { objectId: "P", relation: "reference-liee" } } }))).toContain("rotation nulle");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.prisme", params: { ...base, placement: { origin: { x: 9, y: 9, z: 0 }, rotation: 0 }, source: { objectId: "P", relation: "associe" } } }))).toContain("l’emprise d’un prisme lié suit sa polyligne source");
    const lie = appliquer(d, { toolId: "studio.solide.prisme", params: { ...base, source: { objectId: "P", relation: "reference-liee" } } });
    expect(refus(() => appliquer(lie, { toolId: "studio.solide.deplacer", params: { id: "S", dx: 1, dy: 0, dz: 0 } }))).toContain("seul dz le déplace");
    expect(sol(appliquer(lie, { toolId: "studio.solide.deplacer", params: { id: "S", dx: 0, dy: 0, dz: 2 } }), "S").placement.origin.z).toBe(2);
    expect(refus(() => appliquer(lie, { toolId: "studio.solide.pivoter", params: { id: "S", angle: 0.5 } }))).toContain("il ne pivote pas seul");
    expect(refus(() => appliquer(lie, { toolId: "studio.dessin.symetrie", params: { ids: ["S"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 }, keepSource: false } }))).toContain("l’emprise d’un prisme lié suit sa polyligne source");
    // Un prisme sans source n'a pas de lien à résoudre.
    const libre = appliquer(newStudioDocument("e"), { toolId: "studio.solide.prisme", params: prisme() });
    expect(refus(() => appliquer(libre, { toolId: "studio.solide.resoudre", params: { id: "p1", action: "detacher" } }))).toContain("pas de profil source");
    expect(studioLienSolide(libre, sol(libre, "p1"))).toBeNull();
  });
});

describe("TEST-002 / A.3-03 / TR-EX-005 — édition des faces des solides libres", () => {
  const avecBoite = () => appliquer(newStudioDocument("f"), { toolId: "studio.solide.boite", params: boite() });

  it("pousser / tirer le sommet et la base d'une boîte : hauteur et cote recalculées, identité stable, volume relu", () => {
    const d = avecBoite();
    const haut = appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: 1 } });
    expect(sol(haut, "b1")).toEqual(boite({ height: 4 }));
    expect(studioQuantitesSolides(haut).items[0]!.volume).toBe(8);
    const bas = appliquer(haut, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "base", distance: 0.5 } });
    expect(sol(bas, "b1")).toEqual(boite({ height: 4.5, placement: { origin: { x: 1, y: 1, z: -0.5 }, rotation: 0 } }));
    const tire = appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: -1 } });
    expect((sol(tire, "b1") as StudioBox).height).toBe(2);
    expect(refus(() => appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: -3 } }))).toContain("franchirait la face opposée");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: 0 } }))).toContain("distance non nulle");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "dessus", distance: 1 } }))).toContain("face « base », « sommet » ou « lateral-i » attendue");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-4", distance: 1 } }))).toContain("face latérale 4 inexistante");
    expect(refus(() => appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "zz", face: "sommet", distance: 1 } }))).toContain("solide introuvable");
  });

  it("faces latérales d'une boîte (x−, y−, x+, y+) : largeur ou profondeur, origine reculée pour x− et y−, rotation suivie", () => {
    const d = avecBoite();
    expect(sol(appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-3", distance: 1 } }), "b1")).toEqual(boite({ width: 3, placement: { origin: { x: 0, y: 1, z: 0 }, rotation: 0 } }));
    expect(sol(appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-0", distance: 1 } }), "b1")).toEqual(boite({ depth: 2, placement: { origin: { x: 1, y: 0, z: 0 }, rotation: 0 } }));
    expect(sol(appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-1", distance: 0.5 } }), "b1")).toEqual(boite({ width: 2.5 }));
    expect(sol(appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-2", distance: 0.5 } }), "b1")).toEqual(boite({ depth: 1.5 }));
    const tournee = appliquer(newStudioDocument("f"), { toolId: "studio.solide.boite", params: boite({ placement: { origin: { x: 0, y: 0, z: 0 }, rotation: Math.PI / 2 } }) });
    const o = sol(appliquer(tournee, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-3", distance: 1 } }), "b1").placement.origin;
    expect(o.x).toBeCloseTo(0, 12);
    expect(o.y).toBeCloseTo(-1, 12);
  });

  it("face latérale d'un prisme droit : arête décalée, voisines prolongées ; oblique et prisme lié refusés", () => {
    const d = appliquer(newStudioDocument("f"), { toolId: "studio.solide.prisme", params: prisme() });
    const m = appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "lateral-1", distance: 1 } });
    expect((sol(m, "p1") as StudioProfilePrism).profile).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }]);
    expect(studioQuantitesSolides(m).items[0]!.volume).toBe(12);
    // Vers l'intérieur au-delà de la face opposée (x = 0) : refusé, même si le profil final serait simple ; à plat aussi.
    for (const distance of [-3, -2]) {
      expect(refus(() => appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "lateral-1", distance } }))).toContain("franchirait la face opposée");
    }
    expect((sol(appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "lateral-1", distance: -1.5 } }), "p1") as StudioProfilePrism).profile[1]).toEqual({ x: 0.5, y: 0 });
    // Trapèze : les sommets décalés glissent sur les arêtes voisines prolongées.
    const t = appliquer(newStudioDocument("f"), { toolId: "studio.solide.prisme", params: prisme({ profile: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 }] }) });
    const tt = appliquer(t, { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "lateral-2", distance: 1 } });
    expect((sol(tt, "p1") as StudioProfilePrism).profile).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2.5, y: 3 }, { x: 1.5, y: 3 }]);
    const oblique = appliquer(newStudioDocument("f"), { toolId: "studio.solide.prisme", params: prisme({ direction: { x: 1, y: 0, z: 1 } }) });
    expect(refus(() => appliquer(oblique, { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "lateral-0", distance: 1 } }))).toContain("prisme oblique");
    // Sommet d'un oblique : distance mesurée selon la normale, longueur + d / |uz|.
    const so = appliquer(oblique, { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "sommet", distance: 1 } });
    expect((sol(so, "p1") as StudioProfilePrism).height).toBeCloseTo(2 + Math.SQRT2, 12);
    const lie = avecSource("reference-liee");
    expect(refus(() => appliquer(lie, { toolId: "studio.solide.face-decaler", params: { id: "S", face: "lateral-0", distance: 1 } }))).toContain("le profil d’un prisme lié suit sa polyligne source");
    expect((sol(appliquer(lie, { toolId: "studio.solide.face-decaler", params: { id: "S", face: "sommet", distance: 1 } }), "S") as StudioProfilePrism).height).toBe(4);
  });

  it("pivoter autour de l'axe vertical de l'origine ; un calque verrouillé refuse ; annuler / rétablir par l'historique", () => {
    const d = avecBoite();
    const p = appliquer(d, { toolId: "studio.solide.pivoter", params: { id: "b1", angle: -Math.PI / 2 } });
    expect(sol(p, "b1").placement.rotation).toBeCloseTo(1.5 * Math.PI, 12);
    expect(refus(() => appliquer(d, { toolId: "studio.solide.pivoter", params: { id: "b1", angle: 0 } }))).toContain("angle non nul");
    const h1 = recordStudioHistory(createStudioHistory(d), p);
    expect(undoStudioHistory(h1).present).toEqual(d);
    const verrou = appliquer(newStudioDocument("f"),
      { toolId: "studio.calque.creer", params: { id: "v", name: "V", visible: true, locked: false } },
      { toolId: "studio.solide.boite", params: boite({ layerId: "v" }) },
      { toolId: "studio.calque.modifier", params: { id: "v", name: "V", visible: true, locked: true } });
    expect(refus(() => appliquer(verrou, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: 1 } }))).toContain("calque verrouillé");
  });
});

describe("TEST-007 — division d'une face cotée", () => {
  it("face latérale d'une boîte : elle devient un prisme de même identité, même placement, même volume", () => {
    const d = appliquer(newStudioDocument("f"), { toolId: "studio.solide.boite", params: boite() });
    const m = appliquer(d, { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 0.5 } });
    expect(sol(m, "b1")).toEqual({ id: "b1", type: "prism", placement: boite().placement, profile: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], height: 3 });
    expect(studioQuantitesSolides(m).items[0]!.volume).toBe(6);
    // Faces renumérotées : x+ est devenue lateral-2 et se pousse seule ; une moitié de la face divisée, voisine colinéaire
    // de l'autre, n'a pas de décalage déterminé (refus explicite, jamais d'approximation).
    const pousse = appliquer(m, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-2", distance: 1 } });
    expect((sol(pousse, "b1") as StudioProfilePrism).profile).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 0, y: 1 }]);
    expect(refus(() => appliquer(m, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-1", distance: 1 } }))).toContain("arête voisine parallèle");
    expect(refus(() => appliquer(m, { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "sommet", distance: 1 } }))).toContain("seule une face latérale se divise");
    expect(refus(() => appliquer(m, { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 0.5 } }))).toContain("distance strictement comprise");
    expect(sol(pousse, "b1").type).toBe("prism");
    // Aucune cote ne peut viser un solide libre : rien n'y est à réattacher.
    expect(refus(() => appliquer(m, { toolId: "studio.dessin.cote", params: { id: "c", type: "dimension", start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, offset: 0, links: { start: { objectId: "b1", anchor: "vertex-0" }, end: null }, toResolve: false } }))).toContain("objet lié introuvable");
  });

  /** Polyligne 4 × 3 (segments 0 bas, 1 droite, 2 haut, 3 gauche), prisme en référence liée et cotes rattachées. */
  function coteeLiee(): StudioDocument {
    const d = avecSource("reference-liee");
    const poly = d.objects[0]!;
    const seg = (i: number) => {
      const p = (poly as { points: { x: number; y: number }[] }).points;
      return { a: p[i]!, b: p[(i + 1) % 4]! };
    };
    const ang = (id: string, i: number, j: number) => ({ toolId: "studio.dessin.cote-angulaire", params: { id, type: "angular-dimension", ...studioAngularFromSegments(seg(i), seg(j))!, radius: 0.5, links: { first: { objectId: "P", segment: i }, second: { objectId: "P", segment: j } }, toResolve: false } });
    const cote = (id: string, a: string, pa: { x: number; y: number }, b: string, pb: { x: number; y: number }) =>
      ({ toolId: "studio.dessin.cote", params: { id, type: "dimension", start: pa, end: pb, offset: 0.3, links: { start: { objectId: "P", anchor: a }, end: { objectId: "P", anchor: b } }, toResolve: false } });
    return appliquer(d,
      cote("cv", "vertex-2", { x: 4, y: 3 }, "vertex-3", { x: 0, y: 3 }),
      cote("cm", "mid-1", { x: 4, y: 1.5 }, "vertex-0", { x: 0, y: 0 }),
      cote("cmm", "mid-2", { x: 2, y: 3 }, "mid-0", { x: 2, y: 0 }),
      ang("a12", 1, 2), ang("a23", 2, 3));
  }
  const cote = (d: StudioDocument, id: string) => d.dimensions!.find((x) => x.id === id)!;
  const angulaire = (d: StudioDocument, id: string) => d.annotations!.find((x) => x.id === id)! as Extract<NonNullable<StudioDocument["annotations"]>[number], { type: "angular-dimension" }>;

  it("prisme en référence liée : l'arête de la source est divisée ; cotes réattachées de façon prouvée, mid du segment divisé réattaché au nouveau sommet qui le recouvre exactement", () => {
    const d = coteeLiee();
    const m = appliquer(d, { toolId: "studio.solide.face-diviser", params: { id: "S", face: "lateral-1", distance: 1.5 } });
    expect((m.objects[0] as { points: unknown }).points).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1.5 }, { x: 4, y: 3 }, { x: 0, y: 3 }]);
    expect((sol(m, "S") as StudioProfilePrism).profile).toHaveLength(5);
    expect(studioLienSolide(m, sol(m, "S"))!.etat).toBe("a-jour");
    expect(studioQuantitesSolides(m).items[0]!.volume).toBe(36);
    expect(cote(m, "cv")).toMatchObject({ links: { start: { objectId: "P", anchor: "vertex-3" }, end: { objectId: "P", anchor: "vertex-4" } }, toResolve: false, start: { x: 4, y: 3 }, end: { x: 0, y: 3 } });
    expect(cote(m, "cm")).toMatchObject({ links: { start: { objectId: "P", anchor: "vertex-2" }, end: { objectId: "P", anchor: "vertex-0" } }, toResolve: false });
    expect(cote(m, "cmm")).toMatchObject({ links: { start: { objectId: "P", anchor: "mid-3" }, end: { objectId: "P", anchor: "mid-0" } }, toResolve: false });
    expect(angulaire(m, "a23")).toMatchObject({ links: { first: { objectId: "P", segment: 3 }, second: { objectId: "P", segment: 4 } }, toResolve: false });
    // Cote angulaire liée au segment divisé : rompue, « à résoudre », jamais rattachée à une moitié par approximation.
    expect(angulaire(m, "a12")).toMatchObject({ links: { first: null, second: { objectId: "P", segment: 3 } }, toResolve: true });
    expect(validateStudioDocument(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it("division hors du milieu : la cote du milieu divisé passe « à résoudre » (valeur non évaluée), les autres restent prouvées", () => {
    const m = appliquer(coteeLiee(), { toolId: "studio.solide.face-diviser", params: { id: "S", face: "lateral-1", distance: 1 } });
    expect(cote(m, "cm")).toMatchObject({ links: { start: null, end: { objectId: "P", anchor: "vertex-0" } }, toResolve: true, start: { x: 4, y: 1.5 } });
    expect(cote(m, "cv").toResolve).toBe(false);
    // Associé : refusé (sa source ne se modifie pas depuis lui) ; source courbe : refus explicite.
    expect(refus(() => appliquer(avecSource("associe"), { toolId: "studio.solide.face-diviser", params: { id: "S", face: "lateral-1", distance: 1 } }))).toContain("prisme associé");
    const d = appliquer(newStudioDocument("c"), { toolId: "studio.dessin.polyligne", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], closed: true, bulges: [0.2, 0, 0, 0] } });
    const p = studioProfilDepuisPolyligne(d.objects[0])!;
    const courbe = appliquer(d, { toolId: "studio.solide.prisme", params: { id: "S", type: "prism", placement: { origin: { ...p.origin, z: 0 }, rotation: 0 }, profile: p.profile, height: 1, source: { objectId: "P", relation: "reference-liee" } } });
    expect(refus(() => appliquer(courbe, { toolId: "studio.solide.face-diviser", params: { id: "S", face: "lateral-1", distance: 1 } }))).toContain("segments courbes");
  });
});
