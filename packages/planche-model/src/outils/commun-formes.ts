/**
 * Aides communes aux machines des outils de FORMES (lot 2) : Rectangle, Rectangle pivoté, Cercle, Polygone,
 * Arcs, Secteur. Aucune logique d'outil ici : visée sur un plan, formatage du champ Mesures, lecture du
 * catalogue, géométrie des arcs, correction après coup.
 */
import { type EtapeOutil, type Outil, INFERENCES, outilParId } from "../catalogue-outils.js";
import type { Modele } from "../geometrie-libre.js";
import { type Inference, COULEURS, LIBELLES, LIBELLE_PLAN_CONTRAINT, geometrieVisible, inferer } from "../inference.js";
import { type AttenduSaisie, type ContexteSaisie, SEGMENTS_MAX, SEGMENTS_MIN } from "../saisie-vcb.js";
import {
  type Vec3,
  AXE_X,
  AXE_Y,
  AXE_Z,
  EPS,
  TOL,
  add,
  cross,
  dist,
  dot,
  len,
  normalize,
  scale,
  sub,
  tourner,
} from "../vecteur.js";
import type { ContexteOutil, Rayon, Touche, VueOutil } from "./machine.js";

// ————————————————————————————————————————————————————————————— Catalogue

export function outil(id: string): Outil {
  const o = outilParId(id);
  if (!o) throw new Error(`Outil absent du catalogue : ${id}`);
  return o;
}

export function etape(id: string, i: number): EtapeOutil {
  const e = outil(id).etapes[i];
  if (!e) throw new Error(`Étape ${i} absente du catalogue pour ${id}`);
  return e;
}

/** Valeur initiale « Côtés » relevée dans le catalogue (24 cercle, 6 polygone, 12 arcs). */
export function cotesParDefaut(id: string): number {
  const v = Number(etape(id, 0).valeurInitiale);
  if (!Number.isInteger(v)) throw new Error(`Nombre de côtés par défaut non relevé pour ${id}`);
  return v;
}

// ————————————————————————————————————————————————————————————— Champ Mesures

export function formaterNombre(v: number, decimales: number, sep: "." | ","): string {
  const s = (Math.abs(v) < 0.5 * 10 ** -decimales ? 0 : v).toFixed(decimales);
  return sep === "," ? s.replace(".", ",") : s;
}

/** Longueur affichée avec la précision par défaut d'Info modèle (`0,00 m`). */
export const formaterLongueur = (v: number, sep: "." | ","): string => `${formaterNombre(v, 2, sep)} m`;
/** Angle en degrés affiché à une décimale (`95,6`). */
export const formaterAngle = (deg: number, sep: "." | ","): string => formaterNombre(deg, 1, sep);
/** Séparateur de liste affiché : « ; » en locale à virgule décimale, « , » sinon (§5.3, P-3). */
export const sepListe = (sep: "." | ","): string => (sep === "," ? " ; " : ", ");

/** Valeur approchée (non accrochée) : préfixe « ~ ». */
export const approchee = (i: Inference | null): boolean => !i || i.type === "aucune" || i.type === "sur-face";
export const prefixe = (i: Inference | null): string => (approchee(i) ? "~ " : "");

export function contexteSaisie(attendu: AttenduSaisie, ctx: ContexteOutil, extra: Partial<ContexteSaisie> = {}): ContexteSaisie {
  return { ...extra, attendu, separateurDecimal: ctx.separateurDecimal };
}

export function mesures(
  libelle: string | null,
  valeur: string,
  saisie: ContexteSaisie,
): VueOutil["mesures"] {
  return libelle === null ? null : { libelle, valeur, saisie };
}

export interface Apercu {
  readonly lignes: readonly (readonly Vec3[])[];
  readonly faces: readonly (readonly Vec3[])[];
}

export const APERCU_VIDE: Apercu = { lignes: [], faces: [] };

export function vue(
  consigne: string,
  m: VueOutil["mesures"],
  inference: Inference | null,
  apercu: Apercu,
  ctx: ContexteOutil,
  erreur: string | null,
): VueOutil {
  return { consigne, mesures: m, inference, apercu, selection: ctx.selection, survol: [], erreur };
}

// ————————————————————————————————————————————————————————————— Segments (Ctrl + / Ctrl −, « Ns »)

export const MSG_SEGMENTS = `Le nombre de segments d'une courbe doit être compris entre ${SEGMENTS_MIN} et ${SEGMENTS_MAX}.`;

export function ajusterSegments(n: number, delta: 1 | -1): { cotes: number; erreur: string | null } {
  const x = n + delta;
  if (x < SEGMENTS_MIN || x > SEGMENTS_MAX) return { cotes: n, erreur: MSG_SEGMENTS };
  return { cotes: x, erreur: null };
}

// ————————————————————————————————————————————————————————————— Plans et visée

export interface PlanDessin {
  readonly origine: Vec3;
  readonly normale: Vec3;
}

/** Flèches → ← ↑ : normale (ou plan perpendiculaire à) rouge, vert, bleu. ↓ est traitée par l'outil. */
export function axeDeFleche(t: Touche): Vec3 | null {
  return t === "FlecheDroite" ? AXE_X : t === "FlecheGauche" ? AXE_Y : t === "FlecheHaut" ? AXE_Z : null;
}

export const estFleche = (t: Touche): boolean =>
  t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut" || t === "FlecheBas";

/**
 * Axes (u, w) d'un plan de normale n, dans l'ordre relevé « R puis V, R puis B, V puis B » pour les plans
 * des axes ; pour un plan quelconque, u = projection de l'axe rouge (sinon du vert), w = n × u.
 */
export function axesDuPlan(n0: Vec3): { u: Vec3; w: Vec3 } {
  const n = normalize(n0);
  if (Math.abs(Math.abs(n.z) - 1) < 1e-9) return { u: AXE_X, w: AXE_Y };
  if (Math.abs(Math.abs(n.x) - 1) < 1e-9) return { u: AXE_Y, w: AXE_Z };
  if (Math.abs(Math.abs(n.y) - 1) < 1e-9) return { u: AXE_X, w: AXE_Z };
  let u = sub(AXE_X, scale(n, n.x));
  if (len(u) < 0.1) u = sub(AXE_Y, scale(n, n.y));
  u = normalize(u);
  return { u, w: normalize(cross(n, u)) };
}

export function intersectionRayonPlan(r: Rayon, pl: PlanDessin): Vec3 | null {
  const V = normalize(r.direction);
  const n = normalize(pl.normale);
  const den = dot(n, V);
  if (Math.abs(den) < 1e-9) return null;
  const t = dot(n, sub(pl.origine, r.origine)) / den;
  if (t < 0) return null;
  return add(r.origine, scale(V, t));
}

export const projeterSurPlan = (p: Vec3, pl: PlanDessin): Vec3 => {
  const n = normalize(pl.normale);
  return sub(p, scale(n, dot(n, sub(p, pl.origine))));
};

export function inferenceBrute(point: Vec3): Inference {
  return { point, type: "aucune", couleur: COULEURS.aucune, libelle: LIBELLES.aucune, verrouillee: false };
}

/** Inférence « Carré » (rectangle) : diagonale pointillée, libellé du catalogue. */
export function inferenceCarre(point: Vec3): Inference {
  const l = INFERENCES.carre;
  return { ...inferenceBrute(point), libelle: { en: l.libelleSketchUp ?? "", fr: l.libelle } };
}

export function inferenceTangente(point: Vec3, direction: Vec3, origine: Vec3): Inference {
  return {
    point,
    type: "tangente",
    couleur: COULEURS.tangente,
    libelle: LIBELLES.tangente,
    verrouillee: false,
    direction,
    origineLigne: origine,
  };
}

interface Viser {
  readonly rayon: Rayon;
  readonly tolerance: number;
}

/** Inférence libre (accrochages, axes depuis `depart`), et normale du plan inféré : face survolée, sinon sol. */
export function viserLibre(ctx: ContexteOutil, ev: Viser, depart?: Vec3): { inference: Inference; normale: Vec3 } {
  const geometrie = geometrieVisible(ctx.modele);
  const inference = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie, ...(depart ? { depart } : {}) });
  let normale = AXE_Z;
  if (inference.type === "sur-face" && inference.entite !== undefined) {
    const f = geometrie.faces.find((x) => x.id === inference.entite);
    if (f) normale = normalize(f.normale);
  }
  return { inference, normale };
}

/**
 * Point visé SUR un plan de dessin. `contraint` (plan verrouillé par flèche / Maj) : infobulle « Contraint sur
 * le plan ». Sinon l'inférence libre est gardée si elle tombe sur le plan, et le point brut est l'intersection
 * du rayon avec le plan. Rayon parallèle au plan : projection du point inféré.
 */
export function viserSurPlan(ctx: ContexteOutil, ev: Viser, pl: PlanDessin, depart: Vec3, contraint: boolean): Inference {
  const { inference } = viserLibre(ctx, ev, depart);
  const n = normalize(pl.normale);
  const surLePlan = Math.abs(dot(n, sub(inference.point, pl.origine))) <= 1e-6;
  if (surLePlan && inference.type !== "aucune" && inference.type !== "sur-face") {
    return contraint ? { ...inference, libelle: LIBELLE_PLAN_CONTRAINT, verrouillee: true } : inference;
  }
  const x = intersectionRayonPlan(ev.rayon, pl) ?? projeterSurPlan(inference.point, pl);
  const brut = inferenceBrute(x);
  return contraint ? { ...brut, libelle: LIBELLE_PLAN_CONTRAINT, verrouillee: true } : brut;
}

export const marquerContraint = (i: Inference): Inference => ({ ...i, libelle: LIBELLE_PLAN_CONTRAINT, verrouillee: true });

// ————————————————————————————————————————————————————————————— Angles et arcs

/** Angle signé de a vers b autour de n (radians, ]−π ; π]). */
export function angleSigne(a: Vec3, b: Vec3, n: Vec3): number {
  return Math.atan2(dot(cross(a, b), normalize(n)), dot(a, b));
}

/** Ramène un écart angulaire dans ]−π ; π]. */
export function ecartAngulaire(x: number): number {
  let y = x;
  while (y > Math.PI) y -= 2 * Math.PI;
  while (y <= -Math.PI) y += 2 * Math.PI;
  return y;
}

/** Arc normalisé : départ `centre + depart·rayon`, rotation directe d'`angle` (> 0) autour de `normale`. */
export interface ArcGeo {
  readonly centre: Vec3;
  readonly normale: Vec3;
  readonly rayon: number;
  /** Direction unitaire centre → point de départ. */
  readonly depart: Vec3;
  readonly angle: number;
}

/** Normalise un arc d'angle signé (angle négatif : normale inversée). */
export function arc(centre: Vec3, normale: Vec3, rayon: number, depart: Vec3, angle: number): ArcGeo {
  const n = normalize(normale);
  return angle >= 0
    ? { centre, normale: n, rayon, depart: normalize(depart), angle }
    : { centre, normale: scale(n, -1), rayon, depart: normalize(depart), angle: -angle };
}

export function pointsArc(a: ArcGeo, segments: number): Vec3[] {
  const p0 = add(a.centre, scale(a.depart, a.rayon));
  const r: Vec3[] = [];
  for (let i = 0; i <= segments; i++) r.push(i === 0 ? p0 : tourner(p0, a.centre, a.normale, (a.angle * i) / segments));
  return r;
}

export const debutArc = (a: ArcGeo): Vec3 => add(a.centre, scale(a.depart, a.rayon));
export const finArc = (a: ArcGeo): Vec3 => tourner(debutArc(a), a.centre, a.normale, a.angle);
/** Tangente unitaire (sens de parcours) au point `p` de l'arc. */
export const tangenteArc = (a: ArcGeo, p: Vec3): Vec3 => normalize(cross(a.normale, sub(p, a.centre)));

/** Arc de A à B passant par P (cercle circonscrit) ; null si les trois points sont alignés ou confondus. */
export function arcParTroisPoints(A: Vec3, P: Vec3, B: Vec3): ArcGeo | null {
  const b = sub(P, A);
  const c = sub(B, A);
  const w = cross(b, c);
  const w2 = dot(w, w);
  if (w2 < 1e-18 || len(b) < TOL || len(c) < TOL || dist(P, B) < TOL) return null;
  const centre = add(A, scale(cross(sub(scale(c, dot(b, b)), scale(b, dot(c, c))), w), 1 / (2 * w2)));
  const n = normalize(w);
  const da = sub(A, centre);
  let ang = angleSigne(da, sub(B, centre), n);
  if (ang <= 0) ang += 2 * Math.PI;
  return { centre, normale: n, rayon: len(da), depart: normalize(da), angle: ang };
}

/** Arc partant de A tangent à `t`, jusqu'à B ; null si B est sur la tangente. */
export function arcTangent(A: Vec3, t0: Vec3, B: Vec3): ArcGeo | null {
  const t = normalize(t0);
  const d = sub(B, A);
  const ortho = sub(d, scale(t, dot(d, t)));
  if (len(ortho) < 1e-9 * Math.max(1, len(d)) || len(d) < TOL) return null;
  const nrm = normalize(ortho);
  const R = dot(d, d) / (2 * dot(d, nrm));
  const centre = add(A, scale(nrm, R));
  const n = normalize(cross(t, nrm));
  const da = sub(A, centre);
  let ang = angleSigne(da, sub(B, centre), n);
  if (ang <= 0) ang += 2 * Math.PI;
  return { centre, normale: n, rayon: R, depart: normalize(da), angle: ang };
}

/** Arc 2 points : corde A → B et flèche signée `h` le long de `perp` (unitaire, ⟂ corde). */
export function arcParFleche(A: Vec3, B: Vec3, perp: Vec3, h: number): ArcGeo | null {
  if (Math.abs(h) < TOL) return null;
  const milieu = scale(add(A, B), 0.5);
  return arcParTroisPoints(A, add(milieu, scale(normalize(perp), h)), B);
}

/** Direction perpendiculaire à la corde dans le plan de normale n0 (secours : axes). */
export function perpendiculaireCorde(corde: Vec3, n0: Vec3): Vec3 {
  let p = cross(normalize(n0), corde);
  if (len(p) < EPS) p = cross(corde, AXE_X);
  if (len(p) < EPS) p = cross(corde, AXE_Y);
  return normalize(p);
}

// ————————————————————————————————————————————————————————————— Correction après coup

/** Dernière opération terminée, corrigeable au champ Mesures tant que le modèle n'a pas changé depuis. */
export interface Derniere<P> {
  readonly avant: Modele;
  readonly apres: Modele;
  readonly params: P;
}

/**
 * La correction n'est possible que si le modèle courant EST celui produit par la dernière opération
 * (identité de l'objet immuable) : toute autre action intercalée l'interdit (§5.3, [DOC §2.3]).
 */
export const corrigeable = <P>(d: Derniere<P> | null, ctx: ContexteOutil): d is Derniere<P> => d !== null && d.apres === ctx.modele;

export function messageErreur(e: unknown): string {
  if (e instanceof RangeError && /segments/i.test(e.message)) return MSG_SEGMENTS;
  return e instanceof Error ? `Opération impossible : ${e.message}` : "Opération impossible.";
}

export const fermer = (pts: readonly Vec3[]): Vec3[] => (pts.length ? [...pts, pts[0] as Vec3] : []);
