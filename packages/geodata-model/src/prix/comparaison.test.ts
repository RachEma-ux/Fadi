import { describe, expect, it } from "vitest";
import type { ReferenceOfficielle } from "./types.js";
import { comparerAuReferentiel, LIBELLE_ECART_REFERENCE, type ValeurMarche } from "./comparaison.js";

const ref: ReferenceOfficielle = {
  id: "R-1", edition: "edition-synthetique-1", zone: "Z-1", categorieOriginale: "Appartement ancien", typeBien: "appartement", etat: "ancien",
  transaction: "vente", baseSurface: "habitable", monnaie: "MAD", unite: "MAD/m2",
  valeur: { forme: "unique", valeur: 10000, texteOriginal: "10 000 DH/m²" },
  dateDebut: "2026-01-01", dateFin: null, validite: "verifiee", autorisee: true,
};
const marche: ValeurMarche = {
  nature: "cellule-fadi", territoire: "Z-1", typeBien: "appartement", etat: "ancien", transaction: "vente", baseSurface: "habitable",
  monnaie: "MAD", unite: "MAD/m2", etatDonnee: "disponible", mediane: 11500, dateDonnees: "2026-10-31", autorisee: true, baseDocumentee: true,
};
const opt = { dateComparaison: "2026-10-31" };

describe("comparaison référence officielle / prix affichés (Concept §6)", () => {
  it("valeur unique : écart = 100 × (médiane − référence) / référence", () => {
    // 100 × (11 500 − 10 000) / 10 000 = 15.
    const r = comparerAuReferentiel(ref, marche, opt);
    expect(r).toMatchObject({ comparable: true, mode: "ecart", ecartPourcent: 15, valeurReference: 10000, libelle: LIBELLE_ECART_REFERENCE });
    expect(LIBELLE_ECART_REFERENCE).toBe("Écart du prix affiché par rapport à la référence officielle");
    if (r.comparable) expect(r.reference.texteOriginal).toBe("10 000 DH/m²");
  });

  it("fourchette : position, sans pourcentage", () => {
    const f = (min: number, max: number) => comparerAuReferentiel({ ...ref, valeur: { forme: "fourchette", min, max, texteOriginal: `${min}–${max}` } }, marche, opt);
    expect(f(9000, 12000)).toMatchObject({ mode: "position", position: "dans" });
    expect(f(12000, 13000)).toMatchObject({ position: "en-dessous" });
    expect(f(8000, 11000)).toMatchObject({ position: "au-dessus" });
    expect(f(9000, 12000)).not.toHaveProperty("ecartPourcent");
  });

  it("terrain + construction et conditionnelle : non comparables sans applicabilité explicite", () => {
    const tc = { ...ref, valeur: { forme: "terrain-construction" as const, terrain: 4000, construction: 5000, texteOriginal: "4 000 + 5 000" } };
    expect(comparerAuReferentiel(tc, marche, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["forme-non-applicable"] });
    // Composante terrain revue applicable : 100 × (11 500 − 4 000) / 4 000 = 187,5.
    expect(comparerAuReferentiel(tc, marche, { ...opt, applicabilite: { applicable: true, composante: "terrain" } })).toMatchObject({ ecartPourcent: 187.5, formeReference: "terrain-construction" });
    const cond = { ...ref, valeur: { forme: "conditionnelle" as const, condition: "R+4 au plus", valeur: 12500, texteOriginal: "12 500 si R+4" } };
    expect(comparerAuReferentiel(cond, marche, opt).comparable).toBe(false);
    // 100 × (11 500 − 12 500) / 12 500 = −8.
    expect(comparerAuReferentiel(cond, marche, { ...opt, applicabilite: { applicable: true } })).toMatchObject({ ecartPourcent: -8 });
  });

  it("dimensions incompatibles rapportées, sans pourcentage (PRX09)", () => {
    const r = comparerAuReferentiel(ref, { ...marche, territoire: "T-9", transaction: "location", unite: "MAD/m2/mois", etat: null, baseSurface: "parcelle", monnaie: "EUR" }, opt);
    expect(r).toEqual({ comparable: false, dimensionsIncompatibles: ["territoire", "etat", "transaction", "base-surface", "monnaie", "unite"] });
  });

  it("attribution spatiale qualifiée : zone officielle rattachée à un territoire revu", () => {
    const m = { ...marche, territoire: "T-COM" };
    expect(comparerAuReferentiel(ref, m, opt).comparable).toBe(false);
    expect(comparerAuReferentiel(ref, m, { ...opt, correspondancesQualifiees: [{ zone: "Z-1", territoire: "T-COM" }] }).comparable).toBe(true);
  });

  it("référence de validité non vérifiée ou historique, non autorisée, hors dates : pas de comparaison (PRX08)", () => {
    expect(comparerAuReferentiel({ ...ref, validite: "non-verifiee" }, marche, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["validite-reference"] });
    expect(comparerAuReferentiel({ ...ref, validite: "historique", dateFin: "2015-12-31" }, marche, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["dates", "validite-reference"] });
    expect(comparerAuReferentiel({ ...ref, autorisee: false }, marche, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["autorisation"] });
    expect(comparerAuReferentiel(ref, { ...marche, etatDonnee: "perime" }, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["dates"] });
  });

  it("cellule insuffisante, référence non positive, base inconnue ou non documentée : refus", () => {
    expect(comparerAuReferentiel(ref, { ...marche, etatDonnee: "echantillon-insuffisant", mediane: null }, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["etat-valeur-marche"] });
    expect(comparerAuReferentiel({ ...ref, valeur: { forme: "unique", valeur: 0, texteOriginal: "0" } }, marche, opt)).toEqual({ comparable: false, dimensionsIncompatibles: ["reference-non-positive"] });
    expect(comparerAuReferentiel({ ...ref, baseSurface: "inconnue" }, { ...marche, baseSurface: "inconnue", nature: "agregat-publie", baseDocumentee: false }, opt))
      .toEqual({ comparable: false, dimensionsIncompatibles: ["base-surface", "base-non-documentee"] });
  });

  it("référence sans état précisé : l'état de la cellule n'est pas exigé", () => {
    expect(comparerAuReferentiel({ ...ref, etat: null }, { ...marche, etat: null }, opt).comparable).toBe(true);
  });
});
