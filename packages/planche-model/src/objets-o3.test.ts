/** Objets O-3 (D-205) : Éclater sans perte et transfert annoncé, « #k » de Rendre unique, Diviser en segments, copies. */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ajouterPolygone,
  ajouterRectangle,
  baliserOccurrences,
  contexte,
  copier,
  diviserCourbes,
  eclater,
  effacerEntites,
  grouper,
  masquerEntites,
  modeleVide,
  peindreFaces,
  peindreOccurrences,
  renommerOccurrence,
  rendreUnique,
  verrouillerOccurrences,
} from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { v3 } from "./vecteur.js";

const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes), ...Object.keys(contexte(m).occurrences)];

/** Un carré groupé (enfant), à côté d'un second carré ; les deux dans un groupe parent. */
function parentEtEnfant() {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const enfant = grouper(m, tout(m));
  m = ajouterRectangle(enfant.modele, v3(3, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const parent = grouper(m, tout(m));
  return { m: parent.modele, parent: parent.occurrence, enfant: enfant.occurrence };
}

describe("Éclater sans perte (O-3)", () => {
  it("l'enfant garde nom, verrou, masquage, matière et balise ; l'éclatement d'un niveau ne touche pas son contenu", () => {
    const { m: m0, parent, enfant } = parentEtEnfant();
    const dans = { dans: parent };
    let m = renommerOccurrence(m0, enfant, "Pied", dans).modele;
    m = peindreOccurrences(m, [enfant], "mat-rouge", dans).modele;
    m = baliserOccurrences(m, [enfant], "bal-mobilier", dans).modele;
    m = verrouillerOccurrences(m, [enfant], true, dans).modele;
    const r = eclater(m, parent);
    const occs = Object.values(contexte(r.modele).occurrences);
    expect(occs).toHaveLength(1);
    expect(occs[0]).toMatchObject({ nom: "Pied", materiau: "mat-rouge", balise: "bal-mobilier", verrouille: true });
    const masque = masquerEntites(m, [enfant], dans).modele;
    expect(Object.values(contexte(eclater(masque, parent).modele).occurrences)[0]!.masquee).toBe(true);
  });

  it("un groupe peint en bleu éclaté ne change pas d'apparence ; la face déjà peinte garde sa matière ; transferts comptés", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    m = ajouterRectangle(m, v3(3, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const rouge = Object.values(contexte(m).faces).find((f) => contexte(m).sommets[f.exterieur[0]!]!.position.x > 2)!.id;
    m = peindreFaces(m, [rouge], "mat-rouge").modele;
    const g = grouper(m, tout(m));
    const bleu = peindreOccurrences(g.modele, [g.occurrence], "mat-bleu").modele;
    const avant = geometrieVisible(bleu).faces.map((f) => f.materiau).sort();
    const r = eclater(bleu, g.occurrence);
    expect(geometrieVisible(r.modele).faces.map((f) => f.materiau).sort()).toEqual(avant);
    expect(Object.values(contexte(r.modele).faces).map((f) => f.materiauRecto).sort()).toEqual(["mat-bleu", "mat-rouge"]);
    expect(r.extra).toEqual({ materiauFaces: 1, materiauObjets: 0, baliseObjets: 0, baliseNonPortee: false });
  });

  it("la balise de l'objet passe aux enfants sans balise ; la géométrie nue ne la porte pas et le résultat le dit", () => {
    const { m: m0, parent, enfant } = parentEtEnfant();
    const m = baliserOccurrences(m0, [parent], "bal-a").modele;
    const r = eclater(m, parent);
    expect(Object.values(contexte(r.modele).occurrences)[0]!.balise).toBe("bal-a");
    expect(r.extra).toMatchObject({ baliseObjets: 1, baliseNonPortee: true });
    // Un enfant déjà balisé garde la sienne.
    const m2 = baliserOccurrences(m, [enfant], "bal-b", { dans: parent }).modele;
    expect(Object.values(contexte(eclater(m2, parent).modele).occurrences)[0]!.balise).toBe("bal-b");
  });

  it("une face masquée reste masquée après l'éclatement", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(m, tout(m));
    const face = Object.keys(g.modele.definitions[g.definition]!.contenu.faces)[0]!;
    m = masquerEntites(g.modele, [face], { dans: g.occurrence }).modele;
    const r = eclater(m, g.occurrence).modele;
    expect(Object.values(contexte(r).faces).map((f) => f.masquee)).toEqual([true]);
  });

  it("dans un composant à deux occurrences, Éclater agit dans le contexte édité (option dans), pas dans la première trouvée", () => {
    const { m: m0, parent, enfant } = parentEtEnfant();
    // Deux occurrences du parent (copie) : l'édition d'un groupe partagé le rend d'abord unique (I7).
    const deux = copier(m0, [parent], v3(10, 0, 0)).modele;
    const autre = Object.keys(contexte(deux).occurrences).find((id) => id !== parent)!;
    const r = eclater(deux, enfant, { dans: autre }).modele;
    const defDe = (id: Id) => r.definitions[contexte(r).occurrences[id]!.definition]!.contenu;
    expect(Object.keys(defDe(autre).occurrences)).toHaveLength(0);
    // L'autre occurrence garde le contenu d'origine (I7) ; le parent reçoit la copie, avec son enfant intact.
    expect(Object.keys(defDe(parent).occurrences)).toHaveLength(1);
  });

  it("refuse un objet verrouillé, modèle inchangé", () => {
    const { m: m0, parent } = parentEtEnfant();
    const m = verrouillerOccurrences(m0, [parent], true).modele;
    expect(() => eclater(m, parent)).toThrow(/verrouill/);
  });
});

describe("Rendre unique : « Nom#k » (O-3)", () => {
  it("deux Rendre unique successifs donnent « #1 » puis « #2 », jamais « #1#1 »", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(m0, tout(m0), { genre: "composant", nom: "Chaise" });
    const m = copier(g.modele, [g.occurrence], v3(2, 0, 0), { copies: 2 }).modele;
    const [, b, c] = Object.keys(contexte(m).occurrences);
    const r1 = rendreUnique(m, b!).modele;
    const r2 = rendreUnique(r1, c!).modele;
    const noms = Object.values(r2.definitions).map((d) => d.nom).sort();
    expect(noms).toEqual(["Chaise", "Chaise#1", "Chaise#2"]);
    // Rendre unique « Chaise#1 » partagé : « Chaise#3 », pas « Chaise#1#1 ».
    const r3 = copier(r2, [b!], v3(0, 5, 0)).modele;
    const r4 = rendreUnique(r3, b!).modele;
    expect(Object.values(r4.definitions).map((d) => d.nom).sort()).toEqual(["Chaise", "Chaise#1", "Chaise#2", "Chaise#3"]);
  });
});

describe("Diviser en segments (O-3)", () => {
  it("le cercle cesse d'être une courbe : arêtes et faces inchangées, la gomme n'efface plus qu'un segment", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 12).modele;
    const a = Object.keys(contexte(m).aretes)[0]!;
    const r = diviserCourbes(m, [a]);
    expect(r.extra).toBe(1);
    expect(Object.keys(contexte(r.modele).courbes)).toHaveLength(0);
    expect(Object.keys(contexte(r.modele).aretes)).toEqual(Object.keys(contexte(m).aretes));
    expect(Object.values(contexte(r.modele).aretes).every((x) => x.courbe === undefined)).toBe(true);
    expect(contexte(r.modele).faces).toEqual(contexte(m).faces);
    // Avant : la gomme efface tout le cercle ; après : un seul segment.
    expect(Object.keys(contexte(effacerEntites(m, [a]).modele).aretes)).toHaveLength(0);
    expect(Object.keys(contexte(effacerEntites(r.modele, [a]).modele).aretes)).toHaveLength(11);
  });

  it("refuse une sélection sans courbe", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    expect(() => diviserCourbes(m, Object.keys(contexte(m).aretes))).toThrow(RangeError);
  });
});

describe("Copier un objet garde ses attributs (O-3)", () => {
  it("nom, matière et balise suivent la copie ; verrou et masquage restent à l'original", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(m0, tout(m0));
    let m = renommerOccurrence(g.modele, g.occurrence, "Table").modele;
    m = peindreOccurrences(m, [g.occurrence], "mat-bois").modele;
    m = baliserOccurrences(m, [g.occurrence], "bal-mobilier").modele;
    const r = copier(m, [g.occurrence], v3(3, 0, 0)).modele;
    const copie = Object.values(contexte(r).occurrences).find((o) => o.id !== g.occurrence)!;
    expect(copie).toMatchObject({ nom: "Table", materiau: "mat-bois", balise: "bal-mobilier" });
  });
});
