/** Cas 2 du catalogue, lot 8 — outils de modélisation (fonctions pures). */
import { describe, expect, it } from "vitest";
import {
  ajouterPolygone,
  ajouterRectangle,
  ajouterSegment,
  contexte,
  creerGroupeDepuisFaces,
  deplacer,
  determinant3,
  grouper,
  modeleVide,
  modifierAnnotations,
  pousserTirer,
  volume,
  type Modele,
} from "./geometrie-libre.js";
import {
  ErreurL8,
  aireContour,
  boiteDeCoins,
  calerParDeuxPoints,
  changerHauteurExtrusion,
  creerCouches,
  echelleGraphique,
  empreintesEnPlan,
  lireAltitudes,
  lireEpaisseurs,
  lireExtrusion,
  longueurCourbes,
  matriceCalage,
  miroirLisible,
  modeleEclate,
  objetsDansBoite,
  objetsEntreAltitudes,
  prochainNom,
  prolongerArete,
  recalerFaces,
} from "./modelisation-l8.js";
import { appliquer } from "./geometrie-libre.js";

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
const proche = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

/** Boîte 2 × 2 × h à la racine (non groupée) ; renvoie la face du dessus. */
function boiteNue(h: number): { m: Modele; dessus: string } {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const f = Object.keys(r.racine.faces)[0]!;
  const m = pousserTirer(r, f, h).modele;
  const dessus = Object.values(m.racine.faces).find((x) => x.normale.z > 0.99 && x.exterieur.every((s) => Math.abs(m.racine.sommets[s]!.position.z - h) < 1e-9))!.id;
  return { m, dessus };
}

/** Boîte groupée de coin (x, y, z), côtés (a, b, c). */
function boiteGroupee(m: Modele, o: { x: number; y: number; z: number }, a = 1, b = 1, c = 1, nom = "Boîte") {
  const p = (x: number, y: number, z: number) => v3(o.x + x, o.y + y, o.z + z);
  return creerGroupeDepuisFaces(m, [
    [[p(0, 0, 0), p(0, b, 0), p(a, b, 0), p(a, 0, 0)]],
    [[p(0, 0, c), p(a, 0, c), p(a, b, c), p(0, b, c)]],
    [[p(0, 0, 0), p(a, 0, 0), p(a, 0, c), p(0, 0, c)]],
    [[p(a, b, 0), p(0, b, 0), p(0, b, c), p(a, b, c)]],
    [[p(0, b, 0), p(0, 0, 0), p(0, 0, c), p(0, b, c)]],
    [[p(a, 0, 0), p(a, b, 0), p(a, b, c), p(a, 0, c)]],
  ], { nom });
}

describe("n° 39 — hauteur d'une extrusion de face", () => {
  it("lit la hauteur sur la géométrie et la change d'un Pousser/Tirer (la base reste)", () => {
    const { m, dessus } = boiteNue(2.8);
    const l = lireExtrusion(m, dessus);
    expect(l.ok && l.hauteur).toBeCloseTo(2.8, 9);
    const r = changerHauteurExtrusion(m, dessus, 3.1);
    const l2 = lireExtrusion(r.modele, dessus);
    expect(l2.ok && l2.hauteur).toBeCloseTo(3.1, 9);
    expect(l.ok && l2.ok && l2.base).toBe(l.ok ? l.base : "");
  });
  it("figée quand une face latérale a été inclinée à la main ; refusée sans face latérale", () => {
    const { m, dessus } = boiteNue(2);
    const c = contexte(m);
    // Arête du dessus côté x = 2 déplacée de 0,5 m en x : deux faces latérales ne sont plus perpendiculaires.
    const arete = Object.values(c.aretes).find((a) => [a.a, a.b].every((s) => c.sommets[s]!.position.z > 1.99 && c.sommets[s]!.position.x > 1.99))!;
    const incl = deplacer(m, [arete.id], v3(0.5, 0, 0)).modele;
    const dessus2 = Object.values(incl.racine.faces).find((f) => f.normale.z > 0.99 && f.exterieur.every((s) => incl.racine.sommets[s]!.position.z > 1.99))!.id;
    const l = lireExtrusion(incl, dessus2);
    expect(l.ok).toBe(false);
    expect(!l.ok && l.motif).toBe("laterale-oblique");
    expect(() => changerHauteurExtrusion(incl, dessus2, 3)).toThrow(ErreurL8);
    const plat = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const l3 = lireExtrusion(plat, Object.keys(plat.racine.faces)[0]!);
    expect(!l3.ok && l3.motif).toBe("sans-laterales");
    void dessus;
  });
});

describe("n° 71 — couches en une saisie", () => {
  it("« 0,015 ; 0,175 ; 0,10 » : trois groupes solides empilés, volumes = aire × épaisseur", () => {
    expect(lireEpaisseurs("0,015 ; 0,175 ; 0,10")).toEqual([0.015, 0.175, 0.1]);
    expect(lireEpaisseurs("0,2 ; -1")).toBeNull();
    expect(lireEpaisseurs("")).toBeNull();
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 0, 3)).modele;
    const f = Object.keys(m.racine.faces)[0]!;
    const n = m.racine.faces[f]!.normale;
    const r = creerCouches(m, f, [0.015, 0.175, 0.1], "interieur");
    expect(r.occurrences).toHaveLength(3);
    const vols = r.occurrences.map((o) => volume(r.modele, o));
    expect(vols[0]).toBeCloseTo(12 * 0.015, 9);
    expect(vols[1]).toBeCloseTo(12 * 0.175, 9);
    expect(vols[2]).toBeCloseTo(12 * 0.1, 9);
    expect(r.modele.definitions[r.modele.racine.occurrences[r.occurrences[1]!]!.definition]!.nom).toBe("Couche 2 · 0,175 m");
    // Vers l'intérieur : la dernière couche se termine à 0,29 m derrière la face (sens opposé à la normale).
    const c = contexte(r.modele, r.occurrences[2]);
    const loin = Math.max(...Object.values(c.sommets).map((s) => -(s.position.x * n.x + s.position.y * n.y + s.position.z * n.z)));
    expect(loin).toBeCloseTo(0.29, 9);
    expect(() => creerCouches(m, f, [], "exterieur")).toThrow(ErreurL8);
  });
});

describe("n° 98 — prolonger jusqu'à une limite", () => {
  it("jusqu'au plan d'une face, jusqu'à une arête ; parallèle refusée", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(1, 0, 0)).modele;
    const a = Object.keys(m.racine.aretes)[0]!;
    m = ajouterRectangle(m, v3(3, -1, -1), v3(0, 2, 0), v3(0, 0, 2)).modele;
    const f = Object.keys(m.racine.faces)[0]!;
    const r = prolongerArete(m, a, { face: f });
    const c = contexte(r.modele);
    expect(Math.max(...Object.values(c.sommets).filter((s) => Math.abs(s.position.y) < 1e-9 && Math.abs(s.position.z) < 1e-9).map((s) => s.position.x))).toBeCloseTo(3, 9);
    let m2 = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(1, 0, 0)).modele;
    const a2 = Object.keys(m2.racine.aretes)[0]!;
    m2 = ajouterSegment(m2, v3(2.5, -1, 0), v3(2.5, 1, 0)).modele;
    const limite = Object.keys(m2.racine.aretes).find((x) => x !== a2)!;
    const r2 = prolongerArete(m2, a2, { arete: limite });
    expect(Object.values(contexte(r2.modele).sommets).some((s) => Math.abs(s.position.x - 2.5) < 1e-9 && Math.abs(s.position.y) < 1e-9)).toBe(true);
    let m3 = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(1, 0, 0)).modele;
    const a3 = Object.keys(m3.racine.aretes)[0]!;
    m3 = ajouterSegment(m3, v3(0, 1, 0), v3(1, 1, 0)).modele;
    expect(() => prolongerArete(m3, a3, { arete: Object.keys(m3.racine.aretes).find((x) => x !== a3)! })).toThrow("parallèle");
  });
});

describe("n° 50 — caler par deux points", () => {
  it("A → A', B → B' : rotation et échelle uniforme calculées", () => {
    const { matrice, facteur, angle } = matriceCalage(v3(0, 0, 0), v3(1, 0, 0), v3(5, 5, 0), v3(5, 7, 0), { echelle: true });
    proche(appliquer(matrice, v3(0, 0, 0)), v3(5, 5, 0));
    proche(appliquer(matrice, v3(1, 0, 0)), v3(5, 7, 0));
    expect(facteur).toBeCloseTo(2, 12);
    expect(angle).toBeCloseTo(Math.PI / 2, 12);
    const b = boiteGroupee(modeleVide(), v3(0, 0, 0));
    const r = calerParDeuxPoints(b.modele, [b.occurrence], [v3(0, 0, 0), v3(1, 0, 0), v3(10, 0, 0), v3(10, 3, 0)]);
    const T = r.modele.racine.occurrences[b.occurrence]!.transformation;
    proche(appliquer(T, v3(1, 0, 0)), v3(10, 3, 0));
    expect(determinant3(T)).toBeCloseTo(27, 9);
    expect(() => matriceCalage(v3(0, 0, 0), v3(0, 0, 0), v3(1, 0, 0), v3(2, 0, 0))).toThrow(ErreurL8);
  });
});

describe("n° 100 — sélection entre altitudes ou dans une boîte", () => {
  it("objets entièrement compris ; boîte tracée à plat bornée par les altitudes saisies", () => {
    let m = modeleVide();
    const a = boiteGroupee(m, v3(0, 0, 0));
    const b = boiteGroupee(a.modele, v3(0, 0, 3.5));
    const c = boiteGroupee(b.modele, v3(5, 0, 3.5));
    m = c.modele;
    expect(objetsEntreAltitudes(m, 3, 6).sort()).toEqual([b.occurrence, c.occurrence].sort());
    expect(lireAltitudes("3,00 m et 6,00 m")).toEqual({ zmin: 3, zmax: 6 });
    expect(lireAltitudes("3")).toBeNull();
    expect(objetsDansBoite(m, boiteDeCoins(v3(-1, -1, 0), v3(2, 2, 0), { zmin: 3, zmax: 6 }))).toEqual([b.occurrence]);
    expect(objetsDansBoite(m, boiteDeCoins(v3(-1, -1, -1), v3(7, 2, 10), null)).length).toBe(3);
    expect(() => objetsEntreAltitudes(m, 6, 3)).toThrow(ErreurL8);
  });
});

describe("n° 104 — miroir lisible", () => {
  it("groupe retourné, composant qui a une main gardé dans son sens, cote relue dans le bon sens", () => {
    const g = boiteGroupee(modeleVide(), v3(1, 0, 0), 1, 1, 1, "Porte");
    const def = g.modele.racine.occurrences[g.occurrence]!.definition;
    let m: Modele = { ...g.modele, definitions: { ...g.modele.definitions, [def]: { ...g.modele.definitions[def]!, genre: "composant", composantAgence: { fichier: "porte.json", genre: "porte", main: "gauche", valeurs: {}, texte: "{}" } } } };
    const h = boiteGroupee(m, v3(3, 0, 0), 1, 1, 1, "Bloc");
    m = h.modele;
    let cote = "";
    m = modifierAnnotations(m, (a, id) => {
      cote = id("c");
      a.cotes[cote] = { id: cote, genre: "lineaire", a: v3(1, -1, 0), b: v3(4, -1, 0), position: v3(1, -1.5, 0) };
    }).modele;
    const r = miroirLisible(m, [g.occurrence, h.occurrence, cote], "x");
    expect(r.gardes).toBe(1);
    expect(determinant3(r.modele.racine.occurrences[g.occurrence]!.transformation)).toBeGreaterThan(0);
    expect(determinant3(r.modele.racine.occurrences[h.occurrence]!.transformation)).toBeLessThan(0);
    // Centre de la sélection x = 2,5 : la porte (1..2) passe en 3..4, le bloc (3..4) en 1..2.
    const k = r.modele.annotations!.cotes[cote]! as { a: { x: number }; b: { x: number } };
    expect(k.a.x).toBeCloseTo(1, 9);
    expect(k.b.x).toBeCloseTo(4, 9);
    const centre = appliquer(r.modele.racine.occurrences[g.occurrence]!.transformation, v3(1.5, 0.5, 0.5));
    expect(centre.x).toBeCloseTo(3.5, 9);
  });
});

describe("n° 15, 114 — aire projetée et facettage", () => {
  it("empreintes en plan d'une boîte : une empreinte de 2 m² (dessus et dessous confondus par l'union)", () => {
    const b = boiteGroupee(modeleVide(), v3(0, 0, 0), 2, 1, 1);
    const e = empreintesEnPlan(b.modele, [b.occurrence]);
    expect(e).toHaveLength(1);
    expect(e[0]!.every((c) => aireContour(c) > 0)).toBe(true);
    expect(aireContour(e[0]![0]!)).toBeCloseTo(2, 12);
  });
  it("cercle de rayon 1 en 24 segments : longueur vraie 2π, écart des facettes affiché", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24);
    const aretes = Object.keys(m.modele.racine.aretes);
    const l = longueurCourbes(m.modele, aretes);
    expect(l.courbe).toBeCloseTo(2 * Math.PI, 9);
    expect(l.facettes).toBeLessThan(2 * Math.PI);
    expect(l.ecart).toBeCloseTo(2 * Math.PI - 48 * Math.sin(Math.PI / 24), 9);
    expect(l.aretesCourbes).toBe(24);
  });
});

describe("n° 19, 29 — axonométrie éclatée, échelle graphique", () => {
  it("éclaté par niveau : chaque niveau levé de k × écart, le modèle d'origine intact", () => {
    let m = boiteGroupee(modeleVide(), v3(0, 0, 0)).modele;
    const ids = Object.keys(m.racine.occurrences);
    const b = boiteGroupee(m, v3(0, 0, 3));
    m = modifierAnnotations(b.modele, (a) => {
      a.niveaux["n1"] = { id: "n1", nom: "Rez", altitude: 0, hauteur: 3 };
      a.niveaux["n2"] = { id: "n2", nom: "Étage 1", altitude: 3, hauteur: 3 };
    }).modele;
    m = { ...m, racine: { ...m.racine, occurrences: { ...m.racine.occurrences, [ids[0]!]: { ...m.racine.occurrences[ids[0]!]!, niveau: "n1" }, [b.occurrence]: { ...m.racine.occurrences[b.occurrence]!, niveau: "n2" } } } };
    const e = modeleEclate(m, "niveau", 4);
    expect(e.groupes.map((g) => [g.nom, g.decalage])).toEqual([["Rez", 0], ["Étage 1", 4]]);
    expect(e.modele.racine.occurrences[b.occurrence]!.transformation[11]).toBeCloseTo(4, 12);
    expect(m.racine.occurrences[b.occurrence]!.transformation[11]).toBe(0);
    expect(() => modeleEclate(m, "balise", 0)).toThrow(ErreurL8);
  });
  it("échelle graphique : longueur ronde, quatre graduations, 1:n à 96 ppp", () => {
    const e = echelleGraphique(37.795275590551185)!; // 1:100 → 1 m = 37,8 px
    expect(e.longueur).toBe(5);
    expect(e.graduations).toEqual([0, 1.25, 2.5, 5]);
    expect(e.denominateur).toBeCloseTo(100, 6);
    expect(echelleGraphique(0)).toBeNull();
  });
});

describe("n° 72 — recalage des faces sur leurs plans d'origine", () => {
  it("une face décalée de la simple précision revient exactement sur le plan d'origine", () => {
    const faces = [[[v3(0, 0, 1.0000003), v3(1, 0, 0.9999998), v3(1, 1, 1.0000001), v3(0, 1, 1)]]];
    const r = recalerFaces(faces, [{ n: v3(0, 0, 1), d: 1 }]);
    for (const p of r[0]![0]!) expect(p.z).toBe(1);
    const coin = recalerFaces([[[v3(1.0000002, 0, 0), v3(1, 1, 0), v3(1, 1, 1), v3(1.0000002, 0, 1)]], [[v3(0, 0, 0), v3(1.0000002, 0, 0), v3(1.0000002, 0, 1), v3(0, 0, 1)]]], [{ n: v3(1, 0, 0), d: 1 }, { n: v3(0, -1, 0), d: 0 }]);
    expect(coin[0]![0]![0]!.x).toBe(1);
    expect(coin[1]![0]![1]!.x).toBe(1);
  });
  it("prochain nom libre", () => {
    const b = boiteGroupee(modeleVide(), v3(0, 0, 0), 1, 1, 1, "Démolition 1");
    expect(prochainNom(b.modele, "Démolition")).toBe("Démolition 2");
    void grouper;
  });
});
