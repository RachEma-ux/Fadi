import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { objetsSemblables } from "./selection-semblables.js";
import { modeleVide } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const poteau = (id: string, niveauId: string, x: number) => ({ type: "poteau.creer", params: { id, niveauId, point: pt(x, 0), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } });

describe("sélection des semblables (D-134, DA-02-17)", () => {
  it("même classe et même type, niveau ou tous les niveaux ; verrouillés écartés ; transformation multi-niveaux en un lot", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
      { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
      poteau("a", "n0", 0), poteau("b", "n0", 2), poteau("c", "n1", 0), poteau("d", "n1", 2),
      { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 5), b: pt(4, 5), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "objet.verrouiller", params: { ids: ["d"], verrouille: true } },
    ])).etat;
    expect(objetsSemblables(e, "a")).toEqual(["a", "b"]);
    expect(objetsSemblables(e, "a", { tousNiveaux: true })).toEqual(["a", "b", "c"]);
    const r = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: objetsSemblables(e, "a", { tousNiveaux: true }) }], "d"));
    expect([r.etat.objets["a"], r.etat.objets["c"]].map((o) => (o!.params as { point: { x: number } }).point.x)).toEqual([1, 1]);
    expect(objetsSemblables(e, "inconnu")).toEqual([]);
  });
});
