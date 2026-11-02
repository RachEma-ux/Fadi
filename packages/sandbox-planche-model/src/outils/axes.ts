/**
 * Outil Axes (cahier-planche §4.30, relevé mesure-camera-panneaux §1.4 ; chantier Axes, lot AX-1) — machine pure.
 *
 * Trois clics : origine, direction de l'axe rouge, côté de l'axe vert (projeté perpendiculairement au rouge) ; le bleu
 * complète le trièdre direct. Un double-clic, à toute étape, pose les axes courants (orientation conservée) à l'origine
 * cliquée. Alt (après le clic d'origine) : autre orientation (le vert est renversé, donc le bleu aussi).
 *
 * AX-1 (concept Axes 1.0, décisions AX-D3, AX-D5) :
 * - le repère posé est le **repère de travail** (`Transition.repereTravail`), personnel et hors de l'historique de
 *   géométrie : l'outil ne modifie plus le document (« Repère précédent » le retrouve, Annuler ne le touche pas) ;
 * - points confondus ou alignés : refus nommé, l'étape reste ouverte, rien n'est posé — jamais de repli silencieux (AX02) ;
 * - champ Mesures : à l'étape 1, `[x;y;z]` (absolu, depuis l'origine du repère courant, le long de ses axes) ou
 *   `<dx;dy;dz>` (décalage dans le repère courant) déplace l'origine seule et pose aussitôt (AX03) ; aux étapes 2 et 3,
 *   les mêmes formes donnent le point d'axe (relatif : depuis l'origine choisie).
 * Les coordonnées stockées ne changent jamais.
 */
import type { Repere } from "../annotations.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { REPERE_DU_MODELE, deplacerOrigine, repereDepuisDirections } from "../reperes.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, add, len, normalize, sub } from "../vecteur.js";
import { contexteSaisie, mesures, axesDeSaisie } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

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
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele), ...(depart ? { depart } : {}), ...axesDeSaisie(ctx) });
}

/** Repère du modèle (conservé pour les appelants du lot 4). */
export const REPERE_MODELE: Repere = REPERE_DU_MODELE;

/** Pose : le repère devient le repère de travail ; le document n'est pas modifié (AX-D3). */
const poser = (repere: Repere): Transition<EtatAxes> => ({ etat: initial(), repereTravail: repere, outilPrecedent: true });

/**
 * Repère complété : rouge donné, vert projeté perpendiculairement, bleu = rouge × vert (direct). `null` quand la saisie
 * ne définit pas de repère (direction nulle, directions alignées) : aucune orientation n'est inventée (AX02).
 */
export function repereDepuis(origine: Vec3, x0: Vec3, y0: Vec3, alternatif = false): Repere | null {
  const r = repereDepuisDirections(origine, x0, y0, alternatif);
  return r.ok ? r.repere : null;
}

const MESSAGE_ORIGINE_X = "Repère refusé : le point d'axe est confondu avec l'origine. Choisissez un point distinct.";

function etape2(etat: EtatAxes, point: Vec3, i: Inference | null): Transition<EtatAxes> {
  const x = sub(point, etat.origine as Vec3);
  if (len(x) < 1e-9) return { etat: { ...etat, inference: i, erreur: MESSAGE_ORIGINE_X } };
  return { etat: { ...etat, etape: 3, x: normalize(x), inference: i, erreur: null } };
}

function etape3(etat: EtatAxes, point: Vec3, i: Inference | null): Transition<EtatAxes> {
  const r = repereDepuisDirections(etat.origine as Vec3, etat.x as Vec3, sub(point, etat.origine as Vec3), etat.alternatif);
  if (!r.ok) return { etat: { ...etat, inference: i, erreur: r.message } };
  return poser(r.repere);
}

export const machineAxes: MachineOutil<EtatAxes> = {
  id: ID_AXES,
  initial,

  traiter(etat, ev, ctx): Transition<EtatAxes> {
    const courant = ctx.repere ?? REPERE_DU_MODELE;
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, inference: inferer2(ctx, ev.rayon, ev.tolerance, etat.origine ?? undefined), erreur: null } };
      case "clic": {
        const i = inferer2(ctx, ev.rayon, ev.tolerance, etat.origine ?? undefined);
        if (ev.double) {
          // Axes tels qu'orientés, à l'origine cliquée (ou déjà posée) ; un rouge déjà choisi est gardé.
          const origine = etat.origine ?? i.point;
          const r = etat.x ? repereDepuisDirections(origine, etat.x, courant.y, etat.alternatif) : deplacerOrigine(courant, origine);
          return r.ok ? poser(r.repere) : { etat: { ...etat, inference: i, erreur: r.message } };
        }
        if (etat.etape === 1) return { etat: { ...etat, etape: 2, origine: i.point, inference: i, erreur: null } };
        if (etat.etape === 2) return etape2(etat, i.point, i);
        return etape3(etat, i.point, i);
      }
      case "touche":
        if (ev.touche === "Alt" && ev.etat === "enfoncee" && etat.etape > 1) return { etat: { ...etat, alternatif: !etat.alternatif } };
        return { etat };
      case "saisie": {
        const s = analyserSaisie(ev.texte, contexteSaisie("point", ctx));
        if (s.genre === "erreur") return { etat: { ...etat, erreur: s.message } };
        if (s.genre !== "point") return { etat: { ...etat, erreur: "Saisie attendue : un point [x;y;z] ou un décalage <dx;dy;dz>." } };
        if (etat.etape === 1) {
          // Origine seule : absolue dans le repère courant, ou décalée depuis son origine ; orientation conservée.
          const origine = s.reference === "absolue" ? s.point : add(courant.origine, s.point);
          const r = deplacerOrigine(courant, origine);
          return r.ok ? poser(r.repere) : { etat: { ...etat, erreur: r.message } };
        }
        const point = s.reference === "absolue" ? s.point : add(etat.origine as Vec3, s.point);
        return etat.etape === 2 ? etape2(etat, point, etat.inference) : etape3(etat, point, etat.inference);
      }
      case "echap":
        // Échap annule tout l'aperçu : rien n'est posé, aucun contexte n'est poussé.
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
        lignes.push([etat.origine, add(etat.origine, etat.x)]);
        const r = repereDepuis(etat.origine, etat.x, sub(etat.inference.point, etat.origine), etat.alternatif);
        if (r) lignes.push([etat.origine, add(etat.origine, r.y)], [etat.origine, add(etat.origine, r.z)]);
      }
    }
    return vueModif({ consigne, mesures: mesures("Origine", "", contexteSaisie("point", ctx)), inference: etat.inference, apercu: { lignes, faces: [] }, ctx, erreur: etat.erreur });
  },
};
