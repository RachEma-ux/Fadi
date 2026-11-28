import { describe, expect, it } from "vitest";
import { ajouterRectangle, modeleVide } from "../geometrie-libre.js";
import { ERREUR_ALTITUDE_FACE, ERREUR_ALTITUDE_NGF } from "../altitudes-l5.js";
import { v3 } from "../vecteur.js";
import { machineDeplacer } from "./deplacer.js";
import { boite, clicVers, emprise, partie, saisie, toutSelectionner, touche } from "./essais-modification.js";
import { machinePousserTirer } from "./pousser-tirer.js";
import { MACHINE_COURSE_SOLAIRE } from "./pointage-l5.js";

/** Partie dont le contexte porte l'altitude NGF du ±0,00. */
function avecReference<E>(p: ReturnType<typeof partie<E>>, reference: number | null) {
  const base = p.ctx;
  p.ctx = () => ({ ...base(), referenceNGF: reference });
  return p;
}

describe("Cas 2, lot 5 — Déplacer à une altitude (n° 55)", () => {
  it("Tab : Mesures attend l'altitude ±0,00, puis NGF ; le bas de la sélection est posé à l'altitude tapée", () => {
    const m = boite(4, 3, 2);
    const p = avecReference(partie(machineDeplacer, m, toutSelectionner(m)), 432.5);
    p.jouer(touche("Tab"));
    expect(p.vue().mesures?.libelle).toBe("Altitude ±0,00");
    p.jouer(saisie("3,10"));
    expect(emprise(p.modele).min.z).toBeCloseTo(3.1, 9);
    expect(emprise(p.modele).min.x).toBeCloseTo(0, 9);
    expect(p.operations).toEqual(["Déplacer"]);
    p.jouer(touche("Tab"));
    expect(p.vue().mesures?.libelle).toBe("Altitude NGF");
    expect(p.vue().mesures?.valeur).toBe("435.60 m");
    p.jouer(saisie("436"));
    expect(emprise(p.modele).min.z).toBeCloseTo(3.5, 9);
    p.jouer(touche("Tab"));
    expect(p.vue().mesures?.libelle).not.toBe("Altitude NGF");
  });

  it("altitude NGF sans ±0,00 déclaré : refusée, rien ne bouge", () => {
    const m = boite(1, 1, 1);
    const p = avecReference(partie(machineDeplacer, m, toutSelectionner(m)), null);
    p.jouer(touche("Tab"), touche("Tab"), saisie("436"));
    expect(p.vue().erreur).toBe(ERREUR_ALTITUDE_NGF);
    expect(p.operations).toEqual([]);
  });
});

describe("Cas 2, lot 5 — Pousser-tirer jusqu'à une altitude (n° 70)", () => {
  it("la face du sol est tirée jusqu'à l'altitude NGF tapée", () => {
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const p = avecReference(partie(machinePousserTirer, sol), 432.5);
    p.jouer(clicVers(v3(1, 1, 0)), touche("Tab"), touche("Tab"), saisie("438,70"));
    const e = emprise(p.modele);
    expect(e.max.z - e.min.z).toBeCloseTo(6.2, 9);
  });

  it("une face verticale ne se porte pas à une altitude", () => {
    const m = boite(1, 1, 1);
    const p = avecReference(partie(machinePousserTirer, m), 0);
    p.jouer(clicVers(v3(1, 0.5, 0.5), v3(1, 0, 0)), touche("Tab"), saisie("2"));
    expect(p.vue().erreur).toBe(ERREUR_ALTITUDE_FACE);
  });
});

describe("Cas 2, lot 5 — Course solaire depuis un point (n° 110)", () => {
  it("un clic donne le point d'observation et rend la main à la Sélection", () => {
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const p = partie(MACHINE_COURSE_SOLAIRE, sol);
    const t = MACHINE_COURSE_SOLAIRE.traiter(p.etat, clicVers(v3(1, 1, 0)), p.ctx());
    expect(t.pointObserve?.z).toBeCloseTo(0, 6);
    expect(t.outil).toBe("selection");
    expect(t.modele).toBeUndefined();
  });
});
