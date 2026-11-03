/**
 * BD-9.6 : lecteur des catalogues de données sur le pool de l'API (`fadi_app`, lecture seule sur `catalogues` et
 * `catalogue_versions`). Voir `lib/catalogues.ts`.
 */
import { pool } from "../db/client.js";
import { LecteurCatalogues, type CleCatalogue, type TypesCatalogues } from "./catalogues.js";

export const lecteurCatalogues = new LecteurCatalogues(() => pool);

/** Le catalogue publié ; lève `CatalogueNonCharge` (réponse 503 `catalogue_non_charge`) s'il n'est pas en base. */
export function catalogue<K extends CleCatalogue>(cle: K): Promise<TypesCatalogues[K]> {
  return lecteurCatalogues.lire(cle);
}
