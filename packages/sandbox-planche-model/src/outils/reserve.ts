/**
 * Outil Réserve (cas 4 du catalogue des extensions, étape 7b : D11-F18-037 ; statut `fadi` au catalogue) — machine pure.
 *
 * Un clic (ou un toucher sur tablette) épingle une réserve ouverte au point visé, sur l'objet de la racine touché s'il y
 * en a un ; la fiche (lot, entreprise, description, échéance, photo) se remplit ensuite dans le panneau Réserves. La
 * date du jour vient de l'interface (`ContexteOutil.aujourdhui`). Un pas d'historique « Réserve » par épingle.
 */
import { type Inference, etatOutil, geometrieVisible, inferer } from "../inference.js";
import { creerReserve } from "../reserves.js";
import { axesDeSaisie } from "./commun-formes.js";
import { vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { viser } from "./selection.js";

export const ID_RESERVE = "reserve";
export const CONSIGNE_RESERVE = "Cliquez l'objet ou le point où épingler la réserve ; la fiche se remplit dans le panneau Réserves.";
export const ERREUR_RESERVE_LECTURE = "Lecture seule : une réserve modifierait la Planche.";
export const ERREUR_RESERVE_DATE = "Date du jour indisponible : la réserve n'est pas posée.";

export interface EtatReserve {
  readonly inference: Inference | null;
  readonly survol: string | null;
  readonly erreur: string | null;
  /** Dernière réserve posée (l'interface l'ouvre dans le panneau). */
  readonly posee: string | null;
}

const viseDe = (ctx: ContexteOutil, r: Rayon, tolerance: number): { inference: Inference; objet: string | null } => {
  const inference = inferer({ rayon: r, tolerance, geometrie: geometrieVisible(ctx.modele, etatOutil(ctx)), ...axesDeSaisie(ctx) });
  const el = viser(ctx.modele, r, tolerance, undefined, ctx.etatTravaux);
  const objet = el?.chemin[0] ?? null;
  return { inference, objet: objet && ctx.modele.racine.occurrences[objet] ? objet : null };
};

export const machineReserve: MachineOutil<EtatReserve> = {
  id: ID_RESERVE,
  initial: () => ({ inference: null, survol: null, erreur: null, posee: null }),

  traiter(etat, ev, ctx): Transition<EtatReserve> {
    switch (ev.genre) {
      case "survol": {
        const v = viseDe(ctx, ev.rayon, ev.tolerance);
        return { etat: { ...etat, inference: v.inference, survol: v.objet } };
      }
      case "clic": {
        const v = viseDe(ctx, ev.rayon, ev.tolerance);
        if (ctx.lecture) return { etat: { ...etat, inference: v.inference, erreur: ERREUR_RESERVE_LECTURE } };
        if (!ctx.aujourdhui) return { etat: { ...etat, inference: v.inference, erreur: ERREUR_RESERVE_DATE } };
        const r = creerReserve(ctx.modele, { point: v.inference.point, objet: v.objet, aujourdhui: ctx.aujourdhui });
        if (!r.ok) return { etat: { ...etat, erreur: ERREUR_RESERVE_DATE } };
        return { etat: { ...etat, inference: v.inference, erreur: null, posee: r.id }, modele: r.modele, selection: v.objet ? [v.objet] : [], operation: "Réserve" };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Réserve." } };
      case "echap":
        return { etat: { ...etat, erreur: null } };
      default:
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    return vueModif({ consigne: CONSIGNE_RESERVE, mesures: { libelle: "Mesures", valeur: "", saisie: { attendu: "aucune", separateurDecimal: ctx.separateurDecimal } }, ctx, erreur: etat.erreur, inference: etat.inference, survol: etat.survol ? [etat.survol] : [] });
  },
};
