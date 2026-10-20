/** Lot L14 : liste de débit de la Planche — groupement exact, masse sourcée seulement, renumérotation, CSV. */
import { describe, expect, it } from "vitest";
import { csvDebit, etiquettesDebit, listeDebit, reperesRenumerotes, trierDebit } from "./debit.js";
import { type Id, type Modele, ajouterSegment, contexte, copier, effacerEtiquettesPieces, grouper, mettreAEchelle, modeleVide, numeroterPieces, poserEtiquettesPieces, poserPiece, poserPiecesSurAretes } from "./geometrie-libre.js";
import { PLACEMENT_DEFAUT, type SectionProfil, type SourceSection } from "./profiles.js";
import { v3 } from "./vecteur.js";

/** Section d'essai (donnée du test). */
const S: SectionProfil = { exterieur: [{ y: -0.05, z: -0.025 }, { y: 0.05, z: -0.025 }, { y: 0.05, z: 0.025 }, { y: -0.05, z: 0.025 }], trous: [] };
const SAISIE = { designation: "Rect d'essai", source: { genre: "saisie" } as const };
const CAT = (source: string, masseLineique?: number): SourceSection => ({ genre: "catalogue", source, edition: "2026", page: "1", ligne: "2", ...(masseLineique ? { masseLineique } : {}) });

function cadre(): Modele {
  let m = modeleVide();
  const P = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
  for (let i = 0; i < 4; i++) m = ajouterSegment(m, P[i]!, P[(i + 1) % 4]!).modele;
  return poserPiecesSurAretes(m, Object.keys(m.racine.aretes), S, PLACEMENT_DEFAUT, SAISIE).modele;
}

describe("Liste de débit (L14)", () => {
  it("cadre 4 × 3 (onglets) : 2 lignes, total 14 m, angles 45 / 45, masse « non évaluée » sans source", () => {
    const l = listeDebit(cadre());
    expect(l).toHaveLength(2);
    expect(l.map((x) => [x.nombre, x.longueurUnitaire])).toEqual([[2, 4], [2, 3]]);
    expect(l.reduce((s, x) => s + x.longueurTotale, 0)).toBeCloseTo(14, 9);
    expect(l[0]!.angles[0]).toBeCloseTo(45, 9);
    expect(l.every((x) => x.masse === null && /non évaluée/.test(x.origineMasse))).toBe(true);
  });

  it("même désignation, deux longueurs → deux lignes ; chaque ligne retient exactement ses occurrences", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    const b = poserPiece(a.modele, { a: v3(0, 1, 0), b: v3(3, 1, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    const c = poserPiece(b.modele, { a: v3(0, 2, 0), b: v3(2, 2, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    const l = listeDebit(c.modele);
    expect(l).toHaveLength(2);
    const deux = l.find((x) => x.longueurUnitaire === 2)!;
    expect([...deux.occurrences].sort()).toEqual([a.occurrence, c.occurrence].sort());
    expect(l.find((x) => x.longueurUnitaire === 3)!.occurrences).toEqual([b.occurrence]);
  });

  it("même désignation dans deux catalogues sourcés → deux lignes, masses distinctes (masse linéique sourcée)", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, { designation: "Profil X", source: CAT("Catalogue A", 10) });
    const b = poserPiece(a.modele, { a: v3(0, 1, 0), b: v3(2, 1, 0) }, S, PLACEMENT_DEFAUT, { designation: "Profil X", source: CAT("Catalogue B", 12) });
    const l = listeDebit(b.modele);
    expect(l).toHaveLength(2);
    expect(l.map((x) => x.masse).sort()).toEqual([20, 24]);
  });

  it("masse volumique déclarée : comptée seulement avec sa source (aire × longueur × ρ)", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    expect(listeDebit(a.modele, { portee: "tout", masseVolumique: { valeur: 500, source: "" } })[0]!.masse).toBeNull();
    expect(listeDebit(a.modele, { portee: "tout", masseVolumique: { valeur: 500, source: "Fiche fournisseur d'essai" } })[0]!.masse).toBeCloseTo(0.005 * 2 * 500, 9);
  });

  it("portée « sélection » : imbrications comprises ; longueurs égales à celles des pièces", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    const b = poserPiece(a.modele, { a: v3(0, 1, 0), b: v3(3, 1, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    const g = grouper(b.modele, [a.occurrence]);
    const l = listeDebit(g.modele, { portee: "selection", selection: [g.occurrence] });
    expect(l).toHaveLength(1);
    expect(l[0]!.chemins).toEqual([[g.occurrence, a.occurrence]]);
    expect(l[0]!.longueurUnitaire).toBe(2);
  });

  it("renumérotation ordonnée (préfixe, départ) en un pas, annulable ; une copie garde son repère ; tri par colonne", () => {
    const m = cadre();
    const l = listeDebit(m);
    const r = numeroterPieces(m, reperesRenumerotes(l, "P", 1));
    const l2 = listeDebit(r.modele);
    expect(l2.map((x) => x.reperes)).toEqual([["P1"], ["P2"]]);
    expect(listeDebit(m).every((x) => x.reperes.length === 0)).toBe(true); // modèle d'avant intact : un pas
    const occ = l2[0]!.occurrences[0] as Id;
    const cp = copier(r.modele, [occ], v3(0, 10, 0)).modele;
    const copie = Object.values(contexte(cp).occurrences).find((o) => !Object.keys(contexte(r.modele).occurrences).includes(o.id))!;
    expect(copie.repere).toBe("P1");
    expect(trierDebit(l2, "longueurUnitaire", 1).map((x) => x.longueurUnitaire)).toEqual([3, 4]);
  });

  it("étiquettes : un texte par pièce portant son repère, effacées ensemble (les autres textes restent)", () => {
    const m = numeroterPieces(cadre(), reperesRenumerotes(listeDebit(cadre()), "P", 1)).modele;
    const pieces = listeDebit(m).flatMap((l) => l.occurrences.map((o) => ({ occurrence: o, position: v3(0, 0, 0), texte: l.reperes[0] ?? "?" })));
    const e = poserEtiquettesPieces(m, pieces);
    expect(Object.values(e.modele.annotations!.textes).filter((t) => t.genre === "repere" && t.etiquettePiece)).toHaveLength(4);
    const sans = effacerEtiquettesPieces(e.modele).modele;
    expect(Object.keys(sans.annotations!.textes)).toHaveLength(0);
  });

  it("CSV : BOM, séparateur « ; », point décimal, total", () => {
    const csv = csvDebit(listeDebit(cadre()));
    expect(csv.startsWith("﻿\"Repère(s)\";\"Désignation\";")).toBe(true);
    expect(csv).toContain('"Rect d\'essai";2;4;8;"45 / 45";"saisie";"non évaluée"');
    expect(csv.trim().split("\r\n").pop()).toBe('"Total";"2 ligne(s)";4;;14;;;');
  });
});

describe("Revue de #128 — pièces mises à l'échelle, étiquettes par chemin", () => {
  it("groupe mis à l'échelle le long de l'axe : ligne à part, longueur mesurée (×2), masse non évaluée (motif « echelle »)", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, { designation: "Profil X", source: CAT("Catalogue A", 10) });
    const b = poserPiece(a.modele, { a: v3(0, 1, 0), b: v3(2, 1, 0) }, S, PLACEMENT_DEFAUT, { designation: "Profil X", source: CAT("Catalogue A", 10) });
    const g = grouper(b.modele, [a.occurrence]);
    const m = mettreAEchelle(g.modele, [g.occurrence], v3(0, 0, 0), v3(2, 1, 1)).modele;
    const l = listeDebit(m);
    expect(l).toHaveLength(2);
    const ech = l.find((x) => x.miseAEchelle)!;
    expect(ech.longueurUnitaire).toBeCloseTo(4, 9);
    expect(ech.masse).toBeNull();
    expect(ech.motifMasse.genre).toBe("echelle");
    const normale = l.find((x) => !x.miseAEchelle)!;
    expect(normale.longueurUnitaire).toBeCloseTo(2, 9);
    expect(normale.masse).toBeCloseTo(20, 9);
    expect(normale.motifMasse).toEqual({ genre: "catalogue", source: "Catalogue A", edition: "2026", page: "1" });
  });

  it("deux instances d'un même objet : une étiquette par pièce physique, chacune à sa position", () => {
    const a = poserPiece(modeleVide(), { a: v3(0, 0, 0), b: v3(2, 0, 0) }, S, PLACEMENT_DEFAUT, SAISIE);
    const g = grouper(a.modele, [a.occurrence]);
    const m = copier(g.modele, [g.occurrence], v3(0, 5, 0)).modele;
    const e = etiquettesDebit(m, listeDebit(m));
    expect(e).toHaveLength(2);
    expect(e.map((x) => Math.round(x.position.y)).sort()).toEqual([0, 5]);
  });
});
