/** Lot 10a (EX-STATE-01, EX-NUM-02, EX-NUM-04 ; cas A-10, P-16, P-17 de la V1) : Pousser/Tirer complet, état et nombres. */
import { describe, expect, it } from "vitest";
import { type Id, ERREUR_DISTANCE_NON_FINIE, ERREUR_SOUS_TOLERANCE, ajouterRectangle, couronne, etirerAretes, modeleVide, pousserTirer, tuberFace } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { clicVers, echap, emprise, faces, partie, saisie } from "./essais-modification.js";
import { ERREUR_SENS_SANS_SOURCE, actionExtrusion, machinePousserTirer } from "./pousser-tirer.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const face = (m: ReturnType<typeof sol>) => Object.keys(m.racine.faces)[0] as Id;

describe("P-17 — nombres non finis et sous la tolérance (EX-NUM-04)", () => {
  it("NaN et ±∞ sont refusés par le noyau au lieu d'entrer dans la géométrie", () => {
    const m = sol();
    for (const d of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => pousserTirer(m, face(m), d)).toThrow(ERREUR_DISTANCE_NON_FINIE);
      expect(() => tuberFace(m, face(m), d)).toThrow(ERREUR_DISTANCE_NON_FINIE);
      expect(() => couronne(m, Object.keys(m.racine.aretes), d)).toThrow(ERREUR_DISTANCE_NON_FINIE);
    }
    expect(() => etirerAretes(m, [Object.keys(m.racine.aretes)[0]!], v3(0, 0, Number.NaN))).toThrow(ERREUR_DISTANCE_NON_FINIE);
  });
  it("une distance non nulle sous la tolérance de modélisation est refusée avec son motif", () => {
    const m = sol();
    expect(() => pousserTirer(m, face(m), 5e-7)).toThrow(ERREUR_SOUS_TOLERANCE);
    expect(() => tuberFace(m, face(m), -5e-7)).toThrow(ERREUR_SOUS_TOLERANCE);
  });
});

describe("A-10 — opération refusée et Échap (EX-STATE-01)", () => {
  it("valeur refusée puis valeur valide : la face reste acquise, une seule opération dans l'historique", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0"));
    expect(p.vue().erreur).toMatch(/nulle/);
    expect(p.etat.etape).toBe(2);
    p.jouer(saisie("2"));
    expect(p.historique).toHaveLength(2);
    expect(emprise(p.modele).max.z - emprise(p.modele).min.z).toBeCloseTo(2, 9);
  });
  it("Échap pendant l'aperçu : aucun pas d'historique, la sélection d'avant l'opération revient", () => {
    const m = sol();
    const p = partie(machinePousserTirer, m, ["x-avant"]).jouer(clicVers(v3(1, 1, 0)));
    expect(p.selection).toEqual([face(m)]);
    p.jouer(echap);
    expect(p.selection).toEqual(["x-avant"]);
    expect(p.historique).toHaveLength(1);
  });
});

describe("P-16 — distance signée et Inverser le sens (EX-NUM-02)", () => {
  it("le champ affiche la distance signée ; Inverser applique la valeur tapée de l'autre côté, une seule fois", () => {
    const p = partie(machinePousserTirer, sol()).jouer(clicVers(v3(1, 1, 0)));
    p.etat = actionExtrusion(p.etat, { type: "reverse-direction" }).etat;
    expect(p.vue().options?.find((o) => o.id === "sens")?.valeur).toBe("inverse");
    p.jouer(saisie("1"));
    expect(p.historique).toHaveLength(2);
    const z = emprise(p.modele);
    expect(z.min.z).toBeCloseTo(-1, 9);
    expect(faces(p.modele).length).toBeGreaterThan(1);
    // Le sens revient à « direct » après l'opération (appliqué une seule fois).
    expect(p.vue().options?.find((o) => o.id === "sens")?.valeur).toBe("direct");
  });
  it("Inverser sans face ni arête acquise : refus nommé", () => {
    const p = partie(machinePousserTirer, sol());
    expect(actionExtrusion(p.etat, { type: "reverse-direction" }).etat.erreur).toBe(ERREUR_SENS_SANS_SOURCE);
  });
});
