/**
 * BD-9.6 (D-GD-29, interface ≠ base de données) : les catalogues de données (bibliothèque des bâtiments, Harmonie,
 * répartition programmatique) sont servis par l'API depuis la base. S'ils n'y sont pas chargés, l'API répond 503
 * `catalogue_non_charge` et l'interface le dit — elle n'embarque aucune copie de repli.
 */
import { ApiError } from "./api";

export function estCatalogueNonCharge(err: unknown): boolean {
  return err instanceof ApiError && err.code === "catalogue_non_charge";
}

export const MESSAGE_CATALOGUE_NON_CHARGE =
  "Catalogue de référence non chargé en base de données : l’exploitant doit lancer le chargement des catalogues. Aucune donnée de remplacement n’est affichée.";
