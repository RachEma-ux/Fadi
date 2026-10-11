/** Lot L13 : onglet de deux pièces, allonger / raccourcir — angles dérivés, longueurs exactes, refus nommés. */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ERREUR_BOUT_ONGLET,
  ERREUR_ONGLET_GAUCHE,
  ERREUR_ONGLET_PARALLELE,
  ERREUR_PAS_UNE_PIECE,
  ERREUR_PIECE_MISE_A_L_ECHELLE,
  ERREUR_PIECE_RECOUPEE,
  ajouterSegment,
  allongerPiece,
  contexte,
  deplacer,
  demiSectionPiece,
  estSolide,
  mettreAEchelle,
  modeleVide,
  ongletPieces,
  piecesLiees,
  poserPiece,
  volume,
} from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { PLACEMENT_DEFAUT, type SectionProfil } from "./profiles.js";
import { v3, type Vec3 } from "./vecteur.js";

/** Section carrée d'essai (donnée du test) : côté `c` centré. */
const carre = (c: number): SectionProfil => ({ exterieur: [{ y: -c / 2, z: -c / 2 }, { y: c / 2, z: -c / 2 }, { y: c / 2, z: c / 2 }, { y: -c / 2, z: c / 2 }], trous: [] });
const S = carre(0.1);
const OPT = { designation: "Carré d'essai", source: { genre: "saisie" } as const };
const poser = (m: Modele, a: Vec3, b: Vec3) => poserPiece(m, { a, b }, S, PLACEMENT_DEFAUT, OPT);
const meta = (m: Modele, o: Id) => m.definitions[contexte(m).occurrences[o]!.definition]!.piece!;
const pts = (m: Modele) => geometrieVisible(m).faces.flatMap((f) => f.exterieur);

describe("Onglet (L13)", () => {
  it("deux pièces carrées à 90° : coupes à 45° enregistrées, longueurs sur l'arête extérieure exactes, solides", () => {
    const a = poser(modeleVide(), v3(0, 0, 0), v3(2, 0, 0));
    const b = poser(a.modele, v3(2, 0, 0), v3(2, 3, 0));
    const r = ongletPieces(b.modele, a.occurrence, b.occurrence);
    expect(meta(r.modele, a.occurrence).coupeFin?.angle).toBeCloseTo(45, 9);
    expect(meta(r.modele, b.occurrence).coupeDebut?.angle).toBeCloseTo(45, 9);
    expect(meta(r.modele, a.occurrence).coupeDebut).toBeUndefined();
    expect(estSolide(r.modele, a.occurrence) && estSolide(r.modele, b.occurrence)).toBe(true);
    // Arête extérieure (côté −y de la première, +x de la seconde) : 2 + 0,05 et 3 + 0,05 ; intérieure : 2 − 0,05.
    const P = pts(r.modele);
    expect(Math.max(...P.map((p) => p.x))).toBeCloseTo(2.05, 12);
    expect(Math.min(...P.map((p) => p.y))).toBeCloseTo(-0.05, 12);
    expect(volume(r.modele, a.occurrence)).toBeCloseTo(2 * 0.01, 12); // trapèze : longueur moyenne = axe
  });

  it("pièces à 120° : coupes à 30° ; extrémités prolongées jusqu'au point de rencontre", () => {
    const a = poser(modeleVide(), v3(0, 0, 0), v3(1.9, 0, 0));
    const dir = v3(Math.cos((60 * Math.PI) / 180), Math.sin((60 * Math.PI) / 180), 0);
    const b = poser(a.modele, v3(2 + 0.1 * dir.x, 0.1 * dir.y, 0), v3(2 + 3 * dir.x, 3 * dir.y, 0));
    const r = ongletPieces(b.modele, a.occurrence, b.occurrence);
    expect(meta(r.modele, a.occurrence).coupeFin?.angle).toBeCloseTo(30, 9);
    expect(meta(r.modele, b.occurrence).coupeDebut?.angle).toBeCloseTo(30, 9);
    expect(meta(r.modele, a.occurrence).longueur).toBeCloseTo(2, 12);
    expect(meta(r.modele, b.occurrence).longueur).toBeCloseTo(3, 12);
  });

  it("refus nommés : pièces parallèles, axes gauches, objet qui n'est pas une pièce", () => {
    const a = poser(modeleVide(), v3(0, 0, 0), v3(2, 0, 0));
    const par = poser(a.modele, v3(0, 1, 0), v3(2, 1, 0));
    expect(() => ongletPieces(par.modele, a.occurrence, par.occurrence)).toThrow(ERREUR_ONGLET_PARALLELE);
    const gauche = poser(a.modele, v3(1, 1, 1), v3(1, 2, 1));
    expect(() => ongletPieces(gauche.modele, a.occurrence, gauche.occurrence)).toThrow(ERREUR_ONGLET_GAUCHE);
    expect(() => ongletPieces(a.modele, a.occurrence, "o999")).toThrow(ERREUR_PAS_UNE_PIECE);
  });

  it("un pas, et le lien aux arêtes sources est retiré (pièce modifiée elle-même)", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(2, 0, 0)).modele;
    m = ajouterSegment(m, v3(2, 0, 0), v3(2, 3, 0)).modele;
    const [e1, e2] = Object.keys(m.racine.aretes) as [Id, Id];
    const a = poserPiece(m, { arete: e1 }, S, PLACEMENT_DEFAUT, OPT);
    const b = poserPiece(a.modele, { arete: e2 }, S, PLACEMENT_DEFAUT, OPT);
    expect(Object.keys(piecesLiees(b.modele))).toHaveLength(2);
    const r = ongletPieces(b.modele, a.occurrence, b.occurrence);
    expect(Object.keys(piecesLiees(r.modele))).toHaveLength(0);
  });
});

describe("Allonger / raccourcir (L13)", () => {
  it("valeur signée : +0,2 puis −0,5 à la fin ; demi-section (demi-largeur, rotation comprise)", () => {
    const a = poser(modeleVide(), v3(0, 0, 0), v3(2, 0, 0));
    const r1 = allongerPiece(a.modele, a.occurrence, "fin", 0.2);
    expect(Math.max(...pts(r1.modele).map((p) => p.x))).toBeCloseTo(2.2, 12);
    const r2 = allongerPiece(r1.modele, a.occurrence, "fin", -0.5);
    expect(Math.max(...pts(r2.modele).map((p) => p.x))).toBeCloseTo(1.7, 12);
    const d = demiSectionPiece(r2.modele, a.occurrence);
    expect(d.largeur).toBeCloseTo(0.05, 12);
    const r3 = allongerPiece(r2.modele, a.occurrence, "debut", d.largeur);
    expect(Math.min(...pts(r3.modele).map((p) => p.x))).toBeCloseTo(-0.05, 12);
    expect(volume(r3.modele, a.occurrence)).toBeCloseTo(1.75 * 0.01, 12);
  });

  it("le lien est gardé : l'arête allongée ensuite régénère avec le décalage ; extrémité en onglet refusée", () => {
    const m0 = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(2, 0, 0)).modele;
    const e = Object.keys(m0.racine.aretes)[0] as Id;
    const a = poserPiece(m0, { arete: e }, S, PLACEMENT_DEFAUT, OPT);
    const r = allongerPiece(a.modele, a.occurrence, "fin", 0.1);
    expect(Object.keys(piecesLiees(r.modele))).toEqual([a.occurrence]);
    const b = contexte(r.modele).aretes[e]!.b;
    const m2 = deplacer(r.modele, [b], v3(1, 0, 0)).modele;
    expect(Math.max(...pts(m2).map((p) => p.x))).toBeCloseTo(3.1, 12);
    const p1 = poser(modeleVide(), v3(0, 0, 0), v3(2, 0, 0));
    const p2 = poser(p1.modele, v3(2, 0, 0), v3(2, 2, 0));
    const o = ongletPieces(p2.modele, p1.occurrence, p2.occurrence);
    expect(() => allongerPiece(o.modele, p1.occurrence, "fin", 0.1)).toThrow(ERREUR_BOUT_ONGLET);
  });
});

describe("Revue de #127 — refus au lieu d'une régénération qui effacerait", () => {
  it("onglet d'une pièce recoupée par un profil : refusé (la coupe ne se régénère pas)", () => {
    const a = poser(modeleVide(), v3(0, 0, 0), v3(2, 0, 0));
    const b = poser(a.modele, v3(2, 0, 0), v3(2, 3, 0));
    const defB = contexte(b.modele).occurrences[b.occurrence]!.definition;
    const d = b.modele.definitions[defB]!;
    const m: Modele = { ...b.modele, definitions: { ...b.modele.definitions, [defB]: { ...d, piece: { ...d.piece!, coupesProfil: 1 } } } };
    expect(() => ongletPieces(m, a.occurrence, b.occurrence)).toThrow(ERREUR_PIECE_RECOUPEE);
  });

  it("pièce mise à l'échelle : Onglet et Allonger refusent (l'échelle serait effacée sans le dire)", () => {
    const a = poser(modeleVide(), v3(0, 0, 0), v3(2, 0, 0));
    const b = poser(a.modele, v3(2, 0, 0), v3(2, 3, 0));
    const m = mettreAEchelle(b.modele, [a.occurrence], v3(0, 0, 0), 1.5).modele;
    expect(() => allongerPiece(m, a.occurrence, "fin", 0.2)).toThrow(ERREUR_PIECE_MISE_A_L_ECHELLE);
    expect(() => ongletPieces(m, a.occurrence, b.occurrence)).toThrow(ERREUR_PIECE_MISE_A_L_ECHELLE);
    // Une pièce seulement tournée garde un repère orthonormé : acceptée.
    expect(() => allongerPiece(b.modele, b.occurrence, "fin", 0.2)).not.toThrow();
  });
});
