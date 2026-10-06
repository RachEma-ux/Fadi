import { describe, expect, it } from "vitest";
import { architectureBloc } from "./blocs-places.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

function volume(ma: { positions: ArrayLike<number>; indices: ArrayLike<number> }): number {
  let v = 0;
  const p = (i: number) => [ma.positions[3 * i]!, ma.positions[3 * i + 1]!, ma.positions[3 * i + 2]!] as const;
  for (let k = 0; k < ma.indices.length; k += 3) {
    const [a, b, c] = [p(ma.indices[k]!), p(ma.indices[k + 1]!), p(ma.indices[k + 2]!)];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), alignement: "gauche", niveauHautId: "n1" } },
    { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(2), ouvrant: { charniere: "debut", cote: "gauche", type: "battante" } } },
    { type: "bloc.definir", params: { id: "cabine", nom: "Cabine", cibles: ["w"], pointDeBase: pt(0, 0), remplacer: true } },
  ])).etat;

describe("murs et ouvertures dans un bloc (D-150, DA-05-06)", () => {
  it("le mur entre avec sa porte (clé locale), son niveau haut devient sa hauteur ; la sélection est remplacée", () => {
    const e = base();
    const contenu = (e.definitions["cabine"]!.params as { contenu: { classe: string; cle?: string; params: Record<string, unknown> }[] }).contenu;
    expect(contenu.map((x) => [x.classe, x.cle ?? null])).toEqual([["mur", "w"], ["porte", null]]);
    expect(contenu[0]!.params["hauteur"]).toEqual(m(3));
    expect(e.objets["w"]).toBeUndefined();
    expect(e.objets["p"]).toBeUndefined();
  });

  it("occurrence placée : volume du mur percé de sa porte ; miroir : épaisseur et ouvrant du bon côté ; décomposition fidèle", () => {
    const e0 = base();
    const occ = Object.values(e0.objets).find((o) => o.classe === "bloc-occurrence")!;
    expect(volume(maillageObjet(e0, occ)!)).toBeGreaterThan(4 * 0.2 * 3 - 1 * 0.2 * 2 - 1e-9);
    const sym = appliquerLot(e0, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(1, 0) }, cibles: [occ.id] }], "m")).etat;
    const arch = architectureBloc(sym, sym.objets[occ.id]!);
    const mur = arch.objets.find((x) => x.classe === "mur") as Occurrence<"mur">;
    const porte = arch.objets.find((x) => x.classe === "porte") as Occurrence<"porte">;
    expect(mur.params.alignement).toBe("droite");
    expect(porte.params.ouvrant!.cote).toBe("droite");
    // Décomposer : vrais mur et porte, l'hôte suivi.
    const d = appliquerLot(sym, lot([{ type: "transformer.decomposer", params: {}, cibles: [occ.id] }], "d")).etat;
    const murs = Object.values(d.objets).filter((o) => o.classe === "mur") as Occurrence<"mur">[];
    const portes = Object.values(d.objets).filter((o) => o.classe === "porte") as Occurrence<"porte">[];
    expect(murs).toHaveLength(1);
    expect(portes[0]!.params.murHoteId).toBe(murs[0]!.id);
    expect(murs[0]!.params.alignement).toBe(mur.params.alignement);
    // Même géométrie que l'occurrence affichée : le volume du mur décomposé égale celui du mur du bloc.
    expect(volume(maillageObjet(d, murs[0]!)!)).toBeCloseTo(volume(maillageObjet(arch.modele, mur)!), 9);
  });

  it("une porte sans son mur est refusée ; plan : symbole de la porte du bloc", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(2), ouvrant: { charniere: "debut", cote: "gauche", type: "battante" } } },
    ])).etat;
    expect(() => appliquerLot(e, lot([{ type: "bloc.definir", params: { id: "x", nom: "X", cibles: ["p"], pointDeBase: pt(0, 0) } }], "x"))).toThrow(/avec son mur/);
    const v = appliquerLot(base(), lot([{ type: "vue.creer", params: { id: "v", titre: "R", type: "plan", niveauId: "n", echelle: 50 } }], "v")).etat;
    const plan = genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v");
    expect(plan.primitives.some((p) => !!(p as { objetId?: string | null }).objetId?.includes(":"))).toBe(true); // symbole de la porte du bloc
  });
});
