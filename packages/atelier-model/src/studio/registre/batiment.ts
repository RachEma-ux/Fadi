import { SCHEMA_ELEMENT_STRUCTUREL } from "../architecture/schemas.js";
import { SCHEMA_COMPOSANT, SCHEMA_OCCURRENCE } from "../batiment/composants.js";
import { SCHEMA_NIVEAU } from "../batiment/niveaux.js";
import { mutation } from "./communs.js";

/**
 * Famille « Bâtiment » du registre (lot W3-B, X.1-04) : Niveau (Ctrl+F2 : créer ou modifier un niveau, son déplacement
 * répercuté sur ses objets), Composant (Ctrl+F3 : définir ou modifier une définition partagée), Occurrence de composant
 * (Ctrl+F6 : placer ou replacer une occurrence ; « Rendre unique » en lot avec Composant) et Élément structurel (Ctrl+F7 :
 * poteau, poutre ou dalle ; modifié et supprimé par les commandes de l'architecture). Raccourcis de la réserve du lot,
 * libres et non réservés par le navigateur (`regle-or.test.ts`). Identifiants distincts des blocs 2D du dessin.
 */
export const OUTILS_BATIMENT = [
  { ...mutation, toolId: "studio.niveau.definir", libelleFR: "Niveau", raccourci: "Ctrl+F2", iconeSymbolique: "studio-level", groupe: "batiment", inputSchema: SCHEMA_NIVEAU },
  { ...mutation, toolId: "studio.composant.definir", libelleFR: "Composant", raccourci: "Ctrl+F3", iconeSymbolique: "studio-component", groupe: "batiment", inputSchema: SCHEMA_COMPOSANT },
  { ...mutation, toolId: "studio.composant.placer", libelleFR: "Occurrence de composant", raccourci: "Ctrl+F6", iconeSymbolique: "studio-component-instance", groupe: "batiment", inputSchema: SCHEMA_OCCURRENCE },
  { ...mutation, toolId: "studio.structure.element", libelleFR: "Élément structurel", raccourci: "Ctrl+F7", iconeSymbolique: "studio-structure", groupe: "batiment", inputSchema: SCHEMA_ELEMENT_STRUCTUREL },
] as const;
