import { describe, expect, it } from "vitest";
import { aire, ajouterRectangle, ajouterSegment, contexte, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { distanceAuContour, machineDecalage } from "./decalage.js";
import { aireTotale, aretes, clicVers, faces, partie, saisie, survolVers } from "./essais-modification.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const aires = (m: ReturnType<typeof sol>) => faces(m).map((f) => aire(m, f.id)).sort((a, b) => a - b);

describe("Décalage (§4.19)", () => {
  it("distance signée au contour : intérieur positif, extérieur négatif", () => {
    const c = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    expect(distanceAuContour(c, v3(0, 0, 1), v3(2, 1.5, 0))).toBeCloseTo(1.5, 9);
    expect(distanceAuContour(c, v3(0, 0, 1), v3(5, 1, 0))).toBeCloseTo(-1, 9);
  });

  it("consignes et Mesures du catalogue", () => {
    const p = partie(machineDecalage, sol());
    expect(p.vue().consigne).toBe(etape("decalage", 0).consigne);
    expect(p.vue().mesures?.libelle).toBe("Distance");
    p.jouer(clicVers(v3(1, 1, 0)));
    expect(p.vue().consigne).toBe(etape("decalage", 2).consigne);
  });

  it("CA-DEC-1 : face 4 × 3, 0,3 vers l'intérieur → 2 faces : 3,4 × 2,4 et l'anneau (12 − 8,16)", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(1, 1, 0)), saisie("0.3"));
    expect(faces(p.modele)).toHaveLength(2);
    const a = aires(p.modele);
    expect(a[0]).toBeCloseTo(12 - 3.4 * 2.4, 9); // l'anneau (3,84 m²)
    expect(a[1]).toBeCloseTo(3.4 * 2.4, 9); // la face intérieure (8,16 m²)
    expect(aireTotale(p.modele)).toBeCloseTo(12, 9);
    expect(p.operations).toEqual(["Décalage"]);
  });

  it("CA-DEC-2 : double-clic sur la face intérieure → second anneau de 0,3", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0.3"));
    p.jouer(clicVers(v3(2, 1.5, 0), undefined, true));
    expect(faces(p.modele)).toHaveLength(3);
    const a = aires(p.modele);
    expect(a[0]).toBeCloseTo(3.4 * 2.4 - 2.8 * 1.8, 9); // second anneau (3,12 m²)
    expect(a[1]).toBeCloseTo(12 - 3.4 * 2.4, 9); // premier anneau (3,84 m²)
    expect(a[2]).toBeCloseTo(2.8 * 1.8, 9); // face intérieure (5,04 m²)
  });

  it("curseur à l'extérieur : le décalage tapé va vers l'extérieur", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), survolVers(v3(5, 1.5, 0)), saisie("0.5"));
    expect(aireTotale(p.modele)).toBeCloseTo(5 * 4, 9);
  });

  it("CA-DEC-3 : deux arêtes en L présélectionnées, 0,5 → 2 arêtes nouvelles, 0 face nouvelle", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const ids = Object.keys(contexte(m).aretes);
    const p = partie(machineDecalage, m, ids);
    expect(p.vue().consigne).toBe(etape("decalage", 1).consigne);
    p.jouer(clicVers(v3(2, 1, 0)), saisie("0.5"));
    expect(aretes(p.modele)).toHaveLength(4);
    expect(faces(p.modele)).toHaveLength(0);
  });

  it("correction : une distance tapée après coup remplace le décalage (un pas)", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0.3"), saisie("0.5"));
    expect(p.historique).toHaveLength(2);
    expect(aires(p.modele)).toContainEqual(expect.closeTo(3 * 2, 9));
  });

  it("distance nulle ou saisie sans face : messages ; Échap retourne à l'étape 1", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("0"));
    expect(p.historique).toHaveLength(1);
    expect(p.vue().erreur).toMatch(/nulle/);
    const q = partie(machineDecalage, sol()).jouer(saisie("0.3"));
    expect(q.vue().erreur).toMatch(/Choisissez/);
    const r = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), { genre: "echap" });
    expect(r.vue().consigne).toBe(etape("decalage", 0).consigne);
  });

  it("décalage trop grand : refusé sans rien casser", () => {
    const p = partie(machineDecalage, sol()).jouer(clicVers(v3(1, 1, 0)), saisie("5"));
    expect(p.historique.length).toBeLessThanOrEqual(2);
    expect(Object.keys(contexte(p.modele).faces).length).toBeGreaterThan(0);
  });
});
