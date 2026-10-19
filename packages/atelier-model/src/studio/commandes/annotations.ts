import { controlerLiensAngulaires, studioAngularFromSegments, studioStraightSegment, translaterCoteAngulaire, validerCoteAngulaire, type StudioAngularDimension } from "../objets/cote-angulaire.js";
import { translaterTexte, validerTexte } from "../objets/texte.js";
import { editable, shapeMap, type Etat } from "./etat.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioAnnotation, StudioShape } from "../objets/formes.js";
import { fail, same } from "../noyau/validation.js";

/**
 * Annotations dans les commandes (cotes angulaires, textes) : saisie contrôlée, déplacement, modification, suivi des
 * segments liés et rupture des liens à la suppression. Appelées par les familles `dessin` et `modification`.
 */

/** Cote angulaire saisie (création ou modification) : jamais « à résoudre », calque modifiable, liens exacts. */
export function coteAngulaireSaisie(state: Etat, params: unknown, path: string): StudioAngularDimension {
  const d = validerCoteAngulaire(params, `${path}.params`);
  if (d.toResolve) fail(`${path}.params.toResolve`, "l’état à résoudre naît d’une suppression, il n’est jamais saisi");
  editable(state, d, path);
  controlerLiensAngulaires(d, shapeMap(state), `${path}.params`);
  return d;
}

/** Déplacement d'une annotation (`true` si l'identifiant en est une) ; une cote angulaire liée suit ses segments. */
export function deplacerAnnotation(state: Etat, id: string, translate: (p: StudioPoint) => StudioPoint, path: string): boolean {
  const i = state.annotations.findIndex((a) => a.id === id);
  const a = state.annotations[i];
  if (!a) return false;
  editable(state, a, path);
  if (a.type === "angular-dimension") {
    if (a.links.first || a.links.second) fail(path, "une cote angulaire liée suit ses segments et ne se déplace pas seule");
    state.annotations[i] = validerCoteAngulaire(translaterCoteAngulaire(a, translate), path);
  } else state.annotations[i] = validerTexte(translaterTexte(a, translate), path);
  return true;
}

/** Modification d'une annotation déjà validée : même identité, même type, même calque. */
export function modifierAnnotation(state: Etat, o: StudioAnnotation, path: string): void {
  const i = state.annotations.findIndex((a) => a.id === o.id);
  const previous = state.annotations[i];
  if (!previous) {
    if (state.ids.has(o.id)) fail(path, "le type de l’objet ne peut pas changer");
    fail(path, "objet introuvable");
  }
  if (previous.type !== o.type) fail(path, "le type de l’objet ne peut pas changer");
  if (previous.layerId !== o.layerId) fail(path, "le calque se change par studio.objet.calque");
  editable(state, previous, path);
  state.annotations[i] = o.type === "angular-dimension" ? coteAngulaireSaisie(state, o, path) : o;
}

/** Les cotes angulaires liées à la forme `shapeId` suivent sa nouvelle géométrie (même identité). */
export function suivreAnnotations(state: Etat, shapeId: string, path: string): void {
  const shapes = shapeMap(state);
  state.annotations = state.annotations.map((a) => {
    if (a.type !== "angular-dimension" || a.toResolve || (a.links.first?.objectId !== shapeId && a.links.second?.objectId !== shapeId)) return a;
    const s1 = shapes.get(a.links.first!.objectId), s2 = shapes.get(a.links.second!.objectId);
    const seg1 = s1 && studioStraightSegment(s1, a.links.first!.segment), seg2 = s2 && studioStraightSegment(s2, a.links.second!.segment);
    if (!seg1 || !seg2) fail(path, `segment de la cote angulaire liée ${a.id} introuvable`);
    const g = studioAngularFromSegments(seg1, seg2);
    if (!g) fail(path, `la cote angulaire liée ${a.id} deviendrait indéterminée (segments parallèles)`);
    if (same(g.vertex, a.vertex) && same(g.first, a.first) && same(g.second, a.second)) return a;
    editable(state, a, `${path} (cote angulaire liée ${a.id})`);
    return { ...a, ...g };
  });
}

/**
 * INV-013 — segments d'une polyligne renumérotés (topologie changée, `modifier`) : un lien de cote angulaire vers un
 * segment de rang i n'est gardé que si ce segment est exactement le même avant et après ; sinon il est rompu et la cote
 * passe « à résoudre » (géométrie figée), jamais rattachée en silence à un autre segment. Un segment qui n'existe plus
 * (ou devenu courbe) n'est pas rompu ici : le suivi des segments refuse la modification, comme avant.
 */
export function rompreSegmentsRenumerotes(state: Etat, avant: StudioShape, apres: StudioShape, path: string): void {
  const rompu = (l: { objectId: string; segment: number } | null) => {
    if (!l || l.objectId !== apres.id) return false;
    const a = studioStraightSegment(avant, l.segment), b = studioStraightSegment(apres, l.segment);
    return !!a && !!b && !(same(a.a, b.a) && same(a.b, b.b));
  };
  state.annotations = state.annotations.map((a) => {
    if (a.type !== "angular-dimension") return a;
    const r1 = rompu(a.links.first), r2 = rompu(a.links.second);
    if (!r1 && !r2) return a;
    editable(state, a, `${path} (cote angulaire liée ${a.id})`);
    return { ...a, links: { first: r1 ? null : a.links.first, second: r2 ? null : a.links.second }, toResolve: true };
  });
}

/** Suppression : les annotations nommées disparaissent ; une cote angulaire liée à un objet supprimé passe « à résoudre ». */
export function supprimerAnnotations(state: Etat, ids: ReadonlySet<string>, path: string): void {
  state.annotations = state.annotations.filter((a) => !ids.has(a.id)).map((a) => {
    if (a.type !== "angular-dimension") return a;
    const breakFirst = !!a.links.first && ids.has(a.links.first.objectId);
    const breakSecond = !!a.links.second && ids.has(a.links.second.objectId);
    if (!breakFirst && !breakSecond) return a;
    editable(state, a, `${path} (cote angulaire liée ${a.id})`);
    return { ...a, links: { first: breakFirst ? null : a.links.first, second: breakSecond ? null : a.links.second }, toResolve: true };
  });
}
