/** Extension « Composants dynamiques » : formules, paramètres, options, règles appliquées aux objets enfants, copies. */
import { describe, expect, it } from "vitest";
import { COPIES_MAX, anglesRotation, axesRotation, boiteDefinition, cliquerDynamique, definitionInteractive, lireSurClic, definirDynamique, definirParametre, estComposantDynamique, evaluerFormule, evaluerParametres, evaluerSaisie, nomParametreValide, objetsPilotables, redessinerDynamique } from "./composants-dynamiques.js";
import { differencePlanche, appliquerDeltaPlanche, lireModelePlanche } from "./delta.js";
import { type ComposantDynamique, type Id, type Modele, ajouterRectangle, appliquer, contexte, copier, grouper, modeleVide, modifierAnnotations, pousserTirer, renommerOccurrence, rendreUnique } from "./geometrie-libre.js";
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
    // Un paramètre ne lit pas les objets (phase 1, lot 1 : seules les règles le peuvent).
    expect(() => f("Porte!LenX")).toThrow(/un paramètre ne lit pas les objets/);
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

  it("une erreur sur une copie seulement est rapportée ; une matière inconnue laisse la matière déjà posée", () => {
    const e = etagere();
    const copie = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "Copies", formule: "1" }, { objet: e.planche, attribut: "X", formule: "=1/(1-Copy)" }] });
    expect(copie.erreurs.map((x) => [x.ou, x.cle])).toEqual([["Planche.X", "division"]]);
    let m = modifierAnnotations(e.m, (a) => {
      a.materiaux.m1 = { id: "m1", nom: "Chêne", couleur: "#aa8855" };
    }).modele;
    m = definirDynamique(m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "Material", formule: "Chêne" }] }).modele;
    const faute = definirDynamique(m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "Material", formule: "Chene" }] });
    expect(faute.erreurs.map((x) => x.cle)).toEqual(["matiere"]);
    expect(faute.erreurs[0]!.args).toEqual({ nom: "Chene" });
    expect(contexte(faute.modele, e.parent).occurrences[e.planche]!.materiau).toBe("m1");
  });

  it("ce que la relecture refuserait n'est pas enregistré : valeur trop longue, trop de paramètres", () => {
    const e = etagere();
    const long = definirDynamique(e.m, e.definition, { parametres: [{ nom: "A", valeur: "x".repeat(501) }], regles: [] });
    expect(long.modele).toBe(e.m);
    expect(long.erreurs.map((x) => x.cle)).toEqual(["limites"]);
    const trop = definirDynamique(e.m, e.definition, { parametres: Array.from({ length: 65 }, (_, i) => ({ nom: `P${i}`, valeur: "1" })), regles: [] });
    expect(trop.modele).toBe(e.m);
    const bon = definirDynamique(e.m, e.definition, { parametres: [{ nom: "A", valeur: "x".repeat(500) }], regles: [] });
    expect(lireModelePlanche(JSON.parse(JSON.stringify(bon.modele)))).not.toBeNull();
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

/** Une « Table » qui contient deux objets : la planche d'origine (« Planche ») et sa copie renommée « Pied ». */
function table(nomPied = "Pied"): { m: Modele; parent: Id; definition: Id; plateau: Id; pied: Id } {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 0.3, 0)).modele;
  m = pousserTirer(m, Object.keys(m.racine.faces)[0]!, 0.02).modele;
  const plateau = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)], { genre: "composant", nom: "Planche" });
  m = copier(plateau.modele, [plateau.occurrence], v3(2, 0, 0)).modele;
  const pied = Object.keys(m.racine.occurrences).find((id) => id !== plateau.occurrence)!;
  m = renommerOccurrence(m, pied, nomPied).modele;
  const parent = grouper(m, [plateau.occurrence, pied], { genre: "composant", nom: "Table" });
  return { m: parent.modele, parent: parent.occurrence, definition: parent.definition, plateau: plateau.occurrence, pied };
}
const arrondi = (xs: readonly number[]) => xs.map((x) => (Math.abs(x) < 1e-9 ? 0 : Number(x.toFixed(6))));
const colonneDe = (m: Modele, parent: Id, objet: Id, c: number) => {
  const M = contexte(m, parent).occurrences[objet]!.transformation;
  return arrondi([M[c] as number, M[4 + c] as number, M[8 + c] as number]);
};

describe("Composants dynamiques — phase 1, lot 1 : RotX et RotY", () => {
  it("RotX, RotY puis RotZ, dans cet ordre, autour des axes du composant", () => {
    const e = etagere();
    const rx = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "RotX", formule: "90" }] });
    expect(rx.erreurs).toEqual([]);
    expect(colonneDe(rx.modele, e.parent, e.planche, 1)).toEqual([0, 0, 1]);
    expect(colonneDe(rx.modele, e.parent, e.planche, 2)).toEqual([0, -1, 0]);
    const ry = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "RotY", formule: "=45*2" }] });
    expect(colonneDe(ry.modele, e.parent, e.planche, 0)).toEqual([0, 0, -1]);
    const xz = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "RotX", formule: "90" }, { objet: e.planche, attribut: "RotZ", formule: "90" }] });
    expect(colonneDe(xz.modele, e.parent, e.planche, 0)).toEqual([0, 1, 0]);
    expect(colonneDe(xz.modele, e.parent, e.planche, 1)).toEqual([0, 0, 1]);
    // La taille suit les axes tournés : LenY reste la longueur le long de l'axe Y de l'objet.
    const etire = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "RotX", formule: "90" }, { objet: e.planche, attribut: "LenY", formule: "0,6" }] });
    expect(colonneDe(etire.modele, e.parent, e.planche, 1)).toEqual([0, 0, 2]);
  });

  it("angles relus des axes : aller-retour exact ; un angle sans règle garde sa valeur actuelle", () => {
    expect(arrondi(anglesRotation(axesRotation(10, 20, 30)))).toEqual([10, 20, 30]);
    expect(arrondi(anglesRotation(axesRotation(0, 0, -135)))).toEqual([0, 0, -135]);
    const e = etagere();
    const tourne = definirDynamique(e.m, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "RotZ", formule: "90" }] }).modele;
    // Règle RotZ retirée, règle RotX ajoutée : la rotation de 90° autour de Z (actuelle) est gardée.
    const puis = definirDynamique(tourne, e.definition, { parametres: [], regles: [{ objet: e.planche, attribut: "RotX", formule: "90" }] });
    expect(puis.erreurs).toEqual([]);
    expect(colonneDe(puis.modele, e.parent, e.planche, 0)).toEqual([0, 1, 0]);
    expect(colonneDe(puis.modele, e.parent, e.planche, 1)).toEqual([0, 0, 1]);
  });
});

describe("Composants dynamiques — phase 1, lot 1 : une règle lit un autre objet", () => {
  it("« Pied!LenZ » lit la valeur de la règle de l'autre objet ; « Pied!X » sa valeur actuelle sans règle", () => {
    const e = table();
    const r = definirDynamique(e.m, e.definition, {
      parametres: [{ nom: "Hauteur", valeur: "0,75" }],
      regles: [
        { objet: e.plateau, attribut: "Z", formule: "=Pied!LenZ" },
        { objet: e.plateau, attribut: "X", formule: "=pied!x - 1" },
        { objet: e.pied, attribut: "LenZ", formule: "=Hauteur" },
      ],
    });
    expect(r.erreurs).toEqual([]);
    const o = contexte(r.modele, e.parent).occurrences[e.plateau]!;
    expect(arrondi([o.transformation[3] as number, o.transformation[11] as number])).toEqual([1, 0.75]);
    expect(taille(r.modele, e.parent, e.pied)).toEqual([1, 0.3, 0.75]);
    // L'ordre des règles ne compte pas : une référence calcule la règle lue si elle ne l'est pas encore.
    const inverse = definirDynamique(e.m, e.definition, { ...r.modele.definitions[e.definition]!.dynamique!, regles: [...r.modele.definitions[e.definition]!.dynamique!.regles].reverse() });
    expect(contexte(inverse.modele, e.parent).occurrences[e.plateau]!.transformation).toEqual(o.transformation);
  });

  it("refus nommés : objet inconnu, nom en double, attribut inconnu, boucle, règle lue en erreur, paramètre", () => {
    const e = table();
    const essai = (regles: ComposantDynamique["regles"], parametres: ComposantDynamique["parametres"] = []) => definirDynamique(e.m, e.definition, { parametres, regles }).erreurs.map((x) => [x.ou, x.cle]);
    expect(essai([{ objet: e.plateau, attribut: "Z", formule: "=Porte!LenZ" }])).toEqual([["Planche.Z", "reference"]]);
    expect(essai([{ objet: e.plateau, attribut: "Z", formule: "=Pied!Largeur" }])).toEqual([["Planche.Z", "reference-attribut"]]);
    expect(essai([{ objet: e.plateau, attribut: "Z", formule: "=Pied!Z" }, { objet: e.pied, attribut: "Z", formule: "=Planche!Z" }]).map((x) => x[1])).toContain("circulaire");
    expect(essai([{ objet: e.plateau, attribut: "Z", formule: "=Pied!LenZ" }, { objet: e.pied, attribut: "LenZ", formule: "=1/0" }])).toEqual([["Pied.LenZ", "division"], ["Planche.Z", "reference-erreur"]]);
    expect(essai([], [{ nom: "A", valeur: "=Pied!LenZ" }])).toEqual([["A", "reference-parametre"]]);
    const double = table("Planche");
    const ambigu = definirDynamique(double.m, double.definition, { parametres: [], regles: [{ objet: double.plateau, attribut: "Z", formule: "=Planche!Z" }] });
    expect(ambigu.erreurs.map((x) => x.cle)).toEqual(["reference-ambigue"]);
  });
});

describe("Composants dynamiques — phase 1, lot 1 : action au clic (outil Interagir)", () => {
  const porte = (e: ReturnType<typeof etagere>, surClic: string): Modele =>
    definirDynamique(e.m, e.definition, { parametres: [{ nom: "Ouverture", valeur: "0" }, { nom: "Teinte", valeur: "Blanc" }], regles: [{ objet: e.planche, attribut: "RotZ", formule: "=Ouverture" }], surClic }).modele;

  it("ALTER passe à la valeur suivante de la liste, en boucle, et le composant est redessiné", () => {
    const e = etagere();
    const m = porte(e, 'ALTER("Ouverture", 0, 90)');
    const un = cliquerDynamique(m, e.definition);
    expect(un.erreurs).toEqual([]);
    expect(un.modele.definitions[e.definition]!.dynamique!.parametres[0]!.valeur).toBe("90");
    expect(colonneDe(un.modele, e.parent, e.planche, 0)).toEqual([0, 1, 0]);
    const deux = cliquerDynamique(un.modele, e.definition);
    expect(deux.modele.definitions[e.definition]!.dynamique!.parametres[0]!.valeur).toBe("0");
    expect(colonneDe(deux.modele, e.parent, e.planche, 0)).toEqual([1, 0, 0]);
  });

  it("SET à une valeur la pose ; plusieurs actions séparées par « ; » ; valeur absente de la liste = la première", () => {
    const e = etagere();
    const m = porte(e, 'SET("Teinte", "Rouge ; vif") ; set(Ouverture, 30, 60)');
    expect(lireSurClic('SET("Teinte", "Rouge ; vif") ; set(Ouverture, 30, 60)').map((a) => [a.action, a.parametre, a.valeurs.length])).toEqual([["SET", "Teinte", 1], ["SET", "Ouverture", 2]]);
    const r = cliquerDynamique(m, e.definition);
    expect(r.erreurs).toEqual([]);
    expect(r.modele.definitions[e.definition]!.dynamique!.parametres.map((p) => p.valeur)).toEqual(["30", "Rouge ; vif"]);
    const encore = cliquerDynamique(r.modele, e.definition);
    expect(encore.modele.definitions[e.definition]!.dynamique!.parametres[0]!.valeur).toBe("60");
  });

  it("refus nommés, et rien n'est modifié : action inconnue, paramètre inconnu, forme illisible, aucune action", () => {
    const e = etagere();
    for (const [surClic, cle] of [['ANIMATE("Ouverture", 0, 90)', "action"], ['ALTER("Largeur", 1, 2)', "action-parametre"], ["ALTER(Ouverture)", "action-forme"], ["Ouverture = 90", "action-forme"]] as const) {
      const m = porte(e, surClic);
      const r = cliquerDynamique(m, e.definition);
      expect(r.erreurs.map((x) => x.cle)).toEqual([cle]);
      expect(r.modele).toBe(m);
    }
    const sans = definirDynamique(e.m, e.definition, { parametres: [], regles: [] }).modele;
    expect(cliquerDynamique(sans, e.definition).erreurs.map((x) => x.cle)).toEqual(["sans-clic"]);
    expect(cliquerDynamique(e.m, e.definition).erreurs.map((x) => x.cle)).toEqual(["pas-dynamique"]);
  });

  it("l'objet visé répond par le composant le plus profond qui a une action au clic", () => {
    const e = etagere();
    const m = porte(e, 'ALTER("Ouverture", 0, 90)');
    expect(definitionInteractive(m, [e.parent, e.planche])).toBe(e.definition);
    expect(definitionInteractive(e.m, [e.parent, e.planche])).toBeNull();
    const planche = contexte(m, e.parent).occurrences[e.planche]!.definition;
    const deux = definirDynamique(m, planche, { parametres: [{ nom: "A", valeur: "0" }], regles: [], surClic: 'SET("A", 1)' }).modele;
    expect(definitionInteractive(deux, [e.parent, e.planche])).toBe(planche);
  });

  it("l'action suit les copies et « Rendre unique », se relit, et sa longueur est bornée", () => {
    const e = etagere();
    const m = porte(e, 'ALTER("Ouverture", 0, 90)');
    const deux = copier(m, [e.parent], v3(3, 0, 0)).modele;
    const copie = Object.keys(deux.racine.occurrences).find((id) => id !== e.parent)!;
    const unique = rendreUnique(deux, copie).modele;
    expect(unique.definitions[unique.racine.occurrences[copie]!.definition]!.dynamique!.surClic).toBe('ALTER("Ouverture", 0, 90)');
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))).not.toBeNull();
    expect(estComposantDynamique({ parametres: [], regles: [], surClic: "x".repeat(501) })).toBe(false);
  });
});
