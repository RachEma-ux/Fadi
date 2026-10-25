/** Lecteur GeoPackage (D-GD-07) : fichier construit ici avec `node:sqlite`, aucune base PostgreSQL. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { validerGeoJSON } from "@parcours/geodata-model";
import { blobGeoPackage, lireGeoPackage } from "./geopackage.js";

const dossier = mkdtempSync(join(tmpdir(), "gpkg-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

function wkbPolygone(anneau: [number, number][]): Buffer {
  const b = Buffer.alloc(1 + 4 + 4 + 4 + anneau.length * 16);
  let o = 0;
  b.writeUInt8(1, o); o += 1;
  b.writeUInt32LE(3, o); o += 4;
  b.writeUInt32LE(1, o); o += 4;
  b.writeUInt32LE(anneau.length, o); o += 4;
  for (const [x, y] of anneau) { b.writeDoubleLE(x, o); o += 8; b.writeDoubleLE(y, o); o += 8; }
  return b;
}
const blob = (srid: number, wkb: Buffer) => { const h = Buffer.alloc(8); h.write("GP", 0, "latin1"); h.writeUInt8(0, 2); h.writeUInt8(1, 3); h.writeInt32LE(srid, 4); return Buffer.concat([h, wkb]); };

function creer(nom: string, srid: number, org: string, code: number): string {
  const chemin = join(dossier, nom);
  const db = new DatabaseSync(chemin);
  db.exec(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT, organization_coordsys_id INTEGER, definition TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT);
    CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER);
    CREATE TABLE communes (fid INTEGER PRIMARY KEY, code TEXT, nom TEXT, geom BLOB);`);
  db.prepare("INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, '')").run("srs", srid, org, code);
  db.exec("INSERT INTO gpkg_contents VALUES ('communes', 'features'); INSERT INTO gpkg_geometry_columns VALUES ('communes', 'geom', 'POLYGON', " + srid + ");");
  db.prepare("INSERT INTO communes (code, nom, geom) VALUES (?, ?, ?)").run("01001", "الدار البيضاء", blob(srid, wkbPolygone([[-7.6, 33.5], [-7.5, 33.5], [-7.5, 33.6], [-7.6, 33.5]])));
  db.close();
  return chemin;
}

describe("GeoPackage de référence", () => {
  it("lit une table EPSG:4326 : code à zéro initial et nom arabe conservés, GeoJSON validé", () => {
    const l = lireGeoPackage(creer("ok.gpkg", 4326, "EPSG", 4326));
    expect(l.table).toBe("communes");
    const f = l.geojson.features[0] as { properties: Record<string, unknown>; geometry: { type: string } };
    expect(f.properties).toMatchObject({ code: "01001", nom: "الدار البيضاء" });
    expect(f.geometry.type).toBe("Polygon");
    expect(validerGeoJSON(l.geojson).ok).toBe(true);
  });
  it("refuse un système projeté (Merchich / Nord Maroc) sans reprojection devinée", () => {
    expect(() => lireGeoPackage(creer("proj.gpkg", 26191, "EPSG", 26191))).toThrow(/EPSG:26191 non pris en charge/);
  });
  it("refuse un blob sans en-tête GP", () => {
    expect(() => blobGeoPackage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/en-tête GP/);
  });
});
