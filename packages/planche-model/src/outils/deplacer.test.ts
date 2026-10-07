import { describe, expect, it } from "vitest";
import { contexte } from "../geometrie-libre.js";
import { dot, normalize, sub, v3 } from "../vecteur.js";
import { positionsFace } from "../geometrie-libre.js";
import { etape } from "./commun-formes.js";
import { machineDeplacer } from "./deplacer.js";
import { aretes, boite, clicVers, contientPoint, emprise, faces, partie, saisie, sommets, survolVers, toutSelectionner, touche } from "./essais-modification.js";

const ORIGINE = v3(0, 0, 0);
const DEPUIS_ORIGINE = v3(-1, -1, -1); // vue qui arrive sur le coin (0;0;0) de la boîte

/** Positions des sommets groupées par objet : abscisse minimale des copies. */
const abscissesMin = (m: ReturnType<typeof boite>): number[] => {
  const xs = [...new Set(sommets(m).map((p) => Math.round(p.x * 1e9) / 1e9))].sort((a, b) => a - b);
  return xs;
};

describe("Déplacer (§4.16)", () => {
  it("consignes : rien de sélectionné, présélection, pendant, copie, tampon (catalogue)", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m);
    expect(p.vue().consigne).toBe(etape("deplacer", 0).consigne);
    const q = partie(machineDeplacer, m, toutSelectionner(m));
    expect(q.vue().consigne).toBe(etape("deplacer", 1).consigne);
    q.jouer(clicVers(ORIGINE, DEPUIS_ORIGINE));
    expect(q.vue().consigne).toBe(etape("deplacer", 2).consigne);
    q.jouer(touche("Ctrl"));
    expect(q.vue().consigne).toBe(etape("deplacer", 4).consigne);
  });

  it("CA-DEP-1 : boîte sélectionnée, base (0;0;0), →, 5 → translation exacte (5;0;0)", () => {
    const m = boite(4, 3, 2.7);
    const p = partie(machineDeplacer, m, toutSelectionner(m)).jouer(clicVers(ORIGINE, DEPUIS_ORIGINE), touche("FlecheDroite"), saisie("5"));
    const e = emprise(p.modele);
    expect(e.min.x).toBeCloseTo(5, 9);
    expect(e.max.x).toBeCloseTo(9, 9);
    expect(e.min.y).toBeCloseTo(0, 9);
    expect(e.max.z).toBeCloseTo(2.7, 9);
    expect(p.operations).toEqual(["Déplacer"]);
    expect(p.selection.length).toBeGreaterThan(0); // sélection gardée
  });

  it("CA-DEP-2 : copie de 5 sur rouge, x3 → 4 boîtes (0, 5, 10, 15) ; puis 2 → (0, 2, 4, 6) ; un seul pas d'annulation", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m, toutSelectionner(m)).jouer(touche("Ctrl"), clicVers(ORIGINE, DEPUIS_ORIGINE), touche("FlecheDroite"), saisie("5"));
    expect(abscissesMin(p.modele)).toEqual([0, 1, 5, 6]);
    p.jouer(saisie("x3"));
    expect(abscissesMin(p.modele)).toEqual([0, 1, 5, 6, 10, 11, 15, 16]);
    expect(p.historique).toHaveLength(2); // copie + réseau = un pas
    expect(p.selection).toEqual([]); // sélection vidée après le réseau
    p.jouer(saisie("2"));
    expect(abscissesMin(p.modele)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(p.historique).toHaveLength(2); // ré-espacement : toujours un seul pas
  });

  it("CA-DEP-3 : copie à 15 puis /3 → 0, 5, 10, 15", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m, toutSelectionner(m)).jouer(touche("Ctrl"), clicVers(ORIGINE, DEPUIS_ORIGINE), touche("FlecheDroite"), saisie("15"), saisie("/3"));
    expect(abscissesMin(p.modele)).toEqual([0, 1, 5, 6, 10, 11, 15, 16]);
    expect(p.historique).toHaveLength(2);
  });

  it("CA-DEP-4 : trois Ctrl → retour à « Déplacer » (consigne de la barre d'état)", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m, toutSelectionner(m));
    const de = (i: number) => etape("deplacer", i).consigne;
    expect(p.vue().consigne).toBe(de(1));
    p.jouer(touche("Ctrl"));
    expect(p.vue().consigne).toBe(de(3)); // copie armée
    p.jouer(touche("Ctrl"));
    expect(p.vue().consigne).toBe(de(5)); // tampon
    p.jouer(touche("Ctrl"));
    expect(p.vue().consigne).toBe(de(1)); // retour à Déplacer
  });

  it("CA-DEP-5 : Tampon, 3 clics → 3 copies, 3 pas d'annulation", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m, toutSelectionner(m)).jouer(touche("Ctrl"), touche("Ctrl"), clicVers(ORIGINE, DEPUIS_ORIGINE));
    for (const x of [3, 6, 9]) p.jouer(survolVers(v3(x, 0, 0), v3(-1, -1, -1)), clicVers(v3(x, 0, 0), v3(-1, -1, -1)));
    expect(abscissesMin(p.modele)).toEqual([0, 1, 3, 4, 6, 7, 9, 10]);
    expect(p.historique).toHaveLength(4); // état initial + 3 copies
    expect(p.operations).toEqual(["Tamponner", "Tamponner", "Tamponner"]);
  });

  it("CA-DEP-6 : arête du haut d'une boîte montée de 1 → 2 faces latérales trapézoïdales, dessus incliné, tout plan à 1e-9", () => {
    const m = boite(4, 3, 2.7);
    // Arête haute avant (y = 0, z = 2.7) : on la vise en son milieu.
    const p = partie(machineDeplacer, m).jouer(clicVers(v3(2, 0, 2.7), v3(0, -1, 1)), touche("FlecheHaut"), saisie("1"));
    const c = contexte(p.modele);
    expect(emprise(p.modele).max.z).toBeCloseTo(3.7, 9);
    const trapezes = Object.values(c.faces).filter((f) => Math.abs(f.normale.x) > 0.9);
    // Faces x = 0 et x = 4 : un côté vertical de 3,7 m (arête montée), l'autre de 2,7 m → trapèzes.
    for (const f of trapezes) {
      const zs = positionsFace(c, f).exterieur.map((q) => Math.round(q.z * 1e9) / 1e9).sort((a, b) => a - b);
      expect(zs).toEqual([0, 0, 2.7, 3.7]);
    }
    expect(trapezes).toHaveLength(2); // les deux faces latérales (x = 0 et x = 4)
    const dessus = Object.values(c.faces).filter((f) => positionsFace(c, f).exterieur.some((q) => Math.abs(q.z - 3.7) < 1e-9) && positionsFace(c, f).exterieur.some((q) => Math.abs(q.z - 2.7) < 1e-9) && Math.abs(Math.abs(f.normale.z) - 1) > 1e-6 && Math.abs(f.normale.x) < 1e-9 && Math.abs(f.normale.y) > 1e-6);
    expect(dessus.length).toBeGreaterThanOrEqual(1); // le dessus devient un plan incliné
    for (const f of Object.values(c.faces)) {
      const P = positionsFace(c, f).exterieur;
      const n = normalize(f.normale);
      for (const q of P) expect(Math.abs(dot(n, sub(q, P[0] as ReturnType<typeof v3>)))).toBeLessThan(1e-9);
    }
    expect(faces(p.modele).length).toBeGreaterThanOrEqual(6);
  });

  it("sommet seul : étirement des faces adjacentes, pas de copie (Ctrl sans effet)", () => {
    const m = boite(4, 3, 2.7);
    const p = partie(machineDeplacer, m).jouer(clicVers(v3(4, 3, 2.7), v3(1, 1, 1)), touche("Ctrl"), touche("FlecheHaut"), saisie("0.8"));
    expect(emprise(p.modele).max.z).toBeCloseTo(3.5, 9);
    expect(contientPoint(sommets(p.modele), v3(4, 3, 3.5))).toBe(true);
    expect(p.operations).toEqual(["Déplacer"]);
    for (const f of faces(p.modele)) {
      const c = contexte(p.modele);
      const P = positionsFace(c, f).exterieur;
      for (const q of P) expect(Math.abs(dot(normalize(f.normale), sub(q, P[0] as ReturnType<typeof v3>)))).toBeLessThan(1e-9);
    }
  });

  it("[x;y;z] absolu et <dx;dy;dz> relatif", () => {
    const m = boite(1, 1, 1);
    const a = partie(machineDeplacer, m, toutSelectionner(m)).jouer(clicVers(ORIGINE, DEPUIS_ORIGINE), saisie("[2;3;4]"));
    expect(emprise(a.modele).min.x).toBeCloseTo(2, 9);
    expect(emprise(a.modele).min.y).toBeCloseTo(3, 9);
    expect(emprise(a.modele).min.z).toBeCloseTo(4, 9);
    const b = partie(machineDeplacer, m, toutSelectionner(m)).jouer(clicVers(ORIGINE, DEPUIS_ORIGINE), saisie("<1;1;0>"));
    expect(emprise(b.modele).min.x).toBeCloseTo(1, 9);
    expect(emprise(b.modele).min.y).toBeCloseTo(1, 9);
  });

  it("flèches : un 2ᵉ appui libère le verrou ; Échap annule le déplacement en cours", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m, toutSelectionner(m)).jouer(clicVers(ORIGINE, DEPUIS_ORIGINE), touche("FlecheDroite"), touche("FlecheDroite"), survolVers(v3(0, 2, 0), v3(-1, -1, -1)));
    expect(p.vue().inference?.point.y).toBeCloseTo(2, 6); // plus verrouillé sur x
    p.jouer({ genre: "echap" });
    expect(p.historique).toHaveLength(1);
    expect(p.vue().consigne).toBe(etape("deplacer", 1).consigne);
  });

  it("saisie sans direction ni verrou : message ; réseau avant une copie : message", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineDeplacer, m, toutSelectionner(m)).jouer(clicVers(ORIGINE, DEPUIS_ORIGINE), saisie("5"));
    expect(p.vue().erreur).toMatch(/direction/);
    const q = partie(machineDeplacer, m, toutSelectionner(m)).jouer(clicVers(ORIGINE, DEPUIS_ORIGINE), touche("FlecheDroite"), saisie("x3"));
    expect(q.vue().erreur).toMatch(/copie/);
    expect(aretes(q.modele)).toHaveLength(12);
  });
});
