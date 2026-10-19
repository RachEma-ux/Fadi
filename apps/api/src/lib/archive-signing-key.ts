/**
 * Clés de signature des archives de ce serveur : `ARCHIVE_SIGNING_KEY` (environnement) si elle est fournie, sinon une
 * clé aléatoire propre à la base, créée à la première signature dans `archive_signing_keys` (init.sql). La clé n'est
 * jamais journalisée ni renvoyée : seul son identifiant (`archiveKeyId`) sort du serveur, dans l'archive.
 */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { archiveSigningKey, type ArchiveSigningKey } from "./archive-signature.js";
import type { Querier } from "./step-rows.js";

const LOCAL_KEY_ID = "local";

function envKey(): ArchiveSigningKey | null {
  const value = process.env["ARCHIVE_SIGNING_KEY"]?.trim();
  return value ? archiveSigningKey("env", value) : null;
}

async function databaseKey(q: Querier, create: boolean): Promise<ArchiveSigningKey | null> {
  const read = async () => {
    const res = await q.execute(sql`SELECT secret FROM archive_signing_keys WHERE id = ${LOCAL_KEY_ID}`);
    const secret = (res.rows[0] as { secret?: string } | undefined)?.secret;
    return secret ? archiveSigningKey("db", secret) : null;
  };
  const found = await read();
  if (found || !create) return found;
  // Deux exports simultanés : la première insertion gagne, l'autre relit la même clé.
  await q.execute(sql`INSERT INTO archive_signing_keys (id, secret) VALUES (${LOCAL_KEY_ID}, ${randomBytes(32).toString("hex")}) ON CONFLICT (id) DO NOTHING`);
  return read();
}

/** Clé qui signe les nouvelles archives : celle de l'environnement, sinon celle de la base (créée au besoin). */
export async function currentSigningKey(q: Querier): Promise<ArchiveSigningKey> {
  const key = envKey() ?? (await databaseKey(q, true));
  if (!key) throw new Error("archive_signing_key_unavailable");
  return key;
}

/** Clés de ce serveur acceptées à la vérification (environnement et base), sans en créer. */
export async function verificationKeys(q: Querier): Promise<ArchiveSigningKey[]> {
  return [envKey(), await databaseKey(q, false)].filter((k): k is ArchiveSigningKey => k !== null);
}
