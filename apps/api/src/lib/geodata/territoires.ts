/**
 * Chargement du découpage territorial en base (lot H, D-GD-28 ; D-GD-35) : les unités d'une version **publiée** dont la
 * fiche déclare `territoire` sont copiées dans `geodata_territoires` (pays, rang, code, nom, géométrie, version
 * d'origine) ; le niveau (nom, règle de parenté) est consigné dans `geodata_pays.niveaux`. Une nouvelle version du même
 * niveau remplace l'ancienne ; recharger la même version ne refait rien. Les parents ne sont jamais devinés :
 *   - règle « decoupage » : le niveau (rang, noms) vient de la table des niveaux en base, les unités admises sont les
 *     entités de ce niveau en base, et le parent de chaque unité est le lien parent → enfant de la table des entités ;
 *   - règle « inclusion » (pays sans découpage importé) : l'unité du rang au-dessus qui contient un point intérieur.
 * L'appelant encadre l'appel d'une transaction (remplacement d'un rang et recalcul des parents atomiques, invisibles tant
 * qu'ils ne sont pas terminés) : voir `assurerTerritoires` dans `db/geodata-reference.ts`.
 */
import { regleDe, type DeclarationTerritoire, type RegleParent } from "@parcours/geodata-model";
import type { PoolClient, QueryResultRow } from "pg";

/** Connexion fournie par l'appelant (route ou ligne de commande d'import) : ce module n'ouvre aucun pool. */
export type Executeur = Pick<PoolClient, "query">;
const requete = async <T extends QueryResultRow = Record<string, unknown>>(sql: string, valeurs: unknown[], ex: Executeur): Promise<T[]> => (await ex.query<T>(sql, valeurs)).rows;

/** Niveau déclaré absent de la table des niveaux en base : le découpage n'a pas encore été importé (import unique). */
export class NiveauAbsent extends Error {}

export interface BilanTerritoires { readonly pays: string; readonly rang: number; readonly unites: number; readonly deja: boolean; readonly niveau: string }

async function regleDuRang(ex: Executeur, pays: string, rang: number): Promise<RegleParent | null> {
  const [r] = await requete<{ regle: string | null }>("SELECT niveaux -> $2::text ->> 'parent' AS regle FROM geodata_pays WHERE code = $1", [pays, String(rang)], ex);
  return r?.regle === "decoupage" || r?.regle === "inclusion" ? r.regle : null;
}

/** Recalcule `parent_code` des unités d'un rang d'après la règle de ce rang. */
export async function majParents(ex: Executeur, pays: string, rang: number): Promise<void> {
  const regle = await regleDuRang(ex, pays, rang);
  if (regle === "decoupage") {
    await requete(
      `UPDATE geodata_territoires t SET parent_code = e.parent_code FROM geodata_entites_administratives e
        WHERE e.pays = t.pays AND e.code = t.code AND t.pays = $1 AND t.rang = $2 AND t.parent_code IS DISTINCT FROM e.parent_code`, [pays, rang], ex);
    return;
  }
  if (regle === "inclusion" && rang > 1) {
    await requete(
      `UPDATE geodata_territoires t SET parent_code = (
         SELECT p.code FROM geodata_territoires p
          WHERE p.pays = t.pays AND p.rang = t.rang - 1 AND ST_Contains(p.geom, ST_PointOnSurface(t.geom))
          ORDER BY ST_Area(p.geom) LIMIT 1)
        WHERE t.pays = $1 AND t.rang = $2`, [pays, rang], ex);
  }
}

/** Recalcule les parents de tous les rangs chargés d'un pays (après un import du découpage). */
export async function majParentsDuPays(ex: Executeur, pays: string): Promise<void> {
  for (const { rang } of await requete<{ rang: number }>("SELECT DISTINCT rang FROM geodata_territoires WHERE pays = $1 ORDER BY rang", [pays], ex)) await majParents(ex, pays, rang);
}

/** Niveau déclaré par la fiche : rang et noms, lus en base pour la règle « decoupage ». */
async function niveauDeclare(ex: Executeur, d: DeclarationTerritoire) {
  if (typeof d.niveau !== "string") return { rang: (d as { rang: number }).rang, singulier: d.niveau.singulier, pluriel: d.niveau.pluriel, code: null as string | null };
  const [n] = await requete<{ rang: number; singulier: string; pluriel: string }>(
    "SELECT rang, singulier, pluriel FROM geodata_niveaux_administratifs WHERE pays = $1 AND code = $2", [d.pays, d.niveau], ex);
  if (!n) throw new NiveauAbsent(`Niveau « ${d.niveau} » absent du découpage ${d.pays} en base : lancer d'abord l'import unique du découpage (geodata-reference --decoupage).`);
  return { ...n, code: d.niveau };
}

/** Charge (ou confirme) le niveau déclaré par une version publiée. */
export async function chargerTerritoires(ex: Executeur, versionId: string, d: DeclarationTerritoire): Promise<BilanTerritoires> {
  const [v] = await requete<{ couche_id: string; etat: string }>("SELECT c.id AS couche_id, v.etat FROM geodata_versions v JOIN geodata_couches c ON c.version_id = v.id WHERE v.id = $1", [versionId], ex);
  if (!v) throw new Error(`Version ${versionId} sans couche : découpage territorial non chargé.`);
  if (v.etat !== "publiee") throw new Error(`Version ${versionId} non publiée (${v.etat}) : découpage territorial non chargé.`);
  const regle = regleDe(d);
  const n = await niveauDeclare(ex, d);
  // La déclaration (nom du pays, noms du niveau, règle de parenté) est toujours répercutée, même quand les unités de
  // cette version sont déjà en base : une fiche corrigée sans nouvelle donnée change la barre au redéploiement.
  const regleAvant = await regleDuRang(ex, d.pays, n.rang);
  await requete(
    `INSERT INTO geodata_pays (code, nom, niveaux) VALUES ($1, $2, jsonb_build_object($3::text, $4::jsonb))
     ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, niveaux = geodata_pays.niveaux || EXCLUDED.niveaux, mis_a_jour_le = now()`,
    [d.pays, d.nomPays, String(n.rang), JSON.stringify({ singulier: n.singulier, pluriel: n.pluriel, parent: regle, ...(n.code ? { niveau: n.code } : {}) })], ex);
  const libelle = n.code ?? n.pluriel;
  // Codes admis : pour la règle « decoupage », les entités non retirées de ce niveau **en base maintenant** (un nouvel
  // import du découpage peut en ajouter, en retirer ou en changer de niveau sans nouvelle version de la couche).
  const admis = (regle === "decoupage"
    ? await requete<{ code: string }>(
      `SELECT o.code FROM geodata_objets o JOIN geodata_entites_administratives e ON e.pays = $1 AND e.code = o.code AND e.niveau = $3 AND e.retire_le IS NULL
        WHERE o.couche_id = $2 AND ST_Dimension(o.geom) = 2`, [d.pays, v.couche_id, n.code], ex)
    : await requete<{ code: string }>("SELECT code FROM geodata_objets WHERE couche_id = $1 AND ST_Dimension(geom) = 2 AND btrim(code) <> ''", [v.couche_id], ex)).map((o) => o.code).sort();
  const charges = (await requete<{ code: string }>("SELECT code FROM geodata_territoires WHERE pays = $1 AND rang = $2 AND version_id = $3 ORDER BY code", [d.pays, n.rang, versionId], ex)).map((r) => r.code);
  // Même version, même règle et mêmes unités admises : rien à refaire (les parents suivent quand même les liens en base).
  const memes = charges.length > 0 && charges.length === admis.length && [...charges].sort().every((c, i) => c === admis[i]);
  if (memes && regleAvant === regle) { await majParents(ex, d.pays, n.rang); return { pays: d.pays, rang: n.rang, unites: charges.length, deja: true, niveau: libelle }; }
  await requete("DELETE FROM geodata_territoires WHERE pays = $1 AND rang = $2", [d.pays, n.rang], ex);
  // Un code du découpage est unique dans le pays : une unité qui change de rang (nouveau niveau intercalé) quitte l'ancien.
  if (regle === "decoupage") await requete("DELETE FROM geodata_territoires WHERE pays = $1 AND code = ANY($2::text[])", [d.pays, admis], ex);
  await requete(
    `INSERT INTO geodata_territoires (pays, rang, code, nom, geom, version_id)
     SELECT $1, $2, o.code, coalesce(nullif(btrim(o.nom), ''), o.code), o.geom, $3
       FROM geodata_objets o WHERE o.couche_id = $4 AND o.code = ANY($5::text[]) AND ST_Dimension(o.geom) = 2`,
    [d.pays, n.rang, versionId, v.couche_id, admis], ex);
  await majParentsDuPays(ex, d.pays);
  return { pays: d.pays, rang: n.rang, unites: admis.length, deja: false, niveau: libelle };
}
