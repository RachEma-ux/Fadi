import { id } from "../registre/schemas-base.js";
import { STUDIO_LIMITES_PROPRIETES } from "./limites.js";

/** Schémas JSON des propriétés déclarées (E.1-01) ; la cible et l'unicité (cible, nom) sont contrôlées par le modèle. */
const texte = (max: number) => ({ type: "string", minLength: 1, maxLength: max, pattern: "^\\S(?:[\\s\\S]*\\S)?$" }) as const;

export const SCHEMA_PROPRIETE = {
  type: "object", additionalProperties: false, required: ["cibleId", "nom"],
  properties: {
    cibleId: id, nom: texte(STUDIO_LIMITES_PROPRIETES.nom),
    valeur: { oneOf: [{ type: "number" }, texte(STUDIO_LIMITES_PROPRIETES.texte)] },
    unite: texte(STUDIO_LIMITES_PROPRIETES.unite), source: texte(STUDIO_LIMITES_PROPRIETES.source),
  },
} as const;

export const SCHEMA_RETRAIT_PROPRIETE = {
  type: "object", additionalProperties: false, required: ["cibleId", "nom"],
  properties: { cibleId: id, nom: texte(STUDIO_LIMITES_PROPRIETES.nom) },
} as const;
