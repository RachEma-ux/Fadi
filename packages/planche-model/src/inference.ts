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
  | "tangente"
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
  tangente: "#00c0c0", // « Tangent at Vertex » cyan
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
  tangente: { en: "Tangent at Vertex", fr: "Tangente au sommet" },
  aucune: { en: "", fr: "" },
};

export const LIBELLE_DEPUIS_POINT: Libelle = { en: "From Point", fr: "Depuis le point" };
export const LIBELLE_LIGNE_CONTRAINTE: Libelle = { en: "Constrained on Line", fr: "Contraint sur la ligne" };
export const LIBELLE_PLAN_CONTRAINT: Libelle = { en: "Constrained on Plane", fr: "Contraint sur le plan" };

/** Rang des inférences ponctuelles (plus petit = prioritaire). */
export const RANG_POINTS: readonly TypeInference[] = ["extremite", "milieu", "intersection", "centre", "origine"];

export interface AreteVisible {
  readonly id: Id;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly dansObjet?: boolean;
}

export interface FaceVisible {
  readonly id: Id;
  readonly exterieur: readonly Vec3[];
  readonly trous: readonly (readonly Vec3[])[];
  readonly normale: Vec3;
  readonly dansObjet?: boolean;
}

export interface CentreVisible {
  readonly id: Id;
  readonly position: Vec3;
  readonly dansObjet?: boolean;
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
}

export interface Inference {
  readonly point: Vec3;
  readonly type: TypeInference;
  readonly couleur: string;
  readonly libelle: Libelle;
  readonly verrouillee: boolean;
  readonly entite?: Id;
  /** Direction de la ligne d'inférence (inférences linéaires). */
  readonly direction?: Vec3;
  /** Origine de la ligne pointillée (départ ou point de référence). */
  readonly origineLigne?: Vec3;
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
  const n = normalize(axes.z);
  const den = dot(n, V);
  if (Math.abs(den) > EPS) {
    const t = dot(n, sub(axes.origine, r.origine)) / den;
    if (t > 0) return add(r.origine, scale(V, t));
  }
  if (e.depart) return add(r.origine, scale(V, Math.max(0, dot(sub(e.depart, r.origine), V))));
  return r.origine;
}

function construire(
  type: TypeInference,
  point: Vec3,
  options: { entite?: Id; dansObjet?: boolean; direction?: Vec3; origineLigne?: Vec3; libelle?: Libelle; verrouillee?: boolean; couleur?: string } = {},
): Inference {
  return {
    point,
    type,
    couleur: options.couleur ?? (options.dansObjet ? COULEUR_DANS_OBJET : COULEURS[type]),
    libelle: options.libelle ?? LIBELLES[type],
    verrouillee: options.verrouillee ?? false,
    ...(options.entite !== undefined ? { entite: options.entite } : {}),
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
  // Intersections d'arêtes proches du curseur (hors extrémités).
  const proches = e.geometrie.aretes.filter((a) => c.ecart(c.surSegment(a.a, a.b)) <= tol);
  for (let i = 0; i < proches.length; i++) {
    for (let j = i + 1; j < proches.length; j++) {
      const A = proches[i] as AreteVisible;
      const B = proches[j] as AreteVisible;
      const x = intersectionSegments(A.a, A.b, B.a, B.b);
      if (x) r.push({ type: "intersection", point: x, entite: A.id });
    }
  }
  return r.filter((x) => c.ecart(x.point) <= tol);
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
  if (D && mode === "tout" && e.tangenteDepart) r.push({ type: "tangente", origine: D, direction: normalize(e.tangenteDepart) });
  if (mode === "tout") {
    for (const p of e.pointsReference ?? []) {
      r.push(
        { type: "axe-x", origine: p, direction: axes.x, libelle: LIBELLE_DEPUIS_POINT },
        { type: "axe-y", origine: p, direction: axes.y, libelle: LIBELLE_DEPUIS_POINT },
        { type: "axe-z", origine: p, direction: axes.z, libelle: LIBELLE_DEPUIS_POINT },
      );
    }
  }
  return r;
}

// ————————————————————————————————————————————————————————————— Moteur

/** Inférence du point visé (voir l'ordre de priorité en tête de fichier). */
export function inferer(e: EntreeInference): Inference {
  const axes = e.axes ?? AXES_MODELE;
  const c = curseur(e);
  if (e.verrou) {
    const v = infererVerrouille(e, e.verrou, axes, c);
    if (v) return v;
  }
  // 1. points
  const pt = meilleurPoint(candidatsPoints(e, axes, c), c);
  if (pt) {
    return construire(pt.type, pt.point, {
      ...(pt.entite !== undefined ? { entite: pt.entite } : {}),
      ...(pt.dansObjet ? { dansObjet: true } : {}),
    });
  }
  // 2. arêtes
  let surArete: { a: AreteVisible; p: Vec3; d: number } | undefined;
  for (const a of e.geometrie.aretes) {
    const p = c.surSegment(a.a, a.b);
    const d = c.ecart(p);
    if (d <= e.tolerance && (!surArete || d < surArete.d)) surArete = { a, p, d };
  }
  if (surArete) {
    return construire("sur-arete", surArete.p, { entite: surArete.a.id, ...(surArete.a.dansObjet ? { dansObjet: true } : {}) });
  }
  // 3. inférences linéaires
  let lin: { l: Ligne; p: Vec3; d: number } | undefined;
  for (const l of lignes(e, axes, e.modeAlt ?? "tout")) {
    const p = c.surDroite(l.origine, l.direction);
    if (dist(p, l.origine) < TOL) continue;
    const d = c.ecart(p);
    if (d <= e.tolerance && (!lin || d < lin.d - 1e-12)) lin = { l, p, d };
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
  if (f) return construire("sur-face", f.point, { entite: f.face.id, ...(f.face.dansObjet ? { dansObjet: true } : {}) });
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
export function geometrieVisible(m: Modele): GeometrieVisible {
  const aretes: AreteVisible[] = [];
  const faces: FaceVisible[] = [];
  const centres: CentreVisible[] = [];
  const parcourir = (c: Contexte, M: Matrice4, dansObjet: boolean, profondeur: number): void => {
    if (profondeur > 32) return;
    const p = (s: Id): Vec3 => appliquer(M, (c.sommets[s] as { position: Vec3 }).position);
    const marque = dansObjet ? { dansObjet: true } : {};
    for (const a of Object.values(c.aretes)) if (!a.masquee) aretes.push({ id: a.id, a: p(a.a), b: p(a.b), ...marque });
    for (const f of Object.values(c.faces)) {
      faces.push({
        id: f.id,
        exterieur: f.exterieur.map(p),
        trous: f.trous.map((b) => b.map(p)),
        normale: transformerNormale(M, f.normale),
        ...marque,
      });
    }
    for (const k of Object.values(c.courbes)) centres.push({ id: k.id, position: appliquer(M, k.centre), ...marque });
    for (const o of Object.values(c.occurrences)) {
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, composer(M, o.transformation), true, profondeur + 1);
    }
  };
  parcourir(m.racine, IDENTITE, false, 0);
  return { aretes, faces, centres };
}
