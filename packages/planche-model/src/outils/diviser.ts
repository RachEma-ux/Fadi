/**
 * Outil Diviser (cahier-planche §4.26, relevé outils-modification §10.2) — machine pure.
 *
 * Étape unique : « Sélectionnez ou saisissez le nombre de segments », champ « Segments » (défaut 5). Un clic choisit
 * l'arête (ou, sur une courbe, l'arête visée) ; au survol, les points de division apparaissent. Un nombre tapé puis
 * Entrée divise l'arête choisie (ou présélectionnée) et rend la main à l'outil Sélection (`Transition.outil`).
 */
import { type Id, contexte, diviser } from "../geometrie-libre.js";
import { COULEURS } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, dist, lerp } from "../vecteur.js";
import { contexteSaisie, formaterLongueur, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, libelleMesuresDe, selectionValide, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_DIVISER = "diviser";
export const SEGMENTS_PAR_DEFAUT = 5;

export interface EtatDiviser {
  /** Arête choisie par un clic (sinon la présélection de l'interface, sinon l'arête survolée). */
  readonly arete: Id | null;
  readonly survol: Id | null;
  readonly segments: number;
  readonly erreur: string | null;
}

function initial(): EtatDiviser {
  return { arete: null, survol: null, segments: SEGMENTS_PAR_DEFAUT, erreur: null };
}

/** Arête visée : l'arête de l'élément visé ; une courbe se divise arête par arête (choix Fadi). */
function areteVisee(ctx: ContexteOutil, ev: Parameters<typeof viseeElement>[1]): Id | null {
  const { el, cible } = viseeElement(ctx, ev);
  return el?.genre === "arete" && cible?.genre === "arete" ? cible.id : null;
}

function cibleCourante(e: EtatDiviser, ctx: ContexteOutil): Id | null {
  if (e.arete) return e.arete;
  const c = contexte(ctx.modele, ctx.dans);
  const pre = selectionValide(ctx).filter((id) => c.aretes[id]);
  return pre.length === 1 ? (pre[0] as Id) : null;
}

function points(e: EtatDiviser, ctx: ContexteOutil, id: Id | null): readonly Vec3[] {
  const a = id ? contexte(ctx.modele, ctx.dans).aretes[id] : undefined;
  if (!a) return [];
  const c = contexte(ctx.modele, ctx.dans);
  const A = (c.sommets[a.a] as { position: Vec3 }).position;
  const B = (c.sommets[a.b] as { position: Vec3 }).position;
  return Array.from({ length: e.segments - 1 }, (_, k) => lerp(A, B, (k + 1) / e.segments));
}

export const machineDiviser: MachineOutil<EtatDiviser> = {
  id: ID_DIVISER,
  initial,

  traiter(etat, ev, ctx): Transition<EtatDiviser> {
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, survol: areteVisee(ctx, ev), erreur: null } };
      case "clic": {
        const a = areteVisee(ctx, ev);
        return { etat: { ...etat, arete: a, erreur: null }, selection: a ? [a] : [] };
      }
      case "saisie": {
        const res = analyserSaisie(ev.texte, contexteSaisie("segments", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, erreur: res.message } };
        if (res.genre !== "segments") return { etat: { ...etat, erreur: `Saisie « ${ev.texte} » non reconnue.` } };
        const cible = cibleCourante(etat, ctx);
        if (!cible) return { etat: { ...etat, segments: res.nombre, erreur: "Cliquez d'abord sur l'arête à diviser." } };
        try {
          const r = diviser(ctx.modele, cible, res.nombre, optionsDans(ctx));
          return { etat: { ...initial(), segments: res.nombre }, modele: r.modele, selection: [], operation: "Diviser", outil: "selection" };
        } catch (err) {
          return { etat: { ...etat, segments: res.nombre, erreur: messageErreur(err) } };
        }
      }
      case "touche":
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
      case "echap":
        return { etat: { ...initial(), segments: etat.segments } };
    }
  },

  vue(etat, ctx): VueOutil {
    const cible = etat.arete ?? etat.survol ?? cibleCourante(etat, ctx);
    const c = contexte(ctx.modele, ctx.dans);
    const a = cible ? c.aretes[cible] : undefined;
    const A = a ? (c.sommets[a.a] as { position: Vec3 }).position : null;
    const B = a ? (c.sommets[a.b] as { position: Vec3 }).position : null;
    const pts = points(etat, ctx, cible);
    // Points de division : petits traits le long de l'arête (le rendu trace des polylignes).
    const demi = A && B ? dist(A, B) / etat.segments / 20 : 0;
    const sens = A && B ? lerp(A, B, 1) : null;
    const traits = pts.map((p) => {
      const u = sens && A ? { x: (sens.x - A.x) / (dist(A, sens) || 1), y: (sens.y - A.y) / (dist(A, sens) || 1), z: (sens.z - A.z) / (dist(A, sens) || 1) } : { x: 1, y: 0, z: 0 };
      return [
        { x: p.x - u.x * demi, y: p.y - u.y * demi, z: p.z - u.z * demi },
        { x: p.x + u.x * demi, y: p.y + u.y * demi, z: p.z + u.z * demi },
      ] as readonly Vec3[];
    });
    const infobulle =
      A && B
        ? {
            point: lerp(A, B, 0.5),
            type: "milieu" as const,
            couleur: COULEURS.milieu,
            libelle: { en: `${etat.segments} segments Length ${dist(A, B).toFixed(2)} m`, fr: `${etat.segments} segments · longueur ${formaterLongueur(dist(A, B), ctx.separateurDecimal)}` },
            verrouillee: false,
          }
        : null;
    return vueModif({
      consigne: consigneDe(ID_DIVISER, 0),
      mesures: mesures(libelleMesuresDe(ID_DIVISER, 0), String(etat.segments), contexteSaisie("segments", ctx)),
      inference: infobulle,
      apercu: { lignes: traits, faces: [] },
      ctx,
      survol: cible ? [cible] : [],
      erreur: etat.erreur,
    });
  },
};
