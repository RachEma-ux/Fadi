import { describe, expect, it } from "vitest";
import {
  ajouterRectangle,
  baliserOccurrences,
  creerGroupeDepuisFaces,
  effacerEntites,
  estSolide,
  grouper,
  modeleVide,
  modifierAnnotations,
  peindreFaces,
  peindreOccurrences,
  pousserTirer,
  redimensionner,
  volume,
} from "./geometrie-libre.js";
import { facesDuMaillage, maillageDuSolide, motifNonSolide, triangulerFace, volumeDuMaillage } from "./maillage.js";
import { v3 } from "./vecteur.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const boite = () => {
  const m = sol();
  const f = Object.keys(m.racine.faces)[0] as string;
  const r = pousserTirer(m, f, 2).modele;
  return grouper(r, [...Object.keys(r.racine.faces), ...Object.keys(r.racine.aretes)], { nom: "Boîte" });
};

describe("Annotations (lots 4 à 6) — noyau", () => {
  it("un guide ajouté sort du compteur commun, apparaît dans le rapport et s'efface avec effacerEntites", () => {
    const m = sol();
    const r = modifierAnnotations(m, (a, id) => {
      const g = id("g");
      a.guides[g] = { id: g, genre: "ligne", origine: v3(0, 1, 0), direction: v3(1, 0, 0) };
      return g;
    });
    expect(r.rapport.crees).toEqual([r.extra]);
    expect(r.modele.annotations?.guides[r.extra]?.genre).toBe("ligne");
    expect(r.modele.prochainId).toBe(m.prochainId + 1);
    const e = effacerEntites(r.modele, [r.extra]);
    expect(e.modele.annotations?.guides[r.extra]).toBeUndefined();
    expect(e.rapport.supprimes).toEqual([r.extra]);
    // La géométrie n'est pas touchée.
    expect(Object.keys(e.modele.racine.faces)).toHaveLength(1);
  });

  it("une opération géométrique conserve les annotations existantes", () => {
    const m = modifierAnnotations(sol(), (a, id) => {
      const c = id("c");
      a.cotes[c] = { id: c, genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), position: v3(2, -1, 0) };
    }).modele;
    const f = Object.keys(m.racine.faces)[0] as string;
    const r = pousserTirer(m, f, 1).modele;
    expect(Object.keys(r.annotations?.cotes ?? {})).toHaveLength(1);
    expect(r.annotations).toBe(m.annotations); // même objet : rien n'a changé côté annotations
  });

  it("peindre des faces et un objet ; baliser un objet", () => {
    const b = boite();
    const faces = Object.keys(b.modele.definitions[b.definition]!.contenu.faces);
    const m1 = modifierAnnotations(b.modele, (a, id) => {
      const mt = id("m");
      a.materiaux[mt] = { id: mt, nom: "Rouge", couleur: "#ff0000" };
      return mt;
    });
    const p = peindreFaces(m1.modele, [faces[0] as string], m1.extra, { dans: b.occurrence });
    expect(p.modele.definitions[b.definition]!.contenu.faces[faces[0] as string]!.materiauRecto).toBe(m1.extra);
    expect(p.rapport.modifies).toContain(faces[0]);
    const q = peindreOccurrences(p.modele, [b.occurrence], m1.extra);
    expect(q.modele.racine.occurrences[b.occurrence]!.materiau).toBe(m1.extra);
    const r = baliserOccurrences(q.modele, [b.occurrence], "b9");
    expect(r.modele.racine.occurrences[b.occurrence]!.balise).toBe("b9");
    const s = baliserOccurrences(r.modele, [b.occurrence], null);
    expect(s.modele.racine.occurrences[b.occurrence]!.balise).toBeUndefined();
  });

  it("redimensionner ×2 : géométrie, occurrences et annotations à l'échelle, volume ×8", () => {
    const b = boite();
    const m = modifierAnnotations(b.modele, (a, id) => {
      const g = id("g");
      a.guides[g] = { id: g, genre: "segment", origine: v3(0, 0, 0), fin: v3(1, 0, 0) };
    }).modele;
    expect(volume(m, b.occurrence)).toBeCloseTo(24, 9);
    const r = redimensionner(m, 2).modele;
    expect(volume(r, b.occurrence)).toBeCloseTo(192, 9);
    const g = Object.values(r.annotations!.guides)[0]!;
    expect(g.genre === "segment" && g.fin.x).toBe(2);
  });
});

describe("Maillage (lot 6) — triangulation et conversions", () => {
  it("triangule un rectangle (2 triangles) et un rectangle troué (8 triangles, aire conservée)", () => {
    const ext = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    expect(triangulerFace(ext, [])).toHaveLength(6);
    const trou = [v3(1, 1, 0), v3(1, 2, 0), v3(3, 2, 0), v3(3, 1, 0)];
    const tri = triangulerFace(ext, [trou]);
    const pts = [...ext, ...trou];
    let aire = 0;
    for (let i = 0; i < tri.length; i += 3) {
      const [a, b, c] = [pts[tri[i]!]!, pts[tri[i + 1]!]!, pts[tri[i + 2]!]!];
      aire += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
    }
    expect(tri.length / 3).toBe(8);
    expect(aire).toBeCloseTo(12 - 2, 9);
  });

  it("solide → maillage orienté vers l'extérieur (volume 24) → faces polygonales → groupe solide de même volume", () => {
    const b = boite();
    expect(motifNonSolide(b.modele, b.occurrence)).toBeNull();
    const mesh = maillageDuSolide(b.modele, b.occurrence);
    expect(mesh.triangles.length / 3).toBe(12);
    expect(volumeDuMaillage(mesh)).toBeCloseTo(24, 9);
    const { faces } = facesDuMaillage(mesh);
    expect(faces).toHaveLength(6);
    expect(faces.every((f) => f.length === 1 && f[0]!.length === 4)).toBe(true);
    const g = creerGroupeDepuisFaces(b.modele, faces, { nom: "Copie" });
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(24, 9);
  });

  it("faces coplanaires disjointes d'un maillage sans identifiant de face restent deux faces", () => {
    const mesh = {
      positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 3, 0, 0, 4, 0, 0, 4, 1, 0, 3, 1, 0],
      triangles: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
    };
    expect(facesDuMaillage(mesh).faces).toHaveLength(2);
  });

  it("une géométrie libre non fermée n'est pas un solide : motif nommé", () => {
    const m = sol();
    const g = grouper(m, [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    expect(motifNonSolide(g.modele, g.occurrence)).toMatch(/arête/);
    expect(() => maillageDuSolide(g.modele, g.occurrence)).toThrow(/pas un solide/);
  });
});
