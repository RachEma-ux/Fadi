import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { diagnosticContraintes } from "./contraintes.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "Rez", elevation: 0 } },
    { type: "esquisse.cercle", params: { id: "c", niveauId: "n", centre: pt(5, 3), rayon: m(1) } },
    { type: "esquisse.cercle", params: { id: "d", niveauId: "n", centre: pt(10, 3), rayon: m(1.5) } },
    { type: "esquisse.ligne", params: { id: "l", niveauId: "n", points: [pt(0, 0), pt(10, 0)] } },
  ])).etat;
const C = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params;
const ajout = (params: Record<string, unknown>) => ({ type: "contrainte.ajouter", params } as Commande);

describe("contraintes de cercles (D-074)", () => {
  it("rayon et diamètre pilotants ; inverse exact ; valeur nulle refusée", () => {
    const e = base();
    const r = appliquerLot(e, lot([ajout({ type: "rayon", objetA: "c", a: "cercle", valeur: m(2) })], "r"));
    expect(C(r.etat, "c").rayon!.value).toBe(2);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const d = appliquerLot(e, lot([ajout({ type: "diametre", objetA: "d", a: "cercle", valeur: m(5) })], "d")).etat;
    expect(C(d, "d").rayon!.value).toBe(2.5);
    expect(() => appliquerLot(e, lot([ajout({ type: "rayon", objetA: "c", a: "cercle", valeur: m(0) })]))).toThrow(/valeur/);
    expect(() => appliquerLot(e, lot([ajout({ type: "rayon", objetA: "l", a: "cercle", valeur: m(1) })]))).toThrow(/n'existe pas/);
  });

  it("tangence ligne–cercle : le centre s'approche de la ligne à distance du rayon ; avec rayon fixé", () => {
    const e = appliquerLot(base(), lot([ajout({ type: "rayon", objetA: "c", a: "cercle", valeur: m(1) }), ajout({ type: "tangence", objetA: "l", objetB: "c", a: "segment[0]", b: "cercle" })], "t")).etat;
    const c = C(e, "c");
    const l = C(e, "l").points;
    expect(l[0]!.y).toBeCloseTo(l[1]!.y, 9); // ligne restée horizontale (plus petit déplacement)
    expect(Math.abs(c.centre!.y - l[0]!.y)).toBeCloseTo(1, 5);
    expect(c.rayon!.value).toBeCloseTo(1, 9);
  });

  it("tangence de deux cercles (extérieure) ; centre coïncident avec un sommet ; degrés de liberté", () => {
    const e = appliquerLot(base(), lot([
      ajout({ type: "tangence", objetA: "c", objetB: "d", a: "cercle", b: "cercle" }),
      ajout({ type: "coincidence", objetA: "l", objetB: "c", a: "sommet[0]", b: "centre" }),
    ], "t2")).etat;
    const c = C(e, "c");
    const d = C(e, "d");
    expect(Math.hypot(c.centre!.x - d.centre!.x, c.centre!.y - d.centre!.y)).toBeCloseTo(c.rayon!.value + d.rayon!.value, 5);
    expect(c.centre!.x).toBeCloseTo(C(e, "l").points[0]!.x, 5);
    const diag = diagnosticContraintes(e, ["c", "d", "l"]);
    expect(diag.degresDeLiberte).toBe(10 - 3);
  });
});
