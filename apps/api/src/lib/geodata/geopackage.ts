/**
 * Lecture d'un GeoPackage de référence (D-GD-07) sans GDAL : le fichier est une base SQLite (module `node:sqlite` de
 * Node 22) dont les géométries sont des blobs « GP » (en-tête GeoPackage + WKB). Seul le système EPSG:4326 est accepté ;
 * tout autre système est refusé, aucune reprojection n'est devinée (GEO 07). Le résultat est un GeoJSON (CRS84) validé
 * ensuite par la même chaîne que les autres fichiers (`validerGeoJSON`).
 */
import { DatabaseSync } from "node:sqlite";

type Position = [number, number];

export class ErreurGeoPackage extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Décode une géométrie WKB (ISO ou EWKB, 2D ; Z/M lues puis écartées) en géométrie GeoJSON. */
export function wkbVersGeoJSON(buf: Buffer, depart = 0): { geometrie: { type: string; coordinates: unknown }; fin: number; dimensionsIgnorees: boolean } {
  let o = depart;
  let ignorees = false;
  const lire = (): { type: string; coordinates: unknown } => {
    const le = buf.readUInt8(o) === 1;
    o += 1;
    const u32 = () => { const v = le ? buf.readUInt32LE(o) : buf.readUInt32BE(o); o += 4; return v; };
    const f64 = () => { const v = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o); o += 8; return v; };
    let t = u32();
    let dims = 2;
    if (t & 0x20000000) { o += 4; t &= ~0x20000000; } // EWKB : SRID embarqué
    if (t & 0x80000000) { dims++; t &= ~0x80000000; }
    if (t & 0x40000000) { dims++; t &= ~0x40000000; }
    if (t >= 3000) { dims = 4; t -= 3000; } else if (t >= 2000) { dims = 3; t -= 2000; } else if (t >= 1000) { dims = 3; t -= 1000; }
    if (dims > 2) ignorees = true;
    const point = (): Position => { const p: Position = [f64(), f64()]; for (let d = 2; d < dims; d++) f64(); return p; };
    const points = () => Array.from({ length: u32() }, point);
    switch (t) {
      case 1: return { type: "Point", coordinates: point() };
      case 2: return { type: "LineString", coordinates: points() };
      case 3: return { type: "Polygon", coordinates: Array.from({ length: u32() }, points) };
      case 4: return { type: "MultiPoint", coordinates: Array.from({ length: u32() }, () => lire().coordinates) };
      case 5: return { type: "MultiLineString", coordinates: Array.from({ length: u32() }, () => lire().coordinates) };
      case 6: return { type: "MultiPolygon", coordinates: Array.from({ length: u32() }, () => lire().coordinates) };
      default: throw new ErreurGeoPackage("type-non-pris-en-charge", `Type WKB ${t} non pris en charge.`);
    }
  };
  const geometrie = lire();
  return { geometrie, fin: o, dimensionsIgnorees: ignorees };
}

/** Géométrie d'un blob GeoPackage : en-tête `GP`, version, drapeaux (boutisme, enveloppe, vide), SRID, enveloppe, WKB. */
export function blobGeoPackage(blob: Uint8Array): { srid: number; geometrie: { type: string; coordinates: unknown } | null; dimensionsIgnorees: boolean } {
  const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  if (buf.length < 8 || buf.toString("latin1", 0, 2) !== "GP") throw new ErreurGeoPackage("blob-invalide", "Géométrie GeoPackage illisible (en-tête GP absent).");
  const drapeaux = buf.readUInt8(3);
  const le = (drapeaux & 1) === 1;
  const srid = le ? buf.readInt32LE(4) : buf.readInt32BE(4);
  const enveloppe = (drapeaux >> 1) & 7;
  const taille = [0, 32, 48, 48, 64][enveloppe];
  if (taille === undefined) throw new ErreurGeoPackage("blob-invalide", "Enveloppe GeoPackage invalide.");
  if ((drapeaux >> 4) & 1) return { srid, geometrie: null, dimensionsIgnorees: false };
  const { geometrie, dimensionsIgnorees } = wkbVersGeoJSON(buf, 8 + taille);
  return { srid, geometrie, dimensionsIgnorees };
}

export interface LectureGeoPackage {
  readonly table: string;
  readonly srid: number;
  readonly crs: string;
  readonly geojson: { type: "FeatureCollection"; crs: unknown; features: unknown[] };
  readonly dimensionsIgnorees: boolean;
}

/** Lit la table d'entités `table` (ou la seule table d'entités du fichier). */
export function lireGeoPackage(chemin: string, table?: string): LectureGeoPackage {
  const db = new DatabaseSync(chemin, { readOnly: true });
  try {
    const tables = db.prepare("SELECT c.table_name AS t, g.column_name AS col, g.srs_id AS srs FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.data_type = 'features'").all() as { t: string; col: string; srs: number }[];
    const choisie = table ? tables.find((x) => x.t === table) : tables.length === 1 ? tables[0] : undefined;
    if (!choisie) throw new ErreurGeoPackage("table", table ? `Table d'entités « ${table} » absente.` : `Préciser la table d'entités parmi : ${tables.map((x) => x.t).join(", ") || "aucune"}.`);
    const srs = db.prepare("SELECT organization AS org, organization_coordsys_id AS code FROM gpkg_spatial_ref_sys WHERE srs_id = ?").get(choisie.srs) as { org: string; code: number } | undefined;
    const est4326 = !!srs && srs.org.toUpperCase() === "EPSG" && Number(srs.code) === 4326;
    if (!est4326) throw new ErreurGeoPackage("crs-non-pris-en-charge", `Système ${srs ? `${srs.org}:${srs.code}` : `srs_id ${choisie.srs}`} non pris en charge : EPSG:4326 seulement, aucune reprojection n'est devinée.`);
    const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lignes = db.prepare(`SELECT * FROM ${ident(choisie.t)}`).all() as Record<string, unknown>[];
    let dimensionsIgnorees = false;
    const features = lignes.map((l) => {
      const blob = l[choisie.col];
      const g = blob instanceof Uint8Array ? blobGeoPackage(blob) : { geometrie: null, dimensionsIgnorees: false, srid: choisie.srs };
      dimensionsIgnorees ||= g.dimensionsIgnorees;
      const proprietes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) if (k !== choisie.col && !(v instanceof Uint8Array)) proprietes[k] = typeof v === "bigint" ? Number(v) : v;
      return { type: "Feature", properties: proprietes, geometry: g.geometrie };
    });
    return { table: choisie.t, srid: choisie.srs, crs: "EPSG:4326", geojson: { type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } }, features }, dimensionsIgnorees };
  } finally {
    db.close();
  }
}
