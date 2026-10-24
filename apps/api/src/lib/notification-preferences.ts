/**
 * Préférences de notification d'un compte (pures, sans base) : types de notification masqués et projets mis en
 * sourdine (« muet »). Stockées dans `users.notification_preferences` (jsonb, null tant que rien n'est réglé) et
 * appliquées par `GET /notifications` avant le tri et la limite : une notification masquée n'est ni affichée ni
 * comptée comme non lue. Rien n'est supprimé : réactiver un type ou un projet fait réapparaître ses notifications
 * (dans la fenêtre de 30 jours des données datées).
 */
import { z } from "zod";

/** Tous les types de notification calculés par `GET /notifications`, dans l'ordre d'affichage des réglages. */
/** `revue` (phase 4) : revue externe — paquets partagés, réponses dans les fils de constats, réponses reçues par le coordinateur. */
export const NOTIFICATION_KINDS = ["acces", "commentaire", "commentaire-studio", "reservation", "modification", "verrou", "peremption", "revue"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationPreferences {
  /** Types dont les notifications ne sont plus affichées. */
  typesMasques: NotificationKind[];
  /** Projets mis en sourdine : aucune de leurs notifications n'est affichée. */
  projetsMuets: string[];
}

export const PREFERENCES_PAR_DEFAUT: NotificationPreferences = { typesMasques: [], projetsMuets: [] };

const projetId = z.string().min(1).max(64);
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export const notificationPreferencesSchema = z.object({
  typesMasques: z.array(notificationKindSchema).max(NOTIFICATION_KINDS.length * 2),
  projetsMuets: z.array(projetId).max(500),
});
/** Mise à jour partielle : un champ absent reste tel quel. */
export const notificationPreferencesPatchSchema = notificationPreferencesSchema.partial();

/** Lecture tolérante de la colonne : une valeur illisible ou d'un type retiré est ignorée, jamais devinée. */
export function lirePreferences(brut: unknown): NotificationPreferences {
  if (!brut || typeof brut !== "object") return { typesMasques: [], projetsMuets: [] };
  const o = brut as Record<string, unknown>;
  const types = Array.isArray(o["typesMasques"]) ? o["typesMasques"].filter((k): k is NotificationKind => (NOTIFICATION_KINDS as readonly unknown[]).includes(k)) : [];
  const projets = Array.isArray(o["projetsMuets"]) ? o["projetsMuets"].filter((p): p is string => typeof p === "string" && p.length > 0 && p.length <= 64) : [];
  return normaliser({ typesMasques: types, projetsMuets: projets });
}

/** Sans doublon, types dans l'ordre canonique, projets dans l'ordre d'ajout. */
export function normaliser(p: NotificationPreferences): NotificationPreferences {
  return { typesMasques: NOTIFICATION_KINDS.filter((k) => p.typesMasques.includes(k)), projetsMuets: [...new Set(p.projetsMuets)] };
}

export function fusionner(courant: NotificationPreferences, patch: { [K in keyof NotificationPreferences]?: NotificationPreferences[K] | undefined }): NotificationPreferences {
  return normaliser({ typesMasques: patch.typesMasques ?? courant.typesMasques, projetsMuets: patch.projetsMuets ?? courant.projetsMuets });
}

export function basculerProjet(courant: NotificationPreferences, projectId: string, muet: boolean): NotificationPreferences {
  const autres = courant.projetsMuets.filter((p) => p !== projectId);
  return normaliser({ typesMasques: courant.typesMasques, projetsMuets: muet ? [...autres, projectId] : autres });
}

/** Garde les notifications affichables ; `masquees` = nombre retiré par les préférences. */
export function filtrerNotifications<T extends { kind: NotificationKind; projectId: string }>(items: T[], p: NotificationPreferences): { items: T[]; masquees: number } {
  if (!p.typesMasques.length && !p.projetsMuets.length) return { items, masquees: 0 };
  const types = new Set<string>(p.typesMasques);
  const projets = new Set(p.projetsMuets);
  const gardees = items.filter((it) => !types.has(it.kind) && !projets.has(it.projectId));
  return { items: gardees, masquees: items.length - gardees.length };
}
