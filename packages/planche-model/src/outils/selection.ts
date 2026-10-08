/**
 * Outil Sélection (cahier-planche §4.1, relevé outils-dessin §1) — machine d'états pure.
 *
 * Clic : remplace la sélection (face seule ; arête ou courbe entière ; groupe / composant entier) ; clic dans le vide :
 * tout désélectionner. Double-clic : face + arêtes bordantes, arête + faces qui la partagent, groupe → entrer dans son
 * contexte d'édition. Triple-clic : tout le connecté. Cadre gauche → droite = fenêtre (entièrement contenu), droite →
 * gauche = croisée (touché), via `ctx.entitesDansCadre`. Maj = basculer, Ctrl = ajouter, Maj + Ctrl = retirer
 * (maintenus). Échap : sort du contexte d'édition, sinon vide la sélection ; Suppr : efface la sélection.
 * Poignées : une arête sélectionnée montre ses deux extrémités ; appuyer sur l'une et la glisser déplace ce sommet
 * (la géométrie connectée s'étire, comme Déplacer sur un sommet), l'arête reste surlignée pendant le geste et le
 * point suit l'inférence ; relâcher pose le point (un pas d'annulation « Déplacer un point »).
 *
 * Ce module porte aussi les aides communes aux outils de tracé (visée par rayon, scène aplatie, consignes du
 * catalogue, conversion monde → contexte d'édition).
 */
import { outilParId, type EtapeOutil, type Outil } from "../catalogue-outils.js";
import {
  type Contexte,
  type Id,
  type Matrice4,
  type Modele,
  IDENTITE,
  appliquer,
  aretesDeFace,
  aretesDeLaCourbe,
  baseDuPlan,
  composer,
  contexte,
  deplacer,
  effacerEntites,
  entitesConnectees,
  facesDeLArete,
  inverserMatrice,
  matriceMonde,
  transformerNormale,
} from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import type { ContexteSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, add, dist, dot, normalize, scale, sub } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

// ————————————————————————————————————————————————————————————— Aides communes (catalogue)

export function outilCatalogue(id: string): Outil {
  const o = outilParId(id);
  if (!o) throw new Error(`Outil absent du catalogue : ${id}`);
  return o;
}

export function etapeCatalogue(id: string, rang: number): EtapeOutil {
  const e = outilCatalogue(id).etapes[rang];
  if (!e) throw new Error(`Étape ${rang} absente du catalogue pour ${id}`);
  return e;
}

/** Champ Mesures inactif (« Mesures · vide ») d'après l'étape du catalogue. */
export function mesuresVides(e: EtapeOutil, ctx: ContexteOutil): NonNullable<VueOutil["mesures"]> {
  const saisie: ContexteSaisie = { ...(e.saisie ?? { attendu: "aucune" }), separateurDecimal: ctx.separateurDecimal };
  return { libelle: e.libelleMesures ?? "Mesures", valeur: "", saisie };
}

export type Point2 = { x: number; y: number };
export const distance2 = (a: Point2, b: Point2): number => Math.hypot(a.x - b.x, a.y - b.y);
/** Seuil (pixels) au-delà duquel un appui devient un glisser (choix Fadi). */
export const SEUIL_GLISSER = 3;

// ————————————————————————————————————————————————————————————— Scène aplatie et visée

export type ElementScene =
  | {
      readonly genre: "arete";
      readonly id: Id;
      /** Occurrences traversées depuis la racine. */
      readonly chemin: readonly Id[];
      readonly a: Vec3;
      readonly b: Vec3;
      readonly masquee: boolean;
      readonly adoucie: boolean;
    }
  | {
      readonly genre: "face";
      readonly id: Id;
      readonly chemin: readonly Id[];
      readonly exterieur: readonly Vec3[];
      readonly trous: readonly (readonly Vec3[])[];
      readonly normale: Vec3;
    };

const caches = new WeakMap<Modele, readonly ElementScene[]>();

/** Toutes les arêtes (masquées comprises) et faces du modèle, en coordonnées monde, avec leur chemin d'occurrences. */
export function scene(m: Modele): readonly ElementScene[] {
  const c0 = caches.get(m);
  if (c0) return c0;
  const r: ElementScene[] = [];
  const parcourir = (c: Contexte, M: Matrice4, chemin: readonly Id[]): void => {
    if (chemin.length > 32) return;
    const p = (s: Id): Vec3 => appliquer(M, (c.sommets[s] as { position: Vec3 }).position);
    for (const a of Object.values(c.aretes)) {
      r.push({ genre: "arete", id: a.id, chemin, a: p(a.a), b: p(a.b), masquee: a.masquee === true, adoucie: a.adoucie === true });
    }
    for (const f of Object.values(c.faces)) {
      if (f.masquee) continue;
      r.push({
        genre: "face",
        id: f.id,
        chemin,
        exterieur: f.exterieur.map(p),
        trous: f.trous.map((b) => b.map(p)),
        normale: normalize(transformerNormale(M, f.normale)),
      });
    }
    for (const o of Object.values(c.occurrences)) {
      if (o.masquee) continue;
      const bal = o.balise ? m.annotations?.balises[o.balise] : undefined;
      if (bal && !bal.visible) continue;
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, composer(M, o.transformation), [...chemin, o.id]);
    }
  };
  parcourir(m.racine, IDENTITE, []);
  caches.set(m, r);
  return r;
}

/** Écart entre un rayon et un point. */
function ecartRayonPointLibre(r: Rayon, P: Vec3): number {
  const V = normalize(r.direction);
  const s = Math.max(0, dot(sub(P, r.origine), V));
  return dist(add(r.origine, scale(V, s)), P);
}

/**
 * Annotation visée par le rayon (lot 4) : plan de coupe (rayon ∩ plan dans son rectangle), cote ou texte avec repère
 * (près de son texte), guide (près de la ligne, du segment ou du point). La plus proche de la caméra gagne.
 */
export function viserAnnotation(m: Modele, r: Rayon, tolerance: number, ecran?: { x: number; y: number }): Id | null {
  const a = m.annotations;
  if (!a) return null;
  const V = normalize(r.direction);
  let meilleur: { id: Id; t: number } | null = null;
  const retenir = (id: Id, t: number): void => {
    if (t > 0 && (!meilleur || t < meilleur.t)) meilleur = { id, t };
  };
  for (const p of Object.values(a.plansDeCoupe)) {
    const den = dot(p.normale, V);
    if (Math.abs(den) < 1e-9) continue;
    const t = dot(p.normale, sub(p.origine, r.origine)) / den;
    if (t <= 0) continue;
    const X = sub(add(r.origine, scale(V, t)), p.origine);
    if (Math.abs(dot(X, p.u)) <= p.demiU && Math.abs(dot(X, p.w)) <= p.demiW) retenir(p.id, t);
  }
  const pres = (id: Id, P: Vec3, tol: number): void => {
    if (ecartRayonPointLibre(r, P) <= tol) retenir(id, Math.max(0, dot(sub(P, r.origine), V)));
  };
  for (const c of Object.values(a.cotes)) pres(c.id, c.position, tolerance * 3);
  for (const t of Object.values(a.textes)) {
    if (t.genre === "repere") pres(t.id, t.position, tolerance * 3);
    // Texte écran : étiquette posée en pixels depuis son coin haut gauche ; le clic la vise dans une boîte de 160 × 28 px.
    else if (ecran && ecran.x >= t.ecran.x - 4 && ecran.x <= t.ecran.x + 160 && ecran.y >= t.ecran.y - 4 && ecran.y <= t.ecran.y + 28) retenir(t.id, 1e-6);
  }
  for (const g of Object.values(a.guides)) {
    if (g.genre === "point") pres(g.id, g.origine, tolerance * 2);
    else {
      const d = g.genre === "ligne" ? g.direction : normalize(sub(g.fin, g.origine));
      const L = g.genre === "ligne" ? 1e4 : dist(g.fin, g.origine);
      const x = ecartRayonSegment(r, g.genre === "ligne" ? sub(g.origine, scale(d, L)) : g.origine, add(g.origine, scale(d, L)));
      if (x.d <= tolerance) retenir(g.id, x.t);
    }
  }
  return meilleur ? (meilleur as { id: Id }).id : null;
}

/** Écart entre un rayon et un segment, et abscisse du point le plus proche le long du rayon. */
function ecartRayonSegment(r: Rayon, A: Vec3, B: Vec3): { d: number; t: number } {
  const V = normalize(r.direction);
  const d2 = sub(B, A);
  const w = sub(r.origine, A);
  const e = dot(d2, d2);
  const b = dot(V, d2);
  const c = dot(V, w);
  const f = dot(d2, w);
  const den = e - b * b;
  let s = den > EPS * Math.max(1, e) ? (b * f - c * e) / den : 0;
  s = Math.max(0, s);
  let t = e > EPS ? (f + b * s) / e : 0;
  t = Math.min(1, Math.max(0, t));
  s = Math.max(0, t * b - c);
  const P = add(r.origine, scale(V, s));
  const Q = add(A, scale(d2, t));
  return { d: dist(P, Q), t: s };
}

function dansPolygone(x: number, y: number, poly: readonly Point2[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Point2;
    const b = poly[j] as Point2;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Abscisse le long du rayon de son intersection avec la face, ou null. */
function rayonFace(r: Rayon, f: Extract<ElementScene, { genre: "face" }>): number | null {
  const p0 = f.exterieur[0];
  if (!p0) return null;
  const V = normalize(r.direction);
  const den = dot(f.normale, V);
  if (Math.abs(den) < EPS) return null;
  const t = dot(f.normale, sub(p0, r.origine)) / den;
  if (t <= 0) return null;
  const X = add(r.origine, scale(V, t));
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (q: Vec3): Point2 => ({ x: dot(q, u), y: dot(q, w) });
  const c = p2(X);
  if (!dansPolygone(c.x, c.y, f.exterieur.map(p2))) return null;
  if (f.trous.some((b) => dansPolygone(c.x, c.y, b.map(p2)))) return null;
  return t;
}

/**
 * Élément visé par le rayon : l'arête la plus proche dans la tolérance, sauf si une face est nettement devant elle ;
 * sinon la face touchée la plus proche. `filtreArete` écarte des arêtes (masquées, adoucies…).
 */
export function viser(
  m: Modele,
  r: Rayon,
  tolerance: number,
  filtreArete: (a: Extract<ElementScene, { genre: "arete" }>) => boolean = (a) => !a.masquee && !a.adoucie,
): ElementScene | null {
  let arete: { el: ElementScene; d: number; t: number } | null = null;
  let face: { el: ElementScene; t: number } | null = null;
  for (const el of scene(m)) {
    if (el.genre === "arete") {
      if (!filtreArete(el)) continue;
      const x = ecartRayonSegment(r, el.a, el.b);
      if (x.d <= tolerance && (!arete || x.d < arete.d - 1e-12)) arete = { el, d: x.d, t: x.t };
    } else {
      const t = rayonFace(r, el);
      if (t !== null && (!face || t < face.t)) face = { el, t };
    }
  }
  if (arete && (!face || face.t >= arete.t - tolerance)) return arete.el;
  return face ? face.el : null;
}

export type Cible = { readonly genre: "arete" | "face" | "occurrence"; readonly id: Id };

/** Ce que l'élément représente dans le contexte d'édition `dans` ; `null` s'il est hors de ce contexte. */
export function cibleDans(el: ElementScene, dans: Id | undefined): Cible | null {
  const k = dans === undefined ? 0 : el.chemin.indexOf(dans) + 1;
  if (dans !== undefined && k === 0) return null;
  if (el.chemin.length === k) return { genre: el.genre, id: el.id };
  return { genre: "occurrence", id: el.chemin[k] as Id };
}

/** Chemin d'occurrences (racine → occurrence comprise) ; vide si introuvable. */
export function cheminOccurrence(m: Modele, occ: Id): Id[] {
  const chercher = (c: Contexte, ch: Id[]): Id[] | null => {
    if (ch.length > 32) return null;
    for (const o of Object.values(c.occurrences)) {
      if (o.id === occ) return [...ch, o.id];
      const d = m.definitions[o.definition];
      const r = d ? chercher(d.contenu, [...ch, o.id]) : null;
      if (r) return r;
    }
    return null;
  };
  return chercher(m.racine, []) ?? [];
}

/** Conversion d'un point monde vers le repère du contexte d'édition (identité à la racine). */
export function versContexteEdition(ctx: ContexteOutil): (p: Vec3) => Vec3 {
  if (ctx.dans === undefined) return (p) => p;
  const M = matriceMonde(ctx.modele, ctx.dans);
  const inv = M ? inverserMatrice(M) : null;
  return inv ? (p) => appliquer(inv, p) : (p) => p;
}

export const optionsDans = (ctx: ContexteOutil): { dans?: Id } => (ctx.dans !== undefined ? { dans: ctx.dans } : {});

/**
 * Ids rendus par le rendu (cadre, contour) ramenés au contexte d'édition : entité interne → son occurrence ;
 * courbe : en fenêtre seulement si toutes ses arêtes sont dedans, en croisée dès qu'une arête est touchée.
 */
export function normaliserIds(m: Modele, dans: Id | undefined, ids: readonly Id[], genre: "fenetre" | "croisee"): Id[] {
  const c = contexte(m, dans);
  const entree = new Set(ids);
  const r = new Set<Id>();
  const chemins = new Map<Id, readonly Id[]>();
  for (const el of scene(m)) if (!chemins.has(el.id)) chemins.set(el.id, el.chemin);
  for (const id of ids) {
    if (c.aretes[id]) {
      const k = aretesDeLaCourbe(m, id, dans !== undefined ? { dans } : {});
      if (genre === "croisee" || k.every((x) => entree.has(x))) for (const x of k) r.add(x);
    } else if (c.faces[id] || c.occurrences[id]) r.add(id);
    else {
      const ch = chemins.get(id) ?? cheminOccurrence(m, id);
      const k = dans === undefined ? 0 : ch.indexOf(dans) + 1;
      if ((dans === undefined || k > 0) && ch.length > k) r.add(ch[k] as Id);
    }
  }
  return [...r];
}

export interface Modificateurs {
  readonly maj: boolean;
  readonly ctrl: boolean;
}

/** Sans modificateur : remplace ; Ctrl : ajoute ; Maj : bascule (l'ensemble visé comme une unité) ; Maj + Ctrl : retire. */
export function combiner(courante: readonly Id[], ids: readonly Id[], mod: Modificateurs): Id[] {
  if (!mod.maj && !mod.ctrl) return [...ids];
  const s = new Set(courante);
  const retirer = (mod.maj && mod.ctrl) || (mod.maj && ids.length > 0 && ids.every((x) => s.has(x)));
  for (const x of ids) {
    if (retirer) s.delete(x);
    else s.add(x);
  }
  return [...s];
}

// ————————————————————————————————————————————————————————————— Poignées d'extrémité

export interface Poignee {
  /** Sommet du contexte d'édition. */
  readonly sommet: Id;
  /** Position monde. */
  readonly point: Vec3;
}

/** Conversion du repère du contexte d'édition vers le monde (identité à la racine). */
function versMonde(ctx: ContexteOutil): (p: Vec3) => Vec3 {
  if (ctx.dans === undefined) return (p) => p;
  const M = matriceMonde(ctx.modele, ctx.dans);
  return M ? (p) => appliquer(M, p) : (p) => p;
}

/** Extrémités (sommets) des arêtes sélectionnées du contexte d'édition, en coordonnées monde, sans doublon. */
export function poignees(ctx: ContexteOutil): Poignee[] {
  const c = contexte(ctx.modele, ctx.dans);
  const W = versMonde(ctx);
  const vus = new Set<Id>();
  const r: Poignee[] = [];
  for (const id of ctx.selection) {
    const a = c.aretes[id];
    if (!a) continue;
    for (const s of [a.a, a.b]) {
      if (vus.has(s)) continue;
      const som = c.sommets[s];
      if (!som) continue;
      vus.add(s);
      r.push({ sommet: s, point: W(som.position) });
    }
  }
  return r;
}

/** Écart entre un rayon et un point. */
function ecartRayonPoint(r: Rayon, P: Vec3): number {
  const V = normalize(r.direction);
  const s = Math.max(0, dot(sub(P, r.origine), V));
  return dist(add(r.origine, scale(V, s)), P);
}

/** Poignée visée par le rayon (la plus proche dans une tolérance élargie, cible au doigt), ou `null`. */
export function poigneeVisee(ctx: ContexteOutil, r: Rayon, tolerance: number): Poignee | null {
  let meilleure: { p: Poignee; d: number } | null = null;
  for (const p of poignees(ctx)) {
    const d = ecartRayonPoint(r, p.point);
    if (d <= tolerance * 1.5 && (!meilleure || d < meilleure.d)) meilleure = { p, d };
  }
  return meilleure ? meilleure.p : null;
}

/** Glisser d'une poignée en cours. */
export interface GlisserPoignee {
  readonly sommet: Id;
  /** Position monde d'origine. */
  readonly depuis: Vec3;
  /**
   * Autre extrémité (monde) de l'arête sélectionnée dont on glisse le sommet : l'inférence part de là, c'est le
   * segment dans sa future position qui s'aligne sur les axes (« Sur l'axe vert » = le segment est sur l'axe vert).
   */
  readonly ancre: Vec3;
  /** Position monde courante (inférée). */
  readonly courant: Vec3;
  readonly inference: Inference | null;
}

// ————————————————————————————————————————————————————————————— Machine Sélection

export interface EtatSelection {
  readonly maj: boolean;
  readonly ctrl: boolean;
  /** Position écran de l'appui en cours. */
  readonly appui: Point2 | null;
  /** Cadre en cours (après un glisser au-delà du seuil). */
  readonly cadre: { readonly de: Point2; readonly a: Point2 } | null;
  /** Le clic qui suit le relâchement d'un cadre est ignoré. */
  readonly ignorerClic: boolean;
  /** Poignée d'extrémité en cours de glisser. */
  readonly poignee: GlisserPoignee | null;
}

/** Aperçu du glisser d'une poignée : chaque arête du sommet, de son autre extrémité au point courant. */
function lignesPoignee(ctx: ContexteOutil, g: GlisserPoignee): Vec3[][] {
  const c = contexte(ctx.modele, ctx.dans);
  const W = versMonde(ctx);
  const r: Vec3[][] = [];
  for (const a of Object.values(c.aretes)) {
    const autre = a.a === g.sommet ? a.b : a.b === g.sommet ? a.a : null;
    if (!autre) continue;
    const s = c.sommets[autre];
    if (s) r.push([W(s.position), g.courant]);
  }
  return r;
}

/** Autre extrémité (monde) de la première arête sélectionnée portant le sommet ; à défaut, le sommet lui-même. */
function ancreDe(ctx: ContexteOutil, p: Poignee): Vec3 {
  const c = contexte(ctx.modele, ctx.dans);
  const W = versMonde(ctx);
  for (const id of ctx.selection) {
    const a = c.aretes[id];
    if (!a) continue;
    const autre = a.a === p.sommet ? a.b : a.b === p.sommet ? a.a : null;
    const s = autre ? c.sommets[autre] : undefined;
    if (s) return W(s.position);
  }
  return p.point;
}

const CONSIGNE_POIGNEE = "Glissez l'extrémité ; relâchez pour la poser (Échap : annuler).";

const genreCadre = (de: Point2, a: Point2): "fenetre" | "croisee" => (a.x >= de.x ? "fenetre" : "croisee");

/** Ids sélectionnés par un clic (simple, double, triple) sur une cible, ou entrée dans un contexte. */
export function idsDuClic(m: Modele, dans: Id | undefined, c: Cible, nombre: 1 | 2 | 3): Id[] {
  const o = dans !== undefined ? { dans } : {};
  if (c.genre === "occurrence") return [c.id];
  if (nombre === 3) return entitesConnectees(m, c.id, o);
  if (c.genre === "face") return nombre === 2 ? [c.id, ...aretesDeFace(m, c.id, o)] : [c.id];
  const k = aretesDeLaCourbe(m, c.id, o);
  if (nombre === 1) return k;
  const faces = new Set<Id>();
  for (const a of k) for (const f of facesDeLArete(m, a, o)) faces.add(f);
  return [...k, ...faces];
}

/** Clic de sélection (partagé avec le Lasso) : transition de sélection / contexte. */
export function clicSelection<E>(etat: E, ev: Extract<EvenementOutil, { genre: "clic" }>, ctx: ContexteOutil, mod: Modificateurs): Transition<E> {
  const nombre: 1 | 2 | 3 = ev.triple ? 3 : ev.double ? 2 : 1;
  const el = viser(ctx.modele, ev.rayon, ev.tolerance);
  const c = el ? cibleDans(el, ctx.dans) : null;
  if (!c) {
    // Annotation (plan de coupe, cote, texte, guide) : sélectionnée comme une entité (Suppr l'efface).
    const an = viserAnnotation(ctx.modele, ev.rayon, ev.tolerance, ev.ecran);
    if (an) return { etat, selection: combiner(ctx.selection, [an], mod) };
    // Vide, ou hors du contexte d'édition : sortir du contexte (obs indirect) et tout désélectionner.
    if (ctx.dans !== undefined) {
      const ch = cheminOccurrence(ctx.modele, ctx.dans);
      return { etat, dans: ch.length >= 2 ? (ch[ch.length - 2] as Id) : null, selection: [] };
    }
    return mod.maj || mod.ctrl ? { etat } : { etat, selection: [] };
  }
  if (c.genre === "occurrence" && nombre === 2 && !mod.maj && !mod.ctrl) return { etat, dans: c.id, selection: [] };
  return { etat, selection: combiner(ctx.selection, idsDuClic(ctx.modele, ctx.dans, c, nombre), mod) };
}

function modificateur(etat: EtatSelection, ev: Extract<EvenementOutil, { genre: "touche" }>): EtatSelection {
  const bas = ev.etat === "enfoncee";
  if (ev.touche === "Maj") return { ...etat, maj: bas };
  if (ev.touche === "Ctrl") return { ...etat, ctrl: bas };
  return etat;
}

export const machineSelection: MachineOutil<EtatSelection> = {
  id: "selection",
  initial: () => ({ maj: false, ctrl: false, appui: null, cadre: null, ignorerClic: false, poignee: null }),

  traiter(etat, ev, ctx): Transition<EtatSelection> {
    switch (ev.genre) {
      case "touche": {
        if (ev.touche === "Suppr" && ev.etat === "enfoncee") {
          if (ctx.selection.length === 0) return { etat };
          const r = effacerEntites(ctx.modele, ctx.selection, optionsDans(ctx));
          return { etat, modele: r.modele, selection: [], operation: "Effacer" };
        }
        return { etat: modificateur(etat, ev) };
      }
      case "survol":
        return etat.ignorerClic ? { etat: { ...etat, ignorerClic: false } } : { etat };
      case "appui": {
        const p = poigneeVisee(ctx, ev.rayon, ev.tolerance);
        const poignee: GlisserPoignee | null = p ? { sommet: p.sommet, depuis: p.point, ancre: ancreDe(ctx, p), courant: p.point, inference: null } : null;
        return { etat: { ...etat, appui: ev.ecran, cadre: null, ignorerClic: false, poignee } };
      }
      case "glisser": {
        if (!etat.appui) return { etat };
        if (etat.poignee) {
          const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), depart: etat.poignee.ancre, ...(ctx.repere ? { axes: ctx.repere } : {}) });
          return { etat: { ...etat, poignee: { ...etat.poignee, courant: i.point, inference: i } } };
        }
        if (!etat.cadre && distance2(etat.appui, ev.ecran) <= SEUIL_GLISSER) return { etat };
        return { etat: { ...etat, cadre: { de: etat.appui, a: ev.ecran } } };
      }
      case "relache": {
        if (etat.poignee) {
          const g = etat.poignee;
          const suite: EtatSelection = { ...etat, appui: null, cadre: null, poignee: null, ignorerClic: true };
          if (dist(g.courant, g.depuis) <= TOL) return { etat: suite };
          const L = versContexteEdition(ctx);
          const v = sub(L(g.courant), L(g.depuis));
          try {
            const r = deplacer(ctx.modele, [g.sommet], v, optionsDans(ctx));
            return { etat: suite, modele: r.modele, selection: ctx.selection, operation: "Déplacer un point" };
          } catch {
            return { etat: suite };
          }
        }
        const cadre = etat.cadre ? { de: etat.cadre.de, a: ev.ecran } : null;
        const suite: EtatSelection = { ...etat, appui: null, cadre: null, ignorerClic: cadre !== null };
        if (!cadre) return { etat: suite };
        const genre = genreCadre(cadre.de, cadre.a);
        const bruts = ctx.entitesDansCadre?.(cadre.de, cadre.a, genre) ?? [];
        const ids = normaliserIds(ctx.modele, ctx.dans, bruts, genre);
        return { etat: suite, selection: combiner(ctx.selection, ids, etat) };
      }
      case "clic":
        if (etat.ignorerClic) return { etat: { ...etat, ignorerClic: false } };
        return clicSelection(etat, ev, ctx, etat);
      case "echap": {
        if (etat.cadre || etat.appui || etat.poignee) return { etat: { ...etat, appui: null, cadre: null, poignee: null } };
        if (ctx.dans !== undefined) {
          const ch = cheminOccurrence(ctx.modele, ctx.dans);
          return { etat, dans: ch.length >= 2 ? (ch[ch.length - 2] as Id) : null, selection: [] };
        }
        return { etat, selection: [] };
      }
      case "saisie":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const e = etapeCatalogue("selection", 0);
    const g = etat.poignee;
    // Poignées : extrémités des arêtes sélectionnées ; pendant le glisser, celle qui bouge suit le curseur.
    const points = poignees(ctx).map((p) => (g && p.sommet === g.sommet ? g.courant : p.point));
    return {
      consigne: g ? CONSIGNE_POIGNEE : (e.consigne ?? ""),
      mesures: mesuresVides(e, ctx),
      inference: g?.inference ?? null,
      apercu: {
        lignes: g ? lignesPoignee(ctx, g) : [],
        faces: [],
        ...(etat.cadre ? { cadre: { de: etat.cadre.de, a: etat.cadre.a, genre: genreCadre(etat.cadre.de, etat.cadre.a) } } : {}),
        ...(points.length > 0 ? { points } : {}),
        ...(g ? { pointilles: [[g.depuis, g.courant]] } : {}),
      },
      selection: ctx.selection,
      // Aucune pré-surbrillance au survol (obs).
      survol: [],
      erreur: null,
    };
  },
};

// ————————————————————————————————————————————————————————————— Sélectionner ▸ (menu contextuel, lot 5)

export type ModeSelectionEtendue = "aretes-bordantes" | "faces-connectees" | "tout-connecte" | "meme-balise" | "meme-materiau" | "deselectionner-faces" | "inverser" | "tout";

/** Sous-menu « Sélectionner ▸ » du menu contextuel (§5.8) : nouvelle sélection à partir de la sélection courante. */
export function etendreSelection(m: Modele, selection: readonly Id[], mode: ModeSelectionEtendue, dans?: Id): Id[] {
  const c = contexte(m, dans);
  const visibles = (ids: Iterable<Id>): Id[] => [...ids].filter((id) => !(c.faces[id]?.masquee || c.aretes[id]?.masquee || c.occurrences[id]?.masquee));
  const tout = visibles([...Object.keys(c.faces), ...Object.keys(c.aretes), ...Object.keys(c.occurrences)]);
  const sel = new Set(selection.filter((id) => c.faces[id] || c.aretes[id] || c.occurrences[id]));
  switch (mode) {
    case "tout":
      return tout;
    case "inverser":
      return tout.filter((id) => !sel.has(id));
    case "deselectionner-faces":
      return [...sel].filter((id) => !c.faces[id]);
    case "aretes-bordantes": {
      const r = new Set(sel);
      for (const id of sel) {
        const f = c.faces[id];
        if (f) for (const a of aretesDeFace(m, id, dans !== undefined ? { dans } : {})) r.add(a);
      }
      return visibles(r);
    }
    case "faces-connectees": {
      const r = new Set(sel);
      for (const id of sel) if (c.faces[id] || c.aretes[id]) for (const e of entitesConnectees(m, id, dans !== undefined ? { dans } : {})) if (c.faces[e]) r.add(e);
      return visibles(r);
    }
    case "tout-connecte": {
      const r = new Set(sel);
      for (const id of sel) if (c.faces[id] || c.aretes[id]) for (const e of entitesConnectees(m, id, dans !== undefined ? { dans } : {})) r.add(e);
      return visibles(r);
    }
    case "meme-balise": {
      const balises = new Set([...sel].map((id) => c.occurrences[id]?.balise ?? null));
      return visibles(Object.values(c.occurrences).filter((o) => balises.has(o.balise ?? null)).map((o) => o.id));
    }
    case "meme-materiau": {
      const mats = new Set([...sel].map((id) => c.faces[id]?.materiauRecto ?? c.occurrences[id]?.materiau ?? null));
      const r: Id[] = [];
      for (const f of Object.values(c.faces)) if (mats.has(f.materiauRecto ?? null)) r.push(f.id);
      for (const o of Object.values(c.occurrences)) if (mats.has(o.materiau ?? null)) r.push(o.id);
      return visibles(r);
    }
  }
}
