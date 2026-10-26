/**
 * Ramasse-miettes des volumes immuables (`volumes`, contenu adressé par SHA-256). Un volume n'appartient à aucun
 * projet : il est partagé par contenu entre les publications qui le citent. Quand ces publications disparaissent
 * (suppression d'un projet : les publications de l'Atelier partent en cascade), leurs volumes restent orphelins.
 *
 * Références connues (relevé exhaustif de `db/schema.ts` et `db/init.sql`, aucune clé étrangère ne vise `volumes`) :
 *   - `atelier_publications.documents` (jsonb) : `DocumentPublie[].volumeId` ;
 *   - `studio_publications.package` (jsonb) : `StudioPublicationPackage.files[].sha256` ;
 *   - `review_packages.files` (jsonb) : fichiers figés d'un paquet de revue au partage (phase 4), `files[].sha256` ;
 *   - `review_findings.attachments` (jsonb) : pièces jointes des constats de revue, `attachments[].sha256` ;
 *   - `studio_observations.pieces` (jsonb) : pièces justificatives des observations Studio (IF-010), `pieces[].sha256`.
 *
 * Prudence : chaque colonne citée est parcourue en entier et **toute** chaîne qui s'y trouve compte comme une
 * référence (pas seulement les champs attendus) ; avant de supprimer quoi que ce soit, le nettoyage vérifie dans le
 * catalogue de la base qu'aucune autre table ne cite `volumes` (clé étrangère, colonne nommée « volume ») — sinon il
 * refuse sans rien toucher. Tout se passe dans une transaction qui verrouille `volumes` et les tables de référence
 * contre l'écriture (une publication en cours d'écriture est attendue, jamais perdue) ; un volume cité n'est jamais
 * supprimé. Idempotent : un second passage ne trouve plus rien.
 *
 * Les fonctions de relevé sont pures (essai : `volumes-gc.test.ts`) ; `nettoyerVolumes` reçoit le pool `pg` de
 * l'appelant (route de suppression d'un projet, script de maintenance `src/db/volumes-gc.ts`).
 */
import type { Pool } from "pg";

/** Tables et colonnes qui citent un volume par son identifiant. */
export const REFERENCES_VOLUMES: readonly { table: string; colonne: string; chemin: string }[] = Object.freeze([
  { table: "atelier_publications", colonne: "documents", chemin: "documents[].volumeId" },
  { table: "studio_publications", colonne: "package", chemin: "package.files[].sha256" },
  { table: "review_packages", colonne: "files", chemin: "files[].sha256" },
  { table: "review_findings", colonne: "attachments", chemin: "attachments[].sha256" },
  { table: "studio_observations", colonne: "pieces", chemin: "pieces[].sha256" },
]);

/** Toutes les chaînes d'une valeur JSON (clés comprises), récursivement : relevé volontairement large. */
export function chainesDe(valeur: unknown, out: Set<string> = new Set(), profondeur = 0): Set<string> {
  if (profondeur > 64) throw new Error("volumes_gc_json_trop_profond");
  if (typeof valeur === "string") out.add(valeur);
  else if (Array.isArray(valeur)) for (const v of valeur) chainesDe(v, out, profondeur + 1);
  else if (valeur !== null && typeof valeur === "object") {
    for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) { out.add(k); chainesDe(v, out, profondeur + 1); }
  }
  return out;
}

/**
 * Identifiants cités par les colonnes de référence : une entrée par table (`REFERENCES_VOLUMES`), chaque valeur étant
 * le contenu d'une ligne (jsonb déjà lu, ou texte JSON). Une valeur texte illisible arrête le relevé (jamais ignorée).
 */
export function collecterReferencesVolumes(valeurs: Readonly<Record<string, readonly unknown[]>>): Set<string> {
  const refs = new Set<string>();
  for (const ref of REFERENCES_VOLUMES) {
    const lignes = valeurs[ref.table];
    if (!lignes) throw new Error(`volumes_gc_table_non_lue:${ref.table}`);
    for (const v of lignes) chainesDe(typeof v === "string" ? JSON.parse(v) : v, refs);
  }
  return refs;
}

/** Volumes qu'aucune référence ne cite (comparaison exacte, puis en minuscules par prudence). */
export function volumesOrphelins(ids: readonly string[], refs: ReadonlySet<string>): string[] {
  const basses = new Set([...refs].map((r) => r.toLowerCase()));
  return ids.filter((id) => !refs.has(id) && !basses.has(id.toLowerCase()));
}

/** Colonnes du catalogue qui pourraient citer `volumes` sans être connues : le nettoyage refuse alors de supprimer. */
export function referencesInconnues(colonnes: readonly { table: string; colonne: string }[]): { table: string; colonne: string }[] {
  const connues = new Set(REFERENCES_VOLUMES.map((r) => `${r.table}.${r.colonne}`));
  return colonnes.filter((c) => c.table !== "volumes" && !connues.has(`${c.table}.${c.colonne}`));
}

export interface BilanNettoyageVolumes {
  examines: number;
  references: number;
  orphelins: number;
  supprimes: number;
  /** Taille cumulée des volumes orphelins (supprimés, ou qui le seraient en essai). */
  octetsOrphelins: number;
  essai: boolean;
}

/**
 * Supprime, dans une transaction, les volumes qu'aucune publication ne cite. `essai` : compte sans supprimer.
 * Refuse (exception, rien de supprimé) si une référence inconnue à `volumes` apparaît dans le catalogue de la base.
 */
export async function nettoyerVolumes(pool: Pool, options: { essai?: boolean; lockTimeoutMs?: number } = {}): Promise<BilanNettoyageVolumes> {
  const essai = options.essai ?? false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${Math.max(100, Math.floor(options.lockTimeoutMs ?? 5000))}ms'`);
    // Une écriture en cours (volume rangé, publication pas encore validée) est attendue ; les écritures suivantes
    // attendent la fin du nettoyage. Les lectures ne sont pas bloquées.
    await client.query("LOCK TABLE volumes, atelier_publications, studio_publications, review_packages, review_findings, studio_observations IN SHARE ROW EXCLUSIVE MODE");
    const fk = await client.query<{ table: string; colonne: string }>(
      `SELECT tc.table_name AS table, kcu.column_name AS colonne
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'volumes' AND tc.table_schema = current_schema()`,
    );
    const nommees = await client.query<{ table: string; colonne: string }>(
      `SELECT table_name AS table, column_name AS colonne FROM information_schema.columns
        WHERE table_schema = current_schema() AND column_name ILIKE '%volume%'`,
    );
    const inconnues = referencesInconnues([...fk.rows, ...nommees.rows]);
    if (inconnues.length) throw new Error(`volumes_gc_reference_inconnue:${inconnues.map((c) => `${c.table}.${c.colonne}`).join(",")}`);
    const valeurs: Record<string, unknown[]> = {};
    for (const ref of REFERENCES_VOLUMES) {
      const r = await client.query<{ v: unknown }>(`SELECT "${ref.colonne}" AS v FROM "${ref.table}" WHERE "${ref.colonne}" IS NOT NULL`);
      valeurs[ref.table] = r.rows.map((x) => x.v);
    }
    const refs = collecterReferencesVolumes(valeurs);
    const tous = await client.query<{ id: string; size: number }>("SELECT id, size FROM volumes");
    const orphelins = new Set(volumesOrphelins(tous.rows.map((r) => r.id), refs));
    const octets = tous.rows.filter((r) => orphelins.has(r.id)).reduce((s, r) => s + Number(r.size), 0);
    let supprimes = 0;
    if (!essai && orphelins.size) {
      const del = await client.query("DELETE FROM volumes WHERE id = ANY($1::text[])", [[...orphelins]]);
      supprimes = del.rowCount ?? 0;
    }
    await client.query(essai ? "ROLLBACK" : "COMMIT");
    return { examines: tous.rows.length, references: tous.rows.length - orphelins.size, orphelins: orphelins.size, supprimes, octetsOrphelins: octets, essai };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
