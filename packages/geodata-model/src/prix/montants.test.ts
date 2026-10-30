import { describe, expect, it } from "vitest";
import { arrondirDecimal, centimesEnTexte, parserMontant, uniteCanonique, versCentimes } from "./montants.js";

describe("lecture des montants écrits à la française", () => {
  it("« 18 548 DH » (espace insécable) : montant exact, non abrégé, en MAD", () => {
    const m = parserMontant("18 548 DH");
    expect(m).toMatchObject({ valeur: 18548, centimes: 1854800, approximatif: false, monnaie: "MAD", unite: "MAD", periode: null, motif: null });
    expect(m.texteOriginal).toBe("18 548 DH");
  });

  it("abréviations K et M : décalage décimal exact, marqué approximatif", () => {
    expect(parserMontant("3,3M DH")).toMatchObject({ valeur: 3300000, centimes: 330000000, approximatif: true });
    expect(parserMontant("769K DH")).toMatchObject({ valeur: 769000, approximatif: true, pasCentimes: 100000 });
    expect(parserMontant("3,3M DH").pasCentimes).toBe(10_000_000);
    expect(parserMontant("18 548 DH").pasCentimes).toBe(100);
    expect(parserMontant("954,8K DH")).toMatchObject({ valeur: 954800, centimes: 95480000, approximatif: true });
    // 1,23456789 × 10^6 = 1 234 567,89 DH = 123 456 789 centimes, obtenu par décalage de chaîne (1.23456789 * 1e6 * 100
    // en flottant vaut 123456788.99999999).
    expect(parserMontant("1,23456789M DH").centimes).toBe(123456789);
  });

  it("loyer mensuel et prix au m² : période et unité canonique", () => {
    expect(parserMontant("13 000 DH/mois")).toMatchObject({ valeur: 13000, periode: "mois", unite: "MAD/mois", parM2: false });
    expect(parserMontant("12 500 DH/m²")).toMatchObject({ valeur: 12500, parM2: true, unite: "MAD/m2" });
    expect(parserMontant("95 DH/m2/mois")).toMatchObject({ valeur: 95, unite: "MAD/m2/mois" });
    expect(parserMontant("450 DH par jour")).toMatchObject({ periode: "jour", unite: "MAD/jour" });
  });

  it("autres monnaies conservées (jamais converties), séparateurs à point", () => {
    expect(parserMontant("250 000 €")).toMatchObject({ valeur: 250000, monnaie: "EUR", unite: "EUR" });
    expect(parserMontant("1.500.000 DH").valeur).toBe(1500000);
    expect(parserMontant("3.3M DH").valeur).toBe(3300000);
    expect(parserMontant("1 234,5").valeur).toBe(1234.5);
    expect(parserMontant("1 234,5").monnaie).toBeNull();
  });

  it("absence et illisibilité : valeur null avec un motif, jamais 0", () => {
    for (const t of ["—", "", "  ", "Prix sur demande", null, undefined]) {
      expect(parserMontant(t)).toMatchObject({ valeur: null, centimes: null, motif: "absent" });
    }
    expect(parserMontant("-5 000 DH")).toMatchObject({ valeur: null, motif: "hors-limites" });
    expect(parserMontant("12 000 bitcoins")).toMatchObject({ valeur: null, motif: "unite-inconnue" });
    expect(parserMontant("1,2,3 DH")).toMatchObject({ valeur: null, motif: "illisible" });
  });

  it("arrondi au centime, moitié en s'éloignant de zéro, sans bruit binaire", () => {
    expect(parserMontant("12,345 DH").centimes).toBe(1235);
    expect(parserMontant("9,995 DH").centimes).toBe(1000);
    expect(arrondirDecimal(1.005)).toBe(1.01);
    expect(arrondirDecimal(2.675)).toBe(2.68);
    expect(arrondirDecimal(-2.675)).toBe(-2.68);
    expect(arrondirDecimal(0.1 + 0.2)).toBe(0.3);
    expect(arrondirDecimal(1234.5678, 1)).toBe(1234.6);
  });

  it("nombres décimaux simples et écriture exacte des centimes", () => {
    expect(versCentimes("3300000.0")).toBe(330000000);
    expect(versCentimes("18548")).toBe(1854800);
    expect(versCentimes("abc")).toBeNull();
    expect(centimesEnTexte(330000000)).toBe("3300000.00");
    expect(centimesEnTexte(5)).toBe("0.05");
  });

  it("unités déclarées par une source ramenées à la forme canonique", () => {
    expect(uniteCanonique("MAD/month")).toBe("MAD/mois");
    expect(uniteCanonique("MAD/m2/month")).toBe("MAD/m2/mois");
    expect(uniteCanonique("DH/m²")).toBe("MAD/m2");
    expect(uniteCanonique("MAD")).toBe("MAD");
    expect(uniteCanonique("m2")).toBeNull();
    expect(uniteCanonique("MAD/heure")).toBeNull();
  });
});
