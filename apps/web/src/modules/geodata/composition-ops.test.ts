import { describe, expect, it } from "vitest";
import { COMPOSITION_INITIALE, couleursPalette, validerComposition } from "@parcours/geodata-model";
import { reclasser, recolorerClasse, ajouterCouche, basculerEtiquettes, basculerToutesEtiquettes, basculerVisibilite, etiquettesToutesAffichees, definirOpacite, deplacerCouche, etatDepuis, lireSeuilsManuels, retirerCouche, styleThematique } from "./composition-ops";

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
  it("style thématique : seuils sans les absences, une couleur par classe ; seuils manuels croissants", () => {
    const vs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => ({ valeur: v, motifAbsence: null }) as const);
    const s = styleThematique("i", [...vs, { valeur: null, motifAbsence: "non-publiee" }], "intervalles-egaux", 3);
    expect(s).toMatchObject({ mode: "thematique", seuils: [3, 6] });
    if (s.mode === "thematique") expect(s.couleurs).toHaveLength(3);
    expect(lireSeuilsManuels("10 ; 20,5 ; 50")).toEqual([10, 20.5, 50]);
    expect(lireSeuilsManuels("20 ; 10")).toBeNull();
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
  it("classification (D-GD-25) : méthode, classes, palette, inversion ; seuils manuels gardés ; couleur d'une classe ; composition valide", () => {
    const vs = [1, 2, 3, 4, 50, 51, 52, 200, 201, 202].map((v) => ({ valeur: v, motifAbsence: null }) as const);
    const base = styleThematique("i", vs);
    if (base.mode !== "thematique") throw new Error("thématique attendu");
    expect("palette" in base).toBe(false);
    const jenks = reclasser(base, vs, { methode: "seuils-naturels", classes: 3 });
    expect(jenks.seuils).toEqual([50, 200]);
    expect(jenks.couleurs).toEqual(couleursPalette("bleu-violet", 3));
    const verts = reclasser(jenks, vs, { palette: "verts", inverser: true });
    expect(verts).toMatchObject({ palette: "verts", inverser: true, seuils: [50, 200], couleurs: couleursPalette("verts", 3, true) });
    expect("inverser" in reclasser(verts, vs, { inverser: false })).toBe(false);
    const manuel = reclasser({ ...verts, methode: "manuel", seuils: [10, 20, 30] }, vs, {});
    expect(manuel.seuils).toEqual([10, 20, 30]);
    expect(manuel.couleurs).toHaveLength(4);
    const recolore = recolorerClasse(verts, 1, "#ABCDEF");
    expect(recolore.couleurs).toEqual([verts.couleurs[0], "#abcdef", verts.couleurs[2]]);
    expect(recolorerClasse(verts, 7, "#abcdef")).toBe(verts);
    expect(recolorerClasse(verts, 0, "rouge")).toBe(verts);
    const c = { ...COMPOSITION_INITIALE, couches: [{ coucheId: "a", versionId: "v", visible: true, opacite: 1, style: recolore, filtre: null }] };
    expect(validerComposition(c).ok).toBe(true);
  });
});
