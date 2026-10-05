import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "Rez", elevation: 0 } },
    { type: "esquisse.polyligne", params: { id: "pl", niveauId: "n", points: [pt(0, 0), pt(4, 0), pt(4, 3)] } },
    { type: "esquisse.cercle", params: { id: "c", niveauId: "n", centre: pt(4, 8), rayon: m(2) } },
    { type: "esquisse.ligne", params: { id: "coupe", niveauId: "n", points: [pt(1, -1), pt(1, 1)] } },
    { type: "esquisse.polygone", params: { id: "carre", niveauId: "n", points: [pt(-3, -1), pt(-2, -1), pt(-2, 1), pt(-3, 1)] } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(10, 0), b: pt(12, 0), epaisseur: m(0.2) } },
  ])).etat;
const P = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params.points.map((q) => [q.x, q.y]);

describe("ajuster et prolonger : polylignes, cercles, contours (D-073)", () => {
  it("prolonger une polyligne jusqu'à un cercle (extrémité la plus proche) ; jusqu'à un contour polygonal", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "pl", limiteId: "c" } }], "p"));
    expect(P(r.etat, "pl")).toEqual([[0, 0], [4, 0], [4, 6]]);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(P(appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "pl", limiteId: "carre" } }], "q")).etat, "pl")[0]).toEqual([-2, 0]);
    expect(() => appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "w", limiteId: "c" } }], "w"))).toThrow(/pas atteinte/);
    const w = appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "w", limiteId: "carre" } }], "w2")).etat.objets["w"] as Occurrence<"mur">;
    expect([w.params.a.x, w.params.b.x]).toEqual([-2, 12]);
  });

  it("ajuster une polyligne par une ligne : la partie côté extrémité la plus proche part, sommets compris", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.ajuster", params: { id: "pl", limiteId: "coupe" } }], "a"));
    expect(P(r.etat, "pl")).toEqual([[1, 0], [4, 0], [4, 3]]);
    const e2 = appliquerLot(e, lot([{ type: "esquisse.ligne", params: { id: "haut", niveauId: "n", points: [pt(3, 2), pt(5, 2)] } }], "h")).etat;
    expect(P(appliquerLot(e2, lot([{ type: "transformer.ajuster", params: { id: "pl", limiteId: "haut" } }], "a2")).etat, "pl")).toEqual([[0, 0], [4, 0], [4, 2]]);
    expect(() => appliquerLot(e, lot([{ type: "transformer.ajuster", params: { id: "pl", limiteId: "c" } }]))).toThrow(/ne coupe pas/);
  });
});

describe("raccord ligne–arc et arc–arc (D-073)", () => {
  it("coin ligne / arc : arc de raccord tangent aux deux, ligne et arc ajustés ; inverse exact", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "Rez", elevation: 0 } },
      { type: "esquisse.ligne", params: { id: "l", niveauId: "n", points: [pt(-5, 0), pt(0, 0)] } },
      { type: "esquisse.arc", params: { id: "a", niveauId: "n", centre: pt(3, 0), rayon: m(3), angleDebut: { value: 90, unit: "deg" }, angleFin: { value: 180, unit: "deg" } } },
    ], "b")).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.raccorder", params: { id1: "l", id2: "a", rayon: m(0.5) } }], "r"));
    const nouveau = Object.values(r.etat.objets).find((o) => !["l", "a"].includes(o.id) && o.classe === "esquisse") as Occurrence<"esquisse">;
    const f = nouveau.params.centre!;
    expect(f.y).toBeCloseTo(0.5, 9);
    expect(Math.hypot(f.x - 3, f.y)).toBeCloseTo(3.5, 9);
    const l = r.etat.objets["l"] as Occurrence<"esquisse">;
    expect(l.params.points[1]!.x).toBeCloseTo(f.x, 9);
    const arc = r.etat.objets["a"] as Occurrence<"esquisse">;
    expect(arc.params.angleDebut!.value).toBe(90);
    expect(arc.params.angleFin!.value).toBeCloseTo((Math.atan2(f.y, f.x - 3) * 180) / Math.PI, 6);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "transformer.raccorder", params: { id1: "l", id2: "a", rayon: m(0) } }]))).toThrow(/strictement positif/);
  });

  it("deux arcs sécants : raccord tangent aux deux (R ± r), extrémités communes", () => {
    const x = Math.round(((Math.acos(1.5 / 2) * 180) / Math.PI) * 1e6) / 1e6; // 41,41° : intersection en (1,5 ; 1,32)
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "Rez", elevation: 0 } },
      { type: "esquisse.arc", params: { id: "a1", niveauId: "n", centre: pt(0, 0), rayon: m(2), angleDebut: { value: -30, unit: "deg" }, angleFin: { value: x, unit: "deg" } } },
      { type: "esquisse.arc", params: { id: "a2", niveauId: "n", centre: pt(3, 0), rayon: m(2), angleDebut: { value: 180 - x, unit: "deg" }, angleFin: { value: 210, unit: "deg" } } },
    ], "b")).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.raccorder", params: { id1: "a1", id2: "a2", rayon: m(0.3) } }], "r")).etat;
    const n = (Object.values(r.objets).find((o) => !["a1", "a2"].includes(o.id) && o.classe === "esquisse") as Occurrence<"esquisse">).params;
    const f = n.centre!;
    for (const c of [pt(0, 0), pt(3, 0)]) expect([1.7, 2.3].some((d) => Math.abs(Math.hypot(f.x - c.x, f.y - c.y) - d) < 1e-9)).toBe(true);
    const bout = (c: { x: number; y: number }, rr: number, deg: number) => [c.x + rr * Math.cos((deg * Math.PI) / 180), c.y + rr * Math.sin((deg * Math.PI) / 180)];
    const extr = [bout(f, 0.3, n.angleDebut!.value), bout(f, 0.3, n.angleFin!.value)];
    const a1 = (r.objets["a1"] as Occurrence<"esquisse">).params;
    const a2 = (r.objets["a2"] as Occurrence<"esquisse">).params;
    const fin1 = bout(pt(0, 0), 2, a1.angleFin!.value);
    const debut2 = bout(pt(3, 0), 2, a2.angleDebut!.value);
    for (const q of [fin1, debut2]) expect(extr.some((x2) => Math.hypot(x2[0]! - q[0]!, x2[1]! - q[1]!) < 1e-6)).toBe(true);
  });
});
