import { STUDIO_TYPES_OBJETS, validerForme } from "../objets/index.js";
import { editable, enteredDimension, freeId, type Gestionnaire } from "../noyau/etat.js";
import type { StudioShape } from "../noyau/types.js";
import { fail } from "../noyau/validation.js";

/** Commandes de création (famille `dessin`) : une par type de forme (table `STUDIO_TYPES_OBJETS`), et la cote. */

function createShape(type: StudioShape["type"]): Gestionnaire {
  return (state, params, path) => {
    const o = validerForme(params, `${path}.params`);
    if (o.type !== type) fail(path, "outil incompatible avec la géométrie");
    freeId(state, o.id, path);
    editable(state, o, path);
    state.objects.push(o);
    state.ids.add(o.id);
  };
}

/** Créations de formes, dans l'ordre de la table des types (identique à celui du registre). */
export const CREATION_FORMES: ReadonlyMap<string, Gestionnaire> = new Map(
  Object.values(STUDIO_TYPES_OBJETS).map((t) => [t.outilCreation, createShape(t.type)]),
);

export const creerCote: Gestionnaire = (state, params, path) => {
  const d = enteredDimension(state, params, path);
  freeId(state, d.id, path);
  state.dimensions.push(d);
  state.ids.add(d.id);
};
