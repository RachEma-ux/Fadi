/**
 * BD-9.1 (chantier base-donnees, D-BD-8, constats Q6 / S13) : fichiers des tables `step_files`, `drawing_exports`,
 * `volumes` et `com_pieces`, en base (`bytea`, pilote `base`) ou dans un stockage objet compatible S3 (pilote `s3`).
 *
 * Une ligne porte soit son contenu (`content`), soit une clé d'objet (`objet_cle`) avec l'empreinte SHA-256 et la
 * taille. Les clés sont adressées par le contenu (`<table>/<2 premiers caractères>/<sha256>`) : deux lignes au contenu
 * identique partagent un objet. Un objet n'est donc jamais supprimé avec sa ligne : le balayage des orphelins
 * (`npm run db:fichiers-vers-objet -- --orphelins`) retire ceux qu'aucune ligne ne cite plus.
 *
 * `geodata_fichiers` (archivage en base exigé par D-GD-29) et `geodata_rasters` (grilles de valeurs GeoData, pas des
 * fichiers) restent en base : ce module ne les concerne pas.
 */
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { decrireConfigStockage, lireConfigStockage, type ConfigStockage } from "./config.js";
import { FichierCorrompu, sha256Hex, verificateurSha256, type PiloteObjet } from "./pilote.js";
import { creerClientS3, piloteS3 } from "./s3.js";

export { FichierCorrompu, sha256Hex } from "./pilote.js";
export type { PiloteObjet } from "./pilote.js";

export const ESPACES_FICHIERS = ["step_files", "drawing_exports", "volumes", "com_pieces"] as const;
export type EspaceFichiers = (typeof ESPACES_FICHIERS)[number];

/** Clé d'objet d'un contenu : préfixe de table, puis répartition sur 256 sous-dossiers. */
export function cleObjet(espace: EspaceFichiers, sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("cleObjet : empreinte SHA-256 attendue");
  return `${espace}/${sha256.slice(0, 2)}/${sha256}`;
}
export const CLE_OBJET = /^(step_files|drawing_exports|volumes|com_pieces)\/[0-9a-f]{2}\/[0-9a-f]{64}$/;

interface Stockage {
  config: ConfigStockage;
  /** Présent dès que la configuration S3 est complète. */
  objet: PiloteObjet | null;
}

let courant: Stockage | null = null;

/** Stockage du processus (configuration lue une fois ; erreur explicite si elle est invalide). */
export function stockageFichiers(): Stockage {
  if (!courant) {
    const config = lireConfigStockage(process.env);
    courant = { config, objet: config.s3 ? piloteS3(creerClientS3(config.s3), config.s3.bucket) : null };
  }
  return courant;
}

/** Tests : remplace le stockage du processus (`null` : relu depuis l'environnement au prochain appel). */
export function definirStockageFichiers(s: Stockage | null): void {
  courant = s;
}

/** Démarrage de l'API : valide la configuration (refus de démarrer sinon) et renvoie une ligne de journal. */
export function initialiserStockageFichiers(): string {
  return `Stockage des fichiers : ${decrireConfigStockage(stockageFichiers().config)}.`;
}

function piloteObjet(): PiloteObjet {
  const o = stockageFichiers().objet;
  if (!o) throw new Error("stockage_objet_non_configure : fichier rangé dans le stockage objet, mais FADI_S3_* n'est pas renseigné.");
  return o;
}

/** Colonnes à écrire pour un nouveau fichier, selon le pilote d'écriture. */
export interface ColonnesFichier {
  content: Buffer | null;
  objetCle: string | null;
}

/**
 * Range un contenu : en base (pilote `base`) ou dans le stockage objet (pilote `s3`, dépôt **avant** l'insertion de la
 * ligne ; un dépôt dont la ligne n'est jamais écrite devient un orphelin, retiré par le balayage).
 */
export async function rangerFichier(espace: EspaceFichiers, octets: Buffer, mime: string): Promise<ColonnesFichier & { sha256: string }> {
  const sha256 = sha256Hex(octets);
  const s = stockageFichiers();
  if (s.config.ecriture !== "s3") return { content: octets, objetCle: null, sha256 };
  const cle = cleObjet(espace, sha256);
  await piloteObjet().deposer(cle, octets, { mime, sha256 });
  return { content: null, objetCle: cle, sha256 };
}

export interface LigneFichier {
  content: Buffer | null;
  objetCle: string | null;
}
export interface Attendu {
  /** Empreinte connue de la ligne (`empreinte`, identifiant d'un volume) ; vérifiée si présente. */
  sha256?: string | null;
  taille?: number | null;
}

function controler(octets: Buffer, attendu: Attendu, ou: string): Buffer {
  if (attendu.taille !== undefined && attendu.taille !== null && octets.length !== attendu.taille) throw new FichierCorrompu(`${ou} : taille différente de la base`);
  if (attendu.sha256 && sha256Hex(octets) !== attendu.sha256) throw new FichierCorrompu(`${ou} : empreinte différente de la base`);
  return octets;
}

/** Contenu complet d'un fichier, où qu'il soit, vérifié contre l'empreinte et la taille connues. */
export async function contenuFichier(ligne: LigneFichier, attendu: Attendu = {}): Promise<Buffer> {
  if (ligne.content) return controler(Buffer.from(ligne.content), attendu, "fichier en base");
  if (!ligne.objetCle) throw new FichierCorrompu("fichier sans contenu ni clé d'objet");
  return controler(await piloteObjet().lire(ligne.objetCle), attendu, `objet ${ligne.objetCle}`);
}

/**
 * Envoie un fichier dans la réponse (en-têtes déjà posés par l'appelant). En base : `envoyerOctets` (comportement
 * d'origine de la route). Stockage objet : flux de l'objet, sans le garder en mémoire, vérifié en route (empreinte et
 * taille ; en cas d'écart, la réponse est interrompue avant le dernier morceau).
 */
export async function envoyerFichier(res: Response, ligne: LigneFichier, attendu: Attendu, envoyerOctets: (octets: Buffer) => void = (b) => void res.end(b)): Promise<void> {
  if (ligne.content) {
    envoyerOctets(controler(Buffer.from(ligne.content), attendu, "fichier en base"));
    return;
  }
  if (!ligne.objetCle) throw new FichierCorrompu("fichier sans contenu ni clé d'objet");
  const o = await piloteObjet().ouvrir(ligne.objetCle);
  const taille = attendu.taille ?? o.taille;
  const sha = attendu.sha256 ?? o.sha256;
  if (attendu.taille != null && o.taille !== null && o.taille !== attendu.taille) {
    o.flux.destroy();
    throw new FichierCorrompu(`objet ${ligne.objetCle} : taille différente de la base`);
  }
  if (attendu.sha256 && o.sha256 && o.sha256 !== attendu.sha256) {
    o.flux.destroy();
    throw new FichierCorrompu(`objet ${ligne.objetCle} : empreinte différente de la base`);
  }
  if (taille !== null && taille !== undefined) res.setHeader("Content-Length", String(taille));
  try {
    if (sha) await pipeline(o.flux, verificateurSha256(sha, taille ?? null), res);
    else await pipeline(o.flux, res);
  } catch (e) {
    if (!res.headersSent) throw e;
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: "fichier_flux_interrompu", cle: ligne.objetCle, detail: e instanceof Error ? e.message : String(e) }));
    res.destroy();
  }
}

/** Colonnes `content` / `objet_cle` d'un nouveau volume (l'identifiant du volume reste son SHA-256). */
export async function colonnesVolume(octets: Buffer | Uint8Array, mime: string): Promise<ColonnesFichier> {
  const { content, objetCle } = await rangerFichier("volumes", Buffer.isBuffer(octets) ? octets : Buffer.from(octets), mime);
  return { content, objetCle };
}

/** Contenu d'un volume lu (en base ou stockage objet), vérifié contre son identifiant ; `null` si absent. */
export async function contenuVolume(v: { id: string; size: number; content: Buffer | null; objetCle: string | null } | undefined): Promise<Buffer | null> {
  if (!v) return null;
  try {
    return await contenuFichier(v, { sha256: v.id, taille: v.size });
  } catch (e) {
    if (e instanceof FichierCorrompu) return null;
    throw e;
  }
}
