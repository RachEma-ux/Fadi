/**
 * Sélection multiple de la planche 2D : bascule (Maj + clic), tout sélectionner, sélection par rectangle à la manière
 * des logiciels de DAO (de gauche à droite : fenêtre, l'objet entièrement dedans ; de droite à gauche : capture, l'objet
 * touché suffit) et commandes de déplacement d'une sélection. Seuls les objets et les cotes affichés et déverrouillés
 * se sélectionnent. Au-delà de `SEUIL_INDEX_SPATIAL` éléments, la sélection par rectangle n'examine que les éléments
 * dont l'emprise du tracé recoupe le rectangle (`index-spatial.ts`) : même résultat que le parcours linéaire (test de
 * propriété). Pur : ni React ni DOM.
 */
import {
  dessinerCoteAngulaire, empriseStructurelle, geometrieMur, studioArcPoints, type StudioStructuralElement, type StudioWall, type StudioLadder, geometrieEchelle, studioShapeSegments, studioTextBox, type StudioAnnotation, type StudioCommand, type StudioDimension, type StudioDocument,
  type StudioPoint, type StudioShape,
} from "@parcours/atelier-model";
import { estSelectionnable } from "./calques";
import { traceCote } from "./geometrie-2d";
import { indexGrille, SEUIL_INDEX_SPATIAL, suiviIncremental, type Boite2D, type IndexSpatial } from "./index-spatial";

export type Element2D = StudioShape | StudioDimension | StudioAnnotation;
export type ModeRectangle = "fenetre" | "capture";
export interface Rectangle2D { min: StudioPoint; max: StudioPoint }

/** L'élément est-il une forme (ligne, rectangle, cercle, arc, polyligne) plutôt qu'une cote ou une annotation ? */
export const estForme = (e: Element2D): e is StudioShape => e.type !== "dimension" && e.type !== "angular-dimension" && e.type !== "text";

/** Objets, cotes puis annotations du document, dans l'ordre d'affichage. */
export const elements = (doc: StudioDocument): Element2D[] => [...doc.objects, ...(doc.dimensions ?? []), ...(doc.annotations ?? [])];

/**
 * Murs (A.4) du document : ils se sélectionnent comme les objets (clic, rectangle, tout sélectionner) pour Déplacer,
 * Copier, Rotation, Symétrie, Échelle, Supprimer et Placer sur le calque ; leurs ouvertures les suivent (une ouverture se
 * désigne seule par un clic, pour être modifiée).
 */
export const murs = (doc: StudioDocument): StudioWall[] => (doc.architecture ?? []).filter((x): x is StudioWall => x.type === "wall");
/** Objets architecturaux posés librement (murs, échelles d’accès, EX-027, poteaux, poutres, dalles, lot W3-B) : ils se sélectionnent comme les objets. */
export type Porteur2D = StudioWall | StudioLadder | StudioStructuralElement;
export const porteurs = (doc: StudioDocument): Porteur2D[] => (doc.architecture ?? []).filter((x): x is Porteur2D => x.type !== "opening");

/** Identifiants sélectionnables (affichés, déverrouillés), dans l'ordre du document, murs compris. */
export const toutSelectionnable = (doc: StudioDocument): string[] =>
  [...elements(doc), ...porteurs(doc)].filter((e) => estSelectionnable(doc, e.layerId)).map((e) => e.id);

/** Sélection nettoyée : objets encore présents et sélectionnables, sans doublon, ordre conservé. */
export function selectionValide(doc: StudioDocument, ids: readonly string[]): string[] {
  const ok = new Set(toutSelectionnable(doc));
  return [...new Set(ids)].filter((id) => ok.has(id));
}

/** Maj + clic : ajoute l'objet absent, retire l'objet présent. */
export const basculer = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** Sens du tracé du rectangle : vers la droite = fenêtre, vers la gauche = capture. */
export const modeRectangle = (debut: StudioPoint, fin: StudioPoint): ModeRectangle => (fin.x >= debut.x ? "fenetre" : "capture");

export const rectangleEntre = (a: StudioPoint, b: StudioPoint): Rectangle2D =>
  ({ min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } });

type Segment = readonly [StudioPoint, StudioPoint];

/**
 * Segments dessinés d'un élément (traits de la ligne, côtés du rectangle, contour discrétisé d'un cercle, d'un arc ou
 * d'une polyligne, lignes d'une cote).
 */
export function segments(e: Element2D | Porteur2D): Segment[] {
  if (e.type === "column" || e.type === "beam" || e.type === "slab") {
    // Emprise de l'élément structurel (lot W3-B).
    const r = empriseStructurelle(e);
    return r.map((p, i) => [p, r[(i + 1) % r.length]!] as const);
  }
  if (e.type === "ladder") {
    // Emprise de l'échelle d'accès (montants compris).
    const r = geometrieEchelle(e).emprise;
    return r.map((p, i) => [p, r[(i + 1) % r.length]!] as const);
  }
  if (e.type === "wall") {
    // Contour de l'emprise du mur (onglets compris).
    const g = geometrieMur(e);
    const r = g.ok ? g.valeur.anneau : [];
    return r.map((p, i) => [p, r[(i + 1) % r.length]!] as const);
  }
  if (e.type === "text") {
    // Emprise approchée du texte (dérivée, jamais une donnée).
    const b = studioTextBox(e);
    return b.map((p, i) => [p, b[(i + 1) % b.length]!] as const);
  }
  if (e.type === "angular-dimension") {
    const g = dessinerCoteAngulaire(e, "fr-FR", 0);
    const arc = studioArcPoints(g.arc.center, g.arc.radius, g.arc.startAngle, g.sweep);
    return [...arc.slice(1).map((p, i) => [arc[i]!, p] as const), ...g.extensions];
  }
  if (e.type !== "dimension") return studioShapeSegments(e);
  const g = traceCote(e);
  return [[e.start, g.a], [e.end, g.b], [g.a, g.b]];
}

const dedans = (r: Rectangle2D, p: StudioPoint) => p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;

/** Le segment touche-t-il le rectangle (extrémité dedans ou intersection d'un bord) ? Découpage de Liang-Barsky. */
export function segmentTouche(r: Rectangle2D, [a, b]: Segment): boolean {
  if (dedans(r, a) || dedans(r, b)) return true;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - r.min.x], [dx, r.max.x - a.x], [-dy, a.y - r.min.y], [dy, r.max.y - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

/** L'élément est-il retenu par le rectangle selon le mode (fenêtre : entièrement dedans ; capture : touché) ? */
export function retenu(e: Element2D | Porteur2D, r: Rectangle2D, mode: ModeRectangle): boolean {
  const s = segments(e);
  return mode === "fenetre" ? s.every(([a, b]) => dedans(r, a) && dedans(r, b)) : s.some((x) => segmentTouche(r, x));
}

/** Sélection par rectangle, parcours linéaire de tous les éléments (référence de l'index, et règle sous le seuil). */
export function selectionParRectangleLineaire(doc: StudioDocument, a: StudioPoint, b: StudioPoint): string[] {
  const r = rectangleEntre(a, b), mode = modeRectangle(a, b);
  return [...elements(doc), ...porteurs(doc)].filter((e) => estSelectionnable(doc, e.layerId) && retenu(e, r, mode)).map((e) => e.id);
}

/** Tracé mémorisé d'un élément (objet immuable du document) et son emprise ; emprise infinie s'il n'a aucun segment. */
interface Trace { e: Element2D | Porteur2D; segments: Segment[]; boite: Boite2D }
const TRACES = new WeakMap<Element2D | Porteur2D, Trace>();
function trace(e: Element2D | Porteur2D): Trace {
  let t = TRACES.get(e);
  if (!t) {
    const s = segments(e);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [p, q] of s) for (const v of [p, q]) { if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; }
    // Sans segment (jamais pour un document valide), l'élément reste toujours examiné : il n'est jamais écarté par l'index.
    const boite = s.length ? { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } } : { min: { x: -Infinity, y: -Infinity }, max: { x: Infinity, y: Infinity } };
    t = { e, segments: s, boite };
    TRACES.set(e, t);
  }
  return t;
}
/**
 * Index de sélection (C.1-05) : un index **incrémental** suit le document de révision en révision — seuls les éléments
 * ajoutés, retirés ou modifiés (nouvel objet immuable) y sont insérés ou retirés, sans reconstruction. Le dernier
 * document indexé est retenu : une requête sur le même document ne resynchronise rien ; un autre document (révision
 * suivante, ou une autre étude) est synchronisé avant la requête. Le résultat reste celui du parcours linéaire (test de
 * propriétés sur suites de mutations).
 */
const SUIVI_SELECTION = suiviIncremental<Trace>((t) => t.boite);
let documentIndexe: { doc: StudioDocument; index: IndexSpatial<Trace> } | null = null;
function indexSelection(doc: StudioDocument): IndexSpatial<Trace> {
  if (documentIndexe?.doc === doc) return documentIndexe.index;
  const traces = [...elements(doc), ...porteurs(doc)].map(trace);
  const index = SUIVI_SELECTION.suivre(traces) ?? indexGrille(traces, (t) => t.boite);
  documentIndexe = { doc, index };
  return index;
}
/** Bilan de la dernière synchronisation de l'index de sélection (recette, mesure). */
export const bilanIndexSelection = () => SUIVI_SELECTION.dernierBilan;

/**
 * Sélection par rectangle : éléments sélectionnables retenus, dans l'ordre du document. Au-dessus du seuil, seuls les
 * éléments dont l'emprise recoupe le rectangle (élargi d'une marge de l'ordre de l'arrondi flottant : l'index ne peut
 * qu'examiner trop, jamais écarter à tort) passent le contrôle exact.
 */
export function selectionParRectangle(doc: StudioDocument, a: StudioPoint, b: StudioPoint, seuil = SEUIL_INDEX_SPATIAL): string[] {
  const n = doc.objects.length + (doc.dimensions?.length ?? 0) + (doc.annotations?.length ?? 0) + (doc.architecture?.length ?? 0);
  if (n < seuil) return selectionParRectangleLineaire(doc, a, b);
  const index = indexSelection(doc);
  const r = rectangleEntre(a, b), mode = modeRectangle(a, b);
  const m = 1e-9 * (1 + Math.max(Math.abs(r.min.x), Math.abs(r.min.y), Math.abs(r.max.x), Math.abs(r.max.y)));
  const zone = { min: { x: r.min.x - m, y: r.min.y - m }, max: { x: r.max.x + m, y: r.max.y + m } };
  return index.chercher(zone)
    .filter(({ e, segments: s }) => estSelectionnable(doc, e.layerId)
      && (mode === "fenetre" ? s.every(([p, q]) => dedans(r, p) && dedans(r, q)) : s.some((x) => segmentTouche(r, x))))
    .map((t) => t.e.id);
}

// ——— Désignation au point et cas ambigus (AC-004) ———

const distanceSegment = (p: StudioPoint, [a, b]: Segment): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * Désignation au point (AC-004) : éléments sélectionnables dont le tracé passe à `tolerance` du point, les plus proches
 * d'abord ; à distance égale (1e-12 m), le dernier dessiné (au-dessus) d'abord. `ambigus` : les candidats à égalité
 * avec le premier — plusieurs cibles possibles (objets superposés, contour commun) ; vide si le premier est seul. Le
 * premier est celui que désigne le clic ; la commande « Cible d'accrochage suivante » passe **explicitement** au suivant.
 */
export interface TraceDesignation {
  point: StudioPoint;
  tolerance: number;
  candidats: { id: string; distance: number }[];
  ambigus: string[];
}

function classerDesignation(point: StudioPoint, tolerance: number, traces: readonly { t: Trace; rang: number }[]): TraceDesignation {
  const candidats = traces
    .map(({ t, rang }) => ({ id: t.e.id, rang, distance: Math.min(...t.segments.map((s) => distanceSegment(point, s))) }))
    .filter((c) => c.distance <= tolerance)
    .sort((a, b) => (Math.abs(a.distance - b.distance) > 1e-12 ? a.distance - b.distance : b.rang - a.rang))
    .map(({ id, distance }) => ({ id, distance }));
  const tete = candidats[0];
  const egaux = tete ? candidats.filter((c) => Math.abs(c.distance - tete.distance) <= 1e-12).map((c) => c.id) : [];
  return { point: { ...point }, tolerance, candidats, ambigus: egaux.length > 1 ? egaux : [] };
}

/** Désignation au point par parcours linéaire (référence de l'index). */
export function designationAuPointLineaire(doc: StudioDocument, point: StudioPoint, tolerance: number): TraceDesignation {
  const tous = [...elements(doc), ...porteurs(doc)];
  return classerDesignation(point, tolerance, tous.map((e, rang) => ({ e, rang })).filter(({ e }) => estSelectionnable(doc, e.layerId)).map(({ e, rang }) => ({ t: trace(e), rang })));
}

/** Désignation au point : au-dessus du seuil, l'index de sélection borne l'examen ; même résultat que la référence. */
export function designationAuPoint(doc: StudioDocument, point: StudioPoint, tolerance: number, seuil = SEUIL_INDEX_SPATIAL): TraceDesignation {
  const n = doc.objects.length + (doc.dimensions?.length ?? 0) + (doc.annotations?.length ?? 0) + (doc.architecture?.length ?? 0);
  if (n < seuil) return designationAuPointLineaire(doc, point, tolerance);
  const rangs = new Map([...elements(doc), ...porteurs(doc)].map((e, i) => [e, i]));
  const m = tolerance + 1e-9 * (1 + Math.abs(point.x) + Math.abs(point.y));
  const zone = { min: { x: point.x - m, y: point.y - m }, max: { x: point.x + m, y: point.y + m } };
  return classerDesignation(point, tolerance, indexSelection(doc).chercher(zone).filter(({ e }) => estSelectionnable(doc, e.layerId)).map((t) => ({ t, rang: rangs.get(t.e)! })));
}

/** Candidat suivant d'un cas ambigu (cycle), à partir de l'identifiant désigné ; null si la désignation n'est pas ambiguë. */
export function designationSuivante(t: TraceDesignation, actuel: string | undefined): string | null {
  if (t.ambigus.length < 2) return null;
  const i = actuel === undefined ? -1 : t.ambigus.indexOf(actuel);
  return t.ambigus[(i + 1) % t.ambigus.length]!;
}

/** Union ordonnée (Maj + rectangle : ajoute à la sélection). */
export const ajouter = (ids: readonly string[], autres: readonly string[]): string[] => [...new Set([...ids, ...autres])];

export interface Deplacement {
  /** Une commande `studio.dessin.deplacer` par objet déplacé, dans l'ordre de la sélection. */
  commandes: StudioCommand[];
  /** Cotes liées laissées de côté : elles suivent leurs objets, le modèle refuse de les déplacer seules. */
  cotesLiees: string[];
}

/**
 * Commandes de déplacement d'une sélection de `dx`, `dy` (mètres). Les éléments non sélectionnables (calque masqué
 * ou verrouillé) ne sont jamais déplacés ; un déplacement nul ne produit aucune commande.
 */
export function commandesDeplacement(doc: StudioDocument, ids: readonly string[], dx: number, dy: number): Deplacement {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return { commandes: [], cotesLiees: [] };
  const commandes: StudioCommand[] = [], cotesLiees: string[] = [];
  const parId = new Map<string, Element2D | Porteur2D>([...elements(doc), ...porteurs(doc)].map((e) => [e.id, e]));
  for (const id of selectionValide(doc, ids)) {
    const e = parId.get(id)!;
    if (e.type === "dimension" && (e.links.start || e.links.end)) { cotesLiees.push(id); continue; }
    if (e.type === "angular-dimension" && (e.links.first || e.links.second)) { cotesLiees.push(id); continue; }
    commandes.push({ toolId: "studio.dessin.deplacer", params: { id, dx, dy } });
  }
  return { commandes, cotesLiees };
}
