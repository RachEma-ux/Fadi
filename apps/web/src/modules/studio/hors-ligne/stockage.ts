/**
 * Accès IndexedDB du Studio hors ligne (tables `studioBrouillons` et `studioContextes` de `lib/local-store.ts`).
 * Les écritures du brouillon sont confirmées ou lèvent `LocalPersistenceError` ; la mémoire des dernières versions
 * lues reste facultative (un échec n'empêche rien, il prive seulement de l'ouverture sans réseau).
 */
import type { StudioContext } from "../../../lib/api";
import { localStore } from "../../../lib/local-store";
import { horsLigneVide, lireHorsLigne, type BrouillonHorsLigne } from "./persistance";

export async function lireBrouillonHorsLigne(cle: string): Promise<BrouillonHorsLigne | null> {
  const entree = await localStore.studioBrouillon(cle);
  return entree ? lireHorsLigne(entree.donnees) : null;
}

/** Écrit le brouillon, ou le retire quand il n'y a plus rien à conserver. Rend vrai si un brouillon reste conservé. */
export async function ecrireBrouillonHorsLigne(cle: string, h: BrouillonHorsLigne): Promise<boolean> {
  if (horsLigneVide(h)) { await localStore.studioSupprimerBrouillon(cle); return false; }
  await localStore.studioEcrireBrouillon({ cle, projectId: h.base.study.projectId, donnees: JSON.stringify(h), majA: new Date().toISOString() });
  return true;
}

export const supprimerBrouillonHorsLigne = (cle: string): Promise<void> => localStore.studioSupprimerBrouillon(cle);

export function memoriserContexte(cle: string, c: StudioContext): Promise<void> {
  return localStore.studioMemoriserContexte({ cle, projectId: c.study.projectId, contexte: JSON.stringify(c), luA: new Date().toISOString() });
}

export async function contexteMemorise(cle: string): Promise<{ contexte: StudioContext; luA: string } | null> {
  const e = await localStore.studioContexte(cle);
  if (!e) return null;
  try { return { contexte: JSON.parse(e.contexte) as StudioContext, luA: e.luA }; }
  catch { return null; }
}
