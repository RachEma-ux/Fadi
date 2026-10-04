import { describe, expect, it } from "vitest";
import type { DefinitionOutil } from "./contrats";
import { creerRegistre, creerSelection, normaliser } from "./index";

const outil = (id: string, libelle: string, extra: Partial<DefinitionOutil> = {}): DefinitionOutil => ({
  id,
  libelle,
  famille: "creer",
  niveau: "essentiel",
  synonymes: [],
  fiches: [],
  aide: { action: libelle, conditions: "un niveau actif", exemple: "" },
  vues: ["plan"],
  ecrit: true,
  activation: () => ({ ok: true }),
  commencer: () => ({ traiter: () => ({ action: "continuer" }), apercu: () => ({ formes: [], champs: [], consigne: "", erreurs: [] }), abandonner: () => {} }),
  ...extra,
});

describe("socle du nouvel Atelier", () => {
  it("sélection : remplacer, ajouter, basculer, retirer ; principal = dernier ; notification seulement si changement", () => {
    const s = creerSelection();
    let n = 0;
    const fin = s.abonner(() => n++);
    s.choisir(["a", "b"]);
    expect(s.lire()).toEqual({ ids: ["a", "b"], principal: "b" });
    s.choisir(["a"], "ajouter");
    expect(s.lire()).toEqual({ ids: ["b", "a"], principal: "a" });
    s.choisir(["a", "c"], "basculer");
    expect(s.lire().ids).toEqual(["b", "c"]);
    s.choisir(["b"], "retirer");
    expect(s.lire()).toEqual({ ids: ["c"], principal: "c" });
    const avant = n;
    s.choisir(["c"]);
    expect(n).toBe(avant);
    s.vider();
    expect(s.lire()).toEqual({ ids: [], principal: null });
    fin();
    s.choisir(["x"]);
    expect(n).toBe(avant + 1);
  });

  it("registre : identifiant et raccourci uniques ; recherche par libellé, synonyme, sans accents, filtrée par niveau", () => {
    const r = creerRegistre();
    r.enregistrer(outil("creer.mur", "Mur", { raccourci: "M", synonymes: ["wall", "cloison"] }));
    r.enregistrer(outil("modifier.decaler", "Décaler", { famille: "modifier", synonymes: ["offset"], niveau: "contextuel" }));
    r.enregistrer(outil("modifier.ajuster", "Ajuster", { famille: "modifier", synonymes: ["trim"], niveau: "complet" }));
    expect(() => r.enregistrer(outil("creer.mur", "Autre"))).toThrow(/déjà enregistré/);
    expect(() => r.enregistrer(outil("creer.autre", "Autre", { raccourci: "m" }))).toThrow(/déjà pris/);
    expect(r.rechercher("decal", "complet").map((o) => o.id)).toEqual(["modifier.decaler"]);
    expect(r.rechercher("OFFSET", "complet").map((o) => o.id)).toEqual(["modifier.decaler"]);
    expect(r.rechercher("trim", "contextuel")).toEqual([]);
    expect(r.rechercher("", "essentiel").map((o) => o.id)).toEqual(["creer.mur"]);
    expect(normaliser("  Éclaté ")).toBe("eclate");
  });
});
