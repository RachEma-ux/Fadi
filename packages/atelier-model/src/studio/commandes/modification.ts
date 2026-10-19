import { studioOffset } from "../courbes.js";
import { validerCote } from "../objets/cote.js";
import { validerElement } from "../objets/element.js";
import { translaterForme, validerForme } from "../objets/index.js";
import { editable, enteredDimension, followLinks, freeId, type Gestionnaire } from "../noyau/etat.js";
import type { StudioItem, StudioPoint } from "../noyau/types.js";
import { fail, finite, identifier, idList, record } from "../noyau/validation.js";
import { deplacerAnnotation, modifierAnnotation, suivreAnnotations, supprimerAnnotations } from "./annotations.js";

/** Commandes de modification : Déplacer, Modifier, Décaler, Supprimer. */

export const deplacer: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "dx", "dy"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  const dx = finite(p.dx, `${path}.params.dx`);
  const dy = finite(p.dy, `${path}.params.dy`);
  const translate = (q: StudioPoint): StudioPoint => ({ x: finite(q.x + dx, path), y: finite(q.y + dy, path) });
  const index = state.objects.findIndex((o) => o.id === id);
  const o = state.objects[index];
  if (o) {
    editable(state, o, path);
    state.objects[index] = validerForme(translaterForme(o, translate), path);
    followLinks(state, id, path);
    suivreAnnotations(state, id, path);
    return;
  }
  if (deplacerAnnotation(state, id, translate, path)) return;
  const dIndex = state.dimensions.findIndex((x) => x.id === id);
  const d = state.dimensions[dIndex];
  if (!d) fail(path, "objet introuvable");
  editable(state, d, path);
  if (d.links.start || d.links.end) fail(path, "une cote liée suit ses objets et ne se déplace pas seule");
  state.dimensions[dIndex] = validerCote({ ...d, start: translate(d.start), end: translate(d.end) }, path);
};

export const modifier: Gestionnaire = (state, params, path) => {
  const o = validerElement(params, `${path}.params`);
  if (o.type === "angular-dimension" || o.type === "text") return modifierAnnotation(state, o, path);
  const index = state.objects.findIndex((current) => current.id === o.id);
  const dIndex = state.dimensions.findIndex((current) => current.id === o.id);
  const previous = state.objects[index] ?? state.dimensions[dIndex];
  if (!previous) fail(path, "objet introuvable");
  if (previous.type !== o.type) fail(path, "le type de l’objet ne peut pas changer");
  if (previous.layerId !== o.layerId) fail(path, "le calque se change par studio.objet.calque");
  editable(state, previous, path);
  if (o.type === "dimension") {
    state.dimensions[dIndex] = enteredDimension(state, o, path);
  } else {
    state.objects[index] = o;
    followLinks(state, o.id, path);
    suivreAnnotations(state, o.id, path);
  }
};

export const decaler: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "newId", "distance"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  const newId = identifier(p.newId, `${path}.params.newId`);
  const distance = finite(p.distance, `${path}.params.distance`);
  if (distance === 0) fail(`${path}.params.distance`, "distance non nulle attendue");
  const source = state.objects.find((o) => o.id === id);
  if (!source) fail(path, state.dimensions.some((d) => d.id === id) ? `une cote ne se décale pas : ${id}` : `objet introuvable : ${id}`);
  editable(state, source, path);
  freeId(state, newId, path);
  const r = studioOffset(source, distance, newId);
  if (!r.ok) fail(path, `décalage impossible : ${r.raison}`);
  state.objects.push(validerForme(r.shape, path));
  state.ids.add(newId);
};

export const supprimer: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = new Set(idList(p.ids, `${path}.params.ids`));
  const items = new Map<string, StudioItem>([...state.objects, ...state.dimensions, ...state.annotations].map((o) => [o.id, o]));
  for (const id of ids) {
    const target = items.get(id);
    if (!target) fail(path, `objet introuvable : ${id}`);
    editable(state, target, path);
  }
  state.objects = state.objects.filter((o) => !ids.has(o.id));
  for (const id of ids) state.ids.delete(id);
  state.dimensions = state.dimensions.filter((d) => !ids.has(d.id)).map((d) => {
    const breakStart = !!d.links.start && ids.has(d.links.start.objectId);
    const breakEnd = !!d.links.end && ids.has(d.links.end.objectId);
    if (!breakStart && !breakEnd) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    return { ...d, links: { start: breakStart ? null : d.links.start, end: breakEnd ? null : d.links.end }, toResolve: true };
  });
  supprimerAnnotations(state, ids, path);
};
