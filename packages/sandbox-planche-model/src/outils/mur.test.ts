/** Outil Mur (cas 4, étape 4) : tracé cliqué, longueur tapée, fermeture, référence, refus nommés. */
import { describe, expect, it } from "vitest";
import { mursDuModele } from "../murs.js";
import { clic, echap, partie, saisie, survol, touche } from "./essais-formes.js";
import { ERREUR_SANS_PARAMETRES, machineMur, type EtatMur } from "./mur.js";

const avecParametres = (epaisseur = 0.2, hauteur = 2.5) => {
  const p = partie<EtatMur>(machineMur);
  const base = p.ctx;
  p.ctx = () => ({ ...base(), parametresMur: { epaisseur, hauteur } });
  return p;
};

describe("outil Mur", () => {
  it("clics puis Entrée : un mur en un pas, sélectionné", () => {
    const p = avecParametres().jouer(survol(0, 0), clic(0, 0), survol(4, 0), clic(4, 0), survol(4, 3), clic(4, 3), touche("Entree"));
    expect(p.operations).toEqual(["Mur"]);
    const [w] = mursDuModele(p.modele);
    expect(w!.axe).toHaveLength(3);
    expect(w!.epaisseur).toBe(0.2);
    expect(p.etat.points).toEqual([]);
  });

  it("double-clic termine ; longueur tapée dans la direction du curseur", () => {
    const p = avecParametres().jouer(survol(0, 0), clic(0, 0), survol(1, 0), saisie("5"), survol(5, 2), clic(5, 2, true));
    const [w] = mursDuModele(p.modele);
    expect(w!.axe[1]!.x).toBeCloseTo(5, 9);
    expect(w!.axe[1]!.y).toBeCloseTo(0, 9);
  });

  it("clic sur le premier point : mur fermé", () => {
    const p = avecParametres().jouer(clic(0, 0), clic(4, 0), clic(4, 3), clic(0, 3), clic(0, 0));
    const [w] = mursDuModele(p.modele);
    expect(w!.ferme).toBe(true);
    expect(w!.axe).toHaveLength(4);
  });

  it("Ctrl seul et barre d'options : côté de référence", () => {
    const p = avecParametres();
    expect(p.vue().options?.[0]).toMatchObject({ id: "reference", valeur: "axe" });
    p.etat = machineMur.modificateurSeul!(p.etat, "Ctrl", p.ctx()).etat;
    expect(p.etat.reference).toBe("interieur");
    p.etat = machineMur.configurer!(p.etat, "reference", "exterieur", p.ctx()).etat;
    p.jouer(clic(0, 0), clic(4, 0), touche("Entree"));
    expect(mursDuModele(p.modele)[0]!.reference).toBe("exterieur");
  });

  it("sans épaisseur ni hauteur : rien n'est posé, motif affiché", () => {
    const p = partie<EtatMur>(machineMur).jouer(clic(0, 0));
    expect(p.etat.erreur).toBe(ERREUR_SANS_PARAMETRES);
    expect(p.vue().consigne).toContain(ERREUR_SANS_PARAMETRES);
  });

  it("Échap annule le tracé en cours ; aperçu de l'empreinte au survol", () => {
    const p = avecParametres().jouer(clic(0, 0), survol(3, 0));
    expect(p.vue().apercu.faces).toHaveLength(1);
    p.jouer(echap);
    expect(p.etat.points).toEqual([]);
    expect(p.operations).toEqual([]);
  });
});
