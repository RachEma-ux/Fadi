import { describe, expect, it } from "vitest";
import {
  EXTENSIONS_SANDBOX,
  basculerExtension,
  clesMasquees,
  contenuExtension,
  defautsExtensions,
  entreeOfferte,
  entreesOffertes,
  extensionActive,
  extensionDeCle,
  extensionsActives,
  validerChoixExtensions,
} from "./extensions-sandbox.js";
import { PREFERENCES_SANDBOX_DEFAUT, PROFILS_METIER, barreGaucheSandbox, validerPreferencesSandbox } from "./personnalisation-sandbox.js";
import { REGISTRE_SANDBOX } from "./registre-sandbox.js";

describe("Extensions du Sandbox — liste", () => {
  it("est cohérente avec le registre : identifiants, entrées présentes, aucune entrée dans deux extensions", () => {
    expect(defautsExtensions()).toEqual([]);
  });

  it("détecte une liste incohérente (garde construite)", () => {
    const fausse = [
      { id: "Mauvais Id", libelle: "x", description: "x", pictogramme: "outil:ligne", activeParDefaut: true, entrees: ["outil:absent"] },
      { id: "double", libelle: "x", description: "x", pictogramme: "outil:union", activeParDefaut: true, entrees: ["outil:union"] },
      { id: "double", libelle: "x", description: "x", pictogramme: "outil:union", activeParDefaut: true, entrees: ["outil:union"] },
    ];
    const defauts = defautsExtensions(fausse);
    expect(defauts.some((d) => d.includes("mal formé"))).toBe(true);
    expect(defauts.some((d) => d.includes("absente du registre"))).toBe(true);
    expect(defauts.some((d) => d.includes("hors de ses entrées"))).toBe(true);
    expect(defauts.some((d) => d.includes("cité deux fois"))).toBe(true);
    expect(defauts.some((d) => d.includes("déjà dans"))).toBe(true);
  });

  it("regroupe des outils existants : « Bois et menuiserie » (6 outils, 5 commandes, 1 panneau) et « Volumes et solides » (7 outils)", () => {
    const bois = EXTENSIONS_SANDBOX.find((x) => x.id === "bois")!;
    const volumes = EXTENSIONS_SANDBOX.find((x) => x.id === "volumes")!;
    expect(contenuExtension(bois)).toEqual({ outil: 6, commande: 5, panneau: 1 });
    expect(contenuExtension(volumes)).toEqual({ outil: 7, commande: 0, panneau: 0 });
    expect(extensionDeCle("panneau:debit")?.id).toBe("bois");
    expect(extensionDeCle("outil:ligne")).toBeUndefined();
  });

  it("garde les outils de base hors de toute extension : la barre gauche Standard n'en dépend pas", () => {
    for (const id of barreGaucheSandbox(PREFERENCES_SANDBOX_DEFAUT)) expect(extensionDeCle(`outil:${id}`)).toBeUndefined();
  });
});

describe("Extensions du Sandbox — choix du compte", () => {
  it("sans choix, les extensions faites d'outils existants sont actives : personne ne perd un outil", () => {
    expect(extensionsActives({}).map((x) => x.id)).toEqual(["bois", "volumes"]);
    // Seules les extensions nouvelles attendent d'être activées : rien d'existant n'est masqué.
    expect([...clesMasquees({})].sort()).toEqual(["commande:composant-dynamique", "commande:controler", "commande:nettoyer", "commande:redessiner-composant", "panneau:controle", "panneau:dynamique"]);
    expect(entreesOffertes({})).toHaveLength(REGISTRE_SANDBOX.length - 6);
    expect(extensionsActives(basculerExtension({}, "controle", true)).map((x) => x.id)).toEqual(["bois", "volumes", "controle"]);
    expect(basculerExtension({}, "controle", true)).toEqual({ controle: true });
  });

  it("une extension désactivée retire ses entrées, et seulement elles", () => {
    const choix = basculerExtension({}, "bois", false);
    expect(extensionActive("bois", choix)).toBe(false);
    expect(extensionActive("volumes", choix)).toBe(true);
    expect(entreeOfferte("outil", "profile", choix)).toBe(false);
    expect(entreeOfferte("panneau", "debit", choix)).toBe(false);
    expect(entreeOfferte("commande", "liste-debit", choix)).toBe(false);
    expect(entreeOfferte("outil", "union", choix)).toBe(true);
    expect(entreeOfferte("outil", "ligne", choix)).toBe(true);
    expect(entreesOffertes(choix)).toHaveLength(REGISTRE_SANDBOX.length - 12 - 6);
  });

  it("ne retient que les écarts au défaut : réactiver efface le choix", () => {
    const off = basculerExtension({}, "bois", false);
    expect(off).toEqual({ bois: false });
    expect(basculerExtension(off, "bois", true)).toEqual({});
    expect(basculerExtension({}, "inconnue", false)).toEqual({});
  });

  it("une extension inconnue n'est jamais active", () => {
    expect(extensionActive("inconnue", { inconnue: true })).toBe(false);
  });

  it("valide un choix reçu : forme, booléens, identifiants connus — jamais de filtrage silencieux", () => {
    expect(validerChoixExtensions({ bois: false })).toEqual({ ok: true, choix: { bois: false } });
    expect(validerChoixExtensions({ bois: true })).toEqual({ ok: true, choix: {} });
    expect(validerChoixExtensions([])).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerChoixExtensions({ bois: "non" })).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerChoixExtensions({ fantome: false })).toMatchObject({ ok: false, erreur: "extension_inconnue", inconnues: ["extension:fantome"] });
  });
});

describe("Extensions du Sandbox — préférences", () => {
  const base = { profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [] };

  it("un corps sans le champ (avant le 25 novembre 2026) vaut « aucun choix »", () => {
    const r = validerPreferencesSandbox(base);
    expect(r.ok && r.preferences.extensions).toEqual({});
  });

  it("un corps avec le champ le garde, vérifié", () => {
    const r = validerPreferencesSandbox({ ...base, extensions: { volumes: false } });
    expect(r.ok && r.preferences.extensions).toEqual({ volumes: false });
    expect(validerPreferencesSandbox({ ...base, extensions: { fantome: true } })).toMatchObject({ ok: false, erreur: "extension_inconnue" });
    expect(validerPreferencesSandbox({ ...base, extensions: "tout" })).toMatchObject({ ok: false, erreur: "forme_invalide" });
  });

  it("la barre gauche d'un profil perd les outils d'une extension désactivée, sans changer le profil", () => {
    const metier = PROFILS_METIER.find((m) => m.id === "metier:bois")!;
    const actif = { ...PREFERENCES_SANDBOX_DEFAUT, profil: metier.id };
    expect(barreGaucheSandbox(actif)).toEqual(metier.barre);
    const sans = barreGaucheSandbox({ ...actif, extensions: { bois: false } });
    expect(sans).not.toContain("profile");
    expect(sans).toContain("ligne");
    expect(sans).toEqual(metier.barre.filter((id) => !["profile", "profiles-aretes", "onglet", "coupe-profil", "allonger-piece", "aligner-face"].includes(id)));
  });
});
