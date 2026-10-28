/**
 * Archive en base des fichiers de données livrés (D-GD-29) : chaque fichier du dossier des sources qualifiées — fiches,
 * données (GeoJSON, CSV, TSV, GeoTIFF), tables de correspondance, extraits sans fiche importable, retraits déclarés —
 * est copié tel quel dans `geodata_fichiers` (contenu, taille, empreinte SHA-256, rôle, source). Rôle `reference` :
 * fiche de `references/`, lue par les scripts de préparation (contours d'origine), jamais importée comme couche (D-GD-30) ;
 * rôle `decoupage` : fichiers du découpage administratif (`decoupage/`, dont le fichier source du HCP tel quel, D-GD-35). L'interface et ses
 * outils ne gardent aucune donnée : les données vivent en base. Un fichier inchangé (même empreinte) n'est pas réécrit ;
 * un fichier qui n'est plus livré reste en base, marqué retiré (jamais effacé en silence). Ce module n'ouvre aucun pool.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { PoolClient } from "pg";

export type Executeur = Pick<PoolClient, "query">;

export const ROLES_FICHIER = ["fiche", "donnees", "correspondance", "extrait", "declaration", "reference", "decoupage"] as const;
export type RoleFichier = (typeof ROLES_FICHIER)[number];

export interface FichierLivre {
  readonly chemin: string;
  readonly role: RoleFichier;
  readonly sourceCle: string | null;
  readonly typeMedia: string;
  readonly taille: number;
}

export interface BilanArchive { readonly ajoutes: number; readonly modifies: number; readonly inchanges: number; readonly retires: number; readonly octets: number }

const TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json", ".geojson": "application/geo+json", ".csv": "text/csv", ".tsv": "text/tab-separated-values",
  ".tif": "image/tiff", ".tiff": "image/tiff", ".gpkg": "application/geopackage+sqlite3",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const CHEMIN = /^[A-Za-z0-9._/-]{1,200}$/;

function parcourir(dossier: string, racine: string, acc: string[]): string[] {
  for (const nom of readdirSync(dossier).sort()) {
    if (nom.startsWith(".")) continue;
    const plein = join(dossier, nom);
    if (statSync(plein).isDirectory()) parcourir(plein, racine, acc);
    else acc.push(relative(racine, plein).split(sep).join("/"));
  }
  return acc;
}

/** Chemins `donnees/…` cités par une fiche (fichier de la version, indicateurs, annexes), à toute profondeur. */
function fichiersCites(x: unknown, acc: Set<string>): Set<string> {
  if (typeof x === "string") { if (x.startsWith("donnees/")) acc.add(x); }
  else if (Array.isArray(x)) for (const v of x) fichiersCites(v, acc);
  else if (x && typeof x === "object") for (const v of Object.values(x)) fichiersCites(v, acc);
  return acc;
}

/** Inventaire du dossier des sources : rôle de chaque fichier et source (clé de fiche) quand une fiche le cite. */
export function inventaireFichiers(dossier: string): FichierLivre[] {
  const chemins = parcourir(dossier, dossier, []).filter((c) => CHEMIN.test(c) && !c.includes(".."));
  const sourceDe = new Map<string, string>();
  const fiches = new Map<string, string>();
  for (const c of chemins) {
    if (!c.endsWith(".json") || (c.includes("/") && !c.startsWith("references/"))) continue;
    try {
      const fiche = JSON.parse(readFileSync(join(dossier, c), "utf8")) as { cle?: unknown };
      if (typeof fiche.cle !== "string") continue;
      fiches.set(c, fiche.cle);
      for (const f of fichiersCites(fiche, new Set())) sourceDe.set(f, fiche.cle);
    } catch { /* fiche illisible : archivée quand même, sans source */ }
  }
  return chemins.map((chemin) => {
    const role: RoleFichier = !chemin.includes("/") ? "fiche"
      : chemin.startsWith("references/") ? "reference"
      : chemin.startsWith("correspondances/") ? "correspondance"
      : chemin.startsWith("decoupage/") ? "decoupage"
      : chemin === "donnees/retraits-sources.json" ? "declaration"
      : sourceDe.has(chemin) ? "donnees" : "extrait";
    return {
      chemin, role, sourceCle: fiches.get(chemin) ?? sourceDe.get(chemin) ?? null,
      typeMedia: TYPES[extname(chemin).toLowerCase()] ?? "application/octet-stream",
      taille: statSync(join(dossier, chemin)).size,
    };
  });
}

/** Copie en base chaque fichier livré dont l'empreinte a changé ; marque retirés ceux qui ne sont plus livrés. */
export async function archiverFichiers(ex: Executeur, dossier: string): Promise<BilanArchive> {
  const enBase = new Map((await ex.query<{ chemin: string; empreinte: string; retire: boolean }>("SELECT chemin, empreinte, retire_le IS NOT NULL AS retire FROM geodata_fichiers")).rows.map((r) => [r.chemin, r]));
  let ajoutes = 0, modifies = 0, inchanges = 0, octets = 0;
  const livres = inventaireFichiers(dossier);
  for (const f of livres) {
    const contenu = readFileSync(join(dossier, f.chemin));
    const empreinte = createHash("sha256").update(contenu).digest("hex");
    const avant = enBase.get(f.chemin);
    if (avant && avant.empreinte === empreinte && !avant.retire) {
      inchanges++;
      // Rôle et source suivent l'inventaire (une fiche peut citer un fichier jusque-là sans fiche), sans réécrire le contenu.
      await ex.query("UPDATE geodata_fichiers SET role = $2, source_cle = $3 WHERE chemin = $1 AND (role IS DISTINCT FROM $2 OR source_cle IS DISTINCT FROM $3)", [f.chemin, f.role, f.sourceCle]);
      continue;
    }
    await ex.query(
      `INSERT INTO geodata_fichiers (chemin, role, source_cle, type_media, taille, empreinte, contenu, archive_le, retire_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), NULL)
       ON CONFLICT (chemin) DO UPDATE SET role = EXCLUDED.role, source_cle = EXCLUDED.source_cle, type_media = EXCLUDED.type_media,
         taille = EXCLUDED.taille, empreinte = EXCLUDED.empreinte, contenu = EXCLUDED.contenu, archive_le = now(), retire_le = NULL`,
      [f.chemin, f.role, f.sourceCle, f.typeMedia, contenu.length, empreinte, contenu],
    );
    octets += contenu.length;
    if (avant) modifies++; else ajoutes++;
  }
  const presents = livres.map((f) => f.chemin);
  const retires = (await ex.query("UPDATE geodata_fichiers SET retire_le = now() WHERE retire_le IS NULL AND NOT (chemin = ANY($1::text[])) RETURNING chemin", [presents])).rowCount ?? 0;
  return { ajoutes, modifies, inchanges, retires, octets };
}

/** Ligne de journal lue par le bilan de l'import automatique (`import-auto.ts`). */
export const ligneBilanArchive = (b: BilanArchive): string =>
  `Archive des fichiers : ${b.ajoutes} ajouté(s), ${b.modifies} modifié(s), ${b.inchanges} inchangé(s), ${b.retires} retiré(s).`;
