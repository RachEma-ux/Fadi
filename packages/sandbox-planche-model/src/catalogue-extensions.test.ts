/** Catalogue des extensions vu de la plateforme : réglage en vigueur, choix effectif d'un compte, relecture, validation. */
import { describe, expect, it } from "vitest";
import {
  CATALOGUE_LIVRE,
  EXTENSIONS_SANDBOX,
  catalogueExtensions,
  choixEffectif,
  clesMasquees,
  defautsExtensions,
  extensionActive,
  lireCatalogue,
  validerChangementReglage,
} from "./index.js";

describe("catalogue des extensions — plateforme", () => {
  it("sans réglage : chaque extension livrée est disponible, avec sa version et le réglage d'origine de Fadi", () => {
    expect(CATALOGUE_LIVRE.map((f) => f.id)).toEqual(EXTENSIONS_SANDBOX.map((x) => x.id));
    for (const f of CATALOGUE_LIVRE) {
      const x = EXTENSIONS_SANDBOX.find((e) => e.id === f.id)!;
      expect(f).toEqual({ id: x.id, version: x.version, etat: "disponible", activeParDefaut: x.activeParDefaut });
    }
    expect(defautsExtensions()).toEqual([]);
  });

  it("le réglage de la plateforme remplace celui de Fadi ; un réglage d'extension inconnue est ignoré", () => {
    const c = catalogueExtensions({ controle: { etat: "experimentale", activeParDefaut: true }, fantome: { etat: "retiree", activeParDefaut: false } });
    expect(c.find((f) => f.id === "controle")).toMatchObject({ etat: "experimentale", activeParDefaut: true });
    expect(c.some((f) => f.id === "fantome")).toBe(false);
    expect(c).toHaveLength(EXTENSIONS_SANDBOX.length);
  });

  it("sans réglage, le choix effectif d'un compte est celui d'avant (réglages livrés)", () => {
    expect(clesMasquees(choixEffectif({}, CATALOGUE_LIVRE))).toEqual(clesMasquees({}));
    expect(clesMasquees(choixEffectif({ bois: false, controle: true }, CATALOGUE_LIVRE))).toEqual(clesMasquees({ bois: false, controle: true }));
  });

  it("le réglage d'origine de la plateforme vaut pour qui n'a rien choisi ; le choix du compte passe devant", () => {
    const c = catalogueExtensions({ controle: { etat: "disponible", activeParDefaut: true }, bois: { etat: "disponible", activeParDefaut: false } });
    expect(extensionActive("controle", choixEffectif({}, c))).toBe(true);
    expect(extensionActive("bois", choixEffectif({}, c))).toBe(false);
    expect(extensionActive("controle", choixEffectif({ controle: false }, c))).toBe(false);
    expect(extensionActive("bois", choixEffectif({ bois: true }, c))).toBe(true);
  });

  it("une extension retirée n'est active pour personne, quel que soit le choix du compte ; une expérimentale reste proposée", () => {
    const c = catalogueExtensions({ volumes: { etat: "retiree", activeParDefaut: true }, controle: { etat: "experimentale", activeParDefaut: false } });
    expect(extensionActive("volumes", choixEffectif({}, c))).toBe(false);
    expect(extensionActive("volumes", choixEffectif({ volumes: true }, c))).toBe(false);
    expect(clesMasquees(choixEffectif({ volumes: true }, c)).has("outil:union")).toBe(true);
    expect(extensionActive("controle", choixEffectif({ controle: true }, c))).toBe(true);
  });

  it("relecture tolérante : fiches valides retenues, le reste reprend le réglage livré", () => {
    expect(lireCatalogue(undefined)).toEqual(CATALOGUE_LIVRE);
    expect(lireCatalogue("x")).toEqual(CATALOGUE_LIVRE);
    const lu = lireCatalogue([{ id: "bois", version: "9.9.9", etat: "retiree", activeParDefaut: true }, { id: "volumes", etat: "inconnu", activeParDefaut: true }, { id: "fantome", etat: "retiree", activeParDefaut: true }, null]);
    expect(lu.find((f) => f.id === "bois")).toEqual({ id: "bois", version: "1.0.0", etat: "retiree", activeParDefaut: true });
    expect(lu.find((f) => f.id === "volumes")).toMatchObject({ etat: "disponible" });
    expect(lu).toHaveLength(EXTENSIONS_SANDBOX.length);
  });

  it("changement de réglage : etat et / ou activeParDefaut, rien d'autre", () => {
    expect(validerChangementReglage({ etat: "retiree" })).toEqual({ ok: true, reglage: { etat: "retiree" } });
    expect(validerChangementReglage({ activeParDefaut: true })).toEqual({ ok: true, reglage: { activeParDefaut: true } });
    expect(validerChangementReglage({ etat: "experimentale", activeParDefaut: false })).toEqual({ ok: true, reglage: { etat: "experimentale", activeParDefaut: false } });
    for (const mauvais of [{}, [], null, { etat: "supprimee" }, { activeParDefaut: "oui" }, { etat: "retiree", version: "2.0.0" }]) expect(validerChangementReglage(mauvais)).toMatchObject({ ok: false });
  });
});
