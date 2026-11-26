/**
 * Lecture des extensions installées sur la plateforme (`addon_packages`, lot 3 du protocole des extensions) : quelques
 * lignes, une par extension importée. Les règles sont dans `lib/addon-paquets.ts` (pur).
 */
import type { PaquetExtension } from "@parcours/sandbox-planche-model";
import { db } from "../db/client.js";
import { addonPackages } from "../db/schema.js";
import { paquetsDeLignes, type LignePaquet } from "./addon-paquets.js";

export async function lireLignesPaquets(): Promise<readonly LignePaquet[]> {
  return db.select().from(addonPackages);
}
export const lirePaquetsServis = async (): Promise<readonly PaquetExtension[]> => paquetsDeLignes(await lireLignesPaquets());
