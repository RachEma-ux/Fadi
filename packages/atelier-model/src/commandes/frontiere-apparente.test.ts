import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "esquisse.ligne", params: { id: "l", niveauId: "n0", points: [pt(0, 0), pt(4, 0)] } },
    // Limite courte, loin de la ligne : seule sa droite porteuse (prolongée) la croise en x = 6.
    { type: "esquisse.ligne", params: { id: "limite", niveauId: "n0", points: [pt(6, 5), pt(6, 7)] } },
    { type: "esquisse.ligne", params: { id: "courte", niveauId: "n0", points: [pt(2, 5), pt(2, 6)] } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 10), b: pt(5, 10), epaisseur: m(0.2) } },
    { type: "mur.tracer", params: { id: "w2", niveauId: "n0", a: pt(8, 12), b: pt(8, 20), epaisseur: m(0.2) } },
  ])).etat;
const L = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params.points;

describe("frontière apparente (prolongée) et jonction forcée (D-061)", () => {
  it("prolonger jusqu'à une limite qui ne touche pas : sa droite porteuse sert de frontière", () => {
    const r = appliquerLot(base(), lot([{ type: "transformer.prolonger", params: { id: "l", limiteId: "limite" } }], "p")).etat;
    expect(L(r, "l")[1]).toEqual(pt(6, 0));
  });

  it("ajuster sur une frontière apparente qui coupe l'objet", () => {
    const r = appliquerLot(base(), lot([{ type: "transformer.ajuster", params: { id: "l", limiteId: "courte" } }], "a")).etat;
    const q = L(r, "l");
    expect(q.some((x) => Math.abs(x.x - 2) < 1e-9)).toBe(true);
  });

  it("jonction forcée de deux murs qui ne se touchent pas (mur.joindre)", () => {
    const r = appliquerLot(base(), lot([{ type: "mur.joindre", params: { id: "w", autreId: "w2" } }], "j")).etat;
    expect((r.objets["w"] as Occurrence<"mur">).params.b).toEqual(pt(8, 10));
  });
});
