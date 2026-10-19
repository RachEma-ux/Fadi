import { STUDIO_TYPES_OBJETS, validerForme } from "../objets/index.js";
import { editable, enteredDimension, freeId, type Gestionnaire } from "./etat.js";
import type { StudioShape } from "../objets/formes.js";
import { fail } from "../noyau/validation.js";
import { validerTexte } from "../objets/texte.js";
import { coteAngulaireSaisie } from "./annotations.js";

/**
 * Commandes de création (famille `dessin`) : une par type de forme (table `STUDIO_TYPES_OBJETS`), la cote, puis les
 * annotations (cote angulaire, texte).
 */

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

/** Cote angulaire : deux rayons libres depuis un sommet, ou liée à deux segments droits (ligne, polyligne). */
export const creerCoteAngulaire: Gestionnaire = (state, params, path) => {
  const d = coteAngulaireSaisie(state, params, path);
  freeId(state, d.id, path);
  state.annotations.push(d);
  state.ids.add(d.id);
};

/** Texte posé sur un calque (contenu : donnée du projet, jamais traduite). */
export const creerTexte: Gestionnaire = (state, params, path) => {
  const t = validerTexte(params, `${path}.params`);
  editable(state, t, path);
  freeId(state, t.id, path);
  state.annotations.push(t);
  state.ids.add(t.id);
};
