import { describe, expect, it } from "vitest";
import { bornerPosition, HAUTEUR_UTILE_MIN, ICONES, POSITION_PAR_DEFAUT, RACCOURCIS_BARRE } from "./BarreOutilsCarte";

describe("barre d'outils flottante GeoData", () => {
  it("position par défaut : à droite, en haut", () => expect(POSITION_PAR_DEFAUT).toEqual({ droite: 10, haut: 10 }));
  it("bornée à la carte : jamais hors champ, même sur une petite carte", () => {
    const carte = { largeur: 800, hauteur: 600 }, barre = { largeur: 40, hauteur: 500 };
    expect(bornerPosition({ droite: -50, haut: -20 }, carte, barre)).toEqual({ droite: 4, haut: 4 });
    expect(bornerPosition({ droite: 2000, haut: 2000 }, carte, barre)).toEqual({ droite: 756, haut: 96 });
    expect(bornerPosition({ droite: 30, haut: 50 }, { largeur: 30, hauteur: 300 }, barre)).toEqual({ droite: 4, haut: 4 });
  });
  it("colonne déjà réduite : la position garde toujours HAUTEUR_UTILE_MIN visibles (jamais une colonne de hauteur nulle)", () => {
    const carte = { largeur: 400, hauteur: 600 };
    // Barre mesurée à 20 px parce que sa hauteur maximale l'a déjà écrasée : la position est ramenée, pas conservée.
    const r = bornerPosition({ droite: 10, haut: 590 }, carte, { largeur: 40, hauteur: 20 });
    expect(r.haut).toBe(600 - HAUTEUR_UTILE_MIN - 4);
    expect(carte.hauteur - r.haut - 4).toBeGreaterThanOrEqual(HAUTEUR_UTILE_MIN);
  });
  it("chaque outil a sa propre icône et chaque commande sa propre touche (lecture de l'emprise, D-GD-40)", () => {
    const traces = Object.values(ICONES);
    expect(new Set(traces).size).toBe(traces.length);
    const touches = Object.values(RACCOURCIS_BARRE);
    expect(new Set(touches).size).toBe(touches.length);
    expect(RACCOURCIS_BARRE).toMatchObject({ synthese: "Alt+V", regrouper: "Alt+G", lien: "Alt+K" });
  });
  it("terrain (TER-05) : bouton Terrain de la carte, altitude au point et profil (commandes du panneau), chacun son icône et sa touche", async () => {
    const { ICONES_TERRAIN, RACCOURCIS_TERRAIN } = await import("./Terrain");
    const { ICONES_BARRE_BAS, RACCOURCIS_BARRE_BAS } = await import("./BarreBas");
    expect(RACCOURCIS_TERRAIN).toEqual({ terrain: "Alt+H", altitude: "Alt+O", profil: "Alt+U" });
    const icones = [...Object.values(ICONES), ...Object.values(ICONES_BARRE_BAS), ...Object.values(ICONES_TERRAIN)];
    expect(new Set(icones).size).toBe(icones.length);
    const touches = [...Object.values(RACCOURCIS_BARRE), ...Object.values(RACCOURCIS_BARRE_BAS), ...Object.values(RACCOURCIS_TERRAIN)];
    expect(new Set(touches).size).toBe(touches.length);
  });
});

describe("barre du bas sur téléphone (D-GD-52)", () => {
  it("chaque commande a sa propre icône et sa propre touche, distinctes de la barre d'outils", async () => {
    const { ICONES_BARRE_BAS, RACCOURCIS_BARRE_BAS } = await import("./BarreBas");
    const { ICONES, RACCOURCIS_BARRE } = await import("./BarreOutilsCarte");
    const icones = [...Object.values(ICONES_BARRE_BAS), ...Object.values(ICONES)];
    expect(new Set(icones).size).toBe(icones.length);
    const touches = [...Object.values(RACCOURCIS_BARRE_BAS), ...Object.values(RACCOURCIS_BARRE)];
    expect(new Set(touches).size).toBe(touches.length);
  });
});

describe("Emplacements Projets (27 novembre 2026)", () => {
  it("bouton de la mini-barre : sa propre icône et sa propre touche, distinctes de toutes les barres de la carte", async () => {
    const { ICONE_EMPLACEMENTS, RACCOURCI_EMPLACEMENTS, adressePlanche } = await import("./Emplacements");
    const { ICONES_BARRE_BAS, RACCOURCIS_BARRE_BAS } = await import("./BarreBas");
    const { ICONES_TERRAIN, RACCOURCIS_TERRAIN } = await import("./Terrain");
    const icones = [...Object.values(ICONES), ...Object.values(ICONES_BARRE_BAS), ...Object.values(ICONES_TERRAIN), ICONE_EMPLACEMENTS];
    expect(new Set(icones).size).toBe(icones.length);
    // Touches déjà prises sur la carte : barres, terrain, et Alt+S (plan / satellite), Alt+Z (zone), Alt+T (thèmes), Alt+P (fiche).
    const prises = [...Object.values(RACCOURCIS_BARRE), ...Object.values(RACCOURCIS_BARRE_BAS), ...Object.values(RACCOURCIS_TERRAIN), "Alt+S", "Alt+Z", "Alt+T", "Alt+P", "Alt+A"];
    expect(prises).not.toContain(RACCOURCI_EMPLACEMENTS);
    expect(adressePlanche("gdempl_1")).toBe("/sandbox?emplacement-geodata=gdempl_1");
  });
});

describe("groupes de la colonne (P5, D3 et D4)", () => {
  it("lettres d'accès uniques dans chaque groupe ; chaque outil rangé a son icône propre", async () => {
    const { LETTRES_GROUPES, ICONES } = await import("./BarreOutilsCarte");
    for (const g of Object.values(LETTRES_GROUPES)) { const l = Object.values(g); expect(new Set(l).size).toBe(l.length); }
    expect(Object.keys(LETTRES_GROUPES.mesurer)).toEqual(["distance", "surface", "zone", "annotation"]);
    const icones = Object.values(ICONES);
    expect(new Set(icones).size).toBe(icones.length);
  });
});
