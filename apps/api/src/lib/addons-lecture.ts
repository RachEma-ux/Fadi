/**
 * Lecture des réglages de la plateforme sur les extensions (`addon_platform_settings`, 25 novembre 2026) : quelques
 * lignes, une par extension réglée. Les règles sont dans `lib/addons.ts` (pur).
 */
import type { ReglagesPlateforme } from "@parcours/sandbox-planche-model";
import { db } from "../db/client.js";
import { addonPlatformSettings } from "../db/schema.js";
import { reglagesDeLignes, type LigneReglage } from "./addons.js";

export async function lireLignesReglages(): Promise<readonly LigneReglage[]> {
  return db.select().from(addonPlatformSettings);
}
export const lireReglagesPlateforme = async (): Promise<ReglagesPlateforme> => reglagesDeLignes(await lireLignesReglages());
