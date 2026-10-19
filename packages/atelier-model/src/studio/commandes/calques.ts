import { validerCalque } from "../noyau/calques.js";
import { calqueEtat, editable, type Gestionnaire } from "../noyau/etat.js";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS } from "../noyau/limites.js";
import type { StudioItem } from "../noyau/types.js";
import { fail, identifier, idList, record } from "../noyau/validation.js";

/** Commandes de calques : créer, régler (nom, visibilité, verrou), placer des objets sur un calque. */

export const creerCalque: Gestionnaire = (state, params, path) => {
  const l = validerCalque(params, `${path}.params`);
  if (state.layers.some((x) => x.id === l.id)) fail(path, "calque déjà existant");
  if (state.layers.length >= STUDIO_LIMITS.layers) fail(path, `${STUDIO_LIMITS.layers} calques au plus`);
  state.layers.push(l);
};

export const modifierCalque: Gestionnaire = (state, params, path) => {
  const l = validerCalque(params, `${path}.params`);
  const index = state.layers.findIndex((x) => x.id === l.id);
  if (index < 0) fail(path, "calque inconnu");
  state.layers[index] = l;
};

export const placerSurCalque: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "layerId"], `${path}.params`);
  const ids = idList(p.ids, `${path}.params.ids`);
  const layerId = identifier(p.layerId, `${path}.params.layerId`);
  const target = layerId === STUDIO_DEFAULT_LAYER_ID ? undefined : layerId;
  if (calqueEtat(state, target, path).locked) fail(path, "calque cible verrouillé");
  const move = <T extends StudioItem>(o: T): T => {
    const { layerId: _previous, ...rest } = o;
    return (target === undefined ? rest : { ...rest, layerId: target }) as T;
  };
  const objectIndex = new Map(state.objects.map((o, i) => [o.id, i]));
  const dimensionIndex = new Map(state.dimensions.map((o, i) => [o.id, i]));
  const annotationIndex = new Map(state.annotations.map((o, i) => [o.id, i]));
  for (const id of ids) {
    const index = objectIndex.get(id) ?? -1;
    const dIndex = dimensionIndex.get(id) ?? -1;
    const aIndex = annotationIndex.get(id) ?? -1;
    const o = state.objects[index] ?? state.dimensions[dIndex] ?? state.annotations[aIndex];
    if (!o) fail(path, `objet introuvable : ${id}`);
    editable(state, o, path);
    if (o.type === "dimension") state.dimensions[dIndex] = move(o);
    else if (o.type === "angular-dimension" || o.type === "text") state.annotations[aIndex] = move(o);
    else state.objects[index] = move(o);
  }
};
