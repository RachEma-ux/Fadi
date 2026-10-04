import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { genererVue, type ParamsVue } from "../documents/vues.js";
import { ellipseTroisPoints } from "../geometrie.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (...c: Commande[]): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }, ...c])).etat;
const E = (e: ModeleAtelier, id: string) => e.objets[id] as Occurrence<"esquisse">;

describe("ellipse ; arcs et rectangles transformés (D-046)", () => {
  it("ellipse : validée (b ≤ a), dessinée en document, tournée, symétrisée, mise à l'échelle", () => {
    const e = base({ type: "esquisse.ellipse", params: { id: "el", niveauId: "n0", centre: pt(1, 1), rayon: m(2), rayonB: m(1), rotation: { value: 30, unit: "deg" }, points: [] } });
    expect(E(e, "el").params).toMatchObject({ forme: "ellipse", ferme: true, rayonB: { value: 1 } });
    expect(() => base({ type: "esquisse.ellipse", params: { niveauId: "n0", centre: pt(0, 0), rayon: m(1), rayonB: m(2), points: [] } })).toThrow(/demi-petit axe/);
    const v = genererVue(e, { type: "plan", titre: "R", echelle: 50, niveauId: "n0" } as ParamsVue);
    expect(v.primitives.some((p) => p.type === "poly" && p.objetId === "el")).toBe(true);
    const t = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 15, unit: "deg" } }, cibles: ["el"] }], "t")).etat;
    expect(E(t, "el").params.rotation!.value).toBeCloseTo(45, 9);
    const mi = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(1, 0) } , cibles: ["el"] }], "m")).etat;
    expect(E(mi, "el").params.rotation!.value).toBeCloseTo(-30, 9);
    const s = appliquerLot(e, lot([{ type: "transformer.echelle", params: { centre: pt(1, 1), facteur: 2 }, cibles: ["el"] }], "s")).etat;
    expect(E(s, "el").params).toMatchObject({ rayon: { value: 4 }, rayonB: { value: 2 } });
  });
  it("ellipse par trois points : axes ordonnés (le plus long devient le grand axe)", () => {
    expect(ellipseTroisPoints(pt(0, 0), pt(2, 0), pt(5, 1))).toEqual({ rayon: 2, rayonB: 1, rotation: 0 });
    expect(ellipseTroisPoints(pt(0, 0), pt(1, 0), pt(0, 3))).toEqual({ rayon: 3, rayonB: 1, rotation: 90 });
    expect(ellipseTroisPoints(pt(0, 0), pt(1, 0), pt(4, 0))).toBeNull();
  });
  it("un arc tourné garde sa forme (angles tournés) ; un rectangle tourné devient un polygone", () => {
    const e = base({ type: "esquisse.arc", params: { id: "a", niveauId: "n0", centre: pt(0, 0), rayon: m(1), angleDebut: { value: 0, unit: "deg" }, angleFin: { value: 90, unit: "deg" }, points: [] } }, { type: "esquisse.rectangle", params: { id: "r", niveauId: "n0", points: [pt(0, 0), pt(2, 1)] } });
    const t = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 90, unit: "deg" } }, cibles: ["a", "r"] }], "t")).etat;
    expect(E(t, "a").params.angleDebut!.value).toBeCloseTo(90, 9);
    expect(E(t, "a").params.angleFin!.value).toBeCloseTo(180, 9);
    expect(E(t, "r").params.forme).toBe("polygone");
    expect(E(t, "r").params.points[2]!.x).toBeCloseTo(-1, 9);
    expect(E(t, "r").params.points[2]!.y).toBeCloseTo(2, 9);
    const mi = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(0, 1) }, cibles: ["a"] }], "m")).etat;
    // Arc de 0° à 90° symétrisé par l'axe vertical : de 90° à 180°.
    expect(E(mi, "a").params.angleDebut!.value).toBeCloseTo(90, 9);
    expect(E(mi, "a").params.angleFin!.value).toBeCloseTo(180, 9);
  });
});
