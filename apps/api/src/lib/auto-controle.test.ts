import { describe, expect, it } from "vitest";
import { evaluerAutoControle, messageRefusAutoControle, perimetreRevisions, type RevisionAuteur } from "./auto-controle.js";

const rev = (id: string, parent: string | null, author: string, source = "authenticated-session"): RevisionAuteur => ({ id, parentRevisionId: parent, authorId: author, source });
const carte = (...rs: RevisionAuteur[]) => new Map(rs.map((r) => [r.id, r]));

// r0 (initialisation vide, A) ← r1 (B) ← r2 (A) ← r3 (B) ← r4 (C)
const chaine = carte(rev("r0", null, "A", "study-initialization"), rev("r1", "r0", "B"), rev("r2", "r1", "A"), rev("r3", "r2", "B"), rev("r4", "r3", "C"));

describe("auto-contrôle — périmètre", () => {
  it("remonte jusqu'à la racine sans approbation antérieure", () => {
    expect(perimetreRevisions(chaine, ["r4"], new Set()).map((r) => r.id)).toEqual(["r4", "r3", "r2", "r1", "r0"]);
  });
  it("s'arrête à la dernière révision déjà approuvée (exclue)", () => {
    expect(perimetreRevisions(chaine, ["r4"], new Set(["r2"])).map((r) => r.id)).toEqual(["r4", "r3"]);
  });
  it("révision figée déjà approuvée : périmètre vide", () => {
    expect(perimetreRevisions(chaine, ["r4"], new Set(["r4"]))).toEqual([]);
  });
  it("plusieurs sources (variantes coordonnées) sans doublon ; révision inconnue : arrêt ; boucle coupée", () => {
    const autre = carte(...chaine.values(), rev("x1", null, "D", "variant-derivation"), rev("x2", "x1", "E"));
    expect(perimetreRevisions(autre, ["r2", "x2", "r1"], new Set()).map((r) => r.id)).toEqual(["r2", "r1", "r0", "x2", "x1"]);
    expect(perimetreRevisions(carte(rev("a", "absente", "A")), ["a"], new Set()).map((r) => r.id)).toEqual(["a"]);
    expect(perimetreRevisions(carte(rev("a", "b", "A"), rev("b", "a", "B")), ["a"], new Set()).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("auto-contrôle — évaluation (OP-6)", () => {
  const perimetre = perimetreRevisions(chaine, ["r4"], new Set());
  it("auteur d'une révision : signalé, autorisé par défaut, refusé si l'option est désactivée", () => {
    expect(evaluerAutoControle({ approbateurId: "B", perimetre, dernierSoumetteurId: "C", autoControleAutorise: true }))
      .toEqual({ autoControle: true, revisionsAuteur: 2, soumisParLui: false, decision: "autorise" });
    expect(evaluerAutoControle({ approbateurId: "B", perimetre, dernierSoumetteurId: "C", autoControleAutorise: false }).decision).toBe("refuse");
  });
  it("aucun seuil : une seule révision suffit", () => {
    expect(evaluerAutoControle({ approbateurId: "C", perimetre, dernierSoumetteurId: null, autoControleAutorise: true })).toMatchObject({ autoControle: true, revisionsAuteur: 1 });
  });
  it("l'initialisation vide n'est pas une production ; la dérivation l'est", () => {
    const seul = [rev("r0", null, "A", "study-initialization")];
    expect(evaluerAutoControle({ approbateurId: "A", perimetre: seul, dernierSoumetteurId: null, autoControleAutorise: false }))
      .toEqual({ autoControle: false, revisionsAuteur: 0, soumisParLui: false, decision: "autorise" });
    expect(evaluerAutoControle({ approbateurId: "A", perimetre: [rev("v0", null, "A", "variant-initialization")], dernierSoumetteurId: null, autoControleAutorise: false }).autoControle).toBe(false);
    expect(evaluerAutoControle({ approbateurId: "A", perimetre: [rev("d0", null, "A", "variant-derivation")], dernierSoumetteurId: null, autoControleAutorise: false }).decision).toBe("refuse");
  });
  it("soumission seule : signalée", () => {
    expect(evaluerAutoControle({ approbateurId: "Z", perimetre, dernierSoumetteurId: "Z", autoControleAutorise: true }))
      .toEqual({ autoControle: true, revisionsAuteur: 0, soumisParLui: true, decision: "autorise" });
    expect(evaluerAutoControle({ approbateurId: "Z", perimetre, dernierSoumetteurId: "Z", autoControleAutorise: false }).decision).toBe("refuse");
  });
  it("tiers : ni signalé ni refusé, quelle que soit son option", () => {
    expect(evaluerAutoControle({ approbateurId: "Z", perimetre, dernierSoumetteurId: "C", autoControleAutorise: false }))
      .toEqual({ autoControle: false, revisionsAuteur: 0, soumisParLui: false, decision: "autorise" });
  });
  it("message du refus : motifs relevés, sans rien inventer", () => {
    expect(messageRefusAutoControle({ revisionsAuteur: 2, soumisParLui: true })).toContain("vous avez produit 2 révision(s) de ce dossier et vous l'avez soumis");
    expect(messageRefusAutoControle({ revisionsAuteur: 0, soumisParLui: true })).toMatch(/^Approbation refusée : vous l'avez soumis,/);
  });
});
