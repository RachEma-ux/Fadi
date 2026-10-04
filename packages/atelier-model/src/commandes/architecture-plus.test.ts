import { describe, expect, it } from "vitest";
import { exporterIfc } from "../echanges/ifc.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { symbolePorte } from "../ouvrants.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const mur = (id: string, a: [number, number], b: [number, number]) => ({ type: "mur.tracer", params: { id, niveauId: "n0", a: pt(...a), b: pt(...b), epaisseur: m(0.2), hauteur: m(3) } });
const base = (...c: Commande[]): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } }, ...c])).etat;
const W = (e: ModeleAtelier, id: string) => e.objets[id] as Occurrence<"mur">;

describe("architecture complémentaire (D-047)", () => {
  it("étirer en entraînant les murs joints ; seul sinon ; inverse exact", () => {
    const e = base(mur("a", [0, 0], [4, 0]), mur("b", [4, 0], [4, 3]), mur("c", [4, 0], [8, 0]), mur("d", [0, 5], [4, 5]));
    const r = appliquerLot(e, lot([{ type: "transformer.etirer", params: { id: "a", extremite: "b", point: pt(5, 0), entrainer: true } }], "e"));
    expect(W(r.etat, "a").params.b).toMatchObject({ x: 5, y: 0 });
    expect(W(r.etat, "b").params.a).toMatchObject({ x: 5, y: 0 });
    expect(W(r.etat, "c").params.a).toMatchObject({ x: 5, y: 0 });
    expect(W(r.etat, "d").params.b).toMatchObject({ x: 4, y: 5 });
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const seul = appliquerLot(e, lot([{ type: "transformer.etirer", params: { id: "a", extremite: "b", point: pt(5, 0) } }], "s")).etat;
    expect(W(seul, "b").params.a).toMatchObject({ x: 4, y: 0 });
  });

  it("portes double et coulissante : symboles, OperationType IFC ; type inconnu refusé", () => {
    const porte = (type: string) => base(mur("w", [0, 0], [4, 0]), { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1.6), hauteur: m(2.1), ouvrant: { charniere: "debut", cote: "gauche", type } } });
    const d = porte("double");
    const s = symbolePorte(d, d.objets["p"] as Occurrence<"porte">)!;
    expect(s.vantaux).toHaveLength(2);
    expect(Math.hypot(s.vantaux[0]![1]!.x - s.vantaux[0]![0]!.x, s.vantaux[0]![1]!.y - s.vantaux[0]![0]!.y)).toBeCloseTo(0.8, 9);
    const opt = { projet: { id: "p", nom: "E", code: "E" }, revision: 1, horodatage: "2026-10-04T00:00:00" };
    expect(exporterIfc(d, opt).contenu).toMatch(/\.DOUBLE_DOOR_SINGLE_SWING\./);
    const c = porte("coulissante");
    expect(symbolePorte(c, c.objets["p"] as Occurrence<"porte">)!.vantaux).toHaveLength(1);
    expect(exporterIfc(c, opt).contenu).toMatch(/\.SLIDING_TO_(LEFT|RIGHT)\./);
    expect(() => porte("pivotante")).toThrow(/ouvrant/);
    const b = porte("battante");
    expect((b.objets["p"] as Occurrence<"porte">).params.ouvrant).toEqual({ charniere: "debut", cote: "gauche" });
  });

  it("répartir une ouverture le long de son mur ; sortie du mur ou chevauchement refusés", () => {
    const e = base(mur("w", [0, 0], [10, 0]), { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "w", position: 0.1, largeur: m(1), hauteur: m(1.2), allege: m(0.9), repere: "F1" } });
    const r = appliquerLot(e, lot([{ type: "ouverture.repartir", params: { id: "f", nombre: 3, entraxe: m(2.5) } }], "r"));
    const fen = Object.values(r.etat.objets).filter((o): o is Occurrence<"fenetre"> => o.classe === "fenetre").map((o) => o.params.position).sort();
    expect(fen).toEqual([0.1, 0.35, 0.6, 0.85]);
    expect(r.effets.crees.every((id) => (r.etat.objets[id] as Occurrence<"fenetre">).params.repere === null)).toBe(true);
    expect(() => appliquerLot(e, lot([{ type: "ouverture.repartir", params: { id: "f", nombre: 4, entraxe: m(2.5) } }]))).toThrow(/sortirait/);
    expect(() => appliquerLot(r.etat, lot([{ type: "ouverture.repartir", params: { id: "f", nombre: 1, entraxe: m(2.5) } }]))).toThrow(/chevaucherait/);
  });
});
