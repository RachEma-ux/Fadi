import { describe, expect, it } from "vitest";
import { type Id, type Modele, ERREUR_ETIRER_ISOLEE, ajouterRectangle, ajouterSegment, contexte, deplacer, etirerFace, faceAVoisines, grouper, modeleVide, pousserTirer } from "./geometrie-libre.js";
import { type Vec3, v3 } from "./vecteur.js";

const faces = (m: Modele) => Object.values(m.racine.faces);
const sommets = (m: Modele) => Object.values(m.racine.sommets).map((s) => s.position);
const faceDe = (m: Modele, test: (n: Vec3) => boolean) => faces(m).find((f) => test(f.normale))?.id as Id;

/** Boîte 4 × 3 × 2 dont l'arête haute en x = 0 est montée de 1 m : toit incliné (pente selon x). */
function prismeToitIncline(): Modele {
  const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const dessous = Object.keys(sol.racine.faces)[0] as Id;
  const boite = pousserTirer(sol, dessous, sol.racine.faces[dessous]!.normale.z > 0 ? 2 : -2).modele;
  const arete = Object.values(boite.racine.aretes).find((a) => {
    const A = boite.racine.sommets[a.a]!.position;
    const B = boite.racine.sommets[a.b]!.position;
    return A.x === 0 && B.x === 0 && Math.abs(Math.abs(A.z) - 2) < 1e-9 && Math.abs(Math.abs(B.z) - 2) < 1e-9;
  });
  return deplacer(boite, [arete!.id], v3(0, 0, Math.sign(boite.racine.sommets[arete!.a]!.position.z))).modele;
}

describe("Étirement réel (lot Planche 8, D-201)", () => {
  it("prisme à toit incliné : étirer le mur x = 4 de 1 m étire le toit (6 faces), Normal ajoute une marche (7 faces)", () => {
    const m = prismeToitIncline();
    expect(faces(m)).toHaveLength(6);
    const mur = faceDe(m, (n) => n.x > 0.9);
    const e = etirerFace(m, mur, 1).modele;
    expect(faces(e)).toHaveLength(6);
    expect(sommets(e).some((p) => Math.abs(p.x - 5) < 1e-9)).toBe(true);
    expect(sommets(e).some((p) => Math.abs(p.x - 4) < 1e-9)).toBe(false);
    const normal = pousserTirer(m, mur, 1).modele;
    expect(faces(normal)).toHaveLength(7);
    expect(sommets(normal).some((p) => Math.abs(p.x - 4) < 1e-9)).toBe(true);
  });

  it("voisine qui deviendrait gauche : refus nommé, modèle inchangé", () => {
    // F : carré au sol ; G : quadrilatère incliné partageant l'arête x = 1, dont le côté opposé n'est pas parallèle.
    let m = modeleVide();
    for (const [a, b] of [
      [v3(0, 0, 0), v3(1, 0, 0)],
      [v3(1, 0, 0), v3(1, 1, 0)],
      [v3(1, 1, 0), v3(0, 1, 0)],
      [v3(0, 1, 0), v3(0, 0, 0)],
      [v3(1, 1, 0), v3(1.5, 1, 1)],
      [v3(1.5, 1, 1), v3(1.25, 0, 0.5)],
      [v3(1.25, 0, 0.5), v3(1, 0, 0)],
    ] as const) m = ajouterSegment(m, a, b).modele;
    expect(faces(m)).toHaveLength(2);
    const F = faceDe(m, (n) => Math.abs(n.z) > 0.99);
    expect(() => etirerFace(m, F, 0.3)).toThrow(/non plane/);
  });

  it("distance nulle refusée (la face isolée, elle, est refusée depuis D-202 : voir plus bas)", () => {
    const m = prismeToitIncline();
    const mur = faceDe(m, (n) => n.x > 0.9);
    expect(() => etirerFace(m, mur, 0)).toThrow(/nulle/);
  });
});

describe("Étirement d'une face isolée (suite du lot Planche 8, D-202, EX-PT-03)", () => {
  it("une face seule est refusée avec le motif nommé ; le modèle n'est pas touché", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const f = Object.keys(m.racine.faces)[0] as Id;
    expect(faceAVoisines(m, f)).toBe(false);
    expect(() => etirerFace(m, f, 1)).toThrow(ERREUR_ETIRER_ISOLEE);
  });
  it("une face de boîte a des voisines ; dans un groupe, seules comptent les voisines du groupe", () => {
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const dessous = Object.keys(sol.racine.faces)[0] as Id;
    const boite = pousserTirer(sol, dessous, sol.racine.faces[dessous]!.normale.z > 0 ? 2 : -2).modele;
    const dessus = faceDe(boite, (n) => n.z > 0.9);
    expect(faceAVoisines(boite, dessus)).toBe(true);
    // Le dessus seul dans un groupe : ses arêtes partagées sont dupliquées, il n'a plus de voisine dans ce contexte.
    const g = grouper(boite, [dessus]);
    const interne = Object.keys(contexte(g.modele, g.occurrence).faces)[0] as Id;
    expect(faceAVoisines(g.modele, interne, g.occurrence)).toBe(false);
    expect(() => etirerFace(g.modele, interne, 1, { dans: g.occurrence })).toThrow(ERREUR_ETIRER_ISOLEE);
  });
});
