import { controlerLiens, validerCote, type StudioDimension } from "../objets/cote.js";
import { studioAnchorPoint } from "../objets/index.js";
import { etatCalque, type StudioLayerState } from "../noyau/calques.js";
import type { StudioSolid } from "../objets-3d/solides.js";
import type { StudioSolideExact } from "../objets-3d/exacts.js";
import type { StudioLayer } from "../noyau/types.js";
import { fail, same } from "../noyau/validation.js";
import type { StudioAnnotation, StudioShape } from "../objets/formes.js";
import type { StudioArchitectureItem } from "../architecture/types.js";
import type { StudioElementVisualisation } from "../scenes/scenes.js";

/** État privé d'un lot de commandes (clone du document, tout ou rien) et contrôles partagés par les familles de commandes. */

export interface Etat {
  id: string;
  objects: StudioShape[];
  layers: StudioLayer[];
  dimensions: StudioDimension[];
  /** Solides libres (`objets-3d/`). */
  solides: StudioSolid[];
  /** Solides exacts (lot F2, `StudioDocument.exacts`) : résultats du noyau exact, opérandes conservés. */
  exacts: StudioSolideExact[];
  /** Cotes angulaires et textes (`StudioDocument.annotations`). */
  annotations: StudioAnnotation[];
  /** Murs et ouvertures (`StudioDocument.architecture`, A.4). */
  architecture: StudioArchitectureItem[];
  /** Scènes et apparences d’affichage (`StudioDocument.scenes`, lot E.5) ; identifiants propres à la liste. */
  scenes: StudioElementVisualisation[];
  /** Identifiants d'objets et de cotes présents : contrôle d'unicité en temps constant (un import peut compter 20 000 créations). */
  ids: Set<string>;
}
/** Applique une commande à l'état ; refuse par `StudioValidationError` (le lot entier est alors abandonné). */
export type Gestionnaire = (state: Etat, params: unknown, path: string) => void;

export function calqueEtat(state: Etat, layerId: string | undefined, path: string): StudioLayerState {
  const found = etatCalque(state.layers, layerId);
  if (!found) fail(path, "calque inconnu");
  return found;
}
export function editable(state: Etat, target: { layerId?: string }, path: string): void {
  if (calqueEtat(state, target.layerId, path).locked) fail(path, "calque verrouillé");
}
export function freeId(state: Etat, id: string, path: string): void {
  if (state.ids.has(id)) fail(path, "identifiant déjà utilisé");
}
export function shapeMap(state: Etat): Map<string, StudioShape> {
  return new Map(state.objects.map((o) => [o.id, o]));
}

/** Les cotes liées à un objet suivent sa nouvelle géométrie (même identité). */
export function followLinks(state: Etat, shapeId: string, path: string): void {
  const target = state.objects.find((o) => o.id === shapeId);
  if (!target) return;
  state.dimensions = state.dimensions.map((d) => {
    if (d.links.start?.objectId !== shapeId && d.links.end?.objectId !== shapeId) return d;
    const start = d.links.start?.objectId === shapeId ? studioAnchorPoint(target, d.links.start.anchor) : d.start;
    const end = d.links.end?.objectId === shapeId ? studioAnchorPoint(target, d.links.end.anchor) : d.end;
    if (!start || !end) fail(path, "sommet de cote liée introuvable");
    if (same(start, d.start) && same(end, d.end)) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    if (same(start, end)) fail(path, `la cote liée ${d.id} deviendrait de longueur nulle`);
    return { ...d, start, end };
  });
}

/** Cote saisie (création ou modification) : jamais « à résoudre », calque modifiable, liens exacts. */
export function enteredDimension(state: Etat, params: unknown, path: string): StudioDimension {
  const d = validerCote(params, `${path}.params`);
  if (d.toResolve) fail(`${path}.params.toResolve`, "l’état à résoudre naît d’une suppression, il n’est jamais saisi");
  editable(state, d, path);
  controlerLiens(d, shapeMap(state), `${path}.params`);
  return d;
}
