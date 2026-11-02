/**
 * BD-9.6 (constat B8, D-BD-6, D-GD-29) : chargement des catalogues de données du Parcours en base.
 *
 * Source qualifiée : les fichiers du dépôt `apps/api/src/data/` (extraction traçable du prototype,
 * `scripts/extract-prototype-data.mjs`), copiés à côté du bundle (`dist/data/`) par `scripts/build.mjs`. C'est le SEUL
 * module qui nomme ces fichiers ; l'API les lit en base (`lib/catalogues.ts`) — test `catalogues-sans-import.test.ts`.
 *
 * Pour chaque catalogue, en une transaction (verrou consultatif par catalogue) :
 *  - empreinte SHA-256 des octets du fichier ;
 *  - même empreinte déjà publiée → rien (idempotent) ; déjà présente mais non publiée (retour à une livraison
 *    antérieure) → republiée ; sinon nouvelle version numérotée : fichier archivé tel quel (`fichier`, `taille`,
 *    `empreinte`) et contenu en `jsonb`, puis publiée.
 * Le contenu n'est jamais modifié : un fichier illisible (JSON invalide, forme inattendue) est refusé, rien n'est écrit.
 *
 * Lancé par la migration (`db/migrate.ts`, service `migrate` / `MIGRATE_ONLY=1` de `server.ts`) juste après les
 * migrations, et à la main par `npm run db:catalogues:charger` (`db/catalogues-charger.ts`). Rôle : celui de la
 * migration (propriétaire ; `fadi_app` n'a que SELECT sur ces tables).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { dataFileUrl } from "../runtime-paths.js";
import { CLES_CATALOGUES, TITRES_CATALOGUES, type CleCatalogue } from "../lib/catalogues.js";

/** Fichier source de chaque catalogue, et clés de premier niveau qu'il doit porter (contrôle de forme, sans réécriture). */
export const SOURCES_CATALOGUES: Readonly<Record<CleCatalogue, { fichier: string; cles: readonly string[] }>> = Object.freeze({
  "bibliotheque-batiments": { fichier: "building-library.json", cles: ["version", "date", "profiles", "references", "cases", "surfaceConvention"] },
  "harmonie-profils": { fichier: "harmonie-profiles.json", cles: ["states", "retainedStates", "aliases", "defaultProfile", "mixedTrainingOffices", "profiles"] },
  "harmonie-moteur": { fichier: "harmony-engine.json", cles: ["version", "ruleVersion", "types", "phases", "readings", "rules", "dirs", "gua", "sources", "flight"] },
  "programme-repartition": { fichier: "programme-repartition.json", cles: ["defaults", "modes", "families", "types", "adjacency", "statusNote", "subtitle", "transfer"] },
});

export type ResultatCatalogue = "chargee" | "republiee" | "inchangee";
export interface BilanCatalogue {
  cle: CleCatalogue;
  resultat: ResultatCatalogue;
  version: number;
  empreinte: string;
  taille: number;
}

export interface FichierCatalogue {
  octets: Buffer;
  /** Chemin enregistré comme source (dépôt). */
  source: string;
  fichier: string;
}

/** Lecture du fichier livré (dossier `data/` à côté du module ou du bundle). */
export function lireFichierCatalogue(cle: CleCatalogue, dossier?: URL): FichierCatalogue {
  const { fichier } = SOURCES_CATALOGUES[cle];
  const url = dossier ? new URL(fichier, dossier) : dataFileUrl(fichier);
  return { octets: readFileSync(fileURLToPath(url)), source: `apps/api/src/data/${fichier}`, fichier };
}

/** Contrôle sans réécriture : JSON UTF-8 valide, objet portant les clés attendues. Renvoie le texte tel quel. */
export function controlerFichierCatalogue(cle: CleCatalogue, octets: Buffer): string {
  const texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch (err) {
    throw new Error(`Catalogue ${cle} : JSON invalide (${(err as Error).message}).`);
  }
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) throw new Error(`Catalogue ${cle} : objet JSON attendu.`);
  const manquantes = SOURCES_CATALOGUES[cle].cles.filter((k) => !(k in (valeur as Record<string, unknown>)));
  if (manquantes.length) throw new Error(`Catalogue ${cle} : clés absentes (${manquantes.join(", ")}).`);
  return texte;
}

export const empreinteCatalogue = (octets: Buffer): string => createHash("sha256").update(octets).digest("hex");

/** Charge un catalogue (voir l'en-tête). */
export async function chargerCatalogue(pool: Pool, cle: CleCatalogue, f: FichierCatalogue): Promise<BilanCatalogue> {
  const texte = controlerFichierCatalogue(cle, f.octets);
  const empreinte = empreinteCatalogue(f.octets);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const { rows: prop } = await client.query<{ ok: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') AND pg_has_role(current_user, 'fadi_owner', 'MEMBER') AS ok",
      );
      if (prop[0]?.ok) await client.query("SET LOCAL ROLE fadi_owner");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fadi:catalogue:${cle}`]);
      await client.query("INSERT INTO catalogues (cle, titre) VALUES ($1, $2) ON CONFLICT (cle) DO NOTHING", [cle, TITRES_CATALOGUES[cle]]);
      const publiee = (await client.query<{ id: string | null }>("SELECT version_publiee_id::text AS id FROM catalogues WHERE cle = $1", [cle])).rows[0]?.id ?? null;
      const existante = (await client.query<{ id: string; numero: number }>("SELECT id::text AS id, numero FROM catalogue_versions WHERE catalogue_cle = $1 AND empreinte = $2", [cle, empreinte])).rows[0];
      let bilan: BilanCatalogue;
      if (existante && existante.id === publiee) {
        bilan = { cle, resultat: "inchangee", version: existante.numero, empreinte, taille: f.octets.length };
      } else {
        let id: string;
        let numero: number;
        let resultat: ResultatCatalogue;
        if (existante) {
          ({ id, numero } = existante);
          resultat = "republiee";
        } else {
          const r = await client.query<{ id: string; numero: number }>(
            `INSERT INTO catalogue_versions (catalogue_cle, numero, fichier_nom, source, type_media, taille, empreinte, fichier, contenu, charge_par)
             SELECT $1, COALESCE(max(numero), 0) + 1, $2, $3, 'application/json', $4, $5, $6, $7::jsonb, session_user
               FROM catalogue_versions WHERE catalogue_cle = $1
             RETURNING id::text AS id, numero`,
            [cle, f.fichier, f.source, f.octets.length, empreinte, f.octets, texte],
          );
          ({ id, numero } = r.rows[0]!);
          resultat = "chargee";
        }
        await client.query("UPDATE catalogues SET version_publiee_id = $2, publie_le = now() WHERE cle = $1", [cle, id]);
        bilan = { cle, resultat, version: numero, empreinte, taille: f.octets.length };
      }
      await client.query("COMMIT");
      return bilan;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  } finally {
    client.release();
  }
}

/** Charge tous les catalogues livrés ; s'arrête à la première erreur (les catalogues déjà traités restent chargés). */
export async function chargerCatalogues(pool: Pool, o: { dossier?: URL } = {}): Promise<BilanCatalogue[]> {
  const bilans: BilanCatalogue[] = [];
  for (const cle of CLES_CATALOGUES) bilans.push(await chargerCatalogue(pool, cle, lireFichierCatalogue(cle, o.dossier)));
  return bilans;
}

export function ligneBilanCatalogues(bilans: BilanCatalogue[]): string {
  return `Catalogues : ${bilans.map((b) => `${b.cle} v${b.version} ${b.resultat === "chargee" ? "chargée" : b.resultat === "republiee" ? "republiée" : "inchangée"}`).join(", ")}.`;
}
