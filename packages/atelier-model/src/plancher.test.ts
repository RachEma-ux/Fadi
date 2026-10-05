import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { contoursExterieurs } from "./geometrie.js";
import { modeleVide, type ModeleAtelier } from "./modele.js";
import { proposerPlancher } from "./plancher.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const mur = (id: string, ax: number, ay: number, bx: number, by: number, ep = 0.2, niveauId = "n1") => ({ type: "mur.tracer", params: { id, niveauId, a: pt(ax, ay), b: pt(bx, by), epaisseur: m(ep), hauteur: m(3) } });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3, hauteur: 3 } },
    mur("w1", 0, 0, 10, 0),
    mur("w2", 10, 0, 10, 6, 0.4),
    mur("w3", 10, 6, 0, 6),
    mur("w4", 0, 6, 0, 0),
    mur("cloison", 5, 0, 5, 6, 0.1),
    mur("impasse", 10, 3, 12, 3),
  ])).etat;
const tri = (c: { x: number; y: number }[]) => c.map((p) => `${p.x},${p.y}`).sort();

describe("propositions de plancher (D-069, DA-07-05)", () => {
  it("contour extérieur des murs (cloison intérieure et mur en impasse ignorés), sur l'axe ou sur la face extérieure ; modèle inchangé", () => {
    const e = base();
    const avant = JSON.stringify(e);
    expect(contoursExterieurs(Object.values(e.objets).filter((o) => o.classe === "mur").map((o) => ({ id: o.id, a: (o.params as { a: { x: number; y: number } }).a, b: (o.params as { b: { x: number; y: number } }).b })))).toHaveLength(1);
    const axe = proposerPlancher(e, "n1", "axe");
    expect(axe.contours).toHaveLength(1);
    expect(tri(axe.contours[0]!.contour)).toEqual(tri([pt(0, 0), pt(5, 0), pt(10, 0), pt(10, 3), pt(10, 6), pt(5, 6), pt(0, 6)]));
    expect(axe.contours[0]!.aire).toBe(60);
    const ext = proposerPlancher(e, "n1", "exterieur");
    const c = ext.contours[0]!.contour;
    // Murs de 0,2 m (demi 0,1), w2 de 0,4 m (demi 0,2) : x de −0,1 à 10,2, y de −0,1 à 6,1.
    expect(Math.min(...c.map((p) => p.x))).toBeCloseTo(-0.1, 9);
    expect(Math.max(...c.map((p) => p.x))).toBeCloseTo(10.2, 9);
    expect(Math.min(...c.map((p) => p.y))).toBeCloseTo(-0.1, 9);
    expect(ext.contours[0]!.aire).toBeCloseTo(10.3 * 6.2, 6);
    expect(JSON.stringify(e)).toBe(avant);
  });

  it("boucle ouverte : aucun contour, interstice listé avec le mur voisin ; joindre referme", () => {
    const e = appliquerLot(base(), lot([{ type: "objet.modifier", params: { id: "w3", params: { b: pt(1, 6) } } }, { type: "objet.modifier", params: { id: "w4", params: { a: pt(0, 5) } } }], "o")).etat;
    const p = proposerPlancher(e, "n1", "axe");
    // La moitié gauche s'ouvre ; la moitié droite reste fermée par la cloison : une seule proposition.
    expect(p.contours.map((c) => c.aire)).toEqual([30]);
    const libres = p.interstices.filter((i) => i.murId === "w3" || i.murId === "w4");
    expect(libres.map((i) => [i.murId, i.voisinId])).toEqual(expect.arrayContaining([["w3", "w4"], ["w4", "w3"]]));
    const j = appliquerLot(e, lot([{ type: "mur.joindre", params: { id: "w3", autreId: "w4" } }, { type: "mur.joindre", params: { id: "w4", autreId: "w3" } }], "j")).etat;
    expect(proposerPlancher(j, "n1", "axe").contours.map((c) => c.aire)).toEqual([60]);
  });

  it("trémies : escaliers arrivant du niveau inférieur, une par groupe (enveloppe convexe) ; écarts du plancher existant", () => {
    const e = appliquerLot(base(), lot([
      { type: "escalier.creer", params: { id: "s1", niveauId: "n0", a: pt(1, 1), b: pt(4, 1), largeur: m(1), hauteurAFranchir: m(3), niveauDepartId: "n0", niveauArriveeId: "n1", contremarches: 18, groupe: "g", referencePlanSeulement: false } },
      { type: "escalier.creer", params: { id: "s2", niveauId: "n0", a: pt(4, 2), b: pt(1, 2), largeur: m(1), hauteurAFranchir: m(3), niveauDepartId: "n0", niveauArriveeId: "n1", contremarches: 18, groupe: "g", referencePlanSeulement: false } },
      { type: "escalier.creer", params: { id: "s3", niveauId: "n0", a: pt(7, 1), b: pt(7, 4), largeur: m(1), hauteurAFranchir: m(3), niveauDepartId: "n0", niveauArriveeId: null, contremarches: 18, referencePlanSeulement: false } },
    ], "s")).etat;
    const p = proposerPlancher(e, "n1", "axe");
    expect(p.contours[0]!.trous).toHaveLength(1);
    expect(p.contours[0]!.trous[0]!.escaliers).toEqual(["s1", "s2"]);
    expect(tri(p.contours[0]!.trous[0]!.contour)).toEqual(tri([pt(1, 0.5), pt(4, 0.5), pt(4, 2.5), pt(1, 2.5)]));
    const r = appliquerLot(e, lot([{ type: "dalle.creer", params: { id: "pl", niveauId: "n1", contour: p.contours[0]!.contour, trous: [], epaisseur: m(0.25), usage: "plancher" } }], "d"));
    const ecart = proposerPlancher(r.etat, "n1", "axe").planchers;
    expect(ecart).toEqual([{ dalleId: "pl", contourDifferent: false, tremiesAbsentes: [p.contours[0]!.trous[0]], proposition: 0 }]);
    const deplace = appliquerLot(r.etat, lot([
      { type: "objet.modifier", params: { id: "w4", params: { a: pt(-1, 6), b: pt(-1, 0) } } },
      { type: "objet.modifier", params: { id: "w1", params: { a: pt(-1, 0) } } },
      { type: "objet.modifier", params: { id: "w3", params: { b: pt(-1, 6) } } },
    ], "dep")).etat;
    expect(deplace.objets["pl"]).toEqual(r.etat.objets["pl"]);
    expect(proposerPlancher(deplace, "n1", "axe").planchers[0]!.contourDifferent).toBe(true);
  });
});
