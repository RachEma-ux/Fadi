/** Objets O-4 (D-206) : groupe vide, Déplacer vers un groupe (position monde conservée, cible partagée, refus). */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ajouterRectangle,
  appliquer,
  contexte,
  copier,
  deplacerVersContexte,
  grouper,
  grouperVide,
  matriceMonde,
  modeleVide,
  nombreOccurrences,
  deplacer,
  tourner,
  verrouillerOccurrences,
} from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { v3 } from "./vecteur.js";

const tout = (m: Modele, dans?: Id): Id[] => {
  const c = contexte(m, dans);
  return [...Object.keys(c.faces), ...Object.keys(c.aretes), ...Object.keys(c.occurrences)];
};
/** Positions monde des sommets de toutes les faces visibles, triées (pour « rien n'a bougé à l'écran »). */
const ecran = (m: Modele): string[] =>
  geometrieVisible(m)
    .faces.flatMap((f) => f.exterieur.map((p) => `${p.x.toFixed(9)},${p.y.toFixed(9)},${p.z.toFixed(9)}`))
    .sort();

/** Un carré groupé (objet) et un groupe vide déplacé et tourné (cible). */
function scene() {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const objet = grouper(m, tout(m));
  const vide = grouperVide(objet.modele, { nom: "Boîte" });
  m = tourner(vide.modele, [vide.occurrence], v3(0, 0, 0), v3(0, 0, 1), Math.PI / 2).modele;
  m = deplacer(m, [vide.occurrence], v3(5, 2, 1)).modele;
  return { m, objet: objet.occurrence, cible: vide.occurrence, definitionVide: vide.definition };
}

describe("Groupe vide (O-4)", () => {
  it("crée une définition sans contenu et son occurrence ; elle survit à une opération ailleurs (pas de purge)", () => {
    const r = grouperVide(modeleVide());
    expect(contexte(r.modele).occurrences[r.occurrence]).toMatchObject({ definition: r.definition });
    expect(Object.keys(r.modele.definitions[r.definition]!.contenu.faces)).toHaveLength(0);
    const apres = ajouterRectangle(r.modele, v3(3, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    expect(apres.definitions[r.definition]).toBeDefined();
    // Dessiner dans le groupe vide ouvert.
    const dedans = ajouterRectangle(r.modele, v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0), { dans: r.occurrence }).modele;
    expect(Object.keys(dedans.definitions[r.definition]!.contenu.faces)).toHaveLength(1);
  });
});

describe("Déplacer vers un groupe (O-4)", () => {
  it("l'objet passe dans le groupe cible sans bouger à l'écran, identifiant gardé", () => {
    const { m, objet, cible, definitionVide } = scene();
    const avant = ecran(m);
    const r = deplacerVersContexte(m, [objet], cible);
    expect(ecran(r.modele)).toEqual(avant);
    expect(contexte(r.modele).occurrences[objet]).toBeUndefined();
    expect(r.modele.definitions[definitionVide]!.contenu.occurrences[objet]).toBeDefined();
    expect(r.extra.composantPartage).toBe(0);
    // Et retour à la racine, toujours immobile.
    const retour = deplacerVersContexte(r.modele, [objet], undefined, { dans: cible });
    expect(ecran(retour.modele)).toEqual(avant);
    expect(contexte(retour.modele).occurrences[objet]).toBeDefined();
  });

  it("refuse un objet verrouillé, la cible égale au contexte, un cycle, une géométrie libre", () => {
    const { m, objet, cible } = scene();
    expect(() => deplacerVersContexte(verrouillerOccurrences(m, [objet], true).modele, [objet], cible)).toThrow(/verrouill/);
    expect(() => deplacerVersContexte(m, [objet], undefined)).toThrow(RangeError);
    expect(() => deplacerVersContexte(verrouillerOccurrences(m, [cible], true).modele, [objet], cible)).toThrow(/arrivée est verrouillé/);
    const dedans = deplacerVersContexte(m, [cible], objet).modele;
    expect(() => deplacerVersContexte(dedans, [objet], cible)).toThrow(/lui-même/);
    const face = Object.keys(contexte(m).faces)[0];
    if (face) expect(() => deplacerVersContexte(m, [face], cible)).toThrow(RangeError);
    const libre = ajouterRectangle(m, v3(9, 9, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    expect(() => deplacerVersContexte(libre, [Object.keys(contexte(libre).faces)[0]!], cible)).toThrow(/groupes et composants/);
  });

  it("cible = groupe partagé : rendu unique d'abord, l'autre copie ne reçoit rien", () => {
    const { m: m0, objet, cible } = scene();
    const m = copier(m0, [cible], v3(0, 10, 0)).modele;
    const autre = Object.keys(contexte(m).occurrences).find((id) => id !== cible && id !== objet)!;
    const r = deplacerVersContexte(m, [objet], cible).modele;
    const defDe = (id: Id) => r.definitions[contexte(r).occurrences[id]!.definition]!;
    expect(Object.keys(defDe(cible).contenu.occurrences)).toEqual([objet]);
    expect(Object.keys(defDe(autre).contenu.occurrences)).toHaveLength(0);
  });

  it("cible = composant partagé : l'objet apparaît dans chaque occurrence, et le résultat le compte", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const objet = grouper(m, tout(m));
    const comp = grouperVide(objet.modele, { genre: "composant", nom: "Module" });
    m = copier(comp.modele, [comp.occurrence], v3(4, 0, 0)).modele;
    expect(nombreOccurrences(m, comp.definition)).toBe(2);
    const r = deplacerVersContexte(m, [objet.occurrence], comp.occurrence);
    expect(r.extra.composantPartage).toBe(2);
    expect(Object.keys(r.modele.definitions[comp.definition]!.contenu.occurrences)).toEqual([objet.occurrence]);
  });

  it("depuis un groupe imbriqué dans un groupe copié vers son parent : seule l'occurrence éditée change", () => {
    // Parent { enfant { objet } } copié une fois : déplacer l'objet de l'enfant vers le parent de l'original.
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const objet = grouper(m, tout(m));
    const enfant = grouper(objet.modele, [objet.occurrence]);
    const parent = grouper(enfant.modele, [enfant.occurrence]);
    m = copier(parent.modele, [parent.occurrence], v3(0, 6, 0)).modele;
    const avant = ecran(m);
    const r = deplacerVersContexte(m, [objet.occurrence], parent.occurrence, { dans: enfant.occurrence }).modele;
    expect(ecran(r)).toEqual(avant);
    const copie = Object.keys(contexte(r).occurrences).find((id) => id !== parent.occurrence)!;
    // La copie garde parent › enfant › objet : 3 faces visibles sous elle… et l'original une seule face, maintenant dans le parent.
    const sous = (racine: Id) => geometrieVisible(r).faces.filter((f) => f.exterieur.every((p) => (racine === copie ? p.y > 5 : p.y < 5))).length;
    expect(sous(copie)).toBe(1);
    expect(sous(parent.occurrence)).toBe(1);
    const defParent = r.definitions[contexte(r).occurrences[parent.occurrence]!.definition]!;
    expect(defParent.contenu.occurrences[objet.occurrence]).toBeDefined();
    const M = matriceMonde(r, objet.occurrence)!;
    expect(appliquer(M, v3(0, 0, 0))).toEqual(v3(0, 0, 0));
  });
});
