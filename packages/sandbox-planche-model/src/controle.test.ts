/** Extension « Contrôle et nettoyage » : relevé sans modification, nettoyage choisi, objets verrouillés respectés. */
import { describe, expect, it } from "vitest";
import { CHOIX_NETTOYAGE_DEFAUT, aretesIsolees, controlerModele, nettoyerModele, objetsNonSolides, rienANettoyer } from "./controle.js";
import { type Modele, ajouterRectangle, ajouterSegment, contexte, copier, grouper, grouperVide, modeleVide, modifierAnnotations, peindreFaces, pousserTirer, verrouillerOccurrences } from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";

const TOUT = { objetsVides: true, materiauxInutilises: true, balisesInutilisees: true, aretesIsolees: true };

/** Un rectangle (une face, quatre arêtes) et un trait isolé à côté. */
function base(): Modele {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 1, 0)).modele;
  m = ajouterSegment(m, v3(5, 0, 0), v3(6, 0, 0)).modele;
  return m;
}

describe("Contrôle et nettoyage", () => {
  it("une Planche vide n'a rien à signaler ni à nettoyer", () => {
    const r = controlerModele(modeleVide());
    expect(r).toEqual({ objetsVides: 0, materiauxInutilises: 0, balisesInutilisees: 0, aretesIsolees: 0, objets: 0, objetsNonSolides: 0 });
    expect(rienANettoyer(r, TOUT)).toBe(true);
    expect(nettoyerModele(modeleVide(), TOUT).modele).toEqual(modeleVide());
  });

  it("arêtes isolées : comptées, laissées par défaut, retirées sur demande sans toucher aux faces", () => {
    const m = base();
    expect(aretesIsolees(m.racine)).toHaveLength(1);
    expect(controlerModele(m).aretesIsolees).toBe(1);
    expect(CHOIX_NETTOYAGE_DEFAUT.aretesIsolees).toBe(false);
    expect(nettoyerModele(m).modele).toBe(m);
    const n = nettoyerModele(m, TOUT);
    expect(n.retires.aretesIsolees).toBe(1);
    expect(Object.keys(n.modele.racine.aretes)).toHaveLength(4);
    expect(Object.keys(n.modele.racine.faces)).toHaveLength(1);
    expect(controlerModele(n.modele).aretesIsolees).toBe(0);
  });

  it("objets vides : retirés, y compris le groupe qui ne contenait qu'eux ; un objet verrouillé reste", () => {
    let m = base();
    const exterieur = grouperVide(m, { nom: "Dehors" });
    m = exterieur.modele;
    m = grouperVide(m, { dans: exterieur.occurrence, nom: "Dedans" }).modele;
    const verrou = grouperVide(m, { nom: "Gardé" });
    m = verrouillerOccurrences(verrou.modele, [verrou.occurrence], true).modele;
    expect(controlerModele(m).objetsVides).toBe(1);
    const n = nettoyerModele(m);
    expect(n.retires.objetsVides).toBe(1);
    expect(Object.keys(n.modele.racine.occurrences)).toEqual([verrou.occurrence]);
    expect(Object.keys(n.modele.racine.faces)).toHaveLength(1);
  });

  it("matières et balises inutilisées : retirées ; celles qui servent restent", () => {
    let m = base();
    m = modifierAnnotations(m, (a) => {
      a.materiaux.m1 = { id: "m1", nom: "Chêne", couleur: "#aa8855" };
      a.materiaux.m2 = { id: "m2", nom: "Acier", couleur: "#888888" };
      a.balises.b1 = { id: "b1", nom: "Structure", couleur: "#333333", visible: true };
    }).modele;
    m = peindreFaces(m, Object.keys(m.racine.faces), "m1").modele;
    const r = controlerModele(m);
    expect([r.materiauxInutilises, r.balisesInutilisees]).toEqual([1, 1]);
    const n = nettoyerModele(m);
    expect(n.retires).toEqual({ objetsVides: 0, materiauxInutilises: 1, balisesInutilisees: 1, aretesIsolees: 0 });
    expect(Object.keys(n.modele.annotations!.materiaux)).toEqual(["m1"]);
    expect(Object.keys(n.modele.annotations!.balises)).toEqual([]);
    expect(rienANettoyer(controlerModele(n.modele), CHOIX_NETTOYAGE_DEFAUT)).toBe(true);
  });

  it("arêtes isolées dans un groupe copié : chaque copie est nettoyée, la géométrie utile reste", () => {
    let m = base();
    const g = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)]);
    m = copier(g.modele, [g.occurrence], v3(0, 5, 0)).modele;
    expect(controlerModele(m).aretesIsolees).toBe(1);
    const n = nettoyerModele(m, TOUT).modele;
    expect(controlerModele(n).aretesIsolees).toBe(0);
    for (const o of Object.values(n.racine.occurrences)) {
      expect(Object.keys(contexte(n, o.id).faces)).toHaveLength(1);
      expect(Object.keys(contexte(n, o.id).aretes)).toHaveLength(4);
    }
  });

  it("un trait isolé dans un groupe non verrouillé, lui-même dans un groupe verrouillé, est laissé", () => {
    let m = base();
    const dedans = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)]);
    const dehors = grouper(dedans.modele, [dedans.occurrence]);
    m = verrouillerOccurrences(dehors.modele, [dehors.occurrence], true).modele;
    expect(controlerModele(m).aretesIsolees).toBe(0);
    const n = nettoyerModele(m, TOUT);
    expect(n.retires.aretesIsolees).toBe(0);
    expect(n.modele.definitions).toEqual(m.definitions);
  });

  it("solides : une boîte fermée est un solide, une face seule groupée ne l'est pas", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    m = pousserTirer(m, Object.keys(m.racine.faces)[0]!, 1).modele;
    const boite = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)]);
    m = ajouterRectangle(boite.modele, v3(5, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const plat = grouper(m, [...Object.keys(m.racine.aretes), ...Object.keys(m.racine.faces)]);
    const r = controlerModele(plat.modele);
    expect([r.objets, r.objetsNonSolides]).toEqual([2, 1]);
    expect(objetsNonSolides(plat.modele)).toEqual([plat.occurrence]);
  });
});
