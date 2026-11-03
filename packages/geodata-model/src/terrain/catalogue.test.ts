import { describe, expect, it } from "vitest";
import {
  canoniqueTerrain, controlerLevee, controlerTerrain, ETATS_TERRAIN, LIMITES_TERRAIN, texteIdempotence, transitionAdmise, TRANSITIONS_TERRAIN,
  validerDeclarationTerrain, verifierQuota, type DeclarationTerrain, type EnTeteRaster,
} from "./catalogue.js";

/** Fiche synthétique « test seulement » (aucun site réel). */
const FICHE = {
  cle: "test-plan-incline",
  titre: "Plan incliné synthétique",
  producteur: "Fadi (fixture de test)",
  niveau: "leve-local",
  produit: "MNT",
  etiquette: "Données synthétiques — test seulement",
  demonstration: false,
  synthetique: true,
  licence: { nom: "Aucune (fixture)", url: null },
  attribution: "Fixture de test Fadi",
  droits: { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "autorise", partage: "autorise", telechargement: "autorise", export: "autorise" },
  version: { libelle: "v1", doi: null, date: null, url: null },
  acquisition: { methode: "depot" },
  fichier: { nom: "plan.tif", format: "GeoTIFF" },
  crsHorizontal: "EPSG:2056",
  referenceVerticale: { statut: "declaree", code: "EPSG:5728", libelle: "LN02", origine: "documentation", source: "fixture de test" },
  uniteVerticale: "m",
  pasNatif: { valeur: 0.25, unite: "m" },
  nodata: -9999,
  precisionDeclaree: null,
};

const declaration = (surcharge: Record<string, unknown> = {}): DeclarationTerrain => {
  const r = validerDeclarationTerrain({ ...FICHE, ...surcharge });
  if (!r.ok) throw new Error(r.erreurs.join("; "));
  return r.declaration;
};

const ENTETE: EnTeteRaster = {
  format: "GeoTIFF", largeur: 400, hauteur: 300, crsHorizontal: "EPSG:2056", geographique: false, verticalEpsg: null,
  uniteVerticaleEpsg: null, uniteHorizontaleEpsg: 9001, pas: [0.25, 0.25], bornes: [2662500, 1209750, 2662600, 1209825],
  nodata: -9999, typeEchantillon: "flottant", bits: 32, pixel: "aire",
};

describe("cycle de vie d'une version de terrain (TER-D12)", () => {
  it("ne revient jamais en arrière (sauf republication d'une version remplacée) ; rejeté et retiré sont terminaux", () => {
    expect(transitionAdmise("depose", "validation")).toBe(true);
    expect(transitionAdmise("validation", "quarantaine")).toBe(true);
    expect(transitionAdmise("quarantaine", "traitement")).toBe(true);
    expect(transitionAdmise("publie", "remplace")).toBe(true);
    expect(transitionAdmise("publie", "traitement")).toBe(false);
    expect(transitionAdmise("validation", "publie")).toBe(false);
    for (const e of ["rejete", "retire"] as const) expect(TRANSITIONS_TERRAIN[e]).toEqual([]);
    expect(TRANSITIONS_TERRAIN.remplace).toEqual(["publie", "retire"]);
    for (const e of ETATS_TERRAIN) for (const v of TRANSITIONS_TERRAIN[e]) expect(ETATS_TERRAIN).toContain(v);
  });
});

describe("fiche d'un jeu d'altitudes", () => {
  it("accepte une fiche complète", () => expect(validerDeclarationTerrain(FICHE).ok).toBe(true));
  it("exige l'étiquette « test seulement » d'un jeu synthétique et l'étiquette d'un jeu de démonstration", () => {
    const r = validerDeclarationTerrain({ ...FICHE, etiquette: "Plan" });
    expect(r.ok).toBe(false);
    const d = validerDeclarationTerrain({ ...FICHE, synthetique: false, demonstration: true, etiquette: null });
    expect(d.ok).toBe(false);
  });
  it("refuse un chemin dans le nom de fichier, une unité verticale autre que le mètre, un droit illisible", () => {
    const r = validerDeclarationTerrain({ ...FICHE, fichier: { nom: "../x.tif", format: "GeoTIFF" }, uniteVerticale: "ft", droits: { ...FICHE.droits, calcul: "oui" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.join("|")).toMatch(/fichier\.nom.*\|.*uniteVerticale.*|droits\.calcul/);
  });
  it("une référence déclarée doit citer sa source ; une décision ne s'écrit pas dans la fiche", () => {
    expect(validerDeclarationTerrain({ ...FICHE, referenceVerticale: { statut: "declaree", code: "EPSG:3855", libelle: "EGM2008", origine: "documentation", source: "" } }).ok).toBe(false);
    expect(validerDeclarationTerrain({ ...FICHE, referenceVerticale: { statut: "declaree", code: "EPSG:3855", libelle: "EGM2008", origine: "decision", source: "x x x x x" } }).ok).toBe(false);
  });
  it("un téléchargement exige une adresse https et l'empreinte de l'original", () => {
    expect(validerDeclarationTerrain({ ...FICHE, acquisition: { methode: "telechargement", url: "http://exemple.ch/a.tif", empreinte: "a".repeat(64) } }).ok).toBe(false);
    expect(validerDeclarationTerrain({ ...FICHE, acquisition: { methode: "telechargement", url: "https://exemple.ch/a.tif", empreinte: "abc" } }).ok).toBe(false);
    expect(validerDeclarationTerrain({ ...FICHE, acquisition: { methode: "telechargement", url: "https://exemple.ch/a.tif", empreinte: "a".repeat(64) } }).ok).toBe(true);
  });
});

describe("contrôle d'un en-tête contre sa déclaration", () => {
  it("conforme : prêt au traitement, référence verticale de la documentation conservée", () => {
    const v = controlerTerrain(ENTETE, declaration());
    expect(v.etat).toBe("traitement");
    expect(v.motifs).toEqual([]);
    expect(v.referenceVerticale).toMatchObject({ statut: "declaree", code: "EPSG:5728", origine: "documentation" });
  });
  it("référence verticale inconnue (ni fichier ni documentation) → quarantaine, jamais devinée", () => {
    const v = controlerTerrain(ENTETE, declaration({ referenceVerticale: { statut: "non-declaree", indice: "nom de fichier : 4326.3855" } }));
    expect(v.etat).toBe("quarantaine");
    expect(v.motifs.map((m) => m.code)).toEqual(["reference-verticale-inconnue"]);
    expect(v.referenceVerticale).toEqual({ statut: "non-declaree", indice: "nom de fichier : 4326.3855" });
  });
  it("datum incompatible entre fichier et déclaration → quarantaine, aucune conversion", () => {
    const v = controlerTerrain({ ...ENTETE, verticalEpsg: 3855 }, declaration());
    expect(v.etat).toBe("quarantaine");
    expect(v.motifs[0]?.code).toBe("datum-incompatible");
  });
  it("référence lue dans le fichier quand la fiche ne la déclare pas", () => {
    const v = controlerTerrain({ ...ENTETE, verticalEpsg: 5728 }, declaration({ referenceVerticale: { statut: "non-declaree", indice: null } }));
    expect(v.etat).toBe("traitement");
    expect(v.referenceVerticale).toMatchObject({ statut: "declaree", code: "EPSG:5728", origine: "fichier" });
  });
  it("NoData : écart ou absence → quarantaine ; NoData de la fiche retenu si le fichier n'en a pas", () => {
    expect(controlerTerrain({ ...ENTETE, nodata: 0 }, declaration()).motifs.map((m) => m.code)).toEqual(["nodata-different"]);
    expect(controlerTerrain({ ...ENTETE, nodata: null }, declaration({ nodata: null })).motifs.map((m) => m.code)).toEqual(["nodata-inconnu"]);
    const v = controlerTerrain({ ...ENTETE, nodata: null }, declaration());
    expect(v.etat).toBe("traitement");
    expect(v.nodata).toBe(-9999);
  });
  it("pas du fichier différent du pas déclaré → quarantaine (une grille fine ne vaut pas précision)", () => {
    expect(controlerTerrain({ ...ENTETE, pas: [0.05, 0.05] }, declaration()).motifs.map((m) => m.code)).toEqual(["pas-different"]);
  });
  it("pas en secondes d'arc pour un repère géographique", () => {
    const g: EnTeteRaster = { ...ENTETE, crsHorizontal: "EPSG:4326", geographique: true, uniteHorizontaleEpsg: null, pas: [1 / 3600, 1 / 3600], bornes: [-7.2, 33.4, -7.0, 33.6] };
    expect(controlerTerrain(g, declaration({ crsHorizontal: "EPSG:4326", pasNatif: { valeur: 1, unite: "arcsec" } })).etat).toBe("traitement");
  });
  it("repère différent → quarantaine ; sans géoréférence, emprise incohérente, valeurs non signées, trop grand → rejet", () => {
    expect(controlerTerrain({ ...ENTETE, crsHorizontal: "EPSG:21781" }, declaration()).etat).toBe("quarantaine");
    expect(controlerTerrain({ ...ENTETE, crsHorizontal: null }, declaration()).etat).toBe("rejete");
    expect(controlerTerrain({ ...ENTETE, bornes: [10, 10, 5, 5] }, declaration()).etat).toBe("rejete");
    expect(controlerTerrain({ ...ENTETE, typeEchantillon: "entier-non-signe" }, declaration()).etat).toBe("rejete");
    expect(controlerTerrain({ ...ENTETE, largeur: 30_000, hauteur: 30_000 }, declaration()).motifs.map((m) => m.code)).toContain("trop-grand");
    expect(LIMITES_TERRAIN.cellules).toBeLessThan(30_000 * 30_000);
  });
});

describe("levée de quarantaine (TER-D13)", () => {
  const inconnue = controlerTerrain(ENTETE, declaration({ referenceVerticale: { statut: "non-declaree", indice: null } })).motifs;
  it("exige une référence sourcée pour une référence inconnue et un motif écrit", () => {
    expect(controlerLevee(inconnue, { referenceVerticale: null, motif: "Vu avec le producteur" }).length).toBeGreaterThan(0);
    expect(controlerLevee(inconnue, { referenceVerticale: { code: "EPSG:3855", libelle: "EGM2008", source: "courriel du producteur" }, motif: "court" }).length).toBeGreaterThan(0);
    expect(controlerLevee(inconnue, { referenceVerticale: { code: "EPSG:3855", libelle: "EGM2008", source: "réponse écrite du producteur du 3 novembre" }, motif: "Référence confirmée par le producteur" })).toEqual([]);
  });
  it("une version rejetée ne se lève pas", () => {
    const rejet = controlerTerrain({ ...ENTETE, crsHorizontal: null }, declaration()).motifs;
    expect(controlerLevee(rejet, { referenceVerticale: null, motif: "Je veux la publier quand même" }).length).toBeGreaterThan(0);
  });
});

describe("idempotence et quota", () => {
  it("texte canoniqueTerrain indépendant de l'ordre des clés et des entrées", () => {
    expect(canoniqueTerrain({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canoniqueTerrain({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(texteIdempotence("import", ["b", "a"], { x: 1 })).toBe(texteIdempotence("import", ["a", "b"], { x: 1 }));
    expect(texteIdempotence("import", ["a"], { x: 1 })).not.toBe(texteIdempotence("import", ["a"], { x: 2 }));
  });
  it("refuse un ajout au-delà du quota, sans rien effacer", () => {
    expect(verifierQuota(50, 10, 60)).toEqual({ ok: true, reste: 0 });
    expect(verifierQuota(50, 11, 60).ok).toBe(false);
    expect(verifierQuota(0, 1, 0).ok).toBe(false);
  });
});
