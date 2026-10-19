import { SCHEMA_PROPRIETE, SCHEMA_RETRAIT_PROPRIETE } from "../exigences/schemas.js";
import { mutation } from "./communs.js";

/**
 * Famille « Propriétés » du registre (E.1-01) : Déclarer une propriété (K) et Retirer une propriété (J) sur un mur, une
 * ouverture ou un objet extrudé. Lettres seules libres et non réservées (`regle-or.test.ts`) ; aucune valeur proposée.
 */
export const OUTILS_PROPRIETES = [
  { ...mutation, toolId: "studio.propriete.definir", libelleFR: "Déclarer une propriété", raccourci: "K", iconeSymbolique: "studio-property-set", groupe: "proprietes", inputSchema: SCHEMA_PROPRIETE },
  { ...mutation, toolId: "studio.propriete.retirer", libelleFR: "Retirer une propriété", raccourci: "J", iconeSymbolique: "studio-property-remove", groupe: "proprietes", inputSchema: SCHEMA_RETRAIT_PROPRIETE },
] as const;
