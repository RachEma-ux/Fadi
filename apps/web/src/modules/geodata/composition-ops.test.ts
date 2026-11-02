import { describe, expect, it } from "vitest";
import { COMPOSITION_INITIALE, validerComposition } from "@parcours/geodata-model";
import { basculerTheme, etatTheme, ajouterCouche, basculerRegroupement, basculerTousRegroupements, regroupementsTousActifs, basculerEtiquettes, basculerToutesEtiquettes, basculerVisibilite, etiquettesToutesAffichees, definirOpacite, deplacerCouche, etatDepuis, retirerCouche, sansColorationThematique } from "./composition-ops";

const simple = { mode: "simple", couleur: "#2b8cbe" } as const;

describe("composition locale de GeoData", () => {
  it("ajoute sans doublon, retire, déplace, bascule, borne l'opacité ; le résultat reste valide", () => {
    let c = ajouterCouche(COMPOSITION_INITIALE, "a", "va", simple);
    c = ajouterCouche(c, "b", "vb", simple);
    expect(ajouterCouche(c, "a", "va", simple)).toBe(c);
    expect(deplacerCouche(c, "a", 1).couches.map((k) => k.coucheId)).toEqual(["b", "a"]);
    expect(deplacerCouche(c, "b", 1)).toBe(c);
    expect(basculerVisibilite(c, "a").couches[0]!.visible).toBe(false);
    expect(definirOpacite(c, "a", 1.7).couches[0]!.opacite).toBe(1);
    expect(retirerCouche(c, "a").couches.map((k) => k.coucheId)).toEqual(["b"]);
    expect(validerComposition(c).ok).toBe(true);
  });
  it("un déplacement de caméra rend la carte « non enregistrée », jamais enregistrée à l'insu", () => {
    const deplacee = { ...COMPOSITION_INITIALE, camera: { ...COMPOSITION_INITIALE.camera, zoom: 7 } };
    expect(etatDepuis(COMPOSITION_INITIALE, null).etat).toBe("nouvelle");
    expect(etatDepuis(COMPOSITION_INITIALE, COMPOSITION_INITIALE).etat).toBe("enregistree");
    expect(etatDepuis(deplacee, COMPOSITION_INITIALE).etat).toBe("non-enregistree");
  });
  it("D-GD-32 : un ancien style thématique enregistré revient à la couleur unie ; une composition sans en est rendue telle quelle", () => {
    const c = ajouterCouche(ajouterCouche(COMPOSITION_INITIALE, "a", "va", simple), "b", "vb", { mode: "thematique", indicateurId: "i", methode: "quantiles", seuils: [1, 2], couleurs: ["#111111", "#222222", "#333333"] });
    const sans = sansColorationThematique(c);
    expect(sans.couches.map((k) => k.style.mode)).toEqual(["simple", "simple"]);
    expect(sans.couches[1]!.style).toEqual(simple);
    expect(sansColorationThematique(sans)).toBe(sans);
    expect(validerComposition(sans).ok).toBe(true);
    // Rien d'autre ne change : visibilité, opacité, filtre, libellés et ordre des couches sont conservés.
    const avecLibelles = basculerEtiquettes(definirOpacite(c, "b", 0.4), "b");
    const normalisee = sansColorationThematique(avecLibelles);
    expect(normalisee.couches.map((k) => k.coucheId)).toEqual(["a", "b"]);
    expect(normalisee.couches[1]).toMatchObject({ visible: true, opacite: 0.4, filtre: null, etiquettes: true, style: simple });
    expect(normalisee.couches[0]).toBe(avecLibelles.couches[0]);
    expect(sansColorationThematique(COMPOSITION_INITIALE)).toBe(COMPOSITION_INITIALE);
  });
  it("libellés (D-GD-24) : bascule par couche ; bouton : tout afficher si l'une manque, sinon tout masquer (rasters et couches masquées exclus)", () => {
    let c = ajouterCouche(ajouterCouche(ajouterCouche(COMPOSITION_INITIALE, "a", "va", simple), "b", "vb", simple), "r", "vr", { mode: "raster" });
    const vect = new Set(["a", "b"]);
    expect(basculerEtiquettes(c, "a").couches[0]!.etiquettes).toBe(true);
    expect("etiquettes" in basculerEtiquettes(basculerEtiquettes(c, "a"), "a").couches[0]!).toBe(false);
    c = basculerEtiquettes(c, "a");
    expect(etiquettesToutesAffichees(c, vect)).toBe(false);
    const toutes = basculerToutesEtiquettes(c, vect);
    expect(toutes.couches.map((k) => !!k.etiquettes)).toEqual([true, true, false]);
    expect(etiquettesToutesAffichees(toutes, vect)).toBe(true);
    expect(basculerToutesEtiquettes(toutes, vect).couches.some((k) => "etiquettes" in k)).toBe(false);
    const bCachee = basculerVisibilite(c, "b");
    // « b » masquée ne compte pas : « a » seule a déjà ses libellés, le bouton les masque.
    expect(basculerToutesEtiquettes(bCachee, vect).couches.some((k) => "etiquettes" in k)).toBe(false);
    const seulRaster = basculerVisibilite(basculerVisibilite(c, "a"), "b");
    expect(basculerToutesEtiquettes(seulRaster, vect)).toBe(seulRaster);
    expect(basculerToutesEtiquettes(COMPOSITION_INITIALE, vect)).toBe(COMPOSITION_INITIALE);
    expect(validerComposition(toutes).ok).toBe(true);
  });
  it("regroupement des points (D-GD-40) : bascule par couche et pour toutes les couches de points visibles", () => {
    let c = ajouterCouche(ajouterCouche(ajouterCouche(COMPOSITION_INITIALE, "a", "va", simple), "b", "vb", simple), "p", "vp", simple);
    const points = new Set(["a", "b"]);
    expect(basculerRegroupement(c, "a").couches[0]!.regrouper).toBe(true);
    expect("regrouper" in basculerRegroupement(basculerRegroupement(c, "a"), "a").couches[0]!).toBe(false);
    c = basculerRegroupement(c, "a");
    expect(regroupementsTousActifs(c, points)).toBe(false);
    const tous = basculerTousRegroupements(c, points);
    expect(tous.couches.map((k) => !!k.regrouper)).toEqual([true, true, false]);
    expect(regroupementsTousActifs(tous, points)).toBe(true);
    expect(basculerTousRegroupements(tous, points).couches.some((k) => "regrouper" in k)).toBe(false);
    expect(basculerTousRegroupements(c, new Set())).toBe(c);
  });
  it("pastilles de thème (D-GD-48) : afficher ajoute les couches absentes, masquer garde les couches masquées", () => {
    const theme = [{ id: "s1", versionId: "v1", style: simple }, { id: "s2", versionId: "v2", style: simple }];
    let c = ajouterCouche(COMPOSITION_INITIALE, "s1", "v1", simple);
    c = basculerVisibilite(c, "s1");
    expect(etatTheme(c, theme)).toBe("absent");
    const affiche = basculerTheme(c, theme);
    expect(affiche.omises).toBe(0);
    expect(affiche.composition.couches.map((k) => [k.coucheId, k.visible])).toEqual([["s1", true], ["s2", true]]);
    expect(etatTheme(affiche.composition, theme)).toBe("affiche");
    const masque = basculerTheme(affiche.composition, theme).composition;
    expect(masque.couches.map((k) => [k.coucheId, k.visible])).toEqual([["s1", false], ["s2", false]]);
    expect(etatTheme(basculerVisibilite(masque, "s2"), theme)).toBe("partiel");
  });
  it("pastilles de thème : au-delà de 20 couches, les couches en trop sont comptées, jamais ajoutées", () => {
    let c = COMPOSITION_INITIALE;
    for (let i = 0; i < 19; i++) c = ajouterCouche(c, `x${i}`, `v${i}`, simple);
    const r = basculerTheme(c, [{ id: "a", versionId: "va", style: simple }, { id: "b", versionId: "vb", style: simple }]);
    expect(r.composition.couches).toHaveLength(20);
    expect(r.omises).toBe(1);
    // Thème tronqué par la limite : affiché, donc masquable au clic suivant (jamais bloqué en « partiel »).
    expect(etatTheme(r.composition, [{ id: "a" }, { id: "b" }])).toBe("affiche");
    const masque = basculerTheme(r.composition, [{ id: "a", versionId: "va", style: simple }, { id: "b", versionId: "vb", style: simple }]);
    expect(masque.composition.couches.find((k) => k.coucheId === "a")?.visible).toBe(false);
  });
});

describe("coloration selon l'indicateur actif (D-GD-55)", () => {
  it("5 classes par quantiles des valeurs lues, gris pour l'absence (jamais zéro), légende avec effectifs", async () => {
    const { colorationIndicateur } = await import("./composition-ops");
    const vs = new Map<string, { valeur: number; motifAbsence: null } | { valeur: null; motifAbsence: "non-publiee" }>(
      [...Array.from({ length: 10 }, (_, i) => [`q${i}`, { valeur: (i + 1) * 1000, motifAbsence: null }] as const), ["absent", { valeur: null, motifAbsence: "non-publiee" }]],
    );
    const c = colorationIndicateur(vs, "DH/m²")!;
    expect(c.couleurs.size).toBe(11);
    expect(c.couleurs.get("absent")).toBe("#9e9e9e");
    expect(c.couleurs.get("q0")).not.toBe(c.couleurs.get("q9"));
    const classes = c.entrees.filter((e) => e.classe !== "absente");
    expect(classes).toHaveLength(5);
    expect(classes.reduce((n, e) => n + e.effectif, 0)).toBe(10);
    expect(c.entrees.find((e) => e.classe === "absente")?.effectif).toBe(1);
    expect(classes[0]!.libelle).toMatch(/DH\/m²/);
  });
  it("moins de deux valeurs présentes : aucune coloration", async () => {
    const { colorationIndicateur } = await import("./composition-ops");
    expect(colorationIndicateur(new Map([["a", { valeur: 5, motifAbsence: null }]]), null)).toBeNull();
  });
});
