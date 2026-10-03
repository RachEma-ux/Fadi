/**
 * Volumes immuables adressés par contenu (cahier des charges §5.5) : un volume est identifié par le SHA-256 de ses
 * octets (64 chiffres hexadécimaux) ; écrire deux fois le même contenu ne crée qu'un volume. L'interface
 * `VolumeStore` isole l'implémentation : base de données aujourd'hui (table `volumes`), stockage objet plus tard,
 * hors dépôt (§10.1, point 4).
 *
 * Le type MIME est celui de la première écriture (le contenu fait l'identité, pas le type) ; il n'est jamais
 * utilisé pour servir le contenu autrement qu'en pièce jointe.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { db } from "../db/client.js";

/** Identifiant d'un volume : SHA-256 hexadécimal (minuscules) du contenu. */
export type IdVolume = string;

export const MOTIF_ID_VOLUME = /^[0-9a-f]{64}$/;

export interface Volume {
  readonly id: IdVolume;
  readonly mime: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}

export interface VolumeStore {
  /** Enregistre le contenu (sans effet s'il existe déjà) et rend son identifiant SHA-256. */
  put(bytes: Uint8Array, mime: string): Promise<IdVolume>;
  /** Contenu et métadonnées, ou `null` si le volume n'existe pas (identifiant mal formé compris). */
  get(id: IdVolume): Promise<Volume | null>;
  has(id: IdVolume): Promise<boolean>;
}

export class ErreurVolume extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurVolume";
  }
}

/** SHA-256 hexadécimal d'un contenu (identifiant de volume). */
export function idVolume(bytes: Uint8Array): IdVolume {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Base ou transaction Drizzle (node-postgres). */
export type Executeur = Pick<typeof db, "execute">;

/** Implémentation sur la table `volumes` ; utilisable dans une transaction (`new VolumeStoreBase(tx)`). */
export class VolumeStoreBase implements VolumeStore {
  constructor(private readonly executeur: Executeur) {}

  async put(bytes: Uint8Array, mime: string): Promise<IdVolume> {
    if (!(bytes instanceof Uint8Array)) throw new ErreurVolume("Volume : contenu binaire attendu (Uint8Array).");
    if (typeof mime !== "string" || mime.trim() === "") throw new ErreurVolume("Volume : type MIME obligatoire.");
    const id = idVolume(bytes);
    const contenu = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await this.executeur.execute(
      sql`INSERT INTO volumes (id, mime, size, content) VALUES (${id}, ${mime}, ${bytes.byteLength}, ${contenu}) ON CONFLICT (id) DO NOTHING`,
    );
    return id;
  }

  async get(id: IdVolume): Promise<Volume | null> {
    if (!MOTIF_ID_VOLUME.test(id)) return null;
    const r = await this.executeur.execute(sql`SELECT id, mime, size, content FROM volumes WHERE id = ${id}`);
    const ligne = r.rows[0] as { id: string; mime: string; size: string | number; content: Buffer } | undefined;
    if (!ligne) return null;
    return { id: ligne.id, mime: ligne.mime, size: Number(ligne.size), bytes: new Uint8Array(ligne.content) };
  }

  async has(id: IdVolume): Promise<boolean> {
    if (!MOTIF_ID_VOLUME.test(id)) return false;
    const r = await this.executeur.execute(sql`SELECT 1 FROM volumes WHERE id = ${id}`);
    return r.rows.length > 0;
  }
}
