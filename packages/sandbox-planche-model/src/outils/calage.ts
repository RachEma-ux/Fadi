/**
 * Outil Calage (cas 4, lot C4, étape 1 : D10-F23a-002 ; statut `fadi` au catalogue) — machine pure.
 *
 * Un clic sur un fond non verrouillé y pose le point de calage suivant (A, B, C…) au pixel visé ; la position se saisit
 * ensuite dans le panneau Fonds calés, puis « Caler » applique la méthode choisie. Le fond visé est le premier que le
 * rayon traverse (plan horizontal à son altitude, dans son contour). Un pas d'historique « Point de calage » par clic.
 */
import { ajouterPointCalage, fondsDe, versPixel, type Fond } from "../fonds.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { vueModif } from "./commun-modif.js";

export const ID_CALAGE = "calage";
export const CONSIGNE_CALAGE = "Cliquez le fond pour poser le point de calage suivant ; la position se saisit dans le panneau Fonds calés.";
export const ERREUR_CALAGE_LECTURE = "Lecture seule : un point de calage modifierait la Planche.";
export const ERREUR_CALAGE_HORS = "Aucun fond déverrouillé sous le pointeur.";
export const ERREUR_CALAGE_PLEIN = "Ce fond a déjà 26 points de calage.";

export interface EtatCalage {
  readonly erreur: string | null;
  /** Dernier point posé (l'interface ouvre le panneau sur son fond). */
  readonly pose: { readonly fond: string; readonly point: string } | null;
}

/**
 * Premier fond déverrouillé traversé par le rayon, et le pixel visé. À distance égale (fonds superposés à la même
 * altitude), le fond choisi dans le panneau (`prefere`) l'emporte, sinon le dernier de la liste (dessiné au-dessus).
 */
export function fondVise(fonds: readonly Fond[], r: Rayon, prefere?: string): { readonly fond: Fond; readonly u: number; readonly v: number } | null {
  let meilleur: { fond: Fond; u: number; v: number; t: number } | null = null;
  for (const f of fonds) {
    if (f.verrouille || f.vertical || Math.abs(r.direction.z) < 1e-9) continue;
    const t = (f.altitude - r.origine.z) / r.direction.z;
    if (!(t > 0)) continue;
    const px = versPixel(f.pose, { x: r.origine.x + t * r.direction.x, y: r.origine.y + t * r.direction.y });
    if (px.u < 0 || px.v < 0 || px.u > f.largeurPx || px.v > f.hauteurPx) continue;
    const egal = meilleur !== null && Math.abs(t - meilleur.t) <= 1e-9 * Math.max(1, Math.abs(t));
    if (!meilleur || (!egal && t < meilleur.t) || (egal && meilleur.fond.id !== prefere)) meilleur = { fond: f, u: px.u, v: px.v, t };
  }
  return meilleur && { fond: meilleur.fond, u: meilleur.u, v: meilleur.v };
}

export const machineCalage: MachineOutil<EtatCalage> = {
  id: ID_CALAGE,
  initial: () => ({ erreur: null, pose: null }),

  traiter(etat, ev, ctx: ContexteOutil): Transition<EtatCalage> {
    switch (ev.genre) {
      case "clic": {
        if (ctx.lecture) return { etat: { ...etat, erreur: ERREUR_CALAGE_LECTURE } };
        const v = fondVise(fondsDe(ctx.modele), ev.rayon, ctx.fondCourant);
        if (!v) return { etat: { ...etat, erreur: ERREUR_CALAGE_HORS } };
        const r = ajouterPointCalage(ctx.modele, v.fond.id, { u: Math.round(v.u * 10) / 10, v: Math.round(v.v * 10) / 10 });
        if (!r.ok) return { etat: { ...etat, erreur: r.erreur === "points" ? ERREUR_CALAGE_PLEIN : ERREUR_CALAGE_HORS } };
        return { etat: { erreur: null, pose: { fond: v.fond.id, point: r.point! } }, modele: r.modele, operation: "Point de calage" };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Calage." } };
      case "echap":
        return { etat: { ...etat, erreur: null } };
      default:
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    return vueModif({ consigne: CONSIGNE_CALAGE, mesures: { libelle: "Mesures", valeur: "", saisie: { attendu: "aucune", separateurDecimal: ctx.separateurDecimal } }, ctx, erreur: etat.erreur, inference: null, survol: [] });
  },
};
