/**
 * Outils de la carte et zones d'étude (feuille de route équipe A, PR P6 : extraction du domaine D6 de `PageGeoData.tsx`,
 * aucun changement visible). Fonctions pures, sans React ni DOM.
 */
import type { OutilCarte } from "../carte/moteur";

/** Volet que le choix d'un outil ouvre : Terrain pour l'altitude et le profil, Études pour les autres ; aucun en navigation. */
export function voletDeOutil(o: OutilCarte): "terrain" | "etudes" | null {
  if (o === "navigation") return null;
  return o === "altitude" || o === "profil" ? "terrain" : "etudes";
}

/** L'outil trace sur le moteur et rend la main au panneau Terrain (aucun tracé gardé par la page). */
export const outilTerrain = (o: OutilCarte): o is "altitude" | "profil" => o === "altitude" || o === "profil";

/** L'outil écrit en base à la fin du tracé (zone d'étude, annotation) : le tracé terminé attend son enregistrement. */
export const outilQuiEnregistre = (o: OutilCarte) => o === "zone" || o === "annotation";

/** Zone d'étude active d'un filtre : seulement une zone (pas une annotation) encore présente. */
export function zoneActiveDe<Z extends { id: string; nature: string }>(zones: readonly Z[], filtre: string | null): Z | null {
  return zones.find((z) => z.id === filtre && z.nature === "zone") ?? null;
}

/** Alt+Z sans filtre : la dernière zone filtrée si elle existe encore, sinon la plus récente (la première reçue), sinon null. */
export function zoneARetablir<Z extends { id: string; nature: string }>(zones: readonly Z[], derniere: string | null): Z | null {
  const candidates = zones.filter((z) => z.nature === "zone");
  return candidates.find((z) => z.id === derniere) ?? candidates[0] ?? null;
}
