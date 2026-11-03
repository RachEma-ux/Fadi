/**
 * Fixtures synthétiques du terrain — TEST SEULEMENT (plan v1.0, § Verification : « synthetic fixtures must be labelled
 * test-only »). Petits GeoTIFF écrits à la volée dans un dossier temporaire : plan incliné connu, NoData, clés de
 * référence verticale au choix. Ne représentent aucun site ; jamais livrés ni importés hors des tests.
 */
import { writeFileSync } from "node:fs";
import { writeArrayBuffer } from "geotiff";

export const ETIQUETTE_TEST = "Données synthétiques — test seulement";

export interface OptionsFixture {
  readonly largeur?: number;
  readonly hauteur?: number;
  /** Pas en mètres (repère projeté EPSG:2056 par défaut). */
  readonly pas?: number;
  readonly epsg?: number;
  readonly verticalEpsg?: number | null;
  readonly nodata?: number | null;
  /** Valeur de la cellule (colonne, ligne) ; par défaut un plan incliné z = 500 + 0,1 × x (mètres). */
  readonly valeur?: (col: number, lig: number) => number;
}

/** Écrit un GeoTIFF Float32 synthétique et renvoie ses octets. */
export function ecrireFixture(chemin: string, o: OptionsFixture = {}): Buffer {
  const largeur = o.largeur ?? 40;
  const hauteur = o.hauteur ?? 30;
  const pas = o.pas ?? 0.25;
  const valeurs = new Float32Array(largeur * hauteur);
  for (let l = 0; l < hauteur; l++) for (let c = 0; c < largeur; c++) valeurs[l * largeur + c] = o.valeur ? o.valeur(c, l) : 500 + 0.1 * c * pas;
  const meta: Record<string, unknown> = {
    width: largeur,
    height: hauteur,
    ModelPixelScale: [pas, pas, 0],
    ModelTiepoint: [0, 0, 0, 2662500, 1210500, 0],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: o.epsg ?? 2056,
    ProjLinearUnitsGeoKey: 9001,
    ...(o.verticalEpsg ? { VerticalCSTypeGeoKey: o.verticalEpsg, VerticalUnitsGeoKey: 9001 } : {}),
    ...(o.nodata === null ? {} : { GDAL_NODATA: `${o.nodata ?? -9999}\0` }),
  };
  const octets = Buffer.from(writeArrayBuffer(valeurs, meta as Parameters<typeof writeArrayBuffer>[1]));
  writeFileSync(chemin, octets);
  return octets;
}

/** Fiche synthétique conforme à la fixture par défaut (référence verticale déclarée par une « documentation » fictive). */
export function ficheSynthetique(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cle: "test-plan-incline",
    titre: "Plan incliné synthétique",
    producteur: "Fadi (fixture de test)",
    niveau: "leve-local",
    produit: "MNT",
    etiquette: ETIQUETTE_TEST,
    demonstration: false,
    synthetique: true,
    licence: { nom: "Aucune (fixture de test)", url: null },
    attribution: "Fixture de test Fadi",
    droits: { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "autorise", partage: "autorise", telechargement: "autorise", export: "autorise" },
    version: { libelle: "v1", doi: null, date: null, url: null },
    acquisition: { methode: "depot" },
    fichier: { nom: "plan.tif", format: "GeoTIFF" },
    crsHorizontal: "EPSG:2056",
    referenceVerticale: { statut: "declaree", code: "EPSG:5728", libelle: "Référence fictive de test", origine: "documentation", source: "fixture de test, aucune source réelle" },
    uniteVerticale: "m",
    pasNatif: { valeur: 0.25, unite: "m" },
    nodata: null,
    precisionDeclaree: null,
    ...surcharge,
  };
}
