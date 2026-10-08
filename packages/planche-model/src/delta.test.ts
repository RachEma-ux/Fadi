import { describe, expect, it } from "vitest";
import { ajouterRectangle, pousserTirer, grouper, modeleVide, modifierAnnotations, type Modele } from "./geometrie-libre.js";
import { appliquerDeltaPlanche, differencePlanche, empreintePlanche, estDeltaPlanche, lireModelePlanche, serialisationStable } from "./delta.js";
import { v3 } from "./vecteur.js";

function boite(m: Modele): Modele {
  const r = ajouterRectangle(m, v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const face = Object.keys(r.racine.faces)[0]!;
  return pousserTirer(r, face, 1).modele;
}

describe("lot 7 — delta, empreinte et lecture du modèle de la Planche", () => {
  it("différence puis application : le modèle d'arrivée est retrouvé à l'identique (empreinte égale)", () => {
    const a = boite(modeleVide());
    const b = grouper(a, [...Object.keys(a.racine.faces), ...Object.keys(a.racine.aretes)], { nom: "Boîte", genre: "composant", description: "test" }).modele;
    const c = modifierAnnotations(b, (an, id) => {
      const i = id("v");
      an.scenes[i] = { id: i, nom: "Scène 1", position: v3(5, 5, 5), cible: v3(0, 0, 0), champDeVision: 35, projection: "perspective" };
      an.reglages = { accrochageLongueur: 0.05, accrochageAngle: 15, extremitesTexte: "fleche-fermee", alignerTexte: "epingle", extremitesCote: "barre", alignerCote: "centre" };
    }).modele;
    const d1 = differencePlanche(a, c);
    expect(d1).not.toBeNull();
    expect(estDeltaPlanche(d1)).toBe(true);
    // Les faces et arêtes de la racine ont disparu (entrées `null`), une occurrence et une définition sont apparues.
    expect(Object.values(d1!.racine!.faces!).every((v) => v === null)).toBe(true);
    expect(Object.keys(d1!.racine!.occurrences!)).toHaveLength(1);
    expect(Object.keys(d1!.definitions!)).toHaveLength(1);
    expect(d1!.annotations!.reglages!.accrochageLongueur).toBe(0.05);
    const c2 = appliquerDeltaPlanche(a, d1!);
    expect(empreintePlanche(c2)).toBe(empreintePlanche(c));
    expect(serialisationStable(c2)).toBe(serialisationStable(c));
    // Retour : le delta inverse ramène à `a`.
    const d2 = differencePlanche(c, a);
    expect(empreintePlanche(appliquerDeltaPlanche(c, d2!))).toBe(empreintePlanche(a));
    expect(d2!.annotations!.reglages).toBeNull();
  });

  it("deux modèles identiques : aucun delta ; l'empreinte ne dépend pas de l'ordre des clés", () => {
    const a = boite(modeleVide());
    expect(differencePlanche(a, JSON.parse(JSON.stringify(a)) as Modele)).toBeNull();
    const melange = JSON.parse(JSON.stringify(a)) as Modele;
    const racine = { ...melange.racine, sommets: Object.fromEntries(Object.entries(melange.racine.sommets).reverse()) };
    expect(empreintePlanche({ ...melange, racine })).toBe(empreintePlanche(a));
    expect(empreintePlanche(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("lecture validée : un modèle bien formé passe, un modèle tronqué ou une définition sans contenu est refusée", () => {
    const a = boite(modeleVide());
    expect(lireModelePlanche(JSON.parse(JSON.stringify(a)))).not.toBeNull();
    expect(lireModelePlanche({ racine: {}, definitions: {}, prochainId: 1 })).toBeNull();
    expect(lireModelePlanche({ ...a, definitions: { d1: { id: "d1", nom: "x" } } })).toBeNull();
    expect(lireModelePlanche(null)).toBeNull();
    expect(estDeltaPlanche({ racine: { faces: { f1: 3 } } })).toBe(false);
    expect(estDeltaPlanche({ autre: {} })).toBe(false);
    expect(estDeltaPlanche({ prochainId: 4, annotations: { repere: null } })).toBe(true);
  });
});
