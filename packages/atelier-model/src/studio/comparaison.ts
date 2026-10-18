import { STUDIO_DEFAULT_LAYER_ID, type StudioDimension, type StudioDocument, type StudioLayer, type StudioPoint, type StudioShape } from "./document-2d.js";

/**
 * Comparaison de deux documents Studio (`studio-document/1`), par identifiant : ajouté, supprimé, modifié (avec les
 * propriétés touchées) ou identique, pour les objets, les calques et les cotes. Les deux documents sont dans le même
 * repère `local-2d` en mètres ; aucune tolérance n'est appliquée à la détection des changements (égalité exacte des
 * valeurs saisies). Un identifiant réutilisé avec un autre type donne un « supprimé » puis un « ajouté ». Le déplacement
 * (`dx`, `dy`) n'est signalé que si la seule différence est une translation de la géométrie. Pur et déterministe : ni
 * React, ni DOM, ni stockage ; les entrées ne sont jamais modifiées.
 */

export type StudioEtatDifference = "ajoute" | "supprime" | "modifie" | "identique";
/** Propriétés comparées d'un objet (ligne, rectangle). */
export type StudioProprieteObjet = "geometrie" | "calque" | "extrusion";
/** Propriétés comparées d'un calque. */
export type StudioProprieteCalque = "nom" | "visible" | "verrouille";
/** Propriétés comparées d'une cote. */
export type StudioProprieteCote = "geometrie" | "calque" | "liens";

export interface StudioDeplacement { dx: number; dy: number }

export interface StudioDifferenceObjet {
  id: string;
  etat: StudioEtatDifference;
  /** Type de l'objet décrit : celui d'avant pour un supprimé, celui d'après sinon. */
  type: StudioShape["type"];
  avant: StudioShape | null;
  apres: StudioShape | null;
  proprietes: StudioProprieteObjet[];
  /** Translation pure de la géométrie (seule propriété modifiée), sinon `null`. */
  deplacement: StudioDeplacement | null;
}
export interface StudioDifferenceCalque {
  id: string;
  etat: StudioEtatDifference;
  avant: StudioLayer | null;
  apres: StudioLayer | null;
  proprietes: StudioProprieteCalque[];
}
export interface StudioDifferenceCote {
  id: string;
  etat: StudioEtatDifference;
  avant: StudioDimension | null;
  apres: StudioDimension | null;
  proprietes: StudioProprieteCote[];
  deplacement: StudioDeplacement | null;
}
export interface StudioCompteDifferences { ajoute: number; supprime: number; modifie: number; identique: number; deplace: number }
export interface StudioDifferenceDocuments {
  objets: StudioDifferenceObjet[];
  calques: StudioDifferenceCalque[];
  cotes: StudioDifferenceCote[];
  resume: { objets: StudioCompteDifferences; calques: StudioCompteDifferences; cotes: StudioCompteDifferences };
  /** Vrai si aucun ajout, suppression ni modification, sur aucune des trois familles. */
  identiques: boolean;
}

/** Arrondi d'affichage du déplacement (nanomètre) : efface le bruit flottant de `(x + dx) - x`. */
const nano = (v: number): number => {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};
/** Écart admis entre les translations des différents points d'un même objet (bruit flottant seulement). */
const EPS_TRANSLATION = 1e-9;

const samePoint = (a: StudioPoint, b: StudioPoint): boolean => a.x === b.x && a.y === b.y;
const layerOf = (o: { layerId?: string }): string => o.layerId ?? STUDIO_DEFAULT_LAYER_ID;
const sameExtrusion = (a: StudioShape["extrusion"], b: StudioShape["extrusion"]): boolean => {
  if (!a || !b) return !a && !b;
  const ta = (a as { thickness?: number }).thickness, tb = (b as { thickness?: number }).thickness;
  return a.base === b.base && a.height === b.height && ta === tb;
};

/** Points de la géométrie, dans un ordre fixe par type ; les grandeurs non ponctuelles sont comparées à part. */
function geometryPoints(o: StudioShape): StudioPoint[] {
  return o.type === "line" ? [o.start, o.end] : [o.origin];
}
function sameShapeGeometry(a: StudioShape, b: StudioShape): boolean {
  if (a.type === "line" && b.type === "line") return samePoint(a.start, b.start) && samePoint(a.end, b.end);
  if (a.type === "rectangle" && b.type === "rectangle") return samePoint(a.origin, b.origin) && a.width === b.width && a.height === b.height;
  return false;
}
/** Translation commune à tous les points, sinon `null`. */
function translation(from: readonly StudioPoint[], to: readonly StudioPoint[]): StudioDeplacement | null {
  if (from.length !== to.length || from.length === 0) return null;
  const dx = to[0]!.x - from[0]!.x, dy = to[0]!.y - from[0]!.y;
  for (let i = 1; i < from.length; i++) {
    if (Math.abs(to[i]!.x - from[i]!.x - dx) > EPS_TRANSLATION || Math.abs(to[i]!.y - from[i]!.y - dy) > EPS_TRANSLATION) return null;
  }
  return { dx: nano(dx), dy: nano(dy) };
}
function shapeTranslation(a: StudioShape, b: StudioShape): StudioDeplacement | null {
  if (a.type === "rectangle" && b.type === "rectangle" && (a.width !== b.width || a.height !== b.height)) return null;
  return translation(geometryPoints(a), geometryPoints(b));
}

const byId = <T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> => new Map((items ?? []).map((x) => [x.id, x]));
/** Identifiants des deux côtés, triés par point de code (indépendant de la locale et de l'ordre des documents). */
function sortedIds(a: Map<string, unknown>, b: Map<string, unknown>): string[] {
  return [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}
const emptyCount = (): StudioCompteDifferences => ({ ajoute: 0, supprime: 0, modifie: 0, identique: 0, deplace: 0 });
function count(items: readonly { etat: StudioEtatDifference; deplacement?: StudioDeplacement | null }[]): StudioCompteDifferences {
  const c = emptyCount();
  for (const item of items) {
    c[item.etat] += 1;
    if (item.deplacement) c.deplace += 1;
  }
  return c;
}

function compareObjects(from: StudioDocument, to: StudioDocument): StudioDifferenceObjet[] {
  const a = byId(from.objects), b = byId(to.objects);
  const out: StudioDifferenceObjet[] = [];
  for (const id of sortedIds(a, b)) {
    const avant = a.get(id) ?? null, apres = b.get(id) ?? null;
    if (avant && (!apres || apres.type !== avant.type)) out.push({ id, etat: "supprime", type: avant.type, avant: structuredClone(avant), apres: null, proprietes: [], deplacement: null });
    if (apres && (!avant || apres.type !== avant.type)) out.push({ id, etat: "ajoute", type: apres.type, avant: null, apres: structuredClone(apres), proprietes: [], deplacement: null });
    if (!avant || !apres || avant.type !== apres.type) continue;
    const proprietes: StudioProprieteObjet[] = [];
    if (!sameShapeGeometry(avant, apres)) proprietes.push("geometrie");
    if (layerOf(avant) !== layerOf(apres)) proprietes.push("calque");
    if (!sameExtrusion(avant.extrusion, apres.extrusion)) proprietes.push("extrusion");
    const deplacement = proprietes.length === 1 && proprietes[0] === "geometrie" ? shapeTranslation(avant, apres) : null;
    out.push({ id, etat: proprietes.length ? "modifie" : "identique", type: apres.type, avant: structuredClone(avant), apres: structuredClone(apres), proprietes, deplacement });
  }
  return out;
}

function compareLayers(from: StudioDocument, to: StudioDocument): StudioDifferenceCalque[] {
  const a = byId(from.layers), b = byId(to.layers);
  return sortedIds(a, b).map((id): StudioDifferenceCalque => {
    let avant = a.get(id) ?? null, apres = b.get(id) ?? null;
    // Le calque par défaut existe toujours (implicite : visible, non verrouillé) ; le rendre explicite n'est pas un ajout.
    if (id === STUDIO_DEFAULT_LAYER_ID && !avant && apres) avant = { ...apres, visible: true, locked: false };
    if (id === STUDIO_DEFAULT_LAYER_ID && avant && !apres) apres = { ...avant, visible: true, locked: false };
    if (!avant) return { id, etat: "ajoute", avant: null, apres: structuredClone(apres), proprietes: [] };
    if (!apres) return { id, etat: "supprime", avant: structuredClone(avant), apres: null, proprietes: [] };
    const proprietes: StudioProprieteCalque[] = [];
    if (avant.name !== apres.name) proprietes.push("nom");
    if (avant.visible !== apres.visible) proprietes.push("visible");
    if (avant.locked !== apres.locked) proprietes.push("verrouille");
    return { id, etat: proprietes.length ? "modifie" : "identique", avant: structuredClone(avant), apres: structuredClone(apres), proprietes };
  });
}

const sameLink = (a: StudioDimension["links"]["start"], b: StudioDimension["links"]["start"]): boolean =>
  a === null || b === null ? a === b : a.objectId === b.objectId && a.anchor === b.anchor;

function compareDimensions(from: StudioDocument, to: StudioDocument): StudioDifferenceCote[] {
  const a = byId(from.dimensions), b = byId(to.dimensions);
  return sortedIds(a, b).map((id): StudioDifferenceCote => {
    const avant = a.get(id) ?? null, apres = b.get(id) ?? null;
    if (!avant) return { id, etat: "ajoute", avant: null, apres: structuredClone(apres), proprietes: [], deplacement: null };
    if (!apres) return { id, etat: "supprime", avant: structuredClone(avant), apres: null, proprietes: [], deplacement: null };
    const proprietes: StudioProprieteCote[] = [];
    if (!samePoint(avant.start, apres.start) || !samePoint(avant.end, apres.end) || avant.offset !== apres.offset) proprietes.push("geometrie");
    if (layerOf(avant) !== layerOf(apres)) proprietes.push("calque");
    if (!sameLink(avant.links.start, apres.links.start) || !sameLink(avant.links.end, apres.links.end) || avant.toResolve !== apres.toResolve) proprietes.push("liens");
    const deplacement = proprietes.length === 1 && proprietes[0] === "geometrie" && avant.offset === apres.offset
      ? translation([avant.start, avant.end], [apres.start, apres.end]) : null;
    return { id, etat: proprietes.length ? "modifie" : "identique", avant: structuredClone(avant), apres: structuredClone(apres), proprietes, deplacement };
  });
}

/** Différence de `a` (avant) vers `b` (après). Les documents sont supposés valides (`validateStudioDocument`). */
export function comparerDocumentsStudio(a: StudioDocument, b: StudioDocument): StudioDifferenceDocuments {
  const objets = compareObjects(a, b), calques = compareLayers(a, b), cotes = compareDimensions(a, b);
  const resume = { objets: count(objets), calques: count(calques), cotes: count(cotes) };
  const identiques = [resume.objets, resume.calques, resume.cotes].every((c) => c.ajoute + c.supprime + c.modifie === 0);
  return { objets, calques, cotes, resume, identiques };
}
