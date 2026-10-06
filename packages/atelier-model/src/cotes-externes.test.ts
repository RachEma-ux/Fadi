import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { extremitesCotation } from "./references.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const rattacher = { type: "refexterne.rattacher", params: { id: "voisin", nom: "Voisin", projetSourceId: "p-118", publicationId: "pub-1", revisionSource: 3, empreinteSource: "abc", niveauSourceId: "rdc", niveauId: "n0", position: pt(50, 0), angle: { value: 90, unit: "deg" }, calqueId: null } };

const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "RDC", elevation: 0, hauteur: 3 } },
    rattacher,
    { type: "cotation.creer", params: { id: "k", niveauId: "n0", a: pt(0, 0), b: pt(0, 0), decalage: m(0.5), externe: { referenceId: "voisin", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } } } },
  ])).etat;

describe("cotes rattachées à une référence externe (D-153, DA-05-11)", () => {
  it("extrémités dérivées du calage, suivies quand il change", () => {
    const e = base();
    const k = e.objets["k"] as Occurrence<"cotation">;
    expect([k.params.a.x, k.params.a.y, k.params.b.x, k.params.b.y]).toEqual([50, 0, 50, 4]); // rotation 90° puis translation
    const r = appliquerLot(e, lot([{ type: "refexterne.rattacher", params: { id: "voisin", position: pt(60, 10) } }], "c")).etat;
    const k2 = r.objets["k"] as Occurrence<"cotation">;
    expect([k2.params.a.x, k2.params.a.y, k2.params.b.x, k2.params.b.y]).toEqual([60, 10, 60, 14]);
    expect(extremitesCotation(r, "k")!.aReparer).toBe(false);
  });

  it("source réépinglée : à vérifier ; référence détachée : la cote garde sa position et perd le lien ; référence inconnue refusée", () => {
    const e = base();
    const maj = appliquerLot(e, lot([{ type: "refexterne.rattacher", params: { id: "voisin", publicationId: "pub-2", revisionSource: 5, empreinteSource: "def" } }], "maj")).etat;
    expect((maj.objets["k"] as Occurrence<"cotation">).params.externe!.aVerifier).toBe(true);
    expect(extremitesCotation(maj, "k")!.aReparer).toBe(true);
    const det = appliquerLot(e, lot([{ type: "refexterne.detacher", params: { id: "voisin" } }], "d")).etat;
    const k = det.objets["k"] as Occurrence<"cotation">;
    expect(k.params.externe).toBeUndefined();
    expect([k.params.b.x, k.params.b.y]).toEqual([50, 4]);
    expect(() => appliquerLot(e, lot([{ type: "cotation.creer", params: { id: "k2", niveauId: "n0", a: pt(0, 0), b: pt(1, 0), externe: { referenceId: "nulle", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } } }], "x"))).toThrow(/référence externe inconnue/);
  });
});
