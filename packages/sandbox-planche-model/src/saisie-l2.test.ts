/**
 * Cas 2 du catalogue, lot 2 « Accrochage et saisie » : champ Mesures (expressions, paramètres, « @ », chanfrein), unité,
 * Mètre décomposé, guides en réseau, répartition, arête et sommets, remise à l'échelle d'un import.
 */
import { describe, expect, it } from "vitest";
import { machineMetre } from "./outils/metre.js";
import { clicVers, partie, saisie, survolVers } from "./outils/essais-modification.js";
import { ajouterRectangle, ajouterSegment, grouper, modeleVide, modifierAnnotations } from "./geometrie-libre.js";
import {
  changerLongueurArete,
  changerUnite,
  controlerRessaut,
  decomposerMesure,
  formaterLongueurUnite,
  placerSommet,
  poserParametre,
  remettreAEchelleImport,
  repartir,
  repartition,
  repeterGuide,
  saisieDuProjet,
  supprimerParametre,
} from "./saisie-projet.js";
import { analyserSaisie } from "./saisie-vcb.js";
import { machineLigne } from "./outils/ligne.js";
import type { ContexteOutil } from "./outils/machine.js";
import { dist, v3 } from "./vecteur.js";

const L = (t: string, extra: object = {}) => analyserSaisie(t, { attendu: "longueur", separateurDecimal: ",", ...extra });

describe("expressions avec unités dans Mesures (n° 51)", () => {
  it("additions, produits, parenthèses et unités", () => {
    expect(L("1,20 + 35 cm")).toEqual({ genre: "longueur", valeur: expect.closeTo(1.55, 9) });
    expect(L("(1,20 + 35 cm) / 2")).toEqual({ genre: "longueur", valeur: expect.closeTo(0.775, 9) });
    expect(L("3 × 60 cm")).toEqual({ genre: "longueur", valeur: expect.closeTo(1.8, 9) });
    expect(L("2,40 − 20 cm")).toEqual({ genre: "longueur", valeur: expect.closeTo(2.2, 9) });
  });
  it("les réseaux x5 et /5 gardent leur sens", () => {
    const r = analyserSaisie("x5", { attendu: "distance-reseau", separateurDecimal: "," });
    expect(r).toMatchObject({ genre: "reseau", mode: "copies", nombre: 5 });
    expect(analyserSaisie("/5", { attendu: "distance-reseau", separateurDecimal: "," })).toMatchObject({ genre: "reseau", mode: "divisions", nombre: 5 });
    expect(analyserSaisie("5x", { attendu: "distance-reseau", separateurDecimal: "," })).toMatchObject({ genre: "reseau" });
  });
  it("le produit de deux longueurs est refusé", () => {
    expect(L("2 m × 3 m").genre).toBe("erreur");
  });
});

describe("paramètres nommés du projet (n° 93)", () => {
  it("déclarés dans Info modèle puis employés dans toute saisie", () => {
    let m = poserParametre(modeleVide(), { nom: "épaisseur_mur", valeur: 0.2 }).modele;
    m = poserParametre(m, { nom: "module", valeur: 0.6 }).modele;
    const p = saisieDuProjet(m);
    expect(L("épaisseur_mur + 2,5 cm", p)).toEqual({ genre: "longueur", valeur: expect.closeTo(0.225, 9) });
    expect(L("module × 3", p)).toEqual({ genre: "longueur", valeur: expect.closeTo(1.8, 9) });
    expect(L("inconnu + 1", p).genre).toBe("erreur");
    expect(() => poserParametre(m, { nom: "module", valeur: 1 })).toThrow(/existe déjà/);
    expect(() => poserParametre(m, { nom: "2a", valeur: 1 })).toThrow(/invalide/);
    const id = Object.values(m.annotations!.reglages!.parametres!).find((x) => x.nom === "module")!.id;
    expect(saisieDuProjet(supprimerParametre(m, id).modele).parametres).toEqual({ épaisseur_mur: 0.2 });
  });
});

describe("unité d'affichage et de saisie (n° 21)", () => {
  it("le changement ne touche aucune valeur stockée : contrôle d'écart nul", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1.234567, 0, 0), v3(0, 2.5, 0)).modele;
    const r = changerUnite(m, "cm");
    expect(r.controle.ecarts).toBe(0);
    expect(r.controle.valeurs).toBe(12 + 1);
    expect(r.modele.racine.sommets).toEqual(m.racine.sommets);
    expect(saisieDuProjet(r.modele).uniteModele).toBe("cm");
    expect(L("120", saisieDuProjet(r.modele))).toEqual({ genre: "longueur", valeur: expect.closeTo(1.2, 9) });
  });
  it("affichage dans l'unité choisie", () => {
    expect(formaterLongueurUnite(2.4, "m", ",")).toBe("2,40 m");
    expect(formaterLongueurUnite(2.4, "cm", ",")).toBe("240 cm");
    expect(formaterLongueurUnite(2.4, "mm", ",")).toBe("2400 mm");
    expect(formaterLongueurUnite(0.3048 * 7 + 0.0254 * 10.5, "pieds-pouces", ",")).toBe(`7' 10 1/2"`);
  });
});

describe("Ligne : « à partir de » (n° 78) et chanfrein (n° 83)", () => {
  const ctx = (m = modeleVide()): ContexteOutil => ({ modele: m, selection: [], separateurDecimal: "," });
  const rayon = (x: number, y: number) => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });
  it("« @1,20 ; -1,00 » depuis le sommet visé, sans le poser", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    let e = machineLigne.initial();
    e = machineLigne.traiter(e, { genre: "survol", rayon: rayon(4.02, 3.01), tolerance: 0.1 }, ctx(m)).etat;
    const t = machineLigne.traiter(e, { genre: "saisie", texte: "@1,20 ; -1,00" }, ctx(m));
    expect(t.etat.etape).toBe(2);
    expect(t.etat.depart).toEqual(v3(5.2, 2, 0));
  });
  it("sans point visé, « @ » est refusé", () => {
    const t = machineLigne.traiter(machineLigne.initial(), { genre: "saisie", texte: "@1 ; 1" }, ctx());
    expect(t.etat.erreur).toMatch(/Visez d'abord/);
  });
  it("chanfrein 1:3 ; 0,05 : course de 0,15 m, ressaut « non évalué » sans maximum saisi", () => {
    let e = machineLigne.initial();
    e = machineLigne.traiter(e, { genre: "clic", rayon: rayon(1, 1), tolerance: 0.01 }, ctx()).etat;
    e = machineLigne.traiter(e, { genre: "survol", rayon: rayon(3, 1), tolerance: 0.01 }, ctx()).etat;
    const t = machineLigne.traiter(e, { genre: "saisie", texte: "1:3 ; 0,05" }, ctx());
    const s = Object.values(t.modele!.racine.sommets).map((x) => x.position);
    expect(s.some((p) => Math.abs(p.x - 1.15) < 1e-9 && Math.abs(p.z - 0.05) < 1e-9)).toBe(true);
    expect(machineLigne.vue(t.etat, ctx(t.modele)).note).toMatch(/non évalué/);
  });
  it("ressaut comparé au maximum saisi avec sa source", () => {
    const m = modifierAnnotations(modeleVide(), (a) => {
      a.reglages = { accrochageLongueur: 0.01, accrochageAngle: 15, extremitesTexte: "fleche-fermee", alignerTexte: "epingle", extremitesCote: "barre", alignerCote: "centre", ressautMax: { valeur: 0.02, source: "règle saisie par l'agence" } };
    }).modele;
    expect(controlerRessaut(m, 0.05)).toEqual({ etat: "au-dessus", max: 0.02, source: "règle saisie par l'agence" });
    expect(controlerRessaut(m, 0.015).etat).toBe("conforme");
    expect(controlerRessaut(modeleVide(), 0.05).etat).toBe("non-evalue");
  });
});

describe("Mètre décomposé (n° 27)", () => {
  it("dénivelé, horizontale, pente et altitude ; NGF seulement si déclarée", () => {
    const d = decomposerMesure(v3(0, 0, 0), v3(3.5, 0, 1.75));
    expect(d.horizontale).toBeCloseTo(3.5);
    expect(d.denivele).toBeCloseTo(1.75);
    expect(d.pentePourcent).toBeCloseTo(50);
    expect(d.angleDegres).toBeCloseTo(26.565, 2);
    expect(d.altitude).toBeCloseTo(1.75);
    expect(d.altitudeNgf).toBeNull();
    expect(decomposerMesure(v3(0, 0, 0), v3(0, 0, 3), 152.25).altitudeNgf).toBeCloseTo(155.25);
    expect(decomposerMesure(v3(0, 0, 0), v3(0, 0, 3)).pentePourcent).toBeNull();
  });
});

describe("guide répété en réseau (n° 87) et répartition entre deux bornes (n° 103)", () => {
  it("x5 : cinq copies au pas ; /4 : trois guides intermédiaires", () => {
    const m = modifierAnnotations(modeleVide(), (a) => {
      a.guides["g1"] = { id: "g1", genre: "ligne", origine: v3(0.6, 0, 0), direction: v3(0, 1, 0) };
    }).modele;
    const r = repeterGuide(m, "g1", v3(0.6, 0, 0), { copies: 5 });
    expect(r.extra).toHaveLength(5);
    const xs = r.extra.map((id) => r.modele.annotations!.guides[id]!.origine.x);
    expect(xs.map((x) => Math.round(x * 100) / 100)).toEqual([1.2, 1.8, 2.4, 3, 3.6]);
    const d = repeterGuide(m, "g1", v3(0.6, 0, 0), { divisions: 4 });
    expect(d.extra.map((id) => Math.round(d.modele.annotations!.guides[id]!.origine.x * 100) / 100)).toEqual([0.45, 0.3, 0.15]);
  });
  it("entraxe maximal, vide maximal et nombre imposé", () => {
    expect(repartition(2.48, "entraxe-max", 0.65)).toEqual({ elements: 5, entraxe: 0.62, vide: 0.62 });
    const v = repartition(3, "vide-max", 0.11, 0.04);
    expect(v.elements).toBe(21);
    expect(v.vide).toBeLessThanOrEqual(0.11);
    expect(repartition(3, "nombre", 4).entraxe).toBeCloseTo(1);
    expect(() => repartition(3, "nombre", 1)).toThrow();
  });
  it("répartir copie l'objet jusqu'à la seconde borne, en une opération", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(0.1, 0, 0), v3(0, 0.1, 0)).modele;
    const g = grouper(m, [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    m = g.modele;
    const r = repartir(m, [g.occurrence], v3(0, 0, 0), v3(2.48, 0, 0), "entraxe-max", 0.65);
    expect(r.extra.elements).toBe(5);
    expect(Object.keys(r.modele.racine.occurrences)).toHaveLength(5);
  });
});

describe("arête et sommets modifiables (n° 34), remise à l'échelle d'un import (n° 47)", () => {
  it("la longueur saisie déplace le second sommet le long de l'arête", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0)).modele;
    const a = Object.keys(m.racine.aretes)[0]!;
    const r = changerLongueurArete(m, a, 4.2);
    const x = r.modele.racine.aretes[a]!;
    expect(dist(r.modele.racine.sommets[x.a]!.position, r.modele.racine.sommets[x.b]!.position)).toBeCloseTo(4.2);
    const s = placerSommet(r.modele, x.b, v3(4.2, 1, 0));
    expect(s.modele.racine.sommets[x.b]!.position).toEqual(v3(4.2, 1, 0));
  });
  it("facteur réelle / mesurée, appliqué à ce seul objet", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(8.14, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(m, [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    m = ajouterSegment(g.modele, v3(20, 0, 0), v3(21, 0, 0)).modele;
    const avant = Object.values(m.racine.sommets).map((s) => s.position);
    const r = remettreAEchelleImport(m, g.occurrence, 8.14, 8, v3(0, 0, 0));
    expect(r.facteur).toBeCloseTo(8 / 8.14);
    expect(Object.values(r.modele.racine.sommets).map((s) => s.position)).toEqual(avant);
    expect(r.modele.racine.occurrences[g.occurrence]!.transformation[0]).toBeCloseTo(8 / 8.14);
  });
});

describe("Mètre : guide en réseau « x5 » / « /5 » (n° 87) et dernière mesure (n° 27)", () => {
  const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2.7, 0)).modele;
  const guidesDe = (m: ReturnType<typeof sol>) => Object.values(m.annotations?.guides ?? {});
  it("« x5 » après un guide à 0,60 m : cinq copies au même pas, une opération", () => {
    const p = partie(machineMetre, sol()).jouer(survolVers(v3(2, 0, 0)), clicVers(v3(2, 0, 0)), survolVers(v3(2, 1, 0)), saisie("0.6"));
    expect(guidesDe(p.modele)).toHaveLength(1);
    expect(p.vue().consigne).toMatch(/5x/);
    expect(p.vue().metre?.guide).not.toBeNull();
    p.jouer(saisie("x5"));
    const ys = guidesDe(p.modele).map((g) => g.origine.y).sort((a, b) => a - b);
    expect(ys).toHaveLength(6);
    ys.forEach((y, i) => expect(y).toBeCloseTo(0.6 * (i + 1), 9));
    expect(p.operations).toEqual(["Ligne de guide", "Guide en réseau"]);
  });
  it("« /3 » divise le pas : deux guides intermédiaires", () => {
    const p = partie(machineMetre, sol()).jouer(survolVers(v3(2, 0, 0)), clicVers(v3(2, 0, 0)), survolVers(v3(2, 1, 0)), saisie("0.9"), saisie("/3"));
    const ys = guidesDe(p.modele).map((g) => g.origine.y).sort((a, b) => a - b);
    expect(ys.map((y) => Number(y.toFixed(6)))).toEqual([0.3, 0.6, 0.9]);
  });
  it("une mesure seule reste lisible par le panneau (décomposition)", () => {
    const p = partie(machineMetre, sol()).jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(4, 0, 0)), clicVers(v3(4, 0, 0)));
    expect(p.vue().metre?.derniere).toEqual({ a: v3(0, 0, 0), b: v3(4, 0, 0) });
  });
});
