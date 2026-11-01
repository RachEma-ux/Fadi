import { describe, expect, it } from "vitest";
import { abregerValeur, CARACTERES_ETIQUETTE, PLAGES_GLYPHES, texteTracable, valeursEtiquettes } from "./etiquettes.js";
import { COMPOSITION_INITIALE, validerComposition } from "./composition.js";
import { lireValeur } from "./valeurs.js";

const f = " ";

describe("libellés de la carte (lot C, D-GD-24)", () => {
  it("valeur abrégée : k, M, Md, pourcentage, petits nombres", () => {
    expect(abregerValeur(36_828_330, "personnes")).toBe(`36,8${f}M`);
    expect(abregerValeur(3_000_000, "personnes")).toBe(`3${f}M`);
    expect(abregerValeur(250_000_000, null)).toBe(`250${f}M`);
    expect(abregerValeur(1_234_000_000, null)).toBe(`1,2${f}Md`);
    expect(abregerValeur(12_345, "logements")).toBe(`12,3${f}k`);
    expect(abregerValeur(523_456, "logements")).toBe(`523${f}k`);
    expect(abregerValeur(9_876, "logements")).toBe(`9${f}876`);
    expect(abregerValeur(12.46, "%")).toBe(`12,5${f}%`);
    expect(abregerValeur(40, "%")).toBe(`40${f}%`);
    expect(abregerValeur(3.25, "années")).toBe("3,3");
    expect(abregerValeur(-15_000, null)).toBe(`-15${f}k`);
  });
  it("zéro reste zéro ; une valeur absente n'a pas de valeur affichée (jamais « 0 »)", () => {
    expect(abregerValeur(0, "personnes")).toBe("0");
    const m = valeursEtiquettes(new Map([["1", lireValeur(0, null)], ["2", lireValeur(null, "secret-statistique")], ["3", lireValeur(1500, null)]]), "personnes");
    expect([...m]).toEqual([["1", "0"], ["3", `1${f}500`]]);
  });
  it("glyphes livrés : latin seulement, par blocs de 256 ; le texte non traçable est retiré", () => {
    for (const [a, b] of PLAGES_GLYPHES) { expect(a % 256).toBe(0); expect(b - a).toBe(255); }
    expect(CARACTERES_ETIQUETTE("Aït Melloul — Souss-Massa")).toBe(true);
    expect(CARACTERES_ETIQUETTE(`1,2${f}M`)).toBe(true);
    expect(CARACTERES_ETIQUETTE("الرباط")).toBe(false);
    expect(texteTracable("Rabat الرباط")).toBe("Rabat");
    expect(texteTracable("الرباط")).toBe("");
  });
  it("composition : libellés affichés relus ; masqués = clé absente (compositions antérieures inchangées)", () => {
    const couche = { coucheId: "c", versionId: "v", visible: true, opacite: 1, style: { mode: "simple", couleur: "#112233" }, filtre: null };
    const avec = validerComposition({ ...COMPOSITION_INITIALE, couches: [{ ...couche, etiquettes: true }] });
    expect(avec.ok && avec.composition.couches[0]!.etiquettes).toBe(true);
    const sans = validerComposition({ ...COMPOSITION_INITIALE, couches: [{ ...couche, etiquettes: false }] });
    expect(sans.ok && "etiquettes" in sans.composition.couches[0]!).toBe(false);
    expect(validerComposition({ ...COMPOSITION_INITIALE, couches: [{ ...couche, etiquettes: "oui" }] }).ok).toBe(false);
  });
});
