import { describe, expect, it } from "vitest";
import { COMPOSITION_INITIALE, validerComposition } from "@parcours/geodata-model";
import { ajouterCouche, basculerEtiquettes, basculerToutesEtiquettes, basculerVisibilite, etiquettesToutesAffichees, definirOpacite, deplacerCouche, etatDepuis, retirerCouche, sansColorationThematique } from "./composition-ops";

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
});
