/**
 * Capacités des prix immobiliers (Concept Prix §8, Plan §6), portées sur les rôles GeoData existants (`geodata_roles`) :
 * aucun rôle nouveau, aucun rôle de projet ni de plateforme. Logique pure.
 *
 * - consultation des agrégats publiés et des cellules publiées : tout compte connecté ;
 * - lecture des observations brutes, des lots, de la quarantaine et des files de revue : rôles GeoData seulement
 *   (gestionnaire de données, responsable de publication, administrateur) — jamais la consultation seule (PRX10) ;
 * - import (observations et valeurs officielles) et construction d'un instantané candidat : gestionnaire de données ;
 * - revue (doublons, rattachements des observations, correspondances des libellés publiés) : gestionnaire de données ;
 * - publication et retour arrière : responsable de publication ;
 * - statut des sources (suspension, retrait, rétablissement) : administrateur GeoData ;
 * - export : rôles GeoData seulement, sous réserve du droit « export » de chaque source.
 */
import type { RoleGeoData } from "@parcours/geodata-model";

export const CAPACITES_PRIX = [
  "prix-consulter", "prix-lire-observations", "prix-importer", "prix-construire", "prix-reviser", "prix-publier", "prix-gerer-sources", "prix-exporter",
] as const;
export type CapacitePrix = (typeof CAPACITES_PRIX)[number];

export function capacitesPrixDe(roles: readonly RoleGeoData[]): ReadonlySet<CapacitePrix> {
  const c = new Set<CapacitePrix>(["prix-consulter"]);
  if (roles.length) { c.add("prix-lire-observations"); c.add("prix-exporter"); }
  if (roles.includes("gestionnaire-donnees")) { c.add("prix-importer"); c.add("prix-construire"); c.add("prix-reviser"); }
  if (roles.includes("responsable-publication")) c.add("prix-publier");
  if (roles.includes("administrateur")) c.add("prix-gerer-sources");
  return c;
}
