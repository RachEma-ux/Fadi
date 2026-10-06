import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { modeleVide, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "poteau.creer", params: { id: "p", niveauId: "n", point: pt(0, 0), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
  ])).etat;
const poteaux = (e: ReturnType<typeof base>) => Object.values(e.objets).filter((o) => o.classe === "poteau").map((o) => (o as Occurrence<"poteau">).params.point.x).sort((a, b) => a - b);

describe("réseau associatif (D-115, DA-02-12)", () => {
  it("créé avec ses paramètres dans un groupe ; modifier le pas ou le nombre recalcule les copies (un lot, inverse exact)", () => {
    const r1 = appliquerLot(base(), lot([{ type: "transformer.repeter", params: { nombre: 3, dx: 2, dy: 0, associatif: true }, cibles: ["p"] }], "a"));
    const e = r1.etat;
    const g = Object.values(e.groupes)[0]!;
    expect(g.reseau).toMatchObject({ sources: ["p"], nombre: 3, dx: 2, dy: 0 });
    expect(g.reseau!.copies).toHaveLength(3);
    expect(poteaux(e)).toEqual([0, 2, 4, 6]);
    expect(g.reseau!.copies.every((id) => e.objets[id]!.groupeId === g.id)).toBe(true);
    const r2 = appliquerLot(e, lot([{ type: "reseau.modifier", params: { groupeId: g.id, nombre: 2, dx: 3 } }], "m"));
    expect(poteaux(r2.etat)).toEqual([0, 3, 6]);
    expect(r2.etat.groupes[g.id]!.reseau).toMatchObject({ nombre: 2, dx: 3, dy: 0 });
    expect(appliquerLot(r2.etat, lot([r2.inverse], "i")).etat).toEqual(e);
    // La source modifiée se reporte au recalcul.
    const e3 = appliquerLot(e, lot([{ type: "poteau.modifier", params: { id: "p", params: { largeur: m(0.5) } } }, { type: "reseau.modifier", params: { groupeId: g.id } }], "s")).etat;
    expect(Object.values(e3.objets).filter((o) => o.classe === "poteau").every((o) => (o as Occurrence<"poteau">).params.largeur.value === 0.5)).toBe(true);
  });

  it("polaire ; dissocier garde les copies ; source supprimée : recalcul refusé ; archive relue", () => {
    const e = appliquerLot(base(), lot([{ type: "transformer.repeter", params: { nombre: 3, centre: pt(5, 0), angle: { value: 90, unit: "deg" }, associatif: true }, cibles: ["p"] }], "a")).etat;
    const g = Object.values(e.groupes)[0]!;
    expect(g.reseau).toMatchObject({ nombre: 3, angle: 90 });
    const relu = verifierModele(JSON.parse(JSON.stringify(e)));
    if (!relu.ok) throw new Error(relu.erreurs.join(" ; "));
    expect(relu.modele.groupes[g.id]!.reseau).toEqual(g.reseau);
    const d = appliquerLot(e, lot([{ type: "reseau.dissocier", params: { groupeId: g.id } }], "d")).etat;
    expect(d.groupes[g.id]!.reseau).toBeUndefined();
    expect(Object.values(d.objets).filter((o) => o.classe === "poteau")).toHaveLength(4);
    const s = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "p" } }], "x")).etat;
    expect(() => appliquerLot(s, lot([{ type: "reseau.modifier", params: { groupeId: g.id, nombre: 4 } }], "y"))).toThrow(/source du réseau supprimée/);
  });
});
