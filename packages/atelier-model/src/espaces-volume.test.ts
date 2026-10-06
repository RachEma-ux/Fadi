import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { espacesTraversant, etendueEspace } from "./espaces-volume.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { quantites } from "./quantites.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)];

const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n2", nom: "R+2", elevation: 6, hauteur: 3 } },
    { type: "objet.creer", params: { id: "atrium", classe: "espace", niveauId: "n0", params: { polygones: [{ contour: carre, trous: [] }], nom: "Atrium", niveauHautId: "n2" } } },
    { type: "objet.creer", params: { id: "local", classe: "espace", niveauId: "n1", params: { polygones: [{ contour: carre, trous: [] }], nom: "Local" } } },
  ])).etat;

describe("espaces en volume et sur plusieurs niveaux (D-142, DA-07-16)", () => {
  it("étendue jusqu'au niveau haut, niveaux traversés signalés, sans étendue : non évaluée", () => {
    const e = base();
    expect(etendueEspace(e, e.objets["atrium"] as Occurrence<"espace">)).toEqual([0, 6]);
    expect(etendueEspace(e, e.objets["local"] as Occurrence<"espace">)).toBeNull();
    expect(espacesTraversant(e, "n1").map((x) => x.id)).toEqual(["atrium"]);
    expect(espacesTraversant(e, "n2")).toEqual([]); // le niveau haut n'est pas traversé : l'espace s'y arrête
    const q = quantites(e);
    const rdc = q.niveaux.find((n) => n.niveauId === "n0")!;
    expect(rdc.espaces).toEqual([{ id: "atrium", nom: "Atrium", aire: 12, hauteur: 6, volume: 72, niveauxTraverses: ["n1"] }]);
    const r1 = q.niveaux.find((n) => n.niveauId === "n1")!;
    expect(r1.traversants).toEqual([{ id: "atrium", nom: "Atrium", niveauOrigineId: "n0", aire: 12 }]);
    expect(r1.espaces).toEqual([{ id: "local", nom: "Local", aire: 12 }]);
    // Volume 3D translucide de 0 à 6 m (à 12 mm près).
    const ma = maillageObjet(e, e.objets["atrium"]!)!;
    const zs = [...new Set(Array.from({ length: ma.positions.length / 3 }, (_, i) => ma.positions[3 * i + 2]!))].sort((a, b) => a - b);
    expect(zs).toEqual([0.012, 6 - 0.012]);
  });

  it("saisie contrôlée ; plan du niveau traversé ; IFC ; niveau haut protégé", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "local", params: { niveauHautId: "nx" } } }], "a"))).toThrow(/niveau inconnu/);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "local", params: { niveauHautId: "n2", hauteur: m(2) } } }], "b"))).toThrow(/pas les deux/);
    const vue = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v1", titre: "Plan R+1", type: "plan", niveauId: "n1", echelle: 100 } }], "v")).etat;
    const plan = genererVue(vue, vue.definitions["v1"]!.params as unknown as ParamsVue, "v1");
    expect(plan.primitives.some((p) => p.type === "texte" && /Vide : Atrium \(depuis RDC\)/.test((p as { texte: string }).texte))).toBe(true);
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu;
    expect(ifc).toMatch(/IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,6\.\)/);
    expect(() => appliquerLot(e, lot([{ type: "niveau.supprimer", params: { id: "n2" } }], "s"))).toThrow(/référence le niveau n2/);
    // Retrait : clé omise.
    const r = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "atrium", params: { niveauHautId: null } } }], "x")).etat;
    expect((r.objets["atrium"] as Occurrence<"espace">).params.niveauHautId).toBeUndefined();
  });
});
