/**
 * Outil Retourner (cahier-planche §4.21, relevé outils-modification §7) — machine pure.
 *
 * Trois plans semi-transparents (rouge, vert, bleu) passent par le centre de la boîte englobante de la sélection ; le
 * plan survolé est mis en évidence. Clic sur un plan : miroir en place autour du centre. Ctrl (bascule) : retourner ET
 * copier. Glisser un plan en mode copie : la copie miroir est faite de l'autre côté d'un plan décalé ; le champ
 * Mesures donne le décalage (mesuré depuis le centre de la boîte, vers le côté du glisser — choix Fadi), qu'une
 * saisie ajuste. Flèches ← / → / ↑ : plan vert / rouge / bleu (retournement immédiat). Alt (axes de l'objet) non
 * modélisé. Fiche Instructeur absente du relevé : le texte de la barre d'état est celui du catalogue.
 */
import { type Id, retourner } from "../geometrie-libre.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, add, dot, normalize, scale, sub } from "../vecteur.js";
import { type Derniere, contexteSaisie, corrigeable, formaterLongueur, intersectionRayonPlan, mesures, messageErreur } from "./commun-formes.js";
import {
  type Boite,
  VECTEUR_AXE,
  axeDeToucheFleche,
  boiteDe,
  consigneDe,
  enLocal,
  idsSelectionnables,
  libelleMesuresDe,
  pointsDe,
  selectionValide,
  vueModif,
  viseeElement,
} from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { SEUIL_GLISSER, distance2, idsDuClic, optionsDans } from "./selection.js";

export const ID_RETOURNER = "retourner";
type Axe = "x" | "y" | "z";
const AXES: readonly Axe[] = ["x", "y", "z"];

export interface EtatRetourner {
  /** Ids retournés, figés au premier événement qui les connaît (présélection, ou élément cliqué hors plans). */
  readonly entites: readonly Id[];
  readonly copie: boolean;
  /** Plan survolé. */
  readonly survol: Axe | null;
  /** Plan appuyé (début de glisser). */
  readonly appui: { readonly axe: Axe; readonly ecran: { x: number; y: number } } | null;
  /** Glisser en cours : décalage signé du plan miroir. */
  readonly glisse: { readonly axe: Axe; readonly decalage: number } | null;
  /** Le clic qui suit un vrai glisser est ignoré. */
  readonly ignorerClic: boolean;
  readonly texte: string | null;
  readonly erreur: string | null;
  /** Dernière copie miroir (corrigeable au champ Mesures tant que le modèle n'a pas changé : un seul pas). */
  readonly derniere: Derniere<{ readonly axe: Axe; readonly ids: readonly Id[]; readonly signe: 1 | -1 }> | null;
}

function initial(): EtatRetourner {
  return { entites: [], copie: false, survol: null, appui: null, glisse: null, ignorerClic: false, texte: null, erreur: null, derniere: null };
}

const COTE_PLAN = 1.5;

/** Boîte de la sélection (ids présélectionnés, sinon ceux de l'état). */
function boiteCourante(e: EtatRetourner, ctx: ContexteOutil): Boite | null {
  const ids = e.entites.length ? e.entites : selectionValide(ctx);
  return boiteDe(pointsDe(ctx.modele, ids));
}

function ids(e: EtatRetourner, ctx: ContexteOutil): Id[] {
  return e.entites.length ? [...e.entites] : selectionValide(ctx);
}

/** Axe du plan de symétrie touché par le rayon : celui dont le point d'impact est dans le carré, le plus proche. */
function planVise(b: Boite, r: Rayon): Axe | null {
  const taille = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 0.1);
  const demi = Math.max(taille / 2, COTE_PLAN / 2) * 1.05;
  let meilleur: { axe: Axe; t: number } | null = null;
  for (const axe of AXES) {
    const n = VECTEUR_AXE[axe];
    const P = intersectionRayonPlan(r, { origine: b.centre, normale: n });
    if (!P) continue;
    const d = sub(P, b.centre);
    const hors = (["x", "y", "z"] as const).some((k) => k !== axe && Math.abs(d[k]) > demi);
    if (hors) continue;
    const t = dot(sub(P, r.origine), normalize(r.direction));
    if (!meilleur || t < meilleur.t) meilleur = { axe, t };
  }
  return meilleur ? meilleur.axe : null;
}

function operer(
  e: EtatRetourner,
  ctx: ContexteOutil,
  axe: Axe,
  decalage: number,
  copie: boolean,
  texte: string | null,
  remplace: NonNullable<EtatRetourner["derniere"]> | null = null,
): Transition<EtatRetourner> {
  const base = remplace ? remplace.avant : ctx.modele;
  const ctxBase: ContexteOutil = { ...ctx, modele: base };
  const cibles = remplace ? [...remplace.params.ids] : ids(e, ctx);
  const b = boiteDe(pointsDe(base, cibles));
  if (!b || cibles.length === 0) return { etat: { ...e, erreur: "Sélectionnez d'abord ce qu'il faut retourner." } };
  try {
    const L = enLocal(ctxBase);
    const origine = add(b.centre, scale(VECTEUR_AXE[axe], decalage));
    const r = retourner(base, cibles, { origine: L.point(origine), normale: L.vecteur(origine, VECTEUR_AXE[axe]) }, { ...optionsDans(ctx), copie });
    return {
      etat: {
        ...e,
        entites: copie ? [] : cibles,
        appui: null,
        glisse: null,
        texte,
        erreur: null,
        derniere: copie ? { avant: base, apres: r.modele, params: { axe, ids: cibles, signe: decalage < 0 ? -1 : 1 } } : null,
      },
      modele: r.modele,
      selection: copie ? idsSelectionnables(r.rapport.crees) : cibles,
      operation: copie ? "Retourner et copier" : "Retourner",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...e, appui: null, glisse: null, texte, erreur: messageErreur(err) } };
  }
}

/** Décalage du plan miroir : projection du rayon sur la droite (centre, axe), signé. */
function decalageVise(b: Boite, axe: Axe, r: Rayon): number {
  const u = normalize(r.direction);
  const a = VECTEUR_AXE[axe];
  const w = sub(r.origine, b.centre);
  const bb = dot(u, a);
  const d = dot(u, w);
  const ee = dot(a, w);
  const den = 1 - bb * bb;
  if (Math.abs(den) < 1e-9) return 0;
  return (ee - bb * d) / den;
}

export const machineRetourner: MachineOutil<EtatRetourner> = {
  id: ID_RETOURNER,
  initial,

  traiter(etat, ev, ctx): Transition<EtatRetourner> {
    const b = boiteCourante(etat, ctx);
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, survol: b ? planVise(b, ev.rayon) : null, texte: null, erreur: null } };
      case "appui": {
        if (!b) return { etat };
        const axe = planVise(b, ev.rayon);
        return { etat: { ...etat, appui: axe ? { axe, ecran: ev.ecran } : null, glisse: null, ignorerClic: false } };
      }
      case "glisser": {
        if (!etat.appui || !b) return { etat };
        if (!etat.glisse && distance2(etat.appui.ecran, ev.ecran) < SEUIL_GLISSER) return { etat };
        // Glisser le plan : en mode copie, le plan miroir est décalé ; sinon c'est un simple clic à la fin.
        const decalage = etat.copie ? decalageVise(b, etat.appui.axe, ev.rayon) : 0;
        return { etat: { ...etat, glisse: { axe: etat.appui.axe, decalage }, ignorerClic: true } };
      }
      case "relache": {
        const g = etat.glisse;
        if (!etat.appui) return { etat: { ...etat, appui: null } };
        if (g && etat.copie) {
          // Fin du glisser : la copie est faite à ce décalage ; une distance saisie juste avant l'a déjà ajusté.
          return operer({ ...etat, ignorerClic: true }, ctx, g.axe, g.decalage, true, null);
        }
        return { etat: { ...etat, appui: null, glisse: null } };
      }
      case "clic": {
        if (etat.ignorerClic) return { etat: { ...etat, ignorerClic: false } };
        if (!b) {
          // Sans sélection : le clic choisit l'objet à retourner (comme les autres outils), puis les plans apparaissent.
          const { cible } = viseeElement(ctx, ev);
          if (!cible) return { etat };
          const choisis = idsDuClic(ctx.modele, ctx.dans, cible, 1);
          return { etat: { ...etat, entites: choisis }, selection: choisis };
        }
        const axe = planVise(b, ev.rayon);
        if (!axe) return { etat };
        return operer(etat, ctx, axe, 0, etat.copie, null);
      }
      case "touche": {
        if (ev.etat !== "enfoncee") return { etat };
        if (ev.touche === "Ctrl") return { etat: { ...etat, copie: !etat.copie } };
        const axe = axeDeToucheFleche(ev.touche);
        if (!axe) return { etat };
        // ← vert (y), → rouge (x), ↑ bleu (z) : retournement immédiat selon ce plan.
        return operer(etat, ctx, axe, 0, etat.copie, null);
      }
      case "saisie": {
        const res = analyserSaisie(ev.texte, contexteSaisie("longueur", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, texte: ev.texte, erreur: res.message } };
        if (res.genre !== "longueur") return { etat: { ...etat, texte: ev.texte, erreur: `Saisie « ${ev.texte} » non reconnue.` } };
        // Après une copie par glisser : la saisie ajuste le décalage de CETTE copie (un seul pas d'annulation).
        if (corrigeable(etat.derniere, ctx)) {
          const d = etat.derniere;
          return operer(etat, ctx, d.params.axe, d.params.signe * Math.abs(res.valeur), true, ev.texte, d);
        }
        const axe = etat.glisse?.axe ?? etat.appui?.axe ?? etat.survol;
        if (!axe) return { etat: { ...etat, texte: ev.texte, erreur: "Choisissez d'abord un plan de symétrie (clic ou glisser)." } };
        if (!etat.copie) return { etat: { ...etat, texte: ev.texte, erreur: "Le décalage du plan ne s'applique qu'en mode copie (Ctrl)." } };
        const signe = etat.glisse && etat.glisse.decalage < 0 ? -1 : 1;
        return operer(etat, ctx, axe, signe * Math.abs(res.valeur), true, ev.texte);
      }
      case "echap":
        return { etat: { ...initial(), copie: etat.copie, entites: etat.entites } };
    }
  },

  vue(etat, ctx): VueOutil {
    const b = boiteCourante(etat, ctx);
    const lignes: Vec3[][] = [];
    const faces: Vec3[][] = [];
    if (b) {
      const taille = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 0.1);
      const demi = Math.max(taille / 2, COTE_PLAN / 2) * 1.05;
      const g = etat.glisse;
      for (const axe of AXES) {
        const decal = g && g.axe === axe ? g.decalage : 0;
        const c = add(b.centre, scale(VECTEUR_AXE[axe], decal));
        const [u, w] = AXES.filter((k) => k !== axe).map((k) => VECTEUR_AXE[k]) as [Vec3, Vec3];
        const coins = [
          add(add(c, scale(u, -demi)), scale(w, -demi)),
          add(add(c, scale(u, demi)), scale(w, -demi)),
          add(add(c, scale(u, demi)), scale(w, demi)),
          add(add(c, scale(u, -demi)), scale(w, demi)),
        ];
        lignes.push([...coins, coins[0] as Vec3]);
        if (etat.survol === axe || g?.axe === axe) faces.push(coins);
      }
    }
    const indice = etat.glisse || corrigeable(etat.derniere, ctx) ? 2 : etat.copie ? 1 : 0;
    const decal = etat.glisse ? Math.abs(etat.glisse.decalage) : 0;
    return vueModif({
      consigne: consigneDe(ID_RETOURNER, indice),
      mesures: mesures(libelleMesuresDe(ID_RETOURNER, indice), etat.texte ?? formaterLongueur(decal, ctx.separateurDecimal), contexteSaisie("longueur", ctx)),
      apercu: { lignes, faces },
      ctx,
      erreur: etat.erreur,
    });
  },
};
