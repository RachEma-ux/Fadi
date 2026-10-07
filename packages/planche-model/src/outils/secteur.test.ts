import { describe, expect, it } from "vitest";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { aireTotale, aretes, clic, contientPoint, courbes, faces, partie, saisie, sommets, survol } from "./essais-formes.js";
import { MACHINE_SECTEUR } from "./secteur.js";

describe("Secteur (§4.13)", () => {
  it("étapes identiques à l'Arc, 12 côtés par défaut", () => {
    const p = partie(MACHINE_SECTEUR);
    expect(p.vue().consigne).toBe(etape("secteur", 0).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Côtés", valeur: "12" });
    p.jouer(clic(0, 0));
    expect(p.vue().mesures?.libelle).toBe("Longueur");
  });

  it("CA-SEC-1 : centre (0;0;0), « 2 », « 45 » → 12 arêtes d'arc + 2 rayons, une face d'aire ½·r²·n·sin(θ/n)", () => {
    const p = partie(MACHINE_SECTEUR).jouer(clic(0, 0), survol(1, 0), saisie("2"), saisie("45"));
    expect(aretes(p.modele)).toHaveLength(14);
    expect(aretes(p.modele).filter((a) => a.courbe)).toHaveLength(12);
    expect(courbes(p.modele)).toHaveLength(1);
    expect(faces(p.modele)).toHaveLength(1);
    const n = 12;
    const theta = Math.PI / 4;
    expect(aireTotale(p.modele)).toBeCloseTo(0.5 * 4 * n * Math.sin(theta / n), 12);
    expect(contientPoint(sommets(p.modele), v3(0, 0, 0))).toBe(true);
    expect(contientPoint(sommets(p.modele), v3(2, 0, 0))).toBe(true);
    expect(p.operations).toEqual(["Secteur"]);
  });

  it("trois clics et aperçu avec face", () => {
    const p = partie(MACHINE_SECTEUR).jouer(clic(0, 0), clic(1, 0), survol(0, 1));
    expect(p.vue().apercu.faces).toHaveLength(1);
    p.jouer(clic(0, 1));
    expect(aireTotale(p.modele)).toBeCloseTo(0.5 * 12 * Math.sin(Math.PI / 2 / 12), 9);
  });

  it("« 6s » après création : secteur reconstruit, un pas", () => {
    const p = partie(MACHINE_SECTEUR).jouer(clic(0, 0), survol(1, 0), saisie("2"), saisie("45"), saisie("6s"));
    expect(aretes(p.modele)).toHaveLength(8);
    expect(faces(p.modele)).toHaveLength(1);
    expect(p.historique).toHaveLength(2);
  });
});
