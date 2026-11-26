/** Avis et saisies demandés par une extension (protocole 1.0, lot 3) : forme des demandes, validation des réponses. */
import { describe, expect, it } from "vitest";
import { BORNES_SAISIE, lireAvisExtension, lireDemandeSaisie, lireNombreSaisi, valeursInitiales, validerSaisie, type DemandeSaisie } from "./saisies-extensions.js";

const CHAMPS = [
  { id: "nom", libelle: "Nom", genre: "texte", valeur: "Boîte" },
  { id: "largeur", libelle: " Largeur ", genre: "nombre", valeur: 2, min: 0.01, max: 100, unite: "m" },
  { id: "forme", libelle: "Forme", genre: "choix", choix: [{ valeur: "pleine", libelle: "Pleine" }, { valeur: "base", libelle: "Base seule" }] },
  { id: "grouper", libelle: "Grouper", genre: "case", valeur: true },
];
const demande = (): DemandeSaisie => {
  const lu = lireDemandeSaisie({ titre: "Dimensions", champs: CHAMPS });
  if (!lu.ok) throw new Error(lu.detail);
  return lu.demande;
};

describe("avis", () => {
  it("texte et genre ; « info » par défaut", () => {
    expect(lireAvisExtension({ texte: " Fait. " })).toEqual({ texte: "Fait.", genre: "info" });
    expect(lireAvisExtension({ texte: "Attention", genre: "alerte" })).toEqual({ texte: "Attention", genre: "alerte" });
  });
  it("refus : forme, genre inconnu, texte vide, trop long, caractère de contrôle, champ inconnu", () => {
    for (const d of [null, "x", {}, { texte: "" }, { texte: "  " }, { texte: "a", genre: "erreur" }, { texte: "a".repeat(BORNES_SAISIE.texte + 1) }, { texte: "a\nb" }, { texte: "a", html: "<b>" }, { texte: 3 }]) expect(lireAvisExtension(d), JSON.stringify(d)).toBeNull();
  });
});

describe("demande de saisie", () => {
  it("quatre genres de champ ; valeurs par défaut ; libellés rognés", () => {
    const d = demande();
    expect(d.titre).toBe("Dimensions");
    expect(d.champs.map((c) => c.genre)).toEqual(["texte", "nombre", "choix", "case"]);
    expect(d.champs[1]).toEqual({ id: "largeur", libelle: "Largeur", genre: "nombre", valeur: 2, min: 0.01, max: 100, unite: "m" });
    // Un choix sans valeur prend le premier.
    expect(valeursInitiales(d)).toEqual({ nom: "Boîte", largeur: 2, forme: "pleine", grouper: true });
    const nus = lireDemandeSaisie({ titre: "T", champs: [{ id: "a", libelle: "A", genre: "texte" }, { id: "b", libelle: "B", genre: "nombre" }, { id: "c", libelle: "C", genre: "case" }] });
    expect(nus.ok && valeursInitiales(nus.demande)).toEqual({ a: "", b: 0, c: false });
  });

  it("refus motivés, sans rien filtrer", () => {
    const refus = (d: unknown) => {
      const lu = lireDemandeSaisie(d);
      expect(lu.ok, JSON.stringify(d)).toBe(false);
      return lu.ok ? "" : lu.detail;
    };
    const champ = (c: unknown) => refus({ titre: "T", champs: [c] });
    expect(refus(null)).toContain("titre, champs");
    expect(refus({ titre: "", champs: CHAMPS })).toContain("titre");
    expect(refus({ titre: "T", champs: [] })).toContain("champs");
    expect(refus({ titre: "T", champs: Array.from({ length: BORNES_SAISIE.champs + 1 }, (_, i) => ({ id: `c${i}`, libelle: "x", genre: "case" })) })).toContain("champs");
    expect(refus({ titre: "T", champs: CHAMPS, page: "<html>" })).toContain("titre, champs");
    expect(refus({ titre: "T", champs: [CHAMPS[0], CHAMPS[0]] })).toContain("deux fois");
    expect(champ({ id: "9a", libelle: "x", genre: "case" })).toContain("identifiant");
    expect(champ({ id: "a", libelle: "", genre: "case" })).toContain("libellé");
    expect(champ({ id: "a", libelle: "x", genre: "couleur" })).toContain("genre");
    expect(champ({ id: "a", libelle: "x", genre: "case", valeur: "oui" })).toContain("vrai ou faux");
    expect(champ({ id: "a", libelle: "x", genre: "case", html: "<b>" })).toContain("inconnu");
    expect(champ({ id: "a", libelle: "x", genre: "nombre", valeur: "2" })).toContain("nombres");
    expect(champ({ id: "a", libelle: "x", genre: "nombre", valeur: Number.NaN })).toContain("nombres");
    expect(champ({ id: "a", libelle: "x", genre: "nombre", min: 5, max: 1 })).toContain("min");
    expect(champ({ id: "a", libelle: "x", genre: "choix", choix: [] })).toContain("choix");
    expect(champ({ id: "a", libelle: "x", genre: "choix", choix: [{ valeur: "a", libelle: "A" }, { valeur: "a", libelle: "B" }] })).toContain("deux fois");
    expect(champ({ id: "a", libelle: "x", genre: "choix", valeur: "z", choix: [{ valeur: "a", libelle: "A" }] })).toContain("l'un des choix");
    expect(champ({ id: "a", libelle: "x", genre: "texte", valeur: "a".repeat(BORNES_SAISIE.valeur + 1) })).toContain("caractères");
  });
});

describe("réponse de l'utilisateur", () => {
  it("un nombre se saisit avec une virgule ou un point", () => {
    expect(lireNombreSaisi("2,5")).toBe(2.5);
    expect(lireNombreSaisi(" 1 200.25 ")).toBe(1200.25);
    expect(lireNombreSaisi("-3")).toBe(-3);
    expect(lireNombreSaisi(".5")).toBe(0.5);
    for (const t of ["", "deux", "1,2,3", "1e3", "2m", "Infinity"]) expect(lireNombreSaisi(t), t).toBeNull();
  });

  it("l'extension reçoit des valeurs du genre déclaré, dans les bornes déclarées", () => {
    const d = demande();
    expect(validerSaisie(d, { nom: "Socle", largeur: "2,5", forme: "base", grouper: false })).toEqual({ ok: true, valeurs: { nom: "Socle", largeur: 2.5, forme: "base", grouper: false } });
    expect(validerSaisie(d, { nom: "", largeur: 3, forme: "pleine" })).toEqual({ ok: true, valeurs: { nom: "", largeur: 3, forme: "pleine", grouper: false } });
    const base = { nom: "x", largeur: "1", forme: "pleine", grouper: true };
    expect(validerSaisie(d, { ...base, largeur: "large" })).toEqual({ ok: false, champ: "largeur", motif: "nombre" });
    expect(validerSaisie(d, { ...base, largeur: "0" })).toEqual({ ok: false, champ: "largeur", motif: "min" });
    expect(validerSaisie(d, { ...base, largeur: "101" })).toEqual({ ok: false, champ: "largeur", motif: "max" });
    expect(validerSaisie(d, { ...base, forme: "ronde" })).toEqual({ ok: false, champ: "forme", motif: "choix" });
    expect(validerSaisie(d, { ...base, nom: "a".repeat(BORNES_SAISIE.valeur + 1) })).toEqual({ ok: false, champ: "nom", motif: "longueur" });
  });
});
