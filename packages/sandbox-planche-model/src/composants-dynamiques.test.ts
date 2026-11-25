/** Extension « Composants dynamiques » : formules, paramètres, options, règles appliquées aux objets enfants, copies. */
import { describe, expect, it } from "vitest";
import { COPIES_MAX, boiteDefinition, definirDynamique, definirParametre, estComposantDynamique, evaluerFormule, evaluerParametres, evaluerSaisie, nomParametreValide, objetsPilotables, redessinerDynamique } from "./composants-dynamiques.js";
import { differencePlanche, appliquerDeltaPlanche, lireModelePlanche } from "./delta.js";
import { type ComposantDynamique, type Id, type Modele, ajouterRectangle, appliquer, contexte, copier, grouper, modeleVide, modifierAnnotations, pousserTirer, rendreUnique } from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";

const VIDE = { valeur: () => undefined };
const f = (s: string, noms: Record<string, number | string> = {}) => evaluerFormule(s, { valeur: (n) => noms[n.toLowerCase()] });

/** Un composant « Étagère » qui contient une planche (boîte 1 × 0,3 × 0,02 m), elle-même un composant. */
function etagere(): { m: Modele; parent: Id; definition: Id; planche: Id } {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 0.3, 0)).modele;
  m = pousserTirer(m, Object.keys(m.racine.faces)[0]!, 0.02).modele;
  const planche = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)], { genre: "composant", nom: "Planche" });
  const parent = grouper(planche.modele, [planche.occurrence], { genre: "composant", nom: "Étagère" });
  return { m: parent.modele, parent: parent.occurrence, definition: parent.definition, planche: planche.occurrence };
}
const taille = (m: Modele, parent: Id, objet: Id) => {
  const o = contexte(m, parent).occurrences[objet]!;
  const b = boiteDefinition(m, o.definition)!;
  const a = appliquer(o.transformation, b.min);
  const z = appliquer(o.transformation, b.max);
  return [Math.abs(z.x - a.x), Math.abs(z.y - a.y), Math.abs(z.z - a.z)].map((x) => Number(x.toFixed(6)));
};

describe("Composants dynamiques — formules", () => {
  it("arithmétique, priorités, puissance, texte et comparaison", () => {
    expect(f("1+2*3")).toBe(7);
    expect(f("(1+2)*3")).toBe(9);
    expect(f("-2^2")).toBe(-4);
    expect(f('"L = " & 2.5 & " m"')).toBe("L = 2.5 m");
    expect(f("3 >= 2")).toBe(1);
    expect(f('"a" <> "a"')).toBe(0);
  });

  it("fonctions de SketchUp : IF, ROUND, CEILING, NEAREST, CHOOSE, LARGEST, trigonométrie en degrés", () => {
    expect(f("IF(Largeur > 1, 3, 2)", { largeur: 1.2 })).toBe(3);
    expect(f("ROUND(3.14159, 2)")).toBe(3.14);
    expect(f("CEILING(0.41, 0.1)")).toBeCloseTo(0.5, 9);
    expect(f("NEAREST(0.7, 0.6, 0.9, 1.2)")).toBe(0.6);
    expect(f('CHOOSE(2, "chêne", "hêtre")')).toBe("hêtre");
    expect(f("LARGEST(1, 5, 3) - SMALLEST(1; 5; 3)")).toBe(4);
    expect(f("SIN(90) + COS(0)")).toBeCloseTo(2, 9);
    expect(f("Parent!Largeur / 2", { largeur: 3 })).toBe(1.5);
  });

  it("refus nommés : nom inconnu, division par zéro, fonction inconnue, parenthèse, autre objet", () => {
    expect(() => f("Hauteur * 2")).toThrow(/Nom inconnu : Hauteur/);
    expect(() => f("1 / 0")).toThrow(/Division par zéro/);
    expect(() => f("RAND()")).toThrow(/Fonction inconnue/);
    expect(() => f("(1 + 2")).toThrow(/Parenthèse/);
    expect(() => f("Porte!LenX")).toThrow(/Parent!/);
  });

  it("saisie : formule, nombre à virgule ou texte", () => {
    expect(evaluerSaisie("=2*3", VIDE)).toBe(6);
    expect(evaluerSaisie("0,45", VIDE)).toBe(0.45);
    expect(evaluerSaisie("Chêne", VIDE)).toBe("Chêne");
  });
});

describe("Composants dynamiques — paramètres et options", () => {
  const dyn: ComposantDynamique = {
    parametres: [
      { nom: "Largeur", valeur: "1,2", option: { libelle: "Largeur (m)" } },
      { nom: "Essence", valeur: "hetre", option: { libelle: "Essence", choix: [{ libelle: "Chêne", valeur: "chene" }, { libelle: "Hêtre", valeur: "hetre" }] } },
      { nom: "Moitie", valeur: "=Largeur/2" },
      { nom: "Prix", valeur: "=CHOOSE(OPTIONINDEX(\"Essence\"), 100, 80) * Largeur" },
      { nom: "Etiquette", valeur: '=OPTIONLABEL("Essence") & " " & Largeur' },
    ],
    regles: [],
  };

  it("évalue dans l'ordre des dépendances ; OPTIONINDEX et OPTIONLABEL lisent la liste", () => {
    const r = evaluerParametres(dyn);
    expect(r.erreurs).toEqual([]);
    expect(r.valeurs).toEqual({ Largeur: 1.2, Essence: "hetre", Moitie: 0.6, Prix: 96, Etiquette: "Hêtre 1.2" });
  });

  it("boucle de références et noms : rapportés, jamais devinés", () => {
    const r = evaluerParametres({ parametres: [{ nom: "A", valeur: "=B+1" }, { nom: "B", valeur: "=A+1" }], regles: [] });
    expect(r.erreurs.map((e) => e.ou).sort()).toEqual(["A", "B"]);
    expect(r.erreurs[0]!.message).toMatch(/circulaire/);
    expect([nomParametreValide("Largeur"), nomParametreValide("2x"), nomParametreValide("ma largeur"), nomParametreValide("Copy"), nomParametreValide("ROUND")]).toEqual([true, false, false, false, false]);
  });

  it("forme vérifiée à la relecture : attribut inconnu, nom en double ou invalide refusés", () => {
    expect(estComposantDynamique(dyn)).toBe(true);
    expect(estComposantDynamique({ parametres: [], regles: [{ objet: "o1", attribut: "LenW", formule: "1" }] })).toBe(false);
    expect(estComposantDynamique({ parametres: [{ nom: "A", valeur: "1" }, { nom: "a", valeur: "2" }], regles: [] })).toBe(false);
    expect(estComposantDynamique({ parametres: [{ nom: "ma largeur", valeur: "1" }], regles: [] })).toBe(false);
  });
});

describe("Composants dynamiques — règles appliquées aux objets enfants", () => {
  const dynEtagere = (planche: Id, largeur = "1"): ComposantDynamique => ({
    parametres: [{ nom: "Largeur", valeur: largeur, option: { libelle: "Largeur (m)" } }, { nom: "Tablettes", valeur: "3", option: { libelle: "Tablettes" } }, { nom: "Entraxe", valeur: "0,35" }],
    regles: [
      { objet: planche, attribut: "LenX", formule: "=Largeur" },
      { objet: planche, attribut: "Copies", formule: "=Tablettes-1" },
      { objet: planche, attribut: "Z", formule: "=Copy*Entraxe" },
    ],
  });

  it("taille, position et copies suivent les paramètres ; changer une option redessine", () => {
    const e = etagere();
    const r = definirDynamique(e.m, e.definition, dynEtagere(e.planche));
    expect(r.erreurs).toEqual([]);
    const c = contexte(r.modele, e.parent);
    expect(Object.keys(c.occurrences)).toHaveLength(3);
    expect(Object.values(c.occurrences).map((o) => Number((o.transformation[11] as number).toFixed(6))).sort()).toEqual([0, 0.35, 0.7]);
    expect(taille(r.modele, e.parent, e.planche)).toEqual([1, 0.3, 0.02]);
    const large = definirParametre(r.modele, e.definition, "Largeur", "1,8");
    expect(large.erreurs).toEqual([]);
    expect(taille(large.modele, e.parent, e.planche)).toEqual([1.8, 0.3, 0.02]);
    for (const id of large.modele.definitions[e.definition]!.dynamique!.copies![e.planche]!) expect(taille(large.modele, e.parent, id)).toEqual([1.8, 0.3, 0.02]);
    const moins = definirParametre(large.modele, e.definition, "Tablettes", "1");
    expect(Object.keys(contexte(moins.modele, e.parent).occurrences)).toEqual([e.planche]);
    expect(moins.modele.definitions[e.definition]!.dynamique!.copies).toBeUndefined();
    expect(objetsPilotables(large.modele, e.definition).map((o) => o.id)).toEqual([e.planche]);
  });

  it("redessiner deux fois ne change rien ; le modèle se relit et passe par un delta", () => {
    const e = etagere();
    const r = definirDynamique(e.m, e.definition, dynEtagere(e.planche));
    const encore = redessinerDynamique(r.modele, e.definition);
    expect(encore.modele.definitions[e.definition]).toEqual(r.modele.definitions[e.definition]);
    expect(lireModelePlanche(JSON.parse(JSON.stringify(r.modele)))).not.toBeNull();
    const delta = differencePlanche(e.m, r.modele)!;
    expect(appliquerDeltaPlanche(e.m, delta)).toEqual(r.modele);
  });

  it("erreurs rapportées sans rien casser : paramètre en erreur, copies hors plafond, longueur nulle, matière inconnue", () => {
    const e = etagere();
    const casse = definirDynamique(e.m, e.definition, dynEtagere(e.planche, "=Inconnu*2"));
    expect(casse.erreurs.map((x) => x.ou)).toEqual(["Largeur"]);
    expect(contexte(casse.modele, e.parent).occurrences[e.planche]!.transformation).toEqual(contexte(e.m, e.parent).occurrences[e.planche]!.transformation);
    const trop = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "Copies", formule: String(COPIES_MAX + 1) }, { objet: e.planche, attribut: "LenY", formule: "0" }, { objet: e.planche, attribut: "Material", formule: "Chêne" }, { objet: "o999", attribut: "X", formule: "1" }] });
    expect(trop.erreurs.map((x) => x.ou).sort()).toEqual(["Planche.Copies", "Planche.LenY", "Planche.Material", "o999"].sort());
    expect(Object.keys(contexte(trop.modele, e.parent).occurrences)).toEqual([e.planche]);
  });

  it("matière par son nom, masquage et rotation", () => {
    const e = etagere();
    const m = modifierAnnotations(e.m, (a) => {
      a.materiaux.m1 = { id: "m1", nom: "Chêne", couleur: "#aa8855" };
    }).modele;
    const r = definirDynamique(m, e.definition, {
      parametres: [{ nom: "Ouverte", valeur: "1" }],
      regles: [{ objet: e.planche, attribut: "Material", formule: "chêne" }, { objet: e.planche, attribut: "Hidden", formule: "=NOT(Ouverte)" }, { objet: e.planche, attribut: "RotZ", formule: "=IF(Ouverte, 90, 0)" }],
    });
    expect(r.erreurs).toEqual([]);
    const o = contexte(r.modele, e.parent).occurrences[e.planche]!;
    expect([o.materiau, o.masquee]).toEqual(["m1", undefined]);
    expect(o.transformation.slice(0, 2).map((x) => Number(x.toFixed(6)))).toEqual([0, -1]);
    const ferme = definirParametre(r.modele, e.definition, "Ouverte", "0").modele;
    expect(contexte(ferme, e.parent).occurrences[e.planche]!.masquee).toBe(true);
  });

  it("les opérations ordinaires gardent la description ; « Rendre unique » détache une instance", () => {
    const e = etagere();
    const r = definirDynamique(e.m, e.definition, dynEtagere(e.planche)).modele;
    const deux = copier(r, [e.parent], v3(3, 0, 0));
    const copie = Object.keys(deux.modele.racine.occurrences).find((id) => id !== e.parent)!;
    expect(deux.modele.racine.occurrences[copie]!.definition).toBe(e.definition);
    const unique = rendreUnique(deux.modele, copie).modele;
    const autre = unique.racine.occurrences[copie]!.definition;
    expect(autre).not.toBe(e.definition);
    expect(unique.definitions[autre]!.dynamique?.parametres.map((p) => p.nom)).toEqual(["Largeur", "Tablettes", "Entraxe"]);
    const change = definirParametre(unique, autre, "Largeur", "2");
    expect(change.erreurs).toEqual([]);
    // Le contenu de la copie a ses propres identifiants : les règles les ont suivis.
    expect(taille(change.modele, copie, objetsPilotables(change.modele, autre)[0]!.id)).toEqual([2, 0.3, 0.02]);
    expect(taille(change.modele, e.parent, e.planche)).toEqual([1, 0.3, 0.02]);
  });

  it("retirer la description laisse la géométrie telle quelle", () => {
    const e = etagere();
    const r = definirDynamique(e.m, e.definition, dynEtagere(e.planche)).modele;
    const sans = definirDynamique(r, e.definition, null).modele;
    expect(sans.definitions[e.definition]!.dynamique).toBeUndefined();
    expect(sans.definitions[e.definition]!.contenu).toBe(r.definitions[e.definition]!.contenu);
  });
});
