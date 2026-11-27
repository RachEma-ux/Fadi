/**
 * Cas 4 du catalogue, étape 2 : point de base du projet (D6-F8-001). Décalage déclaré, aucune projection supposée ;
 * H vient du niveau de référence ; export « projetées » refusé avec son motif sans l'un ou l'autre.
 */
import { describe, expect, it } from "vitest";
import { lireModelePlanche } from "./delta.js";
import { disponibiliteCoordonnees, MOTIFS_COORDONNEES, modeleAExporter } from "./echanges-coordonnees.js";
import { REGLAGES_DEFAUT } from "./annotations.js";
import { type Modele, ajouterRectangle, modeleVide, modifierAnnotations } from "./geometrie-libre.js";
import { controleAllerRetour, depuisProjete, estPointDeBase, lirePointDeBase, texteCoordonnee, versProjete, type PointDeBase } from "./point-de-base.js";
import { v3 } from "./vecteur.js";

const L93: PointDeBase = { e: 652410.25, n: 6862175.8, systeme: "EPSG:2154", systemeVertical: "NGF-IGN69", rotation: 0 };
const avecPoint = (m: Modele, p: PointDeBase): Modele => modifierAnnotations(m, (a) => void (a.reglages = { ...(a.reglages ?? REGLAGES_DEFAUT), pointDeBase: p })).modele;

describe("point de base du projet", () => {
  it("lit la saisie (virgule, espaces de groupement) et nomme le premier champ refusé", () => {
    expect(lirePointDeBase({ e: "652 410,250", n: "6 862 175.8", systeme: " EPSG:2154 ", systemeVertical: "", rotation: "-10" })).toEqual({ point: { e: 652410.25, n: 6862175.8, systeme: "EPSG:2154", rotation: 350 } });
    expect(lirePointDeBase({ e: "", n: "1", systeme: "EPSG:2154", systemeVertical: "", rotation: "" })).toEqual({ erreur: "e" });
    expect(lirePointDeBase({ e: "1", n: "x", systeme: "EPSG:2154", systemeVertical: "", rotation: "" })).toEqual({ erreur: "n" });
    expect(lirePointDeBase({ e: "1", n: "2", systeme: " ", systemeVertical: "", rotation: "" })).toEqual({ erreur: "systeme" });
    expect(lirePointDeBase({ e: "1", n: "2", systeme: "EPSG:2154", systemeVertical: "", rotation: "nord" })).toEqual({ erreur: "rotation" });
  });

  it("ajoute le décalage déclaré ; H seulement avec un niveau de référence", () => {
    expect(versProjete(L93, v3(5, 5, 1), 375.2)).toEqual({ e: 652415.25, n: 6862180.8, h: 376.2 });
    expect(versProjete(L93, v3(5, 5, 1), null).h).toBeNull();
    // Rotation 90° : le nord du quadrillage est l'axe rouge +x, l'est est −y.
    const r = versProjete({ ...L93, rotation: 90 }, v3(1, 0, 0), 0);
    expect(r.e).toBeCloseTo(652410.25, 9);
    expect(r.n).toBeCloseTo(6862176.8, 9);
    expect(depuisProjete(L93, { e: 1, n: 1, h: 1 }, null)).toBeNull();
  });

  it("contrôle d'aller-retour : écart nul au millimètre sur des coordonnées Lambert", () => {
    for (const rotation of [0, 17.5, 233]) {
      const c = controleAllerRetour({ ...L93, rotation }, { e: 652415.25, n: 6862180.8, h: 376.2 }, 375.2)!;
      expect(c.ecart).toBeLessThan(1e-6);
    }
    expect(controleAllerRetour(L93, { e: 652415.25, n: 6862180.8, h: 376.2 }, 375.2)!.dessin.x).toBeCloseTo(5, 9);
  });

  it("export « projetées » : refus motivé sans point de base ou sans niveau de référence, sinon coordonnées E, N, H", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    expect(disponibiliteCoordonnees(m0, "projete", "obj", 375.2)).toBe(MOTIFS_COORDONNEES.projete);
    const m = avecPoint(m0, L93);
    expect(disponibiliteCoordonnees(m, "projete", "obj", null)).toBe(MOTIFS_COORDONNEES.projeteReference);
    const r = modeleAExporter(m, "projete", "obj", null, 375.2);
    if (!r.ok) throw new Error(r.motif);
    const xs = Object.values(r.modele.racine.sommets).map((s) => s.position);
    expect(Math.min(...xs.map((p) => p.x))).toBeCloseTo(652410.25, 6);
    expect(Math.max(...xs.map((p) => p.y))).toBeCloseTo(6862178.8, 6);
    expect(xs.every((p) => Math.abs(p.z - 375.2) < 1e-9)).toBe(true);
    // Le document n'est pas touché.
    expect(Math.min(...Object.values(m.racine.sommets).map((s) => s.position.x))).toBe(0);
  });

  it("persistance validée ; écriture groupée des coordonnées", () => {
    const m = avecPoint(modeleVide(), L93);
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))?.annotations?.reglages?.pointDeBase).toEqual(L93);
    const faux = JSON.parse(JSON.stringify(m));
    faux.annotations.reglages.pointDeBase.rotation = 400;
    expect(lireModelePlanche(faux)).toBeNull();
    expect(estPointDeBase({ e: 1, n: 2, systeme: "", rotation: 0 })).toBe(false);
    expect(texteCoordonnee(652410.25)).toBe("652 410,250");
    expect(texteCoordonnee(-1234.5, ".")).toBe("−1 234.500");
  });
});
