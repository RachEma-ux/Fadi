import { describe, expect, it } from "vitest";
import { contenuDepuisEtape01, contourGeoJson, emplacementDepuisSite, fichierSite, lireFichierSite, OBSERVATIONS_SITE_VIDES, positionSite, validerContenuSite, validerFiche, validerObservations, type ContenuSite } from "./site-projet.js";
import { DEFAULT_SITE_OBSERVATIONS } from "./site.js";

const parcelle = { vertices: [[0, 0], [10, 0], [10, 10], [0, 10]], crs: "EPSG:26191", units: "m", parcelNumber: "T-1", commune: "Anfa" };
const decale = (_crs: string, p: readonly [number, number]): [number, number] => [-7 + p[0] / 1000, 33 + p[1] / 1000];

describe("Site de projet — modèle pur", () => {
  it("fiche : nom obligatoire, nature connue, lieu borné ; le champ fautif est nommé", () => {
    expect(validerFiche({ nom: "  Villa  ", nature: "renovation" })).toEqual({ ok: true, valeur: { nom: "Villa", nature: "renovation", lieu: "" } });
    expect(validerFiche({ nom: " " })).toEqual({ ok: false, champ: "nom" });
    expect(validerFiche({ nom: "A", nature: "demolition" })).toEqual({ ok: false, champ: "nature" });
    expect(validerFiche({ nom: "A", lieu: "x".repeat(121) })).toEqual({ ok: false, champ: "lieu" });
  });

  it("observations : celles de l'étape 01, nord et altitude déclarés avec leur source ; absents = non évalués", () => {
    expect(validerObservations(undefined)).toEqual({ ok: true, valeur: OBSERVATIONS_SITE_VIDES });
    expect(OBSERVATIONS_SITE_VIDES.nord).toBeNull();
    const o = validerObservations({ nord: { valeur: -15, source: "relevé" }, altitudeReference: { valeur: 45, source: "plan" } });
    expect(o.ok && o.valeur.nord).toEqual({ valeur: 345, source: "relevé" });
    expect(validerObservations({ priority: "x" })).toEqual({ ok: false, champ: "observations" });
    expect(validerObservations({ geographic: { longitude: 200, latitude: 0, source: "" } })).toEqual({ ok: false, champ: "position" });
    expect(validerObservations({ nord: { valeur: "N" } })).toEqual({ ok: false, champ: "nord" });
  });

  it("position : contour converti d'abord, sinon repère saisi, sinon zone indicative, sinon rien", () => {
    const c = validerContenuSite({ fiche: { nom: "S" }, parcelle });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const p = positionSite(c.valeur, decale);
    expect(p).toMatchObject({ longitude: -6.995, latitude: 33.005, hypothese: false });
    expect(positionSite(c.valeur, null)).toBeNull();
    const zone: ContenuSite = { ...c.valeur, parcelle: null, zone: { anneau: [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]], provenance: "vue" } };
    expect(positionSite(zone, null)).toMatchObject({ longitude: 2, latitude: 2, hypothese: true });
    expect(contourGeoJson(zone, null)?.properties.nature).toBe("zone-indicative");
    expect(contourGeoJson(c.valeur, decale)?.geometry.coordinates[0]).toHaveLength(5);
  });

  it("fichier d'échange : aller-retour ; un autre fichier est refusé", () => {
    const c = validerContenuSite({ fiche: { nom: "S", lieu: "Anfa" }, parcelle, observations: { nord: { valeur: 12, source: "boussole" } } });
    if (!c.ok) throw new Error("invalide");
    const f = JSON.parse(JSON.stringify(fichierSite(c.valeur, decale, "2026-11-27T02:00:00Z")));
    expect(lireFichierSite(f)).toEqual({ ok: true, valeur: c.valeur });
    expect(lireFichierSite({ type: "FeatureCollection" })).toEqual({ ok: false, champ: "format" });
  });

  it("emplacement de la Planche : nord absent → 0° gardé mais signalé non évalué", () => {
    const c = validerContenuSite({ fiche: { nom: "Villa" }, observations: { geographic: { longitude: -7.6, latitude: 33.5, source: "saisi" } } });
    if (!c.ok) throw new Error("invalide");
    expect(emplacementDepuisSite(c.valeur, positionSite(c.valeur, null))).toEqual({ latitude: 33.5, longitude: -7.6, nord: 0, lieu: "Villa", nordEvalue: false });
  });

  it("étape 01 → site : parcelle, observations et altimétrie reprises telles quelles", () => {
    const elevation = { points: [[-7, 33, 40]], range: 0, at: "2026-11-27T00:00:00Z" };
    const c = contenuDepuisEtape01("Projet P", { ...parcelle, vertices: [[0, 0], [1, 0], [1, 1]], vertexIds: [], officialArea: null, sourceFile: "" }, { ...DEFAULT_SITE_OBSERVATIONS, priority: "retreat", elevation });
    expect(c.fiche).toEqual({ nom: "Projet P", nature: null, lieu: "Anfa" });
    expect(c.observations.priority).toBe("retreat");
    expect(c.altimetrie).toEqual(elevation);
    expect(validerContenuSite(JSON.parse(JSON.stringify(c))).ok).toBe(true);
  });
});
