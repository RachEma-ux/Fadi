import { describe, expect, it } from "vitest";
import { calculerSeuils, classer, CLASSES_MAX, couleursPalette, couleursPour, PALETTE_PAR_DEFAUT, PALETTES_CLASSES, rupturesNaturelles } from "./classification.js";
import { COMPOSITION_INITIALE, validerComposition } from "./composition.js";
import { lireValeur } from "./valeurs.js";

const valeurs = (xs: (number | null)[]) => xs.map((x) => (x === null ? lireValeur(null, "secret-statistique") : lireValeur(x, null)));

describe("palettes et classes (lot D, D-GD-25)", () => {
  it("chaque palette a au moins 5 couleurs #rrggbb distinctes ; la palette par défaut reste celle d'avant le lot D", () => {
    for (const [id, p] of Object.entries(PALETTES_CLASSES)) {
      expect(p.couleurs.length, id).toBeGreaterThanOrEqual(5);
      expect(p.couleurs.every((c) => /^#[0-9a-f]{6}$/.test(c)), id).toBe(true);
      expect(new Set(p.couleurs).size, id).toBe(p.couleurs.length);
    }
    expect(couleursPour(5)).toEqual(["#f1eef6", "#bdc9e1", "#74a9cf", "#2b8cbe", "#045a8d"]);
    expect(PALETTE_PAR_DEFAUT).toBe("bleu-violet");
  });
  it("n couleurs réparties sur toute la palette, extrémités comprises ; distinctes jusqu'à 9 classes ; inversion", () => {
    const p = PALETTES_CLASSES.verts.couleurs;
    for (let n = 2; n <= 9; n++) {
      const cs = couleursPalette("verts", n);
      expect(cs).toHaveLength(n);
      expect(cs[0]).toBe(p[0]);
      expect(cs[n - 1]).toBe(p[p.length - 1]);
      expect(new Set(cs).size).toBe(n);
    }
    expect(couleursPalette("rouges", 3, true)).toEqual([...couleursPalette("rouges", 3)].reverse());
  });
  it("seuils naturels de Jenks : trouvent les groupes évidents, ignorent les absences (jamais 0)", () => {
    const xs = [1, 2, 3, 4, 50, 51, 52, 53, 200, 201, 202];
    expect(rupturesNaturelles(xs, 3)).toEqual([50, 200]);
    const vs = valeurs([...xs, null, null]);
    const seuils = calculerSeuils(vs, "seuils-naturels", 3);
    expect(seuils).toEqual([50, 200]);
    expect(vs.map((v) => classer(v, seuils))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, "absente", "absente"]);
  });
  it("Jenks : optimum exact sur un cas de référence, et plus de classes que de valeurs distinctes sans erreur", () => {
    // Cas classique : les ruptures optimales en 2 classes séparent 1..3 de 10..12.
    expect(rupturesNaturelles([1, 2, 3, 10, 11, 12], 2)).toEqual([10]);
    expect(calculerSeuils(valeurs([5, 5, 5, 7]), "seuils-naturels", 5)).toEqual([7]);
    expect(rupturesNaturelles([3], 4)).toEqual([]);
  });
  it("Jenks sur un grand nombre de valeurs : échantillon régulier, seuils croissants dans l'étendue", () => {
    const xs = Array.from({ length: 10_000 }, (_, i) => (i < 5000 ? i % 100 : 1000 + (i % 100)));
    const s = calculerSeuils(valeurs(xs), "seuils-naturels", 2);
    expect(s).toHaveLength(1);
    expect(s[0]).toBeGreaterThan(99);
    expect(s[0]).toBeLessThanOrEqual(1000);
  });
  it("composition : méthode « seuils-naturels », palette et inversion relues ; inconnues refusées ; absentes = clés absentes", () => {
    const style = { mode: "thematique", indicateurId: "i", methode: "seuils-naturels", seuils: [1, 2], couleurs: couleursPalette("oranges", 3) };
    const couche = (st: object) => ({ ...COMPOSITION_INITIALE, couches: [{ coucheId: "c", versionId: "v", visible: true, opacite: 1, style: st, filtre: null }] });
    const ok = validerComposition(couche({ ...style, palette: "oranges", inverser: true }));
    expect(ok.ok && ok.composition.couches[0]!.style).toMatchObject({ methode: "seuils-naturels", palette: "oranges", inverser: true });
    const sans = validerComposition(couche({ ...style, inverser: false }));
    expect(sans.ok && Object.keys(sans.composition.couches[0]!.style)).toEqual(["mode", "indicateurId", "methode", "seuils", "couleurs"]);
    expect(validerComposition(couche({ ...style, palette: "arc-en-ciel" })).ok).toBe(false);
    expect(validerComposition(couche({ ...style, methode: "jenks" })).ok).toBe(false);
    expect(CLASSES_MAX).toBe(10);
  });
});
