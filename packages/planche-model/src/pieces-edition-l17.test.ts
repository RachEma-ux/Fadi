/** Lot L17 : édition des pièces — changer de section, rotation axiale, alignement de face, échelle axiale seulement. */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ERREUR_ALIGNER_PARALLELE,
  ERREUR_ECHELLE_PIECE,
  ERREUR_ECHELLE_PIECE_COUPEE,
  ERREUR_ECHELLE_PIECE_REPERE,
  ajouterSegment,
  alignerFacePiece,
  axesDesPieces,
  changerSectionPiece,
  contexte,
  mettreAEchelle,
  modeleVide,
  ongletPieces,
  piecesLiees,
  poserPiece,
  tournerPieceAxe,
  verrouillerOccurrences,
  volume,
} from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { PLACEMENT_DEFAUT, type SectionProfil } from "./profiles.js";
import { v3 } from "./vecteur.js";

/** Sections d'essai (données du test). */
const rect = (l: number, h: number): SectionProfil => ({ exterieur: [{ y: -l / 2, z: -h / 2 }, { y: l / 2, z: -h / 2 }, { y: l / 2, z: h / 2 }, { y: -l / 2, z: h / 2 }], trous: [] });
const OPT = { designation: "80 × 40 d'essai", source: { genre: "saisie" } as const };
const boite = (m: Modele) => {
  const p = geometrieVisible(m).faces.flatMap((f) => f.exterieur);
  const b = (k: "x" | "y" | "z"): [number, number] => [Math.min(...p.map((q) => q[k])), Math.max(...p.map((q) => q[k]))];
  return { x: b("x"), y: b("y"), z: b("z") };
};
const meta = (m: Modele, o: Id) => m.definitions[contexte(m).occurrences[o]!.definition]!.piece!;

describe("Changer la section (L17)", () => {
  it("80 × 40 → 100 × 50 régénéré : même axe, même longueur, nouvelle source, un pas, lien gardé", () => {
    const m0 = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0)).modele;
    const e = Object.keys(m0.racine.aretes)[0] as Id;
    const p = poserPiece(m0, { arete: e }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    const src = { genre: "catalogue" as const, source: "Catalogue d'essai", edition: "2026", page: "3", ligne: "4" };
    const r = changerSectionPiece(p.modele, p.occurrence, rect(0.1, 0.05), src, "100 × 50 d'essai");
    expect(volume(r.modele, p.occurrence)).toBeCloseTo(3 * 0.005, 12);
    expect(meta(r.modele, p.occurrence).source).toEqual(src);
    expect(meta(r.modele, p.occurrence).longueur).toBeCloseTo(3, 12);
    const b = boite(r.modele);
    expect(b.x).toEqual([0, 3]);
    expect(b.y[1] - b.y[0]).toBeCloseTo(0.1, 12);
    expect(Object.keys(piecesLiees(r.modele))).toEqual([p.occurrence]);
  });

  it("pièce coupée en onglet : la coupe est rejouée sur la nouvelle section (angles inchangés)", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, rect(0.08, 0.08), PLACEMENT_DEFAUT, OPT);
    const b = poserPiece(a.modele, { a: v3(2, 0, 0), b: v3(2, 2, 0) }, rect(0.08, 0.08), PLACEMENT_DEFAUT, OPT);
    const o = ongletPieces(b.modele, a.occurrence, b.occurrence);
    const r = changerSectionPiece(o.modele, a.occurrence, rect(0.1, 0.1), { genre: "saisie" }, "100 × 100");
    expect(meta(r.modele, a.occurrence).coupeFin?.angle).toBeCloseTo(45, 9);
    expect(volume(r.modele, a.occurrence)).toBeCloseTo(2 * 0.01, 12);
  });
});

describe("Rotation axiale (L17)", () => {
  it("90° : largeur et hauteur échangées autour de l'axe ; deux rotations de 180° reviennent à l'état initial", () => {
    const p = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(3, 0, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    const r = tournerPieceAxe(p.modele, p.occurrence, 90);
    const b = boite(r.modele);
    expect(b.y[1] - b.y[0]).toBeCloseTo(0.04, 12);
    expect(b.z[1] - b.z[0]).toBeCloseTo(0.08, 12);
    const r2 = tournerPieceAxe(tournerPieceAxe(p.modele, p.occurrence, 180).modele, p.occurrence, 180);
    expect(meta(r2.modele, p.occurrence).placement.rotationAxe).toBe(0);
  });
});

describe("Alignement de face (L17)", () => {
  it("face de la pièce amenée coplanaire à une face cible parallèle (± 1e-9) ; faces non parallèles refusées", () => {
    const p = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(3, 0, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    // Dessus de la pièce (z = 0,02, normale +z) sur une face cible horizontale en z = 1.
    const r = alignerFacePiece(p.modele, p.occurrence, { point: v3(1, 0, 0.02), normale: v3(0, 0, 1) }, { point: v3(0, 0, 1), normale: v3(0, 0, -1) });
    expect(boite(r.modele).z[1]).toBeCloseTo(1, 9);
    expect(() => alignerFacePiece(p.modele, p.occurrence, { point: v3(1, 0, 0.02), normale: v3(0, 0, 1) }, { point: v3(0, 0, 1), normale: v3(1, 0, 0) })).toThrow(ERREUR_ALIGNER_PARALLELE);
  });
});

describe("Échelle d'une pièce (L17)", () => {
  it("le long de l'axe : longueur × 2 (décalages compris) ; en travers : refus nommé ; pièce coupée : refus", () => {
    const p = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(3, 0, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    const r = mettreAEchelle(p.modele, [p.occurrence], v3(0, 0, 0), v3(2, 1, 1));
    expect(boite(r.modele).x).toEqual([0, 6]);
    expect(volume(r.modele, p.occurrence)).toBeCloseTo(6 * 0.0032, 12);
    expect(() => mettreAEchelle(p.modele, [p.occurrence], v3(0, 0, 0), v3(1, 2, 1))).toThrow(ERREUR_ECHELLE_PIECE);
    expect(() => mettreAEchelle(p.modele, [p.occurrence], v3(0, 0, 0), 2)).toThrow(ERREUR_ECHELLE_PIECE);
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, rect(0.08, 0.08), PLACEMENT_DEFAUT, OPT);
    const b = poserPiece(a.modele, { a: v3(2, 0, 0), b: v3(2, 2, 0) }, rect(0.08, 0.08), PLACEMENT_DEFAUT, OPT);
    const o = ongletPieces(b.modele, a.occurrence, b.occurrence);
    expect(() => mettreAEchelle(o.modele, [a.occurrence], v3(0, 0, 0), v3(2, 1, 1))).toThrow(ERREUR_ECHELLE_PIECE_COUPEE);
  });

  it("axes des pièces pour l'inférence « axe de pièce »", () => {
    const p = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(3, 0, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    const ax = axesDesPieces(p.modele);
    expect(ax).toHaveLength(1);
    expect([ax[0]!.a.x, ax[0]!.b.x]).toEqual([0, 3]);
  });
});

describe("Revue de #130 — un objet verrouillé ne se modifie pas par les commandes de pièce", () => {
  it("verrouillé : section, rotation axiale, allongement (Onglet) et échelle refusés ; déverrouillé : accepté", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    const verrou = verrouillerOccurrences(a.modele, [a.occurrence], true).modele;
    expect(() => changerSectionPiece(verrou, a.occurrence, rect(0.1, 0.05), { genre: "saisie" }, "100 × 50")).toThrow(/verrouillé/);
    expect(() => tournerPieceAxe(verrou, a.occurrence, 90)).toThrow(/verrouillé/);
    expect(() => mettreAEchelle(verrou, [a.occurrence], v3(0, 0, 0), v3(1.5, 1, 1))).toThrow(/verrouillé/);
    expect(() => tournerPieceAxe(verrouillerOccurrences(verrou, [a.occurrence], false).modele, a.occurrence, 90)).not.toThrow();
  });
});

describe("Revue de #130 — repère de la pièce : étirement le long d'un axe quelconque", () => {
  it("pièce diagonale (1, 1, 0) : repère pièce, facteur 2 → longueur doublée, origine fixe ; sans repère pièce → refus", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(1, 1, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    expect(() => mettreAEchelle(a.modele, [a.occurrence], v3(0, 0, 0), v3(2, 1, 1))).toThrow(ERREUR_ECHELLE_PIECE);
    const r = mettreAEchelle(a.modele, [a.occurrence], v3(0, 0, 0), v3(2, 1, 1), { axePiece: true });
    expect(meta(r.modele, a.occurrence).longueur).toBeCloseTo(2 * Math.SQRT2, 9);
  });

  it("repère pièce : deux facteurs distincts sur une pièce refusés ; plusieurs pièces refusées", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(1, 1, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    expect(() => mettreAEchelle(a.modele, [a.occurrence], v3(0, 0, 0), v3(2, 3, 1), { axePiece: true })).toThrow(ERREUR_ECHELLE_PIECE_REPERE);
    const b = poserPiece(a.modele, { a: v3(0, 2, 0), b: v3(1, 3, 0) }, rect(0.08, 0.04), PLACEMENT_DEFAUT, OPT);
    expect(() => mettreAEchelle(b.modele, [a.occurrence, b.occurrence], v3(0, 0, 0), 2, { axePiece: true })).toThrow(ERREUR_ECHELLE_PIECE_REPERE);
  });
});
