/**
 * Contexte local d'un outil ouvert depuis la Console, INDÉPENDAMMENT DE TOUT PROJET : un document vide tenu dans la
 * page, sans projet, étude ni variante du serveur (aucun projet fictif n'est créé ni lu). Les identifiants ci-dessous ne
 * sont jamais envoyés au serveur : l'espace de travail en mode autonome n'appelle ni lecture ni enregistrement.
 * Pur : ni React ni DOM.
 */
import { newStudioDocument } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";

export const ID_CONSOLE = "console";
export const NOM_CONSOLE = "Console";

/** Un contexte neuf : document vide, écriture dans le brouillon local seulement. */
export function contexteConsole(): StudioContext {
  return {
    study: { id: ID_CONSOLE, name: NOM_CONSOLE, projectId: ID_CONSOLE },
    variant: { id: ID_CONSOLE, name: NOM_CONSOLE, studyId: ID_CONSOLE, headRevisionId: ID_CONSOLE },
    revision: { id: ID_CONSOLE, parentRevisionId: null, document: newStudioDocument(ID_CONSOLE) },
    canWrite: true,
  };
}
