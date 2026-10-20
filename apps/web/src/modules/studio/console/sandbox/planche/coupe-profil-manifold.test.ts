/** Lot L13 — coupe par profil avec le vrai moteur manifold-3d (Node, WASM) : volume V − V∩, métadonnées gardées. */
import { describe, expect, it } from "vitest";
import { PLACEMENT_DEFAUT, contexte, couperParProfil, estSolide, modeleVide, piecesLiees, poserPiece, volume, type SectionProfil } from "@parcours/sandbox-planche-model";
import { chargerBooleens } from "./booleens-manifold";

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
/** Section carrée d'essai (donnée du test). */
const carre = (c: number): SectionProfil => ({ exterieur: [{ y: -c / 2, z: -c / 2 }, { y: c / 2, z: -c / 2 }, { y: c / 2, z: c / 2 }, { y: -c / 2, z: c / 2 }], trous: [] });
const OPT = { designation: "Carré d'essai", source: { genre: "saisie" } as const };

describe("Coupe par profil (L13, manifold-3d)", () => {
  it("poteau 0,2 × 0,2 × 3 coupé par une poutre 0,1 × 0,1 qui le traverse : V − V∩ (± 1e-6), poutre gardée, métadonnées gardées", async () => {
    const booleens = await chargerBooleens();
    const poteau = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(0, 0, 3) }, carre(0.2), PLACEMENT_DEFAUT, OPT);
    const poutre = poserPiece(poteau.modele, { a: v3(-1, 0, 2), b: v3(1, 0, 2) }, carre(0.1), PLACEMENT_DEFAUT, OPT);
    const V = volume(poutre.modele, poteau.occurrence)!;
    const inter = 0.2 * 0.1 * 0.1; // la poutre traverse le poteau sur sa largeur
    const t0 = performance.now();
    const r = couperParProfil(poutre.modele, poteau.occurrence, poutre.occurrence, booleens);
    console.log(`⏱ coupe par profil (manifold-3d, Node) : ${Math.round(performance.now() - t0)} ms`);
    expect(estSolide(r.modele, poteau.occurrence)).toBe(true);
    expect(volume(r.modele, poteau.occurrence)!).toBeCloseTo(V - inter, 6);
    expect(volume(r.modele, poutre.occurrence)!).toBeCloseTo(2 * 0.01, 9);
    const d = r.modele.definitions[contexte(r.modele).occurrences[poteau.occurrence]!.definition]!;
    expect(d.piece?.designation).toBe("Carré d'essai");
    expect(d.piece?.coupesProfil).toBe(1);
    expect(Object.keys(piecesLiees(r.modele))).toHaveLength(0);
  });

  it("pièces qui ne se recouvrent pas : refus nommé ; sans moteur : refus nommé", async () => {
    const booleens = await chargerBooleens();
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(1, 0, 0) }, carre(0.1), PLACEMENT_DEFAUT, OPT);
    const b = poserPiece(a.modele, { a: v3(0, 5, 0), b: v3(1, 5, 0) }, carre(0.1), PLACEMENT_DEFAUT, OPT);
    expect(() => couperParProfil(b.modele, a.occurrence, b.occurrence, booleens)).toThrow(/ne se recouvrent pas/);
    expect(() => couperParProfil(b.modele, a.occurrence, b.occurrence, undefined)).toThrow(/moteur booléen/);
  });
});
