/** Lot L13 : machines Onglet et Allonger une pièce — deux clics, extrémité visée, valeur signée ou demi-section. */
import { describe, expect, it } from "vitest";
import { ajouterSegment, contexte, modeleVide, poserPiece, type Id, type Modele } from "../geometrie-libre.js";
import { geometrieVisible } from "../inference.js";
import { PLACEMENT_DEFAUT, type SectionProfil } from "../profiles.js";
import { v3 } from "../vecteur.js";
import { CONSIGNES_ONGLET, CONSIGNE_ALLONGER_1, CONSIGNE_ALLONGER_FIN, machineAllongerPiece, machineOnglet } from "./assemblages-pieces.js";
import { clicVers, partie, rayonVers, saisie } from "./essais-modification.js";

const S: SectionProfil = { exterieur: [{ y: -0.05, z: -0.05 }, { y: 0.05, z: -0.05 }, { y: 0.05, z: 0.05 }, { y: -0.05, z: 0.05 }], trous: [] };
const OPT = { designation: "Carré d'essai", source: { genre: "saisie" } as const };
const xmax = (m: Modele) => Math.max(...geometrieVisible(m).faces.flatMap((f) => f.exterieur).map((p) => p.x));
const xmin = (m: Modele) => Math.min(...geometrieVisible(m).faces.flatMap((f) => f.exterieur).map((p) => p.x));

describe("Onglet (machine, L13)", () => {
  it("première pièce puis seconde : un pas « Onglet », coupes à 45° ; un clic hors pièce est refusé", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, OPT);
    const b = poserPiece(a.modele, { a: v3(2, 0, 0), b: v3(2, 2, 0) }, S, PLACEMENT_DEFAUT, OPT);
    const p = partie(machineOnglet, b.modele);
    expect(p.vue().consigne).toBe(CONSIGNES_ONGLET[0]);
    p.jouer(clicVers(v3(10, 10, 0)));
    expect(p.vue().erreur).toMatch(/pièce de profilé/);
    p.jouer(clicVers(v3(1, 0, 0.05)));
    expect(p.vue().consigne).toBe(CONSIGNES_ONGLET[1]);
    p.jouer(clicVers(v3(2, 1, 0.05)));
    expect(p.operations).toEqual(["Onglet"]);
    const def = p.modele.definitions[contexte(p.modele).occurrences[a.occurrence]!.definition]!;
    expect(def.piece?.coupeFin?.angle).toBeCloseTo(45, 9);
  });
});

describe("Allonger une pièce (machine, L13)", () => {
  it("clic près de la fin, « 0,3 » : +0,3 m ; sens − puis « 0,1 » : −0,1 m ; un pas chacun", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, OPT);
    const p = partie(machineAllongerPiece, a.modele);
    expect(p.vue().consigne).toBe(CONSIGNE_ALLONGER_1);
    p.jouer(clicVers(v3(1.8, 0, 0.05)));
    // Revue de #127 : consigne complète (une entrée de dictionnaire), sans concaténation.
    expect(p.vue().consigne).toBe(CONSIGNE_ALLONGER_FIN);
    p.jouer(saisie("0.3"));
    expect(xmax(p.modele)).toBeCloseTo(2.3, 12);
    p.configurer("sens", "moins").jouer(saisie("0.1"));
    expect(xmax(p.modele)).toBeCloseTo(2.2, 12);
    expect(p.operations).toEqual(["Allonger une pièce", "Allonger une pièce"]);
  });

  it("valeur « ½ largeur » : le clic près du début applique aussitôt −/+ la demi-largeur", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, OPT);
    const p = partie(machineAllongerPiece, a.modele).configurer("valeur", "demi-largeur").jouer(clicVers(v3(0.2, 0, 0.05)));
    expect(xmin(p.modele)).toBeCloseTo(-0.05, 12);
    expect(p.operations).toEqual(["Allonger une pièce"]);
  });
});

describe("Visée d'une pièce posée sur son arête (L13)", () => {
  it("l'arête source cachée au milieu de la section, dans la tolérance de visée : la pièce l'emporte", () => {
    const m0 = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(2, 0, 0)).modele;
    const e = Object.keys(m0.racine.aretes)[0] as Id;
    const a = poserPiece(m0, { arete: e }, S, PLACEMENT_DEFAUT, OPT);
    const p = partie(machineOnglet, a.modele).jouer({ genre: "clic", rayon: rayonVers(v3(1, 0, 0.05)), tolerance: 0.1, ecran: { x: 0, y: 0 } });
    expect(p.vue().erreur).toBeNull();
    expect(p.selection).toEqual([a.occurrence]);
  });
});
