import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { modeleVide } from "./modele.js";
import { cleReservationConnue, clesReservation, libelleCleReservation, zonesTouchant } from "./reservations.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

describe("réservations par zone (D-143, DA-21-01)", () => {
  const e = appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "objet.creer", params: { id: "z", classe: "zone", niveauId: "n", params: { contour: [pt(0, 0), pt(5, 0), pt(5, 5), pt(0, 5)], trous: [], nom: "Nord" } } },
    { type: "mur.tracer", params: { id: "dedans", niveauId: "n", a: pt(1, 1), b: pt(8, 1), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "bord", niveauId: "n", a: pt(5, 2), b: pt(9, 2), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "dehors", niveauId: "n", a: pt(6, 6), b: pt(9, 6), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "etage", niveauId: "n1", a: pt(1, 1), b: pt(3, 1), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "dedans", position: 0.1, largeur: m(0.6), hauteur: m(1), allege: m(1) } },
  ])).etat;

  it("un point caractéristique dans la zone (bord compris), sur son niveau, suffit", () => {
    expect(zonesTouchant(e, e.objets["dedans"]!)).toEqual(["z"]);
    expect(zonesTouchant(e, e.objets["bord"]!)).toEqual(["z"]);
    expect(zonesTouchant(e, e.objets["dehors"]!)).toEqual([]);
    expect(zonesTouchant(e, e.objets["etage"]!)).toEqual([]); // autre niveau
    expect(zonesTouchant(e, e.objets["f"]!)).toEqual(["z"]); // centre de la baie à x = 1,7
  });

  it("clés avant et après : un objet qui entre dans la zone la concerne ; clés connues et libellés", () => {
    const apres = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: -5, dy: -5 }, cibles: ["dehors"] }], "d")).etat;
    expect(clesReservation(e, apres, ["dehors"])).toEqual(["dehors", "niveau:n", "zone:z"]);
    expect(clesReservation(e, e, ["dehors"])).toEqual(["dehors", "niveau:n"]);
    expect(cleReservationConnue(e, "zone:z")).toBe(true);
    expect(cleReservationConnue(e, "zone:dedans")).toBe(false);
    expect(cleReservationConnue(e, "niveau:n1")).toBe(true);
    expect(libelleCleReservation(e, "zone:z")).toBe("la zone Nord");
    expect(libelleCleReservation(e, "niveau:n")).toBe("l'étage RDC");
    expect(libelleCleReservation(null, "m1")).toBe("l'objet m1");
  });
});
