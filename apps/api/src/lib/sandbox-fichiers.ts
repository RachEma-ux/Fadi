/**
 * Archive des fichiers de données ouverts par une extension de la Planche (protocole des extensions 1.2, décision du
 * maître d'ouvrage du 27 novembre 2026) : table `sandbox_fichiers_extensions`. Le fichier est rangé tel quel (octets
 * UTF-8), avec son empreinte SHA-256 ; le même fichier, pour le même compte et la même extension, n'est rangé qu'une
 * fois (on rend l'archive existante). Toute lecture filtre sur le compte : une archive n'est visible que de lui.
 */
import { createHash } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { pool } from "../db/client.js";
import { newId } from "./ids.js";

export type Executeur = Pick<PoolClient, "query">;

/** Caractères d'un fichier archivé (le corps JSON de l'API est borné à 256 ko) ; nom de fichier. */
export const BORNES_ARCHIVE = { texte: 200_000, nom: 80 } as const;

export interface ArchiveRangee {
  readonly id: string;
  readonly extension: string;
  readonly version: string;
  readonly nom: string;
  readonly taille: number;
  readonly empreinte: string;
  readonly ajouteLe: string;
}

interface Ligne extends QueryResultRow {
  id: string;
  extension_id: string;
  version_extension: string;
  nom: string;
  taille: number;
  empreinte: string;
  ajoute_le: Date;
}

const versArchive = (l: Ligne): ArchiveRangee => ({ id: l.id, extension: l.extension_id, version: l.version_extension, nom: l.nom, taille: l.taille, empreinte: l.empreinte, ajouteLe: l.ajoute_le.toISOString() });
const COLONNES = "id, extension_id, version_extension, nom, taille, empreinte, ajoute_le";

/** Nom de fichier simple (ni chemin ni caractère de commande), comme ceux que la Planche rend aux extensions. */
export const estNomArchive = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= BORNES_ARCHIVE.nom && !/[\\/\u0000-\u001f]/.test(v) && !v.startsWith(".");

/** Range le fichier tel quel ; rend l'archive, et `deja` si ce même fichier était déjà rangé pour ce compte. */
export async function archiverFichierExtension(compte: string, extension: string, version: string, nom: string, texte: string, ex: Executeur = pool): Promise<{ readonly archive: ArchiveRangee; readonly deja: boolean }> {
  const contenu = Buffer.from(texte, "utf8");
  const empreinte = createHash("sha256").update(contenu).digest("hex");
  const insere = await ex.query<Ligne>(
    `INSERT INTO sandbox_fichiers_extensions (id, proprietaire_id, extension_id, version_extension, nom, taille, empreinte, contenu)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (proprietaire_id, extension_id, empreinte) DO NOTHING
     RETURNING ${COLONNES}`,
    [newId("sbxfic"), compte, extension, version, nom, contenu.length, empreinte, contenu],
  );
  if (insere.rows[0]) return { archive: versArchive(insere.rows[0]), deja: false };
  const existante = await ex.query<Ligne>(`SELECT ${COLONNES} FROM sandbox_fichiers_extensions WHERE proprietaire_id = $1 AND extension_id = $2 AND empreinte = $3`, [compte, extension, empreinte]);
  return { archive: versArchive(existante.rows[0]!), deja: true };
}

/** Archives du compte, les plus récentes d'abord ; filtrées par extension si elle est donnée. */
export async function listerArchives(compte: string, extension: string | null, ex: Executeur = pool): Promise<readonly ArchiveRangee[]> {
  const r = extension
    ? await ex.query<Ligne>(`SELECT ${COLONNES} FROM sandbox_fichiers_extensions WHERE proprietaire_id = $1 AND extension_id = $2 ORDER BY ajoute_le DESC, id LIMIT 500`, [compte, extension])
    : await ex.query<Ligne>(`SELECT ${COLONNES} FROM sandbox_fichiers_extensions WHERE proprietaire_id = $1 ORDER BY ajoute_le DESC, id LIMIT 500`, [compte]);
  return r.rows.map(versArchive);
}

/** Une archive du compte et son texte tel qu'il a été rangé ; `null` si elle n'existe pas pour ce compte. */
export async function lireArchive(compte: string, id: string, ex: Executeur = pool): Promise<(ArchiveRangee & { readonly texte: string }) | null> {
  const r = await ex.query<Ligne & { contenu: Buffer }>(`SELECT ${COLONNES}, contenu FROM sandbox_fichiers_extensions WHERE proprietaire_id = $1 AND id = $2`, [compte, id]);
  const l = r.rows[0];
  return l ? { ...versArchive(l), texte: l.contenu.toString("utf8") } : null;
}
