import { describe, expect, it } from "vitest";
import { COMPOSITION_INITIALE, validerComposition } from "@parcours/geodata-model";
import { ajouterCouche, basculerVisibilite, definirOpacite, deplacerCouche, etatDepuis, lireSeuilsManuels, retirerCouche, styleThematique } from "./composition-ops";

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
});
