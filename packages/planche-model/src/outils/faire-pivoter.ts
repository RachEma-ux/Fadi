/**
 * Outil Faire pivoter (cahier-planche §4.17, relevé outils-modification §3) — machine pure.
 *
 * Étape 1 : centre de rotation (sans sélection, le clic choisit aussi l'objet). Étape 2 : point de départ. Étape 3 :
 * angle au curseur (accroché aux multiples de 15° à ±1,5° près : affiché sans « ~ ») ou saisi. Le plan du rapporteur
 * est celui de la face survolée, sinon le sol ; ← / → / ↑ (avant le 1ᵉʳ clic) le verrouillent sur la normale verte /
 * rouge / bleue, un 2ᵉ appui le libère. Saisie : « 30 » = 30°, « 1:2 » = pente atan(1/2), sens = côté du curseur ;
 * négatif = sens inverse. Ctrl (bascule) = copie. Après une copie, « x5 » = réseau polaire de 5 copies au même pas,
 * « /3 » = 3 intervalles ; retaper un angle corrige. Un réseau = un seul pas d'annulation.
 * Lot L18 : Maj maintenue avant le 1ᵉʳ clic garde le plan du rapporteur tel qu'il est (verrou relâché avec Maj) ; après
 * le 1ᵉʳ clic, ← / → / ↑ verrouillent la branche (départ et angle) sur l'axe vert / rouge / bleu projeté dans le plan
 * de rotation, un 2ᵉ appui la libère ; un glisser depuis le centre définit un axe de rotation quelconque (centre au
 * point d'appui, axe vers le point relâché), puis départ et angle comme d'habitude.
 */
import { type Id, tourner } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, TOL, add, cross, dist, dot, len, normalize, scale, sub } from "../vecteur.js";
import {
  type Derniere,
  angleSigne,
  contexteSaisie,
  corrigeable,
  formaterAngle,
  mesures,
  messageErreur,
  viserLibre,
  viserSurPlan,
} from "./commun-formes.js";
import {
  VECTEUR_AXE,
  axeDeToucheFleche,
  consigneDe,
  enLocal,
  idsSelectionnables,
  libelleMesuresDe,
  selectionValide,
  vueModif,
  viseeElement,
} from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import { SEUIL_GLISSER, distance2, idsDuClic, optionsDans } from "./selection.js";

export const ID_PIVOTER = "faire-pivoter";
const PAS_ACCROCHE = (15 * Math.PI) / 180;
const TOL_ACCROCHE = (1.5 * Math.PI) / 180;

interface ParamsPivoter {
  readonly entites: readonly Id[];
  readonly centre: Vec3;
  readonly normale: Vec3;
  readonly angle: number;
  readonly copie: boolean;
  /** Réseau polaire éventuel : nombre de copies. */
  readonly copies: number | null;
}

export interface EtatPivoter {
  readonly etape: 1 | 2 | 3;
  readonly copie: boolean;
  /** Plan verrouillé par une flèche. */
  readonly fleche: { readonly touche: string; readonly axe: "x" | "y" | "z" } | null;
  readonly entites: readonly Id[];
  readonly centre: Vec3 | null;
  readonly normale: Vec3;
  readonly depart: Vec3 | null;
  /** Angle courant signé (radians), accroché ou non. */
  readonly angle: number;
  readonly accroche: boolean;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsPivoter> | null;
  /** Lot L18 : plan du rapporteur gardé tant que Maj est maintenue (avant le 1ᵉʳ clic). */
  readonly verrouMaj: Vec3 | null;
  /** Lot L18 : branche verrouillée sur un axe après le 1ᵉʳ clic (direction dans le plan de rotation). */
  readonly branche: { readonly touche: string; readonly direction: Vec3 } | null;
  /** Lot L18 : glisser depuis le centre (axe quelconque) : point d'appui et point courant. */
  readonly appui: { readonly ecran: { x: number; y: number }; readonly point: Vec3; readonly entites: readonly Id[] } | null;
  readonly glisse: Vec3 | null;
  /** Le clic qui suit un vrai glisser est ignoré. */
  readonly ignorerClic: boolean;
}

function initial(): EtatPivoter {
  return { etape: 1, copie: false, fleche: null, entites: [], centre: null, normale: AXE_Z, depart: null, angle: 0, accroche: false, inference: null, texte: null, erreur: null, derniere: null, verrouMaj: null, branche: null, appui: null, glisse: null, ignorerClic: false };
}

const retour = (e: EtatPivoter): EtatPivoter => ({ ...e, etape: 1, centre: null, depart: null, angle: 0, accroche: false, inference: null, normale: e.fleche ? VECTEUR_AXE[e.fleche.axe] : AXE_Z, branche: null, appui: null, glisse: null });

export const ERREUR_BRANCHE_AXE = "Cet axe est perpendiculaire au plan de rotation : la branche ne peut pas s'y verrouiller.";

/** Point de la branche : projeté sur l'axe verrouillé (lot L18), sinon tel quel. */
function surBranche(e: EtatPivoter, c: Vec3, p: Vec3): Vec3 {
  if (!e.branche) return p;
  const d = e.branche.direction;
  return add(c, scale(d, dot(sub(p, c), d)));
}

function ciblesDe(e: EtatPivoter, ctx: ContexteOutil): Id[] {
  return e.entites.length ? [...e.entites] : selectionValide(ctx);
}

function accrocher(a: number): { angle: number; accroche: boolean } {
  const k = Math.round(a / PAS_ACCROCHE);
  return Math.abs(a - k * PAS_ACCROCHE) <= TOL_ACCROCHE ? { angle: k * PAS_ACCROCHE, accroche: true } : { angle: a, accroche: false };
}

function appliquer(e: EtatPivoter, ctx: ContexteOutil, p: ParamsPivoter, texte: string | null, remplace: Derniere<ParamsPivoter> | null): Transition<EtatPivoter> {
  if (Math.abs(p.angle) < 1e-12) return { etat: { ...retour(e), texte, erreur: "Angle nul : rien n'a été tourné." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const L = enLocal({ ...ctx, modele: base });
    const axe = normalize(L.vecteur(p.centre, p.normale));
    const r = tourner(base, p.entites, L.point(p.centre), axe, p.angle, {
      ...optionsDans(ctx),
      ...(p.copies !== null ? { copies: p.copies } : p.copie ? { copie: true } : {}),
    });
    const copie = p.copie || p.copies !== null;
    return {
      etat: { ...retour(e), entites: p.entites, texte, erreur: null, derniere: { avant: base, apres: r.modele, params: p } },
      modele: r.modele,
      selection: copie ? idsSelectionnables(r.rapport.crees) : p.entites,
      operation: copie ? "Rotation et copie" : "Rotation",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

/** Plan de rotation (normale) d'une visée libre : verrou par flèche, sinon face survolée, sinon sol. */
function normaleVisee(e: EtatPivoter, ctx: ContexteOutil, ev: Parameters<typeof viserLibre>[1]): { inference: Inference; normale: Vec3 } {
  const v = viserLibre(ctx, ev);
  return { inference: v.inference, normale: e.fleche ? VECTEUR_AXE[e.fleche.axe] : (e.verrouMaj ?? v.normale) };
}

function saisir(e: EtatPivoter, ctx: ContexteOutil, texte: string): Transition<EtatPivoter> {
  const res = analyserSaisie(texte, contexteSaisie("angle-reseau", ctx));
  if (res.genre === "erreur") return { etat: { ...e, texte, erreur: res.message } };
  if (e.etape === 3 && e.centre && e.depart) {
    if (res.genre !== "angle") return { etat: { ...e, texte, erreur: "Saisissez d'abord l'angle, puis le réseau." } };
    // Sens = côté du curseur ; une valeur négative inverse.
    const sens = e.angle < 0 ? -1 : 1;
    return appliquer(e, ctx, { entites: ciblesDe(e, ctx), centre: e.centre, normale: e.normale, angle: sens * res.radians, copie: e.copie, copies: null }, texte, null);
  }
  if (e.etape === 1 && corrigeable(e.derniere, ctx)) {
    const d = e.derniere;
    if (res.genre === "reseau") {
      if (!d.params.copie && d.params.copies === null) return { etat: { ...e, texte, erreur: "Le réseau suppose une copie : activez Ctrl avant de pivoter." } };
      const copies = res.nombre;
      const angle = res.mode === "divisions" ? d.params.angle / res.nombre : d.params.angle;
      return { ...appliquer(e, ctx, { ...d.params, angle, copie: true, copies }, texte, d), selection: [] };
    }
    if (res.genre === "angle") {
      const sens = d.params.angle < 0 ? -1 : 1;
      return appliquer(e, ctx, { ...d.params, angle: sens * res.radians }, texte, d);
    }
  }
  return { etat: { ...e, texte, erreur: "Placez d'abord le centre et le point de départ de la rotation." } };
}

export const machinePivoter: MachineOutil<EtatPivoter> = {
  id: ID_PIVOTER,
  initial,

  traiter(etat, ev, ctx): Transition<EtatPivoter> {
    switch (ev.genre) {
      case "survol": {
        if (etat.etape === 1) {
          const v = normaleVisee(etat, ctx, ev);
          return { etat: { ...etat, normale: v.normale, inference: v.inference, texte: null, erreur: null } };
        }
        const c = etat.centre as Vec3;
        const inf0 = viserSurPlan(ctx, ev, { origine: c, normale: etat.normale }, c, etat.fleche !== null);
        const inf = etat.branche ? { ...inf0, point: surBranche(etat, c, inf0.point), verrouillee: true } : inf0;
        if (etat.etape === 2) return { etat: { ...etat, inference: inf, texte: null, erreur: null } };
        const d = etat.depart as Vec3;
        const brut = angleSigne(sub(d, c), sub(inf.point, c), etat.normale);
        const a = accrocher(brut);
        return { etat: { ...etat, inference: inf, angle: a.angle, accroche: a.accroche, texte: null, erreur: null } };
      }
      case "clic": {
        if (etat.ignorerClic) return { etat: { ...etat, ignorerClic: false } };
        if (etat.etape === 1) {
          let entites = etat.entites;
          let selection: readonly string[] | undefined;
          if (selectionValide(ctx).length === 0 && entites.length === 0) {
            const { cible } = viseeElement(ctx, ev);
            if (!cible) return { etat: { ...etat, erreur: "Cliquez d'abord sur l'élément à faire pivoter." } };
            entites = idsDuClic(ctx.modele, ctx.dans, cible, 1);
            selection = entites;
          }
          const v = normaleVisee(etat, ctx, ev);
          return { etat: { ...etat, etape: 2, entites, centre: v.inference.point, normale: v.normale, inference: v.inference, angle: 0, texte: null, erreur: null, derniere: null }, ...(selection ? { selection } : {}) };
        }
        const c = etat.centre as Vec3;
        const inf0 = viserSurPlan(ctx, ev, { origine: c, normale: etat.normale }, c, etat.fleche !== null);
        const inf = etat.branche ? { ...inf0, point: surBranche(etat, c, inf0.point), verrouillee: true } : inf0;
        if (etat.etape === 2) {
          if (dist(inf.point, c) <= TOL) return { etat: { ...etat, erreur: "Le point de départ doit être distinct du centre." } };
          return { etat: { ...etat, etape: 3, depart: inf.point, inference: inf, angle: 0, accroche: false, texte: null, erreur: null } };
        }
        const d = etat.depart as Vec3;
        const a = accrocher(angleSigne(sub(d, c), sub(inf.point, c), etat.normale));
        return appliquer(etat, ctx, { entites: ciblesDe(etat, ctx), centre: c, normale: etat.normale, angle: a.angle, copie: etat.copie, copies: null }, null, null);
      }
      case "saisie":
        return saisir(etat, ctx, ev.texte);
      case "touche": {
        if (ev.touche === "Maj") {
          if (ev.etat === "relachee") return { etat: { ...etat, verrouMaj: null } };
          return etat.etape === 1 && !etat.fleche ? { etat: { ...etat, verrouMaj: etat.normale } } : { etat };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (ev.touche === "Ctrl") return { etat: { ...etat, copie: !etat.copie } };
        const axe = axeDeToucheFleche(ev.touche);
        if (axe && etat.etape === 1) {
          if (etat.fleche?.touche === ev.touche) return { etat: { ...etat, fleche: null, normale: AXE_Z } };
          return { etat: { ...etat, fleche: { touche: ev.touche, axe }, normale: VECTEUR_AXE[axe] } };
        }
        if (axe && etat.etape >= 2) {
          if (etat.branche?.touche === ev.touche) return { etat: { ...etat, branche: null, erreur: null } };
          const A = VECTEUR_AXE[axe];
          const dans = sub(A, scale(etat.normale, dot(A, etat.normale)));
          if (len(dans) < 0.1) return { etat: { ...etat, erreur: ERREUR_BRANCHE_AXE } };
          return { etat: { ...etat, branche: { touche: ev.touche, direction: normalize(dans) }, erreur: null } };
        }
        return { etat };
      }
      case "echap":
        return etat.etape > 1 ? { etat: { ...retour(etat), texte: null, erreur: null } } : { etat };
      case "appui": {
        if (etat.etape !== 1) return { etat };
        let entites = etat.entites.length ? etat.entites : selectionValide(ctx);
        if (entites.length === 0) {
          const { cible } = viseeElement(ctx, ev);
          entites = cible ? idsDuClic(ctx.modele, ctx.dans, cible, 1) : [];
        }
        return { etat: { ...etat, appui: { ecran: ev.ecran, point: viserLibre(ctx, ev).inference.point, entites }, glisse: null, ignorerClic: false } };
      }
      case "glisser": {
        if (!etat.appui) return { etat };
        if (!etat.glisse && distance2(etat.appui.ecran, ev.ecran) < SEUIL_GLISSER) return { etat };
        const v = viserLibre(ctx, ev, etat.appui.point);
        return { etat: { ...etat, glisse: v.inference.point, inference: v.inference, ignorerClic: true } };
      }
      case "relache": {
        const a = etat.appui;
        const g = etat.glisse;
        if (!a || !g) return { etat: { ...etat, appui: null, glisse: null } };
        const axe = sub(g, a.point);
        if (len(axe) <= TOL) return { etat: { ...etat, appui: null, glisse: null, erreur: "Glissez plus loin du centre pour définir l'axe de rotation." } };
        if (a.entites.length === 0) return { etat: { ...etat, appui: null, glisse: null, erreur: "Cliquez d'abord sur l'élément à faire pivoter." } };
        // Axe quelconque : centre au point d'appui, normale du rapporteur = direction glissée ; le clic qui suit est ignoré.
        return {
          etat: { ...etat, etape: 2, entites: a.entites, centre: a.point, normale: normalize(axe), appui: null, glisse: null, ignorerClic: true, angle: 0, texte: null, erreur: null, derniere: null },
          selection: a.entites,
        };
      }
    }
  },

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    const avecSel = ciblesDe(etat, ctx).length > 0;
    const indice = etat.etape === 1 ? (avecSel ? 1 : 0) : etat.etape === 2 ? 2 : etat.copie ? 4 : 3;
    const lignes: Vec3[][] = [];
    const c = etat.centre;
    if (c && etat.etape >= 2) {
      const R = etat.depart ? dist(etat.depart, c) : etat.inference ? dist(etat.inference.point, c) : 1;
      if (R > TOL) {
        // Rapporteur : cercle dans le plan de rotation, centré sur le centre de rotation.
        const u0 = etat.depart ? normalize(sub(etat.depart, c)) : etat.inference ? normalize(sub(etat.inference.point, c)) : normalize(cross(etat.normale, AXE_Z));
        const w0 = normalize(cross(etat.normale, u0));
        const cercle: Vec3[] = [];
        for (let i = 0; i <= 48; i++) cercle.push(add(c, add(scale(u0, R * Math.cos((2 * Math.PI * i) / 48)), scale(w0, R * Math.sin((2 * Math.PI * i) / 48)))));
        lignes.push(cercle);
      }
      if (etat.depart) lignes.push([c, etat.depart]);
      if (etat.branche) lignes.push([add(c, scale(etat.branche.direction, -R)), add(c, scale(etat.branche.direction, R))]);
      if (etat.inference && len(sub(etat.inference.point, c)) > TOL) lignes.push([c, etat.inference.point]);
    }
    if (etat.appui && etat.glisse) lignes.push([etat.appui.point, etat.glisse]);
    const valeur = etat.texte ?? (etat.etape === 3 ? `${etat.accroche ? "" : "~ "}${formaterAngle(Math.abs((etat.angle * 180) / Math.PI), sep)}` : "");
    return vueModif({
      consigne: consigneDe(ID_PIVOTER, indice),
      mesures: mesures(libelleMesuresDe(ID_PIVOTER, indice), valeur, contexteSaisie("angle-reseau", ctx)),
      inference: etat.inference,
      apercu: { lignes, faces: [] },
      ctx,
      erreur: etat.erreur,
    });
  },
};
