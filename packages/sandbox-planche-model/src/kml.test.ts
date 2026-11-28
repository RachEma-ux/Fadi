import { describe, expect, it } from "vitest";
import { modeleVide } from "./geometrie-libre.js";
import { ErreurKml, lireKml, lireKmz, pointsKml, poserKml } from "./kml.js";
import { ecrireZip } from "./zip.js";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Parcelle</name>
 <Folder><name>Relevé</name>
  <Placemark><name>Emprise</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
   8.0,47.0,0 8.001,47.0,0 8.001,47.001,0 8.0,47.001,0 8.0,47.0,0</coordinates></LinearRing></outerBoundaryIs>
   <innerBoundaryIs><LinearRing><coordinates>8.0004,47.0004 8.0006,47.0004 8.0006,47.0006 8.0004,47.0006 8.0004,47.0004</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
  <Placemark><name>Accès</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>8.0,46.9995,500 8.0005,46.9995,500</coordinates></LineString></Placemark>
 </Folder>
 <Placemark><name>Arbre</name><Point><coordinates>8.0002,47.0002,0</coordinates></Point></Placemark>
 <Placemark><MultiGeometry><Point><coordinates>8.0003,47.0003</coordinates></Point><Point><coordinates>8.0003,47.0003</coordinates></Point></MultiGeometry></Placemark>
 <GroundOverlay><name>Photo</name></GroundOverlay>
</Document></kml>`;

// Projection de recette (plate, pour vérifier la pose) : 1e-3 degré = 100 m, origine 8° / 47° à (2 600 000, 1 200 000).
const projeter = (p: readonly [number, number]): [number, number] => [2600000 + (p[0] - 8) * 100000, 1200000 + (p[1] - 47) * 100000];

describe("KML / KMZ (étape 7b)", () => {
  it("lit polygones (trous), lignes, points, dossiers ; signale superpositions et altitudes", () => {
    const l = lireKml(KML);
    expect(l.nom).toBe("Parcelle");
    expect(l.elements.map((e) => [e.nom, e.genre, e.boucles.length])).toEqual([
      ["Relevé / Emprise", "polygone", 2],
      ["Relevé / Accès", "ligne", 1],
      ["Arbre", "point", 1],
      ["Repère 4", "point", 1],
      ["Repère 4", "point", 1],
    ]);
    expect(l.elements[0]?.boucles[0]).toHaveLength(4);
    expect([...l.omis].sort()).toEqual(["altitudes", "superpositions"]);
    expect(() => lireKml("<gpx/>")).toThrow(ErreurKml);
    expect(() => lireKml("<kml><Placemark><Point><coordinates>200,0</coordinates></Point></Placemark></kml>")).toThrow(/illisible/);
  });

  it("KMZ : doc.kml lu dans l'archive", () => {
    const z = ecrireZip([{ nom: "doc.kml", donnees: new TextEncoder().encode(KML) }], new Date(Date.UTC(2026, 10, 27)));
    expect(lireKmz(z).elements).toHaveLength(5);
    expect(() => lireKmz(new Uint8Array([1, 2, 3]))).toThrow(ErreurKml);
  });

  it("pose à plat par le point de base : face trouée, guides, points étiquetés", () => {
    const l = lireKml(KML);
    const projetes = pointsKml(l).map(projeter);
    const pdb = { e: 2600000, n: 1200000, systeme: "EPSG:2056", rotation: 0 };
    const r = poserKml(modeleVide(), l, projetes, pdb);
    expect([r.polygones, r.lignes, r.points, r.ignores]).toEqual([1, 1, 3, 0]);
    const def = Object.values(r.modele.definitions)[0];
    expect(def?.nom).toBe("Relevé / Emprise");
    const face = Object.values(def?.contenu.faces ?? {})[0];
    expect(face?.trous).toHaveLength(1);
    expect(face?.normale.z).toBeCloseTo(1);
    const xs = Object.values(def?.contenu.sommets ?? {}).map((s) => s.position.x);
    expect(Math.max(...xs)).toBeCloseTo(100, 6);
    const guides = Object.values(r.modele.annotations?.guides ?? {});
    expect(guides.filter((g) => g.genre === "segment")).toHaveLength(1);
    expect(guides.filter((g) => g.genre === "point")).toHaveLength(3);
    expect(Object.values(r.modele.annotations?.textes ?? {}).map((t) => ("texte" in t ? t.texte : "")).sort()).toEqual(["Arbre", "Relevé / Accès", "Repère 4", "Repère 4"]);
    // Nord du quadrillage tourné de 90° : l'est du projet devient −y du dessin.
    const r90 = poserKml(modeleVide(), l, projetes, { ...pdb, rotation: 90 });
    const s90 = Object.values(Object.values(r90.modele.definitions)[0]?.contenu.sommets ?? {}).map((s) => s.position);
    expect(Math.min(...s90.map((p) => p.y))).toBeCloseTo(-100, 6);
    expect(() => poserKml(modeleVide(), l, projetes.slice(1), pdb)).toThrow(/incomplète/);
  });

  it("un contour qui se recoupe est laissé de côté et compté", () => {
    const l = lireKml(`<kml><Placemark><name>Noeud</name><Polygon><outerBoundaryIs><LinearRing><coordinates>8,47 8.001,47.001 8.001,47 8,47.001 8,47</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`);
    const r = poserKml(modeleVide(), l, pointsKml(l).map(projeter), { e: 2600000, n: 1200000, systeme: "EPSG:2056", rotation: 0 });
    expect([r.polygones, r.ignores]).toEqual([0, 1]);
  });
});
