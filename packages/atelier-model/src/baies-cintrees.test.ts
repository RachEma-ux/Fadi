import { describe, expect, it } from "vitest";
import { aireBaie, arcCintre, flecheCintre } from "./cintres.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererTableau } from "./documents/tableaux.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

/** Volume d'un maillage fermé (théorème de la divergence). */
function volume(ma: { positions: ArrayLike<number>; indices: ArrayLike<number> }): number {
  let v = 0;
  const p = (i: number) => [ma.positions[3 * i]!, ma.positions[3 * i + 1]!, ma.positions[3 * i + 2]!] as const;
  for (let k = 0; k < ma.indices.length; k += 3) {
    const [a, b, c] = [p(ma.indices[k]!), p(ma.indices[k + 1]!), p(ma.indices[k + 2]!)];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

const base = (cintre: unknown) =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(1.5), allege: m(0.9), cintre } },
  ])).etat;

describe("baies cintrées (D-141, DA-07-04)", () => {
  it("montées et arcs : plein cintre, surbaissé, ogive", () => {
    expect(flecheCintre({ type: "plein-cintre" }, 1)).toBe(0.5);
    expect(flecheCintre({ type: "ogive" }, 1)).toBeCloseTo(Math.sqrt(3) / 2, 12);
    for (const c of [{ type: "plein-cintre" as const }, { type: "surbaisse" as const, fleche: m(0.2) }, { type: "ogive" as const }]) {
      const arc = arcCintre(c, 1, 1.5);
      const f = flecheCintre(c, 1);
      expect(arc[0]).toEqual({ s: 1, z: 1.5 - f });
      expect(arc[arc.length - 1]!.s).toBeCloseTo(0, 12);
      expect(Math.max(...arc.map((q) => q.z))).toBeCloseTo(1.5, 9); // clé à la hauteur de la baie
    }
    // Plein cintre : aire du rectangle sous les naissances + demi-disque (polygone de 24 cordes).
    expect(aireBaie({ type: "plein-cintre" }, 1, 1.5)).toBeCloseTo(1 * 1 + (Math.PI / 8), 2);
    expect(aireBaie(null, 1, 1.5)).toBe(1.5);
  });

  it("saisie contrôlée ; vide du mur au profil de l'arc ; tableau, IFC", () => {
    expect(() => base({ type: "surbaisse" })).toThrow(/flèche/);
    expect(() => base({ type: "surbaisse", fleche: m(0.6) })).toThrow(/demi-largeur/);
    expect(() => base({ type: "plein-cintre", fleche: m(0.2) })).toThrow(/réservée/);
    expect(() => base({ type: "rond" })).toThrow(/inconnu/);
    const e = base({ type: "plein-cintre" });
    expect((e.objets["f"] as Occurrence<"fenetre">).params.cintre).toEqual({ type: "plein-cintre" });
    // Volume du mur = plein − baie au profil exact (polygone de l'arc) × épaisseur.
    const v = volume(maillageObjet(e, e.objets["w"]!)!);
    expect(v).toBeCloseTo(4 * 3 * 0.2 - aireBaie({ type: "plein-cintre" }, 1, 1.5) * 0.2, 9);
    const droite = base(null);
    expect(volume(maillageObjet(droite, droite.objets["w"]!)!)).toBeCloseTo(4 * 3 * 0.2 - 1.5 * 0.2, 9);
    // Panneau de la fenêtre au même profil.
    expect(volume(maillageObjet(e, e.objets["f"]!)!)).toBeCloseTo(aireBaie({ type: "plein-cintre" }, 1, 1.5) * 0.03, 9);
    const t = genererTableau(e, "fenetres");
    expect(t.lignes[0]![t.colonnes.indexOf("Haut")]).toBe("plein cintre");
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu;
    expect(ifc).toMatch(/IFCOPENINGELEMENT/);
    expect(ifc.match(/IFCARBITRARYCLOSEDPROFILEDEF/g)!.length).toBeGreaterThanOrEqual(2); // vide et panneau
    // Retiré par null : baie droite.
    const r = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "f", params: { cintre: null } } }], "x")).etat;
    expect((r.objets["f"] as Occurrence<"fenetre">).params.cintre).toBeUndefined();
  });
});
