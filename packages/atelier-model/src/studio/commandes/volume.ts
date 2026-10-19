import { validerForme } from "../objets/index.js";
import { editable, type Gestionnaire } from "./etat.js";
import type { StudioShape } from "../objets/formes.js";
import { extrusionValues, fail, idList, record } from "../noyau/validation.js";

/** Commandes de volume : extrusion déclarée (valeurs saisies seulement) et aplatissement. */

export const extruder: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "base", "height"], `${path}.params`, ["thickness"]);
  const ids = idList(p.ids, `${path}.params.ids`);
  const values = extrusionValues(p, `${path}.params`, true);
  const index = new Map(state.objects.map((o, i) => [o.id, i]));
  for (const id of ids) {
    const i = index.get(id);
    if (i === undefined) fail(path, state.dimensions.some((d) => d.id === id) ? `une cote ne s’extrude pas : ${id}` : `objet introuvable : ${id}`);
    const o = state.objects[i]!;
    editable(state, o, path);
    if (values.thickness !== undefined && o.type !== "line" && o.type !== "arc") fail(`${path}.params.thickness`, `l’épaisseur ne s’applique qu’aux lignes et aux arcs : ${id}`);
    // Contrôle complet de la forme extrudée (contour simple d'une polyligne fermée, épaisseur d'un arc).
    state.objects[i] = validerForme({ ...o, extrusion: { ...values } }, `${path} (${id})`);
  }
};

export const aplatir: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = idList(p.ids, `${path}.params.ids`);
  const index = new Map(state.objects.map((o, i) => [o.id, i]));
  for (const id of ids) {
    const i = index.get(id);
    if (i === undefined) fail(path, `objet introuvable : ${id}`);
    const o = state.objects[i]!;
    editable(state, o, path);
    if (!o.extrusion) fail(path, `objet non extrudé : ${id}`);
    const { extrusion: _removed, ...flat } = o;
    state.objects[i] = flat as StudioShape;
  }
};
