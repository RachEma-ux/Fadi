import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { etendueVerticale } from "./commandes/poses.js";
import { modeleVide } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = (x: number) => [pt(x, 0), pt(x + 2, 0), pt(x + 2, 2), pt(x, 2)];

const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "poteau.creer", params: { id: "p", niveauId: "n", point: pt(1, 1), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(2.8) } },
    { type: "dalle.creer", params: { id: "d", niveauId: "n1", contour: carre(0), trous: [], epaisseur: m(0.25), sens: "bas" } },
    { type: "objet.creer", params: { id: "s", classe: "solide", niveauId: "n", params: { contour: carre(0), trous: [], ferme: true, hauteur: m(1) } } },
  ])).etat;

const z = (e: ReturnType<typeof base>, id: string) => etendueVerticale(e, e.objets[id])!;

describe("contraintes verticales (D-155, DA-01-07)", () => {
  it("posé sur : la dalle (épaisseur vers le bas) vient sur le poteau ; elle suit sa hauteur ; même sommet", () => {
    const e = appliquerLot(base(), lot([{ type: "pose.ajouter", params: { id: "k", genre: "pose-sur", porteId: "d", porteurId: "p" } }])).etat;
    expect(z(e, "d").bas).toBeCloseTo(2.8, 9);
    const h = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { hauteur: m(2.6) } } }], "h")).etat;
    expect(z(h, "d").bas).toBeCloseTo(2.6, 9);
    const t = appliquerLot(h, lot([{ type: "pose.ajouter", params: { id: "k2", genre: "meme-sommet", porteId: "s", porteurId: "d" } }], "t")).etat;
    expect(z(t, "s").haut).toBeCloseTo(z(t, "d").haut, 9);
    // Chaîne : le poteau change, la dalle puis le solide suivent dans le même lot.
    const c = appliquerLot(t, lot([{ type: "objet.modifier", params: { id: "p", params: { hauteur: m(3) } } }], "c")).etat;
    expect(z(c, "s").haut).toBeCloseTo(3.25, 9);
  });

  it("refus : porteur absent de hauteur, poteau porté, deux porteurs, cycle ; porteur supprimé : le porté garde son altitude", () => {
    const e = appliquerLot(base(), lot([{ type: "pose.ajouter", params: { id: "k", genre: "pose-sur", porteId: "d", porteurId: "p" } }])).etat;
    expect(() => appliquerLot(e, lot([{ type: "pose.ajouter", params: { genre: "pose-sur", porteId: "p", porteurId: "d" } }], "a"))).toThrow(/seuls une dalle/);
    expect(() => appliquerLot(e, lot([{ type: "pose.ajouter", params: { genre: "meme-base", porteId: "d", porteurId: "s" } }], "b"))).toThrow(/déjà un porteur/);
    const s = appliquerLot(e, lot([{ type: "pose.ajouter", params: { id: "k3", genre: "pose-sur", porteId: "s", porteurId: "d" } }], "c")).etat;
    expect(() => appliquerLot(s, lot([{ type: "pose.ajouter", params: { genre: "pose-sur", porteId: "d", porteurId: "s" } }], "d"))).toThrow(/déjà un porteur|cycle/);
    const sup = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "p" } }], "s")).etat;
    // Porteur supprimé : la contrainte disparaît avec lui, le porté garde son altitude.
    expect(sup.relations["k"]).toBeUndefined();
    expect(z(sup, "d").bas).toBeCloseTo(2.8, 9);
  });
});
