/** Planificateur du ramasse-miettes des volumes pour le processus de l'API (BD-1.3) ; voir `volumes-gc-planifie.ts`. */
import * as client from "../db/client.js";
import { planificateurVolumes } from "./volumes-gc-planifie.js";

// Pool lu au moment du passage, pas au chargement du module (modules simulés dans les tests des boucles de fond).
export const nettoyageVolumes = planificateurVolumes(() => client.pool);
