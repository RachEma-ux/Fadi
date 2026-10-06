import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { modeleVide, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
// Fenêtre libre (non rectangulaire) autour de la zone x ∈ [4, 7], y ∈ [-1, 5].
const fenetre = [pt(4, -1), pt(7, -1.5), pt(7.5, 5), pt(4.2, 5.5)];
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "w", position: 0.2, largeur: m(1), hauteur: m(1), allege: m(1) } },
    { type: "objet.creer", params: { id: "p", classe: "esquisse", niveauId: "n", params: { forme: "polyligne", points: [pt(0, 2), pt(5, 2), pt(5, 4)], ferme: false } } },
    { type: "objet.creer", params: { id: "r", classe: "esquisse", niveauId: "n", params: { forme: "rectangle", points: [pt(1, 3), pt(5, 4.5)], ferme: true } } },
    { type: "objet.creer", params: { id: "c", classe: "esquisse", niveauId: "n", params: { forme: "cercle", centre: pt(6, 1), rayon: m(0.5), points: [], ferme: true } } },
    { type: "objet.creer", params: { id: "loin", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(-5, -5), pt(-4, -5)], ferme: false } } },
  ])).etat;

describe("étirer par fenêtre polygonale (D-116, DA-02-06)", () => {
  it("étire les sommets dans la fenêtre, déplace les objets entiers, laisse le reste ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.etirerFenetre", params: { niveauId: "n", fenetre, dx: 1, dy: 0 } }], "s"));
    const o = r.etat.objets;
    const w = o["w"] as Occurrence<"mur">;
    expect(w.params.a).toEqual(pt(0, 0));
    expect(w.params.b).toEqual(pt(6, 0));
    // L'ouverture garde sa distance à l'extrémité fixe (1 m du début).
    expect((o["f"] as Occurrence<"fenetre">).params.position * 6).toBeCloseTo(1, 9);
    expect((o["p"] as Occurrence<"esquisse">).params.points).toEqual([pt(0, 2), pt(6, 2), pt(6, 4)]);
    const rect = (o["r"] as Occurrence<"esquisse">).params;
    expect(rect.forme).toBe("polygone");
    expect(rect.points).toEqual([pt(1, 3), pt(6, 3), pt(6, 4.5), pt(1, 4.5)]);
    expect((o["c"] as Occurrence<"esquisse">).params.centre).toEqual(pt(7, 1));
    expect(o["loin"]).toEqual(e.objets["loin"]);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("refus motivés : fenêtre vide, déplacement nul, contour qui se croise ; objets verrouillés laissés", () => {
    const e = base();
    const cmd = (params: Record<string, unknown>) => appliquerLot(e, lot([{ type: "transformer.etirerFenetre", params: { niveauId: "n", fenetre, dx: 1, dy: 0, ...params } }], "x"));
    expect(() => cmd({ fenetre: [pt(20, 20), pt(21, 20), pt(21, 21)] })).toThrow(/aucun sommet/);
    expect(() => cmd({ dx: 0 })).toThrow(/déplacement nul/);
    expect(() => cmd({ fenetre: [pt(0, 0), pt(1, 0)] })).toThrow(/trois sommets/);
    const d = appliquerLot(e, lot([{ type: "objet.creer", params: { id: "d", classe: "dalle", niveauId: "n", params: { contour: [pt(10, 0), pt(14, 0), pt(14, 3), pt(10, 3)], trous: [], epaisseur: m(0.2) } } }], "d")).etat;
    // Le sommet (14, 3) passé au-delà de (10, 0) croiserait le contour.
    expect(() => appliquerLot(d, lot([{ type: "transformer.etirerFenetre", params: { niveauId: "n", fenetre: [pt(13.5, 2.5), pt(14.5, 2.5), pt(14.5, 3.5), pt(13.5, 3.5)], dx: -2, dy: -5 } }], "x"))).toThrow(/d : contour qui se croise/);
    const ok = appliquerLot(d, lot([{ type: "transformer.etirerFenetre", params: { niveauId: "n", fenetre: [pt(13.5, 2.5), pt(14.5, 2.5), pt(14.5, 3.5), pt(13.5, 3.5)], dx: 1, dy: 1 } }], "y")).etat;
    expect((ok.objets["d"] as Occurrence<"dalle">).params.contour[2]).toEqual(pt(15, 4));
    const v = appliquerLot(e, lot([{ type: "objet.verrouiller", params: { ids: ["p"], verrouille: true } }], "v")).etat;
    const rv = appliquerLot(v, lot([{ type: "transformer.etirerFenetre", params: { niveauId: "n", fenetre, dx: 1, dy: 0 } }], "z")).etat;
    expect(rv.objets["p"]!.params).toEqual(e.objets["p"]!.params);
  });
});
