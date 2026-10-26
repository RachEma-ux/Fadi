import { studioMaillageComposant, studioMaillageOccurrence, type StudioMaillageComposant, type StudioOccurrence3d } from "./batiment/composants.js";
import { studioShapeOutline } from "./courbes.js";
import { STUDIO_DEFAULT_LAYER_ID } from "./noyau/limites.js";
import { studioLayerState, validateStudioDocument, type StudioDocument, type StudioShape } from "./document-2d.js";
import { STUDIO_FRAME_3D, studioLocal2dVers3d, type StudioPoint3, type StudioSolid3d } from "./exporteurs/maillage.js";
import { typeObjet } from "./objets/index.js";
import { studioCotesExtrusion } from "./noyau/types.js";
import { studioLienSolide } from "./commandes/liens-solides.js";
import { studioMaillageSolide, type StudioFreeSolid3d } from "./objets-3d/maillage.js";
import { studioMaillageExact, type StudioExact3d } from "./objets-3d/exacts.js";
import { studioMaillageSurface, type StudioSurface3d } from "./objets-3d/surfaces-libres.js";
import { studioMaillageSubdivision, type StudioSubdivision3d } from "./objets-3d/subdivisions.js";
import { studioMaillageArchitecture, type StudioArchitecture3d } from "./architecture/maillage.js";
import type { StudioArchitectureItem } from "./architecture/types.js";
import type { StudioMesh3d, StudioOutline3d } from "./mesh-3d.js";

/**
 * Projections reconstructibles et versionnées (lot C.2) : le maillage 3D (`studioMesh3d`) et le rendu du plan 2D sont
 * **dérivés** du document, jamais stockés. Chaque projection porte une clé de version (`studioVersionProjection`) :
 * révision du document (fournie par l'appelant) plus empreinte du contenu des seules entrées qu'elle lit. Chaque objet
 * projeté porte sa propre clé (`studioClesProjection`) : empreinte de son contenu **et** de ce dont dépend sa géométrie
 * (un mur lit ses ouvertures, une ouverture lit son mur hôte).
 *
 * Invalidation minimale (`projectionsAInvalider`) : entre deux documents, seuls les objets dont la clé change, leurs
 * dépendants (hôte et ouvertures, cotes liées, objets visés par une apparence modifiée) sont à reprojeter ; une
 * reconstruction complète est demandée quand l'exactitude l'exige (calques modifiés, autre document) ou quand
 * l'ampleur du changement la rend aussi coûteuse (`STUDIO_SEUIL_INVALIDATION`).
 *
 * Maillage par morceaux (`studioMaillerObjets`, `studioAssemblerMaillage`, `studioMesh3dIncremental`) : un morceau par
 * objet, rangé sous sa clé ; l'assemblage dans l'ordre du document rend **exactement** `studioMesh3d` (contrôlé par test
 * de propriété). Repère `local-3d` comme `studioMesh3d`. Pur : ni React, ni DOM, ni moteur de rendu.
 */

/** JSON à clés triées (les tableaux gardent leur ordre) ; `undefined` est omis comme dans `JSON.stringify`. */
export function studioJsonStable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : studioJsonStable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${studioJsonStable(o[k])}`).join(",")}}`;
}

function fnv(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Empreinte de contenu : FNV-1a 64 bits (deux passes 32 bits de graines distinctes) du JSON stable, en hexadécimal.
 * Elle reconnaît un même contenu, elle ne prouve aucune intégrité (ce n'est pas une empreinte cryptographique).
 */
export function studioEmpreinteContenu(v: unknown): string {
  return empreinteTexte(studioJsonStable(v));
}

const empreinteTexte = (s: string): string => fnv(s).toString(16).padStart(8, "0") + fnv(s, 0x01000193 ^ 0x9e3779b9).toString(16).padStart(8, "0");

/**
 * Empreinte d'un élément d'un document validé : les validateurs construisent chaque élément dans un ordre de clés fixe,
 * donc `JSON.stringify` (natif, bien plus rapide que le JSON stable) suffit. Un document non canonique ne peut donner
 * qu'une clé différente pour un même contenu (invalidation en trop, jamais en moins).
 */
const empreinteElement = (x: unknown): string => empreinteTexte(JSON.stringify(x));

/** Projections dérivées du document : géométrie 3D (vue 3D, coupe) et rendu du plan 2D (planche SVG). */
export type StudioProjection = "maillage-3d" | "plan-2d";
export const STUDIO_PROJECTIONS: readonly StudioProjection[] = Object.freeze(["maillage-3d", "plan-2d"] as const);

/** Clé de version d'une projection : révision du document lu et empreinte du contenu des entrées lues. */
export interface StudioVersionProjection {
  projection: StudioProjection;
  revision: string;
  contenu: string;
}

type Famille = "objet" | "cote" | "annotation" | "solide" | "architecture" | "occurrence";

/** Clés par objet d'un document (mémorisées : un document est immuable). */
interface Cles {
  /** Empreinte du contenu propre de chaque élément (objet, cote, annotation, solide, mur, ouverture). */
  propres: Map<string, string>;
  /** Clé de projection : contenu propre et dépendances géométriques (mur ↔ ouvertures). */
  projection: Map<string, string>;
  /** Famille de chaque identifiant (sert aux entrées lues par chaque projection). */
  famille: Map<string, Famille>;
  calques: string;
  apparences: Map<string, string>;
  versions: Map<StudioProjection, string>;
  /** Clé de morceau de maillage (mémorisée à la première lecture) : clé de projection et visibilité effective du calque. */
  morceaux?: Map<string, string>;
}
const CLES = new WeakMap<StudioDocument, Cles>();

function cles(doc: StudioDocument): Cles {
  let c = CLES.get(doc);
  if (c) return c;
  const propres = new Map<string, string>(), famille: Cles["famille"] = new Map();
  const poser = (f: Famille) => (x: { id: string }) => { propres.set(x.id, empreinteElement(x)); famille.set(x.id, f); };
  doc.objects.forEach(poser("objet"));
  (doc.dimensions ?? []).forEach(poser("cote"));
  (doc.annotations ?? []).forEach(poser("annotation"));
  (doc.solides ?? []).forEach(poser("solide"));
  (doc.exacts ?? []).forEach(poser("solide"));
  (doc.surfaces ?? []).forEach(poser("solide"));
  (doc.subdivisions ?? []).forEach(poser("solide"));
  (doc.architecture ?? []).forEach(poser("architecture"));
  // Occurrences de composants (lot W3-B) : leur géométrie dérive de leur définition, lue par leur clé de projection.
  (doc.occurrences ?? []).forEach(poser("occurrence"));
  const projection = new Map(propres);
  const definitions = new Map((doc.composants ?? []).map((d) => [d.id, empreinteElement(d)]));
  for (const o of doc.occurrences ?? []) projection.set(o.id, empreinteTexte(`${propres.get(o.id)}|definition:${definitions.get(o.composantId) ?? "absente"}`));
  // Un mur lit ses ouvertures (vides) ; une ouverture lit son mur hôte (cote de base, axe, épaisseur, calque).
  const ouvertures = new Map<string, string[]>();
  for (const a of doc.architecture ?? []) if (a.type === "opening") (ouvertures.get(a.hostId) ?? ouvertures.set(a.hostId, []).get(a.hostId)!).push(propres.get(a.id)!);
  for (const a of doc.architecture ?? []) {
    if (a.type !== "opening") projection.set(a.id, empreinteTexte([propres.get(a.id), ...(ouvertures.get(a.id) ?? [])].join("|")));
    else projection.set(a.id, empreinteTexte(`${propres.get(a.id)}|${propres.get(a.hostId) ?? ""}`));
  }
  // Un solide lié à un profil source (lot F1) lit cette source : son état (à jour, à résoudre) en dépend.
  for (const s of doc.solides ?? []) if (s.type === "prism" && s.source && s.source.relation !== "copie-independante") projection.set(s.id, empreinteTexte(`${propres.get(s.id)}|source:${propres.get(s.source.objectId) ?? "absente"}`));
  const apparences = new Map<string, string>();
  for (const s of doc.scenes ?? []) if (s.type === "appearance") apparences.set(s.id, empreinteElement(s));
  c = { propres, projection, famille, calques: empreinteElement(doc.layers ?? []), apparences, versions: new Map() };
  CLES.set(doc, c);
  return c;
}

/** Entrées lues par chaque projection (familles d'objets) ; les deux lisent les calques. */
const LECTURES: Record<StudioProjection, ReadonlySet<string>> = {
  "maillage-3d": new Set(["objet", "solide", "architecture", "occurrence"]),
  "plan-2d": new Set(["objet", "cote", "annotation", "architecture"]),
};

/**
 * Clé du morceau de maillage de chaque objet maillable : clé de projection plus visibilité effective de son calque (une
 * ouverture suit le calque de son mur). Un morceau ne lit que la visibilité des calques : un morceau d'une autre
 * visibilité n'est donc jamais repris, quel que soit le cache fourni.
 */
function clesMorceaux(doc: StudioDocument): Map<string, string> {
  const c = cles(doc);
  if (c.morceaux) return c.morceaux;
  const m = new Map<string, string>();
  const poser = (id: string, layerId: string | undefined) => m.set(id, `${c.projection.get(id)}|${studioLayerState(doc, layerId)?.visible ? "v" : "m"}`);
  for (const o of doc.objects) poser(o.id, o.layerId);
  for (const o of doc.solides ?? []) poser(o.id, o.layerId);
  for (const o of doc.exacts ?? []) poser(o.id, o.layerId);
  for (const o of doc.surfaces ?? []) poser(o.id, o.layerId);
  for (const o of doc.subdivisions ?? []) poser(o.id, o.layerId);
  const murs = new Map((doc.architecture ?? []).flatMap((x) => (x.type === "wall" ? [[x.id, x.layerId] as const] : [])));
  for (const o of doc.architecture ?? []) poser(o.id, o.type !== "opening" ? o.layerId : murs.get(o.hostId));
  for (const o of doc.occurrences ?? []) poser(o.id, o.layerId);
  c.morceaux = m;
  return m;
}

/** Clé de projection de chaque objet projeté (objets, cotes, annotations, solides, murs, ouvertures), par identifiant. */
export function studioClesProjection(doc: StudioDocument): ReadonlyMap<string, string> {
  return cles(doc).projection;
}

/**
 * Clé de version d'une projection : `revision` (identifiant de révision ou numéro de session donné par l'appelant) et
 * empreinte des seules entrées lues — les scènes, propriétés et apparences ne changent pas la géométrie ; les solides
 * ne paraissent pas sur le plan 2D. Deux documents de même contenu lu ont la même empreinte, quelle que soit leur révision.
 */
export function studioVersionProjection(doc: StudioDocument, projection: StudioProjection, revision: string): StudioVersionProjection {
  const c = cles(doc);
  let contenu = c.versions.get(projection);
  if (contenu === undefined) {
    const lues = LECTURES[projection];
    const parties: string[] = [doc.id, c.calques];
    for (const [id, k] of c.projection) if (lues.has(c.famille.get(id)!)) parties.push(id, k);
    contenu = empreinteTexte(parties.join("|"));
    c.versions.set(projection, contenu);
  }
  return { projection, revision, contenu };
}

/** Motif d'une reconstruction complète. */
export type StudioRaisonComplete = "premier" | "document" | "calques" | "ampleur";

export interface StudioInvalidation {
  /** Identifiants à reprojeter (ajoutés, retirés, modifiés, et leurs dépendants), triés. */
  ids: string[];
  /** Reconstruction complète demandée (les `ids` restent donnés à titre indicatif). */
  complet: boolean;
  raison: StudioRaisonComplete | null;
}

/**
 * Au-delà de cette part des objets projetés touchés (et d'au moins `min` objets), la reconstruction complète est
 * demandée : reprojeter objet par objet coûterait autant. Borne de conduite choisie par Fadi, pas une mesure métier.
 */
export const STUDIO_SEUIL_INVALIDATION = Object.freeze({ part: 0.5, min: 32 });

/**
 * Objets à reprojeter entre `avant` et `apres` (documents validés, immuables). Pur ; comparaison par clés de contenu.
 *
 * - Ajouté, retiré ou modifié : sa clé change. Une ouverture modifiée invalide son mur hôte (avant et après) ; un mur
 *   modifié invalide ses ouvertures (C.2-06), par les clés de projection.
 * - Cotes et cotes angulaires liées à un objet touché : invalidées avec lui.
 * - Apparence ajoutée, retirée ou modifiée : l'objet visé, ou tous les objets du calque visé (filtre d'affichage).
 * - Complet : premier calcul, autre document, calques modifiés (visibilité, verrou, nom : l'exactitude passe par tout
 *   reprojeter), ou ampleur au-delà de `STUDIO_SEUIL_INVALIDATION`.
 */
export function projectionsAInvalider(avant: StudioDocument | null, apres: StudioDocument): StudioInvalidation {
  const b = cles(apres);
  if (!avant) return { ids: [...b.projection.keys()].sort(), complet: true, raison: "premier" };
  if (avant === apres) return { ids: [], complet: false, raison: null };
  const a = cles(avant);
  const ids = new Set<string>();
  for (const [id, k] of b.projection) if (a.projection.get(id) !== k) ids.add(id);
  for (const id of a.projection.keys()) if (!b.projection.has(id)) ids.add(id);
  // Cotes liées aux objets touchés (dans l'un ou l'autre document).
  const touches = new Set(ids);
  for (const d of [avant, apres]) {
    for (const c of d.dimensions ?? []) if ((c.links.start && touches.has(c.links.start.objectId)) || (c.links.end && touches.has(c.links.end.objectId))) ids.add(c.id);
    for (const c of d.annotations ?? []) if (c.type === "angular-dimension" && ((c.links.first && touches.has(c.links.first.objectId)) || (c.links.second && touches.has(c.links.second.objectId)))) ids.add(c.id);
  }
  // Apparences (filtres d'affichage des scènes) : objets visés.
  const visees: { kind: "layer" | "object"; id: string }[] = [];
  for (const [d, autre] of [[avant, b], [apres, a]] as const) {
    for (const s of d.scenes ?? []) if (s.type === "appearance" && autre.apparences.get(s.id) !== empreinteElement(s)) visees.push(s.target);
  }
  if (visees.length) {
    const calques = new Set(visees.filter((v) => v.kind === "layer").map((v) => v.id));
    for (const v of visees) if (v.kind === "object") ids.add(v.id);
    if (calques.size) for (const d of [avant, apres]) for (const [id, layerId] of calquesDesObjets(d)) if (calques.has(layerId)) ids.add(id);
  }
  const tries = [...ids].sort();
  if (avant.id !== apres.id) return { ids: tries, complet: true, raison: "document" };
  if (a.calques !== b.calques) return { ids: tries, complet: true, raison: "calques" };
  const total = Math.max(a.projection.size, b.projection.size);
  if (tries.length >= STUDIO_SEUIL_INVALIDATION.min && tries.length > total * STUDIO_SEUIL_INVALIDATION.part) return { ids: tries, complet: true, raison: "ampleur" };
  return { ids: tries, complet: false, raison: null };
}

/** Calque effectif de chaque objet projeté (`STUDIO_DEFAULT_LAYER_ID` pour le calque implicite ; une ouverture suit son mur). */
function* calquesDesObjets(d: StudioDocument): Generator<[string, string]> {
  const calque = (l: string | undefined) => l ?? STUDIO_DEFAULT_LAYER_ID;
  for (const o of d.objects) yield [o.id, calque(o.layerId)];
  for (const o of d.dimensions ?? []) yield [o.id, calque(o.layerId)];
  for (const o of d.annotations ?? []) yield [o.id, calque(o.layerId)];
  for (const o of d.solides ?? []) yield [o.id, calque(o.layerId)];
  for (const o of d.exacts ?? []) yield [o.id, calque(o.layerId)];
  for (const o of d.surfaces ?? []) yield [o.id, calque(o.layerId)];
  for (const o of d.subdivisions ?? []) yield [o.id, calque(o.layerId)];
  const murs = new Map((d.architecture ?? []).filter((x) => x.type === "wall").map((x) => [x.id, x.type === "wall" ? x.layerId : undefined]));
  for (const o of d.architecture ?? []) yield [o.id, calque(o.type !== "opening" ? o.layerId : murs.get(o.hostId))];
  for (const o of d.occurrences ?? []) yield [o.id, calque(o.layerId)];
}

/**
 * Morceau du maillage 3D d'un objet, rangé sous sa clé (clé de projection et visibilité effective de son calque) : son volume (`solid`), son contour plat
 * (`outline`), son solide libre (`freeSolid`) ou son élément architectural (`architecture`) ; `hidden` s'il est sur un
 * calque masqué ; rien s'il n'a aucun volume rendu.
 */
export interface StudioMorceauMaillage {
  id: string;
  cle: string;
  solid?: StudioSolid3d;
  outline?: StudioOutline3d;
  freeSolid?: StudioFreeSolid3d;
  /** Solide exact (lot F2) : maillage du noyau, conservé dans le document. */
  exact?: StudioExact3d;
  /** Surface libre NURBS (X.1-05) : nappe évaluée depuis sa définition. */
  surface?: StudioSurface3d;
  /** Surface de subdivision (X.1-05) : maillage subdivisé. */
  subdivision?: StudioSubdivision3d;
  architecture?: StudioArchitecture3d;
  /** Occurrence de composant (lot W3-B) : maillage de sa définition placé. */
  occurrence?: StudioOccurrence3d;
  hidden?: true;
}

function contour(o: StudioShape): StudioOutline3d {
  const { points, closed } = studioShapeOutline(o);
  return { id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), points: points.map((p) => studioLocal2dVers3d(p, 0)), closed };
}

/**
 * Maillage des seuls objets `ids` (tous si null) d'un document **validé** (sortie de `applyStudioCommands` ou de
 * `validateStudioDocument`) : un morceau par objet maillable (objets, solides libres, murs, ouvertures), dans l'ordre du
 * document ; un mur est maillé avec ses ouvertures, une ouverture avec son hôte. Les cotes et annotations n'ont pas de
 * morceau 3D. Avec `ids` null, le document est validé d'abord, comme par `studioMesh3d`.
 */
export function studioMaillerObjets(document: StudioDocument, ids: readonly string[] | null): StudioMorceauMaillage[] {
  const doc = ids === null ? validateStudioDocument(document) : document;
  const voulus = ids === null ? null : new Set(ids);
  const veut = (id: string) => voulus === null || voulus.has(id);
  const cle = clesMorceaux(doc);
  const visible = (l: string | undefined) => !!studioLayerState(doc, l)?.visible;
  const out: StudioMorceauMaillage[] = [];
  for (const o of doc.objects) {
    if (!veut(o.id)) continue;
    const m: StudioMorceauMaillage = { id: o.id, cle: cle.get(o.id)! };
    if (!visible(o.layerId)) m.hidden = true;
    else if (!o.extrusion) m.outline = contour(o);
    else {
      const { zMin, zMax } = studioCotesExtrusion(o.extrusion);
      const s = typeObjet(o).volume(o, zMin, zMax);
      if (s) m.solid = { id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), kind: s.kind, ...s.geometry };
    }
    out.push(m);
  }
  for (const s of doc.solides ?? []) {
    if (!veut(s.id)) continue;
    out.push(visible(s.layerId) ? { id: s.id, cle: cle.get(s.id)!, freeSolid: studioMaillageSolide(s, studioLienSolide(doc, s)) } : { id: s.id, cle: cle.get(s.id)!, hidden: true });
  }
  for (const s of doc.exacts ?? []) {
    if (!veut(s.id)) continue;
    out.push(visible(s.layerId) ? { id: s.id, cle: cle.get(s.id)!, exact: studioMaillageExact(s) } : { id: s.id, cle: cle.get(s.id)!, hidden: true });
  }
  for (const s of doc.surfaces ?? []) {
    if (!veut(s.id)) continue;
    out.push(visible(s.layerId) ? { id: s.id, cle: cle.get(s.id)!, surface: studioMaillageSurface(s) } : { id: s.id, cle: cle.get(s.id)!, hidden: true });
  }
  for (const s of doc.subdivisions ?? []) {
    if (!veut(s.id)) continue;
    out.push(visible(s.layerId) ? { id: s.id, cle: cle.get(s.id)!, subdivision: studioMaillageSubdivision(s) } : { id: s.id, cle: cle.get(s.id)!, hidden: true });
  }
  const archi = doc.architecture ?? [];
  if (archi.length) {
    // Murs concernés : murs voulus et hôtes des ouvertures voulues ; chacun est maillé avec toutes ses ouvertures.
    const murs = new Set<string>();
    for (const a of archi) if (veut(a.id)) murs.add(a.type === "opening" ? a.hostId : a.id);
    const sousEnsemble: StudioArchitectureItem[] = voulus === null ? archi : archi.filter((a) => murs.has(a.type === "opening" ? a.hostId : a.id));
    const mailles = new Map(studioMaillageArchitecture(sousEnsemble, visible).map((m) => [m.id, m]));
    for (const a of sousEnsemble) {
      if (!veut(a.id)) continue;
      const m = mailles.get(a.id);
      out.push(m ? { id: a.id, cle: cle.get(a.id)!, architecture: m } : { id: a.id, cle: cle.get(a.id)!, hidden: true });
    }
  }
  // Occurrences de composants (lot W3-B) : la définition maillée une fois, placée par chaque occurrence voulue.
  if (doc.occurrences?.length) {
    const composants = new Map((doc.composants ?? []).map((c) => [c.id, c]));
    const definitions = new Map<string, StudioMaillageComposant>();
    for (const o of doc.occurrences) {
      if (!veut(o.id)) continue;
      if (!visible(o.layerId)) { out.push({ id: o.id, cle: cle.get(o.id)!, hidden: true }); continue; }
      let d = definitions.get(o.composantId);
      if (!d) definitions.set(o.composantId, d = studioMaillageComposant(composants.get(o.composantId)!));
      out.push({ id: o.id, cle: cle.get(o.id)!, occurrence: studioMaillageOccurrence(o, d) });
    }
  }
  return out;
}

/**
 * Maillage du document assemblé depuis ses morceaux, dans l'ordre du document : identique à `studioMesh3d(doc)` pour un
 * document validé dont chaque objet maillable a son morceau. Un morceau manquant ou d'une autre clé est remaillé sur
 * place : la clé d'un morceau couvre son contenu, ses dépendances (mur ↔ ouvertures) et la visibilité effective de son
 * calque, donc l'exactitude ne dépend jamais du cache fourni (un cache périmé, même après un calque masqué, est sûr).
 */
export function studioAssemblerMaillage(doc: StudioDocument, morceaux: ReadonlyMap<string, StudioMorceauMaillage>): StudioMesh3d {
  const cle = clesMorceaux(doc);
  const manquants: string[] = [];
  const maillables = [...doc.objects, ...(doc.solides ?? []), ...(doc.exacts ?? []), ...(doc.surfaces ?? []), ...(doc.subdivisions ?? []), ...(doc.architecture ?? []), ...(doc.occurrences ?? [])];
  for (const o of maillables) if (morceaux.get(o.id)?.cle !== cle.get(o.id)) manquants.push(o.id);
  const complements = manquants.length ? new Map(studioMaillerObjets(doc, manquants).map((m) => [m.id, m])) : null;
  const lire = (id: string) => complements?.get(id) ?? morceaux.get(id)!;
  const solids: StudioSolid3d[] = [], outlines: StudioOutline3d[] = [], freeSolids: StudioFreeSolid3d[] = [], exacts: StudioExact3d[] = [], surfaces: StudioSurface3d[] = [], subdivisions: StudioSubdivision3d[] = [], architecture: StudioArchitecture3d[] = [], occurrences: StudioOccurrence3d[] = [];
  let hidden = 0;
  for (const o of doc.objects) {
    const m = lire(o.id);
    if (m.hidden) hidden++;
    else if (m.outline) outlines.push(m.outline);
    else if (m.solid) solids.push(m.solid);
  }
  for (const s of doc.solides ?? []) {
    const m = lire(s.id);
    if (m.freeSolid) freeSolids.push(m.freeSolid); else hidden++;
  }
  for (const s of doc.exacts ?? []) {
    const m = lire(s.id);
    if (m.exact) exacts.push(m.exact); else hidden++;
  }
  for (const s of doc.surfaces ?? []) {
    const m = lire(s.id);
    if (m.surface) surfaces.push(m.surface); else hidden++;
  }
  for (const s of doc.subdivisions ?? []) {
    const m = lire(s.id);
    if (m.subdivision) subdivisions.push(m.subdivision); else hidden++;
  }
  for (const a of doc.architecture ?? []) {
    const m = lire(a.id);
    if (m.architecture) architecture.push(m.architecture); else hidden++;
  }
  for (const o of doc.occurrences ?? []) {
    const m = lire(o.id);
    if (m.occurrence) occurrences.push(m.occurrence); else hidden++;
  }
  // Emprise : min / max par composante, indépendants de l'ordre (Math.min tient -0 pour inférieur à +0 dans tous les
  // ordres) ; l'emprise de chaque morceau est mémorisée, l'assemblage ne parcourt donc que les morceaux.
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, vide = true;
  const etendre = (e: Emprise | null) => {
    if (!e) return;
    vide = false;
    x0 = Math.min(x0, e[0]); y0 = Math.min(y0, e[1]); z0 = Math.min(z0, e[2]); x1 = Math.max(x1, e[3]); y1 = Math.max(y1, e[4]); z1 = Math.max(z1, e[5]);
  };
  for (const s of solids) etendre(emprise(s, s.vertices));
  for (const l of outlines) etendre(emprise(l, l.points));
  for (const s of freeSolids) etendre(emprise(s, s.vertices));
  for (const s of exacts) etendre(emprise(s, s.vertices));
  for (const s of surfaces) etendre(emprise(s, s.vertices));
  for (const s of subdivisions) etendre(emprise(s, s.vertices));
  for (const s of architecture) etendre(emprise(s, s.vertices));
  for (const s of occurrences) etendre(emprise(s, s.vertices));
  const bounds: StudioMesh3d["bounds"] = vide ? null : { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } };
  return {
    frame: STUDIO_FRAME_3D, units: "m", source: { frame: "local-2d", conversion: "(x, y) → (x, y, z)" }, solids, outlines, nonExtruded: outlines.length, hidden,
    ...(doc.solides?.length ? { freeSolids } : {}), ...(doc.exacts?.length ? { exacts } : {}), ...(doc.surfaces?.length ? { surfaces } : {}), ...(doc.subdivisions?.length ? { subdivisions } : {}), ...(doc.architecture?.length ? { architecture } : {}), ...(doc.occurrences?.length ? { occurrences } : {}), bounds,
  };
}

/** Emprise d'un élément du maillage : [xMin, yMin, zMin, xMax, yMax, zMax], null sans sommet ; mémorisée par élément. */
type Emprise = readonly [number, number, number, number, number, number];
const EMPRISES = new WeakMap<object, Emprise | null>();
function emprise(element: object, points: readonly StudioPoint3[]): Emprise | null {
  let e = EMPRISES.get(element);
  if (e !== undefined) return e;
  if (!points.length) e = null;
  else {
    let x0 = points[0]!.x, y0 = points[0]!.y, z0 = points[0]!.z, x1 = x0, y1 = y0, z1 = z0;
    for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); z1 = Math.max(z1, p.z); }
    e = [x0, y0, z0, x1, y1, z1];
  }
  EMPRISES.set(element, e);
  return e;
}

/** Cache du maillage par objet : document dont il est issu et morceaux par identifiant. */
export interface StudioCacheMaillage {
  doc: StudioDocument;
  morceaux: ReadonlyMap<string, StudioMorceauMaillage>;
}

/** Cache mis à jour : morceaux des `ids` invalidés retirés, nouveaux morceaux posés (reconstruction complète : remplacé). */
export function studioFusionnerMorceaux(cache: StudioCacheMaillage | null, doc: StudioDocument, invalidation: StudioInvalidation, morceaux: readonly StudioMorceauMaillage[]): StudioCacheMaillage {
  const m = new Map(invalidation.complet || !cache ? [] : cache.morceaux);
  if (!invalidation.complet) for (const id of invalidation.ids) m.delete(id);
  for (const x of morceaux) m.set(x.id, x);
  return { doc, morceaux: m };
}

export interface StudioMaillageIncremental {
  mesh: StudioMesh3d;
  cache: StudioCacheMaillage;
  invalidation: StudioInvalidation;
  /** Objets effectivement remaillés, dans l'ordre du document. */
  remailles: string[];
}

/**
 * Maillage incrémental : seuls les objets invalidés depuis le document du cache sont remaillés, les autres morceaux
 * sont repris tels quels (même objet) ; reconstruction complète quand `projectionsAInvalider` l'exige. Le résultat est
 * identique à `studioMesh3d(doc)`.
 */
export function studioMesh3dIncremental(doc: StudioDocument, cache: StudioCacheMaillage | null): StudioMaillageIncremental {
  const invalidation = projectionsAInvalider(cache?.doc ?? null, doc);
  const morceaux = studioMaillerObjets(doc, invalidation.complet ? null : invalidation.ids);
  const suivant = studioFusionnerMorceaux(cache, doc, invalidation, morceaux);
  return { mesh: studioAssemblerMaillage(doc, suivant.morceaux), cache: suivant, invalidation, remailles: morceaux.map((m) => m.id) };
}
