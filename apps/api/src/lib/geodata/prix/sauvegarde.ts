/**
 * Sauvegarde logique et restauration des tables des prix (Plan Prix §8 PRX14, §9 « Schema and restore are tested on a
 * disposable database ») : chaque table `geodata_prix_*` de la chaîne (registre, éditions, lots, zones et valeurs
 * officielles, observations, quarantaine, rattachements, décisions, instantanés, biens et liens, cellules,
 * publications) est exportée ligne à ligne en JSON (`to_jsonb`), dans l'ordre de ses clés étrangères, avec une empreinte
 * SHA-256 du contenu ; la restauration réinsère ces lignes à l'identique dans des tables vides puis recale les
 * séquences. Un instantané restauré garde son identifiant, son empreinte et son manifeste ; reconstruit avec les mêmes
 * paramètres sur les entrées restaurées, il redonne la même empreinte (PRX12).
 *
 * Hors périmètre, restaurés avec leur propre table : les agrégats publiés (`geodata_prix_agregats_publies`, figés avec
 * leur version GeoData), l'archive des fichiers (`geodata_fichiers`), les comptes et le journal. Ce module n'ouvre ni
 * pool ni transaction : l'appelant les fournit (une restauration se fait dans une seule transaction).
 */
import { createHash } from "node:crypto";
import type { Executeur } from "../archive-fichiers.js";
import { ErreurPrix } from "./pipeline.js";

/** Tables sauvegardées, dans l'ordre de leurs dépendances (restauration dans cet ordre, vidage dans l'ordre inverse). */
export const TABLES_PRIX_SAUVEGARDEES = [
  "geodata_prix_sources",
  "geodata_prix_editions",
  "geodata_prix_lots",
  "geodata_prix_zones",
  "geodata_prix_valeurs_officielles",
  "geodata_prix_observations",
  "geodata_prix_quarantaine",
  "geodata_prix_rattachements",
  "geodata_prix_decisions_doublons",
  "geodata_prix_instantanes",
  "geodata_prix_biens",
  "geodata_prix_biens_observations",
  "geodata_prix_cellules",
  "geodata_prix_publications",
  "geodata_prix_decisions_rattachement",
] as const;
export type TablePrix = (typeof TABLES_PRIX_SAUVEGARDEES)[number];

/**
 * Requête de réinsertion de chaque table, écrite en clair (liste fermée des tables des prix, aucun nom de table venu de
 * l'extérieur) : les lignes sauvegardées sont relues par `jsonb_populate_recordset`, colonnes et types de la table.
 */
const REINSERTIONS: Readonly<Record<TablePrix, string>> = {
  geodata_prix_sources: "INSERT INTO geodata_prix_sources SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_sources, $1::jsonb)",
  geodata_prix_editions: "INSERT INTO geodata_prix_editions SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_editions, $1::jsonb)",
  geodata_prix_lots: "INSERT INTO geodata_prix_lots SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_lots, $1::jsonb)",
  geodata_prix_zones: "INSERT INTO geodata_prix_zones SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_zones, $1::jsonb)",
  geodata_prix_valeurs_officielles: "INSERT INTO geodata_prix_valeurs_officielles SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_valeurs_officielles, $1::jsonb)",
  geodata_prix_observations: "INSERT INTO geodata_prix_observations SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_observations, $1::jsonb)",
  geodata_prix_quarantaine: "INSERT INTO geodata_prix_quarantaine SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_quarantaine, $1::jsonb)",
  geodata_prix_rattachements: "INSERT INTO geodata_prix_rattachements SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_rattachements, $1::jsonb)",
  geodata_prix_decisions_doublons: "INSERT INTO geodata_prix_decisions_doublons SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_decisions_doublons, $1::jsonb)",
  geodata_prix_instantanes: "INSERT INTO geodata_prix_instantanes SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_instantanes, $1::jsonb)",
  geodata_prix_biens: "INSERT INTO geodata_prix_biens SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_biens, $1::jsonb)",
  geodata_prix_biens_observations: "INSERT INTO geodata_prix_biens_observations SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_biens_observations, $1::jsonb)",
  geodata_prix_cellules: "INSERT INTO geodata_prix_cellules SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_cellules, $1::jsonb)",
  geodata_prix_publications: "INSERT INTO geodata_prix_publications SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_publications, $1::jsonb)",
  geodata_prix_decisions_rattachement: "INSERT INTO geodata_prix_decisions_rattachement SELECT * FROM jsonb_populate_recordset(NULL::geodata_prix_decisions_rattachement, $1::jsonb)",
};

/** Tables à identifiant `bigserial` : séquence recalée après restauration. */
const SEQUENCES: readonly TablePrix[] = ["geodata_prix_observations", "geodata_prix_quarantaine", "geodata_prix_decisions_doublons", "geodata_prix_publications", "geodata_prix_decisions_rattachement"];

export const FORMAT_SAUVEGARDE_PRIX = "fadi-geodata-prix-sauvegarde-1";

export interface SauvegardePrix {
  readonly format: typeof FORMAT_SAUVEGARDE_PRIX;
  readonly tables: Readonly<Record<TablePrix, readonly Record<string, unknown>[]>>;
  /** SHA-256 du JSON des tables (contrôle d'intégrité à la restauration). */
  readonly empreinte: string;
}

const empreinteTables = (tables: SauvegardePrix["tables"]) => createHash("sha256").update(JSON.stringify(TABLES_PRIX_SAUVEGARDEES.map((t) => tables[t])), "utf8").digest("hex");

/** Lignes d'une table, ordre stable (clé primaire ou ensemble de la ligne) ; géométrie en EWKB hexadécimal. */
async function lireTable(ex: Executeur, t: TablePrix): Promise<Record<string, unknown>[]> {
  const ligne = t === "geodata_prix_zones" ? `to_jsonb(x) - 'geom' || jsonb_build_object('geom', CASE WHEN x.geom IS NULL THEN NULL ELSE encode(ST_AsEWKB(x.geom), 'hex') END)` : "to_jsonb(x)";
  const [r] = (await ex.query<{ lignes: Record<string, unknown>[] }>(`SELECT coalesce(jsonb_agg(${ligne} ORDER BY to_jsonb(x)::text), '[]'::jsonb) AS lignes FROM ${t} x`)).rows;
  return r?.lignes ?? [];
}

/** Sauvegarde logique de toutes les tables des prix (lecture seule ; à faire dans une transaction pour un état cohérent). */
export async function sauvegarderPrix(ex: Executeur): Promise<SauvegardePrix> {
  const tables = {} as Record<TablePrix, Record<string, unknown>[]>;
  for (const t of TABLES_PRIX_SAUVEGARDEES) tables[t] = await lireTable(ex, t);
  return { format: FORMAT_SAUVEGARDE_PRIX, tables, empreinte: empreinteTables(tables) };
}

/**
 * Restaure une sauvegarde dans des tables des prix **vides** (refus 409 sinon : une restauration ne fusionne jamais) ;
 * empreinte contrôlée avant toute écriture ; séquences recalées. Renvoie le nombre de lignes restaurées par table.
 */
export async function restaurerPrix(ex: Executeur, s: SauvegardePrix): Promise<Record<TablePrix, number>> {
  if (s.format !== FORMAT_SAUVEGARDE_PRIX) throw new ErreurPrix(400, "format_sauvegarde", "Format de sauvegarde des prix inconnu.");
  if (empreinteTables(s.tables) !== s.empreinte) throw new ErreurPrix(400, "empreinte_sauvegarde", "Sauvegarde altérée : empreinte différente.");
  for (const t of TABLES_PRIX_SAUVEGARDEES) {
    const [n] = (await ex.query<{ n: string }>(`SELECT count(*) AS n FROM ${t}`)).rows;
    if (Number(n?.n) > 0) throw new ErreurPrix(409, "tables_non_vides", `Restauration refusée : ${t} n'est pas vide.`, { table: t });
  }
  const bilan = {} as Record<TablePrix, number>;
  for (const t of TABLES_PRIX_SAUVEGARDEES) {
    const lignes = s.tables[t];
    bilan[t] = lignes.length;
    for (let i = 0; i < lignes.length; i += 2000) {
      await ex.query(REINSERTIONS[t], [JSON.stringify(lignes.slice(i, i + 2000))]);
    }
  }
  for (const t of SEQUENCES) await ex.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), coalesce((SELECT max(id) FROM ${t}), 1), (SELECT max(id) FROM ${t}) IS NOT NULL)`);
  return bilan;
}
