/**
 * Brouillon LOCAL de la Planche (cahier-planche C6, lot 2) : le modèle de géométrie libre est conservé dans ce
 * navigateur, par projet (IndexedDB via `localStore`, table clé / valeur), et affiché comme « Brouillon local — non
 * enregistré dans le projet ». Rien n'est envoyé au serveur : les commandes Planche arrivent au lot 7. Lecture
 * tolérante : un brouillon illisible est ignoré (jamais une erreur bloquante).
 */
import type { Modele } from "@parcours/planche-model";
import { localStore } from "../../../../lib/local-store";

export const FORMAT_BROUILLON = "planche-brouillon/1";

export const cleBrouillon = (projectId: string): string => `planche-brouillon:${projectId}`;

export function serialiserBrouillon(modele: Modele, maintenant = new Date()): string {
  return JSON.stringify({ format: FORMAT_BROUILLON, enregistreA: maintenant.toISOString(), modele });
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const CHAMPS_CONTEXTE = ["sommets", "aretes", "faces", "courbes", "occurrences"] as const;

/** Modèle d'un brouillon sérialisé, ou `null` s'il est absent, d'un autre format ou mal formé. */
export function lireBrouillon(texte: string | null): Modele | null {
  if (!texte) return null;
  try {
    const brut: unknown = JSON.parse(texte);
    if (!estObjet(brut) || brut["format"] !== FORMAT_BROUILLON) return null;
    const m = brut["modele"];
    if (!estObjet(m) || !estObjet(m["racine"]) || !estObjet(m["definitions"]) || typeof m["prochainId"] !== "number") return null;
    const racine = m["racine"];
    if (!CHAMPS_CONTEXTE.every((k) => estObjet(racine[k]))) return null;
    return m as unknown as Modele;
  } catch {
    return null;
  }
}

/** Stockage local disponible dans ce navigateur (sinon le brouillon ne vit que dans la page). */
export const stockageDisponible = (): boolean => typeof indexedDB !== "undefined";

export async function chargerBrouillon(projectId: string): Promise<Modele | null> {
  return lireBrouillon(await localStore.getValue(cleBrouillon(projectId)));
}

export async function enregistrerBrouillon(projectId: string, modele: Modele): Promise<void> {
  await localStore.setValue(cleBrouillon(projectId), serialiserBrouillon(modele));
}
