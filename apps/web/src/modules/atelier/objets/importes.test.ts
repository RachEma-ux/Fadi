import { describe, expect, it } from "vitest";
import { nonEvaluee } from "@parcours/atelier-model";
import { banc, cmd, deg, etatDeTest, m, P } from "./__tests__/banc";

const tete = { niveauId: "rdc", calqueId: "C1" };
const contour = [P(0, 0), P(6, 0), P(6, 4), P(0, 4)];
const trou = [P(2, 1), P(3, 1), P(3, 2), P(2, 2)];

/** Classes sans outil (affichage de P.118 importé) : toiture, poteau, solide, dessinées depuis l'état réel. */
const etat = () =>
  etatDeTest(
    cmd("toiture.creer", { id: "T1", ...tete, contour, trous: [{ polygone: trou }], type: "plate", epaisseur: m(0.3), pente: nonEvaluee("pente non fournie"), decalageBase: m(3) }),
    cmd("poteau.creer", { id: "C1p", ...tete, point: P(10, 0), formeId: "rect", largeur: m(0.4), profondeur: m(0.2), hauteur: m(3), angle: deg(90) }),
    cmd("solide.extruder", { id: "S1", ...tete, contour, trous: [], ferme: true, hauteur: m(1), decalageBase: m(0), role: "core-zone" }),
    cmd("solide.extruder", { id: "S2", ...tete, contour: [P(0, 10), P(5, 10), P(5, 12)], trous: [], ferme: false, hauteur: m(1), decalageBase: m(0), role: "clearance" }),
  );

describe("dessinateurs sans outil : toiture, poteau, solide", () => {
  const b = banc(etat());
  const dessiner = (id: string) => {
    const o = b.etat().objets[id];
    if (!o) throw new Error(id);
    return b.registres.dessinateurs.pour(o.classe)?.dessiner(o, b.etat()) ?? null;
  };

  it("toiture : contour et trou en segments, couche fond, contour de sélection", () => {
    const d = dessiner("T1");
    expect(d).toMatchObject({ objetId: "T1", couche: "fond" });
    expect(d?.segments).toHaveLength(8);
    expect(d?.contour).toHaveLength(4);
    expect(d?.formes[0]).toMatchObject({ forme: "polygone", style: "trait" });
  });

  it("poteau : rectangle tourné de l'angle, point d'insertion accrochable", () => {
    const d = dessiner("C1p");
    expect(d?.points).toEqual([{ x: 10, y: 0 }].map((p) => expect.objectContaining(p)));
    expect(d?.segments).toHaveLength(4);
    // Angle 90° : la largeur (0,4) suit l'axe y, la profondeur (0,2) l'axe x.
    const xs = (d?.contour ?? []).map((p) => p.x);
    const ys = (d?.contour ?? []).map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.4, 9);
  });

  it("solide fermé : polygone et contour ; solide ouvert : polyligne sans contour de sélection", () => {
    const f = dessiner("S1");
    expect(f?.segments).toHaveLength(4);
    expect(f?.contour).toHaveLength(4);
    const o = dessiner("S2");
    expect(o?.segments).toHaveLength(2);
    expect(o?.contour).toBeNull();
    expect(o?.formes[0]).toMatchObject({ forme: "polyligne", fermee: false });
  });
});
