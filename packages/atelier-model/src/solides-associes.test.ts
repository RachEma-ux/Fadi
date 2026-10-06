import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "esquisse.rectangle", params: { id: "r", niveauId: "n", points: [pt(0, 0), pt(2, 1)] } },
    { type: "esquisse.cercle", params: { id: "c", niveauId: "n", centre: pt(5, 5), rayon: m(1) } },
    { type: "esquisse.ligne", params: { id: "l", niveauId: "n", points: [pt(0, 0), pt(1, 1)] } },
    { type: "solide.extruder", params: { id: "s", niveauId: "n", contour: [pt(0, 0), pt(2, 0), pt(2, 1), pt(0, 1)], trous: [], ferme: true, hauteur: m(1), role: "solid", sourceId: "r" } },
  ])).etat;

describe("solide associé à une esquisse (D-114, DA-01-08)", () => {
  it("le solide suit l'esquisse modifiée ou déplacée (même révision) ; inverse exact ; source ouverte refusée", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 3, dy: 0 }, cibles: ["r"] }], "d"));
    expect((r.etat.objets["s"] as Occurrence<"solide">).params.contour[0]).toMatchObject({ x: 3, y: 0 });
    expect(r.effets.modifies).toContain("s");
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "solide.extruder", params: { niveauId: "n", contour: [pt(0, 0), pt(1, 0), pt(1, 1)], trous: [], ferme: true, hauteur: m(1), sourceId: "l" } }], "x"))).toThrow(/profil fermé/);
  });

  it("source cercle : contour discrétisé ; rayon changé, le solide suit ; source supprimée : lien perdu, contour gardé", () => {
    const e = appliquerLot(base(), lot([{ type: "solide.extruder", params: { id: "sc", niveauId: "n", contour: [pt(0, 0), pt(1, 0), pt(1, 1)], trous: [], ferme: true, hauteur: m(1), sourceId: "c" } }, { type: "objet.modifier", params: { id: "c", params: { rayon: m(2) } } }], "c")).etat;
    const sc = e.objets["sc"] as Occurrence<"solide">;
    expect(sc.params.contour).toHaveLength(48);
    expect(Math.max(...sc.params.contour.map((q) => q.x))).toBeCloseTo(7, 9);
    const sup = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "c" } }], "s")).etat.objets["sc"] as Occurrence<"solide">;
    expect(sup.params.sourceId).toBeUndefined();
    expect(sup.params.contour).toEqual(sc.params.contour);
  });
});
