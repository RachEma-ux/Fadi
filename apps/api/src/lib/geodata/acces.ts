/**
 * Accès de GeoData (9ᵉ module, ADR-GEODATA-02) : espace personnel idempotent, rôles GeoData, journal, contrôle d'accès aux
 * versions. Les autorisations ne dépendent que de l'identité vérifiée et des tables `geodata_*` : aucun projet, aucun
 * rôle de projet ni de plateforme n'entre dans une décision (INV-02, INV-03, GEO 04).
 */
import type { Response } from "express";
import type { PoolClient, QueryResultRow } from "pg";
import { capacitesDe, estRoleGeoData, type RoleGeoData } from "@parcours/geodata-model";
import { pool } from "../../db/client.js";
import { newId } from "../ids.js";
import { sourcesProvisoiresAdmises } from "./provisoires.js";

export type Executeur = Pick<PoolClient, "query">;

export async function requete<T extends QueryResultRow = Record<string, unknown>>(sql: string, valeurs: unknown[] = [], ex: Executeur = pool): Promise<T[]> {
  const r = await ex.query<T>(sql, valeurs);
  return r.rows;
}

/** Transaction sur une connexion du pool (garde DB-3 comprise en test). */
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

/** Format commun des erreurs GeoData : code métier, message traduisible, champs concernés, réessai possible. */
export function erreur(res: Response, statut: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  res.status(statut).json({ error: code, message, ...extra });
}

/** Ressource absente ou d'un autre espace : même réponse, l'existence d'un objet privé n'est jamais révélée (GEO 08). */
export const introuvable = (res: Response) => erreur(res, 404, "not_found", "Ressource introuvable.");

export interface Espace {
  readonly id: string;
  readonly type: "personnel" | "collectif";
  readonly cree_le: string;
}

/**
 * Espace personnel du compte, créé au premier appel. Idempotent, y compris pour deux premières requêtes simultanées :
 * l'index unique partiel `geodata_espaces_personnel_uniq` arbitre et la relecture renvoie la ligne gagnante.
 */
export async function espacePersonnel(userId: string, ex: Executeur = pool): Promise<Espace> {
  await ex.query(
    "INSERT INTO geodata_espaces (id, type, proprietaire_id) VALUES ($1, 'personnel', $2) ON CONFLICT (proprietaire_id) WHERE type = 'personnel' DO NOTHING",
    [newId("gdesp"), userId],
  );
  const [e] = await requete<Espace>("SELECT id, type, cree_le FROM geodata_espaces WHERE proprietaire_id = $1 AND type = 'personnel'", [userId], ex);
  return e!;
}

export async function rolesDe(userId: string, ex: Executeur = pool): Promise<RoleGeoData[]> {
  const lignes = await requete<{ role: string }>("SELECT role FROM geodata_roles WHERE user_id = $1 ORDER BY role", [userId], ex);
  return lignes.map((l) => l.role).filter(estRoleGeoData);
}

export async function capacites(userId: string) {
  return capacitesDe(await rolesDe(userId));
}

/** Journal GeoData : jamais de coordonnée, de secret ni de contenu de fichier dans `details`. */
export async function journal(acteurId: string | null, action: string, ressource: string | null, resultat: "succes" | "refus" | "echec", details: Record<string, unknown> = {}, ex: Executeur = pool): Promise<void> {
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, $2, $3, $4, $5)", [acteurId, action, ressource, resultat, JSON.stringify(details)]);
}

/**
 * Condition SQL « la source de prix liée à cette version n'est pas suspendue » (alias `v`, PRX13) : une fiche GeoData
 * déclarée par le registre des prix (`geodata_prix_sources.fiche_geodata`, ex. le baromètre FeenWay et ses indicateurs)
 * n'est consultable — catalogue, carte et tuiles, fiche d'objet, export de carte — que tant que cette source est
 * `active` ou `autorisee`. Retrait réversible et journalisé (`prix.fiche.retrait` / `prix.fiche.retablissement`) : la
 * version publiée, immuable, n'est pas modifiée ; le rétablissement de la source la rend de nouveau consultable.
 * Une version sans lien au registre des prix n'est pas concernée.
 */
export const VERSION_SOURCE_PRIX_AUTORISEE = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM geodata_sources gsp JOIN geodata_prix_sources psp ON psp.fiche_geodata = gsp.cle
     WHERE gsp.id = ${alias}.source_id AND gsp.espace_id IS NULL AND psp.statut NOT IN ('active', 'autorisee'))`;

/**
 * Condition SQL « version consultable par l'espace `$n` » (alias `v`) : version commune publiée dont la consultation est
 * autorisée, ou version privée publiée de l'espace lui-même. Une version retirée ou en préparation n'est pas consultable,
 * ni celle d'une source de prix suspendue (`VERSION_SOURCE_PRIX_AUTORISEE`).
 * Une version de source provisoire (D-GD-54) n'est servie que sur un environnement qui admet les sources provisoires :
 * ailleurs (production), elle est absente comme une version retirée, même si elle se trouvait en base.
 */
export const VERSION_CONSULTABLE = (alias: string, parametreEspace: string) =>
  `(${alias}.etat = 'publiee' AND ((${alias}.espace_id IS NULL AND ${alias}.droits->>'consultation' = 'autorise'${sourcesProvisoiresAdmises() ? "" : ` AND ${alias}.qualification = 'qualifiee'`}) OR ${alias}.espace_id = ${parametreEspace})
    AND ${VERSION_SOURCE_PRIX_AUTORISEE(alias)})`;

/** Fond cartographique déclaré par la configuration (`GEODATA_FONDS`) ; le fond neutre est toujours disponible. */
export interface Fond {
  readonly id: string;
  readonly libelle: string;
  readonly type: "neutre" | "raster";
  readonly tuiles?: readonly string[];
  readonly attribution: string;
  /** L'export d'une composition avec ce fond est-il autorisé par ses conditions ? */
  readonly export: boolean;
  readonly zoomMax?: number;
}

export const FOND_NEUTRE: Fond = { id: "neutre", libelle: "Fond neutre (sans fournisseur)", type: "neutre", attribution: "", export: true };

/** Fonds configurés : JSON `[{ id, libelle, tuiles: [url], attribution, export, zoomMax }]`. Une entrée invalide est ignorée. */
export function fondsConfigures(env: NodeJS.ProcessEnv = process.env): Fond[] {
  const fonds: Fond[] = [FOND_NEUTRE];
  try {
    const brut = env["GEODATA_FONDS"] ? (JSON.parse(env["GEODATA_FONDS"]) as unknown) : [];
    if (!Array.isArray(brut)) return fonds;
    for (const f of brut) {
      if (!f || typeof f !== "object") continue;
      const { id, libelle, tuiles, attribution, export: ex, zoomMax } = f as Record<string, unknown>;
      if (typeof id !== "string" || !/^[a-z0-9-]{2,40}$/.test(id) || id === "neutre" || typeof libelle !== "string" || typeof attribution !== "string" || attribution.trim().length < 3) continue;
      if (!Array.isArray(tuiles) || !tuiles.length || !tuiles.every((t) => typeof t === "string" && /^https:\/\/[^\s]+\{z\}[^\s]*\{x\}[^\s]*\{y\}/.test(t))) continue;
      fonds.push({ id, libelle, type: "raster", tuiles: tuiles as string[], attribution, export: ex === true, ...(typeof zoomMax === "number" ? { zoomMax } : {}) });
    }
  } catch {
    // Configuration illisible : seul le fond neutre est proposé (jamais un fond présenté comme fonctionnel à tort).
  }
  return fonds;
}

/** Activation progressive (D-GD-10) : `GEODATA_ENABLED=false` ferme toute l'API GeoData (404). */
export const geodataActive = (env: NodeJS.ProcessEnv = process.env) => env["GEODATA_ENABLED"] !== "false";
