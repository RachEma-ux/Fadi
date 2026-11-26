/** Outil Interagir (phase 1, lot 1) : le clic déclenche l'action au clic du composant dynamique visé. */
import { describe, expect, it } from "vitest";
import { definirDynamique, evaluerParametres } from "../composants-dynamiques.js";
import { type Id, type Modele, ajouterRectangle, grouper, modeleVide, pousserTirer } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { clicVers, partie, saisie, survolVers } from "./essais-modification.js";
import { ERREUR_INTERAGIR_AUCUN, machineInteragir } from "./interagir.js";

/** Planche 1 × 0,3 × 0,02 m dans un composant « Porte » ; `surClic` fait tourner le paramètre Ouverture. */
function porte(surClic?: string): { m: Modele; definition: Id; parent: Id } {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 0.3, 0)).modele;
  m = pousserTirer(m, Object.keys(m.racine.faces)[0]!, 0.02).modele;
  const planche = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)], { genre: "composant", nom: "Planche" });
  const parent = grouper(planche.modele, [planche.occurrence], { genre: "composant", nom: "Porte" });
  const dyn = { parametres: [{ nom: "Ouverture", valeur: "0" }], regles: [], ...(surClic ? { surClic } : {}) };
  return { m: definirDynamique(parent.modele, parent.definition, dyn).modele, definition: parent.definition, parent: parent.occurrence };
}
const ouverture = (m: Modele, definition: Id) => evaluerParametres(m.definitions[definition]!.dynamique!).valeurs["Ouverture"];
/** Point sur la planche, vu d'en haut ou d'en bas (le sens de l'extrusion ne compte pas). */
const SUR = v3(0.5, 0.15, 0.01);

describe("Interagir (phase 1, lot 1)", () => {
  it("consigne du catalogue ; le survol désigne le composant interactif, sans opération", () => {
    const e = porte('ALTER("Ouverture", 0, 90)');
    const p = partie(machineInteragir, e.m);
    expect(p.vue().consigne).toBe(etape("interagir", 0).consigne);
    p.jouer(survolVers(SUR));
    expect(p.etat.survol).toBe(e.definition);
    expect(p.etat.surligne).toBe(e.parent);
    expect(p.operations).toEqual([]);
  });

  it("chaque clic = un pas « Interagir » : le paramètre passe à la valeur suivante, en boucle", () => {
    const e = porte('ALTER("Ouverture", 0, 90)');
    const p = partie(machineInteragir, e.m).jouer(clicVers(SUR));
    expect(p.operations).toEqual(["Interagir"]);
    expect(ouverture(p.modele, e.definition)).toBe(90);
    p.jouer(clicVers(SUR));
    expect(ouverture(p.modele, e.definition)).toBe(0);
    expect(p.operations).toHaveLength(2);
  });

  it("refus nommés : rien sous le curseur, composant sans action, lecture seule, champ Mesures ; le modèle ne change pas", () => {
    const sans = porte();
    const p = partie(machineInteragir, sans.m).jouer(clicVers(SUR));
    expect(p.etat.erreur).toBe(ERREUR_INTERAGIR_AUCUN);
    p.jouer(clicVers(v3(5, 5, 0)));
    expect(p.etat.erreur).toBe(ERREUR_INTERAGIR_AUCUN);
    expect(p.operations).toEqual([]);

    const e = porte('ALTER("Ouverture", 0, 90)');
    const lecture = machineInteragir.traiter(machineInteragir.initial(), clicVers(SUR), { modele: e.m, selection: [], separateurDecimal: ".", lecture: true });
    expect(lecture.modele).toBeUndefined();
    expect(lecture.etat.erreur).toMatch(/Lecture seule/);

    const q = partie(machineInteragir, e.m).jouer(saisie("2"));
    expect(q.etat.erreur).toMatch(/champ Mesures/);
    expect(q.operations).toEqual([]);
  });

  it("une action en erreur s'affiche et ne change rien", () => {
    const e = porte('ALTER("Largeur", 1, 2)');
    const p = partie(machineInteragir, e.m).jouer(clicVers(SUR));
    expect(p.operations).toEqual([]);
    expect(p.modele).toBe(e.m);
    expect(p.etat.erreur).toMatch(/Largeur/);
  });
});
