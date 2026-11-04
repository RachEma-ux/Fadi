import { describe, expect, it } from "vitest";
import type { ProfilRecu, SourceTerrainRecue } from "./client";
import {
  decimalesPour, empriseGeometrie, jeuPourVue, messageCouverture, equidistancesProposees, formaterAltitude, graduations, intersectionEmprises, lignesSource, longueurApprochee, nombreFr,
  pasProfil, porteeLegende, precisionSupportee, resumeSource, texteReference, traceProfil,
} from "./terrain-ops";

/** Source « test seulement » : aucune donnée réelle. */
const source = (o: Partial<SourceTerrainRecue> = {}): SourceTerrainRecue => ({
  versionId: "v1", cle: "test-a", titre: "Jeu synthétique", produit: "MNT", niveau: "leve-local", etiquette: "Données synthétiques — test seulement",
  pas: { metres: 0.25, declare: { valeur: 0.25, unite: "m" } }, referenceVerticale: { statut: "declaree", code: "EPSG:5728", libelle: "LN02", origine: "documentation", source: "fixture" },
  unite: "m", qualite: { etat: "non-evaluee", rmsez: null, p95: null, n: 0 }, precisionDeclaree: null, date: null, publieeLe: "2026-11-01T10:00:00.000Z",
  attribution: "Fixture de test Fadi", licence: { nom: "test", url: null }, ...o,
});

describe("terrain : précision et arrondi (TER-05)", () => {
  it("la précision mesurée prime sur la déclarée ; sans aucune : non évaluée", () => {
    expect(precisionSupportee(source({ qualite: { etat: "conforme", rmsez: 0.08, p95: 0.15, n: 40 }, precisionDeclaree: { texte: "±0,5 m", verticaleM: 0.5, source: "x" } }))).toEqual({ valeur: 0.08, nature: "mesuree" });
    expect(precisionSupportee(source({ precisionDeclaree: { texte: "±0,5 m", verticaleM: 0.5, source: "x" } }))).toEqual({ valeur: 0.5, nature: "declaree" });
    expect(precisionSupportee(source())).toEqual({ valeur: null, nature: "non-evaluee" });
  });
  it("jamais plus de décimales que la source n'en permet ; au mètre sans précision ; absente = non évaluée (jamais 0)", () => {
    expect([decimalesPour(null), decimalesPour(0.02), decimalesPour(0.08), decimalesPour(0.5), decimalesPour(4)]).toEqual([0, 2, 1, 0, 0]);
    expect(formaterAltitude(512.3456, source({ qualite: { etat: "conforme", rmsez: 0.08, p95: 0.1, n: 30 } }))).toBe("512,3 m");
    expect(formaterAltitude(512.3456, source())).toBe("512 m");
    expect(formaterAltitude(null, source())).toBe("non évaluée");
    expect(nombreFr(1234.5, 1)).toBe("1 234,5");
    expect(nombreFr(-12.04, 1)).toBe("−12,0");
  });
  it("référence verticale : jamais supposée", () => {
    expect(texteReference({ statut: "declaree", code: "EPSG:5728", libelle: "LN02", origine: "documentation", source: "x" })).toBe("LN02 (EPSG:5728)");
    expect(texteReference({ statut: "non-declaree", indice: null })).toBe("non déclarée");
  });
  it("sources et précision : chaque rubrique présente, valeurs absentes dites", () => {
    const l = new Map(lignesSource(source()));
    // Une seule ligne de précision, jamais « non évaluée » répété (TER-09).
    expect(l.get("Précision")).toBe("non évaluée (aucun point de contrôle)");
    expect([...l.values()].filter((v) => /non évaluée/.test(v)).length).toBe(1);
    expect(l.has("Contrôle")).toBe(false);
    expect(l.get("Date des données")).toBe("non déclarée");
    expect(l.get("Référence verticale")).toBe("LN02 (EPSG:5728)");
    expect(l.get("Attribution")).toBe("Fixture de test Fadi");
    const mesure = new Map(lignesSource(source({ qualite: { etat: "conforme", rmsez: 0.081, p95: 0.152, n: 40 } })));
    expect(mesure.get("Précision mesurée")).toBe("RMSEz 0,081 m · P95 0,152 m · 40 points");
    expect(mesure.get("Contrôle")).toBe("conforme aux cibles");
    expect(new Map(lignesSource(source({ precisionDeclaree: { texte: "LE90 < 4 m", verticaleM: 4, source: "x" } }))).get("Précision du producteur")).toBe("LE90 < 4 m");
  });
});

describe("terrain : légende et courbes (TER-05)", () => {
  it("portée de légende toujours dite ; adaptation impossible → verrouillée", () => {
    expect(porteeLegende("verrouillee", [400, 600], { plage: [450, 470], zone: null })).toMatchObject({ plage: [400, 600], libelle: expect.stringContaining("verrouillée") });
    expect(porteeLegende("adaptee", [400, 600], { plage: [450, 470], zone: null })).toMatchObject({ plage: [450, 470], zone: null, libelle: expect.stringContaining("vue courante") });
    expect(porteeLegende("adaptee", [400, 600], { plage: [450, 470], zone: "Parcelle test" })).toMatchObject({ plage: [450, 470], zone: "Parcelle test", libelle: expect.stringContaining("zone d'étude") });
    expect(porteeLegende("adaptee", [400, 600], null).plage).toEqual([400, 600]);
    expect(porteeLegende("verrouillee", null, null).libelle).toContain("non évaluée");
    expect(graduations(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
  });
  it("équidistances : jamais sous le seuil, seulement celles que les courbes calculées permettent", () => {
    expect(equidistancesProposees(0.25, [0.25])).toEqual([0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100]);
    expect(equidistancesProposees(10, [10])).toEqual([10, 20, 50, 100]);
    expect(equidistancesProposees(1, [2])).toEqual([2, 10, 20, 50, 100]);
    expect(equidistancesProposees(200, [200])).toEqual([200]);
    expect(equidistancesProposees(1, [])).toEqual([]);
  });
});

describe("terrain : profil (TER-05)", () => {
  it("pas : jamais plus fin que le pas natif, borné en nombre de points, arrondi lisible", () => {
    expect(pasProfil(100, 0.25)).toBe(0.25);
    expect(pasProfil(10_000, 0.25)).toBe(5);
    expect(pasProfil(1000, null)).toBe(1);
    expect(pasProfil(3000, 2)).toBe(2);
    expect(Math.round(longueurApprochee([[7.0, 47.0], [7.0, 47.001]]))).toBe(111);
  });
  it("tracé : une lacune coupe le trait (jamais comblée), l'interpolation est un segment distinct", () => {
    const pts: ProfilRecu["points"] = [
      { chainage: 0, lon: 0, lat: 0, altitude: 500, source: "a", interpolee: false },
      { chainage: 1, lon: 0, lat: 0, altitude: 501, source: "a", interpolee: false },
      { chainage: 2, lon: 0, lat: 0, altitude: null, source: null, interpolee: false },
      { chainage: 3, lon: 0, lat: 0, altitude: 503, source: "b", interpolee: true },
      { chainage: 4, lon: 0, lat: 0, altitude: 504, source: "b", interpolee: true },
      { chainage: 5, lon: 0, lat: 0, altitude: 505, source: "b", interpolee: false },
    ];
    const t = traceProfil(pts, { largeur: 110, hauteur: 60, marge: 5 });
    expect(t.min).toBe(500);
    expect(t.max).toBe(505);
    expect(t.segments.map((s) => s.interpolee)).toEqual([false, true, false]);
    expect(t.segments[0]!.d).toBe("M5.0,55.0L25.0,45.0");
    // Raccord : le segment non interpolé repart du dernier point interpolé.
    expect(t.segments[2]!.d.startsWith(`M${t.x(4).toFixed(1)},`)).toBe(true);
    expect(traceProfil([], { largeur: 100, hauteur: 50, marge: 5 }).segments).toEqual([]);
  });
  it("emprises : couverture GeoJSON, intersection avec la vue", () => {
    expect(empriseGeometrie({ type: "MultiPolygon", coordinates: [[[[1, 2], [3, 2], [3, 4], [1, 4], [1, 2]]]] })).toEqual([1, 2, 3, 4]);
    expect(empriseGeometrie(null)).toBeNull();
    expect(intersectionEmprises([0, 0, 2, 2], [1, 1, 3, 3])).toEqual([1, 1, 2, 2]);
    expect(intersectionEmprises([0, 0, 1, 1], [2, 2, 3, 3])).toBeNull();
  });
});

describe("terrain : couverture de la vue (TER-05)", () => {
  const couv = (o: number) => ({ type: "MultiPolygon", coordinates: [[[[o, 0], [o + 1, 0], [o + 1, 1], [o, 1], [o, 0]]]] });
  it("aucun jeu dans la vue ; seulement un modèle régional ; un levé local", () => {
    expect(messageCouverture([{ couverture: couv(5), niveau: "leve-local" }], [0, 0, 1, 1])).toContain("Aucun jeu publié");
    expect(messageCouverture([{ couverture: couv(0), niveau: "mondial" }, { couverture: couv(5), niveau: "leve-local" }], [0.2, 0.2, 0.8, 0.8])).toContain("Seul un modèle régional");
    expect(messageCouverture([{ couverture: couv(0), niveau: "leve-local" }], [0.2, 0.2, 0.8, 0.8])).toBeNull();
    expect(messageCouverture([], null)).toBeNull();
  });
});

describe("terrain : fond mondial à la demande (TER-09)", () => {
  const carre = (o: number, s: number, e: number, n: number) => ({ type: "Polygon", coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]] });
  const mondial = { versionId: "mondial", couverture: carre(-180, -65, 180, 85), pas: { metres: 30.9, declare: { valeur: 1, unite: "arcsec" } } };
  const lucerne = { versionId: "lucerne", couverture: carre(8.2, 47.0, 8.3, 47.1), pas: { metres: 0.25, declare: { valeur: 0.25, unite: "m" } } };
  it("le jeu affiché suit le centre de la vue : levé local sur son emprise, fond mondial partout ailleurs", () => {
    expect(jeuPourVue([mondial, lucerne], [8.24, 47.04, 8.26, 47.06], "mondial")).toBe("lucerne");
    expect(jeuPourVue([mondial, lucerne], [-7.2, 33.4, -7.0, 33.6], "lucerne")).toBe("mondial");
    expect(jeuPourVue([mondial, lucerne], [2.2, 48.8, 2.4, 48.9], null)).toBe("mondial");
    // Aucun jeu ne contient le centre (hors de l'emprise du fond) : le jeu courant reste.
    expect(jeuPourVue([mondial], [10, 86, 11, 87], "mondial")).toBe("mondial");
    expect(jeuPourVue([mondial], null, null)).toBeNull();
  });
  it("Sources et précision : DOI et accès « à la demande » affichés avec les métadonnées habituelles", () => {
    const l = lignesSource(source({ doi: "10.5281/zenodo.18887460", acces: "a-la-demande" }));
    expect(l).toContainEqual(["DOI", "10.5281/zenodo.18887460"]);
    expect(l).toContainEqual(["Accès", "fond mondial lu à la demande (emprise affichée seulement)"]);
    expect(l.map((x) => x[0])).toEqual(expect.arrayContaining(["Jeu", "Pas de la grille", "Référence verticale", "Précision", "Attribution", "Licence"]));
  });
  it("résumé d'une ligne : nom court, pas, précision lisible", () => {
    expect(resumeSource(source({ titre: "GEDTM30 v1.2 — MNT, fond mondial lu à la demande", niveau: "mondial", pas: { metres: 30.9, declare: { valeur: 1, unite: "arcsec" } } }))).toBe("GEDTM30 v1.2 · 31 m · précision de plusieurs mètres");
    expect(resumeSource(source({ qualite: { etat: "conforme", rmsez: 0.08, p95: 0.15, n: 40 } }))).toBe("Jeu synthétique · 0,25 m · précision mesurée 0,08 m");
    expect(resumeSource(source())).toBe("Jeu synthétique · 0,25 m · précision non évaluée");
  });
});
