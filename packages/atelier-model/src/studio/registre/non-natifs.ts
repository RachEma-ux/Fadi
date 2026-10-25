import { SCHEMA_NON_NATIF } from "../non-natifs/non-natifs.js";
import { mutation } from "./communs.js";
import { ids } from "./schemas.js";

/**
 * Famille « Éléments non natifs » du registre (lot F3, TEST-028) : Conserver un élément non natif (Maj+F4 : il naît
 * d'un import, le raccourci ouvre « Importer IFC ») et Retirer les éléments non natifs (Maj+F8 : ceux cochés dans
 * « Éléments du dessin »). Toutes les lettres seules et Maj+lettre sont prises ; Maj+F4 et Maj+F8 sont libres et non
 * réservés (`regle-or.test.ts`).
 */
export const OUTILS_NON_NATIFS = [
  { ...mutation, toolId: "studio.nonnatif.conserver", libelleFR: "Conserver un élément non natif", raccourci: "Shift+F4", iconeSymbolique: "studio-non-native-keep", groupe: "non-natifs", inputSchema: SCHEMA_NON_NATIF },
  { ...mutation, toolId: "studio.nonnatif.retirer", libelleFR: "Retirer les éléments non natifs", raccourci: "Shift+F8", iconeSymbolique: "studio-non-native-remove", groupe: "non-natifs", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;
