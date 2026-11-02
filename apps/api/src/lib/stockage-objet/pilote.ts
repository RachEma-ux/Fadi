/**
 * BD-9.1 : contrat d'un stockage objet et vérification d'intégrité en flux.
 */
import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";

export interface ObjetDecrit {
  cle: string;
  taille: number;
  /** Empreinte SHA-256 (hexadécimal) déposée avec l'objet (métadonnée `sha256`), `null` si absente. */
  sha256: string | null;
  modifieLe: Date | null;
}

/** Stockage objet (pilote `s3`) : interface étroite, simulée par les tests. */
export interface PiloteObjet {
  /** Dépose (ou remplace) un objet ; la taille et l'empreinte MD5 sont contrôlées par le service à la réception. */
  deposer(cle: string, octets: Buffer, meta: { mime: string; sha256: string }): Promise<void>;
  /** Objet entier en mémoire (petits fichiers, vérifications). */
  lire(cle: string): Promise<Buffer>;
  /** Flux de l'objet, ouvert : erreurs « introuvable » ou d'accès levées avant le premier octet. */
  ouvrir(cle: string): Promise<{ flux: Readable; taille: number | null; sha256: string | null }>;
  /** Description de l'objet, `null` s'il n'existe pas. */
  decrire(cle: string): Promise<ObjetDecrit | null>;
  supprimer(cle: string): Promise<void>;
  /** Objets dont la clé commence par `prefixe`, page par page. */
  lister(prefixe: string): AsyncIterable<ObjetDecrit>;
  /** Accès au compartiment (droits, existence) ; lève une erreur explicite sinon. */
  verifierAcces(): Promise<void>;
}

export class FichierCorrompu extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FichierCorrompu";
  }
}

export const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * Transformation qui calcule le SHA-256 du flux et **retient le dernier morceau** jusqu'à la fin : si l'empreinte ou la
 * taille diffère de l'attendu, le flux se termine en erreur avant que le dernier morceau parte, de sorte que le client
 * reçoit une réponse incomplète (jamais un fichier altéré présenté comme complet).
 */
export function verificateurSha256(attendu: string, tailleAttendue: number | null): Transform {
  const h = createHash("sha256");
  let retenu: Buffer | null = null;
  let n = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      h.update(chunk);
      n += chunk.length;
      const precedent = retenu;
      retenu = chunk;
      cb(null, precedent ?? undefined);
    },
    flush(cb) {
      const d = h.digest("hex");
      if (d !== attendu) return cb(new FichierCorrompu(`empreinte du flux différente (${d.slice(0, 12)}… au lieu de ${attendu.slice(0, 12)}…)`));
      if (tailleAttendue !== null && n !== tailleAttendue) return cb(new FichierCorrompu(`taille du flux différente (${n} au lieu de ${tailleAttendue})`));
      if (retenu) this.push(retenu);
      cb();
    },
  });
}
