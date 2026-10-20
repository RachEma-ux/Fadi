import { describe, expect, it } from "vitest";
import { ajouterPolygone, ajouterRectangle, grouper, modeleVide, pousserTirer } from "./geometrie-libre.js";
import {
  COULEURS,
  type EntreeInference,
  type GeometrieVisible,
  type ModeAlt,
  geometrieVisible,
  inferer,
  modeAltSuivant,
} from "./inference.js";
import { type Vec3, v3 } from "./vecteur.js";

const vide: GeometrieVisible = { aretes: [], faces: [], centres: [] };

/** Une arête (0,0,0)–(4,0,0) et un carré au sol 4×3 avec sa face. */
const rect: GeometrieVisible = {
  aretes: [
    { id: "a1", a: v3(0, 0, 0), b: v3(4, 0, 0) },
    { id: "a2", a: v3(4, 0, 0), b: v3(4, 3, 0) },
    { id: "a3", a: v3(4, 3, 0), b: v3(0, 3, 0) },
    { id: "a4", a: v3(0, 3, 0), b: v3(0, 0, 0) },
  ],
  faces: [{ id: "f1", exterieur: [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)], trous: [], normale: v3(0, 0, 1) }],
  centres: [],
};

const pt = (point: Vec3, autres: Partial<EntreeInference> = {}): EntreeInference => ({
  point,
  tolerance: 0.1,
  geometrie: rect,
  ...autres,
});

/** Rayon vertical descendant au-dessus de (x, y). */
const rayon = (x: number, y: number, autres: Partial<EntreeInference> = {}): EntreeInference => ({
  rayon: { origine: v3(x, y, 10), direction: v3(0, 0, -1) },
  tolerance: 0.1,
  geometrie: rect,
  ...autres,
});

describe("inférences ponctuelles", () => {
  it("extrémité : point vert « Endpoint »", () => {
    const r = inferer(pt(v3(4.05, 0.02, 0)));
    expect(r.type).toBe("extremite");
    expect(r.point).toEqual(v3(4, 0, 0));
    expect(r.couleur).toBe(COULEURS.extremite);
    expect(r.libelle).toEqual({ en: "Endpoint", fr: "Extrémité" });
  });

  it("milieu : point cyan « Midpoint »", () => {
    const r = inferer(pt(v3(2.03, 0.01, 0)));
    expect(r.type).toBe("milieu");
    expect(r.point).toEqual(v3(2, 0, 0));
    expect(r.libelle.en).toBe("Midpoint");
    expect(r.couleur).toBe("#00c0c0");
  });

  it("sur arête : carré rouge « On Edge », point projeté sur l'arête", () => {
    const r = inferer(pt(v3(1, 0.05, 0)));
    expect(r.type).toBe("sur-arete");
    expect(r.point).toEqual(v3(1, 0, 0));
    expect(r.entite).toBe("a1");
    expect(r.libelle.en).toBe("On Edge");
  });

  it("sur face : losange bleu « On Face » (rayon)", () => {
    const r = inferer(rayon(1.5, 1.5));
    expect(r.type).toBe("sur-face");
    expect(r.point.z).toBeCloseTo(0, 12);
    expect(r.entite).toBe("f1");
    expect(r.libelle).toEqual({ en: "On Face", fr: "Sur la face" });
  });

  it("origine : « Origin » sans géométrie", () => {
    const r = inferer({ point: v3(0.02, -0.03, 0), tolerance: 0.1, geometrie: vide });
    expect(r.type).toBe("origine");
    expect(r.libelle.en).toBe("Origin");
  });

  it("extrémité prioritaire sur l'origine au même endroit", () => {
    expect(inferer(pt(v3(0.01, 0.01, 0))).type).toBe("extremite");
  });

  it("extrémité prioritaire sur milieu quand les deux sont dans la tolérance", () => {
    const g: GeometrieVisible = { aretes: [{ id: "c", a: v3(10, 0, 0), b: v3(10.1, 0, 0) }], faces: [], centres: [] };
    expect(inferer({ point: v3(10.05, 0, 0), tolerance: 0.1, geometrie: g }).type).toBe("extremite");
  });

  it("intersection de deux arêtes : X rouge", () => {
    const g: GeometrieVisible = {
      aretes: [
        { id: "x1", a: v3(0, 0, 0), b: v3(3, 3, 0) },
        { id: "x2", a: v3(0, 2, 0), b: v3(4, -2, 0) },
      ],
      faces: [],
      centres: [],
    };
    const r = inferer({ point: v3(1.03, 0.98, 0), tolerance: 0.1, geometrie: g });
    expect(r.type).toBe("intersection");
    expect(r.point.x).toBeCloseTo(1, 12);
    expect(r.point.y).toBeCloseTo(1, 12);
    expect(r.couleur).toBe(COULEURS.intersection);
  });

  it("centre d'un cercle : « Center »", () => {
    const m = ajouterPolygone(modeleVide(), v3(5, 5, 0), v3(0, 0, 1), 1, 24).modele;
    const r = inferer({ point: v3(5.02, 5.01, 0), tolerance: 0.1, geometrie: geometrieVisible(m) });
    expect(r.type).toBe("centre");
    expect(r.point).toEqual(v3(5, 5, 0));
  });

  it("hors tolérance et hors face → « aucune », point brut (rayon ∩ sol)", () => {
    const r = inferer(rayon(8, 8));
    expect(r.type).toBe("aucune");
    expect(r.point).toEqual(v3(8, 8, 0));
    expect(r.libelle.en).toBe("");
  });

  it("rayon oblique : extrémité accrochée à distance perpendiculaire du rayon", () => {
    const d = v3(0, 1, -1);
    const r = inferer({ rayon: { origine: v3(4.03, -10, 10), direction: d }, tolerance: 0.1, geometrie: rect });
    expect(r.type).toBe("extremite");
    expect(r.point).toEqual(v3(4, 0, 0));
  });
});

describe("inférences linéaires depuis le départ", () => {
  const libre: GeometrieVisible = vide;
  const depuis = (p: Vec3, autres: Partial<EntreeInference> = {}): EntreeInference => ({
    point: p,
    tolerance: 0.1,
    geometrie: libre,
    depart: v3(10, 10, 0),
    ...autres,
  });

  it("axe rouge : « On Red Axis », couleur rouge, projection sur l'axe", () => {
    const r = inferer(depuis(v3(13, 10.05, 0)));
    expect(r.type).toBe("axe-x");
    expect(r.point).toEqual(v3(13, 10, 0));
    expect(r.couleur).toBe(COULEURS["axe-x"]);
    expect(r.libelle).toEqual({ en: "On Red Axis", fr: "Sur l'axe rouge" });
  });

  it("axes vert et bleu", () => {
    expect(inferer(depuis(v3(10.04, 12, 0))).type).toBe("axe-y");
    const b = inferer(depuis(v3(10.02, 10.03, 2)));
    expect(b.type).toBe("axe-z");
    expect(b.couleur).toBe("#0000e0");
  });

  it("parallèle et perpendiculaire à l'arête de référence : magenta", () => {
    const ref = { a: v3(0, 0, 0), b: v3(1, 1, 0) };
    const p = inferer(depuis(v3(12, 12.05, 0), { areteReference: ref }));
    expect(p.type).toBe("parallele");
    expect(p.couleur).toBe("#ff00ff");
    const q = inferer(depuis(v3(8, 12.04, 0), { areteReference: ref }));
    expect(q.type).toBe("perpendiculaire");
    expect(q.libelle.en).toBe("Perpendicular to Edge");
  });

  it("tangente au sommet : cyan", () => {
    const r = inferer(depuis(v3(12, 12.03, 0), { tangenteDepart: v3(1, 1, 0) }));
    expect(r.type).toBe("tangente");
    expect(r.libelle.en).toBe("Tangent at Vertex");
  });

  it("« From Point » : axe passant par un point de référence", () => {
    const r = inferer({ point: v3(5, 3.04, 0), tolerance: 0.1, geometrie: vide, pointsReference: [v3(1, 3, 0)] });
    expect(r.type).toBe("axe-x");
    expect(r.libelle.en).toBe("From Point");
    expect(r.origineLigne).toEqual(v3(1, 3, 0));
  });

  it("priorité : point > arête > axe > face", () => {
    // Le curseur est sur l'axe rouge depuis le départ ET sur une extrémité : l'extrémité gagne.
    expect(inferer(pt(v3(4.02, 0, 0), { depart: v3(-2, 0, 0) })).type).toBe("extremite");
    // Sur l'arête a1 et sur l'axe rouge : l'arête gagne.
    expect(inferer(pt(v3(1, 0.01, 0), { depart: v3(-2, 0, 0) })).type).toBe("sur-arete");
    // Sur la face et sur l'axe vert depuis (1,−2) : l'axe gagne sur la face.
    expect(inferer(rayon(1.03, 1.5, { depart: v3(1, -2, 0) })).type).toBe("axe-y");
    // Sur la face seule.
    expect(inferer(rayon(1.5, 1.5, { depart: v3(-5, -7, 0) })).type).toBe("sur-face");
  });
});

describe("mode Alt et verrous", () => {
  it("cycle Alt observé : tout → aucune → parallèle/perpendiculaire → tout", () => {
    const vus: ModeAlt[] = ["tout"];
    for (let i = 0; i < 3; i++) vus.push(modeAltSuivant(vus[vus.length - 1] as ModeAlt));
    expect(vus).toEqual(["tout", "aucune", "parallele-perpendiculaire", "tout"]);
  });

  it("Alt « tout coupé » : plus d'accrochage sur l'axe rouge, les points restent", () => {
    const e: EntreeInference = { point: v3(13, 10.05, 0), tolerance: 0.1, geometrie: vide, depart: v3(10, 10, 0), modeAlt: "aucune" };
    expect(inferer(e).type).toBe("aucune");
    expect(inferer(pt(v3(4.02, 0, 0), { modeAlt: "aucune" })).type).toBe("extremite");
  });

  it("Alt « parallèle/perpendiculaire seulement » : axes coupés, parallèle conservé", () => {
    const base = { tolerance: 0.1, geometrie: vide, depart: v3(10, 10, 0), modeAlt: "parallele-perpendiculaire" as const };
    expect(inferer({ ...base, point: v3(13, 10.05, 0) }).type).toBe("aucune");
    const r = inferer({ ...base, point: v3(12, 12.05, 0), areteReference: { a: v3(0, 0, 0), b: v3(1, 1, 0) } });
    expect(r.type).toBe("parallele");
  });

  it("verrou flèche → (axe rouge) : « Constrained on Line », projection même loin de l'axe", () => {
    const r = inferer({ point: v3(13, 12, 0), tolerance: 0.1, geometrie: vide, depart: v3(10, 10, 0), verrou: { genre: "axe", axe: "x" } });
    expect(r.type).toBe("axe-x");
    expect(r.point).toEqual(v3(13, 10, 0));
    expect(r.verrouillee).toBe(true);
    expect(r.libelle).toEqual({ en: "Constrained on Line", fr: "Contraint sur la ligne" });
    expect(r.couleur).toBe(COULEURS["axe-x"]);
  });

  it("verrou d'axe : un point accroché est projeté sur la ligne verrouillée", () => {
    const r = inferer(pt(v3(4.02, 3.01, 0), { depart: v3(0, 0, 0), verrou: { genre: "axe", axe: "x" } }));
    expect(r.point).toEqual(v3(4, 0, 0));
  });

  it("verrou ↓ (direction parallèle) : magenta", () => {
    const r = inferer({
      point: v3(12, 15, 0),
      tolerance: 0.1,
      geometrie: vide,
      depart: v3(10, 10, 0),
      verrou: { genre: "direction", direction: v3(1, 1, 0) },
    });
    expect(r.type).toBe("parallele");
    expect(r.point.x).toBeCloseTo(13.5, 12);
    expect(r.point.y).toBeCloseTo(13.5, 12);
    expect(r.couleur).toBe("#ff00ff");
  });

  it("verrou d'axe sans départ : ignoré (avant le 1er clic, les flèches verrouillent un plan)", () => {
    expect(inferer(pt(v3(4.02, 0, 0), { verrou: { genre: "axe", axe: "x" } })).type).toBe("extremite");
  });

  it("Maj : l'inférence courante (axe rouge) reste verrouillée quand on s'éloigne", () => {
    const depart = v3(10, 10, 0);
    const i = inferer({ point: v3(12, 10.02, 0), tolerance: 0.1, geometrie: vide, depart });
    expect(i.type).toBe("axe-x");
    const r = inferer({ point: v3(13.2, 11.5, 0), tolerance: 0.1, geometrie: vide, depart, verrou: { genre: "inference", inference: i } });
    expect(r.type).toBe("axe-x");
    expect(r.point).toEqual(v3(13.2, 10, 0));
    expect(r.verrouillee).toBe(true);
  });

  it("Maj sur une extrémité : direction départ → extrémité verrouillée", () => {
    const i = inferer(pt(v3(4.02, 3, 0)));
    expect(i.type).toBe("extremite");
    const r = inferer({ ...pt(v3(9, 3, 0)), depart: v3(0, 0, 0), verrou: { genre: "inference", inference: i } });
    expect(r.point.y / r.point.x).toBeCloseTo(0.75, 12);
  });

  it("plan verrouillé : rayon projeté sur le plan, « Constrained on Plane », couleur de la normale", () => {
    const r = inferer({
      rayon: { origine: v3(2, -10, 1), direction: v3(0, 1, 0) },
      tolerance: 0.1,
      geometrie: vide,
      verrou: { genre: "plan", origine: v3(0, 0, 0), normale: v3(0, 1, 0) },
    });
    expect(r.point).toEqual(v3(2, 0, 1));
    expect(r.libelle.en).toBe("Constrained on Plane");
    expect(r.couleur).toBe(COULEURS["axe-y"]);
  });
});

describe("géométrie visible depuis le modèle", () => {
  it("aplatit racine et groupes (transformation composée), entités de groupe marquées magenta", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    m = pousserTirer(m, Object.keys(m.racine.faces)[0] as string, 2).modele;
    const g = grouper(m, [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    const geo = geometrieVisible(g.modele);
    expect(geo.aretes.length).toBe(12);
    expect(geo.faces.length).toBe(6);
    const r = inferer({ point: v3(4.01, 3, 2), tolerance: 0.1, geometrie: geo });
    expect(r.type).toBe("extremite");
    expect(r.couleur).toBe("#ff00ff");
    const dessus = inferer({ rayon: { origine: v3(1, 1, 10), direction: v3(0, 0, -1) }, tolerance: 0.1, geometrie: geo });
    expect(dessus.type).toBe("sur-face");
    expect(dessus.point.z).toBeCloseTo(2, 12);
  });
});
