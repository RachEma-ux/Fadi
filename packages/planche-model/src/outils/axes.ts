/**
 * Outil Axes (cahier-planche §4.30, relevé mesure-camera-panneaux §1.4) — machine pure.
 *
 * Trois clics : origine, direction de l'axe rouge, direction de l'axe vert (projetée perpendiculairement au rouge) ;
 * le bleu complète le trièdre direct. Un double-clic, à toute étape, pose le repère tel qu'il est orienté (axes
 * courants) à l'origine cliquée. Alt (après le clic d'origine) : autre orientation (le vert est renversé, donc le
 * bleu aussi). Le repère est le REPÈRE DE SAISIE de la Planche (R5, C12) : `Modele.annotations.repere` ; les
 * coordonnées stockées ne changent jamais. Après le dernier clic, l'outil précédent revient ; annulable.
 */
import { modifierAnnotations } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, ORIGINE, cross, dot, len, normalize, scale, sub } from "../vecteur.js";
import { contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import type { Repere } from "../annotations.js";

export const ID_AXES = "axes";

export interface EtatAxes {
  readonly etape: 1 | 2 | 3;
  readonly origine: Vec3 | null;
  readonly x: Vec3 | null;
  readonly alternatif: boolean;
  readonly inference: Inference | null;
  readonly erreur: string | null;
}

const initial = (): EtatAxes => ({ etape: 1, origine: null, x: null, alternatif: false, inference: null, erreur: null });

function inferer2(ctx: ContexteOutil, rayon: Rayon, tolerance: number, depart?: Vec3): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele), ...(depart ? { depart } : {}), ...(ctx.repere ? { axes: ctx.repere } : {}) });
}

export const REPERE_MODELE: Repere = { origine: ORIGINE, x: AXE_X, y: AXE_Y, z: AXE_Z };

function poser(_etat: EtatAxes, ctx: ContexteOutil, repere: Repere): Transition<EtatAxes> {
  try {
    const r = modifierAnnotations(ctx.modele, (a) => {
      a.repere = repere;
    });
    return { etat: initial(), modele: r.modele, selection: ctx.selection, operation: "Axes", outilPrecedent: true };
  } catch (err) {
    return { etat: { ...initial(), erreur: messageErreur(err) } };
  }
}

/** Repère complété : rouge donné, vert projeté perpendiculairement, bleu = rouge × vert (direct). */
export function repereDepuis(origine: Vec3, x0: Vec3, y0: Vec3, alternatif = false): Repere | null {
  if (len(x0) < 1e-9) return null;
  const x = normalize(x0);
  let y = sub(y0, scale(x, dot(y0, x)));
  if (len(y) < 1e-9) {
    // Vert dégénéré : perpendiculaire quelconque dans le plan du sol si possible.
    y = cross(AXE_Z, x);
    if (len(y) < 1e-9) y = cross(AXE_X, x);
  }
  y = normalize(y);
  if (alternatif) y = scale(y, -1);
  const z = normalize(cross(x, y));
  return { origine, x, y, z };
}

export const machineAxes: MachineOutil<EtatAxes> = {
  id: ID_AXES,
  initial,

  traiter(etat, ev, ctx): Transition<EtatAxes> {
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, inference: inferer2(ctx, ev.rayon, ev.tolerance, etat.origine ?? undefined), erreur: null } };
      case "clic": {
        const i = inferer2(ctx, ev.rayon, ev.tolerance, etat.origine ?? undefined);
        const courant = ctx.repere ?? REPERE_MODELE;
        if (ev.double) {
          // Axes tels qu'orientés, à l'origine cliquée (ou à l'origine déjà posée).
          const origine = etat.origine ?? i.point;
          const x = etat.x ?? courant.x;
          const r = repereDepuis(origine, x, etat.x ? courant.y : courant.y, etat.alternatif);
          return r ? poser(etat, ctx, r) : { etat: { ...etat, erreur: "Orientation impossible." } };
        }
        if (etat.etape === 1) return { etat: { ...etat, etape: 2, origine: i.point, inference: i, erreur: null } };
        if (etat.etape === 2) {
          const x = sub(i.point, etat.origine as Vec3);
          if (len(x) < 1e-9) return { etat: { ...etat, inference: i, erreur: "Choisissez un point distinct de l'origine pour l'axe rouge." } };
          return { etat: { ...etat, etape: 3, x: normalize(x), inference: i, erreur: null } };
        }
        const r = repereDepuis(etat.origine as Vec3, etat.x as Vec3, sub(i.point, etat.origine as Vec3), etat.alternatif);
        if (!r) return { etat: { ...etat, inference: i, erreur: "Orientation impossible." } };
        return poser(etat, ctx, r);
      }
      case "touche":
        if (ev.touche === "Alt" && ev.etat === "enfoncee" && etat.etape > 1) return { etat: { ...etat, alternatif: !etat.alternatif } };
        return { etat };
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Axes." } };
      case "echap":
        return { etat: initial() };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const consigne = consigneDe(ID_AXES, etat.etape - 1);
    const lignes: Vec3[][] = [];
    if (etat.origine && etat.inference) {
      if (etat.etape === 2) lignes.push([etat.origine, etat.inference.point]);
      if (etat.etape === 3 && etat.x) {
        lignes.push([etat.origine, { x: etat.origine.x + etat.x.x, y: etat.origine.y + etat.x.y, z: etat.origine.z + etat.x.z }]);
        const r = repereDepuis(etat.origine, etat.x, sub(etat.inference.point, etat.origine), etat.alternatif);
        if (r) lignes.push([etat.origine, { x: etat.origine.x + r.y.x, y: etat.origine.y + r.y.y, z: etat.origine.z + r.y.z }], [etat.origine, { x: etat.origine.x + r.z.x, y: etat.origine.y + r.z.y, z: etat.origine.z + r.z.z }]);
      }
    }
    return vueModif({ consigne, mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)), inference: etat.inference, apercu: { lignes, faces: [] }, ctx, erreur: etat.erreur });
  },
};
