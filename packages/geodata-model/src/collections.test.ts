import { describe, expect, it } from "vitest";
import { ajouterCarte, deplacerCarte, retirerCarte, titreCollectionValide, type CarteDeCollection } from "./collections.js";

const A: CarteDeCollection = { id: "a", nom: "Carte A", etat: "active" };
const B: CarteDeCollection = { id: "b", nom: "Carte B", etat: "active" };
const C: CarteDeCollection = { id: "c", nom: "Carte C", etat: "archivee" };

describe("collection de cartes (D-GD-36)", () => {
  it("ajoute en dernière position, sans doublon", () => {
    expect(ajouterCarte([A], B).map((c) => c.id)).toEqual(["a", "b"]);
    expect(ajouterCarte([A, B], A).map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("retire une référence sans toucher aux autres", () => {
    expect(retirerCarte([A, B, C], "b").map((c) => c.id)).toEqual(["a", "c"]);
    expect(retirerCarte([A], "z").map((c) => c.id)).toEqual(["a"]);
  });
  it("monte et descend d'un rang ; aux extrémités, rien ne change", () => {
    expect(deplacerCarte([A, B, C], "b", -1).map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(deplacerCarte([A, B, C], "b", 1).map((c) => c.id)).toEqual(["a", "c", "b"]);
    expect(deplacerCarte([A, B, C], "a", -1).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(deplacerCarte([A, B, C], "c", 1).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(deplacerCarte([A, B], "z", 1).map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("titre de 1 à 120 caractères utiles", () => {
    expect(titreCollectionValide("Atlas")).toBe(true);
    expect(titreCollectionValide("   ")).toBe(false);
    expect(titreCollectionValide("x".repeat(121))).toBe(false);
  });
});
