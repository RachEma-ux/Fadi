/**
 * Dépôt des sites de projet (base dédiée `sites_*`, 27 novembre 2026). Un site appartient au compte qui l'a créé : toute
 * lecture et toute écriture filtrent sur `proprietaire_id`, jamais sur un identifiant reçu du client seul. La révision
 * attendue protège la sauvegarde (409 si périmée) ; la parcelle garde une ligne par révision qui l'a changée.
 */
import type { PoolClient, QueryResultRow } from "pg";
import {
  positionSite,
  OBSERVATIONS_SITE_VIDES,
  validerAltimetrie,
  validerObservations,
  validerParcelle,
  type ContenuSite,
  type GenreLien,
  type LienSite,
  type PositionSite,
  type ZoneIndicative,
} from "@parcours/domain-model";
import { pool } from "../../db/client.js";
import { newId } from "../ids.js";
import { toWgs84 } from "../site-context.js";

export type Executeur = Pick<PoolClient, "query">;

async function requete<T extends QueryResultRow = Record<string, unknown>>(sql: string, valeurs: unknown[], ex: Executeur): Promise<T[]> {
  return (await ex.query<T>(sql, valeurs)).rows;
}

export async function transaction<T>(f: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await f(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export interface ResumeSite {
  readonly id: string;
  readonly nom: string;
  readonly nature: string | null;
  readonly lieu: string;
  readonly revision: number;
  readonly modifieLe: string;
}

export interface SiteLu extends ContenuSite {
  readonly id: string;
  readonly revision: number;
  readonly creeLe: string;
  readonly modifieLe: string;
  readonly liens: readonly LienSite[];
  /** Position calculée (jamais stockée) : contour converti, repère saisi ou centre de la zone indicative. */
  readonly position: PositionSite | null;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));
const resume = (l: Record<string, unknown>): ResumeSite => ({ id: String(l["id"]), nom: String(l["nom"]), nature: (l["nature"] as string | null) ?? null, lieu: String(l["lieu"] ?? ""), revision: Number(l["revision"]), modifieLe: iso(l["modifie_le"]) });

export async function listerSites(proprietaire: string, filtre: { genre: GenreLien; cible: string } | null, ex: Executeur = pool): Promise<ResumeSite[]> {
  const lignes = filtre
    ? await requete(`SELECT s.id, s.nom, s.nature, s.lieu, s.revision, s.modifie_le FROM sites_projet s JOIN sites_liens l ON l.site_id = s.id
        WHERE s.proprietaire_id = $1 AND l.genre = $2 AND l.cible = $3 ORDER BY s.modifie_le DESC, s.id LIMIT 500`, [proprietaire, filtre.genre, filtre.cible], ex)
    : await requete(`SELECT id, nom, nature, lieu, revision, modifie_le FROM sites_projet WHERE proprietaire_id = $1 ORDER BY modifie_le DESC, id LIMIT 500`, [proprietaire], ex);
  return lignes.map(resume);
}

function zoneDe(geojson: unknown, provenance: unknown): ZoneIndicative | null {
  if (typeof geojson !== "string" || typeof provenance !== "string") return null;
  const g = JSON.parse(geojson) as { coordinates?: number[][][] };
  const anneau = g.coordinates?.[0];
  return anneau ? { anneau: anneau.map((p) => [p[0]!, p[1]!] as [number, number]), provenance: provenance as ZoneIndicative["provenance"] } : null;
}

export async function lireSite(proprietaire: string, id: string, ex: Executeur = pool): Promise<SiteLu | null> {
  const [s] = await requete(`SELECT id, nom, nature, lieu, revision, cree_le, modifie_le, ST_AsGeoJSON(zone) AS zone, zone_provenance FROM sites_projet WHERE id = $1 AND proprietaire_id = $2`, [id, proprietaire], ex);
  if (!s) return null;
  const [p] = await requete(`SELECT donnees FROM sites_parcelles WHERE site_id = $1 ORDER BY revision DESC LIMIT 1`, [id], ex);
  const [o] = await requete(`SELECT donnees FROM sites_observations WHERE site_id = $1`, [id], ex);
  const [a] = await requete(`SELECT donnees FROM sites_altimetrie WHERE site_id = $1`, [id], ex);
  const liens = await requete<{ genre: GenreLien; cible: string }>(`SELECT genre, cible FROM sites_liens WHERE site_id = $1 ORDER BY genre, cible`, [id], ex);
  // Relu à travers les mêmes contrôles qu'à l'écriture : une ligne abîmée devient « non évaluée », jamais inventée.
  const parcelle = validerParcelle(p?.["donnees"] ?? null);
  const observations = validerObservations(o?.["donnees"] ?? null);
  const altimetrie = validerAltimetrie(a?.["donnees"] ?? null);
  const contenu: ContenuSite = {
    fiche: { nom: String(s["nom"]), nature: (s["nature"] as ContenuSite["fiche"]["nature"]) ?? null, lieu: String(s["lieu"] ?? "") },
    parcelle: parcelle.ok ? parcelle.valeur : null,
    observations: observations.ok ? observations.valeur : OBSERVATIONS_SITE_VIDES,
    altimetrie: altimetrie.ok ? altimetrie.valeur : null,
    zone: zoneDe(s["zone"], s["zone_provenance"]),
  };
  return { id, revision: Number(s["revision"]), creeLe: iso(s["cree_le"]), modifieLe: iso(s["modifie_le"]), liens: liens.map((l) => ({ genre: l.genre, cible: l.cible })), ...contenu, position: positionSite(contenu, toWgs84) };
}

const zoneSql = (z: ZoneIndicative | null) => (z ? JSON.stringify({ type: "Polygon", coordinates: [fermer(z.anneau)] }) : null);
function fermer(a: readonly (readonly [number, number])[]): number[][] {
  const pts = a.map((p) => [p[0], p[1]]);
  const [p0, pn] = [pts[0]!, pts[pts.length - 1]!];
  return p0[0] === pn[0] && p0[1] === pn[1] ? pts : [...pts, [p0[0]!, p0[1]!]];
}

async function ecrireDetails(id: string, revision: number, c: ContenuSite, parcelleChangee: boolean, ex: Executeur) {
  if (parcelleChangee) await ex.query(`INSERT INTO sites_parcelles (site_id, revision, donnees) VALUES ($1, $2, $3)`, [id, revision, c.parcelle ? JSON.stringify(c.parcelle) : null]);
  await ex.query(`INSERT INTO sites_observations (site_id, donnees) VALUES ($1, $2) ON CONFLICT (site_id) DO UPDATE SET donnees = EXCLUDED.donnees, modifie_le = now()`, [id, JSON.stringify(c.observations)]);
  if (c.altimetrie) await ex.query(`INSERT INTO sites_altimetrie (site_id, donnees) VALUES ($1, $2) ON CONFLICT (site_id) DO UPDATE SET donnees = EXCLUDED.donnees, modifie_le = now()`, [id, JSON.stringify(c.altimetrie)]);
  else await ex.query(`DELETE FROM sites_altimetrie WHERE site_id = $1`, [id]);
}

export async function creerSite(proprietaire: string, c: ContenuSite, liens: readonly LienSite[], ex: Executeur): Promise<string> {
  const id = newId("site");
  await ex.query(
    `INSERT INTO sites_projet (id, proprietaire_id, nom, nature, lieu, zone, zone_provenance) VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), $7)`,
    [id, proprietaire, c.fiche.nom, c.fiche.nature, c.fiche.lieu, zoneSql(c.zone), c.zone?.provenance ?? null],
  );
  await ecrireDetails(id, 1, c, c.parcelle !== null, ex);
  for (const l of liens) await lier(id, l, ex);
  return id;
}

/** Sauvegarde : `null` si le site n'existe pas pour ce compte, `"conflit"` si la révision attendue est périmée. */
export async function sauvegarderSite(proprietaire: string, id: string, revisionAttendue: number, c: ContenuSite, ex: Executeur): Promise<number | null | "conflit"> {
  const [actuel] = await requete(`SELECT revision FROM sites_projet WHERE id = $1 AND proprietaire_id = $2 FOR UPDATE`, [id, proprietaire], ex);
  if (!actuel) return null;
  if (Number(actuel["revision"]) !== revisionAttendue) return "conflit";
  const revision = revisionAttendue + 1;
  await ex.query(
    `UPDATE sites_projet SET nom = $3, nature = $4, lieu = $5, zone = ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), zone_provenance = $7, revision = $8, modifie_le = now() WHERE id = $1 AND proprietaire_id = $2`,
    [id, proprietaire, c.fiche.nom, c.fiche.nature, c.fiche.lieu, zoneSql(c.zone), c.zone?.provenance ?? null, revision],
  );
  const [p] = await requete(`SELECT donnees FROM sites_parcelles WHERE site_id = $1 ORDER BY revision DESC LIMIT 1`, [id], ex);
  // jsonb réordonne les clés : la parcelle relue repasse le contrôle avant d'être comparée (même forme, même ordre).
  const avant = validerParcelle(p?.["donnees"] ?? null);
  const changee = JSON.stringify(avant.ok ? avant.valeur : null) !== JSON.stringify(c.parcelle);
  await ecrireDetails(id, revision, c, changee, ex);
  return revision;
}

export async function lier(id: string, l: LienSite, ex: Executeur): Promise<void> {
  await ex.query(`INSERT INTO sites_liens (site_id, genre, cible) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, l.genre, l.cible]);
}

/** Une Planche (ou une zone) ne suit qu'un site à la fois pour un compte : son lien précédent est retiré. */
export async function lierSeul(proprietaire: string, id: string, l: LienSite, ex: Executeur): Promise<void> {
  await ex.query(`DELETE FROM sites_liens l USING sites_projet s WHERE l.site_id = s.id AND s.proprietaire_id = $1 AND l.genre = $2 AND l.cible = $3 AND l.site_id <> $4`, [proprietaire, l.genre, l.cible, id]);
  await lier(id, l, ex);
}

export async function archiverFichier(id: string, nom: string, type: string, contenu: Buffer, ex: Executeur): Promise<void> {
  await ex.query(`INSERT INTO sites_fichiers (id, site_id, nom, type, taille, contenu) VALUES ($1, $2, $3, $4, $5, $6)`, [newId("sitefic"), id, nom.slice(0, 200) || "site.json", type.slice(0, 120), contenu.length, contenu]);
}
