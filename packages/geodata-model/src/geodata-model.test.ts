import { describe, expect, it } from "vitest";
import {
  aireM2, calculerSeuils, capacitesDe, classer, COMPOSITION_INITIALE, couleursPour, distanceM, DROITS_IMPORT_PERSONNEL, formatNombre,
  legende, libelleSurface, lireCoordonnees, lireDroits, lireValeur, pointGeographique, validerComposition, validerGeoJSON, verifierUsage,
  type ValeurIndicateur,
} from "./index.js";

const v = (x: number | null): ValeurIndicateur => (x === null ? { valeur: null, motifAbsence: "non-publiee" } : { valeur: x, motifAbsence: null });

describe("coordonnées étiquetées (D-GD-06)", () => {
  it("lit lon puis lat, ou lat puis lon, avec étiquettes", () => {
    expect(lireCoordonnees("lon -7.6 lat 33.5")).toEqual({ ok: true, point: { repere: "geographic", lon: -7.6, lat: 33.5 } });
    expect(lireCoordonnees("lat=33,5; lon=-7,6")).toEqual({ ok: true, point: { repere: "geographic", lon: -7.6, lat: 33.5 } });
    expect(lireCoordonnees("Longitude: -5.8 Latitude: 35.77")).toMatchObject({ ok: true, point: { lon: -5.8, lat: 35.77 } });
  });
  it("refuse une paire nue au lieu de deviner l'ordre des axes", () => {
    expect(lireCoordonnees("33.5, -7.6")).toMatchObject({ ok: false, refus: "non-etiquetees" });
  });
  it("refuse les plages invalides et les saisies incomplètes ; un nom n'est pas une coordonnée", () => {
    expect(lireCoordonnees("lon 200 lat 33")).toMatchObject({ ok: false, refus: "hors-plage" });
    expect(lireCoordonnees("lat 33")).toMatchObject({ ok: false, refus: "incompletes" });
    expect(lireCoordonnees("Casablanca-Settat")).toMatchObject({ ok: false, refus: "pas-de-coordonnees" });
    expect(pointGeographique(0, 91)).toBeNull();
  });
});

describe("mesures indicatives", () => {
  it("un degré de longitude à l'équateur = 2πR/360", () => {
    expect(distanceM(pointGeographique(0, 0)!, pointGeographique(1, 0)!)).toBeCloseTo((2 * Math.PI * 6_371_008.8) / 360, 6);
  });
  it("cellule 1°×1° à l'équateur ≈ 1,2364 × 10¹⁰ m², trous retranchés, sens indifférent", () => {
    const carre: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const attendu = 6_371_008.8 ** 2 * (Math.PI / 180) * Math.sin(Math.PI / 180);
    expect(aireM2([carre]) / attendu).toBeCloseTo(1, 6);
    expect(aireM2([[...carre].reverse()]) / attendu).toBeCloseTo(1, 6);
    const trou: [number, number][] = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75], [0.25, 0.25]];
    expect(aireM2([carre, trou]) / attendu).toBeCloseTo(0.75, 3);
  });
  it("formats français", () => {
    expect(formatNombre(1234567.891, 2)).toBe("1 234 567,89");
    expect(libelleSurface(25_000)).toBe("2,50 ha");
    expect(libelleSurface(3_500_000)).toBe("3,50 km²");
  });
});

describe("valeurs et classification : absence ≠ zéro (GEO 06)", () => {
  it("zéro est une valeur ; une absence garde son motif ; une forme incohérente est « non évaluée »", () => {
    expect(lireValeur(0, null)).toEqual({ valeur: 0, motifAbsence: null });
    expect(lireValeur(null, "secret-statistique")).toEqual({ valeur: null, motifAbsence: "secret-statistique" });
    expect(lireValeur(3, "non-publiee")).toEqual({ valeur: null, motifAbsence: "non-evaluee" });
    expect(lireValeur(null, null)).toEqual({ valeur: null, motifAbsence: "non-evaluee" });
  });
  it("une absence n'entre jamais dans la classe de zéro et a sa propre entrée de légende", () => {
    const vs = [v(0), v(0), v(5), v(10), v(null)];
    const seuils = [1, 6];
    expect(classer(v(0), seuils)).toBe(0);
    expect(classer(v(null), seuils)).toBe("absente");
    expect(classer(v(6), seuils)).toBe(2);
    const l = legende(vs, seuils, couleursPour(3), String);
    expect(l.map((e) => [e.classe, e.effectif])).toEqual([[0, 2], [1, 1], [2, 1], ["absente", 1]]);
    expect(l.at(-1)!.libelle).toBe("Valeur absente");
  });
  it("seuils calculés sans les absences, strictement croissants", () => {
    const vs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v).concat([v(null)]);
    expect(calculerSeuils(vs, "intervalles-egaux", 3)).toEqual([4, 7]);
    const q = calculerSeuils(vs, "quantiles", 5);
    expect(q).toHaveLength(4);
    expect(q.every((s, i) => i === 0 || s > q[i - 1]!)).toBe(true);
    expect(calculerSeuils([v(3), v(3), v(3)], "quantiles")).toEqual([]);
  });
});

describe("composition geodata-composition/1", () => {
  const couche = { coucheId: "c1", versionId: "v1", visible: true, opacite: 0.8, style: { mode: "thematique", indicateurId: "i1", methode: "manuel", seuils: [10, 20], couleurs: ["#000000", "#111111", "#222222"] }, filtre: null };
  it("la composition initiale et une composition thématique sont valides et relues à l'identique", () => {
    expect(validerComposition(COMPOSITION_INITIALE).ok).toBe(true);
    const c = { ...COMPOSITION_INITIALE, couches: [couche] };
    const r = validerComposition(JSON.parse(JSON.stringify(c)));
    expect(r).toEqual({ ok: true, composition: c });
  });
  it("refuse une adresse ou une clé de fournisseur, des seuils non croissants, une couleur par classe manquante", () => {
    expect(validerComposition({ ...COMPOSITION_INITIALE, fond: "https://tiles.example/{z}" }).ok).toBe(false);
    expect(validerComposition({ ...COMPOSITION_INITIALE, couches: [{ ...couche, filtre: { propriete: "nom", operateur: "egal", valeur: "x?key=abc" } }] }).ok).toBe(false);
    expect(validerComposition({ ...COMPOSITION_INITIALE, couches: [{ ...couche, style: { ...couche.style, seuils: [20, 10] } }] }).ok).toBe(false);
    expect(validerComposition({ ...COMPOSITION_INITIALE, couches: [{ ...couche, style: { ...couche.style, couleurs: ["#000000"] } }] }).ok).toBe(false);
    expect(validerComposition({ ...COMPOSITION_INITIALE, couches: [couche, couche] }).ok).toBe(false);
  });
  it("l'ordre des clés (réordonnées par jsonb) ne rend pas une composition « modifiée »", async () => {
    const { memeComposition } = await import("./index.js");
    const relue = { couches: [], fond: "neutre", format: "geodata-composition/1", camera: { cap: 0, lat: 31.79, lon: -7.09, zoom: 4.6 } } as unknown as typeof COMPOSITION_INITIALE;
    expect(memeComposition(COMPOSITION_INITIALE, relue)).toBe(true);
    expect(memeComposition(COMPOSITION_INITIALE, { ...relue, camera: { ...relue.camera, zoom: 5 } })).toBe(false);
  });
  it("aucune notion de projet dans le format", () => {
    expect(JSON.stringify(COMPOSITION_INITIALE)).not.toMatch(/project/i);
  });
});

describe("GeoJSON importé (GEO 07)", () => {
  const fc = (features: unknown[], crs?: string) => ({ type: "FeatureCollection", ...(crs ? { crs: { type: "name", properties: { name: crs } } } : {}), features });
  const poly = (coords: number[][][], props: Record<string, unknown> = { nom: "Zone" }) => ({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: coords } });
  const carre = [[[-7, 33], [-6.9, 33], [-6.9, 33.1], [-7, 33.1], [-7, 33]]];
  it("accepte un fichier CRS84 et produit son rapport", () => {
    const r = validerGeoJSON(fc([poly(carre)], "urn:ogc:def:crs:OGC:1.3:CRS84"));
    expect(r.ok).toBe(true);
    expect(r.rapport).toMatchObject({ objets: 1, sommets: 5, types: { Polygon: 1 }, emprise: [-7, 33, -6.9, 33.1], proprietes: ["nom"] });
  });
  it("refuse un CRS projeté déclaré, ou des coordonnées projetées sans CRS, sans transformation devinée", () => {
    const r1 = validerGeoJSON(fc([poly(carre)], "urn:ogc:def:crs:EPSG::26191"));
    expect(r1.ok).toBe(false);
    expect(r1.rapport.diagnostics[0]!.code).toBe("crs-non-pris-en-charge");
    const r2 = validerGeoJSON(fc([poly([[[350000, 380000], [351000, 380000], [351000, 381000], [350000, 380000]]])]));
    expect(r2.ok).toBe(false);
    expect(r2.rapport.diagnostics.map((d) => d.code)).toContain("hors-plage");
  });
  it("refuse un anneau ouvert, un objet sans géométrie, une GeometryCollection ; signale EPSG:4326 et les altitudes", () => {
    expect(validerGeoJSON(fc([poly([[[-7, 33], [-6.9, 33], [-6.9, 33.1], [-7, 33.1]]])])).rapport.diagnostics[0]!.code).toBe("anneau-ouvert");
    expect(validerGeoJSON(fc([{ type: "Feature", properties: {}, geometry: null }])).ok).toBe(false);
    expect(validerGeoJSON(fc([{ type: "Feature", properties: {}, geometry: { type: "GeometryCollection", geometries: [] } }])).ok).toBe(false);
    const z = validerGeoJSON(fc([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-7, 33, 120] } }], "EPSG:4326"));
    expect(z.ok).toBe(true);
    expect(z.rapport.diagnostics.map((d) => d.code).sort()).toEqual(["altitudes-ignorees", "crs-epsg4326"]);
    if (z.ok) expect(z.objets[0]!.geometrie.coordinates).toEqual([-7, 33]);
  });
  it("attributs inertes : valeurs primitives seulement, objets imbriqués ignorés ; limites appliquées", () => {
    const r = validerGeoJSON(fc([poly(carre, { nom: "<img src=x onerror=alert(1)>", n: 3, sous: { a: 1 } })]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.objets[0]!.proprietes).toEqual({ nom: "<img src=x onerror=alert(1)>", n: 3 });
    const trop = validerGeoJSON(fc([poly(carre), poly(carre)]), { octets: 1e6, objets: 1, sommets: 100, proprietes: 5, longueurTexte: 10 });
    expect(trop.rapport.diagnostics[0]!.code).toBe("limite-objets");
  });
});

describe("droits par usage et capacités (INV-08)", () => {
  it("un usage absent vaut « inconnu » et bloque, avec un motif distinct du refus", () => {
    const d = lireDroits({ consultation: "autorise", export: "refuse" });
    expect(verifierUsage(d, "consultation")).toEqual({ ok: true });
    expect(verifierUsage(d, "export")).toMatchObject({ ok: false, etat: "refuse" });
    expect(verifierUsage(d, "tuiles")).toMatchObject({ ok: false, etat: "inconnu" });
    expect(verifierUsage(DROITS_IMPORT_PERSONNEL, "partage")).toMatchObject({ ok: false });
  });
  it("préparer, publier et gérer les rôles sont trois capacités séparées", () => {
    expect([...capacitesDe([])].sort()).toEqual(["composer", "consulter", "exporter", "importer"]);
    expect(capacitesDe(["gestionnaire-donnees"]).has("publier-version")).toBe(false);
    expect(capacitesDe(["administrateur"]).has("preparer-version")).toBe(false);
    expect(capacitesDe(["administrateur"]).has("publier-version")).toBe(false);
    expect(capacitesDe(["responsable-publication"]).has("publier-version")).toBe(true);
  });
});

describe("borne d'une couche", () => {
  it("une couche de plus de OBJETS_PAR_COUCHE objets est refusée, jamais tronquée", async () => {
    const { OBJETS_PAR_COUCHE } = await import("./index.js");
    const f = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } };
    const r = validerGeoJSON({ type: "FeatureCollection", features: Array.from({ length: OBJETS_PAR_COUCHE + 1 }, () => f) });
    expect(r.ok).toBe(false);
    expect(r.rapport.diagnostics[0]!.code).toBe("limite-objets");
  });
});
