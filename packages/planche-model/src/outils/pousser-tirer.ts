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
import { type Id, type Modele, ERREUR_ETIRER_ISOLEE, nombreOccurrences, allongerArete, distanceJusquAFace, aretesDeLaCourbe, contexte, couronne, etirerAretes, etirerFace, faceAVoisines, newell, pousserTirer, tuberFace } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, add, cross, dist, dot, egal, len, normalize, scale, sub, v3 } from "../vecteur.js";
import {
  type Apercu,
  type Derniere,
  contexteSaisie,
  corrigeable,
  formaterLongueur,
  formaterNombre,
  intersectionRayonPlan,
  inferenceBrute,
  mesures,
  messageErreur,
  prefixe,
} from "./commun-formes.js";
import {
  VECTEUR_AXE,
  axeDeToucheFleche,
  consigneDe,
  distanceLocale,
  echelleDansPlan,
  enLocal,
  idsSelectionnables,
  libelleMesuresDe,
  selectionValide,
  vecteurLocal,
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
  /** Lot L19 : `vecteur` monde (ramené au contexte d'édition à l'application, EX-MODEL-02). */
  | { readonly genre: "aretes"; readonly aretes: readonly Id[]; readonly vecteur: Vec3; readonly symetrique: boolean; readonly normaleBoucle?: Vec3 }
  /**
   * Courbe fermée tirée dans son plan : `distance` > 0 vers l'extérieur (monde). `normaleBoucle` (monde) est gardée avec
   * les paramètres : la correction tapée ensuite rejoue l'opération après `retour`, qui a oublié la boucle (revue de #132).
   */
  | { readonly genre: "couronne"; readonly aretes: readonly Id[]; readonly distance: number; readonly symetrique: boolean; readonly normaleBoucle?: Vec3 }
  /** Ligne tirée dans son propre sens : `longueur` > 0 allonge (monde) ; `direction` (monde) gardée pour la même raison. */
  | { readonly genre: "allonger"; readonly arete: Id; readonly extremite: Id; readonly longueur: number; readonly direction?: Vec3 };

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
  /** (Lot 10a, EX-PREV-02) Contours monde des trous de la face : l'aperçu les montre (P-09). */
  readonly trousContour: readonly (readonly Vec3[])[];
  readonly survol: Id | null;
  readonly distance: number;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsPT> | null;
  /** (Lot 10a, EX-STATE-01) Sélection avant l'opération : Échap la rend. */
  readonly selectionAvant: readonly Id[];
  /** (Lot 10a, EX-NUM-02) « Inverser le sens » : la valeur tapée s'applique de l'autre côté, une seule fois. */
  readonly sens: 1 | -1;
  /** (Lot 10a, EX-PT-02) Étendue : à la distance (curseur, saisie) ou « Jusqu'à une face » (clic sur une face parallèle). */
  readonly jusquAFace: boolean;
  /** (Lot 10b, EX-LINK-02) Garder le lien de la surface à ses arêtes sources (racine seulement ; activé par défaut). */
  readonly lier: boolean;
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
    trousContour: [],
    survol: null,
    distance: 0,
    inference: null,
    texte: null,
    erreur: null,
    derniere: null,
    selectionAvant: [],
    sens: 1,
    jusquAFace: false,
    lier: true,
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
  trousContour: [],
  distance: 0,
  inference: null,
  selectionAvant: [],
  sens: 1,
});

/** Lot L20 : avertissement d'un étirement dans un composant partagé. */
export const avertissementComposantPartage = (n: number): string => `Composant partagé : l'étirement s'applique à ses ${n} occurrences.`;

/** Lot L20 : nombre d'occurrences de la définition éditée (`dans`), 0 à la racine. */
function occurrencesPartagees(m: Modele, dans: Id | undefined): number {
  if (dans === undefined) return 0;
  for (const c of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) {
    const o = c.occurrences[dans];
    if (o) return nombreOccurrences(m, o.definition);
  }
  return 0;
}

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
  // Lot 10a (EX-STATE-01) : une opération refusée garde la face acquise et la valeur tapée ; on corrige sans recliquer.
  const garder = remplace ? e : { ...e, texte };
  if (Math.abs(distance) < EPS) return { etat: { ...garder, erreur: "Distance nulle : rien n'a été poussé ni tiré." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const prec = remplace?.params.genre === "face" ? remplace.params : null;
    const sansFond = prec ? prec.sansFond === true : e.sansFond;
    const etirement = prec ? prec.etirement === true : e.etirement;
    // Lot L19 (EX-MODEL-02) : la distance tapée ou visée est en mètres monde ; dans un groupe transformé, elle est ramenée
    // le long de la normale locale de la face (refus nommé si une échelle non uniforme fausserait la dimension).
    const nLocale = contexte(base, ctx.dans).faces[face]?.normale;
    const d = e.normale && nLocale ? distanceLocale({ ...ctx, modele: base }, e.normale, nLocale, distance) : distance;
    const r = sansFond
      ? tuberFace(base, face, d, { ...optionsDans(ctx), lier: e.lier })
      : etirement
        ? etirerFace(base, face, d, optionsDans(ctx))
        : pousserTirer(base, face, d, { ...optionsDans(ctx), nouvelleFace: e.nouvelleFace });
    const encore = contexte(r.modele, ctx.dans).faces[face] !== undefined;
    // Lot L20 : l'étirement (et son pli) reste dans le contexte d'édition ; dans un composant partagé, il vaut pour
    // toutes ses occurrences — la barre d'état le dit (avertissement, pas un refus : sémantique existante des composants).
    const partage = etirement ? occurrencesPartagees(base, ctx.dans) : 0;
    const avertissement = partage > 1 ? avertissementComposantPartage(partage) : null;
    return {
      etat: { ...retour(e), texte, erreur: avertissement, derniere: { avant: base, apres: r.modele, params: { genre: "face", face, distance, nouvelleFace: e.nouvelleFace, ...(sansFond ? { sansFond: true } : {}), ...(etirement ? { etirement: true } : {}) } } },
      modele: r.modele,
      selection: encore && !sansFond ? [face] : idsSelectionnables(r.rapport.crees).filter((id) => id.startsWith("f")),
      operation: "Pousser/Tirer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...garder, erreur: messageErreur(err) } };
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
function paramsPour(e: EtatPousserTirer, _ctx: ContexteOutil, v: Vec3): ParamsArete {
  const n = len(v);
  const parallele = e.fleche?.verrou.genre === "direction";
  if (e.droite && n > EPS && (parallele || len(cross(e.droite.direction, v)) < 1e-6 * n)) {
    return { genre: "allonger", arete: e.droite.arete, extremite: e.droite.extremite, longueur: dot(v, e.droite.direction), direction: e.droite.direction };
  }
  if (e.boucle && n > EPS && Math.abs(dot(e.boucle.normale, v)) < 1e-6 * n) {
    return { genre: "couronne", aretes: e.aretes, distance: dot(v, e.boucle.exterieur), symetrique: e.symetrique, normaleBoucle: e.boucle.normale };
  }
  return { genre: "aretes", aretes: e.aretes, vecteur: v, symetrique: e.symetrique, ...(e.boucle ? { normaleBoucle: e.boucle.normale } : {}) };
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
  const garder = remplace ? e : { ...e, texte };
  if (nulle) return { etat: { ...garder, erreur: "Distance nulle : rien n'a été poussé ni tiré." } };
  const base = remplace ? remplace.avant : ctx.modele;
  const o = optionsDans(ctx);
  try {
    // Lot L19 (EX-MODEL-02) : valeurs monde ramenées au contexte d'édition (vecteur par la partie linéaire inverse,
    // longueur le long de l'arête, distance de couronne par l'échelle du plan — refus nommé si elle n'est pas uniforme).
    const ctxBase = { ...ctx, modele: base };
    // Normale de la boucle et direction de l'arête : celles des paramètres (une correction rejoue après `retour`, qui les
    // a effacées de l'état), sinon celles de l'état courant.
    const normaleBoucle = p.genre === "couronne" ? (p.normaleBoucle ?? e.boucle?.normale) : undefined;
    const directionArete = p.genre === "allonger" ? (p.direction ?? e.droite?.direction ?? v3(1, 0, 0)) : undefined;
    const r =
      p.genre === "aretes"
        ? etirerAretes(base, p.aretes, vecteurLocal(ctxBase, p.vecteur), { ...o, symetrique: p.symetrique, lier: e.lier })
        : p.genre === "couronne"
          ? couronne(base, p.aretes, p.distance * (normaleBoucle ? echelleDansPlan(ctxBase, normaleBoucle) : 1), { ...o, symetrique: p.symetrique, lier: e.lier })
          : allongerArete(base, p.arete, p.extremite, Math.sign(p.longueur) * len(vecteurLocal(ctxBase, scale(directionArete ?? v3(1, 0, 0), Math.abs(p.longueur)))), o);
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: p } },
      modele: r.modele,
      selection: idsSelectionnables(r.rapport.crees).filter((id) => (p.genre === "allonger" ? id.startsWith("a") : id.startsWith("f"))),
      operation: "Pousser/Tirer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...garder, erreur: messageErreur(err) } };
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
/**
 * Aperçu d'une face trouée (lot 10a, EX-PREV-02) : face d'arrivée avec ses trous, arêtes de chaque boucle, et — pour la
 * Surface ouverte — les parois de chaque boucle, trous compris (P-09 : un anneau donne deux tubes).
 */
function apercuFace(contour: readonly Vec3[], trous: readonly (readonly Vec3[])[], dep: Vec3, genre: "prisme" | "tube" | "etirement"): Apercu {
  const boucles = [contour, ...trous];
  const hautes = boucles.map((b) => b.map((p) => add(p, dep)));
  const lignes: Vec3[][] = hautes.map((h) => [...h, h[0] as Vec3]);
  boucles.forEach((b, k) => b.forEach((p, i) => lignes.push([p, (hautes[k] as Vec3[])[i] as Vec3])));
  if (genre !== "tube") return { lignes, faces: [hautes[0] as Vec3[]], trous: [hautes.slice(1)] };
  const parois = boucles.flatMap((b) => b.map((a, i) => {
    const c = b[(i + 1) % b.length] as Vec3;
    return [a, c, add(c, dep), add(a, dep)];
  }));
  return { lignes, faces: parois };
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
  if (e.etape === 2 && e.face) return appliquer(e, ctx, e.face, e.sens * res.valeur, texte, null);
  if (e.etape === 2 && e.aretes.length > 0 && e.origine) {
    const d = directionSaisie(e, ctx);
    if (!d) return { etat: { ...e, texte, erreur: "Orientez le curseur (ou verrouillez un axe avec une flèche) pour donner la direction." } };
    // La valeur tapée est exacte ; le curseur ne donne que le genre d'opération et le sens.
    const dir = e.sens === 1 ? d : scale(d, -1);
    return appliquerAretes(e, ctx, aValeur(paramsPour(e, ctx, scale(dir, res.valeur)), res.valeur), texte, null);
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

export const ERREUR_CTRL_ARETE = "Ctrl seul : « Conserver la face de départ » ne s'applique qu'à une face, pas à une arête.";
export const ERREUR_MAJ_ARETE = "Maj seul : « Surface ouverte » ne s'applique qu'à une face, pas à une arête.";
export const ERREUR_ALLONGER_COURBE = "Allonger : seule une arête droite isolée peut être allongée.";

/** Un seul chemin pour choisir un mode : touche, bouton de la barre d'options ou bouton au toucher. */
export const CONSIGNE_LIEN_RACINE = "Liens automatiques aux arêtes sources : à la racine de la Planche seulement — ici, la surface sera indépendante.";
export const ERREUR_FACE_HORS_EXTRUSION = "« Jusqu'à une face » ne s'applique qu'à l'extrusion normale d'une face.";
export const CONSIGNE_JUSQU_A_FACE = "Jusqu'à une face : cliquez sur une face parallèle — la distance signée s'affiche avant de valider.";
export const ERREUR_SENS_SANS_SOURCE = "Inverser le sens : cliquez d'abord sur la face ou l'arête à pousser ou à tirer.";

function configurerPT(e: EtatPousserTirer, option: string, valeur: string): Transition<EtatPousserTirer> {
  if (option === "lien" && (valeur === "lie" || valeur === "independant")) return { etat: { ...e, lier: valeur === "lie", erreur: null } };
  if (option === "etendue" && (valeur === "distance" || valeur === "face")) {
    // « Jusqu'à une face » ne vaut que pour l'extrusion standard d'une face (V1 : to-face, extrusion seulement).
    if (valeur === "face" && (e.sansFond || e.etirement || e.aretes.length > 0)) return { etat: { ...e, erreur: ERREUR_FACE_HORS_EXTRUSION } };
    return { etat: { ...e, jusquAFace: valeur === "face", erreur: null } };
  }
  if (option === "sens" && (valeur === "direct" || valeur === "inverse")) {
    if (e.etape !== 2) return { etat: { ...e, erreur: ERREUR_SENS_SANS_SOURCE } };
    return { etat: { ...e, sens: valeur === "inverse" ? -1 : 1, erreur: null } };
  }
  if (option === "face" && (MODES_FACE as readonly string[]).includes(valeur)) {
    // Revue #121 : « Jusqu'à une face » ne vaut que pour l'extrusion normale : passer en Étirement ou en Surface ouverte
    // remet l'étendue à « Distance » (sinon la cible serait appliquée à un tube ou à un étirement).
    const horsExtrusion = valeur === "etirement" || valeur === "tube";
    return { etat: { ...e, nouvelleFace: valeur === "nouvelle-face", etirement: valeur === "etirement", sansFond: valeur === "tube", jusquAFace: horsExtrusion ? false : e.jusquAFace, erreur: null } };
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

/**
 * Action d'extrusion typée (lot 9, EX-CMD-02, contrat de la V1 adapté) : boutons, clavier et toucher envoient la même
 * action sémantique, validée ici et non par l'interface (un bouton grisé n'est pas une barrière). Unions finies ; les
 * opérations de la V1 qui ne sont pas encore livrées par Pousser/Tirer (balayage de profil, révolution, texte 3D, bande
 * annulaire choisie à la main) sont hors de ce type.
 */
export type OperationExtrusion = "extrude-face" | "stretch-face" | "open-surface" | "sweep-edges" | "lengthen-edge";
export type OptionExtrusion = "keep-start-face" | "symmetric" | "keep-source-link";
export type ActionExtrusion =
  | { readonly type: "set-operation"; readonly operation: OperationExtrusion }
  | { readonly type: "set-option"; readonly option: OptionExtrusion; readonly value: boolean }
  | { readonly type: "reverse-direction" }
  | { readonly type: "set-extent"; readonly extent: "distance" | "to-face" }
  | { readonly type: "cancel" };

export const ERREUR_CONSERVER_HORS_EXTRUSION = "« Conserver la face de départ » ne s'applique qu'à l'extrusion d'une face.";
export const ERREUR_SYMETRIQUE_HORS_ARETE = "« Des deux côtés » ne s'applique qu'au balayage d'arêtes.";

export function actionExtrusion(e: EtatPousserTirer, a: ActionExtrusion): Transition<EtatPousserTirer> {
  switch (a.type) {
    case "cancel":
      return e.etape === 2 ? { etat: { ...retour(e), texte: null, erreur: null }, selection: e.selectionAvant } : { etat: e };
    case "set-extent":
      return configurerPT(e, "etendue", a.extent === "to-face" ? "face" : "distance");
    case "reverse-direction":
      return configurerPT(e, "sens", e.sens === 1 ? "inverse" : "direct");
    case "set-operation":
      switch (a.operation) {
        case "extrude-face":
          return configurerPT(e, "face", "normal");
        case "stretch-face":
          return configurerPT(e, "face", "etirement");
        case "open-surface":
          return configurerPT(e, "face", "tube");
        case "sweep-edges":
          return configurerPT(e, "arete", "normal");
        case "lengthen-edge":
          return configurerPT(e, "arete", "allonger");
      }
      return { etat: e };
    case "set-option":
      if (a.option === "keep-source-link") return configurerPT(e, "lien", a.value ? "lie" : "independant");
      if (a.option === "keep-start-face") {
        const m = modeFace(e);
        // A-02 : après Étirement ou Surface ouverte, l'option est sans objet — refus nommé, aucun drapeau périmé.
        if (m !== "normal" && m !== "nouvelle-face") return { etat: { ...e, erreur: ERREUR_CONSERVER_HORS_EXTRUSION } };
        return configurerPT(e, "face", a.value ? "nouvelle-face" : "normal");
      }
      if (modeArete(e) === "allonger" || (e.etape === 2 && e.aretes.length === 0)) return { etat: { ...e, erreur: ERREUR_SYMETRIQUE_HORS_ARETE } };
      return configurerPT(e, "arete", a.value ? "deux-cotes" : "normal");
  }
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
        { id: "tube", disponible: !surArete, raccourci: "Maj" },
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
    // Lot 10b (EX-LINK-02) : lien aux arêtes sources — balayage d'arêtes, bande annulaire, Surface ouverte, à la racine.
    {
      id: "lien",
      // Dans un groupe, la surface est forcément indépendante : la valeur affichée est l'effective, la préférence est gardée.
      valeur: e.lier && ctx.dans === undefined ? "lie" : "independant",
      valeurs: [
        { id: "lie", disponible: ctx.dans === undefined && (surArete || e.sansFond) },
        { id: "independant", disponible: surArete || e.sansFond },
      ],
    },
    // Lot 10a (EX-PT-02) : étendue de l'extrusion d'une face.
    {
      id: "etendue",
      valeur: e.jusquAFace ? "face" : "distance",
      valeurs: [
        { id: "distance", disponible: !surArete },
        { id: "face", disponible: !surArete && !e.sansFond && !e.etirement },
      ],
    },
    // Lot 10a (EX-NUM-02) : sens de la valeur tapée, une fois la face ou l'arête acquise.
    {
      id: "sens",
      valeur: e.sens === 1 ? "direct" : "inverse",
      valeurs: [
        { id: "direct", disponible: e.etape === 2 },
        { id: "inverse", disponible: e.etape === 2 },
      ],
    },
  ];
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
        if (etat.etape === 2 && etat.face && etat.jusquAFace) {
          // Lot 10a : la face visée donne la distance signée (aperçu et champ) ; sinon l'aperçu reste où il est.
          const { cible } = viseeElement(ctx, ev);
          if (cible?.genre !== "face" || cible.id === etat.face) return { etat: { ...etat, erreur: null } };
          try {
            return { etat: { ...etat, distance: distanceJusquAFace(ctx.modele, etat.face, cible.id, optionsDans(ctx)), texte: null, erreur: null } };
          } catch (err) {
            return { etat: { ...etat, erreur: messageErreur(err) } };
          }
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
        if (etat.etape === 2 && etat.face && etat.jusquAFace) {
          const { cible } = viseeElement(ctx, ev);
          if (cible?.genre !== "face") return { etat: { ...etat, erreur: CONSIGNE_JUSQU_A_FACE } };
          try {
            return appliquer(etat, ctx, etat.face, distanceJusquAFace(ctx.modele, etat.face, cible.id, optionsDans(ctx)), null, null);
          } catch (err) {
            return { etat: { ...etat, erreur: messageErreur(err) } };
          }
        }
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
              selectionAvant: ctx.selection,
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
          etat: { ...etat, etape: 2, face: cible.id, normale: normalize(el.normale), origine: P, contour: el.exterieur, trousContour: el.trous, distance: 0, inference: inferenceBrute(P), texte: null, erreur: null, selectionAvant: ctx.selection },
          selection: [cible.id],
        };
      }
      case "saisie":
        return saisir(etat, ctx, ev.texte);
      case "touche": {
        if (ev.etat !== "enfoncee") return { etat };
        // Lot 9 (EX-CMD-04) : Ctrl, Alt et Maj ne basculent plus à l'appui, mais frappés seuls (`modificateurSeul`) ;
        // ainsi Ctrl + Z, Maj + F, Maj + Tab ou Maj + chiffre ne changent jamais de mode.
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
        // Lot 10a (EX-STATE-01) : Échap annule l'aperçu sans pas d'historique et rend la sélection d'avant l'opération.
        return etat.etape === 2 ? { etat: { ...retour(etat), texte: null, erreur: null }, selection: etat.selectionAvant } : { etat };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatPousserTirer> {
    return configurerPT(etat, option, valeur);
  },

  // Lot 9 : les touches frappées seules passent par `configurer`, comme les boutons de la barre d'options et du toucher.
  modificateurSeul(etat, touche): Transition<EtatPousserTirer> {
    const modeAretes = etat.etape === 2 ? etat.aretes.length > 0 : etat.survolArete !== null;
    if (touche === "Alt") {
      return modeAretes
        ? configurerPT(etat, "arete", etat.symetrique ? "normal" : "deux-cotes")
        : configurerPT(etat, "face", modeFace(etat) === "etirement" ? "normal" : "etirement");
    }
    if (modeAretes) return { etat: { ...etat, erreur: touche === "Ctrl" ? ERREUR_CTRL_ARETE : ERREUR_MAJ_ARETE } };
    if (touche === "Ctrl") return configurerPT(etat, "face", modeFace(etat) === "nouvelle-face" ? "normal" : "nouvelle-face");
    // Maj seul rétabli (lot 9) : Surface ouverte, sans gêner Maj + lettre (raccourcis Fadi) ni Maj + chiffre.
    return configurerPT(etat, "face", modeFace(etat) === "tube" ? "normal" : "tube");
  },

  vue(etat, ctx): VueOutil {
    return { ...vuePT(etat, ctx), options: optionsPT(etat, ctx) };
  },
};

/** Distance calculée (« Jusqu'à une face ») : au millimètre près quand le centimètre l'arrondirait (P-04 : 0,075 m). */
function formaterDistanceExacte(d: number, sep: "." | ","): string {
  const deux = formaterLongueur(d, sep);
  return Math.abs(Number(d.toFixed(2)) - d) < 1e-9 ? deux : `${formaterNombre(d, 3, sep)} m`;
}

function vuePT(etat: EtatPousserTirer, ctx: ContexteOutil): VueOutil {
  {
    const sep = ctx.separateurDecimal;
    if (etat.etape === 2 && etat.aretes.length > 0) {
      const v = etat.vecteur;
      const valeur = etat.texte ?? `${prefixe(etat.inference)}${formaterLongueur(v ? len(v) : 0, sep)}`;
      return vueModif({
        // Lot 10b (EX-LINK-02, L-02) : dans un groupe, la restriction « racine seulement » est dite, la surface reste valide.
        consigne: [
          CONSIGNE_ARETE_TIRAGE,
          // Lot 10b (EX-NUM-03, P-11) : en symétrique, la valeur est une distance par côté — le total est dit.
          etat.symetrique && v ? `Des deux côtés : distance par côté, total ${formaterLongueur(2 * len(v), sep)}.` : "",
          ctx.dans !== undefined ? CONSIGNE_LIEN_RACINE : "",
        ].filter(Boolean).join(" · "), // « · » : chaque phrase est traduite à part par la couche DOM
        mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, 1), valeur, contexteSaisie("longueur", ctx)),
        inference: etat.inference,
        apercu: v && len(v) > TOL ? (apercuSpecial(etat, paramsPour(etat, ctx, v)) ?? apercuAretes(etat.segments, v, etat.symetrique)) : { lignes: [], faces: [] },
        ctx,
        survol: [],
        erreur: etat.erreur,
      });
    }
    const valeur =
      // Lot 10a (EX-NUM-02) : distance signée (négative = creuser), affichée avant toute validation.
      etat.texte ??
      (etat.etape === 2
        ? etat.jusquAFace
          ? formaterDistanceExacte(etat.distance, sep)
          : `${prefixe(etat.inference)}${formaterLongueur(etat.distance, sep)}`
        : formaterLongueur(0, sep));
    const dep = etat.normale ? { x: etat.normale.x * etat.distance, y: etat.normale.y * etat.distance, z: etat.normale.z * etat.distance } : null;
    return vueModif({
      consigne:
        etat.etape === 1 && etat.survolArete
          ? CONSIGNE_ARETE_SURVOL
          : etat.etape === 2 && etat.jusquAFace
            ? CONSIGNE_JUSQU_A_FACE
            : etat.sansFond
            ? `${etat.etape === 1 ? CONSIGNE_TUBE_FACE : CONSIGNE_TUBE_TIRAGE}${ctx.dans !== undefined ? ` · ${CONSIGNE_LIEN_RACINE}` : ""}`
            : consigneDe(ID_POUSSER_TIRER, etat.etape - 1),
      mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, etat.etape - 1), valeur, contexteSaisie("longueur", ctx)),
      inference: etat.etape === 2 ? etat.inference : null,
      apercu:
        etat.etape === 2 && dep && Math.abs(etat.distance) > TOL
          ? etat.sansFond
            ? apercuFace(etat.contour, etat.trousContour, dep, "tube")
            : etat.etirement
              ? apercuFace(etat.contour, etat.trousContour, dep, "etirement")
              : apercuFace(etat.contour, etat.trousContour, dep, "prisme")
          : { lignes: [], faces: [] },
      ctx,
      survol: etat.survol ? [etat.survol] : etat.survolArete ? [etat.survolArete] : [],
      erreur: etat.erreur,
    });
  }
}
