/**
 * Outil Pousser/Tirer (cahier-planche §4.15, relevé outils-modification §1) — machine pure.
 *
 * Étape 1 : clic sur une face (elle devient la sélection). Étape 2 : la face suit le curseur SELON SA NORMALE (inférence
 * « Extrémité » sur un sommet existant) ; un 2ᵉ clic ou une distance + Entrée applique. Distance > 0 = sens de la
 * normale (tirer), < 0 = sens inverse (pousser). Après : étape 1 ; une distance tapée juste après CORRIGE l'extrusion
 * (un seul pas d'annulation) ; double-clic sur une autre face = répéter la dernière distance. Ctrl : nouvelle face de
 * départ ; Alt : mode étirement (bascule sans effet géométrique distinct sur des solides orthogonaux, relevé). Échap
 * pendant le tirage : retour à l'étape 1, sélection vidée.
 */
import { type Id, contexte, pousserTirer } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, dot, normalize, sub } from "../vecteur.js";
import {
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
import { apercuPrisme, consigneDe, idsSelectionnables, libelleMesuresDe, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_POUSSER_TIRER = "pousser-tirer";

interface ParamsPT {
  readonly face: Id;
  readonly distance: number;
  readonly nouvelleFace: boolean;
}

export interface EtatPousserTirer {
  readonly etape: 1 | 2;
  /** Ctrl : nouvelle face de départ. */
  readonly nouvelleFace: boolean;
  /** Alt : mode étirement (bascule). */
  readonly etirement: boolean;
  readonly face: Id | null;
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

const retour = (e: EtatPousserTirer): EtatPousserTirer => ({ ...e, etape: 1, face: null, normale: null, origine: null, contour: [], distance: 0, inference: null });

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
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: { face, distance, nouvelleFace: e.nouvelleFace } } },
      modele: r.modele,
      selection: encore ? [face] : idsSelectionnables(r.rapport.crees).filter((id) => id.startsWith("f")),
      operation: "Pousser/Tirer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

function saisir(e: EtatPousserTirer, ctx: ContexteOutil, texte: string): Transition<EtatPousserTirer> {
  const res = analyserSaisie(texte, contexteSaisie("longueur", ctx));
  if (res.genre === "erreur") return { etat: { ...e, texte, erreur: res.message } };
  if (res.genre !== "longueur") return { etat: { ...e, texte, erreur: `Saisie « ${texte} » non reconnue.` } };
  if (e.etape === 2 && e.face) return appliquer(e, ctx, e.face, res.valeur, texte, null);
  if (corrigeable(e.derniere, ctx)) return appliquer(e, ctx, e.derniere.params.face, res.valeur, texte, e.derniere);
  return { etat: { ...e, texte, erreur: "Cliquez d'abord sur la face à pousser ou à tirer." } };
}

export const machinePousserTirer: MachineOutil<EtatPousserTirer> = {
  id: ID_POUSSER_TIRER,
  initial,

  traiter(etat, ev: EvenementOutil, ctx): Transition<EtatPousserTirer> {
    switch (ev.genre) {
      case "survol": {
        if (etat.etape === 2 && etat.normale && etat.origine) {
          const v = viseeDistance(etat, ctx, ev.rayon, ev.tolerance);
          return { etat: { ...etat, distance: v.distance, inference: v.inference, texte: null, erreur: null } };
        }
        const { cible } = viseeElement(ctx, ev);
        return { etat: { ...etat, survol: cible?.genre === "face" ? cible.id : null, texte: null, erreur: null } };
      }
      case "clic": {
        if (etat.etape === 2 && etat.face) {
          const v = viseeDistance(etat, ctx, ev.rayon, ev.tolerance);
          return appliquer(etat, ctx, etat.face, v.distance, null, null);
        }
        const { el, cible } = viseeElement(ctx, ev);
        if (!el || el.genre !== "face" || !cible) return { etat: { ...etat, erreur: null, texte: null }, selection: [] };
        if (cible.genre !== "face") {
          return { etat: { ...etat, erreur: "Double-cliquez sur le groupe pour y entrer, puis poussez ou tirez une de ses faces." } };
        }
        if (ev.double && etat.derniere) return appliquer(etat, ctx, cible.id, etat.derniere.params.distance, null, null);
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
        if (ev.touche === "Ctrl") return { etat: { ...etat, nouvelleFace: !etat.nouvelleFace } };
        if (ev.touche === "Alt") return { etat: { ...etat, etirement: !etat.etirement } };
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
    const valeur =
      etat.texte ?? (etat.etape === 2 ? `${prefixe(etat.inference)}${formaterLongueur(Math.abs(etat.distance), sep)}` : formaterLongueur(0, sep));
    const dep = etat.normale ? { x: etat.normale.x * etat.distance, y: etat.normale.y * etat.distance, z: etat.normale.z * etat.distance } : null;
    return vueModif({
      consigne: consigneDe(ID_POUSSER_TIRER, etat.etape - 1),
      mesures: mesures(libelleMesuresDe(ID_POUSSER_TIRER, etat.etape - 1), valeur, contexteSaisie("longueur", ctx)),
      inference: etat.etape === 2 ? etat.inference : null,
      apercu: etat.etape === 2 && dep && Math.abs(etat.distance) > TOL ? apercuPrisme(etat.contour, dep) : { lignes: [], faces: [] },
      ctx,
      survol: etat.survol ? [etat.survol] : [],
      erreur: etat.erreur,
    });
  },
};
