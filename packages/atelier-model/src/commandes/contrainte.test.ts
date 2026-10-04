import { describe, expect, it } from "vitest";
import { contraintesDe, diagnosticContraintes } from "../contraintes.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande, type Enveloppe } from "./index.js";

const lot = (commands: Commande[], requestId = "r"): Enveloppe => ({ requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "test", commands });
const ligne = (id: string, ax: number, ay: number, bx: number, by: number): Commande => ({ type: "esquisse.ligne", params: { id, niveauId: "rdc", points: [pt(ax, ay), pt(bx, by)] } });
const c = (id: string, type: string, objetA: string, a: string, objetB?: string, b?: string, extra: Record<string, unknown> = {}): Commande => ({ type: "contrainte.ajouter", params: { id, type, objetA, a, objetB, b, ...extra } });
const P = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params.points.map((p) => [p.x, p.y]);

/** Quatre lignes presque jointives, à peu près un rectangle 4 × 3. */
function quatreLignes(): ModeleAtelier {
  return appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } },
    ligne("L1", 0, 0, 4, 0.1),
    ligne("L2", 4.05, 0, 4.1, 3),
    ligne("L3", 4, 3.05, 0.1, 3),
    ligne("L4", 0, 2.9, 0.05, 0.02),
  ], "socle")).etat;
}

const rectangleContraint = (): Commande[] => [
  c("k1", "coincidence", "L1", "sommet[1]", "L2", "sommet[0]"),
  c("k2", "coincidence", "L2", "sommet[1]", "L3", "sommet[0]"),
  c("k3", "coincidence", "L3", "sommet[1]", "L4", "sommet[0]"),
  c("k4", "coincidence", "L4", "sommet[1]", "L1", "sommet[0]"),
  c("k5", "horizontal", "L1", "segment[0]"),
  c("k6", "vertical", "L2", "segment[0]"),
  c("k7", "horizontal", "L3", "segment[0]"),
  c("k8", "vertical", "L4", "segment[0]"),
];

describe("esquisse contrainte (DA-01-07)", () => {
  it("quatre lignes jointives (4 coïncidences, côtés horizontaux / verticaux) : 4 degrés de liberté restants (16 − 8 − 4)", () => {
    const e = appliquerLot(quatreLignes(), lot(rectangleContraint(), "rect")).etat;
    const d = diagnosticContraintes(e, ["L1", "L2", "L3", "L4"]);
    expect(d.contraintes).toBe(8);
    expect(d.degresDeLiberte).toBe(4);
    expect(d.ecart).toBeLessThan(1e-7);
    // Rectangle : côtés horizontaux et verticaux, sommets joints.
    const [a, b] = P(e, "L1");
    expect(a![1]).toBeCloseTo(b![1]!, 9);
    expect(P(e, "L2")[0]).toEqual(P(e, "L1")[1]);
  });

  it("horizontal et vertical sur la même ligne : conflit détecté et refusé", () => {
    const e = appliquerLot(quatreLignes(), lot([c("h", "horizontal", "L1", "segment[0]")], "h")).etat;
    expect(() => appliquerLot(e, lot([c("v", "vertical", "L1", "segment[0]")], "v"))).toThrow(/incompatibles/);
  });

  it("sous-contrainte comptée ; deux résolutions donnent les mêmes coordonnées", () => {
    const e1 = appliquerLot(quatreLignes(), lot(rectangleContraint(), "rect")).etat;
    const e2 = appliquerLot(quatreLignes(), lot(rectangleContraint(), "rect")).etat;
    expect(JSON.stringify(e1.objets)).toBe(JSON.stringify(e2.objets));
    const seule = appliquerLot(quatreLignes(), lot([c("h", "horizontal", "L1", "segment[0]")], "h")).etat;
    expect(diagnosticContraintes(seule, ["L1"]).degresDeLiberte).toBe(3);
  });

  it("une contrainte passe « à réparer » quand son esquisse est supprimée ; une rotation qui violerait « horizontal » est refusée", () => {
    const e = appliquerLot(quatreLignes(), lot([c("h", "horizontal", "L1", "segment[0]"), c("k", "coincidence", "L1", "sommet[1]", "L2", "sommet[0]")], "h")).etat;
    expect(() => appliquerLot(e, lot([{ type: "transformer.tourner", params: { cibles: ["L1"], centre: pt(0, 0), angle: { value: 30, unit: "deg" } } }], "rot"))).toThrow(/violerait les contraintes/);
    const sup = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "L2" } }], "sup")).etat;
    const k = contraintesDe(sup).find((r) => r.id === "k")!;
    expect(k.params.etat).toBe("a-reparer");
    expect(Object.values(sup.problemes).some((p) => p.type === "reference-a-reparer" && p.objetId === "k")).toBe(true);
  });

  it("déplacer un sommet d'une esquisse contrainte : le sommet est tenu, les autres suivent", () => {
    const e = appliquerLot(quatreLignes(), lot(rectangleContraint(), "rect")).etat;
    const coin = P(e, "L1")[1]!;
    const r = appliquerLot(e, lot([{ type: "transformer.pointsDeControle", params: { id: "L1", index: 1, point: pt(coin[0]! + 1, coin[1]!) } }], "geste")).etat;
    expect(P(r, "L1")[1]).toEqual([Math.round((coin[0]! + 1) * 1e6) / 1e6, coin[1]]);
    expect(P(r, "L2")[0]).toEqual(P(r, "L1")[1]);
    expect(diagnosticContraintes(r, ["L1", "L2", "L3", "L4"]).ecart).toBeLessThan(1e-6);
  });
});

describe("esquisse paramétrique (DA-01-08)", () => {
  it("rectangle contraint + deux distances pilotantes : 2 degrés de liberté (position) ; changer la longueur recalcule les côtés", () => {
    let e = appliquerLot(quatreLignes(), lot([...rectangleContraint(), c("lx", "distance", "L1", "segment[0]", undefined, undefined, { valeur: m(5) }), c("ly", "distance", "L2", "segment[0]", undefined, undefined, { valeur: m(2.5) })], "rect")).etat;
    expect(diagnosticContraintes(e, ["L1", "L2", "L3", "L4"]).degresDeLiberte).toBe(2);
    const longueur = (id: string) => {
      const [a, b] = P(e, id);
      return Math.hypot(b![0]! - a![0]!, b![1]! - a![1]!);
    };
    expect(longueur("L1")).toBeCloseTo(5, 6);
    expect(longueur("L3")).toBeCloseTo(5, 6);
    expect(longueur("L2")).toBeCloseTo(2.5, 6);
    e = appliquerLot(e, lot([{ type: "contrainte.modifier", params: { id: "lx", valeur: m(6) } }], "mod")).etat;
    expect(longueur("L1")).toBeCloseTo(6, 6);
    expect(longueur("L3")).toBeCloseTo(6, 6);
  });

  it("deux cotes redondantes refusées ; cote de contrôle sans effet sur la géométrie ; unité « ° » refusée", () => {
    const e = appliquerLot(quatreLignes(), lot([...rectangleContraint(), c("lx", "distance", "L1", "segment[0]", undefined, undefined, { valeur: m(5) })], "rect")).etat;
    expect(() => appliquerLot(e, lot([c("lx2", "distance", "L3", "segment[0]", undefined, undefined, { valeur: m(5) })], "red"))).toThrow(/redondante/);
    const ctrl = appliquerLot(e, lot([c("ctrl", "distance", "L2", "segment[0]", undefined, undefined, { valeur: m(10), pilotante: false })], "ctrl")).etat;
    expect(JSON.stringify(ctrl.objets)).toBe(JSON.stringify(e.objets));
    expect(() => appliquerLot(e, lot([c("deg", "distance", "L2", "segment[0]", undefined, undefined, { valeur: { value: 10, unit: "deg" } })], "deg"))).toThrow(/« ° » refusée/);
  });

  it("l'inverse d'un lot de contraintes restitue la géométrie de départ", () => {
    const depart = quatreLignes();
    const r = appliquerLot(depart, lot(rectangleContraint(), "rect"));
    const retour = appliquerLot(r.etat, lot([r.inverse], "inv")).etat;
    expect(retour.objets).toEqual(depart.objets);
    expect(retour.relations).toEqual(depart.relations);
  });
});
