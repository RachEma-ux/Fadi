/**
 * Outil Pousser/Tirer (cahier-planche §4.15, relevé outils-modification §1) — machine pure.
 *
 * Étape 1 : clic sur une face (elle devient la sélection). Étape 2 : la face suit le curseur SELON SA NORMALE (inférence
 * « Extrémité » sur un sommet existant) ; un 2ᵉ clic ou une distance + Entrée applique. Distance > 0 = sens de la
 * normale (tirer), < 0 = sens inverse (pousser). Après : étape 1 ; une distance tapée juste après CORRIGE l'extrusion
 * (un seul pas d'annulation) ; double-clic sur une autre face = répéter la dernière distance. Ctrl : nouvelle face de
 * départ ; Alt : mode étirement (bascule sans effet géométrique distinct sur des solides orthogonaux, relevé). Échap
 * pendant le tirage : retour à l'étape 1, sélection vidée.
 *
 * Écart propre à Fadi (D-196) : un clic sur une ARÊTE (segment, arête d'un cercle, d'un polygone, d'un arc ; ou l'une des
 * arêtes présélectionnées) l'étend en SURFACE — l'arête balaie le déplacement visé, libre avec inférence (axes, sommets),
 * verrouillable par les flèches (→ rouge, ← vert, ↑ bleu) ; distance tapée = longueur dans la direction du curseur ou de
 * l'axe verrouillé ; Alt = des deux côtés. Mêmes gestes ensuite que pour une face : correction par une distance tapée,
 * double-clic sur une autre arête = répéter, Échap.
 */
import { type Id, ERREUR_ETIRER_ISOLEE, allongerArete, aretesDeLaCourbe, contexte, couronne, etirerAretes, etirerFace, faceAVoisines, newell, pousserTirer, tuberFace } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, add, cross, dist, dot, egal, len, normalize, scale, sub } from "../vecteur.js";
import {
  type Apercu,
  type Derniere,
  contexteSaisie,
  corrigeable,
  formaterLongueur,
  intersectionRayonPlan,
  inferenceBrute,
  mesures,
  messageErreur,
  prefixe,
} from "./commun-formes.js";
import {
  VECTEUR_AXE,
  apercuPrisme,
  axeDeToucheFleche,
  consigneDe,
  enLocal,
  idsSelectionnables,
  libelleMesuresDe,
  selectionValide,
  vueModif,
  viseeElement,
  type VerrouFleche,
} from "./commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, OptionOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { type Cible, idsDuClic, optionsDans, scene } from "./selection.js";

export const ID_POUSSER_TIRER = "pousser-tirer";

/** Consignes du mode arêtes (écart Fadi, D-196 : absentes du relevé SketchUp). */
export const CONSIGNE_ARETE_SURVOL = "Cliquez sur l'arête à étendre en surface. | Alt = Des deux côtés.";
/** Consignes de la surface ouverte (mode « Surface ouverte » de la barre d'options, ex-« tube sans fond », écart Fadi D-199, D-201, D-202). */
export const CONSIGNE_TUBE_FACE = "Surface ouverte : cliquez sur la face dont le contour sera tiré (un cercle donne un tube sans fond).";
export const CONSIGNE_TUBE_TIRAGE = "Surface ouverte : cliquez pour fixer la hauteur ou saisissez la distance — aucune face n'est ajoutée aux extrémités.";
export const CONSIGNE_ARETE_TIRAGE =
  "Cliquez pour fixer la surface ou saisissez la distance. | Flèches = Verrouiller un axe. | ↓ = Le long de l'arête (allonger). | Alt = Des deux côtés.";

type ParamsPT =
  | { readonly genre: "face"; readonly face: Id; readonly distance: number; readonly nouvelleFace: boolean; readonly sansFond?: boolean; readonly etirement?: boolean }
  /** `vecteur` dans le repère du contexte d'édition. */
  | { readonly genre: "aretes"; readonly aretes: readonly Id[]; readonly vecteur: Vec3; readonly symetrique: boolean }
  /** Courbe fermée tirée dans son plan : `distance` > 0 vers l'extérieur. */
  | { readonly genre: "couronne"; readonly aretes: readonly Id[]; readonly distance: number; readonly symetrique: boolean }
  /** Ligne tirée dans son propre sens : `longueur` > 0 allonge. */
  | { readonly genre: "allonger"; readonly arete: Id; readonly extremite: Id; readonly longueur: number };

type ParamsArete = Exclude<ParamsPT, { genre: "face" }>;

/** Contour plan fermé des arêtes visées (monde) : normale, centre, et normale extérieure du segment cliqué. */
interface Boucle {
  readonly normale: Vec3;
  readonly centre: Vec3;
  readonly exterieur: Vec3;
}

/** Arête droite seule visée : extrémité la plus proche du clic (id du contexte) et direction monde vers elle. */
interface Droite {
  readonly arete: Id;
  readonly extremite: Id;
  readonly direction: Vec3;
}

interface Segment {
  readonly a: Vec3;
  readonly b: Vec3;
}

export interface EtatPousserTirer {
  readonly etape: 1 | 2;
  /** Ctrl : nouvelle face de départ. */
  readonly nouvelleFace: boolean;
  /** Alt : mode étirement (bascule). */
  readonly etirement: boolean;
  /** Maj sur une face (écart Fadi) : tube sans fond — la face disparaît, son contour est tiré. */
  readonly sansFond: boolean;
  readonly face: Id | null;
  /** Mode arêtes (écart Fadi) : arêtes étendues, leurs segments monde (aperçu), vecteur monde visé. */
  readonly aretes: readonly Id[];
  readonly segments: readonly Segment[];
  readonly vecteur: Vec3 | null;
  /** Alt en mode arêtes : des deux côtés. */
  readonly symetrique: boolean;
  readonly fleche: VerrouFleche | null;
  readonly survolArete: Id | null;
  readonly boucle: Boucle | null;
  readonly droite: Droite | null;
  /** Normale monde de la face et point cliqué sur elle. */
  readonly normale: Vec3 | null;
  readonly origine: Vec3 | null;
  /** Contour monde de la face (aperçu). */
  readonly contour: readonly Vec3[];
  readonly survol: Id | null;
  readonly distance: number;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsPT> | null;
}

function initial(): EtatPousserTirer {
  return {
    etape: 1,
    nouvelleFace: false,
    etirement: false,
    sansFond: false,
    face: null,
    aretes: [],
    segments: [],
    vecteur: null,
    symetrique: false,
    fleche: null,
    survolArete: null,
    boucle: null,
    droite: null,
    normale: null,
    origine: null,
    contour: [],
    survol: null,
    distance: 0,
    inference: null,
    texte: null,
    erreur: null,
    derniere: null,
  };
}

const retour = (e: EtatPousserTirer): EtatPousserTirer => ({
  ...e,
  etape: 1,
  face: null,
  aretes: [],
  segments: [],
  vecteur: null,
  fleche: null,
  boucle: null,
  droite: null,
  normale: null,
  origine: null,
  contour: [],
  distance: 0,
  inference: null,
});

/** Distance signée le long de la normale visée par le rayon, avec l'inférence (accrochage sur les sommets existants). */
function viseeDistance(e: EtatPousserTirer, ctx: ContexteOutil, r: Rayon, tolerance: number): { distance: number; inference: Inference } {
  const n = e.normale as Vec3;
  const o = e.origine as Vec3;
  const i = inferer({ rayon: r, tolerance, geometrie: geometrieVisible(ctx.modele), depart: o, verrou: { genre: "direction", direction: n, type: "parallele" }, ...(ctx.repere ? { axes: ctx.repere } : {}) });
  return { distance: dot(n, sub(i.point, o)), inference: i };
}

function appliquer(
  e: EtatPousserTirer,
  ctx: ContexteOutil,
  face: Id,
  distance: number,
  texte: string | null,
  remplace: Derniere<ParamsPT> | null,
): Transition<EtatPousserTirer> {
  if (Math.abs(distance) < EPS) return { etat: { ...retour(e), texte, erreur: "Distance nulle : rien n'a été poussé ni tiré." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const prec = remplace?.params.genre === "face" ? remplace.params : null;
    const sansFond = prec ? prec.sansFond === true : e.sansFond;
    const etirement = prec ? prec.etirement === true : e.etirement;
    const r = sansFond
      ? tuberFace(base, face, distance, optionsDans(ctx))
      : etirement
        ? etirerFace(base, face, distance, optionsDans(ctx))
        : pousserTirer(base, face, distance, { ...optionsDans(ctx), nouvelleFace: e.nouvelleFace });
    const encore = contexte(r.modele, ctx.dans).faces[face] !== undefined;
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: { genre: "face", face, distance, nouvelleFace: e.nouvelleFace, ...(sansFond ? { sansFond: true } : {}), ...(etirement ? { etirement: true } : {}) } } },
      modele: r.modele,
      selection: encore && !sansFond ? [face] : idsSelectionnables(r.rapport.crees).filter((id) => id.startsWith("f")),
      operation: "Pousser/Tirer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

// ————————————————————————————————————————————————————————————— Mode arêtes (écart Fadi, D-196)

/** Arêtes visées par un clic : la présélection d'arêtes si l'arête cliquée en fait partie, sinon l'arête (ou sa courbe). */
function aretesDuClic(ctx: ContexteOutil, cible: Cible): Id[] {
  const o = optionsDans(ctx);
  const sel = selectionValide(ctx);
  const c = contexte(ctx.modele, ctx.dans);
  const seulementAretes = sel.length > 0 && sel.every((id) => c.aretes[id] !== undefined);
  const base = seulementAretes && sel.includes(cible.id) ? sel : idsDuClic(ctx.modele, ctx.dans, cible, 1);
  return [...new Set(base.flatMap((id) => (c.aretes[id] ? aretesDeLaCourbe(ctx.modele, id, o) : [])))];
}

/** Segments monde des arêtes (aperçu). */
function segmentsMonde(ctx: ContexteOutil, ids: readonly Id[]): Segment[] {
  const set = new Set(ids);
  const dans = (ch: readonly Id[]) => (ctx.dans === undefined ? ch.length === 0 : ch[ch.length - 1] === ctx.dans);
  return scene(ctx.modele).flatMap((el) => (el.genre === "arete" && set.has(el.id) && dans(el.chemin) ? [{ a: el.a, b: el.b }] : []));
}

/** Point d'arrivée visé (départ = point cliqué sur l'arête), avec inférence et verrou de flèche. */
function viseeVecteur(e: EtatPousserTirer, ctx: ContexteOutil, r: Rayon, tolerance: number): { vecteur: Vec3; inference: Inference } {
  const o = e.origine as Vec3;
  const v = e.fleche?.verrou;
  const i = inferer({ rayon: r, tolerance, geometrie: geometrieVisible(ctx.modele), depart: o, ...(v ? { verrou: v } : {}), ...(ctx.repere ? { axes: ctx.repere } : {}) });
  return { vecteur: sub(i.point, o), inference: i };
}

/** Direction d'une distance tapée : axe verrouillé (sens du curseur, sinon +axe), sinon direction du curseur. */
function directionSaisie(e: EtatPousserTirer, ctx: ContexteOutil): Vec3 | null {
  const v = e.vecteur;
  const fl = e.fleche?.verrou;
  if (fl && fl.genre === "axe") {
    // Axe du repère de dessin actif (Axes), sinon axe canonique.
    const a = ctx.repere ? normalize(ctx.repere[fl.axe]) : VECTEUR_AXE[fl.axe];
    return v && len(v) > TOL && dot(v, a) < 0 ? scale(a, -1) : a;
  }
  if (fl && fl.genre === "direction") {
    const d = normalize(fl.direction);
    return v && len(v) > TOL && dot(v, d) < 0 ? scale(d, -1) : d;
  }
  return v && len(v) > TOL ? normalize(v) : null;
}

/** Segment le plus proche d'un point. */
function plusProche(segments: readonly Segment[], p: Vec3): Segment | null {
  let best: Segment | null = null;
  let dmin = Infinity;
  for (const s of segments) {
    const ab = sub(s.b, s.a);
    const t = Math.max(0, Math.min(1, dot(sub(p, s.a), ab) / Math.max(dot(ab, ab), 1e-18)));
    const d = dist(add(s.a, scale(ab, t)), p);
    if (d < dmin) {
      dmin = d;
      best = s;
    }
  }
  return best;
}

/** Contour plan fermé formé par les segments (monde), avec la normale extérieure du segment le plus proche du clic. */
function boucleDe(segments: readonly Segment[], clic: Vec3): Boucle | null {
  if (segments.length < 3) return null;
  const cle = (p: Vec3) => `${p.x.toFixed(6)};${p.y.toFixed(6)};${p.z.toFixed(6)}`;
  const voisins = new Map<string, { p: Vec3; v: Vec3[] }>();
  for (const s of segments) {
    for (const [x, y] of [[s.a, s.b], [s.b, s.a]] as const) {
      const k = cle(x);
      const e = voisins.get(k) ?? { p: x, v: [] };
      e.v.push(y);
      voisins.set(k, e);
    }
  }
  if ([...voisins.values()].some((e) => e.v.length !== 2)) return null;
  const premier = segments[0] as Segment;
  const ordre: Vec3[] = [premier.a];
  let precedent = premier.a;
  let courant = premier.b;
  while (!egal(courant, premier.a) && ordre.length <= segments.length) {
    ordre.push(courant);
    const e = voisins.get(cle(courant));
    if (!e) return null;
    const suivant = egal(e.v[0] as Vec3, precedent) ? (e.v[1] as Vec3) : (e.v[0] as Vec3);
    precedent = courant;
    courant = suivant;
  }
  if (ordre.length !== segments.length) return null;
  const nw = newell(ordre);
  if (len(nw) < EPS) return null;
  const n = normalize(nw);
  if (ordre.some((p) => Math.abs(dot(n, sub(p, ordre[0] as Vec3))) > TOL)) return null;
  const centre = scale(ordre.reduce((a, p) => add(a, p), { x: 0, y: 0, z: 0 }), 1 / ordre.length);
  const s = plusProche(segments, clic) as Segment;
  let ext = normalize(cross(sub(s.b, s.a), n));
  if (dot(ext, sub(scale(add(s.a, s.b), 0.5), centre)) < 0) ext = scale(ext, -1);
  return { normale: n, centre, exterieur: ext };
}

/** Arête droite seule (hors courbe) : extrémité la plus proche du clic. */
function droiteDe(ctx: ContexteOutil, ids: readonly Id[], segments: readonly Segment[], clic: Vec3): Droite | null {
  if (ids.length !== 1 || segments.length !== 1) return null;
  const c = contexte(ctx.modele, ctx.dans);
  const a = c.aretes[ids[0] as Id];
  if (!a || a.courbe) return null;
  const s = segments[0] as Segment;
  const versA = dist(s.a, clic) <= dist(s.b, clic);
  const [E, F] = versA ? [s.a, s.b] : [s.b, s.a];
  // Extrémité du contexte : celle dont la position locale correspond à E.
  const L = enLocal(ctx).point(E);
  const pa = c.sommets[a.a]?.position;
  const extremite = pa && dist(pa, L) < dist(c.sommets[a.b]?.position ?? L, L) ? a.a : a.b;
  return { arete: a.id, extremite, direction: normalize(sub(E, F)) };
}

/** Ce que produit un déplacement monde `v` : allongement, couronne ou balayage. */
function paramsPour(e: EtatPousserTirer, ctx: ContexteOutil, v: Vec3): ParamsArete {
  const n = len(v);
  const parallele = e.fleche?.verrou.genre === "direction";
  if (e.droite && n > EPS && (parallele || len(cross(e.droite.direction, v)) < 1e-6 * n)) {
    return { genre: "allonger", arete: e.droite.arete, extremite: e.droite.extremite, longueur: dot(v, e.droite.direction) };
  }
  if (e.boucle && n > EPS && Math.abs(dot(e.boucle.normale, v)) < 1e-6 * n) {
    return { genre: "couronne", aretes: e.aretes, distance: dot(v, e.boucle.exterieur), symetrique: e.symetrique };
  }
  return { genre: "aretes", aretes: e.aretes, vecteur: enLocal(ctx).vecteur(e.origine as Vec3, v), symetrique: e.symetrique };
}

/** Même opération, à la nouvelle valeur (correction tapée juste après) ; le signe est conservé. */
function aValeur(p: ParamsArete, valeur: number): ParamsArete {
  if (p.genre === "aretes") return { ...p, vecteur: scale(normalize(p.vecteur), valeur) };
  if (p.genre === "couronne") return { ...p, distance: Math.sign(p.distance || 1) * valeur };
  return { ...p, longueur: Math.sign(p.longueur || 1) * valeur };
}

function appliquerAretes(
  e: EtatPousserTirer,
  ctx: ContexteOutil,
  p: ParamsArete,
  texte: string | null,
  remplace: Derniere<ParamsPT> | null,
): Transition<EtatPousserTirer> {
  const nulle = p.genre === "aretes" ? len(p.vecteur) < EPS : Math.abs(p.genre === "couronne" ? p.distance : p.longueur) < EPS;
  if (nulle) return { etat: { ...retour(e), texte, erreur: "Distance nulle : rien n'a été poussé ni tiré." } };
  const base = remplace ? remplace.avant : ctx.modele;
  const o = optionsDans(ctx);
  try {
    const r =
      p.genre === "aretes"
        ? etirerAretes(base, p.aretes, p.vecteur, { ...o, symetrique: p.symetrique })
        : p.genre === "couronne"
          ? couronne(base, p.aretes, p.distance, { ...o, symetrique: p.symetrique })
          : allongerArete(base, p.arete, p.extremite, p.longueur, o);
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: p } },
      modele: r.modele,
      selection: idsSelectionnables(r.rapport.crees).filter((id) => (p.genre === "allonger" ? id.startsWith("a") : id.startsWith("f"))),
      operation: "Pousser/Tirer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

/** Aperçu de l'allongement (segment prolongé) ou de la couronne (segments décalés dans le plan). */
function apercuSpecial(e: EtatPousserTirer, p: ParamsArete): Apercu | null {
  if (p.genre === "allonger" && e.droite) {
    const s = e.segments[0] as Segment;
    const E = dot(sub(s.a, s.b), e.droite.direction) > 0 ? s.a : s.b;
    return { lignes: [[E, add(E, scale(e.droite.direction, p.longueur))]], faces: [] };
  }
  if (p.genre === "couronne" && e.boucle) {
    const n = e.boucle.normale;
    const lignes: Vec3[][] = [];
    for (const s of e.segments) {
      let ext = normalize(cross(sub(s.b, s.a), n));
      if (dot(ext, sub(scale(add(s.a, s.b), 0.5), e.boucle.centre)) < 0) ext = scale(ext, -1);
      const d = scale(ext, p.distance);
      lignes.push([add(s.a, d), add(s.b, d)]);
      if (p.symetrique) lignes.push([sub(s.a, d), sub(s.b, d)]);
    }
    return { lignes, faces: [] };
  }
  return null;
}

/** Aperçu du tube sans fond : contour translaté, montants et faces latérales seulement (ni fond ni dessus). */
function apercuTube(contour: readonly Vec3[], dep: Vec3): Apercu {
  const p = apercuPrisme(contour, dep);
  const faces = contour.map((a, i) => {
    const b = contour[(i + 1) % contour.length] as Vec3;
    return [a, b, add(b, dep), add(a, dep)];
  });
  return { lignes: p.lignes, faces };
}

/** Aperçu : parallélogrammes balayés par les segments. */
function apercuAretes(segments: readonly Segment[], v: Vec3, symetrique: boolean): Apercu {
  const depart = symetrique ? scale(v, -1) : { x: 0, y: 0, z: 0 };
  const course = symetrique ? scale(v, 2) : v;
  const lignes: Vec3[][] = [];
  const faces: Vec3[][] = [];
  for (const s of segments) {
    const A0 = add(s.a, depart);
    const B0 = add(s.b, depart);
    const A1 = add(A0, course);
    const B1 = add(B0, course);
    lignes.push([A0, A1], [B0, B1], [A1, B1]);
    if (symetrique) lignes.push([A0, B0]);
    faces.push([A0, B0, B1, A1]);
  }
  return { lignes, faces };
}

function saisir(e: EtatPousserTirer, ctx: ContexteOutil, texte: string): Transition<EtatPousserTirer> {
  const res = analyserSaisie(texte, contexteSaisie("longueur", ctx));
  if (res.genre === "erreur") return { etat: { ...e, texte, erreur: res.message } };
  if (res.genre !== "longueur") return { etat: { ...e, texte, erreur: `Saisie « ${texte} » non reconnue.` } };
  if (e.etape === 2 && e.face) return appliquer(e, ctx, e.face, res.valeur, texte, null);
  if (e.etape === 2 && e.aretes.length > 0 && e.origine) {
    const d = directionSaisie(e, ctx);
    if (!d) return { etat: { ...e, texte, erreur: "Orientez le curseur (ou verrouillez un axe avec une flèche) pour donner la direction." } };
    // La valeur tapée est exacte ; le curseur ne donne que le genre d'opération et le sens.
    return appliquerAretes(e, ctx, aValeur(paramsPour(e, ctx, scale(d, res.valeur)), res.valeur), texte, null);
  }
  if (corrigeable(e.derniere, ctx)) {
    const d = e.derniere;
    if (d.params.genre === "face") return appliquer(e, ctx, d.params.face, res.valeur, texte, d);
    return appliquerAretes(e, ctx, aValeur(d.params, res.valeur), texte, d);
  }
  return { etat: { ...e, texte, erreur: "Cliquez d'abord sur la face ou l'arête à pousser ou à tirer." } };
}

// ————————————————————————————————————————————————————————————— Options explicites (lot Planche 8, D-201)

/** Modes d'une face : Normal (relevé), Nouvelle face (Ctrl, relevé), Étirement (Alt, relevé), Surface ouverte (D-199, renommée D-202). */
export type ModeFace = "normal" | "nouvelle-face" | "etirement" | "tube";
/** Modes d'une arête (écart Fadi) : Normal, Des deux côtés (Alt, D-196), Allonger (↓, D-197). */
export type ModeArete = "normal" | "deux-cotes" | "allonger";

const MODES_FACE: readonly ModeFace[] = ["normal", "nouvelle-face", "etirement", "tube"];
const MODES_ARETE: readonly ModeArete[] = ["normal", "deux-cotes", "allonger"];

export const modeFace = (e: EtatPousserTirer): ModeFace => (e.sansFond ? "tube" : e.etirement ? "etirement" : e.nouvelleFace ? "nouvelle-face" : "normal");
export const modeArete = (e: EtatPousserTirer): ModeArete => (e.fleche?.touche === "FlecheBas" ? "allonger" : e.symetrique ? "deux-cotes" : "normal");

export const ERREUR_ALLONGER_COURBE = "Allonger : seule une arête droite isolée peut être allongée.";

/** Un seul chemin pour choisir un mode : touche, bouton de la barre d'options ou bouton au toucher. */
function configurerPT(e: EtatPousserTirer, option: string, valeur: string): Transition<EtatPousserTirer> {
  if (option === "face" && (MODES_FACE as readonly string[]).includes(valeur)) {
    return { etat: { ...e, nouvelleFace: valeur === "nouvelle-face", etirement: valeur === "etirement", sansFond: valeur === "tube", erreur: null } };
  }
  if (option === "arete" && (MODES_ARETE as readonly string[]).includes(valeur)) {
    const sansAllonger = e.fleche?.touche === "FlecheBas" ? null : e.fleche;
    if (valeur === "allonger") {
      if (!(e.etape === 2 && e.aretes.length > 0)) return { etat: { ...e, erreur: "Allonger : cliquez d'abord sur l'arête à allonger." } };
      // Seule une arête droite isolée s'allonge : une courbe ou un contour donnerait une couronne ou une surface.
      if (!e.droite) return { etat: { ...e, erreur: ERREUR_ALLONGER_COURBE } };
      const s = plusProche(e.segments, e.origine as Vec3);
      if (!s) return { etat: e };
      // Modes exclusifs : Allonger efface « Des deux côtés », qui ne revient pas après l'opération.
      return { etat: { ...e, symetrique: false, fleche: { touche: "FlecheBas", verrou: { genre: "direction", direction: normalize(sub(s.b, s.a)), type: "parallele" } }, erreur: null } };
    }
    return { etat: { ...e, symetrique: valeur === "deux-cotes", fleche: sansAllonger, erreur: null } };
  }
  return { etat: e };
}

/** Options affichées : les modes de face hors d'une arête, les modes d'arête sur une arête ; un mode hors de propos est grisé. */
function optionsPT(e: EtatPousserTirer, ctx: ContexteOutil): OptionOutil[] {
  const surArete = e.etape === 2 ? e.aretes.length > 0 : e.survolArete !== null;
  const tirageArete = e.etape === 2 && e.aretes.length > 0;
  // Face visée (survolée ou cliquée) sans voisine dans le contexte courant : Étirement grisé (suite du lot 8).
  const visee = e.etape === 2 ? e.face : e.survol;
  const isolee = visee !== null && !faceAVoisines(ctx.modele, visee, ctx.dans);
  return [
    {
      id: "face",
      valeur: modeFace(e),
      valeurs: [
        { id: "normal", disponible: !surArete },
        { id: "nouvelle-face", disponible: !surArete, raccourci: "Ctrl" },
        { id: "etirement", disponible: !surArete && !isolee, raccourci: "Alt" },
        { id: "tube", disponible: !surArete },
      ],
    },
    {
      id: "arete",
      valeur: modeArete(e),
      valeurs: [
        { id: "normal", disponible: surArete },
        { id: "deux-cotes", disponible: surArete, raccourci: "Alt" },
        { id: "allonger", disponible: tirageArete && e.droite !== null, raccourci: "↓" },
      ],
    },
  ];
}

/** Aperçu de l'étirement : la face à sa nouvelle place et le trajet de ses sommets (pas de faces latérales). */
function apercuEtirement(contour: readonly Vec3[], dep: Vec3): Apercu {
  const haut = contour.map((p) => add(p, dep));
  return { lignes: [[...haut, haut[0] as Vec3], ...contour.map((p, i) => [p, haut[i] as Vec3])], faces: [haut] };
}

export const machinePousserTirer: MachineOutil<EtatPousserTirer> = {
  id: ID_POUSSER_TIRER,
  initial,

  traiter(etat, ev: EvenementOutil, ctx): Transition<EtatPousserTirer> {
    switch (ev.genre) {
      case "survol": {
        if (etat.etape === 2 && etat.aretes.length > 0 && etat.origine) {
          const v = viseeVecteur(etat, ctx, ev.rayon, ev.tolerance);
          return { etat: { ...etat, vecteur: v.vecteur, inference: v.inference, texte: null, erreur: null } };
        }
        if (etat.etape === 2 && etat.normale && etat.origine) {
          const v = viseeDistance(etat, ctx, ev.rayon, ev.tolerance);
          return { etat: { ...etat, distance: v.distance, inference: v.inference, texte: null, erreur: null } };
        }
        const { el, cible } = viseeElement(ctx, ev);
        return {
          etat: {
            ...etat,
            survol: cible?.genre === "face" ? cible.id : null,
            survolArete: el?.genre === "arete" && cible?.genre === "arete" ? cible.id : null,
            texte: null,
            erreur: null,
          },
        };
      }
      case "clic": {
        if (etat.etape === 2 && etat.face) {
          const v = viseeDistance(etat, ctx, ev.rayon, ev.tolerance);
          return appliquer(etat, ctx, etat.face, v.distance, null, null);
        }
        if (etat.etape === 2 && etat.aretes.length > 0 && etat.origine) {
          const v = viseeVecteur(etat, ctx, ev.rayon, ev.tolerance);
          return appliquerAretes({ ...etat, inference: v.inference }, ctx, paramsPour(etat, ctx, v.vecteur), null, null);
        }
        const { el, cible } = viseeElement(ctx, ev);
        if (el && el.genre === "arete" && cible) {
          if (cible.genre !== "arete") {
            return { etat: { ...etat, erreur: "Double-cliquez sur le groupe pour y entrer, puis poussez ou tirez une de ses arêtes." } };
          }
          const ids = aretesDuClic(ctx, cible);
          const der = etat.derniere?.params;
          if (ev.double && (der?.genre === "aretes" || der?.genre === "couronne")) {
            return appliquerAretes(etat, ctx, { ...der, aretes: ids }, null, null);
          }
          const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
          const segments = segmentsMonde(ctx, ids);
          return {
            etat: {
              ...etat,
              etape: 2,
              aretes: ids,
              segments,
              boucle: boucleDe(segments, i.point),
              droite: droiteDe(ctx, ids, segments, i.point),
              origine: i.point,
              vecteur: null,
              inference: i,
              texte: null,
              erreur: null,
            },
            selection: ids,
          };
        }
        if (!el || el.genre !== "face" || !cible) return { etat: { ...etat, erreur: null, texte: null }, selection: [] };
        if (cible.genre !== "face") {
          return { etat: { ...etat, erreur: "Double-cliquez sur le groupe pour y entrer, puis poussez ou tirez une de ses faces." } };
        }
        if (ev.double && etat.derniere?.params.genre === "face") return appliquer(etat, ctx, cible.id, etat.derniere.params.distance, null, null);
        // Suite du lot 8 (EX-PT-03, EX-UI-05) : l'Étirement d'une face sans voisine est refusé dès le clic, avant tout aperçu.
        if (etat.etirement && !faceAVoisines(ctx.modele, cible.id, ctx.dans)) return { etat: { ...etat, erreur: ERREUR_ETIRER_ISOLEE } };
        const P = intersectionRayonPlan(ev.rayon, { origine: el.exterieur[0] as Vec3, normale: el.normale }) ?? (el.exterieur[0] as Vec3);
        return {
          etat: { ...etat, etape: 2, face: cible.id, normale: normalize(el.normale), origine: P, contour: el.exterieur, distance: 0, inference: inferenceBrute(P), texte: null, erreur: null },
          selection: [cible.id],
        };
      }
      case "saisie":
        return saisir(etat, ctx, ev.texte);
      case "touche": {
        if (ev.etat !== "enfoncee") return { etat };
        const modeAretes = etat.etape === 2 ? etat.aretes.length > 0 : etat.survolArete !== null;
        // Lot 8 : les touches passent par `configurer`, comme les boutons de la barre d'options et du toucher.
        if (ev.touche === "Ctrl") return configurerPT(etat, "face", modeFace(etat) === "nouvelle-face" ? "normal" : "nouvelle-face");
        if (ev.touche === "Alt") {
          return modeAretes
            ? configurerPT(etat, "arete", etat.symetrique ? "normal" : "deux-cotes")
            : configurerPT(etat, "face", modeFace(etat) === "etirement" ? "normal" : "etirement");
        }
        if (ev.touche === "FlecheBas" && etat.etape === 2 && etat.aretes.length > 0) {
          return configurerPT(etat, "arete", etat.fleche?.touche === "FlecheBas" ? "normal" : "allonger");
        }
        const axe = axeDeToucheFleche(ev.touche);
        if (axe && etat.etape === 2 && etat.aretes.length > 0) {
          if (etat.fleche?.touche === ev.touche) return { etat: { ...etat, fleche: null } };
          return { etat: { ...etat, fleche: { touche: ev.touche, verrou: { genre: "axe", axe } } } };
        }
        return { etat };
      }
      case "echap":
        return etat.etape === 2 ? { etat: { ...retour(etat), texte: null, erreur: null }, selection: [] } : { etat };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatPousserTirer> {
    return configurerPT(etat, option, valeur);
  },

  vue(etat, ctx): VueOutil {
    return { ...vuePT(etat, ctx), options: optionsPT(etat, ctx) };
  },
};

function vuePT(etat: EtatPousserTirer, ctx: ContexteOutil): VueOutil {
  {
    const sep = ctx.separateurDecimal;
    if (etat.etape === 2 && etat.aretes.length > 0) {
      const v = etat.vecteur;
      const valeur = etat.texte ?? `${prefixe(etat.inference)}${formaterLongueur(v ? len(v) : 0, sep)}`;
      return vueModif({
        consigne: CONSIGNE_ARETE_TIRAGE,
        mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, 1), valeur, contexteSaisie("longueur", ctx)),
        inference: etat.inference,
        apercu: v && len(v) > TOL ? (apercuSpecial(etat, paramsPour(etat, ctx, v)) ?? apercuAretes(etat.segments, v, etat.symetrique)) : { lignes: [], faces: [] },
        ctx,
        survol: [],
        erreur: etat.erreur,
      });
    }
    const valeur =
      etat.texte ?? (etat.etape === 2 ? `${prefixe(etat.inference)}${formaterLongueur(Math.abs(etat.distance), sep)}` : formaterLongueur(0, sep));
    const dep = etat.normale ? { x: etat.normale.x * etat.distance, y: etat.normale.y * etat.distance, z: etat.normale.z * etat.distance } : null;
    return vueModif({
      consigne:
        etat.etape === 1 && etat.survolArete
          ? CONSIGNE_ARETE_SURVOL
          : etat.sansFond
            ? etat.etape === 1
              ? CONSIGNE_TUBE_FACE
              : CONSIGNE_TUBE_TIRAGE
            : consigneDe(ID_POUSSER_TIRER, etat.etape - 1),
      mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, etat.etape - 1), valeur, contexteSaisie("longueur", ctx)),
      inference: etat.etape === 2 ? etat.inference : null,
      apercu:
        etat.etape === 2 && dep && Math.abs(etat.distance) > TOL
          ? etat.sansFond
            ? apercuTube(etat.contour, dep)
            : etat.etirement
              ? apercuEtirement(etat.contour, dep)
              : apercuPrisme(etat.contour, dep)
          : { lignes: [], faces: [] },
      ctx,
      survol: etat.survol ? [etat.survol] : etat.survolArete ? [etat.survolArete] : [],
      erreur: etat.erreur,
    });
  }
}
