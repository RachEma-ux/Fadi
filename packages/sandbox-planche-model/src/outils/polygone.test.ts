import { describe, expect, it } from "vitest";
import { compter, effacerArete } from "../geometrie-libre.js";
import { dist, v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { aretes, clic, contientPoint, courbes, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";
import { MACHINE_POLYGONE } from "./polygone.js";

const O = v3(0, 0, 0);

describe("Polygone (§4.9)", () => {
  it("étape 1 « Côtés · 6 », étape 2 « Rayon inscrit » puis « Rayon circonscrit » après Ctrl", () => {
    const p = partie(MACHINE_POLYGONE);
    expect(p.vue().mesures).toMatchObject({ libelle: "Côtés", valeur: "6" });
    p.jouer(clic(0, 0), survol(1, 0));
    expect(p.vue().mesures?.libelle).toBe("Rayon inscrit");
    expect(p.vue().consigne).toBe(etape("polygone", 1).consigne);
    p.jouer(touche("Ctrl"));
    expect(p.vue().mesures?.libelle).toBe("Rayon circonscrit");
    expect(p.vue().consigne).toBe(etape("polygone", 2).consigne);
  });

  it("CA-POL-1 : 6 côtés, rayon inscrit 1 → sommets à 1 m du centre, une face", () => {
    const p = partie(MACHINE_POLYGONE).jouer(clic(0, 0), survol(1, 0), saisie("1"));
    const s = sommets(p.modele);
    expect(s).toHaveLength(6);
    expect(s.every((q) => Math.abs(dist(q, O) - 1) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(1, 0, 0))).toBe(true);
    expect(faces(p.modele)).toHaveLength(1);
    expect(courbes(p.modele)[0]?.genre).toBe("polygone");
  });

  it("CA-POL-2 : Ctrl puis rayon 1 → apothème 1 m (sommets à 1/cos 30°), milieu d'un côté vers le curseur", () => {
    const p = partie(MACHINE_POLYGONE).jouer(clic(0, 0), touche("Ctrl"), survol(1, 0), saisie("1"));
    const s = sommets(p.modele);
    const r = 1 / Math.cos(Math.PI / 6);
    expect(s.every((q) => Math.abs(dist(q, O) - r) < 1e-9)).toBe(true);
    // milieu du côté traversant +x à (1;0;0)
    const ar = aretes(p.modele).map((a) => {
      const A = p.modele.racine.sommets[a.a]?.position ?? O;
      const B = p.modele.racine.sommets[a.b]?.position ?? O;
      return v3((A.x + B.x) / 2, (A.y + B.y) / 2, 0);
    });
    expect(contientPoint(ar, v3(1, 0, 0))).toBe(true);
  });

  it("circonscrit au curseur : la distance centre → curseur est l'apothème", () => {
    const p = partie(MACHINE_POLYGONE).jouer(clic(0, 0), touche("Ctrl"), survol(0, 2), clic(0, 2));
    const r = 2 / Math.cos(Math.PI / 6);
    expect(sommets(p.modele).every((q) => Math.abs(dist(q, O) - r) < 1e-9)).toBe(true);
  });

  it("CA-POL-3 : gomme sur un côté → 0 entité restante", () => {
    const p = partie(MACHINE_POLYGONE).jouer(clic(0, 0), survol(1, 0), saisie("1"));
    const a = aretes(p.modele)[0];
    expect(a).toBeDefined();
    const m = effacerArete(p.modele, a?.id ?? "").modele;
    expect(compter(m.racine)).toEqual({ sommets: 0, aretes: 0, faces: 0, occurrences: 0 });
  });

  it("« 8s » après création reconstruit (même mode, même valeur), un seul pas", () => {
    const p = partie(MACHINE_POLYGONE).jouer(clic(0, 0), touche("Ctrl"), survol(1, 0), saisie("1"), saisie("8s"));
    const s = sommets(p.modele);
    expect(s).toHaveLength(8);
    const r = 1 / Math.cos(Math.PI / 8);
    expect(s.every((q) => Math.abs(dist(q, O) - r) < 1e-9)).toBe(true);
    expect(p.historique).toHaveLength(2);
  });

  it("Ctrl − / Ctrl + et bornes", () => {
    const p = partie(MACHINE_POLYGONE).jouer(touche("CtrlMoins"), touche("CtrlMoins"), touche("CtrlMoins"), touche("CtrlMoins"));
    expect(p.vue().mesures?.valeur).toBe("3");
    expect(p.vue().erreur).not.toBeNull();
    p.jouer(saisie("999"), touche("CtrlPlus"));
    expect(p.vue().mesures?.valeur).toBe("999");
    expect(p.vue().erreur).not.toBeNull();
  });

  it("erreur : « 2 » côtés refusé", () => {
    const p = partie(MACHINE_POLYGONE).jouer(saisie("2"));
    expect(p.vue().erreur).toMatch(/entre 3 et 999/);
    expect(p.vue().mesures?.valeur).toBe("2");
    p.jouer(survol(0, 0));
    expect(p.vue().mesures?.valeur).toBe("2"); // le champ garde le texte tapé
  });
});
