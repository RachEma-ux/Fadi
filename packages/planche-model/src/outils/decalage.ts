/**
 * Outil Décalage (cahier-planche §4.19, relevé outils-modification §5) — machine pure.
 *
 * FACE : un clic sur la face (étape 2) ; le curseur définit la distance (côté intérieur = distance > 0, extérieur =
 * distance < 0) ; un 2ᵉ clic ou une valeur tapée applique (« 0,3 » du côté du curseur). La face est DIVISÉE en un
 * anneau et une face intérieure. Double-clic sur une autre face : même distance (relevé). ARÊTES : arêtes continues
 * présélectionnées (ou arête cliquée), un clic place le point de mesure ; la polyligne parallèle est prolongée
 * jusqu'aux intersections et ne crée AUCUNE face. Après : étape 1 ; une valeur tapée juste après corrige (un seul pas).
 * Alt (autoriser le chevauchement) : bascule sans effet — le noyau ne traite que le contour extérieur, pas d'élagage.
 */
import { type Id, contexte, decaler, decalerAretes } from "../geometrie-libre.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, add, cross, dist, dot, len, normalize, scale, sub } from "../vecteur.js";
import { baseDuPlan } from "../geometrie-libre.js";
import {
  type Derniere,
  contexteSaisie,
  corrigeable,
  formaterLongueur,
  intersectionRayonPlan,
  mesures,
  messageErreur,
} from "./commun-formes.js";
import { consigneDe, idsSelectionnables, libelleMesuresDe, selectionValide, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { idsDuClic, optionsDans } from "./selection.js";

export const ID_DECALAGE = "decalage";

type ParamsDec = { readonly face: Id; readonly distance: number } | { readonly aretes: readonly Id[]; readonly distance: number; readonly cote: Vec3 };

export interface EtatDecalage {
  readonly etape: 1 | 2;
  readonly face: Id | null;
  readonly aretes: readonly Id[];
  readonly normale: Vec3 | null;
  readonly origine: Vec3 | null;
  /** Contour monde de la face décalée (calcul de la distance). */
  readonly contour: readonly Vec3[];
  /** Distance signée courante (face : + intérieur / − extérieur ; arêtes : toujours ≥ 0). */
  readonly distance: number;
  /** Point visé (côté du décalage des arêtes). */
  readonly cote: Vec3 | null;
  readonly alt: boolean;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsDec> | null;
}

function initial(): EtatDecalage {
  return { etape: 1, face: null, aretes: [], normale: null, origine: null, contour: [], distance: 0, cote: null, alt: false, texte: null, erreur: null, derniere: null };
}

const retour = (e: EtatDecalage): EtatDecalage => ({ ...e, etape: 1, face: null, aretes: [], normale: null, origine: null, contour: [], distance: 0, cote: null });

/** Distance signée d'un point au contour dans son plan : intérieur > 0, extérieur < 0. */
export function distanceAuContour(contour: readonly Vec3[], n: Vec3, p: Vec3): number {
  const { u, w } = baseDuPlan(n);
  const p2 = (q: Vec3) => ({ x: dot(q, u), y: dot(q, w) });
  const P = p2(p);
  const poly = contour.map(p2);
  let dedans = false;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as { x: number; y: number };
    const b = poly[j] as { x: number; y: number };
    if (a.y > P.y !== b.y > P.y && P.x < ((b.x - a.x) * (P.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    const t = l2 < EPS ? 0 : Math.min(1, Math.max(0, ((P.x - a.x) * abx + (P.y - a.y) * aby) / l2));
    d = Math.min(d, Math.hypot(P.x - (a.x + abx * t), P.y - (a.y + aby * t)));
  }
  return dedans ? d : -d;
}

/** Point visé dans le plan du décalage : intersection du rayon avec ce plan. */
function pointDansPlan(e: EtatDecalage, r: Rayon): Vec3 | null {
  return e.normale && e.origine ? intersectionRayonPlan(r, { origine: e.origine, normale: e.normale }) : null;
}

function nouvelleDistance(e: EtatDecalage, p: Vec3): number {
  if (e.face) return distanceAuContour(e.contour, e.normale as Vec3, p);
  // Arêtes : distance perpendiculaire du point visé à la première arête (côté du curseur conservé séparément).
  const A = e.contour[0] as Vec3;
  const B = e.contour[1] as Vec3;
  const d = normalize(sub(B, A));
  const v = sub(p, A);
  return len(sub(v, scale(d, dot(v, d))));
}

function appliquerFace(e: EtatDecalage, ctx: ContexteOutil, face: Id, distance: number, texte: string | null, remplace: Derniere<ParamsDec> | null): Transition<EtatDecalage> {
  if (Math.abs(distance) < EPS) return { etat: { ...retour(e), texte, erreur: "Distance nulle : aucun décalage créé." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const r = decaler(base, face, distance, optionsDans(ctx));
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: { face, distance } } },
      modele: r.modele,
      selection: r.face ? [r.face] : [],
      operation: "Décalage",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

function appliquerAretes(e: EtatDecalage, ctx: ContexteOutil, aretes: readonly Id[], distance: number, cote: Vec3, texte: string | null, remplace: Derniere<ParamsDec> | null): Transition<EtatDecalage> {
  if (Math.abs(distance) < EPS) return { etat: { ...retour(e), texte, erreur: "Distance nulle : aucun décalage créé." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const r = decalerAretes(base, aretes, Math.abs(distance), cote, optionsDans(ctx));
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params: { aretes, distance: Math.abs(distance), cote } } },
      modele: r.modele,
      selection: idsSelectionnables(r.rapport.crees).filter((id) => id.startsWith("a")),
      operation: "Décalage",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

function saisir(e: EtatDecalage, ctx: ContexteOutil, texte: string): Transition<EtatDecalage> {
  const res = analyserSaisie(texte, contexteSaisie("longueur", ctx));
  if (res.genre === "erreur") return { etat: { ...e, texte, erreur: res.message } };
  if (res.genre !== "longueur") return { etat: { ...e, texte, erreur: `Saisie « ${texte} » non reconnue.` } };
  if (e.etape === 2) {
    // Sens = côté du curseur au moment de la saisie (face : intérieur par défaut).
    const cote = e.distance < 0 ? -1 : 1;
    if (e.face) return appliquerFace(e, ctx, e.face, cote * res.valeur, texte, null);
    return appliquerAretes(e, ctx, e.aretes, res.valeur, e.cote ?? (e.origine as Vec3), texte, null);
  }
  if (corrigeable(e.derniere, ctx)) {
    const d = e.derniere;
    if ("face" in d.params) return appliquerFace(e, ctx, d.params.face, Math.sign(d.params.distance || 1) * res.valeur, texte, d);
    return appliquerAretes(e, ctx, d.params.aretes, res.valeur, d.params.cote, texte, d);
  }
  return { etat: { ...e, texte, erreur: "Choisissez d'abord la face ou les arêtes à décaler." } };
}

export const machineDecalage: MachineOutil<EtatDecalage> = {
  id: ID_DECALAGE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatDecalage> {
    switch (ev.genre) {
      case "survol": {
        if (etat.etape !== 2) return { etat: { ...etat, texte: null, erreur: null } };
        const p = pointDansPlan(etat, ev.rayon);
        if (!p) return { etat };
        return { etat: { ...etat, distance: nouvelleDistance(etat, p), cote: p, texte: null, erreur: null } };
      }
      case "clic": {
        if (etat.etape === 2) {
          const p = pointDansPlan(etat, ev.rayon) ?? etat.cote;
          if (!p) return { etat };
          const d = nouvelleDistance(etat, p);
          if (etat.face) return appliquerFace(etat, ctx, etat.face, d, null, null);
          return appliquerAretes(etat, ctx, etat.aretes, d, p, null, null);
        }
        const { el, cible } = viseeElement(ctx, ev);
        const pre = selectionValide(ctx).filter((id) => contexte(ctx.modele, ctx.dans).aretes[id]);
        // Arêtes présélectionnées : le clic place le point d'où le décalage est mesuré (plan = celui de la chaîne).
        if (pre.length > 0 && !(el?.genre === "face" && cible?.genre === "face" && ctx.selection.length === 0)) {
          const c = contexte(ctx.modele, ctx.dans);
          const premiere = c.aretes[pre[0] as Id];
          if (!premiere) return { etat };
          const A = (c.sommets[premiere.a] as { position: Vec3 }).position;
          const B = (c.sommets[premiere.b] as { position: Vec3 }).position;
          let n: Vec3 | null = null;
          for (const id of pre) {
            const a = c.aretes[id];
            if (!a) continue;
            const w = cross(sub(B, A), sub((c.sommets[a.b] as { position: Vec3 }).position, (c.sommets[a.a] as { position: Vec3 }).position));
            if (len(w) > 1e-6) n = normalize(w);
          }
          n = n ?? (el?.genre === "face" ? el.normale : normalize(cross(sub(B, A), sub(add(A, ev.rayon.direction), A))));
          const p = intersectionRayonPlan(ev.rayon, { origine: A, normale: n }) ?? A;
          return { etat: { ...etat, etape: 2, aretes: pre, face: null, normale: n, origine: p, contour: [A, B], distance: 0, cote: p, texte: null, erreur: null } };
        }
        if (!el || !cible) return { etat: { ...etat, erreur: null } };
        if (el.genre === "face" && cible.genre === "face") {
          if (ev.double && etat.derniere && "face" in etat.derniere.params) return appliquerFace(etat, ctx, cible.id, etat.derniere.params.distance, null, null);
          const P = intersectionRayonPlan(ev.rayon, { origine: el.exterieur[0] as Vec3, normale: el.normale }) ?? (el.exterieur[0] as Vec3);
          return {
            etat: { ...etat, etape: 2, face: cible.id, aretes: [], normale: el.normale, origine: P, contour: el.exterieur, distance: distanceAuContour(el.exterieur, el.normale, P), cote: P, texte: null, erreur: null },
            selection: [cible.id],
          };
        }
        if (el.genre === "arete" && cible.genre === "arete") {
          const ids = idsDuClic(ctx.modele, ctx.dans, cible, 1);
          const c = contexte(ctx.modele, ctx.dans);
          const a = c.aretes[cible.id];
          if (!a) return { etat };
          const A = (c.sommets[a.a] as { position: Vec3 }).position;
          const B = (c.sommets[a.b] as { position: Vec3 }).position;
          const n = normalize(cross(sub(B, A), ev.rayon.direction));
          const P = intersectionRayonPlan(ev.rayon, { origine: A, normale: n }) ?? A;
          return { etat: { ...etat, etape: 2, aretes: ids, face: null, normale: n, origine: P, contour: [A, B], distance: 0, cote: P, texte: null, erreur: null }, selection: ids };
        }
        return { etat };
      }
      case "saisie":
        return saisir(etat, ctx, ev.texte);
      case "touche":
        return ev.etat === "enfoncee" && ev.touche === "Alt" ? { etat: { ...etat, alt: !etat.alt } } : { etat };
      case "echap":
        return etat.etape === 2 ? { etat: { ...retour(etat), texte: null, erreur: null }, selection: [] } : { etat };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const presel = etat.etape === 1 && selectionValide(ctx).some((id) => contexte(ctx.modele, ctx.dans).aretes[id]);
    const indice = etat.etape === 2 ? 2 : presel ? 1 : 0;
    const valeur = etat.texte ?? (etat.etape === 2 ? `~ ${formaterLongueur(Math.abs(etat.distance), ctx.separateurDecimal)}` : formaterLongueur(0, ctx.separateurDecimal));
    return vueModif({
      consigne: consigneDe(ID_DECALAGE, indice),
      mesures: mesures(libelleMesuresDe(ID_DECALAGE, indice), valeur, contexteSaisie("longueur", ctx)),
      apercu: etat.etape === 2 && etat.cote && etat.origine && dist(etat.cote, etat.origine) > TOL ? { lignes: [[etat.origine, etat.cote]], faces: [] } : { lignes: [], faces: [] },
      ctx,
      erreur: etat.erreur,
    });
  },
};
