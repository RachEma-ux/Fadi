/**
 * Outil Suivez-moi (cahier-planche §4.20, relevé outils-modification §6) — machine pure.
 *
 * Le chemin est PRÉSÉLECTIONNÉ : une face (son périmètre) ou des arêtes continues. « Cliquez sur le profil à
 * extruder » : un clic sur une face — le profil — l'extrude sur tout le chemin, coins à onglet ; l'outil reste actif.
 * Sans présélection le relevé ne décrit que la sélection du chemin « au curseur » (instr, non relevée) : la machine
 * demande alors de présélectionner le chemin (choix Fadi). Le champ Mesures est inactif.
 */
import { type Id, contexte, suivezMoi } from "../geometrie-libre.js";
import { messageErreur } from "./commun-formes.js";
import { consigneDe, selectionValide, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_SUIVEZ_MOI = "suivez-moi";

export interface EtatSuivezMoi {
  readonly erreur: string | null;
}

/** Chemin déduit de la présélection : une face, sinon des arêtes. */
function cheminPresélectionné(ctx: ContexteOutil): { face: Id } | { aretes: readonly Id[] } | null {
  const c = contexte(ctx.modele, ctx.dans);
  const ids = selectionValide(ctx);
  const faces = ids.filter((id) => c.faces[id]);
  if (faces.length === 1) return { face: faces[0] as Id };
  const aretes = ids.filter((id) => c.aretes[id]);
  return aretes.length > 0 ? { aretes } : null;
}

export const machineSuivezMoi: MachineOutil<EtatSuivezMoi> = {
  id: ID_SUIVEZ_MOI,
  initial: () => ({ erreur: null }),

  traiter(etat, ev, ctx): Transition<EtatSuivezMoi> {
    switch (ev.genre) {
      case "clic": {
        const chemin = cheminPresélectionné(ctx);
        if (!chemin) return { etat: { erreur: "Présélectionnez d'abord le chemin : une face (son périmètre) ou des arêtes continues." } };
        const { el, cible } = viseeElement(ctx, ev);
        if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { erreur: "Cliquez sur la face qui sert de profil." } };
        if ("face" in chemin && chemin.face === cible.id) return { etat: { erreur: "Le profil doit être une autre face que le chemin." } };
        try {
          const r = suivezMoi(ctx.modele, cible.id, chemin, optionsDans(ctx));
          return { etat: { erreur: null }, modele: r.modele, selection: [], operation: "Suivez-moi" };
        } catch (err) {
          return { etat: { erreur: messageErreur(err) } };
        }
      }
      case "echap":
        return { etat: { erreur: null }, selection: [] };
      default:
        return { etat: ev.genre === "survol" ? { erreur: null } : etat };
    }
  },

  vue(etat, ctx): VueOutil {
    return vueModif({ consigne: consigneDe(ID_SUIVEZ_MOI, 0), mesures: null, ctx, erreur: etat.erreur });
  },
};
