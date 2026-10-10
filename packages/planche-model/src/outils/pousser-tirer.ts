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
import { type Id, aretesDeLaCourbe, contexte, etirerAretes, pousserTirer } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, add, dot, len, normalize, scale, sub } from "../vecteur.js";
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
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { type Cible, idsDuClic, optionsDans, scene } from "./selection.js";

export const ID_POUSSER_TIRER = "pousser-tirer";

/** Consignes du mode arêtes (écart Fadi, D-196 : absentes du relevé SketchUp). */
export const CONSIGNE_ARETE_SURVOL = "Cliquez sur l'arête à étendre en surface. | Alt = Des deux côtés.";
export const CONSIGNE_ARETE_TIRAGE = "Cliquez pour fixer la surface ou saisissez la distance. | Flèches = Verrouiller un axe. | Alt = Des deux côtés.";

type ParamsPT =
  | { readonly genre: "face"; readonly face: Id; readonly distance: number; readonly nouvelleFace: boolean }
  /** `vecteur` dans le repère du contexte d'édition. */
  | { readonly genre: "aretes"; readonly aretes: readonly Id[]; readonly vecteur: Vec3; readonly symetrique: boolean };

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
  readonly face: Id | null;
  /** Mode arêtes (écart Fadi) : arêtes étendues, leurs segments monde (aperçu), vecteur monde visé. */
  readonly aretes: readonly Id[];
  readonly segments: readonly Segment[];
  readonly vecteur: Vec3 | null;
  /** Alt en mode arêtes : des deux côtés. */
  readonly symetrique: boolean;
  readonly fleche: VerrouFleche | null;
  readonly survolArete: Id | null;
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
    face: null,
    aretes: [],
    segments: [],
    vecteur: null,
    symetrique: false,
    fleche: null,
    survolArete: null,
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
    const r = pousserTirer(base, face, distance, { ...optionsDans(ctx), nouvelleFace: e.nouvelleFace });
    const encore = contexte(r.modele, ctx.dans).faces[face] !== undefined;
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: { genre: "face", face, distance, nouvelleFace: e.nouvelleFace } } },
      modele: r.modele,
      selection: encore ? [face] : idsSelectionnables(r.rapport.crees).filter((id) => id.startsWith("f")),
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
function directionSaisie(e: EtatPousserTirer): Vec3 | null {
  const v = e.vecteur;
  const fl = e.fleche?.verrou;
  if (fl && fl.genre === "axe") {
    const a = VECTEUR_AXE[fl.axe];
    return v && len(v) > TOL && dot(v, a) < 0 ? scale(a, -1) : a;
  }
  return v && len(v) > TOL ? normalize(v) : null;
}

function appliquerAretes(
  e: EtatPousserTirer,
  ctx: ContexteOutil,
  p: Extract<ParamsPT, { genre: "aretes" }>,
  texte: string | null,
  remplace: Derniere<ParamsPT> | null,
): Transition<EtatPousserTirer> {
  if (len(p.vecteur) < EPS) return { etat: { ...retour(e), texte, erreur: "Distance nulle : rien n'a été poussé ni tiré." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const r = etirerAretes(base, p.aretes, p.vecteur, { ...optionsDans(ctx), symetrique: p.symetrique });
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: p } },
      modele: r.modele,
      selection: idsSelectionnables(r.rapport.crees).filter((id) => id.startsWith("f")),
      operation: "Pousser/Tirer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
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
    const d = directionSaisie(e);
    if (!d) return { etat: { ...e, texte, erreur: "Orientez le curseur (ou verrouillez un axe avec une flèche) pour donner la direction." } };
    const vecteur = enLocal(ctx).vecteur(e.origine, scale(d, res.valeur));
    return appliquerAretes(e, ctx, { genre: "aretes", aretes: e.aretes, vecteur, symetrique: e.symetrique }, texte, null);
  }
  if (corrigeable(e.derniere, ctx)) {
    const d = e.derniere;
    if (d.params.genre === "face") return appliquer(e, ctx, d.params.face, res.valeur, texte, d);
    return appliquerAretes(e, ctx, { ...d.params, vecteur: scale(normalize(d.params.vecteur), res.valeur) }, texte, d);
  }
  return { etat: { ...e, texte, erreur: "Cliquez d'abord sur la face ou l'arête à pousser ou à tirer." } };
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
          const vecteur = enLocal(ctx).vecteur(etat.origine, v.vecteur);
          return appliquerAretes({ ...etat, inference: v.inference }, ctx, { genre: "aretes", aretes: etat.aretes, vecteur, symetrique: etat.symetrique }, null, null);
        }
        const { el, cible } = viseeElement(ctx, ev);
        if (el && el.genre === "arete" && cible) {
          if (cible.genre !== "arete") {
            return { etat: { ...etat, erreur: "Double-cliquez sur le groupe pour y entrer, puis poussez ou tirez une de ses arêtes." } };
          }
          const ids = aretesDuClic(ctx, cible);
          if (ev.double && etat.derniere?.params.genre === "aretes") {
            return appliquerAretes(etat, ctx, { ...etat.derniere.params, aretes: ids }, null, null);
          }
          const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
          return {
            etat: { ...etat, etape: 2, aretes: ids, segments: segmentsMonde(ctx, ids), origine: i.point, vecteur: null, inference: i, texte: null, erreur: null },
            selection: ids,
          };
        }
        if (!el || el.genre !== "face" || !cible) return { etat: { ...etat, erreur: null, texte: null }, selection: [] };
        if (cible.genre !== "face") {
          return { etat: { ...etat, erreur: "Double-cliquez sur le groupe pour y entrer, puis poussez ou tirez une de ses faces." } };
        }
        if (ev.double && etat.derniere?.params.genre === "face") return appliquer(etat, ctx, cible.id, etat.derniere.params.distance, null, null);
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
        if (ev.touche === "Ctrl") return { etat: { ...etat, nouvelleFace: !etat.nouvelleFace } };
        if (ev.touche === "Alt") return modeAretes ? { etat: { ...etat, symetrique: !etat.symetrique } } : { etat: { ...etat, etirement: !etat.etirement } };
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

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    if (etat.etape === 2 && etat.aretes.length > 0) {
      const v = etat.vecteur;
      const valeur = etat.texte ?? `${prefixe(etat.inference)}${formaterLongueur(v ? len(v) : 0, sep)}`;
      return vueModif({
        consigne: CONSIGNE_ARETE_TIRAGE,
        mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, 1), valeur, contexteSaisie("longueur", ctx)),
        inference: etat.inference,
        apercu: v && len(v) > TOL ? apercuAretes(etat.segments, v, etat.symetrique) : { lignes: [], faces: [] },
        ctx,
        survol: [],
        erreur: etat.erreur,
      });
    }
    const valeur =
      etat.texte ?? (etat.etape === 2 ? `${prefixe(etat.inference)}${formaterLongueur(Math.abs(etat.distance), sep)}` : formaterLongueur(0, sep));
    const dep = etat.normale ? { x: etat.normale.x * etat.distance, y: etat.normale.y * etat.distance, z: etat.normale.z * etat.distance } : null;
    return vueModif({
      consigne: etat.etape === 1 && etat.survolArete ? CONSIGNE_ARETE_SURVOL : consigneDe(ID_POUSSER_TIRER, etat.etape - 1),
      mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, etat.etape - 1), valeur, contexteSaisie("longueur", ctx)),
      inference: etat.etape === 2 ? etat.inference : null,
      apercu: etat.etape === 2 && dep && Math.abs(etat.distance) > TOL ? apercuPrisme(etat.contour, dep) : { lignes: [], faces: [] },
      ctx,
      survol: etat.survol ? [etat.survol] : etat.survolArete ? [etat.survolArete] : [],
      erreur: etat.erreur,
    });
  },
};
