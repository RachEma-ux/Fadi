/** Lot L16 : Texte 3D — aperçu en volume (mêmes faces que la pose), alignement, pose sur la face survolée. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, contexte, modeleVide, type Modele } from "../geometrie-libre.js";
import { geometrieVisible } from "../inference.js";
import { v3, type Vec3 } from "../vecteur.js";
import { clicVers, partie, survolVers } from "./essais-modification.js";
import { configurerTexte3D, facesDuTexte3D, machineTexte3D, type EtatTexte3D } from "./texte-3d.js";

const P = { texte: "AB", hauteur: 0.3, plein: true, extrusion: 0.15 };
const boite = (pts: readonly Vec3[]) => {
  const b = (k: "x" | "y" | "z") => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))];
  return [...b("x"), ...b("y"), ...b("z")];
};
const preparer = (m: Modele) => {
  const p = partie(machineTexte3D, m);
  p.etat = configurerTexte3D(p.etat as EtatTexte3D, P);
  return p;
};

describe("Texte 3D (L16)", () => {
  it("aperçu = pose : même nombre de faces et même boîte englobante (± 1e-9), volume compris", () => {
    const p = preparer(modeleVide()).jouer(survolVers(v3(1, 1, 0)));
    const ap = p.vue().apercu.faces;
    const avant = ap.length;
    const bAp = boite(ap.flat());
    expect(bAp[5]! - bAp[4]!).toBeCloseTo(0.15, 9); // l'aperçu a de l'épaisseur
    p.jouer(clicVers(v3(1, 1, 0)));
    const g = geometrieVisible(p.modele);
    expect(g.faces.length).toBe(avant);
    const bPose = boite(g.faces.flatMap((f) => f.exterieur));
    bPose.forEach((x, i) => expect(x).toBeCloseTo(bAp[i]!, 9));
  });

  it("alignement centre : la boîte est centrée sur le point ; droite : elle finit au point", () => {
    const c = facesDuTexte3D(P, v3(5, 0, 0), undefined, "centre");
    const b = boite(c.faces.flat(2));
    expect((b[0]! + b[1]!) / 2).toBeCloseTo(5, 9);
    const d = facesDuTexte3D(P, v3(5, 0, 0), undefined, "droite");
    expect(boite(d.faces.flat(2))[1]).toBeCloseTo(5, 9);
    const p = preparer(modeleVide()).configurer("alignement", "centre");
    expect(p.vue().options?.[0]?.valeur).toBe("centre");
  });

  it("pose sur une face verticale : le texte est dans le plan de la face, extrudé selon sa normale", () => {
    // Mur vertical dans le plan y = 0, face tournée vers −y (vers la caméra des essais).
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(0, 0, 3), v3(4, 0, 0)).modele;
    const n = Object.values(contexte(m).faces)[0]!.normale;
    const p = preparer(m).jouer(clicVers(v3(1, 0, 1), v3(0, -n.y, 0)));
    const pts = geometrieVisible(p.modele).faces.filter((f) => f.dansObjet).flatMap((f) => f.exterieur);
    const b = boite(pts);
    expect(Math.abs(b[3]! - b[2]!)).toBeCloseTo(0.15, 9); // épaisseur selon y = extrusion
    expect(b[5]! - b[4]!).toBeGreaterThan(0.2); // les lettres montent selon z
    const ys = pts.map((q) => q.y * Math.sign(n.y));
    expect(Math.min(...ys)).toBeCloseTo(0, 9); // posé sur la face, extrudé vers l'extérieur
  });
});
