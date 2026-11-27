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

/**
 * Caractères du texte lu (borne du protocole 1.2), octets du fichier (4 par caractère au plus), nom de fichier, et corps
 * de la requête (octets en base 64, plus le nom et l'extension) : la route a sa propre lecture de corps.
 */
export const BORNES_ARCHIVE = { texte: 200_000, octets: 800_000, nom: 80, corps: "1200kb" } as const;

/**
 * Octets reçus en base 64, contrôlés : base 64 stricte, UTF-8 valide, bornes. Rend les octets tels quels (marque
 * d'ordre comprise) ou le motif du refus ; le texte décodé ne sert qu'à compter les caractères.
 */
export function lireOctetsArchive(v: unknown): { readonly ok: true; readonly octets: Buffer } | { readonly ok: false; readonly statut: 400 | 413; readonly detail: string } {
  if (typeof v !== "string" || v.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) return { ok: false, statut: 400, detail: "contenu : octets du fichier en base 64" };
  if ((v.length / 4) * 3 > BORNES_ARCHIVE.octets + 2) return { ok: false, statut: 413, detail: `${BORNES_ARCHIVE.octets} octets au plus` };
  const octets = Buffer.from(v, "base64");
  if (octets.length > BORNES_ARCHIVE.octets) return { ok: false, statut: 413, detail: `${BORNES_ARCHIVE.octets} octets au plus` };
  let texte: string;
  try {
    texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    return { ok: false, statut: 400, detail: "contenu : texte UTF-8 attendu" };
  }
  if (texte.length > BORNES_ARCHIVE.texte) return { ok: false, statut: 413, detail: `${BORNES_ARCHIVE.texte} caractères au plus` };
  return { ok: true, octets };
}

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

/** Range les octets du fichier tels quels ; rend l'archive, et `deja` si ce même fichier était déjà rangé pour ce compte. */
export async function archiverFichierExtension(compte: string, extension: string, version: string, nom: string, contenu: Buffer, ex: Executeur = pool): Promise<{ readonly archive: ArchiveRangee; readonly deja: boolean }> {
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

/** Une archive du compte : ses octets tels qu'ils ont été rangés (base 64) et leur texte ; `null` si elle n'est pas au compte. */
export async function lireArchive(compte: string, id: string, ex: Executeur = pool): Promise<(ArchiveRangee & { readonly texte: string; readonly contenu: string }) | null> {
  const r = await ex.query<Ligne & { contenu: Buffer }>(`SELECT ${COLONNES}, contenu FROM sandbox_fichiers_extensions WHERE proprietaire_id = $1 AND id = $2`, [compte, id]);
  const l = r.rows[0];
  return l ? { ...versArchive(l), texte: new TextDecoder("utf-8").decode(l.contenu), contenu: l.contenu.toString("base64") } : null;
}
