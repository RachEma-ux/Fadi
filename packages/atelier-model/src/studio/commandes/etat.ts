import { controlerLiens, validerCote, type StudioDimension } from "../objets/cote.js";
import { studioAncreContourMur, studioContourMur, studioPointCibleCote, studioResolveurCotes, type StudioCibleCote } from "./cotes-murs.js";
import { studioDecalageImage, type StudioTransformation } from "../transformations.js";
import type { StudioPolyline } from "../objets/polyligne.js";
import { STUDIO_INDEXED_ANCHOR } from "../noyau/ancres.js";
import { studioAnchorPoint } from "../objets/index.js";
import { etatCalque, type StudioLayerState } from "../noyau/calques.js";
import type { StudioSolid } from "../objets-3d/solides.js";
import type { StudioSolideExact } from "../objets-3d/exacts.js";
import type { StudioCoteFace } from "../objets-3d/cotes-faces.js";
import type { StudioLayer } from "../noyau/types.js";
import { fail, same } from "../noyau/validation.js";
import type { StudioAnnotation, StudioShape } from "../objets/formes.js";
import type { StudioArchitectureItem } from "../architecture/types.js";
import type { StudioElementVisualisation } from "../scenes/scenes.js";
import type { StudioNonNatif } from "../non-natifs/non-natifs.js";
import type { StudioGraphisme } from "../graphismes/graphismes.js";
import type { StudioSystemeProjet } from "../reperes.js";
import type { StudioSourceExterne } from "../sources/sources.js";
import type { StudioNiveau } from "../batiment/niveaux.js";
import type { StudioComposant, StudioOccurrence } from "../batiment/composants.js";
import type { StudioDefinitionBloc, StudioInsertionBloc } from "../blocs/blocs.js";
import type { StudioContrainte } from "../contraintes/contraintes.js";

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
  /** Cotes de faces 3D (INV-013, lot G2, `StudioDocument.cotesFaces`). */
  cotesFaces: StudioCoteFace[];
  /** Cotes angulaires et textes (`StudioDocument.annotations`). */
  annotations: StudioAnnotation[];
  /** Murs et ouvertures (`StudioDocument.architecture`, A.4). */
  architecture: StudioArchitectureItem[];
  /** Scènes et apparences d’affichage (`StudioDocument.scenes`, lot E.5) ; identifiants propres à la liste. */
  scenes: StudioElementVisualisation[];
  /** Éléments non natifs conservés à l’import (`StudioDocument.nonNatifs`, lot F3) ; non éditables. */
  nonNatifs: StudioNonNatif[];
  /** Splines, hachures et symboles (`StudioDocument.graphismes`, EX-055) ; dessin 2D seulement. */
  graphismes: StudioGraphisme[];
  /** Système de projet versionné (`StudioDocument.systemeProjet`, EX-023) ; absent : non déclaré. */
  systemeProjet?: StudioSystemeProjet;
  /** Sources externes déclarées (`StudioDocument.sources`, EX-014) ; identifiants propres à la liste. */
  sources: StudioSourceExterne[];
  /** Niveaux (`StudioDocument.niveaux`, lot W3-B). */
  niveaux: StudioNiveau[];
  /** Définitions de composants 3D (`StudioDocument.composants`, lot W3-B). */
  composants: StudioComposant[];
  /** Occurrences de composants 3D (`StudioDocument.occurrences`, lot W3-B). */
  occurrences: StudioOccurrence[];
  /** Définitions de blocs (`StudioDocument.blocs`, X.1-01) ; identifiants uniques dans tout le document. */
  blocs: StudioDefinitionBloc[];
  /** Insertions de blocs (`StudioDocument.insertions`, X.1-01) ; géométrie dérivée de leur définition. */
  insertions: StudioInsertionBloc[];
  /** Contraintes géométriques (`StudioDocument.contraintes`, X.1-01). */
  contraintes: StudioContrainte[];
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
  // Formes et murs (cote associative sur objet architectural, AC-001).
  controlerLiens(d, studioResolveurCotes(state.objects, state.architecture), `${path}.params`);
  return d;
}

/** Contours des murs cotés, relevés avant une commande qui les change (`suivreCotesMurs`). */
export type ContoursCotes = ReadonlyMap<string, StudioPolyline | null>;

/**
 * Cotes liées aux murs `ids` après leur changement (même identité) :
 * - transformation connue `t` (Déplacer, Rotation, Symétrie, Échelle) : chaque extrémité liée est l'image par `t` du
 *   sommet (ou milieu) qu'elle désignait sur le contour d'avant ; elle est rattachée au sommet du nouveau contour
 *   **confondu** avec cette image (correspondance physique prouvée), dont l'indice peut changer — une symétrie renverse
 *   l'ordre du contour et l'indice d'avant désignerait la face opposée. Une cote dont les deux extrémités suivent des
 *   murs transformés, et qui n'est pas elle-même choisie (déjà transformée), prend l'image de son décalage ;
 * - sans transformation (Modifier) : l'indice est gardé tant que le contour garde le même nombre de sommets.
 * Sans correspondance prouvée, le lien est rompu et la cote passe « à résoudre » (géométrie gardée, valeur non
 * évaluée) — jamais rattachée en silence à un autre sommet (A.4-05).
 */
export function suivreCotesMurs(state: Etat, avant: ContoursCotes, ids: Iterable<string>, path: string, t?: StudioTransformation, choisies: ReadonlySet<string> = new Set()): void {
  const touches = new Set(ids);
  if (!touches.size || !state.dimensions.some((d) => (d.links.start && touches.has(d.links.start.objectId)) || (d.links.end && touches.has(d.links.end.objectId)))) return;
  const murs = new Map(state.architecture.filter((x) => x.type === "wall" && touches.has(x.id)).map((w) => [w.id, w as StudioCibleCote]));
  state.dimensions = state.dimensions.map((d) => {
    const lie = (l: StudioDimension["links"]["start"]) => !!l && murs.has(l.objectId);
    if (!lie(d.links.start) && !lie(d.links.end)) return d;
    let rompu = false;
    const suivre = (l: StudioDimension["links"]["start"], p: StudioDimension["start"]) => {
      if (!l || !murs.has(l.objectId)) return { lien: l, point: p };
      const mur = murs.get(l.objectId)!;
      const ancien = avant.get(l.objectId) ?? null;
      let lien: StudioDimension["links"]["start"] = null, q: StudioDimension["start"] | null = null;
      if (STUDIO_INDEXED_ANCHOR.test(l.anchor) && ancien) {
        if (t) {
          const origine = studioAnchorPoint(ancien, l.anchor);
          const nouveau = mur.type === "wall" ? studioContourMur(mur) : null;
          const anchor = origine && nouveau ? studioAncreContourMur(nouveau, t.point(origine)) : null;
          if (anchor) { lien = { objectId: l.objectId, anchor }; q = studioAnchorPoint(nouveau!, anchor); }
        } else if (ancien.points.length === sommetsContour(mur)) { lien = l; q = studioPointCibleCote(mur, l.anchor); }
      }
      if (!lien || !q) { rompu = true; return { lien: null, point: p }; }
      return { lien, point: q };
    };
    const s = suivre(d.links.start, d.start), e = suivre(d.links.end, d.end);
    const suit = !!t && !rompu && lie(d.links.start) && lie(d.links.end) && !choisies.has(d.id);
    const offset = suit ? studioDecalageImage(d, t!) : d.offset;
    const memeLiens = s.lien?.anchor === d.links.start?.anchor && e.lien?.anchor === d.links.end?.anchor;
    if (!rompu && memeLiens && offset === d.offset && same(s.point, d.start) && same(e.point, d.end)) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    if (!rompu && same(s.point, e.point)) fail(path, `la cote liée ${d.id} deviendrait de longueur nulle`);
    return rompu
      ? { ...d, start: s.point, end: e.point, links: { start: s.lien, end: e.lien }, toResolve: true }
      : { ...d, start: s.point, end: e.point, offset, links: { start: s.lien, end: e.lien } };
  });
}

/** Nombre de sommets du contour de l'emprise d'un mur (0 si sa géométrie est invalide). */
export function sommetsContour(w: StudioCibleCote): number {
  return w.type === "wall" ? studioContourMur(w)?.points.length ?? 0 : 0;
}

/** Avant une commande qui change des murs : contour de chaque mur coté (pour `suivreCotesMurs`). */
export function contoursCotes(state: Etat): Map<string, StudioPolyline | null> {
  const lies = new Set<string>();
  for (const d of state.dimensions) for (const l of [d.links.start, d.links.end]) if (l) lies.add(l.objectId);
  const m = new Map<string, StudioPolyline | null>();
  if (!lies.size) return m;
  for (const a of state.architecture) if (a.type === "wall" && lies.has(a.id)) m.set(a.id, studioContourMur(a));
  return m;
}

/** Murs retirés : les cotes qui leur étaient liées passent « à résoudre » (lien rompu, géométrie gardée), jamais supprimées. */
export function rompreCotesMurs(state: Etat, ids: ReadonlySet<string>, path: string): void {
  state.dimensions = state.dimensions.map((d) => {
    const rs = !!d.links.start && ids.has(d.links.start.objectId), re = !!d.links.end && ids.has(d.links.end.objectId);
    if (!rs && !re) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    return { ...d, links: { start: rs ? null : d.links.start, end: re ? null : d.links.end }, toResolve: true };
  });
}
