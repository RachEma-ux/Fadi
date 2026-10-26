/**
 * Chargement du découpage territorial en base (lot H, D-GD-28) : les unités d'une version **publiée** dont la fiche
 * déclare `territoire` sont copiées dans `geodata_territoires` (pays, rang, code, nom, géométrie, version d'origine) ;
 * le niveau (nom, règle de parenté) est consigné dans `geodata_pays.niveaux`. Une nouvelle version du même niveau
 * remplace l'ancienne ; recharger la même version ne refait rien. Les parents sont recalculés pour ce rang et pour le
 * rang en dessous (chargé avant ou après, peu importe l'ordre des fiches) — jamais devinés : règle « codes-hcp » par les
 * codes, règle « inclusion » par un point intérieur contenu dans l'unité du rang supérieur.
 */
import { codeAdmis, parentsParCodes, type DeclarationTerritoire, type RangAdministratif, type RegleParent } from "@parcours/geodata-model";
import type { PoolClient, QueryResultRow } from "pg";

/** Connexion fournie par l'appelant (route ou ligne de commande d'import) : ce module n'ouvre aucun pool. */
export type Executeur = Pick<PoolClient, "query">;
const requete = async <T extends QueryResultRow = Record<string, unknown>>(sql: string, valeurs: unknown[], ex: Executeur): Promise<T[]> => (await ex.query<T>(sql, valeurs)).rows;

export interface BilanTerritoires { readonly pays: string; readonly rang: number; readonly unites: number; readonly deja: boolean }

async function regleDuRang(ex: Executeur, pays: string, rang: number): Promise<RegleParent | null> {
  const [r] = await requete<{ regle: string | null }>("SELECT niveaux -> $2::text ->> 'parent' AS regle FROM geodata_pays WHERE code = $1", [pays, String(rang)], ex);
  return (r?.regle as RegleParent | null) ?? null;
}

/** Recalcule `parent_code` des unités d'un rang (> 1) d'après la règle de ce rang et les unités du rang supérieur. */
export async function majParents(ex: Executeur, pays: string, rang: number): Promise<void> {
  if (rang <= 1 || rang > 4) return;
  const regle = await regleDuRang(ex, pays, rang);
  if (!regle) return;
  if (regle === "inclusion") {
    await requete(
      `UPDATE geodata_territoires t SET parent_code = (
         SELECT p.code FROM geodata_territoires p
          WHERE p.pays = t.pays AND p.rang = t.rang - 1 AND ST_Contains(p.geom, ST_PointOnSurface(t.geom))
          ORDER BY ST_Area(p.geom) LIMIT 1)
        WHERE t.pays = $1 AND t.rang = $2`, [pays, rang], ex);
    return;
  }
  const parents = new Set((await requete<{ code: string }>("SELECT code FROM geodata_territoires WHERE pays = $1 AND rang = $2", [pays, rang - 1], ex)).map((r) => r.code));
  const enfants = (await requete<{ code: string }>("SELECT code FROM geodata_territoires WHERE pays = $1 AND rang = $2", [pays, rang], ex)).map((r) => r.code);
  const liens = parentsParCodes(enfants, rang as RangAdministratif, parents);
  await requete(
    `UPDATE geodata_territoires t SET parent_code = l.parent
       FROM unnest($3::text[], $4::text[]) AS l(code, parent)
      WHERE t.pays = $1 AND t.rang = $2 AND t.code = l.code`,
    [pays, rang, [...liens.keys()], [...liens.values()]], ex);
}

/** Charge (ou confirme) le niveau déclaré par une version publiée. */
export async function chargerTerritoires(ex: Executeur, versionId: string, d: DeclarationTerritoire): Promise<BilanTerritoires> {
  const [v] = await requete<{ couche_id: string; etat: string }>("SELECT c.id AS couche_id, v.etat FROM geodata_versions v JOIN geodata_couches c ON c.version_id = v.id WHERE v.id = $1", [versionId], ex);
  if (!v) throw new Error(`Version ${versionId} sans couche : découpage territorial non chargé.`);
  if (v.etat !== "publiee") throw new Error(`Version ${versionId} non publiée (${v.etat}) : découpage territorial non chargé.`);
  const [deja] = await requete<{ n: number }>("SELECT count(*)::int AS n FROM geodata_territoires WHERE pays = $1 AND rang = $2 AND version_id = $3", [d.pays, d.rang, versionId], ex);
  if (deja && deja.n > 0) return { pays: d.pays, rang: d.rang, unites: deja.n, deja: true };
  await requete(
    `INSERT INTO geodata_pays (code, nom, niveaux) VALUES ($1, $2, jsonb_build_object($3::text, $4::jsonb))
     ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, niveaux = geodata_pays.niveaux || EXCLUDED.niveaux, mis_a_jour_le = now()`,
    [d.pays, d.nomPays, String(d.rang), JSON.stringify({ singulier: d.niveau.singulier, pluriel: d.niveau.pluriel, parent: d.parent })], ex);
  await requete("DELETE FROM geodata_territoires WHERE pays = $1 AND rang = $2", [d.pays, d.rang], ex);
  const objets = await requete<{ code: string }>("SELECT code FROM geodata_objets WHERE couche_id = $1 AND ST_Dimension(geom) = 2", [v.couche_id], ex);
  const admis = objets.map((o) => o.code).filter((c) => codeAdmis(c, d.parent));
  await requete(
    `INSERT INTO geodata_territoires (pays, rang, code, nom, geom, version_id)
     SELECT $1, $2, o.code, coalesce(nullif(btrim(o.nom), ''), o.code), o.geom, $3
       FROM geodata_objets o WHERE o.couche_id = $4 AND o.code = ANY($5::text[]) AND ST_Dimension(o.geom) = 2`,
    [d.pays, d.rang, versionId, v.couche_id, admis], ex);
  await majParents(ex, d.pays, d.rang);
  await majParents(ex, d.pays, d.rang + 1);
  return { pays: d.pays, rang: d.rang, unites: admis.length, deja: false };
}
