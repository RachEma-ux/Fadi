/** Objets O-2 (D-203) : géométrie hors du contexte ouvert, objet verrouillé non ouvrable, statut et détachement des liens. */
import { describe, expect, it } from "vitest";
import { type Id, ajouterRectangle, ajouterSegment, contexte, detacherLiens, etirerAretes, grouper, liensDesFaces, modeleVide, verrouillerOccurrences } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { cheminOccurrence } from "./outils/selection.js";
import { machineSelection } from "./outils/selection.js";
import { clicVers, partie } from "./outils/essais-modification.js";
import { v3 } from "./vecteur.js";

/** Deux rectangles au sol, le second groupé, puis le groupe dans un groupe. */
function imbrique() {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  m = ajouterRectangle(m, v3(3, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const loin = Object.values(contexte(m).faces).find((f) => contexte(m).sommets[f.exterieur[0]!]!.position.x > 2)!;
  const ids = [loin.id, ...Object.values(contexte(m).aretes).filter((a) => contexte(m).sommets[a.a]!.position.x > 2).map((a) => a.id)];
  const g = grouper(m, ids);
  const h = grouper(g.modele, [g.occurrence]);
  return { m: h.modele, externe: h.occurrence, interne: g.occurrence };
}

describe("Contexte d'édition lisible (Objets O-2)", () => {
  it("sans contexte ouvert, rien n'est marqué ; dans le groupe intérieur, seul son contenu reste net", () => {
    const { m, externe, interne } = imbrique();
    expect(geometrieVisible(m).faces.every((f) => !f.horsContexte)).toBe(true);
    const chemin = cheminOccurrence(m, interne);
    expect(chemin).toEqual([externe, interne]);
    const g = geometrieVisible(m, { chemin });
    expect(g.faces.filter((f) => !f.horsContexte)).toHaveLength(1);
    expect(g.faces.filter((f) => f.horsContexte)).toHaveLength(1);
    // Ouvrir seulement le groupe extérieur : le groupe intérieur, dessous, reste net.
    expect(geometrieVisible(m, { chemin: [externe] }).faces.filter((f) => !f.horsContexte)).toHaveLength(1);
  });

  it("double-clic sur un objet verrouillé : il est sélectionné, pas ouvert", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const c = contexte(m);
    const g = grouper(m, [...Object.keys(c.faces), ...Object.keys(c.aretes)]);
    m = verrouillerOccurrences(g.modele, [g.occurrence], true).modele;
    const p = partie(machineSelection, m).jouer(clicVers(v3(1, 1, 0), undefined, true));
    expect(p.selection).toEqual([g.occurrence]);
  });

  it("statut « Liée » d'une surface tirée de son arête, puis Détacher : géométrie inchangée, lien supprimé", () => {
    const ligne = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const a = Object.keys(contexte(ligne).aretes)[0] as Id;
    const m = etirerAretes(ligne, [a], v3(0, 0, 2)).modele;
    const surface = Object.keys(contexte(m).faces);
    const liens = liensDesFaces(m, surface);
    expect(liens).toHaveLength(1);
    const r = detacherLiens(m, liens).modele;
    expect(liensDesFaces(r, surface)).toHaveLength(0);
    expect(contexte(r).faces).toEqual(contexte(m).faces);
    expect(() => detacherLiens(r, liens)).toThrow(RangeError);
  });
});
