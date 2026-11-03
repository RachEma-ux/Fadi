/**
 * Exports du terrain (plan v1.0, lot TER-04, Issue #381) : demandés par un compte (droits « export » et
 * « téléchargement » de la version, budget de pixels), **préparés en tâche de fond** par le travailleur terrain, puis
 * téléchargeables par le seul demandeur jusqu'à expiration (24 h).
 *
 *  - `geotiff` : fenêtre de l'**original numérique** (jamais d'un aperçu ni d'une tuile colorée), valeurs, repère et NoData
 *    conservés ; référence verticale ajoutée au repère (repère composé) quand elle est déclarée par un code, et écrite
 *    en métadonnées avec la source, la version, la qualité, la licence et l'attribution ;
 *  - `courbes-geojson` (WGS 84) et `courbes-dxf` (repère natif, R12, TER-D18) : courbes à l'équidistance demandée, jamais
 *    plus fine que la précision ne le permet (TER-D17), métadonnées complètes.
 * Ce module n'ouvre aucun pool.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { PoolClient } from "pg";
import { dxfCourbes, geojsonCourbes, verifierEquidistance, type MetadonneesCourbes } from "@parcours/geodata-model";
import { newId } from "../../ids.js";
import { empreinteFichier, type StockageTerrain } from "./stockage.js";
import { equidistanceExigeeVersion } from "./traitement.js";
import { exigerUsage, LIMITES_SERVICES, ServiceRefuse, sourcePubliee, transformer, type Executeur, type SourceTerrain } from "./services.js";

const executer = promisify(execFile);
export type FormatExport = "geotiff" | "courbes-geojson" | "courbes-dxf";
export const FORMATS_EXPORT: readonly FormatExport[] = ["geotiff", "courbes-geojson", "courbes-dxf"];

/** Plus grande équidistance calculée qui divise l'équidistance demandée (les courbes en sont un sous-ensemble exact). */
export async function baseCourbes(ex: Executeur, versionId: string, demandee: number): Promise<number | null> {
  const r = await ex.query<{ e: number }>("SELECT DISTINCT equidistance AS e FROM geodata_terrain_courbes WHERE terrain_version_id = $1 ORDER BY equidistance DESC", [versionId]);
  for (const { e } of r.rows) { const q = demandee / e; if (e <= demandee + 1e-9 && Math.abs(q - Math.round(q)) < 1e-6) return e; }
  return null;
}

/** Équidistance demandée contrôlée contre celle qu'exige la précision (TER-D17) ; 422 motivé sinon. */
export async function equidistanceAdmise(c: Executeur, versionId: string, demandee: number | null): Promise<number> {
  const exigee = await equidistanceExigeeVersion(c as PoolClient, versionId);
  const e = demandee ?? exigee;
  const v = verifierEquidistance(e, exigee);
  if (!v.ok) throw new ServiceRefuse(422, "equidistance_refusee", v.message);
  if (!(await baseCourbes(c, versionId, e))) throw new ServiceRefuse(422, "equidistance_indisponible", `Aucune courbe calculée ne permet ${e} m (équidistances calculées multiples requises).`);
  return e;
}

const empriseValide = (e: unknown): e is [number, number, number, number] =>
  Array.isArray(e) && e.length === 4 && e.every((x) => typeof x === "number" && Number.isFinite(x)) && e[0] >= -180 && e[2] <= 180 && e[1] >= -90 && e[3] <= 90 && e[2] > e[0] && e[3] > e[1];

async function empriseNative(ex: Executeur, s: SourceTerrain, e: readonly [number, number, number, number]): Promise<[number, number, number, number]> {
  const coins = await transformer(ex, [[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]]], 4326, s.srid);
  return [Math.min(...coins.map((p) => p[0])), Math.min(...coins.map((p) => p[1])), Math.max(...coins.map((p) => p[0])), Math.max(...coins.map((p) => p[1]))];
}

/** Demande d'export : droits, emprise, budget ; renvoie l'identifiant de la tâche (préparée par le travailleur). */
export async function demanderExport(c: PoolClient, versionId: string, demandeur: string, format: unknown, emprise: unknown, equidistance: unknown): Promise<{ id: string; equidistance: number | null }> {
  if (!FORMATS_EXPORT.includes(format as FormatExport)) throw new ServiceRefuse(400, "invalid_input", `Format attendu : ${FORMATS_EXPORT.join(", ")}.`);
  if (!empriseValide(emprise)) throw new ServiceRefuse(400, "invalid_input", "Emprise [ouest, sud, est, nord] en degrés WGS 84 attendue.");
  const s = await sourcePubliee(c, versionId);
  exigerUsage(s, "export");
  exigerUsage(s, "telechargement");
  let eq: number | null = null;
  if (format === "geotiff") {
    const [x0, y0, x1, y1] = await empriseNative(c, s, emprise);
    const [{ entete }] = (await c.query<{ entete: { pas: [number, number] } }>("SELECT entete FROM geodata_terrain_versions WHERE id = $1", [versionId])).rows as [{ entete: { pas: [number, number] } }];
    const pixels = Math.ceil((x1 - x0) / entete.pas[0]) * Math.ceil((y1 - y0) / entete.pas[1]);
    if (pixels > LIMITES_SERVICES.pixelsExport) throw new ServiceRefuse(413, "trop_grand", `Export de ${pixels} pixels : au-delà du budget de ${LIMITES_SERVICES.pixelsExport}.`);
  } else {
    eq = await equidistanceAdmise(c, versionId, equidistance === undefined || equidistance === null ? null : Number(equidistance));
  }
  const id = newId("gdte");
  await c.query("INSERT INTO geodata_terrain_exports (id, demandeur_id, terrain_version_id, format, emprise, equidistance) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, demandeur, versionId, format, JSON.stringify(emprise), eq]);
  await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.export.demande', $2, 'succes', $3)", [demandeur, id, JSON.stringify({ versionId, format })]);
  return { id, equidistance: eq };
}

function metaCourbes(s: SourceTerrain, eq: number, crs: string): MetadonneesCourbes {
  const r = s.referenceVerticale;
  return {
    source: s.titre, version: s.id, produit: s.produit, equidistance: eq, crs,
    referenceVerticale: r.statut === "declaree" ? `${r.libelle}${r.code ? ` (${r.code})` : ""} — ${r.origine}` : "non déclarée",
    licence: s.licence.nom, attribution: s.attribution, etiquette: s.etiquette,
    qualite: s.qualite.n ? `${s.qualite.etat}, RMSEz ${s.qualite.rmsez} m, P95 ${s.qualite.p95} m (n ${s.qualite.n})` : "non évaluée",
  };
}

async function courbesExport(ex: Executeur, s: SourceTerrain, e: readonly [number, number, number, number], eq: number, srid: number) {
  const base = (await baseCourbes(ex, s.id, eq))!;
  const r = await ex.query<{ altitude: number; geom: string }>(
    `SELECT altitude, ST_AsGeoJSON(ST_Transform(g, $5::int), 9) AS geom FROM (
       SELECT altitude, ST_CollectionExtract(ST_Intersection(geom, ST_MakeEnvelope($2, $3, $4, $6, 4326)), 2) AS g FROM geodata_terrain_courbes
        WHERE terrain_version_id = $1 AND equidistance = $7 AND abs(altitude / $8 - round(altitude / $8)) < 1e-6
          AND geom && ST_MakeEnvelope($2, $3, $4, $6, 4326)) x WHERE NOT ST_IsEmpty(g) ORDER BY altitude`,
    [s.id, e[0], e[1], e[2], srid, e[3], base, eq]);
  return r.rows.map((l) => {
    const g = JSON.parse(l.geom) as { type: string; coordinates: unknown };
    const lignes = (g.type === "LineString" ? [g.coordinates] : g.coordinates) as [number, number][][];
    return { altitude: l.altitude, maitresse: Math.abs(l.altitude / (5 * eq) - Math.round(l.altitude / (5 * eq))) < 1e-6, lignes };
  });
}

/** Prépare un export en attente (travailleur) ; renvoie false s'il n'y en a plus. Échec consigné, jamais silencieux. */
export async function traiterUnExport(c: PoolClient, stockage: StockageTerrain): Promise<boolean> {
  await c.query("BEGIN");
  const [t] = (await c.query<{ id: string; terrain_version_id: string; format: FormatExport; emprise: [number, number, number, number]; equidistance: number | null }>(
    "SELECT id, terrain_version_id, format, emprise, equidistance FROM geodata_terrain_exports WHERE etat = 'en_attente' ORDER BY cree_le LIMIT 1 FOR UPDATE SKIP LOCKED")).rows;
  if (!t) { await c.query("COMMIT"); return false; }
  const dossier = `exports/${t.id}`;
  try {
    const s = await sourcePubliee(c, t.terrain_version_id);
    await mkdir(stockage.chemin(dossier), { recursive: true });
    let nom: string;
    if (t.format === "geotiff") {
      const [x0, y0, x1, y1] = await empriseNative(c, s, t.emprise);
      const [{ cle_stockage: original }] = (await c.query<{ cle_stockage: string }>("SELECT cle_stockage FROM geodata_terrain_fichiers WHERE terrain_version_id = $1 AND role = 'original'", [s.id])).rows as [{ cle_stockage: string }];
      nom = `${s.cle}-${s.produit.toLowerCase()}.tif`;
      const r = s.referenceVerticale;
      const vertical = r.statut === "declaree" && r.code ? Number(r.code.replace(/^EPSG:/, "")) : null;
      const mo = {
        FADI_SOURCE: s.titre, FADI_VERSION: s.id, FADI_PRODUIT: s.produit, FADI_REFERENCE_VERTICALE: r.statut === "declaree" ? `${r.libelle}${r.code ? ` (${r.code})` : ""} ; origine ${r.origine} ; source ${r.source}` : "non déclarée",
        FADI_UNITE_VERTICALE: "m", FADI_PAS: `${s.pasDeclare.valeur} ${s.pasDeclare.unite}`, FADI_QUALITE: s.qualite.n ? `${s.qualite.etat} ; RMSEz ${s.qualite.rmsez} m ; P95 ${s.qualite.p95} m ; n ${s.qualite.n}` : "non évaluée",
        FADI_LICENCE: s.licence.nom, FADI_ATTRIBUTION: s.attribution, FADI_ETIQUETTE: s.etiquette ?? "",
      };
      await executer("gdal_translate", [
        "-q", "-of", "GTiff", "-co", "COMPRESS=DEFLATE", "-projwin", String(x0), String(y1), String(x1), String(y0),
        ...(vertical ? ["-a_srs", `EPSG:${s.srid}+${vertical}`] : []),
        ...Object.entries(mo).flatMap(([k, v]) => ["-mo", `${k}=${v}`]),
        stockage.chemin(original), stockage.chemin(`${dossier}/${nom}`),
      ], { maxBuffer: 16 * 1024 * 1024 });
    } else {
      const eq = t.equidistance!;
      if (t.format === "courbes-geojson") {
        nom = `${s.cle}-courbes-${eq}m.geojson`;
        await writeFile(stockage.chemin(`${dossier}/${nom}`), geojsonCourbes(await courbesExport(c, s, t.emprise, eq, 4326), metaCourbes(s, eq, "EPSG:4326 (WGS 84, longitude puis latitude)")));
      } else {
        nom = `${s.cle}-courbes-${eq}m.dxf`;
        await writeFile(stockage.chemin(`${dossier}/${nom}`), dxfCourbes(await courbesExport(c, s, t.emprise, eq, s.srid), metaCourbes(s, eq, `EPSG:${s.srid}`)));
      }
    }
    const f = await empreinteFichier(stockage.chemin(`${dossier}/${nom}`));
    await c.query("UPDATE geodata_terrain_exports SET etat = 'pret', cle_stockage = $2, nom_fichier = $3, taille = $4, empreinte = $5, pret_le = now(), expire_le = now() + interval '24 hours' WHERE id = $1",
      [t.id, `${dossier}/${nom}`, nom, f.taille, f.empreinte]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    await rm(stockage.chemin(dossier), { recursive: true, force: true }).catch(() => undefined);
    await c.query("UPDATE geodata_terrain_exports SET etat = 'echec', motif_echec = $2 WHERE id = $1 AND etat = 'en_attente'", [t.id, ((e as Error).message || String(e)).slice(0, 2000)]);
  }
  return true;
}

/** Exports expirés : fichiers effacés du volume, état « expiré » (la demande reste tracée). */
export async function expirerExports(c: PoolClient, stockage: StockageTerrain): Promise<number> {
  const r = await c.query<{ id: string }>("UPDATE geodata_terrain_exports SET etat = 'expire' WHERE etat = 'pret' AND expire_le < now() RETURNING id");
  for (const { id } of r.rows) await rm(stockage.chemin(`exports/${id}`), { recursive: true, force: true });
  return r.rowCount ?? 0;
}

/** Export du demandeur seulement (un autre compte reçoit 404), prêt et non expiré. */
export async function exportDuDemandeur(ex: Executeur, id: string, demandeur: string) {
  const [e] = (await ex.query<{ id: string; etat: string; format: string; nom_fichier: string | null; cle_stockage: string | null; taille: number | null; empreinte: string | null; motif_echec: string | null; expire_le: string; terrain_version_id: string }>(
    "SELECT id, etat, format, nom_fichier, cle_stockage, taille::float8 AS taille, empreinte, motif_echec, expire_le, terrain_version_id FROM geodata_terrain_exports WHERE id = $1 AND demandeur_id = $2", [id, demandeur])).rows;
  if (!e) throw new ServiceRefuse(404, "not_found", "Export introuvable.");
  if (e.etat === "pret" && new Date(e.expire_le).getTime() < Date.now()) return { ...e, etat: "expire" };
  return e;
}
