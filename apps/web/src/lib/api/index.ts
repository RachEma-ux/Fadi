/**
 * Client HTTP vers `apps/api`, un fichier par module (L0.5) : `comptes`, `projets`, `parcours`, `harmonie`,
 * `programmation`, `atelier-commandes` (service de commandes de l'Atelier), `analyses`, `documents`,
 * `collaboration`, plus la requête commune `http`. Ce point d'entrée réexporte tout et recompose l'objet `api`
 * historique : `import { api, ... } from "…/lib/api"` reste valable partout.
 */
import { analysesApi } from "./analyses";
import { collaborationApi } from "./collaboration";
import { comptesApi } from "./comptes";
import { documentsApi } from "./documents";
import { harmonieApi } from "./harmonie";
import { parcoursApi } from "./parcours";
import { programmationApi } from "./programmation";
import { projetsApi } from "./projets";

export { ApiError } from "./http";
export * from "./analyses";
export * from "./collaboration";
export * from "./comptes";
export * from "./documents";
export * from "./harmonie";
export * from "./parcours";
export * from "./programmation";
export * from "./projets";

export const api = {
  ...comptesApi,
  ...projetsApi,
  ...parcoursApi,
  ...harmonieApi,
  ...programmationApi,
  ...analysesApi,
  ...documentsApi,
  ...collaborationApi,
};
