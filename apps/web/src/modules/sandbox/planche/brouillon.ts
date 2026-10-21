/**
 * Brouillon de la Planche de Sandbox : le modèle de géométrie libre est conservé dans ce navigateur (IndexedDB via
 * `localStore`, table clé / valeur), sous une clé qui n'appartient qu'à Sandbox — aucune relation avec le brouillon de
 * la Planche de l'étape 10, aucun projet, rien envoyé au serveur. Lecture tolérante : un brouillon illisible est
 * ignoré (jamais une erreur bloquante).
 */
import { lireModelePlanche, type Modele } from "@parcours/sandbox-planche-model";
import { localStore } from "../../../lib/local-store";

export const FORMAT_BROUILLON = "sandbox-planche-brouillon/1";

export const CLE_BROUILLON = "sandbox-planche-brouillon";

export function serialiserBrouillon(modele: Modele, maintenant = new Date()): string {
  return JSON.stringify({ format: FORMAT_BROUILLON, enregistreA: maintenant.toISOString(), modele });
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Modèle d'un brouillon sérialisé, ou `null` s'il est absent, d'un autre format ou mal formé (lecture validée du noyau, lot 7). */
export function lireBrouillon(texte: string | null): Modele | null {
  if (!texte) return null;
  try {
    const brut: unknown = JSON.parse(texte);
    if (!estObjet(brut) || brut["format"] !== FORMAT_BROUILLON) return null;
    return lireModelePlanche(brut["modele"]);
  } catch {
    return null;
  }
}

/** Stockage local disponible dans ce navigateur (sinon le brouillon ne vit que dans la page). */
export const stockageDisponible = (): boolean => typeof indexedDB !== "undefined";

export async function chargerBrouillon(): Promise<Modele | null> {
  const texte = await localStore.getValueChecked(CLE_BROUILLON);
  const modele = lireBrouillon(texte);
  if (texte !== null && modele === null) throw new Error("Brouillon local illisible : conservation non confirmée.");
  return modele;
}

export async function enregistrerBrouillon(modele: Modele): Promise<void> {
  await localStore.setValueChecked(CLE_BROUILLON, serialiserBrouillon(modele));
}
