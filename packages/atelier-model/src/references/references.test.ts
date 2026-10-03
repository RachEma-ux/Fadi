import { describe, expect, it } from "vitest";
import type { ReferenceTopologique, ResolutionReference } from "../contrats/references.js";
import type { EtatModele } from "../contrats/etat.js";
import { cmd, m, ok, P, projetDeBase } from "../commandes/__tests__/aides.js";
import type { ObjetCotation } from "../ontologie/classes.js";
import { problemesReferences, recalculerCotation, recalculerCotationsRattachees, resoudreCotation } from "./cotations.js";
import { resoudreReference, resoudreReferenceDans, LIBELLE_DETACHER } from "./resoudre.js";

const ref = (objetId: string, caracteristique: string): ReferenceTopologique => ({ objetId, caracteristique: caracteristique as ReferenceTopologique["caracteristique"] });
const seg = (ax: number, ay: number, bx: number, by: number) => ({ nature: "segment", segment: { a: P(ax, ay), b: P(bx, by) } });
const cotation = (e: EtatModele, id: string): ObjetCotation => {
  const o = e.objets[id];
  if (o?.classe !== "cotation") throw new Error(`${id} n'est pas une cotation`);
  return o;
};
const aReparer = (r: ResolutionReference) => {
  if (r.etat !== "a-reparer") throw new Error(`à réparer attendu, obtenu ${r.etat}`);
  return r;
};

const base = projetDeBase();

describe("résolution des caractéristiques nommées", () => {
  it("mur (alignement axe) : axe, faces à ±e/2, arêtes de la face gauche vers la face droite", () => {
    expect(resoudreReference(base, ref("M1", "mur:axe"))).toEqual({ etat: "resolue", reference: ref("M1", "mur:axe"), geometrie: seg(0, 0, 6, 0) });
    expect(resoudreReference(base, ref("M1", "mur:face-gauche"))).toMatchObject({ etat: "resolue", geometrie: seg(0, 0.1, 6, 0.1) });
    expect(resoudreReference(base, ref("M1", "mur:face-droite"))).toMatchObject({ etat: "resolue", geometrie: seg(0, -0.1, 6, -0.1) });
    expect(resoudreReference(base, ref("M1", "mur:arete-debut"))).toMatchObject({ etat: "resolue", geometrie: seg(0, 0.1, 0, -0.1) });
    expect(resoudreReference(base, ref("M1", "mur:arete-fin"))).toMatchObject({ etat: "resolue", geometrie: seg(6, 0.1, 6, -0.1) });
  });

  it("mur aligné à gauche ou à droite : l'axe tracé est la face nommée ; DA-02-07 (face gauche en x = 4,90)", () => {
    const e = ok(
      base,
      cmd("mur.tracer", { id: "MG", niveauId: "rdc", calqueId: "C1", a: P(0, 10), b: P(4, 10), epaisseur: m(0.2), hauteur: m(3), alignement: "gauche", typeId: "non-type", exterieur: false }),
      cmd("mur.tracer", { id: "MD", niveauId: "rdc", calqueId: "C1", a: P(0, 12), b: P(4, 12), epaisseur: m(0.2), hauteur: m(3), alignement: "droite", typeId: "non-type", exterieur: false }),
      cmd("mur.tracer", { id: "MY", niveauId: "rdc", calqueId: "C1", a: P(5, 20), b: P(5, 24), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: false }),
    ).etat;
    expect(resoudreReference(e, ref("MG", "mur:face-gauche"))).toMatchObject({ geometrie: seg(0, 10, 4, 10) });
    expect(resoudreReference(e, ref("MG", "mur:face-droite"))).toMatchObject({ geometrie: seg(0, 9.8, 4, 9.8) });
    expect(resoudreReference(e, ref("MD", "mur:face-droite"))).toMatchObject({ geometrie: seg(0, 12, 4, 12) });
    expect(resoudreReference(e, ref("MD", "mur:face-gauche"))).toMatchObject({ geometrie: seg(0, 12.2, 4, 12.2) });
    expect(resoudreReference(e, ref("MY", "mur:face-gauche"))).toMatchObject({ geometrie: seg(4.9, 20, 4.9, 24) });
  });

  it("ouverture, poteau, escalier, dalle", () => {
    const e = ok(
      base,
      cmd("poteau.creer", { id: "X1", niveauId: "rdc", calqueId: "C1", point: P(2, 2), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: { value: 0, unit: "°" } }),
      cmd("escalier.creer", { id: "E1", niveauId: "rdc", calqueId: "C1", axe: { a: P(1, 1), b: P(4, 1) }, largeur: m(1), hauteurAFranchir: m(3), marches: 17, contremarches: 18, epaisseurPaillasse: m(0.2), decalageBase: m(0), referencePlanSeulement: false }),
    ).etat;
    expect(resoudreReference(e, ref("P1", "ouverture:centre"))).toMatchObject({ etat: "resolue", geometrie: { nature: "point", point: P(1.5, 0) } });
    expect(resoudreReference(e, ref("X1", "poteau:centre"))).toMatchObject({ geometrie: { nature: "point", point: P(2, 2) } });
    expect(resoudreReference(e, ref("E1", "escalier:depart"))).toMatchObject({ geometrie: { nature: "point", point: P(1, 1) } });
    expect(resoudreReference(e, ref("E1", "escalier:arrivee"))).toMatchObject({ geometrie: { nature: "point", point: P(4, 1) } });
    expect(resoudreReference(e, ref("D1", "dalle:contour[1]"))).toMatchObject({ geometrie: seg(6, 0, 6, 4) });
    expect(resoudreReference(e, ref("D1", "dalle:contour[3]"))).toMatchObject({ geometrie: seg(0, 4, 0, 0) });
  });

  it("caractéristique absente ou de classe incompatible : à réparer, propositions sur le même objet, jamais de rattachement", () => {
    const r = aReparer(resoudreReferenceDans(base, ref("D1", "dalle:contour[4]"), { point: P(6, 3) }));
    expect(r.motif).toBe("caracteristique-absente");
    expect(r.propositions.map((p) => p.cible?.caracteristique ?? null)).toEqual(["dalle:contour[1]", "dalle:contour[2]", "dalle:contour[0]", "dalle:contour[3]", null]);
    expect(r.propositions[0]?.ecart).toBe(0);
    const c = aReparer(resoudreReference(base, ref("M1", "poteau:centre")));
    expect(c.motif).toBe("classe-incompatible");
    expect(c.propositions.map((p) => p.cible?.caracteristique ?? null)).toEqual(["mur:face-gauche", "mur:face-droite", "mur:arete-debut", "mur:arete-fin", "mur:axe", null]);
    expect(c.propositions.at(-1)).toEqual({ cible: null, libelle: LIBELLE_DETACHER });
  });
});

describe("à réparer après une commande (appliquerLot)", () => {
  // Cote K1 : a sur la face gauche de M1 en (1 ; 0,1), b libre.
  const avecCote = ok(base, cmd("cotation.creer", { id: "K1", niveauId: "rdc", calqueId: "C1", a: P(1, 0.1), b: P(1, 3), decalage: m(0.5), references: [{ extremite: "a", objetId: "M1", caracteristique: "mur:face-gauche" }] })).etat;

  it("scission : motif objet-scinde, les deux morceaux proposés en tête (écart croissant), détacher en dernier ; déterministe", () => {
    const r = ok(avecCote, cmd("mur.scinder", { point: P(3, 0), nouveauxIds: ["M1a", "M1b"] }, ["M1"]));
    expect(cotation(r.etat, "K1").params.etat).toBe("a-reparer");
    const res = aReparer(resoudreReference(r.etat, ref("M1", "mur:face-gauche")));
    expect(res.motif).toBe("objet-scinde");
    expect(res.propositions.map((p) => p.cible?.objetId ?? null)).toEqual(["M1a", "M1b", "MV", null]);
    expect(res.propositions.slice(0, 2).map((p) => p.ecart)).toEqual([0, 2]);
    expect(res.propositions[2]?.ecart).toBeCloseTo(4, 12);
    expect(res.propositions[3]?.ecart).toBeUndefined();
    expect(resoudreReference(r.etat, ref("M1", "mur:face-gauche"))).toEqual(res);
    // L'utilisateur choisit la première proposition (reference.reparer, L1.2) : la cote est rattachée et résolue.
    const cible = res.propositions[0]?.cible;
    if (!cible) throw new Error("proposition attendue");
    const rep = ok(r.etat, cmd("reference.reparer", { ancienne: ref("M1", "mur:face-gauche"), nouvelle: cible }, ["K1"]));
    expect(cotation(rep.etat, "K1").params.etat).toBe("rattachee");
    expect(resoudreCotation(rep.etat, cotation(rep.etat, "K1")).a).toMatchObject({ etat: "resolue", geometrie: seg(0, 0.1, 3, 0.1) });
    expect(resoudreCotation(rep.etat, cotation(rep.etat, "K1")).b).toEqual({ etat: "libre" });
  });

  it("suppression : motif objet-supprime, candidats du niveau classés par écart ; sans position connue, seulement détacher", () => {
    const r = ok(avecCote, cmd("mur.supprimer", {}, ["M1"]));
    const res = aReparer(resoudreReference(r.etat, ref("M1", "mur:face-gauche")));
    expect(res.motif).toBe("objet-supprime");
    expect(res.propositions.map((p) => p.cible?.objetId ?? null)).toEqual(["MV", null]);
    const sans = aReparer(resoudreReference(r.etat, ref("P1", "ouverture:centre")));
    expect(sans).toEqual({ etat: "a-reparer", reference: ref("P1", "ouverture:centre"), motif: "objet-supprime", propositions: [{ cible: null, libelle: LIBELLE_DETACHER }] });
    const pbs = problemesReferences(r.etat);
    expect(pbs).toHaveLength(1);
    expect(pbs[0]).toMatchObject({ code: "reference-a-reparer", objetIds: ["K1", "M1"], niveauId: "rdc" });
    expect(pbs[0]?.propositions?.at(-1)?.cible).toBeNull();
  });

  it("détacher : la cote devient libre, plus aucun problème", () => {
    const r = ok(avecCote, cmd("mur.supprimer", {}, ["M1"]));
    const d = ok(r.etat, cmd("reference.reparer", { ancienne: ref("M1", "mur:face-gauche"), nouvelle: null }, ["K1"]));
    expect(resoudreCotation(d.etat, cotation(d.etat, "K1"))).toEqual({ a: { etat: "libre" }, b: { etat: "libre" } });
    expect(problemesReferences(d.etat)).toEqual([]);
  });
});

describe("recalcul des extrémités des cotations rattachées", () => {
  const e0 = ok(
    base,
    cmd("poteau.creer", { id: "X1", niveauId: "rdc", calqueId: "C1", point: P(4, 3), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: { value: 0, unit: "°" } }),
    cmd("cotation.creer", {
      id: "K1",
      niveauId: "rdc",
      calqueId: "C1",
      a: P(1, 0.1),
      b: P(4, 3),
      decalage: m(0.5),
      references: [
        { extremite: "a", objetId: "M1", caracteristique: "mur:face-gauche" },
        { extremite: "b", objetId: "X1", caracteristique: "poteau:centre" },
      ],
    }),
  ).etat;

  it("état inchangé : aucun recalcul", () => {
    expect(recalculerCotationsRattachees(e0)).toEqual([]);
    expect(recalculerCotation(e0, cotation(e0, "K1"))).toMatchObject({ change: false, etat: "rattachee", a: P(1, 0.1), b: P(4, 3) });
  });

  it("mur déplacé et épaissi, poteau déplacé : les extrémités suivent (projection sur la face, centre du poteau)", () => {
    const e1 = ok(e0, cmd("mur.modifier", { modifications: { axe: { a: P(0, 1), b: P(6, 1) }, epaisseur: m(0.4) } }, ["M1"])).etat;
    const r1 = recalculerCotationsRattachees(e1, ["M1"]);
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ cotationId: "K1", a: P(1, 1.2), b: P(4, 3), etat: "rattachee", change: true });
    const e2 = ok(e1, cmd("poteau.modifier", { modifications: { point: P(5, 2) } }, ["X1"])).etat;
    expect(recalculerCotationsRattachees(e2, ["X1"])[0]).toMatchObject({ a: P(1, 1.2), b: P(5, 2) });
    // Objet non concerné : rien.
    expect(recalculerCotationsRattachees(e2, ["D1"])).toEqual([]);
    // La mise à jour proposée s'applique par cotation.modifier (a, b) : ensuite plus rien à recalculer.
    const k = recalculerCotationsRattachees(e2)[0];
    if (!k) throw new Error("recalcul attendu");
    const e3 = ok(e2, cmd("cotation.modifier", { modifications: { a: k.a, b: k.b } }, ["K1"])).etat;
    expect(recalculerCotationsRattachees(e3)).toEqual([]);
  });

  it("référence à réparer : l'extrémité garde sa dernière position, la cotation est « à réparer » avec problème", () => {
    const e1 = ok(e0, cmd("poteau.supprimer", {}, ["X1"])).etat;
    const r = recalculerCotation(e1, cotation(e1, "K1"));
    expect(r).toMatchObject({ a: P(1, 0.1), b: P(4, 3), etat: "a-reparer", change: false });
    expect(r.problemes.map((p) => p.code)).toEqual(["reference-a-reparer"]);
  });

  it("extrémités confondues après recalcul : géométrie dégénérée, rien ne bouge", () => {
    const e1 = ok(
      e0,
      cmd("cotation.creer", {
        id: "K2",
        niveauId: "rdc",
        calqueId: "C1",
        a: P(4, 2),
        b: P(4, 4),
        decalage: m(0.5),
        references: [
          { extremite: "a", objetId: "X1", caracteristique: "poteau:centre" },
          { extremite: "b", objetId: "X1", caracteristique: "poteau:centre" },
        ],
      }),
    ).etat;
    const r = recalculerCotation(e1, cotation(e1, "K2"));
    expect(r).toMatchObject({ a: P(4, 2), b: P(4, 4), etat: "a-reparer", change: true });
    expect(r.problemes[0]?.message).toMatch(/dégénérée/);
  });
});
