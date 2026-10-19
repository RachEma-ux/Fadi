import { creerCalque, modifierCalque, placerSurCalque } from "../commandes/calques.js";
import { CREATION_FORMES, creerCote } from "../commandes/dessin.js";
import { decaler, deplacer, modifier, supprimer } from "../commandes/modification.js";
import { aplatir, extruder } from "../commandes/volume.js";
import { sortie, validateStudioDocument } from "./document.js";
import type { Etat, Gestionnaire } from "./etat.js";
import type { StudioCommand, StudioCommandToolId, StudioDocument } from "./types.js";
import { array, fail, record } from "./validation.js";

/**
 * Aiguillage des commandes : un gestionnaire par identifiant d'outil de mutation, composé des familles (`commandes/`).
 * L'ordre des clés est celui de `STUDIO_APPLIED_TOOL_IDS` (contrôlé par test) ; une commande nouvelle s'ajoute à sa
 * famille, puis ici, et dans le registre (`registre/`).
 */
const creation = (toolId: StudioCommandToolId): Gestionnaire => CREATION_FORMES.get(toolId)!;

const HANDLERS: Record<StudioCommandToolId, Gestionnaire> = {
  "studio.dessin.ligne": creation("studio.dessin.ligne"),
  "studio.dessin.rectangle": creation("studio.dessin.rectangle"),
  "studio.dessin.cercle": creation("studio.dessin.cercle"),
  "studio.dessin.arc": creation("studio.dessin.arc"),
  "studio.dessin.polyligne": creation("studio.dessin.polyligne"),
  "studio.dessin.deplacer": deplacer,
  "studio.dessin.modifier": modifier,
  "studio.dessin.decaler": decaler,
  "studio.dessin.cote": creerCote,
  "studio.dessin.supprimer": supprimer,
  "studio.calque.creer": creerCalque,
  "studio.calque.modifier": modifierCalque,
  "studio.objet.calque": placerSurCalque,
  "studio.objet.extruder": extruder,
  "studio.objet.aplatir": aplatir,
};

/** Identifiants réellement acceptés par `applyStudioCommands` (contrôlés contre le registre par test). */
export const STUDIO_APPLIED_TOOL_IDS: readonly StudioCommandToolId[] = Object.freeze(Object.keys(HANDLERS) as StudioCommandToolId[]);

/** Apply to a private clone; a rejected lot never mutates document or caller inputs. */
export function applyStudioCommands(document: StudioDocument, commands: readonly StudioCommand[]): StudioDocument {
  const current = validateStudioDocument(document);
  const state: Etat = {
    id: current.id, objects: current.objects, layers: current.layers ?? [], dimensions: current.dimensions ?? [],
    ids: new Set([...current.objects.map((o) => o.id), ...(current.dimensions ?? []).map((d) => d.id)]),
  };
  const batch = array(commands, "commands");
  if (batch.length === 0) fail("commands", "au moins une commande attendue");
  for (let i = 0; i < batch.length; i++) {
    const path = `commands[${i}]`;
    const c = record(batch[i], ["toolId", "params"], path);
    const toolId = c.toolId;
    if (typeof toolId !== "string" || !Object.hasOwn(HANDLERS, toolId)) fail(`${path}.toolId`, "outil de mutation non pris en charge");
    HANDLERS[toolId as StudioCommandToolId](state, c.params, path);
  }
  // Contrôle final : limites, unicité et liens sur le document entier, avant de rendre la copie.
  return validateStudioDocument(sortie(state.id, state.objects, state.layers, state.dimensions));
}
