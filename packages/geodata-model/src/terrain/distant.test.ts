// Fond mondial à la demande (TER-09) : adresses fermées, dalles, plages, LRU, budget, fiches distantes. Logique pure.
import { describe, expect, it } from "vitest";
import { validerDeclarationTerrain, type AcquisitionDistante } from "./catalogue.js";
import {
  adresseAutorisee, adresseDistante, blocsDePlage, CompteurBudget, dallesEmprise, empriseDalle, grilleMosaique, latitudeMercator, lireContentRange, lirePlage,
  memeSource, nomDalle, planEviction, suitesContigues, zoomMinimalTuiles,
} from "./distant.js";

const GLO: AcquisitionDistante = {
  methode: "distant", hote: "copernicus-dem-30m.s3.amazonaws.com",
  modele: "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{lat}_00_{lon}_00_DEM/Copernicus_DSM_COG_10_{lat}_00_{lon}_00_DEM.tif",
  dalles: "1deg", dalleReference: "N33W008", emprise: { ouest: -180, sud: -90, est: 180, nord: 90 }, conditions: { texte: "Licence GLO-30 Public", source: "https://registry.opendata.aws/copernicus-dem/" },
};
const GEDTM: AcquisitionDistante = {
  methode: "distant", hote: "s3.opengeohub.org", modele: "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif",
  dalles: null, dalleReference: null, emprise: { ouest: -180, sud: -65, est: 180, nord: 85 }, conditions: { texte: "CC BY 4.0", source: "https://zenodo.org/records/18887460" },
};
const SOURCES = [{ cle: "copernicus-glo30-mondial", acquisition: GLO }, { cle: "gedtm30-v1-2-mondial", acquisition: GEDTM }];

describe("dalles 1° × 1°", () => {
  it("nomme la dalle du coin sud-ouest (Benslimane, Lucerne, Paris, hémisphère sud)", () => {
    expect(nomDalle(-7.10621, 33.5315)).toBe("N33W008");
    expect(nomDalle(8.31, 47.05)).toBe("N47E008");
    expect(nomDalle(2.35, 48.85)).toBe("N48E002");
    expect(nomDalle(-58.4, -34.6)).toBe("S35W059");
    expect(empriseDalle("S35W059")).toEqual([-59, -35, -58, -34]);
    expect(() => nomDalle(200, 0)).toThrow();
  });

  it("construit l'adresse de la dalle depuis le modèle de la fiche, jamais hors de l'emprise déclarée", () => {
    expect(adresseDistante(GLO, "N47E008")).toBe("https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N47_00_E008_00_DEM/Copernicus_DSM_COG_10_N47_00_E008_00_DEM.tif");
    expect(adresseDistante({ ...GLO, emprise: { ouest: 0, sud: 40, est: 10, nord: 50 } }, "N33W008")).toBeNull();
    expect(adresseDistante(GEDTM, null)).toBe(GEDTM.modele);
    expect(adresseDistante(GEDTM, "N33W008")).toBeNull();
  });

  it("liste les dalles d'une emprise, bornées par le budget", () => {
    expect(dallesEmprise(GLO, [-7.5, 33.2, -6.5, 33.9], 4)).toEqual(["N33W008", "N33W007"]);
    expect(dallesEmprise(GEDTM, [8, 47, 8.1, 47.1], 4)).toEqual([null]);
    expect(dallesEmprise(GEDTM, [8, 86, 8.1, 87], 4)).toEqual([]);
    expect(() => dallesEmprise(GLO, [0, 0, 10, 10], 16)).toThrow(/budget/);
  });
});

describe("liste fermée des adresses distantes", () => {
  it("admet seulement une adresse identique à celle construite depuis une fiche", () => {
    expect(adresseAutorisee(SOURCES, adresseDistante(GLO, "N47E008")!)).toEqual({ cle: "copernicus-glo30-mondial", dalle: "N47E008" });
    expect(adresseAutorisee(SOURCES, GEDTM.modele)).toEqual({ cle: "gedtm30-v1-2-mondial", dalle: null });
  });

  it("refuse un hôte non autorisé, un autre chemin, une requête, un port, http, des dalles incohérentes", () => {
    for (const url of [
      "https://exemple.test/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif",
      "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_std_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif",
      `${GEDTM.modele}?x=1`, GEDTM.modele.replace("s3.opengeohub.org", "s3.opengeohub.org:8443"), GEDTM.modele.replace("https:", "http:"),
      "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N47_00_E008_00_DEM/Copernicus_DSM_COG_10_N48_00_E008_00_DEM.tif",
      "https://copernicus-dem-30m.s3.amazonaws.com/../etc/passwd", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd",
    ]) expect(adresseAutorisee(SOURCES, url)).toBeNull();
  });
});

describe("plages et blocs", () => {
  it("lit une plage unique et un Content-Range cohérent", () => {
    expect(lirePlage("bytes=0-65535")).toEqual({ debut: 0, fin: 65535 });
    expect(lirePlage("bytes=0-1,4-5")).toBeNull();
    expect(lirePlage("bytes=10-")).toBeNull();
    expect(lireContentRange("bytes 0-99/1000", { debut: 0, fin: 99 })).toEqual({ fin: 99, total: 1000 });
    expect(lireContentRange("bytes 5-99/1000", { debut: 0, fin: 99 })).toBeNull();
    expect(lireContentRange("bytes 0-99/50", { debut: 0, fin: 99 })).toBeNull();
  });

  it("découpe en blocs fixes et regroupe les manquants en suites contiguës bornées", () => {
    expect(blocsDePlage(0, 262143, 262144, null)).toEqual([0]);
    expect(blocsDePlage(262000, 524300, 262144, null)).toEqual([0, 1, 2]);
    expect(blocsDePlage(0, 10_000_000, 262144, 300_000)).toEqual([0, 1]);
    expect(suitesContigues([5, 1, 2, 3, 9, 10], 2)).toEqual([[1, 2], [3, 3], [5, 5], [9, 10]]);
  });

  it("une source épinglée change si l'ETag, la date ou la taille changent", () => {
    const a = { etag: "\"x\"", lastModified: "Mon, 09 May 2022 14:26:37 GMT", taille: 10 };
    expect(memeSource(a, { ...a })).toBe(true);
    expect(memeSource(a, { ...a, etag: "\"y\"" })).toBe(false);
    expect(memeSource(a, { ...a, taille: 11 })).toBe(false);
  });
});

describe("cache borné : éviction LRU", () => {
  it("évince du moins récemment utilisé jusqu'à la cible, jamais une entrée protégée", () => {
    const e = [{ cle: "a", taille: 40, utiliseLe: 3 }, { cle: "b", taille: 40, utiliseLe: 1 }, { cle: "c", taille: 40, utiliseLe: 2 }];
    expect(planEviction(e, 200, 100)).toEqual([]);
    expect(planEviction(e, 100, 80)).toEqual(["b"]);
    expect(planEviction(e, 100, 40)).toEqual(["b", "c"]);
    expect(planEviction(e, 100, 40, new Set(["b"]))).toEqual(["c", "a"]);
  });
});

describe("budget des requêtes distantes", () => {
  const budget = { simultanees: 2, parMinute: 3, octetsParJour: 1000, octetsParRequete: 600, delaiMs: 1000 };
  it("borne les requêtes simultanées, par minute, par jour et par requête", () => {
    const b = new CompteurBudget(budget);
    expect(b.reserver(700, 0)).toMatch(/par requête/);
    expect(b.reserver(100, 0)).toBeNull();
    expect(b.reserver(100, 1)).toBeNull();
    expect(b.reserver(100, 2)).toMatch(/simultanées/);
    b.liberer(); b.liberer();
    expect(b.reserver(100, 3)).toBeNull();
    b.liberer();
    expect(b.reserver(100, 4)).toMatch(/par minute/);
    expect(b.reserver(600, 61_000)).toBeNull();
    b.liberer();
    expect(b.reserver(300, 62_000)).toMatch(/par jour/);
    expect(b.etat(62_000)).toEqual({ enCours: 0, minute: 1, octetsJour: 900 });
  });
});

describe("zoom minimal des tuiles", () => {
  it("adresse unique avec aperçus : dès le zoom 3 ; dalles : dès le zoom 8", () => {
    expect(zoomMinimalTuiles(GEDTM)).toBe(3);
    expect(zoomMinimalTuiles(GLO)).toBe(8);
  });
});

describe("mosaïque et Web Mercator", () => {
  it("dimensionne une grille et refuse au-delà du budget de cellules", () => {
    expect(grilleMosaique([0, 0, 1, 0.5], 0.25, 100)).toEqual({ largeur: 4, hauteur: 2 });
    expect(() => grilleMosaique([0, 0, 1, 1], 0.001, 1000)).toThrow();
    expect(latitudeMercator(0.5)).toBeCloseTo(0, 9);
    expect(latitudeMercator(0)).toBeCloseTo(85.0511, 3);
  });
});

describe("fiche d'une source distante", () => {
  const base = {
    cle: "gedtm30-v1-2-mondial", titre: "GEDTM30 v1.2 — fond mondial", producteur: "OpenGeoHub", niveau: "mondial", produit: "MNT", etiquette: "Modèle régional, précision de plusieurs mètres.",
    demonstration: false, synthetique: false, licence: { nom: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" }, attribution: "GEDTM30 © OpenGeoHub, CC-BY 4.0",
    droits: { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "autorise", partage: "autorise", telechargement: "autorise", export: "autorise" },
    version: { libelle: "v1.2.0", doi: "10.5281/zenodo.18887460", date: "2026-03-06", url: "https://zenodo.org/records/18887460" },
    acquisition: GEDTM, fichier: { nom: "gedtm30.tif", format: "GeoTIFF" }, crsHorizontal: "EPSG:4326",
    referenceVerticale: { statut: "non-declaree", indice: null }, uniteVerticale: "m", pasNatif: { valeur: 1, unite: "arcsec" }, nodata: null, precisionDeclaree: null,
  };
  it("accepte les deux fonds mondiaux, refuse un hôte incohérent, http, un port, une marque inconnue, un niveau local, un autre repère", () => {
    expect(validerDeclarationTerrain(base).ok).toBe(true);
    expect(validerDeclarationTerrain({ ...base, produit: "MNS", acquisition: GLO }).ok).toBe(true);
    const refus = (a: Partial<AcquisitionDistante>, autre: Record<string, unknown> = {}) => validerDeclarationTerrain({ ...base, ...autre, acquisition: { ...GEDTM, ...a } });
    expect(refus({ hote: "exemple.test" }).ok).toBe(false);
    expect(refus({ modele: GEDTM.modele.replace("https:", "http:") }).ok).toBe(false);
    expect(refus({ modele: GEDTM.modele.replace(".org/", ".org:444/") }).ok).toBe(false);
    expect(refus({ modele: `${GEDTM.modele}?a=1` }).ok).toBe(false);
    expect(refus({ hote: "169.254.169.254", modele: "https://169.254.169.254/a.tif" }).ok).toBe(false);
    expect(refus({ dalles: "1deg", dalleReference: "N33W008", modele: "https://s3.opengeohub.org/{lat}{x}.tif" }).ok).toBe(false);
    expect(refus({ dalles: "1deg", dalleReference: null, modele: "https://s3.opengeohub.org/{lat}{lon}.tif" }).ok).toBe(false);
    expect(refus({}, { niveau: "leve-local" }).ok).toBe(false);
    expect(refus({}, { crsHorizontal: "EPSG:2056" }).ok).toBe(false);
    expect(refus({ conditions: { texte: "", source: "" } }).ok).toBe(false);
  });
});
