/**
 * Moteur d'inférence (accrochages) pur de la Planche, d'après les relevés SketchUp pour le Web
 * (docs/planche/reference/outils-dessin.md §4 et §15.3, complements-modification.md §7, doc-officielle.md §7).
 *
 * Entrée : un rayon (caméra → curseur) ou un point candidat en 3D, une tolérance d'accrochage EN MÈTRES
 * fournie par l'appelant (il convertit ses pixels à la profondeur voulue), la géométrie visible, le point de
 * départ éventuel du tracé, les axes du modèle, un verrou éventuel et le mode Alt.
 *
 * ORDRE DE PRIORITÉ (documenté, testé) :
 *  1. points : extrémité > milieu > intersection > centre > origine (à rang égal : le plus proche) ;
 *  2. arêtes : sur l'arête (point le plus proche de l'arête la plus proche) ;
 *  3. inférences linéaires depuis le départ : axes rouge/vert/bleu, parallèle/perpendiculaire à l'arête de
 *     référence, tangente ; puis « From Point » (axes passant par un point de référence) — la plus proche gagne ;
 *  4. face : sur la face touchée par le rayon (ou contenant le point) ;
 *  5. aucune : point brut (rayon ∩ face, sinon ∩ plan du sol des axes).
 *
 * Verrous : flèches (axe X/Y/Z, ou ↓ = direction parallèle/perpendiculaire), Maj (inférence courante
 * verrouillée : sa ligne, ou la direction départ → point, ou le plan de la face), plan verrouillé.
 * Sous verrou de ligne, le point est la projection sur la ligne (d'un point accroché s'il y en a un) et
 * l'infobulle devient « Constrained on Line » ; sous verrou de plan, « Constrained on Plane ».
 *
 * Mode Alt (relevé : cycle au relâchement) : tout actif → tout coupé → parallèle/perpendiculaire seulement.
 * « Tout coupé » supprime les inférences linéaires ; les accrochages de points, d'arêtes et de faces restent.
 */
import {
  type Contexte,
  type Id,
  type Matrice4,
  type Modele,
  type Occurrence,
  IDENTITE,
  appliquer,
  baseDuPlan,
  composer,
  transformerNormale,
} from "./geometrie-libre.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, EPS, ORIGINE, TOL, add, cross, dist, dot, len, lerp, normalize, scale, sub } from "./vecteur.js";

export type TypeInference =
  | "extremite"
  | "milieu"
  | "sur-arete"
  | "sur-face"
  | "origine"
  | "intersection"
  | "centre"
  | "axe-x"
  | "axe-y"
  | "axe-z"
  | "parallele"
  | "perpendiculaire"
  | "perpendiculaire-face"
  | "prolonger"
  | "tangente"
  /** (Cas 2, lot 2) Quadrant d'un cercle ou d'un arc, dans le repère de travail. */
  | "quadrant"
  /** (Cas 2, lot 2) Point d'un guide (Mètre, Rapporteur). */
  | "point-guide"
  /** (Cas 2, lot 2) Sur une ligne ou un segment de guide. */
  | "sur-guide"
  /** (Cas 2, lot 2) Intersection apparente de deux arêtes non sécantes, vue en plan ou en façade. */
  | "intersection-apparente"
  /** (Cas 2, lot 2) Axe médian entre deux arêtes parallèles (axe d'un mur dessiné par ses deux nus). */
  | "axe-median"
  /** (Cas 2, lot 2) Croisement de deux alignements, ou d'un alignement et d'une arête, sans ligne de construction. */
  | "croisement"
  | "aucune";

export interface Libelle {
  /** Infobulle d'origine (SketchUp, anglais). */
  readonly en: string;
  readonly fr: string;
}

/** Couleurs d'affichage relevées (outils-dessin §15.3, doc-officielle §7.2). */
export const COULEURS: Readonly<Record<TypeInference, string>> = {
  extremite: "#00a000", // point vert
  milieu: "#00c0c0", // point cyan
  "sur-arete": "#e00000", // carré rouge
  "sur-face": "#2040c0", // losange bleu foncé
  origine: "#000000", // cercle noir
  intersection: "#e00000", // X rouge (doc officielle)
  centre: "#2040c0", // point bleu au centre de l'arc (complements §8)
  "axe-x": "#e00000",
  "axe-y": "#00a000",
  "axe-z": "#0000e0",
  parallele: "#ff00ff", // magenta
  perpendiculaire: "#ff00ff",
  "perpendiculaire-face": "#ff00ff", // magenta (doc officielle : « Perpendicular to Face »)
  prolonger: "#ff00ff", // magenta (« Extend Edge »)
  tangente: "#00c0c0", // « Tangent at Vertex » cyan
  quadrant: "#2040c0",
  "point-guide": "#00a000",
  "sur-guide": "#00a000",
  "intersection-apparente": "#ff00ff",
  "axe-median": "#2040c0",
  croisement: "#e00000",
  aucune: "#000000", // segment élastique noir hors inférence
};

/** Inférences dans un groupe/composant : magenta (doc-officielle §7.2, source [S7], non observé). */
export const COULEUR_DANS_OBJET = "#ff00ff";

export const LIBELLES: Readonly<Record<TypeInference, Libelle>> = {
  extremite: { en: "Endpoint", fr: "Extrémité" },
  milieu: { en: "Midpoint", fr: "Milieu" },
  "sur-arete": { en: "On Edge", fr: "Sur l'arête" },
  "sur-face": { en: "On Face", fr: "Sur la face" },
  origine: { en: "Origin", fr: "Origine" },
  intersection: { en: "Intersection", fr: "Intersection" },
  centre: { en: "Center", fr: "Centre" },
  "axe-x": { en: "On Red Axis", fr: "Sur l'axe rouge" },
  "axe-y": { en: "On Green Axis", fr: "Sur l'axe vert" },
  "axe-z": { en: "On Blue Axis", fr: "Sur l'axe bleu" },
  parallele: { en: "Parallel to Edge", fr: "Parallèle à l'arête" },
  perpendiculaire: { en: "Perpendicular to Edge", fr: "Perpendiculaire à l'arête" },
  "perpendiculaire-face": { en: "Perpendicular to Face", fr: "Perpendiculaire à la face" },
  prolonger: { en: "Extend Edge", fr: "Prolonger l'arête" },
  tangente: { en: "Tangent at Vertex", fr: "Tangente au sommet" },
  quadrant: { en: "Quadrant", fr: "Quadrant" },
  "point-guide": { en: "Guide Point", fr: "Point de guide" },
  "sur-guide": { en: "On Guide", fr: "Sur le guide" },
  "intersection-apparente": { en: "Apparent Intersection", fr: "Intersection apparente" },
  "axe-median": { en: "Midline", fr: "Axe entre deux nus" },
  croisement: { en: "Crossing", fr: "Croisement des alignements" },
  aucune: { en: "", fr: "" },
};

export const LIBELLE_DEPUIS_POINT: Libelle = { en: "From Point", fr: "Depuis le point" };
export const LIBELLE_LIGNE_CONTRAINTE: Libelle = { en: "Constrained on Line", fr: "Contraint sur la ligne" };
export const LIBELLE_PLAN_CONTRAINT: Libelle = { en: "Constrained on Plane", fr: "Contraint sur le plan" };

/** Rang des inférences ponctuelles (plus petit = prioritaire). */
export const RANG_POINTS: readonly TypeInference[] = ["extremite", "milieu", "intersection", "point-guide", "intersection-apparente", "quadrant", "centre", "origine"];

/**
 * (Cas 2, lot 2) Genres d'accrochage du panneau « Accrochage » : chacun peut être coupé, et un seul peut être forcé pour le
 * prochain point (`force`). « sommet » = extrémité ; « intersection » couvre aussi les intersections de guides, les
 * croisements d'alignements et les intersections apparentes ; « guide » = points et lignes de guide.
 */
export type GenreAccrochage = "sommet" | "milieu" | "intersection" | "quadrant" | "axe" | "guide" | "section" | "apparente" | "croisement";
export const GENRES_FORCABLES: readonly GenreAccrochage[] = ["sommet", "milieu", "intersection", "quadrant", "axe", "guide"];
const TYPES_DU_GENRE: Readonly<Record<GenreAccrochage, readonly TypeInference[]>> = {
  sommet: ["extremite"],
  milieu: ["milieu"],
  intersection: ["intersection", "intersection-apparente", "croisement"],
  quadrant: ["quadrant"],
  axe: ["axe-median"],
  guide: ["point-guide", "sur-guide"],
  section: [],
  apparente: ["intersection-apparente"],
  croisement: ["croisement"],
};

/** (Cas 2, lot 2) Réglages d'accrochage tenus par l'interface (jamais écrits dans le modèle). */
export interface OptionsAccrochage {
  /** Un seul genre pour le prochain point : les autres accrochages sont ignorés. */
  readonly force?: GenreAccrochage;
  /** Genres coupés. */
  readonly coupes?: readonly GenreAccrochage[];
  /** Distance (m) sous laquelle un point non accroché est signalé « presque » sur un sommet ou une arête. */
  readonly presque?: number;
  /** Pas de longueur (m, Info modèle) appliqué depuis le point de départ quand le point n'est accroché à rien. */
  readonly pasLongueur?: number | null;
  /** Écart maximal (m) entre deux arêtes parallèles pour proposer leur axe médian. Défaut 0,60 m. */
  readonly ecartAxeMax?: number;
}

/** Guide accrochable (annotation `Guide` du modèle, coordonnées monde). */
export type GuideAccrochable =
  | { readonly id: Id; readonly genre: "ligne"; readonly origine: Vec3; readonly direction: Vec3 }
  | { readonly id: Id; readonly genre: "segment"; readonly origine: Vec3; readonly fin: Vec3 }
  | { readonly id: Id; readonly genre: "point"; readonly origine: Vec3 };

/** Signalement « presque accroché » : le point n'a pas bougé, il tombe presque sur un sommet, une arête ou un angle droit. */
export interface Presque {
  readonly genre: "sommet" | "arete" | "angle-droit";
  readonly point: Vec3;
  /** Écart en mètres (sommet, arête) ou en degrés (angle droit). */
  readonly ecart: number;
}

export interface AreteVisible {
  /** Arête adoucie (Adoucir / lisser, lot 5) : non tracée par la vue. */
  readonly adoucie?: boolean;
  readonly id: Id;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly dansObjet?: boolean;
  /** Hors du contexte d'édition ouvert (Objets O-2) : affichée délavée. */
  readonly horsContexte?: boolean;
  /** (Cas 2, lot 2) Objet ou balise exclu de l'accrochage : affichée, jamais accrochée. */
  readonly horsAccrochage?: boolean;
  /** (Cas 2, lot 2) Arête de section du plan de coupe actif (calculée, n'existe pas dans le modèle). */
  readonly section?: boolean;
  /** (Cas 2, lot 4) Balise de l'arête, sinon de l'objet le plus proche qui en porte une (épaisseur et trait des sorties). */
  readonly balise?: Id;
  /** (Cas 2, lot 4) Portée par une balise verrouillée : affichée, ni sélectionnable ni modifiable. */
  readonly verrouillee?: boolean;
}

export interface FaceVisible {
  readonly id: Id;
  readonly exterieur: readonly Vec3[];
  readonly trous: readonly (readonly Vec3[])[];
  readonly normale: Vec3;
  readonly dansObjet?: boolean;
  /** Matière affichée : celle de la face, sinon celle de l'objet le plus proche qui en porte une (lot 5). */
  readonly materiau?: Id;
  /** Balise de la face, sinon de l'objet le plus proche qui en porte une (couleur par balise, lot 5). */
  readonly balise?: Id;
  /** Hors du contexte d'édition ouvert (Objets O-2) : affichée délavée. */
  readonly horsContexte?: boolean;
  readonly horsAccrochage?: boolean;
  /** (Cas 2, lot 4) Portée par une balise verrouillée. */
  readonly verrouillee?: boolean;
}

export interface CentreVisible {
  readonly id: Id;
  readonly position: Vec3;
  readonly dansObjet?: boolean;
  readonly horsAccrochage?: boolean;
  /** (Cas 2, lot 2) Rayon et normale monde du cercle ou de l'arc (quadrants). */
  readonly rayon?: number;
  readonly normale?: Vec3;
  /** (Cas 2, lot 2) Segments monde de la courbe : un quadrant hors du balayage d'un arc n'est pas proposé. */
  readonly troncons?: readonly (readonly [Vec3, Vec3])[];
}

export interface GeometrieVisible {
  readonly aretes: readonly AreteVisible[];
  readonly faces: readonly FaceVisible[];
  readonly centres: readonly CentreVisible[];
}

export interface AxesModele {
  readonly origine: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

export const AXES_MODELE: AxesModele = { origine: ORIGINE, x: AXE_X, y: AXE_Y, z: AXE_Z };

export type ModeAlt = "tout" | "aucune" | "parallele-perpendiculaire";

/** Cycle Alt observé : (All On) → (All Off) → (Parallel/Perpendicular Only) → (All On). */
export function modeAltSuivant(m: ModeAlt): ModeAlt {
  return m === "tout" ? "aucune" : m === "aucune" ? "parallele-perpendiculaire" : "tout";
}

export const LIBELLES_MODE_ALT: Readonly<Record<ModeAlt, Libelle>> = {
  tout: { en: "All On", fr: "Toutes actives" },
  aucune: { en: "All Off", fr: "Toutes coupées" },
  "parallele-perpendiculaire": { en: "Parallel/Perpendicular Only", fr: "Parallèle/perpendiculaire seulement" },
};

export type Verrou =
  /** Flèches → ← ↑ : axe rouge, vert, bleu. */
  | { readonly genre: "axe"; readonly axe: "x" | "y" | "z" }
  /** Flèche ↓ : parallèle/perpendiculaire à la dernière arête survolée (direction fournie). */
  | { readonly genre: "direction"; readonly direction: Vec3; readonly type?: "parallele" | "perpendiculaire" }
  /** Maj maintenue : inférence courante verrouillée. */
  | { readonly genre: "inference"; readonly inference: Inference }
  /** Plan verrouillé (flèche avant le 1er clic des formes, Maj sur une face). */
  | { readonly genre: "plan"; readonly origine: Vec3; readonly normale: Vec3 };

export interface EntreeInference {
  readonly rayon?: { readonly origine: Vec3; readonly direction: Vec3 };
  readonly point?: Vec3;
  /** Tolérance d'accrochage en mètres. */
  readonly tolerance: number;
  readonly geometrie: GeometrieVisible;
  readonly depart?: Vec3;
  readonly axes?: AxesModele;
  readonly verrou?: Verrou;
  readonly modeAlt?: ModeAlt;
  /** Dernière arête survolée (référence de parallèle/perpendiculaire). */
  readonly areteReference?: { readonly a: Vec3; readonly b: Vec3; readonly normalePlan?: Vec3 };
  /** Tangente au départ (arc partant de l'extrémité d'une courbe). */
  readonly tangenteDepart?: Vec3;
  /** Points marqués (survol prolongé) pour l'inférence « From Point ». */
  readonly pointsReference?: readonly Vec3[];
  /**
   * (Chantier Axes, AX-1) Plan du point brut hors face : le plan de travail (origine, normale). Absent = plan XY des
   * axes (sol du repère de saisie).
   */
  readonly sol?: { readonly origine: Vec3; readonly normale: Vec3 };
  /** (Cas 2, lot 2) Guides du modèle : leurs points, leurs lignes et leurs intersections sont accrochables. */
  readonly guides?: readonly GuideAccrochable[];
  /** (Cas 2, lot 2) Plan de coupe actif : les arêtes de section sur les faces visibles sont accrochables. */
  readonly coupe?: { readonly origine: Vec3; readonly normale: Vec3 };
  /** (Cas 2, lot 2) Réglages d'accrochage du panneau « Accrochage ». */
  readonly accrochage?: OptionsAccrochage;
}

export interface Inference {
  readonly point: Vec3;
  readonly type: TypeInference;
  readonly couleur: string;
  readonly libelle: Libelle;
  readonly verrouillee: boolean;
  readonly entite?: Id;
  /**
   * (Revue de #129) Normale monde de la face **visée** (occurrence exacte). Une copie partagée d'un composant tournée
   * ou symétrisée n'a pas la normale de la première occurrence : on la prend ici, sans la rechercher par identifiant.
   */
  readonly normale?: Vec3;
  /** Direction de la ligne d'inférence (inférences linéaires). */
  readonly direction?: Vec3;
  /** Origine de la ligne pointillée (départ ou point de référence). */
  readonly origineLigne?: Vec3;
  /** Ligne : le segment en cours a la même longueur que l'arête de référence (point ajusté à cette longueur). */
  readonly memeLongueur?: boolean;
  /** (Cas 2, lot 2) Le point n'est accroché à rien mais tombe presque sur un sommet, une arête ou un angle droit. */
  readonly presque?: Presque;
  /** (Cas 2, lot 2) Le pas de longueur d'Info modèle a ajusté le point. */
  readonly pasApplique?: boolean;
}

// ————————————————————————————————————————————————————————————— Outils

interface Curseur {
  /** Écart (m) entre un point et le curseur (rayon ou point). */
  ecart(x: Vec3): number;
  /** Point de la droite (o, d) le plus proche du curseur. */
  surDroite(o: Vec3, d: Vec3): Vec3;
  /** Point du segment [a, b] le plus proche du curseur. */
  surSegment(a: Vec3, b: Vec3): Vec3;
}

function curseur(e: EntreeInference): Curseur {
  const r = e.rayon;
  if (r) {
    const P = r.origine;
    const V = normalize(r.direction);
    const ecart = (x: Vec3): number => {
      const u = Math.max(0, dot(sub(x, P), V));
      return dist(x, add(P, scale(V, u)));
    };
    const surDroite = (o: Vec3, d0: Vec3): Vec3 => {
      const d = normalize(d0);
      const w = sub(o, P);
      const b = dot(d, V);
      const den = 1 - b * b;
      if (den < 1e-12) return o;
      const s = (b * dot(w, V) - dot(w, d)) / den;
      return add(o, scale(d, s));
    };
    const surSegment = (a: Vec3, b: Vec3): Vec3 => {
      const l = dist(a, b);
      if (l < EPS) return a;
      const x = surDroite(a, sub(b, a));
      const t = Math.min(1, Math.max(0, dot(sub(x, a), sub(b, a)) / (l * l)));
      return lerp(a, b, t);
    };
    return { ecart, surDroite, surSegment };
  }
  const p = e.point ?? ORIGINE;
  return {
    ecart: (x) => dist(x, p),
    surDroite: (o, d0) => {
      const d = normalize(d0);
      return add(o, scale(d, dot(sub(p, o), d)));
    },
    surSegment: (a, b) => {
      const ab = sub(b, a);
      const l2 = dot(ab, ab);
      return l2 < EPS ? a : lerp(a, b, Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)));
    },
  };
}

function dansPolygone(x: number, y: number, poly: readonly { x: number; y: number }[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as { x: number; y: number };
    const b = poly[j] as { x: number; y: number };
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

function contientPoint(f: FaceVisible, p: Vec3): boolean {
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (q: Vec3) => ({ x: dot(q, u), y: dot(q, w) });
  const c = p2(p);
  return dansPolygone(c.x, c.y, f.exterieur.map(p2)) && !f.trous.some((t) => dansPolygone(c.x, c.y, t.map(p2)));
}

/** Face la plus proche touchée par le rayon (ou contenant le point à TOL près). */
function faceTouchee(e: EntreeInference): { face: FaceVisible; point: Vec3 } | undefined {
  let meilleur: { face: FaceVisible; point: Vec3; t: number } | undefined;
  for (const f of e.geometrie.faces) {
    const p0 = f.exterieur[0];
    if (!p0) continue;
    const n = normalize(f.normale);
    if (e.rayon) {
      const V = normalize(e.rayon.direction);
      const den = dot(n, V);
      if (Math.abs(den) < EPS) continue;
      const t = dot(n, sub(p0, e.rayon.origine)) / den;
      if (t <= 0) continue;
      const x = add(e.rayon.origine, scale(V, t));
      if (contientPoint(f, x) && (!meilleur || t < meilleur.t)) meilleur = { face: f, point: x, t };
    } else if (e.point) {
      const d = dot(n, sub(e.point, p0));
      if (Math.abs(d) > Math.max(TOL, e.tolerance)) continue;
      const x = sub(e.point, scale(n, d));
      if (contientPoint(f, x) && (!meilleur || Math.abs(d) < meilleur.t)) meilleur = { face: f, point: x, t: Math.abs(d) };
    }
  }
  return meilleur;
}

/** Point brut : face touchée, sinon plan du sol des axes, sinon point du rayon le plus proche du départ. */
function pointBrut(e: EntreeInference, axes: AxesModele): Vec3 {
  if (e.point) return e.point;
  const r = e.rayon;
  if (!r) return ORIGINE;
  const f = faceTouchee(e);
  if (f) return f.point;
  const V = normalize(r.direction);
  const n = normalize(e.sol?.normale ?? axes.z);
  const den = dot(n, V);
  if (Math.abs(den) > EPS) {
    const t = dot(n, sub(e.sol?.origine ?? axes.origine, r.origine)) / den;
    if (t > 0) return add(r.origine, scale(V, t));
  }
  if (e.depart) return add(r.origine, scale(V, Math.max(0, dot(sub(e.depart, r.origine), V))));
  return r.origine;
}

function construire(
  type: TypeInference,
  point: Vec3,
  options: { entite?: Id; normale?: Vec3; dansObjet?: boolean; direction?: Vec3; origineLigne?: Vec3; libelle?: Libelle; verrouillee?: boolean; couleur?: string } = {},
): Inference {
  return {
    point,
    type,
    couleur: options.couleur ?? (options.dansObjet ? COULEUR_DANS_OBJET : COULEURS[type]),
    libelle: options.libelle ?? LIBELLES[type],
    verrouillee: options.verrouillee ?? false,
    ...(options.entite !== undefined ? { entite: options.entite } : {}),
    ...(options.normale !== undefined ? { normale: options.normale } : {}),
    ...(options.direction !== undefined ? { direction: options.direction } : {}),
    ...(options.origineLigne !== undefined ? { origineLigne: options.origineLigne } : {}),
  };
}

interface CandidatPoint {
  readonly type: TypeInference;
  readonly point: Vec3;
  readonly entite?: Id;
  readonly dansObjet?: boolean;
}

function candidatsPoints(e: EntreeInference, axes: AxesModele, c: Curseur): CandidatPoint[] {
  const tol = e.tolerance;
  const r: CandidatPoint[] = [];
  const opt = (x: { id: Id; dansObjet?: boolean }) => ({ entite: x.id, ...(x.dansObjet ? { dansObjet: true } : {}) });
  for (const a of e.geometrie.aretes) {
    r.push({ type: "extremite", point: a.a, ...opt(a) }, { type: "extremite", point: a.b, ...opt(a) });
    r.push({ type: "milieu", point: lerp(a.a, a.b, 0.5), ...opt(a) });
  }
  for (const k of e.geometrie.centres) r.push({ type: "centre", point: k.position, ...opt(k) });
  r.push({ type: "origine", point: axes.origine });
  // (Cas 2, lot 2) Quadrants des cercles et des arcs, dans le repère de travail.
  // Les accrochages du lot 2 ne s'ajoutent qu'avec les réglages d'accrochage de l'interface (`e.accrochage`).
  const l2 = !!e.accrochage;
  if (l2) for (const k of e.geometrie.centres) for (const q of quadrants(k, axes)) r.push({ type: "quadrant", point: q, ...opt(k) });
  // (Cas 2, lot 2) Guides : points, et intersections guide × guide et guide × arête proches du curseur.
  const guides = l2 ? (e.guides ?? []) : [];
  for (const g of guides) if (g.genre === "point") r.push({ type: "point-guide", point: g.origine, entite: g.id });
  else if (g.genre === "segment") r.push({ type: "point-guide", point: g.origine, entite: g.id }, { type: "point-guide", point: g.fin, entite: g.id });
  const droites = guides.filter((g) => g.genre !== "point" && c.ecart(pointSurGuide(g, c)) <= tol);
  for (let i = 0; i < droites.length; i++) {
    const A = droites[i] as GuideAccrochable;
    for (let j = i + 1; j < droites.length; j++) {
      const x = intersectionGuides(A, droites[j] as GuideAccrochable);
      if (x) r.push({ type: "intersection", point: x, entite: A.id });
    }
    for (const a of e.geometrie.aretes) {
      const x = intersectionGuideSegment(A, a.a, a.b);
      if (x) r.push({ type: "intersection", point: x, entite: A.id });
    }
  }
  // Intersections d'arêtes proches du curseur (hors extrémités).
  const proches = e.geometrie.aretes.filter((a) => c.ecart(c.surSegment(a.a, a.b)) <= tol);
  for (let i = 0; i < proches.length; i++) {
    for (let j = i + 1; j < proches.length; j++) {
      const A = proches[i] as AreteVisible;
      const B = proches[j] as AreteVisible;
      const x = intersectionSegments(A.a, A.b, B.a, B.b);
      if (x) r.push({ type: "intersection", point: x, entite: A.id });
      // (Cas 2, lot 2) Intersection apparente : les deux arêtes ne se coupent pas, mais se croisent vues depuis la caméra.
      else if (l2 && e.rayon) {
        const y = intersectionApparente(A, B, normalize(e.rayon.direction));
        if (y) r.push({ type: "intersection-apparente", point: y, entite: A.id });
      }
    }
  }
  return r.filter((x) => c.ecart(x.point) <= tol && permis(e, x.type));
}

/** (Cas 2, lot 2) Un type d'inférence est-il permis par le genre forcé et les genres coupés ? */
function permis(e: EntreeInference, type: TypeInference): boolean {
  const a = e.accrochage;
  if (!a) return true;
  if (a.force) return TYPES_DU_GENRE[a.force].includes(type);
  return !(a.coupes ?? []).some((g) => TYPES_DU_GENRE[g].includes(type));
}

/** Quadrants d'un cercle : centre ± rayon le long des axes de travail projetés sur son plan. */
function quadrants(k: CentreVisible, axes: AxesModele): Vec3[] {
  if (!k.rayon || !k.normale || k.rayon < EPS) return [];
  const n = normalize(k.normale);
  let u = sub(axes.x, scale(n, dot(axes.x, n)));
  if (len(u) < 1e-6) u = sub(axes.y, scale(n, dot(axes.y, n)));
  u = normalize(u);
  const w = normalize(cross(n, u));
  const tous = [add(k.position, scale(u, k.rayon)), add(k.position, scale(w, k.rayon)), sub(k.position, scale(u, k.rayon)), sub(k.position, scale(w, k.rayon))];
  if (!k.troncons || k.troncons.length === 0) return tous;
  // Un quadrant n'est gardé que s'il tombe dans le balayage d'un des segments de la courbe (arc ouvert).
  const dans = (q: Vec3): boolean => {
    const dq = sub(q, k.position);
    return k.troncons!.some(([a, b]) => {
      const da = sub(a, k.position);
      const db = sub(b, k.position);
      const sens = dot(cross(da, db), n);
      if (Math.abs(sens) < EPS) return dist(normalize(da), normalize(dq)) < 1e-6 || dist(normalize(db), normalize(dq)) < 1e-6;
      return dot(cross(da, dq), n) * sens >= -1e-9 && dot(cross(dq, db), n) * sens >= -1e-9 && dot(dq, add(da, db)) > 0;
    });
  };
  return tous.filter(dans);
}

function droiteDuGuide(g: GuideAccrochable): { o: Vec3; d: Vec3; borne: number | null } {
  if (g.genre === "ligne") return { o: g.origine, d: normalize(g.direction), borne: null };
  if (g.genre === "segment") return { o: g.origine, d: normalize(sub(g.fin, g.origine)), borne: dist(g.origine, g.fin) };
  return { o: g.origine, d: AXE_X, borne: 0 };
}

function pointSurGuide(g: GuideAccrochable, c: Curseur): Vec3 {
  if (g.genre === "segment") return c.surSegment(g.origine, g.fin);
  if (g.genre === "ligne") return c.surDroite(g.origine, g.direction);
  return g.origine;
}

/** Point commun de deux droites (o1 + s d1, o2 + t d2), à TOL près ; bornes facultatives sur s et t. */
function croiserDroites(o1: Vec3, d1: Vec3, o2: Vec3, d2: Vec3, b1: number | null, b2: number | null): Vec3 | undefined {
  const n = cross(d1, d2);
  const n2 = dot(n, n);
  if (n2 < 1e-18) return undefined;
  const w = sub(o2, o1);
  const s = dot(cross(w, d2), n) / n2;
  const t = dot(cross(w, d1), n) / n2;
  if (b1 !== null && (s < -TOL || s > b1 + TOL)) return undefined;
  if (b2 !== null && (t < -TOL || t > b2 + TOL)) return undefined;
  const p = add(o1, scale(d1, s));
  return dist(p, add(o2, scale(d2, t))) <= TOL ? p : undefined;
}

function intersectionGuides(A: GuideAccrochable, B: GuideAccrochable): Vec3 | undefined {
  const a = droiteDuGuide(A);
  const b = droiteDuGuide(B);
  return croiserDroites(a.o, a.d, b.o, b.d, a.borne, b.borne);
}

function intersectionGuideSegment(G: GuideAccrochable, p: Vec3, q: Vec3): Vec3 | undefined {
  const l = dist(p, q);
  if (l < EPS || G.genre === "point") return undefined;
  const g = droiteDuGuide(G);
  return croiserDroites(g.o, g.d, p, normalize(sub(q, p)), g.borne, l);
}

/**
 * Intersection apparente de deux arêtes : projetées sur le plan perpendiculaire à la vue, elles se coupent ; le point
 * rendu est celui de l'arête A (la première), sans que les arêtes se touchent en 3D.
 */
function intersectionApparente(A: AreteVisible, B: AreteVisible, V: Vec3): Vec3 | undefined {
  const proj = (x: Vec3) => sub(x, scale(V, dot(x, V)));
  const a1 = proj(A.a);
  const a2 = proj(A.b);
  const b1 = proj(B.a);
  const b2 = proj(B.b);
  const da = sub(a2, a1);
  const db = sub(b2, b1);
  const n = cross(da, db);
  const n2 = dot(n, n);
  if (n2 < 1e-18) return undefined;
  const w = sub(b1, a1);
  const s = dot(cross(w, db), n) / n2;
  const t = dot(cross(w, da), n) / n2;
  const m = 1e-9;
  if (s <= m || s >= 1 - m || t <= m || t >= 1 - m) return undefined;
  return lerp(A.a, A.b, s);
}

/** (Cas 2, lot 2) Arêtes de section : intersection du plan de coupe avec chaque face visible (segments monde). */
export function aretesDeSection(faces: readonly FaceVisible[], plan: { readonly origine: Vec3; readonly normale: Vec3 }): AreteVisible[] {
  const n = normalize(plan.normale);
  const r: AreteVisible[] = [];
  for (const f of faces) {
    if (f.horsAccrochage) continue;
    const boucles = [f.exterieur, ...f.trous];
    const points: Vec3[] = [];
    for (const b of boucles) {
      for (let i = 0; i < b.length; i++) {
        const p = b[i] as Vec3;
        const q = b[(i + 1) % b.length] as Vec3;
        const dp = dot(n, sub(p, plan.origine));
        const dq = dot(n, sub(q, plan.origine));
        if ((dp > TOL && dq > TOL) || (dp < -TOL && dq < -TOL)) continue;
        if (Math.abs(dp - dq) < EPS) continue;
        const t = dp / (dp - dq);
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        const x = lerp(p, q, Math.min(1, Math.max(0, t)));
        if (!points.some((y) => dist(y, x) <= TOL)) points.push(x);
      }
    }
    if (points.length < 2) continue;
    // Points rangés le long de la ligne de section, puis segments pris deux à deux (règle pair-impair).
    const d = normalize(cross(n, normalize(f.normale)));
    if (len(d) < 1e-9) continue;
    points.sort((x, y) => dot(x, d) - dot(y, d));
    for (let i = 0; i + 1 < points.length; i += 2) {
      const a = points[i] as Vec3;
      const b = points[i + 1] as Vec3;
      if (dist(a, b) > TOL) r.push({ id: `section:${f.id}:${i / 2}`, a, b, section: true, ...(f.dansObjet ? { dansObjet: true } : {}) });
    }
  }
  return r;
}

function intersectionSegments(a1: Vec3, b1: Vec3, a2: Vec3, b2: Vec3): Vec3 | undefined {
  const d1 = sub(b1, a1);
  const d2 = sub(b2, a2);
  const n = cross(d1, d2);
  const n2 = dot(n, n);
  if (n2 < 1e-18) return undefined;
  const w = sub(a2, a1);
  const s = dot(cross(w, d2), n) / n2;
  const t = dot(cross(w, d1), n) / n2;
  const m = 1e-9;
  if (s <= m || s >= 1 - m || t <= m || t >= 1 - m) return undefined;
  const p = add(a1, scale(d1, s));
  const q = add(a2, scale(d2, t));
  return dist(p, q) <= TOL ? p : undefined;
}

function meilleurPoint(cands: readonly CandidatPoint[], c: Curseur): CandidatPoint | undefined {
  return [...cands].sort(
    (x, y) => RANG_POINTS.indexOf(x.type) - RANG_POINTS.indexOf(y.type) || c.ecart(x.point) - c.ecart(y.point),
  )[0];
}

interface Ligne {
  readonly type: TypeInference;
  readonly origine: Vec3;
  readonly direction: Vec3;
  readonly libelle?: Libelle;
  /** Demi-droite : seul le côté de `direction` à partir de `origine` compte (prolongement d'une arête). */
  readonly demi?: boolean;
  /** Ligne issue d'un point de référence (« depuis le point ») : moins prioritaire que les lignes du point de départ. */
  readonly depuisPoint?: boolean;
}

function directionPerpendiculaire(ref: NonNullable<EntreeInference["areteReference"]>, axes: AxesModele): Vec3 {
  const d = normalize(sub(ref.b, ref.a));
  let p = cross(ref.normalePlan ?? axes.z, d);
  if (len(p) < 1e-9) p = cross(axes.x, d);
  return normalize(p);
}

function lignes(e: EntreeInference, axes: AxesModele, mode: ModeAlt): Ligne[] {
  const r: Ligne[] = [];
  if (mode === "aucune") return r;
  const D = e.depart;
  if (D && mode === "tout") {
    r.push({ type: "axe-x", origine: D, direction: axes.x }, { type: "axe-y", origine: D, direction: axes.y }, { type: "axe-z", origine: D, direction: axes.z });
  }
  if (D && e.areteReference) {
    const ref = e.areteReference;
    r.push({ type: "parallele", origine: D, direction: normalize(sub(ref.b, ref.a)) });
    r.push({ type: "perpendiculaire", origine: D, direction: directionPerpendiculaire(ref, axes) });
  }
  // Perpendiculaire à la face visée : depuis le point de départ, suivant la normale de la face sous le curseur.
  if (D) {
    const f = faceTouchee(e);
    if (f && len(f.face.normale) > EPS) r.push({ type: "perpendiculaire-face", origine: D, direction: normalize(f.face.normale) });
  }
  if (D && mode === "tout" && e.tangenteDepart) r.push({ type: "tangente", origine: D, direction: normalize(e.tangenteDepart) });
  if (mode === "tout") {
    for (const p of e.pointsReference ?? []) {
      r.push(
        { type: "axe-x", origine: p, direction: axes.x, libelle: LIBELLE_DEPUIS_POINT, depuisPoint: true },
        { type: "axe-y", origine: p, direction: axes.y, libelle: LIBELLE_DEPUIS_POINT, depuisPoint: true },
        { type: "axe-z", origine: p, direction: axes.z, libelle: LIBELLE_DEPUIS_POINT, depuisPoint: true },
      );
      // Prolonger une arête : demi-droite qui prolonge, au-delà de l'extrémité marquée, chaque arête qui y aboutit.
      for (const a of e.geometrie.aretes) {
        const autre = dist(a.a, p) <= TOL ? a.b : dist(a.b, p) <= TOL ? a.a : undefined;
        if (autre && dist(autre, p) > TOL) r.push({ type: "prolonger", origine: p, direction: normalize(sub(p, autre)), demi: true, depuisPoint: true });
      }
    }
  }
  return r;
}

/** (Cas 2, lot 2) Croisement : deux lignes d'inférence d'origines ou de directions différentes, ou une ligne et une arête. */
function croisement(e: EntreeInference, ls: readonly Ligne[], c: Curseur): Vec3 | undefined {
  let meilleur: { p: Vec3; d: number } | undefined;
  const garder = (p: Vec3 | undefined, l: Ligne) => {
    if (!p || dist(p, l.origine) <= TOL) return;
    if (l.demi && dot(sub(p, l.origine), l.direction) <= 0) return;
    const d = c.ecart(p);
    if (d <= e.tolerance && (!meilleur || d < meilleur.d)) meilleur = { p, d };
  };
  for (let i = 0; i < ls.length; i++) {
    const A = ls[i] as Ligne;
    for (let j = i + 1; j < ls.length; j++) {
      const B = ls[j] as Ligne;
      if (dist(A.origine, B.origine) <= TOL) continue;
      const p = croiserDroites(A.origine, normalize(A.direction), B.origine, normalize(B.direction), null, null);
      if (p && dist(p, B.origine) > TOL) garder(p, A);
    }
    for (const a of e.geometrie.aretes) {
      const l = dist(a.a, a.b);
      if (l < EPS) continue;
      const p = croiserDroites(A.origine, normalize(A.direction), a.a, normalize(sub(a.b, a.a)), null, l);
      if (p && dist(p, a.a) > TOL && dist(p, a.b) > TOL) garder(p, A);
    }
  }
  return meilleur?.p;
}

/**
 * (Cas 2, lot 2) Axe médian : deux arêtes parallèles, coplanaires, écartées d'au plus `ecartAxeMax` (0,60 m par défaut)
 * et qui se recouvrent ; le curseur est sur leur ligne médiane (à la tolérance près), dans la zone de recouvrement.
 */
function axeMedian(e: EntreeInference, c: Curseur): { point: Vec3; direction: Vec3; origine: Vec3 } | undefined {
  const max = e.accrochage?.ecartAxeMax ?? 0.6;
  const proches = e.geometrie.aretes.filter((a) => dist(a.a, a.b) > TOL && c.ecart(c.surSegment(a.a, a.b)) <= max);
  let meilleur: { point: Vec3; direction: Vec3; origine: Vec3; d: number } | undefined;
  for (let i = 0; i < proches.length; i++) {
    const A = proches[i] as AreteVisible;
    const u = normalize(sub(A.b, A.a));
    for (let j = i + 1; j < proches.length; j++) {
      const B = proches[j] as AreteVisible;
      const v = normalize(sub(B.b, B.a));
      if (Math.abs(Math.abs(dot(u, v)) - 1) > 1e-9) continue;
      const w = sub(B.a, A.a);
      const perp = sub(w, scale(u, dot(w, u)));
      const ecart = len(perp);
      if (ecart <= TOL || ecart > max + TOL) continue;
      // Recouvrement des deux arêtes le long de u.
      const t1 = [0, dot(sub(A.b, A.a), u)].sort((x, y) => x - y);
      const t2 = [dot(sub(B.a, A.a), u), dot(sub(B.b, A.a), u)].sort((x, y) => x - y);
      const debut = Math.max(t1[0] as number, t2[0] as number);
      const fin = Math.min(t1[1] as number, t2[1] as number);
      if (fin - debut <= TOL) continue;
      const o = add(A.a, scale(perp, 0.5));
      const p = c.surSegment(add(o, scale(u, debut)), add(o, scale(u, fin)));
      const d = c.ecart(p);
      if (d <= e.tolerance && (!meilleur || d < meilleur.d)) meilleur = { point: p, direction: u, origine: add(o, scale(u, debut)), d };
    }
  }
  return meilleur ? { point: meilleur.point, direction: meilleur.direction, origine: meilleur.origine } : undefined;
}

// ————————————————————————————————————————————————————————————— Moteur

/**
 * Inférence du point visé (voir l'ordre de priorité en tête de fichier).
 *
 * (Cas 2, lot 2) Avant : la géométrie exclue de l'accrochage est retirée, les arêtes de section du plan de coupe actif
 * sont ajoutées. Après : un genre forcé ne garde que ses accrochages ; le pas de longueur ajuste un point libre ; un point
 * libre qui tombe presque sur un sommet, une arête ou un angle droit est signalé (jamais déplacé).
 */
export function inferer(e0: EntreeInference): Inference {
  const e = preparer(e0);
  const r = infererBase(e);
  const sansSection = r.entite !== undefined && r.entite.startsWith("section:") ? (({ entite: _x, ...reste }) => reste)(r) : r;
  return finaliser(e, sansSection);
}

function preparer(e: EntreeInference): EntreeInference {
  const g = e.geometrie;
  const filtrer = g.aretes.some((a) => a.horsAccrochage) || g.faces.some((f) => f.horsAccrochage) || g.centres.some((k) => k.horsAccrochage);
  let aretes = filtrer ? g.aretes.filter((a) => !a.horsAccrochage) : g.aretes;
  const faces = filtrer ? g.faces.filter((f) => !f.horsAccrochage) : g.faces;
  const centres = filtrer ? g.centres.filter((k) => !k.horsAccrochage) : g.centres;
  const coupes = e.accrochage?.coupes ?? [];
  if (e.coupe && !coupes.includes("section") && !(e.accrochage?.force)) aretes = [...aretes, ...aretesDeSection(faces, e.coupe)];
  if (!filtrer && aretes === g.aretes) return e;
  return { ...e, geometrie: { aretes, faces, centres } };
}

const TYPES_LIBRES: ReadonlySet<TypeInference> = new Set(["aucune", "sur-face", "axe-x", "axe-y", "axe-z", "parallele", "perpendiculaire", "perpendiculaire-face", "prolonger", "tangente"]);

function finaliser(e: EntreeInference, r: Inference): Inference {
  const a = e.accrochage;
  if (!a || r.verrouillee) return r;
  let res = r;
  const D = e.depart;
  // Pas de longueur (Info modèle) : un point libre est ramené à un multiple du pas depuis le départ, sur sa direction.
  if (D && a.pasLongueur && a.pasLongueur > 0 && TYPES_LIBRES.has(r.type)) {
    const v = sub(r.point, D);
    const l = len(v);
    const surLePlan = r.type !== "sur-face" || !r.normale || Math.abs(dot(normalize(r.normale), v)) <= TOL;
    if (l > TOL && surLePlan) {
      const l2 = Math.round(l / a.pasLongueur) * a.pasLongueur;
      if (l2 > TOL && Math.abs(l2 - l) > 1e-12) res = { ...res, point: add(D, scale(normalize(v), l2)), pasApplique: true };
    }
  }
  // Presque accroché : signalé, jamais corrigé.
  if (a.presque && a.presque > 0 && TYPES_LIBRES.has(r.type)) {
    const p = res.point;
    let proche: Presque | undefined;
    for (const x of e.geometrie.aretes) {
      for (const s of [x.a, x.b]) {
        const d = dist(s, p);
        if (d > TOL && d <= a.presque && (!proche || proche.genre !== "sommet" || d < proche.ecart)) proche = { genre: "sommet", point: s, ecart: d };
      }
    }
    if (!proche) {
      for (const x of e.geometrie.aretes) {
        const ab = sub(x.b, x.a);
        const l2 = dot(ab, ab);
        if (l2 < EPS) continue;
        const q = lerp(x.a, x.b, Math.min(1, Math.max(0, dot(sub(p, x.a), ab) / l2)));
        const d = dist(q, p);
        if (d > TOL && d <= a.presque && (!proche || d < proche.ecart)) proche = { genre: "arete", point: q, ecart: d };
      }
    }
    if (!proche && D && e.areteReference && r.type !== "perpendiculaire") {
      const u = sub(p, D);
      const ref = normalize(sub(e.areteReference.b, e.areteReference.a));
      if (len(u) > TOL) {
        const ecartDeg = Math.abs(90 - (Math.acos(Math.min(1, Math.abs(dot(normalize(u), ref)))) * 180) / Math.PI);
        if (ecartDeg > 1e-6 && ecartDeg <= 2) proche = { genre: "angle-droit", point: D, ecart: ecartDeg };
      }
    }
    if (proche) res = { ...res, presque: proche };
  }
  return res;
}

function infererBase(e: EntreeInference): Inference {
  const axes = e.axes ?? AXES_MODELE;
  const c = curseur(e);
  if (e.verrou) {
    const v = infererVerrouille(e, e.verrou, axes, c);
    if (v) return v;
  }
  const force = e.accrochage?.force;
  // 1. points
  const pt = meilleurPoint(candidatsPoints(e, axes, c), c);
  if (pt) {
    return construire(pt.type, pt.point, {
      ...(pt.entite !== undefined ? { entite: pt.entite } : {}),
      ...(pt.dansObjet ? { dansObjet: true } : {}),
    });
  }
  // 1 bis. (Cas 2, lot 2) croisement de deux alignements, ou d'un alignement et d'une arête : avant « sur l'arête ».
  const toutes = force && force !== "intersection" ? [] : lignes(e, axes, e.modeAlt ?? "tout");
  if (e.accrochage && permis(e, "croisement")) {
    const x = croisement(e, toutes, c);
    if (x) return construire("croisement", x, {});
  }
  // 2. arêtes
  let surArete: { a: AreteVisible; p: Vec3; d: number } | undefined;
  for (const a of force ? [] : e.geometrie.aretes) {
    const p = c.surSegment(a.a, a.b);
    const d = c.ecart(p);
    if (d <= e.tolerance && (!surArete || d < surArete.d)) surArete = { a, p, d };
  }
  if (surArete) {
    return construire("sur-arete", surArete.p, { entite: surArete.a.id, ...(surArete.a.dansObjet ? { dansObjet: true } : {}) });
  }
  // 2 bis. (Cas 2, lot 2) guides puis axe médian entre deux arêtes parallèles.
  if (e.accrochage && permis(e, "sur-guide")) {
    let g: { id: Id; p: Vec3; d: number } | undefined;
    for (const x of e.guides ?? []) {
      if (x.genre === "point") continue;
      const p = pointSurGuide(x, c);
      const d = c.ecart(p);
      if (d <= e.tolerance && (!g || d < g.d)) g = { id: x.id, p, d };
    }
    if (g) return construire("sur-guide", g.p, { entite: g.id });
  }
  if (e.accrochage && permis(e, "axe-median")) {
    const m = axeMedian(e, c);
    if (m) return construire("axe-median", m.point, { direction: m.direction, origineLigne: m.origine });
  }
  // 3. inférences linéaires
  if (force) return construire("aucune", pointBrut(e, axes));
  let lin: { l: Ligne; p: Vec3; d: number } | undefined;
  for (const l of toutes) {
    const p = c.surDroite(l.origine, l.direction);
    if (dist(p, l.origine) < TOL) continue;
    if (l.demi && dot(sub(p, l.origine), l.direction) <= 0) continue;
    const d = c.ecart(p);
    // Les lignes du point de départ (axes, parallèle, perpendiculaire…) l'emportent sur celles d'un point de référence.
    const meilleur = !lin || (lin.l.depuisPoint === true && l.depuisPoint !== true) || (!!lin.l.depuisPoint === !!l.depuisPoint && d < lin.d - 1e-12);
    if (d <= e.tolerance && meilleur) lin = { l, p, d };
  }
  if (lin) {
    return construire(lin.l.type, lin.p, {
      direction: normalize(lin.l.direction),
      origineLigne: lin.l.origine,
      ...(lin.l.libelle ? { libelle: lin.l.libelle } : {}),
    });
  }
  // 4. face
  const f = faceTouchee(e);
  if (f) return construire("sur-face", f.point, { entite: f.face.id, normale: f.face.normale, ...(f.face.dansObjet ? { dansObjet: true } : {}) });
  // 5. rien
  return construire("aucune", pointBrut(e, axes));
}

function couleurAxe(d: Vec3, axes: AxesModele): string {
  const n = normalize(d);
  if (Math.abs(Math.abs(dot(n, normalize(axes.x))) - 1) < 1e-9) return COULEURS["axe-x"];
  if (Math.abs(Math.abs(dot(n, normalize(axes.y))) - 1) < 1e-9) return COULEURS["axe-y"];
  if (Math.abs(Math.abs(dot(n, normalize(axes.z))) - 1) < 1e-9) return COULEURS["axe-z"];
  return COULEURS.parallele;
}

function surLigne(
  e: EntreeInference,
  axes: AxesModele,
  c: Curseur,
  o: Vec3,
  d0: Vec3,
  type: TypeInference,
  couleur: string,
): Inference {
  const d = normalize(d0);
  const accroche = meilleurPoint(candidatsPoints(e, axes, c), c);
  const p = accroche ? add(o, scale(d, dot(sub(accroche.point, o), d))) : c.surDroite(o, d);
  return construire(type, p, { direction: d, origineLigne: o, libelle: LIBELLE_LIGNE_CONTRAINTE, verrouillee: true, couleur });
}

function infererVerrouille(e: EntreeInference, v: Verrou, axes: AxesModele, c: Curseur): Inference | undefined {
  const D = e.depart;
  switch (v.genre) {
    case "axe": {
      if (!D) return undefined;
      const type = v.axe === "x" ? "axe-x" : v.axe === "y" ? "axe-y" : "axe-z";
      return surLigne(e, axes, c, D, axes[v.axe], type, COULEURS[type]);
    }
    case "direction": {
      if (!D || len(v.direction) < EPS) return undefined;
      const type = v.type ?? "parallele";
      return surLigne(e, axes, c, D, v.direction, type, COULEURS[type]);
    }
    case "inference": {
      const i = v.inference;
      if (i.direction && i.origineLigne) return surLigne(e, axes, c, i.origineLigne, i.direction, i.type, i.couleur);
      if (i.type === "sur-face") {
        const f = e.geometrie.faces.find((x) => x.id === i.entite);
        if (f) return infererVerrouille(e, { genre: "plan", origine: i.point, normale: f.normale }, axes, c);
      }
      if (D && dist(D, i.point) > TOL) return surLigne(e, axes, c, D, sub(i.point, D), i.type, couleurAxe(sub(i.point, D), axes));
      return { ...i, verrouillee: true };
    }
    case "plan": {
      const n = normalize(v.normale);
      let base: Vec3;
      if (e.rayon) {
        const V = normalize(e.rayon.direction);
        const den = dot(n, V);
        base =
          Math.abs(den) < EPS
            ? e.rayon.origine
            : add(e.rayon.origine, scale(V, dot(n, sub(v.origine, e.rayon.origine)) / den));
      } else {
        const p = e.point ?? ORIGINE;
        base = sub(p, scale(n, dot(n, sub(p, v.origine))));
      }
      const surLePlan = candidatsPoints(e, axes, c).filter((x) => Math.abs(dot(n, sub(x.point, v.origine))) <= TOL);
      const accroche = meilleurPoint(surLePlan, c);
      return construire(accroche?.type ?? "aucune", accroche?.point ?? base, {
        libelle: LIBELLE_PLAN_CONTRAINT,
        verrouillee: true,
        couleur: couleurAxe(n, axes),
        ...(accroche?.entite !== undefined ? { entite: accroche.entite } : {}),
      });
    }
  }
}

// ————————————————————————————————————————————————————————————— Géométrie visible depuis le modèle

/**
 * Aplatit le modèle (racine + occurrences, transformations composées) en géométrie visible.
 * Les arêtes masquées sont exclues ; les entités d'un groupe/composant sont marquées `dansObjet`.
 */
/**
 * Options de vue de `geometrieVisible` (jamais écrites dans le modèle, R10) : contexte ouvert (O-2), isolement et
 * « Masquer le reste du modèle » / « Masquer les composants semblables » (O-5).
 */
export interface OptionsGeometrieVisible {
  /** Chemin du contexte ouvert (racine → occurrence) : ce qui n'est pas dessous est marqué `horsContexte`. */
  readonly chemin?: readonly Id[];
  /** Isolement (O-5) : seules les entités `ids` du contexte `chemin` (et tout le contenu des objets isolés) restent. */
  readonly isole?: { readonly chemin: readonly Id[]; readonly ids: readonly Id[] } | null;
  /** Masquer le reste du modèle (O-5) : ce qui est hors du contexte ouvert n'est pas rendu au lieu d'être délavé. */
  readonly masquerReste?: boolean;
  /** Masquer les composants semblables (O-5) : dans un composant ouvert, ses autres occurrences ne sont pas rendues. */
  readonly masquerSemblables?: boolean;
}

export function geometrieVisible(m: Modele, o: OptionsGeometrieVisible = {}): GeometrieVisible {
  const aretes: AreteVisible[] = [];
  const faces: FaceVisible[] = [];
  const centres: CentreVisible[] = [];
  const balises = m.annotations?.balises;
  // Objets O-2 : avec le chemin du contexte ouvert (racine → occurrence), tout ce qui n'est pas dessous est marqué.
  const ouvert = o.chemin ?? [];
  const dedans = (pile: readonly Id[]) => ouvert.length === 0 || (pile.length >= ouvert.length && ouvert.every((id, i) => pile[i] === id));
  // Objets O-5 : isolement (chemin du contexte d'isolement + entités retenues) ; composant ouvert pour les semblables.
  const iso = o.isole && o.isole.ids.length > 0 ? o.isole : null;
  const retenues = new Set(iso?.ids ?? []);
  // Composant ouvert : repéré par son chemin complet (une même occurrence enfant se répète sous chaque copie du parent).
  let defOuverte: Id | undefined;
  if (o.masquerSemblables && ouvert.length > 0) {
    let c: Contexte | undefined = m.racine;
    let def: Id | undefined;
    for (const id of ouvert) {
      const oc: Occurrence | undefined = c?.occurrences[id];
      if (!oc) {
        def = undefined;
        break;
      }
      def = oc.definition;
      c = m.definitions[def]?.contenu;
    }
    defOuverte = def !== undefined && m.definitions[def]?.genre === "composant" ? def : undefined;
  }
  const estOuvert = (pile: readonly Id[]) => pile.length === ouvert.length && pile.every((id, i) => id === ouvert[i]);
  /** Où en est la pile par rapport à l'isolement : « libre » (tout montrer), « chemin » (passer), « niveau » (filtrer). */
  const etatIsolement = (pile: readonly Id[]): "libre" | "chemin" | "niveau" | "dehors" => {
    if (!iso) return "libre";
    const n = iso.chemin.length;
    for (let i = 0; i < Math.min(n, pile.length); i++) if (pile[i] !== iso.chemin[i]) return "dehors";
    if (pile.length < n) return "chemin";
    if (pile.length === n) return "niveau";
    return retenues.has(pile[n] as Id) ? "libre" : "dehors";
  };
  // (Cas 2, lot 4) Balise masquée : rien de ce qu'elle porte n'est rendu ; verrouillée : rendu, marqué.
  const cachee = (b: Id | undefined) => !!b && balises?.[b]?.visible === false;
  const verrou = (b: Id | undefined) => !!b && balises?.[b]?.verrouillee === true;
  const parcourir = (c: Contexte, M: Matrice4, dansObjet: boolean, profondeur: number, materiau: Id | undefined, balise: Id | undefined, pile: readonly Id[] = [], exclu = false, verrouille = false): void => {
    if (profondeur > 32) return;
    const isolement = etatIsolement(pile);
    if (isolement === "dehors") return;
    const hors = !dedans(pile);
    const p = (s: Id): Vec3 => appliquer(M, (c.sommets[s] as { position: Vec3 }).position);
    const marque = { ...(dansObjet ? { dansObjet: true } : {}), ...(hors ? { horsContexte: true } : {}), ...(exclu ? { horsAccrochage: true } : {}) };
    // Ni la géométrie d'un contexte traversé pour atteindre l'isolement, ni le reste du modèle quand il est masqué.
    const montrer = (id: Id) => isolement === "libre" || (isolement === "niveau" && retenues.has(id));
    const rendre = !(o.masquerReste && hors);
    for (const a of Object.values(c.aretes)) {
      if (a.masquee || !rendre || !montrer(a.id) || cachee(a.balise)) continue;
      const bal = a.balise ?? balise;
      aretes.push({ id: a.id, a: p(a.a), b: p(a.b), ...marque, ...(a.adoucie ? { adoucie: true } : {}), ...(bal ? { balise: bal } : {}), ...(verrouille || verrou(a.balise) ? { verrouillee: true } : {}) });
    }
    for (const f of Object.values(c.faces)) {
      if (f.masquee || !rendre || !montrer(f.id) || cachee(f.balise)) continue;
      const mat = f.materiauRecto ?? materiau;
      const balF = f.balise ?? balise;
      faces.push({
        id: f.id,
        exterieur: f.exterieur.map(p),
        trous: f.trous.map((b) => b.map(p)),
        normale: transformerNormale(M, f.normale),
        ...marque,
        ...(mat ? { materiau: mat } : {}),
        ...(balF ? { balise: balF } : {}),
        ...(verrouille || verrou(f.balise) ? { verrouillee: true } : {}),
      });
    }
    for (const k of Object.values(c.courbes)) {
      if (!(rendre && (isolement === "libre" || k.aretes.some((a) => retenues.has(a))))) continue;
      // (Cas 2, lot 2) Rayon et normale monde, pour les quadrants.
      const nm = normalize(transformerNormale(M, k.normale));
      const base = baseDuPlan(k.normale).u;
      const rayon = dist(appliquer(M, add(k.centre, scale(base, k.rayon))), appliquer(M, k.centre));
      const troncons = k.aretes.flatMap((a) => {
        const ar = c.aretes[a];
        const pa = ar ? c.sommets[ar.a]?.position : undefined;
        const pb = ar ? c.sommets[ar.b]?.position : undefined;
        return pa && pb ? [[appliquer(M, pa), appliquer(M, pb)] as const] : [];
      });
      centres.push({ id: k.id, position: appliquer(M, k.centre), ...marque, rayon, normale: nm, troncons });
    }
    for (const oc of Object.values(c.occurrences)) {
      // Objet masqué (lot 5) ou balise masquée (calque invisible, P-9) : l'objet n'est ni affiché ni accroché.
      if (oc.masquee) continue;
      if (defOuverte !== undefined && oc.definition === defOuverte && !estOuvert([...pile, oc.id])) continue;
      if (oc.balise && balises && balises[oc.balise] && !balises[oc.balise]!.visible) continue;
      const d = m.definitions[oc.definition];
      // (Cas 2, lot 2) Objet ou balise exclu de l'accrochage : affiché, marqué `horsAccrochage`.
      const exclut = exclu || oc.horsAccrochage === true || (!!oc.balise && !!balises?.[oc.balise]?.horsAccrochage);
      if (d) parcourir(d.contenu, composer(M, oc.transformation), true, profondeur + 1, oc.materiau ?? materiau, oc.balise ?? balise, [...pile, oc.id], exclut, verrouille || verrou(oc.balise));
    }
  };
  parcourir(m.racine, IDENTITE, false, 0, undefined, undefined);
  return { aretes, faces, centres };
}
