import { describe, expect, it } from "vitest";
import { studio2d } from "@parcours/domain-model";
import { descriptionElement, idRequete, revisionCible, revisionPlusRecente } from "./etat-2d";

const m = (v: number) => `${v.toFixed(3)} m`;

describe("état de la Planche 2D", () => {
  it("un nouvel essai rejoue la même requête seulement pour le même dessin", () => {
    const doc = studio2d.documentVide();
    const autre = { ...doc };
    let n = 0;
    const nouvel = () => `req_${++n}`;
    expect(idRequete(null, doc, nouvel)).toBe("req_1");
    expect(idRequete({ requestId: "req_a", contenu: doc }, doc, nouvel)).toBe("req_a");
    expect(idRequete({ requestId: "req_a", contenu: doc }, autre, nouvel)).toBe("req_2");
  });

  it("révision plus récente : comparée par numéro (une liste en retard ne signale rien)", () => {
    expect(revisionPlusRecente(null, null)).toBe(false);
    expect(revisionPlusRecente({ numero: 1 }, null)).toBe(true);
    expect(revisionPlusRecente({ numero: 2 }, { numero: 3 })).toBe(false);
    expect(revisionPlusRecente({ numero: 3 }, { numero: 3 })).toBe(false);
    expect(revisionPlusRecente({ numero: 4 }, { numero: 3 })).toBe(true);
  });

  it("révision cible : l'adresse, sinon la tête épinglée ; jamais la tête relue en arrière-plan", () => {
    expect(revisionCible("rev_x", { id: "rev_a" })).toBe("rev_x");
    expect(revisionCible(null, { id: "rev_a" })).toBe("rev_a");
    expect(revisionCible(null, { id: null })).toBeNull();
    expect(revisionCible(null, null)).toBeUndefined();
  });

  it("description d'un élément : type et mesure", () => {
    expect(descriptionElement({ id: "l", type: "ligne", calqueId: "c", a: { x: 0, y: 0 }, b: { x: 3, y: 4 } }, m)).toBe("Ligne · 5.000 m");
    expect(descriptionElement({ id: "r", type: "rectangle", calqueId: "c", origine: { x: 0, y: 0 }, largeur: 3, hauteur: 2 }, m)).toBe("Rectangle · 3.000 m × 2.000 m");
    const cote: studio2d.Cote = { id: "k", type: "cote", calqueId: "c", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 1, liens: { a: null, b: null }, aResoudre: false };
    expect(descriptionElement(cote, m)).toBe("Cote · 4.000 m");
    expect(descriptionElement({ ...cote, aResoudre: true }, m)).toBe("Cote · 4.000 m · à résoudre");
  });
});
