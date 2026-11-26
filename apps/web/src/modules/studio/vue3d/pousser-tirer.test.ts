import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioMesh3d, studioVolumeSolide, type StudioDocument } from "@parcours/atelier-model";
import {
  apercuPousser, centreFace, cleFace, commandePousserTirer, facesPoussables, inferer, lireDistanceSaisie, PAS_POUSSER, positionSurNormale, toucherFace,
  type FacePoussable,
} from "./pousser-tirer";

const doc = (): StudioDocument => ({
  ...newStudioDocument("d"),
  layers: [{ id: "verrou", name: "Verrouillé", visible: true, locked: true }],
  objects: [
    { id: "rect", type: "rectangle", origin: { x: 10, y: 0 }, width: 2, height: 1 },
    { id: "dalle", type: "rectangle", origin: { x: 20, y: 0 }, width: 2, height: 2, extrusion: { base: 0, height: 0.5, direction: "+z" } },
    { id: "trait", type: "line", start: { x: 0, y: 9 }, end: { x: 1, y: 9 } },
    { id: "fige", type: "rectangle", layerId: "verrou", origin: { x: 30, y: 0 }, width: 1, height: 1 },
  ],
  solides: [
    { id: "boite", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 1 },
    { id: "haute", type: "box", placement: { origin: { x: 4, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 3 },
    { id: "oblique", type: "prism", placement: { origin: { x: 40, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 1, direction: { x: 0.5, y: 0, z: 1 } },
  ],
});
const faces = (d = doc()) => facesPoussables(d, studioMesh3d(d));
const face = (fs: readonly FacePoussable[], cle: string) => { const f = fs.find((x) => cleFace(x.cible) === cle); if (!f) throw new Error(cle); return f; };
const appliquer = (d: StudioDocument, f: FacePoussable, dist: number) => {
  const r = commandePousserTirer(d, f, dist);
  if (!("commandes" in r)) throw new Error(r.erreur);
  return applyStudioCommands(d, r.commandes);
};

describe("Planche 3D : pousser / tirer interactif (geste à la SketchUp)", () => {
  it("faces saisissables : solides libres, faces haute et basse des objets extrudés, contours fermés à plat ; ni ligne, ni calque verrouillé", () => {
    const cles = faces().map((f) => cleFace(f.cible));
    expect(cles).toEqual(expect.arrayContaining(["solide:boite:sommet", "solide:boite:base", "solide:boite:lateral-0", "objet:dalle:haut", "objet:dalle:bas", "contour:rect"]));
    expect(cles.some((c) => c.includes("trait") || c.includes("fige"))).toBe(false);
    // Normales sortantes : sommet +z, base −z, face latérale 0 de la boîte (arête y = 0) vers −y.
    const fs = faces();
    expect(face(fs, "solide:boite:sommet").normale).toEqual({ x: 0, y: 0, z: 1 });
    expect(face(fs, "solide:boite:base").normale.z).toBe(-1);
    expect(face(fs, "solide:boite:lateral-0").normale).toMatchObject({ y: -1 });
    // Une face que le modèle refuserait d'avance porte son motif (face latérale d'un prisme oblique).
    expect(face(fs, "solide:oblique:lateral-0").refus).toMatch(/oblique/);
    expect(commandePousserTirer(doc(), face(fs, "solide:oblique:lateral-0"), 1)).toHaveProperty("erreur");
  });

  it("le rayon du pointeur désigne la face la plus proche ; glisser le long de la normale donne la distance signée", () => {
    const fs = faces();
    // Vu d'au-dessus de la boîte : le sommet est touché avant la base.
    const t = toucherFace(fs, { origine: { x: 1, y: 0.5, z: 10 }, direction: { x: 0, y: 0, z: -1 } });
    expect(cleFace(t!.face.cible)).toBe("solide:boite:sommet");
    expect(t!.point.z).toBeCloseTo(1, 9);
    // Hors de toute face : rien.
    expect(toucherFace(fs, { origine: { x: 100, y: 100, z: 10 }, direction: { x: 0, y: 0, z: -1 } })).toBeNull();
    // Rayon horizontal qui passe à z = 1,5 au droit du point (1 ; 0,5 ; 1) : la face a avancé de 0,5 m le long de +z.
    const s = positionSurNormale({ origine: { x: 1, y: -10, z: 1.5 }, direction: { x: 0, y: 1, z: 0 } }, { x: 1, y: 0.5, z: 1 }, { x: 0, y: 0, z: 1 });
    expect(s).toBeCloseTo(0.5, 9);
    // Regard dans l'axe de la normale : position indéterminée (seule la saisie au clavier vaut).
    expect(positionSurNormale({ origine: { x: 1, y: 0.5, z: 10 }, direction: { x: 0, y: 0, z: -1 } }, { x: 1, y: 0.5, z: 1 }, { x: 0, y: 0, z: 1 })).toBeNull();
  });

  it("inférence : accroche au plan d'une face parallèle (sommet de la boîte voisine), au sol, sinon avance au centimètre", () => {
    const fs = faces(), sommet = face(fs, "solide:boite:sommet");
    expect(inferer(sommet, 1.97, fs, 0.05)).toEqual({ distance: 2, reference: "Sur le plan : Sommet (face d’arrivée)" });
    expect(inferer(sommet, 1.234, fs, 0.05)).toEqual({ distance: 1.23, reference: null });
    expect(PAS_POUSSER).toBe(0.01);
    // La face basse d'une dalle posée au-dessus du sol accroche le sol.
    const d = appliquer(doc(), face(fs, "objet:dalle:bas"), -0.3); // dalle de z 0,3 à 0,5
    const bas = face(faces(d), "objet:dalle:bas");
    expect(inferer(bas, 0.28, faces(d), 0.05)).toEqual({ distance: 0.3, reference: "Sur le sol (z = 0)" });
  });

  it("solide : face poussée par studio.solide.face-decaler — tirer le sommet de 0,5 m ajoute 1 m³ ; pousser une face latérale réduit", () => {
    const d0 = doc(), fs = faces(d0);
    const r = commandePousserTirer(d0, face(fs, "solide:boite:sommet"), 0.5);
    expect(r).toEqual({ commandes: [{ toolId: "studio.solide.face-decaler", params: { id: "boite", face: "sommet", distance: 0.5 } }] });
    const d1 = appliquer(d0, face(fs, "solide:boite:sommet"), 0.5);
    expect(studioVolumeSolide(d1.solides!.find((s) => s.id === "boite")!)).toBeCloseTo(3, 9);
    const d2 = appliquer(d1, face(faces(d1), "solide:boite:lateral-1"), -0.5); // face x+ ramenée de 0,5 m
    expect(studioVolumeSolide(d2.solides!.find((s) => s.id === "boite")!)).toBeCloseTo(2.25, 9);
    // L'aperçu est la face translatée de la distance le long de sa normale.
    const a = apercuPousser(face(fs, "solide:boite:sommet"), 0.5);
    expect(a.arrivee.every((p) => p.z === 1.5)).toBe(true);
    expect(centreFace(face(fs, "solide:boite:sommet"))).toEqual({ x: 1, y: 0.5, z: 1 });
  });

  it("contour à plat : tirer vers le haut extrude en +Z, pousser vers le bas en −Z (direction du geste, jamais par défaut)", () => {
    const d0 = doc(), contour = face(faces(d0), "contour:rect");
    expect(commandePousserTirer(d0, contour, 2.5)).toEqual({ commandes: [{ toolId: "studio.objet.extruder", params: { ids: ["rect"], base: 0, height: 2.5, direction: "+z" } }] });
    expect(commandePousserTirer(d0, contour, -1)).toEqual({ commandes: [{ toolId: "studio.objet.extruder", params: { ids: ["rect"], base: 0, height: 1, direction: "-z" } }] });
    const d1 = appliquer(d0, contour, 2.5);
    expect(d1.objects.find((o) => o.id === "rect")!.extrusion).toEqual({ base: 0, height: 2.5, direction: "+z" });
    // Une fois extrudé, le contour devient un objet extrudé : ses faces haute et basse se poussent à leur tour.
    expect(faces(d1).some((f) => cleFace(f.cible) === "objet:rect:haut")).toBe(true);
  });

  it("objet extrudé : face haute ou basse déplacée, direction gardée, refus si la face franchit l'opposée", () => {
    const d0 = doc(), fs = faces(d0);
    const d1 = appliquer(d0, face(fs, "objet:dalle:haut"), 0.25);
    expect(d1.objects.find((o) => o.id === "dalle")!.extrusion).toEqual({ base: 0, height: 0.75, direction: "+z" });
    const d2 = appliquer(d1, face(faces(d1), "objet:dalle:bas"), 0.25);
    expect(d2.objects.find((o) => o.id === "dalle")!.extrusion).toEqual({ base: -0.25, height: 1, direction: "+z" });
    expect(commandePousserTirer(d0, face(fs, "objet:dalle:haut"), -0.5)).toEqual({ erreur: "La face franchirait la face opposée : distance trop grande vers l’intérieur." });
    expect(commandePousserTirer(d0, face(fs, "objet:dalle:haut"), 0)).toHaveProperty("erreur");
  });

  it("saisie au clavier : virgule ou point, signe, unités m / cm / mm ; le reste n'est pas une distance", () => {
    expect(lireDistanceSaisie("1,20")).toBe(1.2);
    expect(lireDistanceSaisie("-0.5")).toBe(-0.5);
    expect(lireDistanceSaisie("120 cm")).toBe(1.2);
    expect(lireDistanceSaisie("15mm")).toBe(0.015);
    expect(lireDistanceSaisie("2m")).toBe(2);
    expect(lireDistanceSaisie(",5")).toBe(0.5);
    for (const t of ["", "abc", "1,2,3", "1 km", "--1"]) expect(lireDistanceSaisie(t), t).toBeNull();
  });
});
