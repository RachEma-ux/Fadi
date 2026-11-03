/**
 * BD-9.1 : pilote `s3` (service compatible S3, hébergé en Suisse selon D-BD-8 — l'hébergeur n'est pas choisi ici).
 *
 * - Dépôt : `Content-MD5` (le service refuse un corps altéré en route) et métadonnée `sha256` (empreinte de Fadi).
 * - Les sommes de contrôle « flexibles » du SDK (CRC32 par défaut depuis 2025) ne sont envoyées que si l'opération les
 *   exige : plusieurs services compatibles S3 ne les acceptent pas.
 * - Le client est injecté (`EnvoyeurS3`) pour que les tests simulent le service sans réseau.
 */
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import type { ConfigS3 } from "./config.js";
import type { ObjetDecrit, PiloteObjet } from "./pilote.js";

/** Ce que le pilote utilise du client du SDK (`S3Client.send`). */
export interface EnvoyeurS3 {
  send(commande: unknown): Promise<unknown>;
}

export function creerClientS3(c: ConfigS3): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
  });
}

const introuvable = (e: unknown) => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return x?.name === "NotFound" || x?.name === "NoSuchKey" || x?.$metadata?.httpStatusCode === 404;
};

const shaMeta = (m: Record<string, string> | undefined) => {
  const v = m?.["sha256"];
  return v && /^[0-9a-f]{64}$/.test(v) ? v : null;
};

interface CorpsS3 {
  transformToByteArray(): Promise<Uint8Array>;
}

export class ErreurStockageObjet extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ErreurStockageObjet";
  }
}

export function piloteS3(client: EnvoyeurS3, bucket: string): PiloteObjet {
  const envoyer = async <T>(commande: unknown, quoi: string): Promise<T> => {
    try {
      return (await client.send(commande)) as T;
    } catch (e) {
      if (introuvable(e)) throw e;
      const nom = (e as { name?: string })?.name ?? "erreur";
      throw new ErreurStockageObjet(`stockage objet : ${quoi} impossible (${nom})`, { cause: e });
    }
  };
  return {
    async deposer(cle, octets, meta) {
      await envoyer(new PutObjectCommand({
        Bucket: bucket, Key: cle, Body: octets, ContentLength: octets.length, ContentType: meta.mime,
        ContentMD5: createHash("md5").update(octets).digest("base64"), Metadata: { sha256: meta.sha256 },
      }), `dépôt de ${cle}`);
    },
    async lire(cle) {
      const r = await envoyer<{ Body?: CorpsS3 }>(new GetObjectCommand({ Bucket: bucket, Key: cle }), `lecture de ${cle}`);
      if (!r.Body) throw new ErreurStockageObjet(`stockage objet : ${cle} sans contenu`);
      return Buffer.from(await r.Body.transformToByteArray());
    },
    async ouvrir(cle) {
      const r = await envoyer<{ Body?: unknown; ContentLength?: number; Metadata?: Record<string, string> }>(new GetObjectCommand({ Bucket: bucket, Key: cle }), `lecture de ${cle}`);
      if (!r.Body) throw new ErreurStockageObjet(`stockage objet : ${cle} sans contenu`);
      return { flux: r.Body as Readable, taille: typeof r.ContentLength === "number" ? r.ContentLength : null, sha256: shaMeta(r.Metadata) };
    },
    async decrire(cle) {
      try {
        const r = await envoyer<{ ContentLength?: number; Metadata?: Record<string, string>; LastModified?: Date }>(new HeadObjectCommand({ Bucket: bucket, Key: cle }), `description de ${cle}`);
        return { cle, taille: r.ContentLength ?? 0, sha256: shaMeta(r.Metadata), modifieLe: r.LastModified ?? null };
      } catch (e) {
        if (introuvable(e)) return null;
        throw e;
      }
    },
    async supprimer(cle) {
      await envoyer(new DeleteObjectCommand({ Bucket: bucket, Key: cle }), `suppression de ${cle}`);
    },
    async *lister(prefixe) {
      let jeton: string | undefined;
      do {
        const r = await envoyer<{ Contents?: { Key?: string; Size?: number; LastModified?: Date }[]; IsTruncated?: boolean; NextContinuationToken?: string }>(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixe, ContinuationToken: jeton, MaxKeys: 1000 }), `liste de ${prefixe}`);
        for (const o of r.Contents ?? []) if (o.Key) yield { cle: o.Key, taille: o.Size ?? 0, sha256: null, modifieLe: o.LastModified ?? null } satisfies ObjetDecrit;
        jeton = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (jeton);
    },
    async verifierAcces() {
      try {
        await envoyer(new HeadBucketCommand({ Bucket: bucket }), `accès au compartiment ${bucket}`);
      } catch (e) {
        if (introuvable(e)) throw new ErreurStockageObjet(`stockage objet : compartiment ${bucket} introuvable`);
        throw e;
      }
    },
  };
}
